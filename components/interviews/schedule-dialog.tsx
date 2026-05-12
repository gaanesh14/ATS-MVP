'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Video,
  Users as UsersIcon,
  Sparkles,
  AlertTriangle,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  INTERVIEW_DURATIONS,
  formatInterviewDateTime,
  formatDuration,
  PROVIDER_LABEL,
} from '@/lib/interviews';
import type {
  Interview,
  InterviewMeetingProvider,
  InterviewParticipant,
  TeamMember,
} from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { authedFetch } from '@/lib/authed-fetch';

type Mode = 'create' | 'edit';

export type ScheduleDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle?: string;
  scheduledById?: string | null;
  // Edit mode — pass an interview to pre-fill and PATCH instead of POST.
  interview?: Interview | null;
  onSaved?: (i: Interview) => void;
};

export function ScheduleInterviewDialog(props: ScheduleDialogProps) {
  const mode: Mode = props.interview ? 'edit' : 'create';

  const defaults = useMemo(() => buildDefaults(props.interview), [props.interview]);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [duration, setDuration] = useState<number>(defaults.duration);
  const [provider, setProvider] = useState<InterviewMeetingProvider>(defaults.provider);
  const [notes, setNotes] = useState(defaults.notes);
  const [participants, setParticipants] = useState<InterviewParticipant[]>(
    defaults.participants
  );

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceConflict, setForceConflict] = useState(false);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [success, setSuccess] = useState<Interview | null>(null);
  // null = loading, true/false = known. Drives the Google Meet tile state
  // and gates submit when google_meet is selected.
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);

  const refreshGoogleStatus = useCallback(async () => {
    try {
      const res = await authedFetch('/api/integrations/google');
      if (!res.ok) {
        setGoogleConnected(false);
        return;
      }
      const json = (await res.json()) as { connected: boolean };
      setGoogleConnected(Boolean(json.connected));
    } catch {
      setGoogleConnected(false);
    }
  }, []);

  // Reset form whenever the dialog re-opens or the source interview changes.
  useEffect(() => {
    if (!props.open) return;
    const d = buildDefaults(props.interview);
    setDate(d.date);
    setTime(d.time);
    setDuration(d.duration);
    setProvider(d.provider);
    setNotes(d.notes);
    setParticipants(d.participants);
    setError(null);
    setWarnings(null);
    setForceConflict(false);
    setForceDuplicate(false);
    setSuccess(null);
  }, [props.open, props.interview]);

  // Pull team members once when the dialog opens (typeahead source).
  useEffect(() => {
    if (!props.open) return;
    let alive = true;
    supabase
      .from('team_members')
      .select('*')
      .eq('status', 'active')
      .order('name')
      .then(({ data }) => {
        if (alive && data) setMembers(data as TeamMember[]);
      });
    return () => {
      alive = false;
    };
  }, [props.open]);

  // Google Calendar connection status — refreshed each time the dialog
  // opens so a recruiter who just connected sees the updated state.
  useEffect(() => {
    if (!props.open) return;
    setGoogleConnected(null);
    refreshGoogleStatus();
  }, [props.open, refreshGoogleStatus]);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  const scheduledIso = combineDateTime(date, time);
  const previewWhen = scheduledIso
    ? formatInterviewDateTime(scheduledIso, tz)
    : '—';

  const filteredMembers = members
    .filter((m) => !participants.some((p) => p.id === m.id))
    .filter((m) =>
      memberQuery.trim()
        ? `${m.name} ${m.email}`.toLowerCase().includes(memberQuery.toLowerCase())
        : true
    )
    .slice(0, 6);

  function addParticipant(m: TeamMember) {
    setParticipants((prev) => [
      ...prev,
      { id: m.id, name: m.name, email: m.email, role: m.role },
    ]);
    setMemberQuery('');
  }

  function removeParticipant(id: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  }

  async function submit() {
    setError(null);
    setWarnings(null);
    if (!scheduledIso) {
      setError('Pick a date and time.');
      return;
    }

    setBusy(true);
    const payload: Record<string, unknown> = {
      scheduled_at: scheduledIso,
      duration_minutes: duration,
      timezone: tz,
      meeting_provider: provider,
      participants,
      notes: notes.trim() || null,
      force_conflict: forceConflict,
      force_duplicate: forceDuplicate,
    };
    // Only set meeting_link when we have a definitive value: 'none' clears
    // it; 'google_meet' lets the server generate it via Calendar API. For
    // legacy providers (jitsi/manual on existing rows being edited) we
    // omit meeting_link entirely so the server preserves what's already
    // stored — sending null would clobber it.
    if (provider === 'none') {
      payload.meeting_link = null;
    }
    if (mode === 'create') {
      payload.application_id = props.applicationId;
      if (props.scheduledById) payload.scheduled_by = props.scheduledById;
    }

    const url = mode === 'edit' ? `/api/interviews/${props.interview!.id}` : '/api/interviews';
    const method = mode === 'edit' ? 'PATCH' : 'POST';

    let res: Response;
    try {
      res = await authedFetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Network error');
      return;
    }

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    setBusy(false);

    if (res.status === 409) {
      const msg =
        (json.error as string) ??
        'This candidate already has an interview at that time.';
      setError(msg);
      // The server tags `duplicate_block: true` when the candidate already has
      // any active interview on the same day. Distinguish so the override
      // button works correctly the second time around.
      if ((json as { duplicate_block?: boolean }).duplicate_block) {
        setForceDuplicate(true);
      } else {
        setForceConflict(true);
      }
      return;
    }
    if (!res.ok) {
      setError((json.error as string) ?? 'Could not save interview.');
      return;
    }

    // The API can surface two non-fatal warnings:
    //   emailWarning    — Brevo couldn't send the candidate notification
    //   providerWarning — Google Calendar step degraded (no token, revoked)
    // Concatenate so the recruiter sees both if they happened.
    const w: string[] = [];
    if (json.providerWarning) w.push(String(json.providerWarning));
    if (json.emailWarning) w.push(`Email: ${json.emailWarning}`);
    if (w.length > 0) setWarnings(w.join(' · '));

    setSuccess(json.interview as Interview);
    props.onSaved?.(json.interview as Interview);
    if (w.length === 0) {
      setTimeout(() => props.onOpenChange(false), 700);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="space-y-0 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-6 pb-5 pt-6 dark:from-slate-800 dark:to-slate-900">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[18px] font-semibold tracking-tight text-slate-900">
                {mode === 'edit' ? 'Reschedule interview' : 'Schedule interview'}
              </DialogTitle>
              <p className="mt-1 truncate text-[13px] text-slate-500">
                {props.candidateName}
                {props.jobTitle ? ` · ${props.jobTitle}` : ''}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {success ? (
            <SuccessPanel interview={success} jobTitle={props.jobTitle} />
          ) : (
            <>
              {/* Date + time */}
              <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
                <Field
                  label="Date"
                  icon={<Calendar className="h-3.5 w-3.5" />}
                >
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <Field
                  label="Time"
                  icon={<Clock className="h-3.5 w-3.5" />}
                >
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </Field>
                <Field label="Duration" icon={<Sparkles className="h-3.5 w-3.5" />}>
                  <DurationSelect value={duration} onChange={setDuration} />
                </Field>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 text-[12.5px] text-slate-600">
                <span className="font-medium text-slate-900">{previewWhen}</span>
                <span className="ml-2 text-slate-500">
                  · {formatDuration(duration)} · {tz}
                </span>
              </div>

              {/* Meeting provider */}
              <div>
                <Label className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  <Video className="h-3.5 w-3.5" />
                  Video meeting
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ProviderTile
                    selected={provider === 'google_meet'}
                    onClick={() => setProvider('google_meet')}
                    icon={<Video className="h-4 w-4" />}
                    title="Google Meet"
                    body={
                      googleConnected === false
                        ? 'Connect Google Calendar to enable'
                        : 'Auto-generated, synced to Calendar'
                    }
                    tone="brand"
                  />
                  <ProviderTile
                    selected={provider === 'none'}
                    onClick={() => setProvider('none')}
                    icon={<X className="h-4 w-4" />}
                    title="No video"
                    body="In-person or phone"
                  />
                </div>
                {provider === 'google_meet' && googleConnected === false && (
                  <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[12.5px] text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      You haven&apos;t connected Google Calendar yet.{' '}
                      <a
                        href="/dashboard/settings?tab=integrations"
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline"
                      >
                        Connect in Settings → Integrations
                      </a>{' '}
                      first, or pick another option.
                    </span>
                  </div>
                )}
              </div>

              {/* Participants */}
              <div>
                <Label className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                  <UsersIcon className="h-3.5 w-3.5" />
                  Internal interviewers <span className="font-normal normal-case text-slate-400">(optional)</span>
                </Label>
                {participants.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {participants.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700 ring-1 ring-brand-100"
                      >
                        {p.name}
                        <button
                          type="button"
                          onClick={() => removeParticipant(p.id)}
                          className="grid h-4 w-4 place-items-center rounded-full text-brand-500 hover:bg-brand-100"
                          aria-label={`Remove ${p.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Type a teammate's name…"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
                {memberQuery && filteredMembers.length > 0 && (
                  <div className="mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    {filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => addParticipant(m)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">
                            {m.name}
                          </div>
                          <div className="truncate text-[11.5px] text-slate-500">
                            {m.email}
                          </div>
                        </div>
                        <span className="text-[11px] uppercase tracking-wide text-slate-400">
                          {m.role.replace('_', ' ')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <Label
                  htmlFor="interview-notes"
                  className="mb-2 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500"
                >
                  Notes <span className="font-normal normal-case text-slate-400">(shared with candidate)</span>
                </Label>
                <Textarea
                  id="interview-notes"
                  placeholder="What will you cover? Any prep links?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {warnings && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[12.5px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{warnings}</span>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-2.5 text-[12.5px] text-rose-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {error}
                    {(forceConflict || forceDuplicate) && (
                      <>
                        {' '}
                        <button
                          type="button"
                          onClick={() => {
                            // Re-submit with the override flag set; the
                            // existing state already has it true.
                            void submit();
                          }}
                          className="ml-1 font-semibold underline"
                        >
                          Schedule anyway
                        </button>
                      </>
                    )}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/40 px-6 py-3.5">
            <Button
              variant="ghost"
              onClick={() => props.onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                busy ||
                !scheduledIso ||
                (provider === 'google_meet' && googleConnected === false)
              }
              className="bg-brand-500 hover:bg-brand-600"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : mode === 'edit' ? (
                'Save changes'
              ) : (
                'Schedule & send invite'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildDefaults(interview: Interview | null | undefined) {
  if (interview) {
    const d = new Date(interview.scheduled_at);
    return {
      date: toDateInput(d),
      time: toTimeInput(d),
      duration: interview.duration_minutes,
      provider: interview.meeting_provider,
      notes: interview.notes ?? '',
      participants: interview.participants ?? [],
    };
  }
  // Default: tomorrow 10:00 local.
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(10, 0, 0, 0);
  return {
    date: toDateInput(t),
    time: toTimeInput(t),
    duration: 30,
    provider: 'google_meet' as InterviewMeetingProvider,
    notes: '',
    participants: [] as InterviewParticipant[],
  };
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </Label>
      {children}
    </div>
  );
}

function DurationSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[14px] text-slate-900 transition-colors focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
    >
      {INTERVIEW_DURATIONS.map((m) => (
        <option key={m} value={m}>
          {formatDuration(m)}
        </option>
      ))}
    </select>
  );
}

function ProviderTile({
  selected,
  onClick,
  icon,
  title,
  body,
  tone,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: 'brand';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-xl border bg-white p-3 text-left transition-colors',
        selected
          ? tone === 'brand'
            ? 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-200'
            : 'border-slate-300 bg-slate-50 ring-1 ring-slate-200'
          : 'border-slate-200 hover:border-slate-300'
      )}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
        <span className={cn(selected && tone === 'brand' ? 'text-brand-600' : 'text-slate-500')}>
          {icon}
        </span>
        {title}
      </div>
      <div className="text-[11.5px] leading-relaxed text-slate-500">{body}</div>
    </button>
  );
}

function SuccessPanel({
  interview,
  jobTitle,
}: {
  interview: Interview;
  jobTitle?: string;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-emerald-600 shadow-sm">
        <Check className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-slate-900">Interview scheduled</p>
        <p className="mt-1 text-[12.5px] text-slate-600">
          {formatInterviewDateTime(interview.scheduled_at, interview.timezone)}
          {jobTitle ? ` · ${jobTitle}` : ''}
        </p>
      </div>
      {interview.meeting_link && (
        <a
          href={interview.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-brand-600 hover:border-slate-300 hover:bg-slate-50"
        >
          <Video className="h-3.5 w-3.5" />
          Open {PROVIDER_LABEL[interview.meeting_provider]}
        </a>
      )}
      <p className="text-[11.5px] text-slate-500">
        Calendar invite + .ics attachment sent to {interview.candidate_email}.
      </p>
    </div>
  );
}
