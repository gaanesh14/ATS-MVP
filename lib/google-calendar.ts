// Server-only Google Calendar API client.
//
// We use direct fetch against the v3 REST API rather than the `googleapis`
// npm package — the surface we need is small (create/update/delete one
// event type with a Meet conference attached) and the package is heavy.
//
// Auth: every call needs a fresh access_token. `getValidAccessToken()` reads
// the encrypted token row, refreshes if expired, persists the new access
// token back, and returns null when the refresh_token itself is no longer
// valid (user revoked PhotonX in their Google account, etc.). Callers MUST
// handle the null case by surfacing a "reconnect Google" warning to the
// recruiter rather than silently failing.

import 'server-only';
import { randomUUID } from 'crypto';
import { decrypt, encrypt } from '@/lib/crypto';
import { refreshAccessToken } from '@/lib/google-oauth';
import type { SupabaseClient } from '@supabase/supabase-js';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// Refresh a couple of minutes early so we don't hit the API with a token
// that's about to expire mid-request.
const REFRESH_BUFFER_MS = 60_000;

export type CalendarAttendee = { email: string; displayName?: string };

export type CreateEventInput = {
  scheduledAt: string; // ISO
  durationMinutes: number;
  timezone: string;
  summary: string;
  description: string;
  attendees: CalendarAttendee[];
};

export type CreateEventResult = {
  eventId: string;
  meetLink: string;
  htmlLink: string;
};

// ──────────────────────────────────────────────────────────────────────────
// Access-token lifecycle
// ──────────────────────────────────────────────────────────────────────────

// Get an access_token for `teamMemberId`, refreshing it from the stored
// refresh_token if the cached one is expired. Returns null when:
//   • The team_member has never connected Google (no row).
//   • The refresh_token is invalid/revoked — caller should prompt reconnect.
// Throws only on unexpected DB errors.
export async function getValidAccessToken(
  admin: SupabaseClient,
  teamMemberId: string
): Promise<string | null> {
  const { data: row, error } = await admin
    .from('recruiter_google_tokens')
    .select(
      'encrypted_refresh_token, encrypted_access_token, access_token_expires_at'
    )
    .eq('team_member_id', teamMemberId)
    .maybeSingle();
  if (error) throw new Error(`recruiter_google_tokens read failed: ${error.message}`);
  if (!row) return null;

  // Cache hit: access token still good.
  if (row.encrypted_access_token && row.access_token_expires_at) {
    const expiresAt = new Date(row.access_token_expires_at).getTime();
    if (expiresAt - Date.now() > REFRESH_BUFFER_MS) {
      try {
        return decrypt(row.encrypted_access_token);
      } catch {
        // Encryption key rotated or row corrupted. Fall through to refresh.
      }
    }
  }

  // Need a fresh access token. Decrypt the refresh_token and exchange it.
  let refreshToken: string;
  try {
    refreshToken = decrypt(row.encrypted_refresh_token);
  } catch (err) {
    console.error(
      `[google-calendar] refresh_token decrypt failed for ${teamMemberId}:`,
      err
    );
    return null;
  }

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed) {
    // Refresh token rejected — user revoked or token expired. Mark the row
    // so the UI can prompt reconnect. We don't delete because the
    // disconnect endpoint should do that explicitly.
    console.warn(
      `[google-calendar] refresh rejected for team_member ${teamMemberId} — needs reconnect`
    );
    return null;
  }

  const newExpiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000
  ).toISOString();
  const { error: updErr } = await admin
    .from('recruiter_google_tokens')
    .update({
      encrypted_access_token: encrypt(refreshed.access_token),
      access_token_expires_at: newExpiresAt,
    })
    .eq('team_member_id', teamMemberId);
  if (updErr) {
    console.warn(
      `[google-calendar] failed to cache new access_token: ${updErr.message}`
    );
    // Non-fatal — we still have the token in memory.
  }
  return refreshed.access_token;
}

// ──────────────────────────────────────────────────────────────────────────
// Event CRUD
//
// We deliberately set `sendUpdates=none` on every write: PhotonX sends its
// own branded calendar invite via Brevo (see lib/email/interview-invite.ts).
// Having Google ALSO email attendees would land two near-identical messages
// in the candidate's inbox. The event still appears in the recruiter's
// Google Calendar — that's the main reason to use the Calendar API at all.
// ──────────────────────────────────────────────────────────────────────────

function buildEventBody(input: CreateEventInput): Record<string, unknown> {
  const start = new Date(input.scheduledAt);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  return {
    summary: input.summary,
    description: input.description,
    start: { dateTime: start.toISOString(), timeZone: input.timezone },
    end: { dateTime: end.toISOString(), timeZone: input.timezone },
    attendees: input.attendees.map((a) => ({
      email: a.email,
      ...(a.displayName ? { displayName: a.displayName } : {}),
    })),
    // Tag PhotonX-owned events so a recruiter scanning their calendar can
    // identify them — and so future migrations could find them.
    source: { title: 'PhotonX ATS', url: 'https://photonx.com' },
  };
}

export async function createCalendarEvent(
  accessToken: string,
  input: CreateEventInput
): Promise<CreateEventResult> {
  // `conferenceDataVersion=1` is REQUIRED to get a Meet link generated.
  const url = `${CALENDAR_BASE}?conferenceDataVersion=1&sendUpdates=none`;
  const body = {
    ...buildEventBody(input),
    conferenceData: {
      createRequest: {
        // Must be unique per request — Google uses this to dedupe.
        requestId: randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new GoogleCalendarError(res.status, await res.text());
  }
  const json = (await res.json()) as {
    id: string;
    hangoutLink?: string;
    htmlLink: string;
    conferenceData?: {
      entryPoints?: Array<{ entryPointType: string; uri: string }>;
    };
  };
  // Prefer the dedicated hangoutLink field; fall back to the video
  // entry-point in conferenceData if Google omits it.
  const meetLink =
    json.hangoutLink ??
    json.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')
      ?.uri;
  if (!meetLink) {
    throw new GoogleCalendarError(
      500,
      'Calendar event created but no Meet link returned'
    );
  }
  return { eventId: json.id, meetLink, htmlLink: json.htmlLink };
}

export async function updateCalendarEvent(opts: {
  accessToken: string;
  eventId: string;
  input: CreateEventInput;
}): Promise<void> {
  const url = `${CALENDAR_BASE}/${encodeURIComponent(opts.eventId)}?conferenceDataVersion=1&sendUpdates=none`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      'content-type': 'application/json',
    },
    // PATCH (not PUT) so we don't strip conferenceData by omitting it.
    body: JSON.stringify(buildEventBody(opts.input)),
  });
  if (!res.ok) {
    throw new GoogleCalendarError(res.status, await res.text());
  }
}

export async function deleteCalendarEvent(opts: {
  accessToken: string;
  eventId: string;
}): Promise<void> {
  const url = `${CALENDAR_BASE}/${encodeURIComponent(opts.eventId)}?sendUpdates=none`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${opts.accessToken}` },
  });
  // 410 Gone = already deleted manually by the recruiter; treat as success.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new GoogleCalendarError(res.status, await res.text());
  }
}

// Custom error so callers can branch on common failures (401 = reconnect,
// 404 = event already deleted, 403 = quota / permission).
export class GoogleCalendarError extends Error {
  constructor(public status: number, body: string) {
    super(`Google Calendar API ${status}: ${truncate(body, 300)}`);
    this.name = 'GoogleCalendarError';
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
