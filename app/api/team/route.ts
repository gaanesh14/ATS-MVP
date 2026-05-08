import { NextResponse } from 'next/server';
import { sendTeamInvite } from '@/lib/supabase-admin';
import { requireRoleFromRequest, AuthError } from '@/lib/auth-server';

export const runtime = 'nodejs';

const VALID_ROLES = new Set(['super_admin', 'admin', 'recruiter']);

// GET /api/team
// Returns every team member in the caller's org, ordered with active first
// then pending then archived, then alphabetically by name.
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireRoleFromRequest(req, 'team.view');
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, orgId } = auth;

  const baseQuery = admin
    .from('team_members')
    .select('*')
    .order('status', { ascending: true })
    .order('name', { ascending: true });
  const scopedQuery = orgId ? baseQuery.eq('org_id', orgId) : baseQuery;
  const { data, error } = await scopedQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ members: data ?? [] });
}

// POST /api/team
// Body: { email, name?, role, title? }
// Creates a pending invite, then sends an invite email via Supabase Auth
// (which delivers through the SMTP relay configured in the project — Brevo,
// in our case). Email failures are non-fatal: the team_members row is
// already saved and a recruiter can resend later.
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireRoleFromRequest(req, 'team.invite');
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, orgId } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const name = String(body.name ?? '').trim() || email.split('@')[0] || 'Member';
  const title = body.title ? String(body.title).trim() : null;

  if (!email || !/^[\w.-]+@[\w.-]+\.\w+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json(
      { error: `Role must be one of: ${[...VALID_ROLES].join(', ')}` },
      { status: 400 }
    );
  }

  // Look up existing row scoped to the caller's org. Same email can exist in
  // a different tenant — we only collide within the org.
  const baseExisting = admin
    .from('team_members')
    .select('id, status')
    .eq('email', email);
  const scopedExisting = orgId ? baseExisting.eq('org_id', orgId) : baseExisting;
  const { data: existing } = await scopedExisting.maybeSingle();

  let memberRow: Record<string, unknown>;

  if (existing) {
    if (existing.status === 'archived') {
      // Reactivate an archived row instead of erroring out.
      const { data, error } = await admin
        .from('team_members')
        .update({
          name,
          role,
          status: 'pending',
          title,
          invited_at: new Date().toISOString(),
          joined_at: null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      memberRow = data;
    } else {
      return NextResponse.json(
        { error: 'A team member with that email already exists' },
        { status: 409 }
      );
    }
  } else {
    const insertRow: Record<string, unknown> = {
      email,
      name,
      role,
      title,
      status: 'pending',
      invited_at: new Date().toISOString(),
    };
    // Stamp org_id on the new row when running post-migration. Pre-migration
    // the column doesn't exist; including it would raise. The trigger on
    // applications doesn't apply here — team_members has no parent to derive
    // from, so we set it explicitly from the caller's org.
    if (orgId) insertRow.org_id = orgId;

    const { data, error } = await admin
      .from('team_members')
      .insert(insertRow)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    memberRow = data;
  }

  // Send the invite email. We do this AFTER the DB write so a failed send
  // doesn't lose the row.
  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const send = await sendTeamInvite({ email, name, origin });

  if (!send.ok) {
    console.warn(`[team] invite email failed for ${email}: ${send.error}`);
  }

  return NextResponse.json({
    member: memberRow,
    emailSent: send.ok,
    // Surface a hint to the client when the email layer wasn't configured —
    // helpful for the first-time setup error like "service-role key missing"
    // or "SMTP not configured in Supabase".
    emailWarning: send.ok ? null : send.error,
  });
}
