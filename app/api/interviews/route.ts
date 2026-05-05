import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  validateSchedule,
  generateJitsiLink,
  findConflicts,
  INTERVIEW_DURATIONS,
} from '@/lib/interviews';
import { sendInterviewInvite } from '@/lib/email/interview-invite';
import type {
  Interview,
  InterviewMeetingProvider,
  InterviewParticipant,
} from '@/lib/supabase';

export const runtime = 'nodejs';

const VALID_PROVIDERS = new Set<InterviewMeetingProvider>([
  'jitsi',
  'google_meet',
  'manual',
  'none',
]);

// GET /api/interviews
//   ?application_id=<uuid>   only interviews for that candidate
//   ?job_id=<uuid>           only interviews for a job
//   ?status=scheduled        filter by status
//   ?from=<iso>&to=<iso>     window filter on scheduled_at
//   ?upcoming=1              shorthand for status=scheduled & from=now
//
// Default order: upcoming first (asc by scheduled_at), past last.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const applicationId = url.searchParams.get('application_id');
  const jobId = url.searchParams.get('job_id');
  const status = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const upcoming = url.searchParams.get('upcoming') === '1';

  let q = supabase.from('interviews').select('*').order('scheduled_at', { ascending: true });
  if (applicationId) q = q.eq('application_id', applicationId);
  if (jobId) q = q.eq('job_id', jobId);
  if (status) q = q.eq('status', status);
  if (upcoming) {
    q = q.eq('status', 'scheduled').gte('scheduled_at', new Date().toISOString());
  } else {
    if (from) q = q.gte('scheduled_at', from);
    if (to) q = q.lte('scheduled_at', to);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interviews: data ?? [] });
}

// POST /api/interviews
// Body: {
//   application_id, scheduled_at, duration_minutes,
//   timezone?, meeting_provider?, meeting_link?,
//   participants?, notes?, scheduled_by?
// }
//
// Creates a row, generates a meeting link if provider='jitsi', and sends an
// email invite via Brevo with an .ics attachment. Email failure is logged
// but non-fatal: the row exists and the recruiter can retry.
export async function POST(req: Request) {
  console.log('[interview] ─────────── POST /api/interviews ───────────');
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    console.log('[interview] ✗ invalid JSON body');
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  console.log('[interview] body:', {
    application_id: body.application_id,
    scheduled_at: body.scheduled_at,
    duration_minutes: body.duration_minutes,
    meeting_provider: body.meeting_provider,
    has_meeting_link: !!body.meeting_link,
    participants_count: Array.isArray(body.participants) ? body.participants.length : 0,
    force_conflict: body.force_conflict,
  });

  const applicationId = String(body.application_id ?? '');
  if (!applicationId) {
    console.log('[interview] ✗ application_id missing');
    return NextResponse.json(
      { error: 'application_id is required' },
      { status: 400 }
    );
  }

  const scheduledAt = String(body.scheduled_at ?? '');
  const duration = Number(body.duration_minutes ?? 30);
  const tz = String(body.timezone ?? 'Asia/Kolkata');
  const provider = String(body.meeting_provider ?? 'jitsi') as InterviewMeetingProvider;
  const manualLink = body.meeting_link ? String(body.meeting_link).trim() : null;
  const notes = body.notes ? String(body.notes).trim() : null;
  const scheduledBy = body.scheduled_by ? String(body.scheduled_by) : null;
  const participants = Array.isArray(body.participants)
    ? (body.participants as InterviewParticipant[]).filter(
        (p) => p && typeof p.email === 'string' && p.email.trim()
      )
    : [];

  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { error: `meeting_provider must be one of: ${[...VALID_PROVIDERS].join(', ')}` },
      { status: 400 }
    );
  }

  const errors = validateSchedule({
    scheduled_at: scheduledAt,
    duration_minutes: duration,
    meeting_provider: provider,
    meeting_link: manualLink,
  });
  if (errors.length > 0) {
    console.log('[interview] ✗ validation errors:', errors);
    return NextResponse.json(
      { error: errors.map((e) => `${e.field}: ${e.message}`).join('; '), errors },
      { status: 400 }
    );
  }
  console.log('[interview] ✓ validation passed');

  // Pull the candidate + job in one round-trip for the email later.
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, full_name, email, job_id, jobs(id, title)')
    .eq('id', applicationId)
    .maybeSingle();
  if (appErr || !app) {
    console.log('[interview] ✗ candidate fetch failed:', appErr?.message ?? 'not found');
    return NextResponse.json(
      { error: appErr?.message ?? 'Candidate not found' },
      { status: 404 }
    );
  }
  const job = (app as unknown as { jobs: { id: string; title: string } }).jobs;
  const jobTitle = job?.title ?? 'Interview';
  const jobId = job?.id ?? (app as { job_id: string }).job_id;
  console.log('[interview] ✓ candidate loaded:', {
    id: (app as { id: string }).id,
    name: (app as { full_name: string }).full_name,
    email: (app as { email: string }).email,
    job_id: jobId,
    job_title: jobTitle,
  });

  // Conflict check — only across this candidate's other scheduled interviews.
  const { data: existing } = await supabase
    .from('interviews')
    .select('*')
    .eq('application_id', applicationId)
    .eq('status', 'scheduled');
  const existingActive = (existing as Interview[]) ?? [];

  // Same-day duplicate block — a single candidate should not get TWO active
  // interviews on the same calendar day. Reschedule the existing one (PATCH)
  // instead of creating a new row that fires another email. Recruiter can
  // override with force_duplicate:true (the dialog wires this up after the
  // first 409 response).
  const proposedDay = new Date(scheduledAt);
  if (!Number.isNaN(proposedDay.getTime())) {
    const dayStart = new Date(proposedDay);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const sameDay = existingActive.filter((i) => {
      const t = new Date(i.scheduled_at).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    });
    if (sameDay.length > 0 && body.force_duplicate !== true) {
      console.log(
        '[interview] ✗ same-day duplicate block:',
        sameDay.length,
        'existing on this day',
      );
      return NextResponse.json(
        {
          error:
            'This candidate already has an interview scheduled on this day. Please reschedule the existing one (or cancel/complete it) instead of scheduling another.',
          existing: sameDay.map((i) => ({
            id: i.id,
            scheduled_at: i.scheduled_at,
            status: i.status,
          })),
          duplicate_block: true,
        },
        { status: 409 }
      );
    }
  }

  const conflicts = findConflicts(
    { scheduled_at: scheduledAt, duration_minutes: duration },
    existingActive
  );
  if (conflicts.length > 0 && body.force_conflict !== true) {
    console.log('[interview] ✗ conflict with', conflicts.length, 'existing interview(s)');
    return NextResponse.json(
      {
        error: 'This candidate already has an interview at that time.',
        conflicts,
      },
      { status: 409 }
    );
  }
  console.log('[interview] ✓ no conflicts');

  let meetingLink: string | null = null;
  if (provider === 'jitsi') {
    meetingLink = generateJitsiLink({
      jobTitle,
      candidateName: (app as { full_name: string }).full_name ?? 'Candidate',
    });
  } else if (provider === 'manual') {
    meetingLink = manualLink;
  }
  // google_meet & none → null link until OAuth lands.

  const insert = {
    application_id: applicationId,
    job_id: jobId,
    scheduled_by: scheduledBy,
    candidate_email: (app as { email: string }).email,
    candidate_name: (app as { full_name: string }).full_name,
    scheduled_at: scheduledAt,
    duration_minutes: duration,
    timezone: tz,
    status: 'scheduled' as const,
    meeting_provider: provider,
    meeting_link: meetingLink,
    participants,
    notes,
  };

  const { data: row, error: insErr } = await supabase
    .from('interviews')
    .insert(insert)
    .select('*')
    .single();

  if (insErr) {
    console.log('[interview] ✗ DB insert failed:', insErr.message);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  console.log('[interview] ✓ DB row inserted:', {
    id: (row as { id: string }).id,
    meeting_provider: (row as { meeting_provider: string }).meeting_provider,
    meeting_link: (row as { meeting_link: string | null }).meeting_link,
  });

  // Best-effort email. Don't roll back the row if SMTP isn't configured —
  // the recruiter sees a warning and can resend.
  console.log('[interview] → calling sendInterviewInvite (action=created)');
  let emailWarning: string | null = null;
  try {
    const sender = await sendInterviewInvite({
      interview: row as Interview,
      jobTitle,
      action: 'created',
    });
    if (!sender.ok) {
      emailWarning = sender.error;
      console.log('[interview] ✗ email NOT sent:', sender.error);
    } else {
      console.log('[interview] ✓ email sent OK');
    }
  } catch (err) {
    emailWarning = err instanceof Error ? err.message : String(err);
    console.log('[interview] ✗ email threw exception:', emailWarning);
  }

  console.log('[interview] ─────────── done. emailSent =', !emailWarning, '───────────');

  return NextResponse.json({
    interview: row,
    emailSent: !emailWarning,
    emailWarning,
    durations: INTERVIEW_DURATIONS,
  });
}
