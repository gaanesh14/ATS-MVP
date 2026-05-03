'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Briefcase,
  Users,
  X,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { supabase, type Job, type Application } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Hit =
  | { kind: 'job'; id: string; title: string; location: string | null }
  | {
      kind: 'applicant';
      id: string;
      full_name: string;
      email: string;
      job_id: string | null;
      job_title: string | null;
    };

type AppLite = {
  id: string;
  full_name: string;
  email: string;
  job_id: string | null;
  jobs: { title: string } | null;
};

// Click-to-open search button + ⌘K command-palette dialog. Lives in the
// topbar. Searches jobs + applicants client-side from a one-shot fetch on
// open — fine for MVP volumes; swap for a debounced server query later.
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<AppLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K opens; Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Lazy-fetch on first open.
  useEffect(() => {
    if (!open || jobs.length || apps.length) return;
    setLoading(true);
    Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase
        .from('applications')
        .select('id, full_name, email, job_id, jobs(title)')
        .order('created_at', { ascending: false })
        .limit(200),
    ])
      .then(([jRes, aRes]) => {
        setJobs((jRes.data as Job[]) ?? []);
        setApps((aRes.data as unknown as AppLite[]) ?? []);
      })
      .finally(() => setLoading(false));
  }, [open, jobs.length, apps.length]);

  // Focus input + reset state on each open.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Slight delay so the input mounts before focus.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Hit[] = [];
    for (const j of jobs) {
      const t = j.title?.toLowerCase() ?? '';
      const l = j.location?.toLowerCase() ?? '';
      if (t.includes(q) || l.includes(q)) {
        out.push({ kind: 'job', id: j.id, title: j.title, location: j.location });
      }
      if (out.length >= 5) break;
    }
    for (const a of apps) {
      const n = a.full_name?.toLowerCase() ?? '';
      const e = a.email?.toLowerCase() ?? '';
      if (n.includes(q) || e.includes(q)) {
        out.push({
          kind: 'applicant',
          id: a.id,
          full_name: a.full_name,
          email: a.email,
          job_id: a.job_id,
          job_title: a.jobs?.title ?? null,
        });
      }
      if (out.length >= 14) break;
    }
    return out;
  }, [query, jobs, apps]);

  // Reset highlight when results change.
  useEffect(() => {
    setActiveIdx(0);
  }, [hits.length]);

  function navigateTo(hit: Hit) {
    setOpen(false);
    if (hit.kind === 'job') {
      router.push(`/dashboard/jobs/${hit.id}`);
    } else if (hit.job_id) {
      router.push(`/dashboard/jobs/${hit.job_id}`);
    } else {
      router.push('/dashboard/applicants');
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[activeIdx];
      if (hit) navigateTo(hit);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search (⌘K)"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[13px] text-slate-500 transition-colors hover:bg-slate-50"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-start justify-center bg-slate-900/50 p-4 pt-[10vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
          onKeyDown={onListKeyDown}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onListKeyDown}
                placeholder="Search jobs and applicants…"
                className="flex-1 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {!query && (
                <p className="px-4 py-6 text-center text-[13px] text-slate-500">
                  {loading
                    ? 'Loading…'
                    : 'Start typing to search jobs and applicants.'}
                </p>
              )}

              {query && hits.length === 0 && !loading && (
                <p className="px-4 py-8 text-center text-[13px] text-slate-500">
                  No matches for <strong>&quot;{query}&quot;</strong>.
                </p>
              )}

              {hits.length > 0 && (
                <ResultGroups
                  hits={hits}
                  activeIdx={activeIdx}
                  onHover={setActiveIdx}
                  onSelect={navigateTo}
                />
              )}
            </div>

            {/* Footer with shortcuts */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-[11.5px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" />
                  <ArrowDown className="h-3 w-3" />
                  navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3" />
                  open
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1 text-[9.5px] font-medium">
                    Esc
                  </kbd>
                  close
                </span>
              </div>
              <span className="num">
                {hits.length} result{hits.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroups({
  hits,
  activeIdx,
  onHover,
  onSelect,
}: {
  hits: Hit[];
  activeIdx: number;
  onHover: (i: number) => void;
  onSelect: (h: Hit) => void;
}) {
  // Split into Jobs / Applicants so the labels make sense to the user.
  const jobHits = hits
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h.kind === 'job');
  const appHits = hits
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h.kind === 'applicant');

  return (
    <div className="py-2">
      {jobHits.length > 0 && (
        <Section label="Jobs" icon={<Briefcase className="h-3 w-3" />}>
          {jobHits.map(({ h, i }) => {
            if (h.kind !== 'job') return null;
            return (
              <ResultRow
                key={`j-${h.id}`}
                active={activeIdx === i}
                onMouseEnter={() => onHover(i)}
                onClick={() => onSelect(h)}
                title={h.title}
                subtitle={h.location ?? '—'}
                tone="brand"
                icon={<Briefcase className="h-3.5 w-3.5" />}
              />
            );
          })}
        </Section>
      )}
      {appHits.length > 0 && (
        <Section label="Applicants" icon={<Users className="h-3 w-3" />}>
          {appHits.map(({ h, i }) => {
            if (h.kind !== 'applicant') return null;
            return (
              <ResultRow
                key={`a-${h.id}`}
                active={activeIdx === i}
                onMouseEnter={() => onHover(i)}
                onClick={() => onSelect(h)}
                title={h.full_name}
                subtitle={`${h.email}${h.job_title ? ` · ${h.job_title}` : ''}`}
                tone="sky"
                avatar={initialsOf(h.full_name)}
              />
            );
          })}
        </Section>
      )}
    </div>
  );
}

function Section({
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
      <div className="flex items-center gap-1.5 px-4 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function ResultRow({
  active,
  onClick,
  onMouseEnter,
  title,
  subtitle,
  tone,
  icon,
  avatar,
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  title: string;
  subtitle: string;
  tone: 'brand' | 'sky';
  icon?: React.ReactNode;
  avatar?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        active ? 'bg-slate-100' : 'hover:bg-slate-50'
      )}
    >
      {avatar ? (
        <span
          className={cn(
            'grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[11px] font-semibold',
            tone === 'sky' ? 'bg-sky-50 text-sky-700' : 'bg-brand-50 text-brand-700'
          )}
        >
          {avatar}
        </span>
      ) : (
        <span
          className={cn(
            'grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg',
            tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-sky-50 text-sky-600'
          )}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13.5px] font-medium text-slate-900">{title}</div>
        <div className="truncate text-[12px] text-slate-500">{subtitle}</div>
      </div>
      <span
        className={cn(
          'text-[11px] font-medium transition-opacity',
          active ? 'opacity-100 text-brand-600' : 'opacity-0'
        )}
      >
        Open →
      </span>
    </button>
  );
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Compact preview of the most recent applicants — replaces the static avatar
// stack that used pravatar.cc placeholder images. Stays at the right of the
// topbar when there's room.
export function RecentApplicantsStack() {
  const [apps, setApps] = useState<AppLite[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('applications')
      .select('id, full_name, email, job_id, jobs(title)')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!cancelled && data) {
          setApps(data as unknown as AppLite[]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (apps.length === 0) return null;

  const visible = apps.slice(0, 3);
  const extra = Math.max(0, apps.length - visible.length);

  return (
    <Link
      href="/dashboard/applicants"
      title="Recent applicants"
      className="hidden items-center pl-1 xl:flex"
    >
      <div className="flex -space-x-2">
        {visible.map((a, i) => (
          <span
            key={a.id}
            title={a.full_name}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-white',
              // Stagger the tone so the stack reads visually like distinct
              // people, not a row of identical chips.
              i === 0
                ? 'bg-sky-100 text-sky-700'
                : i === 1
                ? 'bg-brand-100 text-brand-700'
                : 'bg-amber-100 text-amber-700'
            )}
          >
            {initialsOf(a.full_name)}
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span className="num ml-1.5 inline-flex h-7 items-center rounded-full border border-white bg-slate-100 px-2 text-[12px] font-medium text-slate-600">
          +{extra}
        </span>
      )}
    </Link>
  );
}
