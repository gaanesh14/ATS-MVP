import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  verifyState,
} from '@/lib/google-oauth';
import { encrypt } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/integrations/google/callback
//
// Google redirects here after the user consents (or cancels) at
//   https://accounts.google.com/o/oauth2/v2/auth.
//
// Possible inputs:
//   • ?code=...&state=... → success, exchange the code for tokens.
//   • ?error=access_denied → user clicked "Cancel" on the consent screen.
//
// Why this route doesn't use requireRoleFromRequest: a top-level redirect
// from Google strips the Authorization header. We identify the user from
// the signed `state` token instead — see lib/google-oauth.ts:signState for
// the rationale and format. The HttpOnly cookie set by /connect is an
// additional defense-in-depth check (a forged-but-correctly-signed state
// would still need to match this browser's cookie).
//
// All exit paths redirect back to /dashboard/settings?integration=google&...
// with either `status=connected` or `status=error&reason=…` so the settings
// page can show a flash.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const settingsUrl = (extra: Record<string, string>) => {
    const base = `${url.origin}/dashboard/settings`;
    const params = new URLSearchParams({ integration: 'google', ...extra });
    return `${base}?${params.toString()}`;
  };

  const cookieStore = cookies();
  // Always clear the state cookie on the way out — it's single-use either
  // way. We do this on the response below.
  const stateCookie = cookieStore.get('google_oauth_state')?.value ?? null;

  function fail(reason: string): NextResponse {
    const res = NextResponse.redirect(
      settingsUrl({ status: 'error', reason }),
      { status: 302 }
    );
    res.cookies.delete('google_oauth_state');
    return res;
  }

  // 1. User cancelled on the consent screen.
  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    return fail(errorParam === 'access_denied' ? 'cancelled' : errorParam);
  }

  // 2. Required params.
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  if (!code || !stateParam) return fail('missing_params');
  if (!stateCookie) return fail('missing_state_cookie');
  if (stateParam !== stateCookie) return fail('state_mismatch');

  // 3. State signature + expiry.
  const decoded = verifyState(stateParam);
  if (!decoded) return fail('invalid_or_expired_state');
  const { team_member_id } = decoded;

  // 4. Confirm the team_member still exists and is active. Catches the
  //    edge case where someone connects, gets archived mid-flow, and
  //    finishes the callback — we don't want to persist a token for an
  //    archived row.
  const admin = getSupabaseAdmin();
  const { data: member } = await admin
    .from('team_members')
    .select('id, org_id, status')
    .eq('id', team_member_id)
    .maybeSingle();
  if (!member) return fail('member_not_found');
  if (member.status !== 'active') return fail('member_inactive');
  if (!member.org_id) return fail('member_missing_org');

  // 5. Exchange the auth code for tokens.
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, origin: url.origin });
  } catch (err) {
    console.error('[google-oauth] token exchange failed:', err);
    return fail('token_exchange_failed');
  }
  if (!tokens.refresh_token) {
    // We pass prompt=consent in /connect specifically to force this, so a
    // missing refresh_token here usually means the OAuth client config is
    // wrong (e.g. wrong client type, redirect_uri mismatch, scopes the
    // user can't grant). Surface a clear error rather than silently
    // saving a half-broken record.
    return fail('no_refresh_token');
  }

  // 6. Fetch the user's Google email so we can show it on the settings
  //    page ("Connected as alice@gmail.com"). The userinfo call also
  //    incidentally validates the access_token works.
  let userInfo;
  try {
    userInfo = await fetchUserInfo(tokens.access_token);
  } catch (err) {
    console.error('[google-oauth] userinfo failed:', err);
    return fail('userinfo_failed');
  }

  // 7. Encrypt and upsert. Re-connecting replaces the prior row entirely
  //    so a stale refresh_token can't linger.
  const accessExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();
  const upsert = {
    team_member_id: member.id,
    org_id: member.org_id,
    encrypted_refresh_token: encrypt(tokens.refresh_token),
    encrypted_access_token: encrypt(tokens.access_token),
    access_token_expires_at: accessExpiresAt,
    google_email: userInfo.email,
    scopes: tokens.scope ? tokens.scope.split(' ') : [],
  };

  const { error: upsertErr } = await admin
    .from('recruiter_google_tokens')
    .upsert(upsert, { onConflict: 'team_member_id' });
  if (upsertErr) {
    console.error('[google-oauth] upsert failed:', upsertErr.message);
    return fail('store_failed');
  }

  console.log(
    `[google-oauth] connected team_member ${member.id} as ${userInfo.email}`
  );

  const res = NextResponse.redirect(
    settingsUrl({ status: 'connected', email: userInfo.email }),
    { status: 302 }
  );
  res.cookies.delete('google_oauth_state');
  return res;
}
