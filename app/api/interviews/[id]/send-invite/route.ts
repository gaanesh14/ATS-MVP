import { NextResponse } from 'next/server';
import { requireRoleFromRequest, AuthError } from '@/lib/auth-server';
import { sendInterviewInvite } from '@/lib/email/interview-invite';
import type { Interview } from '@/lib/supabase';

export const runtime = 'nodejs';

// POST /api/interviews/[id]/send-invite
//
// Manual resend of the candidate-facing "you've been shortlisted" email
// for an existing interview. Useful when:
//   - Brevo wasn't configured at create-time and the row exists silently
//   - Candidate didn't see the first email and recruiter wants to nudge
//   - Recruiter changed the meeting link or notes and wants to reflect that
//
// Body (optional): { action?: 'created' | 'rescheduled' | 'reminder_1h' }
//   Defaults to 'created' which uses the shortlist copy.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  let auth;
  try {
    auth = await requireRoleFromRequest(req, 'interviews.manage');
  } catch (err) {
    if (err instanceof AuthError) return err.toResponse();
    throw err;
  }
  const { admin, orgId } = auth;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* no body is fine */
  }

  const action =
    (body.action as 'created' | 'rescheduled' | 'reminder_1h' | undefined) ??
    'created';

  const baseQ = admin
    .from('interviews')
    .select('*, applications(jobs(title))')
    .eq('id', id);
  const scopedQ = orgId ? baseQ.eq('org_id', orgId) : baseQ;
  const { data: row, error } = await scopedQ.maybeSingle();
  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? 'Interview not found' },
      { status: 404 }
    );
  }

  const interview = row as Interview;
  if (interview.status === 'cancelled') {
    return NextResponse.json(
      { error: 'Cannot resend invite for a cancelled interview.' },
      { status: 400 }
    );
  }

  const jobTitle =
    ((row as unknown as {
      applications?: { jobs?: { title?: string | null } | null } | null;
    }).applications?.jobs?.title) ?? '';

  const send = await sendInterviewInvite({ interview, jobTitle, action });
  if (!send.ok) {
    return NextResponse.json({ error: send.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
