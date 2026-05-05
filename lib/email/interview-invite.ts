// Interview invite email — sent via Brevo's transactional email API (v3).
//
// We use the HTTP API (not SMTP) so we don't need nodemailer or another
// transport dependency. The API supports inline attachments which we use
// to deliver the .ics calendar file.
//
// Required env:
//   BREVO_API_KEY      — create one at Brevo → SMTP & API → API Keys.
//                        (NOT the same as the Supabase Auth SMTP login.)
//   BREVO_SENDER_EMAIL — verified sender address from Brevo → Senders.
//   BREVO_SENDER_NAME  — friendly display name (defaults to "PhotonX ATS").
//
// If BREVO_API_KEY is missing we no-op with a clear error so the interview
// row still saves and the UI surfaces a warning to retry later.

import 'server-only';
import { buildIcs, formatInterviewDateTime, formatDuration } from '@/lib/interviews';
import type { Interview } from '@/lib/supabase';

// Five distinct emails:
//   created       — first time scheduled. "You've been shortlisted…"
//   rescheduled   — time/duration changed
//   cancelled     — interview called off
//   reminder_24h  — automated, 24h before the interview
//   reminder_1h   — automated, 1h before the interview
type InviteAction =
  | 'created'
  | 'rescheduled'
  | 'cancelled'
  | 'reminder_24h'
  | 'reminder_1h';

type SendResult = { ok: true } | { ok: false; error: string };

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export async function sendInterviewInvite(opts: {
  interview: Interview;
  jobTitle: string;
  action: InviteAction;
}): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? 'PhotonX ATS';

  // Diagnostic: show the env values the *running* process actually has.
  // (Print only the prefix + length of the key — never the full secret.)
  const keyPrefix = apiKey ? apiKey.slice(0, 10) : '(unset)';
  console.log('[email] env loaded by running process:', {
    BREVO_API_KEY_prefix: keyPrefix,
    BREVO_API_KEY_length: apiKey?.length ?? 0,
    BREVO_SENDER_EMAIL: senderEmail ?? '(unset)',
    BREVO_SENDER_NAME: senderName,
    action: opts.action,
    candidate_email: opts.interview.candidate_email,
  });

  if (!apiKey || !senderEmail) {
    console.log('[email] ✗ skipping send — missing env');
    return {
      ok: false,
      error:
        'Email skipped: BREVO_API_KEY and/or BREVO_SENDER_EMAIL not set in .env.local. ' +
        'See docs/interviews-setup.md.',
    };
  }

  // Catch the wrong-key-type case explicitly. SMTP-relay keys (xsmtpsib-…)
  // belong in Supabase Auth's SMTP settings, not here. The HTTP API rejects
  // them with 401 — better to fail loudly with the right hint.
  if (apiKey.startsWith('xsmtpsib-')) {
    console.log(
      '[email] ✗ BREVO_API_KEY starts with xsmtpsib- — that is an SMTP key. The HTTP API needs xkeysib-. Restart `npm run dev` after editing .env.local.',
    );
    return {
      ok: false,
      error:
        'BREVO_API_KEY is an SMTP-relay key (xsmtpsib-…). The Brevo HTTP API needs an API key (xkeysib-…). ' +
        'Generate one in Brevo → SMTP & API → API Keys, replace it in .env.local, then restart npm run dev.',
    };
  }

  const { interview, jobTitle, action } = opts;
  const startsAt = new Date(interview.scheduled_at);
  const endsAt = new Date(startsAt.getTime() + interview.duration_minutes * 60_000);

  const subject = renderSubject(action, jobTitle);
  const htmlBody = renderHtml({ interview, jobTitle, action });
  const textBody = renderText({ interview, jobTitle, action });

  const attendees = [
    { name: interview.candidate_name, email: interview.candidate_email },
    ...interview.participants
      .filter((p) => p.email && p.email !== senderEmail)
      .map((p) => ({ name: p.name || p.email, email: p.email })),
  ];

  const ics = buildIcs({
    uid: `interview-${interview.id}@photonx`,
    start: startsAt,
    end: endsAt,
    summary: `${jobTitle ? jobTitle + ' — ' : ''}Interview with PhotonX`,
    description: [
      interview.notes,
      interview.meeting_link ? `Join: ${interview.meeting_link}` : null,
    ]
      .filter(Boolean)
      .join('\n\n'),
    location: interview.meeting_link ?? '',
    organizerName: senderName,
    organizerEmail: senderEmail,
    attendees,
    status: action === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
  });

  // Brevo's API rejects an empty `cc` array with 400 "cc is missing" — the
  // field must either contain at least one recipient or be omitted entirely.
  // Same defensive treatment for `attachment` even though .ics is always set.
  const ccList = interview.participants
    .filter((p) => p.email)
    .map((p) => ({ email: p.email, name: p.name || p.email }));

  const payload: Record<string, unknown> = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email: interview.candidate_email, name: interview.candidate_name }],
    subject,
    htmlContent: htmlBody,
    textContent: textBody,
    attachment: [
      {
        name: 'interview.ics',
        content: Buffer.from(ics, 'utf8').toString('base64'),
      },
    ],
  };
  if (ccList.length > 0) payload.cc = ccList;

  console.log('[email] → POST', BREVO_ENDPOINT, {
    to: (payload.to as Array<{ email: string }>).map((t) => t.email),
    cc: ccList.map((t) => t.email),
    subject: payload.subject,
    has_attachment: (payload.attachment as unknown[]).length > 0,
  });
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => '');
    console.log('[email] ← Brevo response', { status: res.status, body: text.slice(0, 500) });
    if (!res.ok) {
      return { ok: false, error: `Brevo ${res.status}: ${text || res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[email] ✗ network error:', msg);
    return { ok: false, error: msg };
  }
}

function renderSubject(action: InviteAction, jobTitle: string): string {
  const job = jobTitle ? ` for ${jobTitle}` : '';
  switch (action) {
    case 'created':
      return `You're shortlisted — interview scheduled${job}`;
    case 'rescheduled':
      return `Your interview has been rescheduled${job}`;
    case 'cancelled':
      return `Your interview has been cancelled${job}`;
    case 'reminder_24h':
      return `Reminder: your interview is tomorrow${job}`;
    case 'reminder_1h':
      return `Starting in 1 hour — your interview${job}`;
  }
}

function renderHtml(opts: {
  interview: Interview;
  jobTitle: string;
  action: InviteAction;
}): string {
  const { interview, jobTitle, action } = opts;
  const when = formatInterviewDateTime(interview.scheduled_at, interview.timezone);
  const dur = formatDuration(interview.duration_minutes);

  const intro: Record<InviteAction, string> = {
    created:
      "Great news — you've been shortlisted! Your interview is scheduled below. The calendar invite is attached so you can add it in one click. Please join on time using the meeting link.",
    rescheduled:
      'Your interview has been rescheduled. The updated time is below — please refresh your calendar using the attached invite.',
    cancelled:
      'Your interview has been cancelled. No further action is required from you, and we appreciate your time.',
    reminder_24h:
      'A friendly reminder that your interview is tomorrow. Please test your microphone and camera ahead of time, and join the meeting link a couple of minutes early.',
    reminder_1h:
      'Your interview starts in about an hour. Click the button below to join the meeting when you are ready — the room will be open.',
  };
  const introText = intro[action];

  const buttonLabel = action === 'reminder_1h' ? 'Join now' : 'Join the meeting';
  const meetButton =
    action !== 'cancelled' && interview.meeting_link
      ? `<tr><td style="padding:18px 28px 0"><a href="${escapeHtml(
          interview.meeting_link
        )}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px">${buttonLabel}</a></td></tr>`
      : '';

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 12px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
      <tr><td style="padding:28px 28px 8px">
        <div style="font-size:13px;font-weight:600;color:#6366f1;letter-spacing:.04em;text-transform:uppercase">PhotonX</div>
        <h1 style="margin:8px 0 0;font-size:22px;color:#0f172a;letter-spacing:-.01em">${escapeHtml(
          renderSubject(action, jobTitle)
        )}</h1>
        <p style="margin:10px 0 0;font-size:14px;color:#475569;line-height:1.55">${escapeHtml(introText)}</p>
      </td></tr>
      <tr><td style="padding:18px 28px 0">
        <table cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border-radius:12px;padding:16px">
          <tr><td style="font-size:12px;color:#64748b;padding-bottom:4px">When</td>
              <td style="font-size:14px;color:#0f172a;font-weight:600;padding-bottom:4px;text-align:right">${escapeHtml(when)}</td></tr>
          <tr><td style="font-size:12px;color:#64748b;padding-bottom:4px">Duration</td>
              <td style="font-size:14px;color:#0f172a;text-align:right;padding-bottom:4px">${escapeHtml(dur)}</td></tr>
          ${
            jobTitle
              ? `<tr><td style="font-size:12px;color:#64748b;padding-bottom:4px">Role</td>
                     <td style="font-size:14px;color:#0f172a;text-align:right;padding-bottom:4px">${escapeHtml(jobTitle)}</td></tr>`
              : ''
          }
          ${
            interview.meeting_link
              ? `<tr><td style="font-size:12px;color:#64748b">Where</td>
                     <td style="font-size:13px;color:#6366f1;text-align:right;word-break:break-all"><a href="${escapeHtml(
                       interview.meeting_link
                     )}" style="color:#6366f1;text-decoration:none">${escapeHtml(interview.meeting_link)}</a></td></tr>`
              : ''
          }
        </table>
      </td></tr>
      ${meetButton}
      ${
        interview.notes && action !== 'cancelled'
          ? `<tr><td style="padding:18px 28px 0">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Notes</div>
              <div style="font-size:13.5px;color:#334155;line-height:1.6;white-space:pre-wrap">${escapeHtml(interview.notes)}</div>
             </td></tr>`
          : ''
      }
      <tr><td style="padding:24px 28px 28px;font-size:12px;color:#94a3b8;line-height:1.6">
        Need to reschedule? Reply to this email and the team will help.
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:11px;color:#94a3b8">Sent by PhotonX ATS</p>
  </td></tr>
</table>
</body></html>`;
}

function renderText(opts: {
  interview: Interview;
  jobTitle: string;
  action: InviteAction;
}): string {
  const { interview, jobTitle, action } = opts;
  const when = formatInterviewDateTime(interview.scheduled_at, interview.timezone);
  const lines = [
    renderSubject(action, jobTitle),
    '',
    `When: ${when}`,
    `Duration: ${formatDuration(interview.duration_minutes)}`,
  ];
  if (jobTitle) lines.push(`Role: ${jobTitle}`);
  if (interview.meeting_link && action !== 'cancelled') {
    lines.push(`Join: ${interview.meeting_link}`);
  }
  if (interview.notes && action !== 'cancelled') {
    lines.push('', 'Notes:', interview.notes);
  }
  lines.push('', '— PhotonX ATS');
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
