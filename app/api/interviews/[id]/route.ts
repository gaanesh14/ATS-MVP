import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  validateSchedule,
  findConflicts,
  generateJitsiLink,
} from '@/lib/interviews';
import { sendInterviewInvite } from '@/lib/email/interview-invite';
import type {
  Interview,
  InterviewMeetingProvider,
  InterviewStatus,
  InterviewParticipant,
} from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set<InterviewStatus>([
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
]);
const VALID_PROVIDERS = new Set<InterviewMeetingProvider>([
  'jitsi',
  'google_meet',
  'manual',
  'none',
]);

// PATCH /api/interviews/[id]
// Reschedule, change status, edit participants, or rotate the meeting link.
//
// Body shape — any subset of:
//   scheduled_at, duration_minutes, timezone,
//   status, meeting_provider, meeting_link,
//   participants, notes, force_conflict
//
// When scheduled_at or duration_minutes change, we re-run conflict detection
// against the candidate's other scheduled interviews. When status flips to
// 'cancelled', we send a cancellation email.
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

  const { data: existing, error: exErr } = await supabase
    .from('interviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (exErr || !existing) {
    return NextResponse.json(
      { error: exErr?.message ?? 'Interview not found' },
      { status: 404 }
    );
  }
  const current = existing as Interview;

  const update: Partial<Interview> & Record<string, unknown> = {};

  if ('status' in body) {
    const s = String(body.status) as InterviewStatus;
    if (!VALID_STATUSES.has(s)) {
      return NextResponse.json(
        { error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` },
        { status: 400 }
      );
    }
    update.status = s;
  }

  if ('scheduled_at' in body) update.scheduled_at = String(body.scheduled_at);
  if ('duration_minutes' in body) update.duration_minutes = Number(body.duration_minutes);
  if ('timezone' in body) update.timezone = String(body.timezone);
  if ('notes' in body) update.notes = body.notes ? String(body.notes).trim() : null;
  if ('participants' in body && Array.isArray(body.participants)) {
    update.participants = (body.participants as InterviewParticipant[]).filter(
      (p) => p && typeof p.email === 'string' && p.email.trim()
    );
  }

  if ('meeting_provider' in body) {
    const p = String(body.meeting_provider) as InterviewMeetingProvider;
    if (!VALID_PROVIDERS.has(p)) {
      return NextResponse.json(
        { error: `meeting_provider must be one of: ${[...VALID_PROVIDERS].join(', ')}` },
        { status: 400 }
      );
    }
    update.meeting_provider = p;
    if (p === 'jitsi' && !current.meeting_link) {
      update.meeting_link = generateJitsiLink({
        jobTitle: 'interview',
        candidateName: current.candidate_name,
      });
    }
    if (p === 'none') update.meeting_link = null;
  }
  if ('meeting_link' in body) {
    update.meeting_link = body.meeting_link
      ? String(body.meeting_link).trim()
      : null;
  }

  // Re-validate the merged slot if anything timing-related changed.
  if ('scheduled_at' in update || 'duration_minutes' in update) {
    const merged = {
      scheduled_at: String(update.scheduled_at ?? current.scheduled_at),
      duration_minutes: Number(update.duration_minutes ?? current.duration_minutes),
      meeting_provider:
        (update.meeting_provider as InterviewMeetingProvider) ?? current.meeting_provider,
      meeting_link:
        (update.meeting_link as string | null | undefined) ?? current.meeting_link,
    };
    const errors = validateSchedule(merged);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.map((e) => `${e.field}: ${e.message}`).join('; '), errors },
        { status: 400 }
      );
    }

    const { data: others } = await supabase
      .from('interviews')
      .select('*')
      .eq('application_id', current.application_id)
      .eq('status', 'scheduled');
    const conflicts = findConflicts(
      merged,
      (others as Interview[]) ?? [],
      { ignoreId: id }
    );
    if (conflicts.length > 0 && body.force_conflict !== true) {
      return NextResponse.json(
        {
          error: 'This candidate already has an interview overlapping that time.',
          conflicts,
        },
        { status: 409 }
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: 'No editable fields supplied' },
      { status: 400 }
    );
  }

  // If the slot moved, the previously-sent reminders are stale — wipe them
  // so the cron picks the row up again for the new time.
  if ('scheduled_at' in update || 'duration_minutes' in update) {
    update.reminder_sent_at = null;
    update.reminder_24h_sent_at = null;
    update.reminder_1h_sent_at = null;
  }

  const { data: row, error: updErr } = await supabase
    .from('interviews')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const updated = row as Interview;
  const wasCancelled =
    update.status === 'cancelled' && current.status !== 'cancelled';
  const timingChanged =
    'scheduled_at' in update || 'duration_minutes' in update;

  let emailWarning: string | null = null;
  try {
    if (wasCancelled) {
      const r = await sendInterviewInvite({
        interview: updated,
        jobTitle: '',
        action: 'cancelled',
      });
      if (!r.ok) emailWarning = r.error;
    } else if (timingChanged) {
      const r = await sendInterviewInvite({
        interview: updated,
        jobTitle: '',
        action: 'rescheduled',
      });
      if (!r.ok) emailWarning = r.error;
    }
  } catch (err) {
    emailWarning = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ interview: row, emailSent: !emailWarning, emailWarning });
}

// DELETE /api/interviews/[id]
// Cancels by default (status='cancelled'). Pass ?hard=1 to actually delete
// the row — used for cleanup; not exposed in the UI.
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const url = new URL(req.url);
  const hard = url.searchParams.get('hard') === '1';

  if (hard) {
    const { error } = await supabase.from('interviews').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, hard: true });
  }

  const { data: existing } = await supabase
    .from('interviews')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from('interviews')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let emailWarning: string | null = null;
  try {
    const r = await sendInterviewInvite({
      interview: row as Interview,
      jobTitle: '',
      action: 'cancelled',
    });
    if (!r.ok) emailWarning = r.error;
  } catch (err) {
    emailWarning = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ok: true, interview: row, emailSent: !emailWarning, emailWarning });
}
