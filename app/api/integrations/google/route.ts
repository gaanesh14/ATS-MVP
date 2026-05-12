import { NextResponse } from 'next/server';
import { requireRoleFromRequest, AuthError } from '@/lib/auth-server';
import { decrypt } from '@/lib/crypto';
import { revokeToken } from '@/lib/google-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/integrations/google
// Returns whether the signed-in user has connected their Google account
// and, if so, which Google email is linked.
//
// Response: { connected: boolean, email: string | null, connected_at: string | null }
//
// The encrypted token columns are intentionally NOT returned — the client
// has no use for them and they'd be useless without the server-side
// encryption key anyway.
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireRoleFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, member } = auth;

  const { data } = await admin
    .from('recruiter_google_tokens')
    .select('google_email, connected_at')
    .eq('team_member_id', member.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ connected: false, email: null, connected_at: null });
  }
  return NextResponse.json({
    connected: true,
    email: data.google_email,
    connected_at: data.connected_at,
  });
}

// DELETE /api/integrations/google
// Disconnects the signed-in user's Google account: revokes the refresh
// token with Google, then deletes the local row.
//
// Best-effort on revoke — if Google returns 400 ("token already invalid")
// we still delete the local row, because the user's intent is clear and
// keeping a stale row around would just confuse the next connect flow.
export async function DELETE(req: Request) {
  let auth;
  try {
    auth = await requireRoleFromRequest(req);
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, member } = auth;

  const { data: row } = await admin
    .from('recruiter_google_tokens')
    .select('encrypted_refresh_token')
    .eq('team_member_id', member.id)
    .maybeSingle();

  if (!row) {
    // Nothing to disconnect — return success so the UI stays simple.
    return NextResponse.json({ ok: true });
  }

  // Try to revoke at Google before we lose the local record. Swallow
  // failures — see the docstring above.
  try {
    const refreshToken = decrypt(row.encrypted_refresh_token);
    await revokeToken(refreshToken);
  } catch (err) {
    console.warn('[google-oauth] revoke failed (continuing to delete):', err);
  }

  const { error: delErr } = await admin
    .from('recruiter_google_tokens')
    .delete()
    .eq('team_member_id', member.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
