// Interview scheduling helpers — runs on both client and server.
//
// The dashboard creates interviews via /api/interviews. This module owns:
//   1. Validation of the inputs (slot in the future, sane duration, …)
//   2. Generating a meeting link that just works without OAuth.
//   3. Producing an iCalendar (.ics) attachment so candidates get a calendar
//      invite no matter what mail client they use.
//
// We intentionally keep this side-effect-free. The Brevo sender lives in
// `lib/email/interview-invite.ts` so it can stay server-only.

import type {
  Interview,
  InterviewParticipant,
  InterviewMeetingProvider,
  InterviewStatus,
} from '@/lib/supabase';

export const INTERVIEW_DURATIONS = [15, 30, 45, 60, 90] as const;
export type InterviewDuration = (typeof INTERVIEW_DURATIONS)[number];

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const INTERVIEW_STATUS_TONE: Record<
  InterviewStatus,
  { dot: string; pill: string }
> = {
  scheduled: { dot: 'bg-brand-500', pill: 'bg-brand-50 text-brand-700 ring-brand-200' },
  completed: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  cancelled: { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600 ring-slate-200' },
  no_show: { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 ring-rose-200' },
};

// Display strings shown next to each interview row. 'jitsi' stays here so
// legacy rows render with a sensible label — but it's no longer an option
// in the schedule dialog.
export const PROVIDER_LABEL: Record<InterviewMeetingProvider, string> = {
  jitsi: 'Jitsi Meet (legacy)',
  google_meet: 'Google Meet',
  manual: 'Custom link',
  none: 'No video',
};

// ──────────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────────

export type ScheduleInput = {
  scheduled_at: string; // ISO
  duration_minutes: number;
  timezone?: string;
  meeting_provider?: InterviewMeetingProvider;
  meeting_link?: string | null;
  participants?: InterviewParticipant[];
  notes?: string | null;
};

export type ValidationError = { field: string; message: string };

export function validateSchedule(
  input: ScheduleInput,
  opts: { allowPast?: boolean } = {}
): ValidationError[] {
  const errors: ValidationError[] = [];
  const when = new Date(input.scheduled_at);
  if (Number.isNaN(when.getTime())) {
    errors.push({ field: 'scheduled_at', message: 'Pick a date and time.' });
    return errors;
  }
  if (!opts.allowPast && when.getTime() < Date.now() - 60_000) {
    errors.push({
      field: 'scheduled_at',
      message: 'That slot is in the past — pick a time at least a minute from now.',
    });
  }
  if (
    !INTERVIEW_DURATIONS.includes(input.duration_minutes as InterviewDuration)
  ) {
    errors.push({
      field: 'duration_minutes',
      message: `Duration must be one of ${INTERVIEW_DURATIONS.join(', ')} minutes.`,
    });
  }
  if (input.meeting_provider === 'manual') {
    const link = (input.meeting_link ?? '').trim();
    if (!/^https?:\/\//i.test(link)) {
      errors.push({
        field: 'meeting_link',
        message: 'Paste a full meeting URL (https://…) or pick another option.',
      });
    }
  }
  return errors;
}

// ──────────────────────────────────────────────────────────────────────────
// Conflict detection
//
// We can't see candidates' calendars, but we *can* see other PhotonX
// interviews scheduled for the same recruiter / candidate. Two events
// overlap if [a.start, a.end) intersects [b.start, b.end).
// ──────────────────────────────────────────────────────────────────────────

export function getInterviewEnd(i: { scheduled_at: string; duration_minutes: number }): Date {
  return new Date(new Date(i.scheduled_at).getTime() + i.duration_minutes * 60_000);
}

export function intervalsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function findConflicts(
  candidate: { scheduled_at: string; duration_minutes: number },
  others: Interview[],
  opts: { ignoreId?: string } = {}
): Interview[] {
  const a = {
    start: new Date(candidate.scheduled_at),
    end: getInterviewEnd(candidate),
  };
  return others.filter((o) => {
    if (opts.ignoreId && o.id === opts.ignoreId) return false;
    if (o.status === 'cancelled') return false;
    const b = { start: new Date(o.scheduled_at), end: getInterviewEnd(o) };
    return intervalsOverlap(a, b);
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Meeting link generation
//
// Removed in favor of Google Calendar API integration. See
// lib/google-calendar.ts for the createMeetEvent flow. The 'jitsi' provider
// stays in the InterviewMeetingProvider union so legacy rows render — but
// new interviews can no longer be scheduled with it (see VALID_PROVIDERS
// in app/api/interviews/route.ts).
// ──────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────
// iCalendar (.ics) generation
//
// RFC 5545. Hand-rolled because the alternative is bringing in `ics` (~30KB)
// for what is essentially string concatenation. We escape commas, newlines,
// and semicolons in text fields and fold lines >75 octets per spec.
// ──────────────────────────────────────────────────────────────────────────

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  organizerName: string;
  organizerEmail: string;
  attendees: { name: string; email: string }[];
  status?: 'CONFIRMED' | 'CANCELLED';
};

export function buildIcs(event: IcsEvent): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PhotonX//Interviews//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(event.start)}`,
    `DTEND:${formatIcsDate(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `STATUS:${event.status ?? 'CONFIRMED'}`,
    `ORGANIZER;CN=${escapeText(event.organizerName)}:mailto:${event.organizerEmail}`,
    ...event.attendees.map(
      (a) =>
        `ATTENDEE;CN=${escapeText(a.name)};RSVP=TRUE:mailto:${a.email}`
    ),
  ];
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }
  lines.push('SEQUENCE:0');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

function formatIcsDate(d: Date): string {
  // YYYYMMDDTHHMMSSZ — always UTC.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line: string): string {
  // Lines >75 octets MUST be folded by inserting CRLF + space.
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    out.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length > 0) out.push(' ' + rest);
  return out.join('\r\n');
}

// ──────────────────────────────────────────────────────────────────────────
// Display helpers
// ──────────────────────────────────────────────────────────────────────────

export function formatInterviewDate(iso: string, tz?: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  }).format(d);
}

export function formatInterviewTime(iso: string, tz?: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(d);
}

export function formatInterviewDateTime(iso: string, tz?: string): string {
  return `${formatInterviewDate(iso, tz)} · ${formatInterviewTime(iso, tz)}`;
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
}

// "in 3h" / "in 2 days" / "5h ago"
export function formatRelative(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diff = t - now.getTime();
  const abs = Math.abs(diff);
  const dir = diff >= 0 ? 'in' : 'ago';
  const fmt = (n: number, unit: string) =>
    dir === 'in' ? `in ${n} ${unit}` : `${n} ${unit} ago`;
  if (abs < 60_000) return diff >= 0 ? 'in <1 min' : 'just now';
  if (abs < 60 * 60_000) return fmt(Math.round(abs / 60_000), 'min');
  if (abs < 24 * 60 * 60_000) return fmt(Math.round(abs / (60 * 60_000)), 'h');
  return fmt(Math.round(abs / (24 * 60 * 60_000)), 'day');
}

export function isUpcoming(i: Pick<Interview, 'scheduled_at' | 'status'>): boolean {
  if (i.status !== 'scheduled') return false;
  return new Date(i.scheduled_at).getTime() > Date.now();
}

export function isPastDue(i: Pick<Interview, 'scheduled_at' | 'status' | 'duration_minutes'>): boolean {
  if (i.status !== 'scheduled') return false;
  const end = new Date(i.scheduled_at).getTime() + i.duration_minutes * 60_000;
  return Date.now() > end;
}
