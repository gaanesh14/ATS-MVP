import { NextResponse } from 'next/server';
import { requireRoleFromRequest, AuthError } from '@/lib/auth-server';
import {
  validateSchedule,
  findConflicts,
  INTERVIEW_DURATIONS,
} from '@/lib/interviews';
import { sendInterviewInvite } from '@/lib/email/interview-invite';
import {
  createCalendarEvent,
  getValidAccessToken,
  GoogleCalendarError,
} from '@/lib/google-calendar';
import type {
  Interview,
  InterviewMeetingProvider,
  InterviewParticipant,
} from '@/lib/supabase';

export const runtime = 'nodejs';

// 'jitsi' is intentionally omitted — we no longer accept it for NEW
// interviews. Existing rows with meeting_provider='jitsi' still read fine
// (the union in lib/supabase.ts keeps it) and PATCH on those rows still
// works as long as the body doesn't change the provider.
const VALID_PROVIDERS = new Set<InterviewMeetingProvider>([
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
  let auth;
  try {
    auth = await requireRoleFromRequest(req, 'interviews.schedule');
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, orgId } = auth;

  const url = new URL(req.url);
  const applicationId = url.searchParams.get('application_id');
  const jobId = url.searchParams.get('job_id');
  const status = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const upcoming = url.searchParams.get('upcoming') === '1';

  let q = admin.from('interviews').select('*').order('scheduled_at', { ascending: true });
  if (orgId) q = q.eq('org_id', orgId);
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

  let auth;
  try {
    auth = await requireRoleFromRequest(req, 'interviews.schedule');
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, orgId, member } = auth;

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
  // Default to the authed user so google_meet has a token-bearer to look up.
  // Callers can still override with an explicit scheduled_by in the body.
  const scheduledBy = body.scheduled_by ? String(body.scheduled_by) : member.id;
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
  // Scoped to caller's org so a recruiter from one tenant can't schedule
  // against an application in a different tenant.
  const baseAppQ = admin
    .from('applications')
    .select('id, full_name, email, job_id, jobs(id, title)')
    .eq('id', applicationId);
  const scopedAppQ = orgId ? baseAppQ.eq('org_id', orgId) : baseAppQ;
  const { data: app, error: appErr } = await scopedAppQ.maybeSingle();
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
  const { data: existing } = await admin
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
  let googleEventId: string | null = null;
  // Surfaced as part of the response so the UI can show a yellow banner
  // when the row was saved but the Calendar step degraded. Distinct from
  // emailWarning further down — this one is about Google, that one is
  // about Brevo.
  let providerWarning: string | null = null;

  if (provider === 'manual') {
    meetingLink = manualLink;
  } else if (provider === 'google_meet') {
    // Create the event in the scheduler's Google Calendar. The event owner
    // is whoever PhotonX recorded as scheduled_by; reschedules/cancels use
    // the SAME owner's tokens so the same Calendar event is patched.
    const accessToken = await getValidAccessToken(admin, scheduledBy);
    if (!accessToken) {
      console.log(
        '[interview] ⚠ google_meet requested but scheduler has no valid Google token'
      );
      providerWarning =
        'Google Meet selected, but the scheduler has not connected Google Calendar (or the connection expired). The interview is saved without a Meet link. Connect Google in Settings → Integrations and edit the interview to add one.';
    } else {
      const candidateName = (app as { full_name: string }).full_name ?? 'Candidate';
      const candidateEmail = (app as { email: string }).email;
      try {
        const ev = await createCalendarEvent(accessToken, {
          scheduledAt,
          durationMinutes: duration,
          timezone: tz,
          summary: `Interview: ${candidateName} · ${jobTitle}`,
          description: buildEventDescription({ jobTitle, notes }),
          attendees: [
            { email: candidateEmail, displayName: candidateName },
            ...participants.map((p) => ({ email: p.email, displayName: p.name })),
          ],
        });
        meetingLink = ev.meetLink;
        googleEventId = ev.eventId;
        console.log('[interview] ✓ Google Calendar event created:', ev.eventId);
      } catch (err) {
        const isAuth =
          err instanceof GoogleCalendarError && err.status === 401;
        console.error(
          '[interview] ✗ Calendar event creation failed:',
          err instanceof Error ? err.message : String(err)
        );
        providerWarning = isAuth
          ? 'Google Calendar rejected the request (token revoked). Reconnect in Settings → Integrations, then edit the interview to add the Meet link.'
          : 'Could not create the Google Calendar event. The interview is saved; you can add a meeting link by editing it.';
      }
    }
  }
  // 'none' → null link, no warning.

  const insert: Record<string, unknown> = {
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
    google_calendar_event_id: googleEventId,
    participants,
    notes,
  };
  // Stamp org_id on insert when running post-migration. Pre-migration the
  // column doesn't exist; including it would raise.
  if (orgId) insert.org_id = orgId;

  const { data: row, error: insErr } = await admin
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
    providerWarning,
    durations: INTERVIEW_DURATIONS,
  });
}

// Body of the Google Calendar event description. Includes the job title +
// any recruiter notes + a "Scheduled via PhotonX" footer so events created
// here are distinguishable from manually-created ones in the calendar UI.
function buildEventDescription(opts: {
  jobTitle: string;
  notes: string | null;
}): string {
  const parts: string[] = [];
  if (opts.jobTitle) parts.push(`Role: ${opts.jobTitle}`);
  if (opts.notes) parts.push('', 'Notes:', opts.notes);
  parts.push('', '— Scheduled via PhotonX ATS');
  return parts.join('\n');
}
