import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_ROLES = new Set(['super_admin', 'admin', 'recruiter']);
const VALID_STATUSES = new Set(['active', 'pending', 'archived']);

const EDITABLE_FIELDS = ['name', 'role', 'status', 'title'] as const;
type EditableKey = (typeof EDITABLE_FIELDS)[number];

// PATCH /api/team/[id]
// Body: any subset of { name, role, status, title }
//
// Used for accepting an invite (status: 'pending' → 'active'), changing role,
// or updating profile info.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Partial<Record<EditableKey, unknown>> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) update[k] = body[k];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'No editable fields supplied' },
      { status: 400 }
    );
  }

  if ('role' in update && !VALID_ROLES.has(String(update.role))) {
    return NextResponse.json(
      { error: `Role must be one of: ${[...VALID_ROLES].join(', ')}` },
      { status: 400 }
    );
  }
  if ('status' in update) {
    const s = String(update.status);
    if (!VALID_STATUSES.has(s)) {
      return NextResponse.json(
        { error: `Status must be one of: ${[...VALID_STATUSES].join(', ')}` },
        { status: 400 }
      );
    }
    // Auto-set joined_at the first time someone goes active.
    if (s === 'active') {
      const { data: existing } = await supabase
        .from('team_members')
        .select('joined_at')
        .eq('id', id)
        .maybeSingle();
      if (existing && !existing.joined_at) {
        (update as Record<string, unknown>).joined_at = new Date().toISOString();
      }
    }
  }
  if ('name' in update) {
    const n = String(update.name ?? '').trim();
    if (!n) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    update.name = n;
  }

  // Don't let the last super_admin be demoted or archived — that would lock
  // the workspace out of team management entirely.
  if ('role' in update || 'status' in update) {
    const { data: target } = await supabase
      .from('team_members')
      .select('role, status')
      .eq('id', id)
      .maybeSingle();

    if (target?.role === 'super_admin' && target.status === 'active') {
      const demoting = 'role' in update && update.role !== 'super_admin';
      const removing = 'status' in update && update.status !== 'active';
      if (demoting || removing) {
        const { count } = await supabase
          .from('team_members')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'super_admin')
          .eq('status', 'active');
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            {
              error:
                'Cannot demote or archive the last active super admin. Promote another member first.',
            },
            { status: 400 }
          );
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('team_members')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ member: data });
}

// DELETE /api/team/[id]
// Soft-deletes by setting status='archived' (preserves audit trail).
// Pass ?hard=1 to actually drop the row (not exposed in the UI).
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === '1';

  // Same last-super-admin guard as PATCH.
  const { data: target } = await supabase
    .from('team_members')
    .select('role, status')
    .eq('id', id)
    .maybeSingle();

  if (target?.role === 'super_admin' && target.status === 'active') {
    const { count } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .eq('status', 'active');
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            'Cannot remove the last active super admin. Promote another member first.',
        },
        { status: 400 }
      );
    }
  }

  if (hard) {
    const { error } = await supabase.from('team_members').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, hard: true });
  }

  const { data, error } = await supabase
    .from('team_members')
    .update({ status: 'archived' })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, member: data });
}
