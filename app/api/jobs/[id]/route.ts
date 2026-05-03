import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';

// Whitelist of fields that can be patched. Anything else in the body is ignored.
const EDITABLE_FIELDS = [
  'title',
  'description',
  'location',
  'min_experience',
  'max_experience',
  'min_salary',
  'max_salary',
  'vacancies',
  'status',
  'extra_stages',
] as const;

type EditableKey = (typeof EDITABLE_FIELDS)[number];

const ALLOWED_STAGE_COLORS = new Set([
  'sky',
  'amber',
  'violet',
  'emerald',
  'rose',
  'cyan',
  'teal',
  'orange',
  'indigo',
  'fuchsia',
  'slate',
]);

const BUILTIN_STAGE_IDS = new Set([
  'new',
  'shortlisted',
  'interview',
  'hired',
  'rejected',
]);

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
  for (const key of EDITABLE_FIELDS) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'No editable fields supplied' },
      { status: 400 }
    );
  }

  // Light validation
  if ('title' in update) {
    const t = String(update.title ?? '').trim();
    if (!t) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    update.title = t;
  }
  if ('vacancies' in update) {
    const v = Number(update.vacancies);
    if (!Number.isFinite(v) || v < 1) {
      return NextResponse.json({ error: 'Vacancies must be ≥ 1' }, { status: 400 });
    }
    update.vacancies = Math.floor(v);
  }
  if ('status' in update) {
    const s = String(update.status ?? '');
    if (s !== 'open' && s !== 'closed') {
      return NextResponse.json(
        { error: "Status must be 'open' or 'closed'" },
        { status: 400 }
      );
    }
  }
  if ('extra_stages' in update) {
    const arr = update.extra_stages;
    if (!Array.isArray(arr)) {
      return NextResponse.json(
        { error: 'extra_stages must be an array' },
        { status: 400 }
      );
    }
    if (arr.length > 10) {
      return NextResponse.json(
        { error: 'At most 10 custom stages per job' },
        { status: 400 }
      );
    }
    const seenIds = new Set<string>();
    const cleaned: { id: string; label: string; color: string }[] = [];
    for (const raw of arr) {
      if (!raw || typeof raw !== 'object') {
        return NextResponse.json(
          { error: 'Each stage must be an object with id/label/color' },
          { status: 400 }
        );
      }
      const r = raw as Record<string, unknown>;
      const id = String(r.id ?? '').trim();
      const label = String(r.label ?? '').trim();
      const color = String(r.color ?? '');
      if (!id || !/^[a-z0-9-]{1,40}$/.test(id)) {
        return NextResponse.json(
          { error: `Invalid stage id: "${id}"` },
          { status: 400 }
        );
      }
      if (BUILTIN_STAGE_IDS.has(id)) {
        return NextResponse.json(
          { error: `"${id}" conflicts with a built-in stage` },
          { status: 400 }
        );
      }
      if (seenIds.has(id)) {
        return NextResponse.json(
          { error: `Duplicate stage id: "${id}"` },
          { status: 400 }
        );
      }
      if (!label || label.length > 40) {
        return NextResponse.json(
          { error: 'Stage label must be 1–40 characters' },
          { status: 400 }
        );
      }
      if (!ALLOWED_STAGE_COLORS.has(color)) {
        return NextResponse.json(
          { error: `Unknown stage color: "${color}"` },
          { status: 400 }
        );
      }
      seenIds.add(id);
      cleaned.push({ id, label, color });
    }
    update.extra_stages = cleaned;
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // ON DELETE CASCADE on the FK takes care of applications + answers.
  const { error } = await supabase.from('jobs').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
