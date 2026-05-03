import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_ROLES = new Set(['super_admin', 'admin', 'recruiter']);

// GET /api/team
// Returns every team member, ordered with active first then pending then
// archived, then alphabetically by name.
export async function GET() {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .order('status', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ members: data ?? [] });
}

// POST /api/team
// Body: { email, name?, role, title? }
// Creates a pending invite. Email must be unique. Once Supabase Auth is
// enabled, send the invite via supabase.auth.admin.inviteUserByEmail in
// addition to writing the row.
export async function POST(req: Request) {
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

  const { data: existing } = await supabase
    .from('team_members')
    .select('id, status')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'archived') {
      // Reactivate an archived row instead of erroring out.
      const { data, error } = await supabase
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
      return NextResponse.json({ member: data });
    }
    return NextResponse.json(
      { error: 'A team member with that email already exists' },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('team_members')
    .insert({
      email,
      name,
      role,
      title,
      status: 'pending',
      invited_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ member: data });
}

