'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  Calendar as CalendarIcon,
  Clock,
  Video,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  MoreHorizontal,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Mail,
  AlertTriangle,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase, type Interview } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import {
  INTERVIEW_STATUS_LABEL,
  INTERVIEW_STATUS_TONE,
  PROVIDER_LABEL,
  formatInterviewTime,
  formatDuration,
  formatRelative,
  getInterviewEnd,
  isPastDue,
} from '@/lib/interviews';
import { ScheduleInterviewDialog } from '@/components/interviews/schedule-dialog';

type InterviewRow = Interview & {
  applications?: { full_name: string; email: string; jobs?: { title: string } | null } | null;
};

type Tab = 'upcoming' | 'today' | 'past' | 'cancelled' | 'all';

export default function InterviewsPage() {
  const { role, member } = useAuth();
  const canManage = can(role, 'interviews.manage');

  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('upcoming');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [editTarget, setEditTarget] = useState<InterviewRow | null>(null);
  const [actionMenuFor, setActionMenuFor] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('interviews')
      .select('*, applications(full_name, email, jobs(title))')
      .order('scheduled_at', { ascending: true });
    if (err) setError(err.message);
    setInterviews(((data ?? []) as InterviewRow[]));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Auto-bucket: split into upcoming / past / cancelled / today.
  const buckets = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const upcoming: InterviewRow[] = [];
    const past: InterviewRow[] = [];
    const cancelled: InterviewRow[] = [];
    const today: InterviewRow[] = [];

    for (const i of interviews) {
      if (i.status === 'cancelled') {
        cancelled.push(i);
        continue;
      }
      const start = new Date(i.scheduled_at);
      const end = getInterviewEnd(i);
      if (start >= startOfToday && start < endOfToday) today.push(i);
      if (end.getTime() < now && i.status === 'scheduled') past.push(i);
      else if (i.status === 'scheduled') upcoming.push(i);
      else past.push(i);
    }

    return {
      upcoming,
      past: past.sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)),
      cancelled,
      today: today.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
      all: [...interviews],
    } as Record<Tab, InterviewRow[]>;
  }, [interviews]);

  const stats = useMemo(() => {
    const now = Date.now();
    const today = buckets.today.length;
    const week = interviews.filter((i) => {
      if (i.status !== 'scheduled') return false;
      const t = +new Date(i.scheduled_at);
      return t >= now && t <= now + 7 * 24 * 60 * 60_000;
    }).length;
    const totalScheduled = interviews.filter((i) => i.status === 'scheduled').length;
    const completed = interviews.filter((i) => i.status === 'completed').length;
    return { today, week, totalScheduled, completed };
  }, [interviews, buckets.today.length]);

  const visible = useMemo(() => {
    const arr = buckets[tab];
    const q = query.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((i) => {
      const cand = i.applications?.full_name ?? i.candidate_name ?? '';
      const job = i.applications?.jobs?.title ?? '';
      return (
        cand.toLowerCase().includes(q) ||
        i.candidate_email.toLowerCase().includes(q) ||
        job.toLowerCase().includes(q)
      );
    });
  }, [buckets, tab, query]);

  // Update an interview (status flip, etc) without a full refetch.
  async function patchInterview(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/interviews/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Could not update interview.');
      return;
    }
    await load();
  }

  async function cancel(id: string) {
    if (!confirm('Cancel this interview? The candidate will be emailed.')) return;
    const res = await fetch(`/api/interviews/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Could not cancel.');
      return;
    }
    await load();
  }

  async function resendInvite(id: string) {
    const res = await fetch(`/api/interviews/${id}/send-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'created' }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j.error ?? 'Could not resend.');
      return;
    }
    alert('Invite email sent.');
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
            Interviews
          </h1>
          <p className="mt-1 text-slate-500">
            Schedule, reschedule, and track every interview with one Meet link.
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today"
          value={stats.today}
          icon={<CalendarIcon className="h-4 w-4" />}
          tone="brand"
        />
        <StatCard
          label="Next 7 days"
          value={stats.week}
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
        />
        <StatCard
          label="Scheduled"
          value={stats.totalScheduled}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="violet"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
        />
      </div>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-1">
          {(
            [
              ['upcoming', `Upcoming · ${buckets.upcoming.length}`],
              ['today', `Today · ${buckets.today.length}`],
              ['past', `Past · ${buckets.past.length}`],
              ['cancelled', `Cancelled · ${buckets.cancelled.length}`],
              ['all', `All · ${buckets.all.length}`],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
                tab === k
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search by name, email, or job…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-[260px] pl-9"
            />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            <button
              onClick={() => setView('list')}
              className={cn(
                'px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                view === 'list'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={cn(
                'border-l border-slate-200 px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                view === 'calendar'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              Calendar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-[13px] text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <ListSkeleton />
      ) : view === 'calendar' ? (
        <CalendarView interviews={interviews} onPick={(i) => setEditTarget(i)} />
      ) : visible.length === 0 ? (
        <EmptyState tab={tab} canManage={canManage} />
      ) : (
        // overflow-visible (was overflow-hidden) so the row's action menu can
        // escape the rounded card. The rows themselves are responsible for
        // their own corner clipping via the first/last child rounding below.
        <div className="mt-4 rounded-2xl border border-slate-100 bg-white shadow-card [&>div:first-child]:rounded-t-2xl [&>div:last-child]:rounded-b-2xl">
          {visible.map((i, idx) => (
            <InterviewRow
              key={i.id}
              interview={i}
              isLast={idx === visible.length - 1}
              canManage={canManage}
              onEdit={() => setEditTarget(i)}
              onCancel={() => cancel(i.id)}
              onResendInvite={() => resendInvite(i.id)}
              onMarkComplete={() => patchInterview(i.id, { status: 'completed' })}
              onMarkNoShow={() => patchInterview(i.id, { status: 'no_show' })}
              actionMenuOpen={actionMenuFor === i.id}
              onToggleActions={() =>
                setActionMenuFor((cur) => (cur === i.id ? null : i.id))
              }
              onCloseActions={() => setActionMenuFor(null)}
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editTarget && (
        <ScheduleInterviewDialog
          open={!!editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
          applicationId={editTarget.application_id}
          candidateName={editTarget.applications?.full_name ?? editTarget.candidate_name}
          candidateEmail={editTarget.applications?.email ?? editTarget.candidate_email}
          jobTitle={editTarget.applications?.jobs?.title ?? ''}
          scheduledById={member?.id ?? null}
          interview={editTarget}
          onSaved={() => {
            setEditTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Row
// ──────────────────────────────────────────────────────────────────────────

function InterviewRow({
  interview,
  isLast,
  canManage,
  onEdit,
  onCancel,
  onResendInvite,
  onMarkComplete,
  onMarkNoShow,
  actionMenuOpen,
  onToggleActions,
  onCloseActions,
}: {
  interview: InterviewRow;
  isLast: boolean;
  canManage: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onResendInvite: () => void;
  onMarkComplete: () => void;
  onMarkNoShow: () => void;
  actionMenuOpen: boolean;
  onToggleActions: () => void;
  onCloseActions: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<'bottom' | 'top'>('bottom');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tone = INTERVIEW_STATUS_TONE[interview.status];
  const candName = interview.applications?.full_name ?? interview.candidate_name;
  const jobTitle = interview.applications?.jobs?.title ?? null;
  const initials = (candName || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const stale = isPastDue(interview);

  function copyLink() {
    if (!interview.meeting_link) return;
    navigator.clipboard.writeText(interview.meeting_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        'group flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/40',
        !isLast && 'border-b border-slate-100'
      )}
    >
      {/* Date/time block */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">
            {new Date(interview.scheduled_at).toLocaleString('en-IN', {
              month: 'short',
            })}
          </span>
          <span className="text-[18px] font-semibold leading-tight">
            {new Date(interview.scheduled_at).getDate()}
          </span>
        </div>
        <div className="min-w-[120px]">
          <div className="text-[13px] font-semibold text-slate-900">
            {formatInterviewTime(interview.scheduled_at, interview.timezone)}
          </div>
          <div className="text-[11.5px] text-slate-500">
            {formatDuration(interview.duration_minutes)}
          </div>
        </div>
      </div>

      {/* Candidate identity */}
      <div className="flex min-w-[200px] flex-1 items-center gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-[12px] font-semibold text-slate-700">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-slate-900">
            {candName}
          </div>
          <div className="flex items-center gap-1 truncate text-[11.5px] text-slate-500">
            <Mail className="h-3 w-3" />
            {interview.candidate_email}
          </div>
        </div>
      </div>

      {/* Job */}
      {jobTitle && (
        <div className="hidden min-w-[160px] items-center gap-1.5 text-[12.5px] text-slate-600 md:flex">
          <Briefcase className="h-3.5 w-3.5 text-slate-400" />
          <span className="truncate">{jobTitle}</span>
        </div>
      )}

      {/* Meet link */}
      {interview.meeting_link ? (
        <div className="hidden items-center gap-1 lg:flex">
          <a
            href={interview.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-brand-600 transition-colors hover:border-brand-200 hover:bg-brand-50/40"
          >
            <Video className="h-3.5 w-3.5" />
            Join
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <button
            onClick={copyLink}
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Copy meeting link"
            title={copied ? 'Copied' : 'Copy link'}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      ) : (
        <span className="hidden text-[11.5px] text-slate-400 lg:inline">
          {PROVIDER_LABEL[interview.meeting_provider]}
        </span>
      )}

      {/* Status pill */}
      <div className="flex items-center gap-2">
        {stale && interview.status === 'scheduled' && (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-100">
            ended
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1',
            tone.pill
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
          {INTERVIEW_STATUS_LABEL[interview.status]}
        </span>
        <span className="hidden text-[11px] text-slate-400 sm:inline">
          {formatRelative(interview.scheduled_at)}
        </span>
      </div>

      {/* Action menu */}
      {canManage && (
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => {
              // Flip menu placement based on space below the trigger so it
              // never overflows the viewport. ~280px covers the tallest menu.
              if (!actionMenuOpen && buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                setMenuPlacement(spaceBelow < 280 ? 'top' : 'bottom');
              }
              onToggleActions();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {actionMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={onCloseActions}
                aria-hidden="true"
              />
              <div
                className={cn(
                  // max-h + overflow + hidden-scrollbar so a menu with many
                  // items in the future still fits inside the viewport.
                  'absolute right-0 z-20 w-52 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-lift',
                  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  menuPlacement === 'bottom' ? 'top-9' : 'bottom-9',
                )}
              >
                {interview.status === 'scheduled' && (
                  <ActionItem
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    label="Reschedule"
                    onClick={() => {
                      onCloseActions();
                      onEdit();
                    }}
                  />
                )}
                {interview.status === 'cancelled' && (
                  <ActionItem
                    icon={<Pencil className="h-3.5 w-3.5 text-slate-400" />}
                    label="View details"
                    onClick={() => {
                      onCloseActions();
                      onEdit();
                    }}
                  />
                )}
                {interview.status === 'scheduled' && (
                  <>
                    <ActionItem
                      icon={<Mail className="h-3.5 w-3.5 text-slate-500" />}
                      label="Resend invite email"
                      onClick={() => {
                        onCloseActions();
                        onResendInvite();
                      }}
                    />
                    <div className="my-1 mx-2 h-px bg-slate-100" />
                    <ActionItem
                      icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      label="Mark complete"
                      onClick={() => {
                        onCloseActions();
                        onMarkComplete();
                      }}
                    />
                    <ActionItem
                      icon={<XCircle className="h-3.5 w-3.5 text-rose-600" />}
                      label="Mark no-show"
                      onClick={() => {
                        onCloseActions();
                        onMarkNoShow();
                      }}
                    />
                    <div className="my-1 mx-2 h-px bg-slate-100" />
                    <ActionItem
                      icon={<Trash2 className="h-3.5 w-3.5 text-rose-600" />}
                      label="Cancel interview"
                      tone="danger"
                      onClick={() => {
                        onCloseActions();
                        onCancel();
                      }}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] hover:bg-slate-50',
        tone === 'danger' ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Calendar view — compact monthly grid showing dot per interview.
// ──────────────────────────────────────────────────────────────────────────

function CalendarView({
  interviews,
  onPick,
}: {
  interviews: InterviewRow[];
  onPick: (i: InterviewRow) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const monthLabel = cursor.toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
  const firstDow = cursor.getDay();
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0
  ).getDate();

  // Map YYYY-MM-DD → interviews on that day.
  const byDay = useMemo(() => {
    const m = new Map<string, InterviewRow[]>();
    for (const i of interviews) {
      if (i.status === 'cancelled') continue;
      const d = new Date(i.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const arr = m.get(key) ?? [];
      arr.push(i);
      m.set(key, arr);
    }
    return m;
  }, [interviews]);

  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
  })();

  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      key: `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${d}`,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() - 1);
              setCursor(d);
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const t = new Date();
              t.setDate(1);
              t.setHours(0, 0, 0, 0);
              setCursor(t);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() + 1);
              setCursor(d);
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="text-[14px] font-semibold text-slate-900">{monthLabel}</h2>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/40 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          if (!cell) {
            return (
              <div
                key={idx}
                className="min-h-[96px] border-b border-r border-slate-100 bg-slate-50/30"
              />
            );
          }
          const items = byDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          return (
            <div
              key={idx}
              className={cn(
                'min-h-[96px] border-b border-r border-slate-100 p-1.5 last:border-r-0',
                isToday && 'bg-brand-50/30'
              )}
            >
              <div
                className={cn(
                  'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11.5px] font-semibold',
                  isToday ? 'bg-brand-500 text-white' : 'text-slate-700'
                )}
              >
                {cell.day}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((i) => {
                  const tone = INTERVIEW_STATUS_TONE[i.status];
                  return (
                    <button
                      key={i.id}
                      onClick={() => onPick(i)}
                      className={cn(
                        'flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-[10.5px] font-medium ring-1 transition-colors hover:bg-white',
                        tone.pill
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', tone.dot)} />
                      <span className="truncate">
                        {formatInterviewTime(i.scheduled_at, i.timezone)} ·{' '}
                        {i.applications?.full_name ?? i.candidate_name}
                      </span>
                    </button>
                  );
                })}
                {items.length > 3 && (
                  <div className="px-1 text-[10px] text-slate-500">
                    +{items.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'brand' | 'amber' | 'violet' | 'emerald';
}) {
  const toneClass = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className={cn('grid h-9 w-9 place-items-center rounded-xl', toneClass)}>
          {icon}
        </div>
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <div className="num text-[22px] font-semibold leading-tight text-slate-900">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-4 space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[72px] animate-pulse rounded-2xl border border-slate-100 bg-white"
        />
      ))}
    </div>
  );
}

function EmptyState({
  tab,
  canManage,
}: {
  tab: Tab;
  canManage: boolean;
}) {
  const titles: Record<Tab, string> = {
    upcoming: 'No interviews coming up',
    today: 'Nothing on the calendar today',
    past: 'No past interviews yet',
    cancelled: 'No cancelled interviews',
    all: 'No interviews scheduled yet',
  };
  const bodies: Record<Tab, string> = {
    upcoming:
      'Schedule an interview from any candidate dialog — it lands here with a one-click Meet link.',
    today: "You're all caught up for today.",
    past: 'Completed interviews will show up here once they wrap.',
    cancelled: 'Cancelled rows are kept here for reference.',
    all: 'Open a candidate, click Schedule interview, and you\'re off.',
  };
  return (
    <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-500">
        <CalendarClock className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-[16px] font-semibold text-slate-900">{titles[tab]}</h3>
      <p className="mt-1 max-w-sm text-[13px] text-slate-500">{bodies[tab]}</p>
      {canManage && (
        <Link
          href="/dashboard/applicants"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" />
          Browse candidates
        </Link>
      )}
    </div>
  );
}
