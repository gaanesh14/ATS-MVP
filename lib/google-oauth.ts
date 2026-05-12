// Server-only Google OAuth 2.0 helpers.
//
// We implement the auth-code flow by hand (no `googleapis` dep — too heavy
// for the small surface we need). The token endpoints are stable and
// well-documented:
//   - Authorize:    https://accounts.google.com/o/oauth2/v2/auth
//   - Token:        https://oauth2.googleapis.com/token
//   - Userinfo:     https://www.googleapis.com/oauth2/v3/userinfo
//   - Revoke:       https://oauth2.googleapis.com/revoke
//
// Flow:
//   1. /api/integrations/google/connect builds the authorize URL with
//      access_type=offline + prompt=consent so Google always returns a
//      refresh_token (Google omits it on subsequent consents otherwise).
//   2. User consents → Google redirects to /api/integrations/google/callback
//      with `?code=...&state=...`.
//   3. Callback verifies state cookie, exchanges code for tokens, fetches
//      the Google email via userinfo, and persists everything encrypted.
//   4. Calendar API calls go through `getValidAccessToken()` which refreshes
//      automatically when the cached access_token is expired.

import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// State token has a 10-minute lifetime. The consent screen rarely takes
// that long; anything older almost certainly means the user abandoned the
// flow and the redirect is stale.
const STATE_TTL_MS = 10 * 60 * 1000;

// `openid` + `email` give us the user's Google address via userinfo. They
// fall under Google's "non-sensitive" scope group and don't have to be
// explicitly listed in the OAuth consent screen. `calendar.events` lets us
// create/update/delete events PhotonX owns — nothing else on the calendar.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. See docs/schema-migration-google-integration.sql ` +
        'and the Stage 0 setup in the Google Meet integration plan.'
    );
  }
  return v;
}

// ──────────────────────────────────────────────────────────────────────────
// Signed state
//
// Why this exists: the Supabase JS client stores its session in localStorage,
// so /callback (a top-level redirect from Google) can't read a Bearer token.
// We work around this by encoding the connecting user's team_member_id into
// the OAuth `state` parameter, signed so it can't be forged.
//
// Format: "<team_member_id>.<expires_at_ms>.<hmac_hex>"
//   • HMAC-SHA256 of the first two segments
//   • Key derived from GOOGLE_TOKEN_ENCRYPTION_KEY so we don't need a second
//     secret in the environment. The label "google-oauth-state" namespaces
//     the derived key so it's distinct from the AES key used in lib/crypto.ts.
//
// /callback ALSO compares the state against an HttpOnly cookie set in
// /connect — so even a forged-but-correctly-signed state would need the
// originating browser's cookie to succeed. Defense in depth.
// ──────────────────────────────────────────────────────────────────────────

function getStateKey(): Buffer {
  const keyHex = requireEnv('GOOGLE_TOKEN_ENCRYPTION_KEY');
  return createHash('sha256')
    .update(`${keyHex}|google-oauth-state`)
    .digest();
}

export function signState(payload: { team_member_id: string }): string {
  const expiresAt = Date.now() + STATE_TTL_MS;
  const body = `${payload.team_member_id}.${expiresAt}`;
  const mac = createHmac('sha256', getStateKey()).update(body).digest('hex');
  return `${body}.${mac}`;
}

export function verifyState(
  token: string
): { team_member_id: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [teamMemberId, expiresAtStr, mac] = parts;
  if (!teamMemberId || !expiresAtStr || !mac) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const expected = createHmac('sha256', getStateKey())
    .update(`${teamMemberId}.${expiresAtStr}`)
    .digest('hex');

  // timingSafeEqual demands equal lengths and Buffers.
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { team_member_id: teamMemberId };
}

// Single source of truth for the callback URL. Google requires an EXACT
// match against the redirect URIs registered in the OAuth client, so any
// drift here is fatal.
export function buildRedirectUri(origin: string): string {
  // Prefer the explicitly configured site URL so local-dev and prod don't
  // accidentally pick up the wrong host (e.g. when running behind a tunnel).
  const base = (process.env.NEXT_PUBLIC_SITE_URL || origin).replace(/\/$/, '');
  return `${base}/api/integrations/google/callback`;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string; // omitted on subsequent consents w/o prompt=consent
  scope: string;
  token_type: 'Bearer';
  id_token?: string;
};

// Build the URL that kicks off the consent screen. The `state` is opaque
// to Google and round-trips back to /callback for CSRF protection.
export function buildAuthorizeUrl(opts: {
  origin: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
    redirect_uri: buildRedirectUri(opts.origin),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    state: opts.state,
    // Required for refresh_token to be returned at all.
    access_type: 'offline',
    // Forces the consent screen every time. Google only returns a fresh
    // refresh_token on first consent unless you re-prompt — and we WANT
    // a refresh_token every time someone re-connects, in case the prior
    // one was revoked.
    prompt: 'consent',
    // Include the granted scopes back in the token response.
    include_granted_scopes: 'true',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// Exchange the authorization code for tokens. Throws on any non-2xx.
export async function exchangeCodeForTokens(opts: {
  code: string;
  origin: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    redirect_uri: buildRedirectUri(opts.origin),
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

// Use a refresh_token to get a new access_token. Returns null instead of
// throwing on 400/401 so the caller can surface "reconnect needed" without
// a try/catch — those status codes mean the refresh_token itself is
// invalid (user revoked, key rotated, etc.).
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (res.status === 400 || res.status === 401) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return json;
}

// Fetch the connected Google account's email + sub. We use this once at
// connect time to remember which Google account a recruiter linked.
export async function fetchUserInfo(
  accessToken: string
): Promise<{ email: string; sub: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google userinfo failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { email: string; sub: string };
  return json;
}

// Revoke a refresh or access token. Best-effort — we delete the local row
// regardless of whether revoke succeeds, since the user explicitly asked to
// disconnect and a 400 here usually means "token already invalid" anyway.
export async function revokeToken(token: string): Promise<void> {
  await fetch(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
}
