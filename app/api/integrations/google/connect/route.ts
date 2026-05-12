import { NextResponse } from 'next/server';
import { requireRoleFromRequest, AuthError } from '@/lib/auth-server';
import { buildAuthorizeUrl, signState } from '@/lib/google-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/integrations/google/connect
//
// Returns the Google OAuth authorize URL for the caller to navigate to.
// The client should do:
//
//   const res = await authedFetch('/api/integrations/google/connect',
//                                 { method: 'POST' });
//   const { url } = await res.json();
//   window.location.href = url;
//
// Why POST + JSON instead of a top-level redirect: Supabase stores its
// session in localStorage, so a plain `<a href>` link to a server route
// can't be authenticated. The client uses authedFetch to attach the Bearer
// token, then performs the actual cross-site navigation in JS.
//
// The returned URL embeds a signed state token containing the caller's
// team_member_id (see lib/google-oauth.ts:signState). The /callback route
// extracts identity from that state — no auth header needed on the return
// trip, which is necessary because Google's redirect strips them anyway.
//
// We ALSO set the state in an HttpOnly cookie so /callback can verify the
// returned `state` query param matches the one this browser was issued.
// Defense in depth against an attacker tricking a signed-in user into
// hitting /callback with a stolen-but-valid state.
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireRoleFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { member } = auth;

  const origin = new URL(req.url).origin;
  const state = signState({ team_member_id: member.id });
  const url = buildAuthorizeUrl({ origin, state });

  const res = NextResponse.json({ url });
  res.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax lets the cookie survive the redirect back from accounts.google.com.
    // Strict would drop it on return and break verification.
    sameSite: 'lax',
    // Scope tight to the integration routes — no other endpoint needs it.
    path: '/api/integrations/google',
    maxAge: 600,
  });
  return res;
}
