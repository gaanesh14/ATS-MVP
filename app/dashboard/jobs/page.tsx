'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  MapPin,
  Briefcase,
  Users,
  MoreVertical,
  Pause,
  Play,
  Pencil,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { supabase, type Job, type Application } from '@/lib/supabase';
import { AtsPill } from '@/components/ui/ats-pill';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import { authedFetch } from '@/lib/authed-fetch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDate, formatExperienceRange } from '@/lib/utils';

type Counts = { open: number; closed: number; all: number };

type SortKey = 'recent' | 'applicants' | 'ats';

export default function JobsPage() {
  const { role } = useAuth();
  const canCreate = can(role, 'jobs.create');
  const canEditJob = can(role, 'jobs.edit');
  const canDeleteJob = can(role, 'jobs.delete');

  const [jobs, setJobs] = useState<Job[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'open' | 'closed'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      const [{ data: jobsData }, { data: appsData }] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('applications').select('id, job_id, ats_score'),
      ]);
      setJobs((jobsData as Job[]) ?? []);
      setApps((appsData as Application[]) ?? []);
      setLoading(false);
    }
    fetchAll();
  }, []);

  function updateJobStatus(jobId: string, status: 'open' | 'closed') {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status } : j)));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await authedFetch(`/api/jobs/${deleteTarget.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setDeleteError(err.error ?? `Delete failed: HTTP ${res.status}`);
      setDeleting(false);
      return;
    }
    setJobs((prev) => prev.filter((j) => j.id !== deleteTarget.id));
    setDeleting(false);
    setDeleteTarget(null);
  }

  const counts: Counts = useMemo(
    () => ({
      all: jobs.length,
      open: jobs.filter((j) => j.status === 'open').length,
      closed: jobs.filter((j) => j.status !== 'open').length,
    }),
    [jobs]
  );

  // ATS averages per job
  const atsByJob = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    apps.forEach((a) => {
      if (!a.job_id) return;
      const m = map.get(a.job_id) ?? { sum: 0, n: 0 };
      if (a.ats_score != null) {
        m.sum += a.ats_score;
        m.n++;
      }
      map.set(a.job_id, m);
    });
    const out: Record<string, number | null> = {};
    map.forEach((v, k) => {
      out[k] = v.n ? Math.round(v.sum / v.n) : null;
    });
    return out;
  }, [apps]);

  const visible = useMemo(() => {
    let arr = jobs;
    if (tab === 'open') arr = arr.filter((j) => j.status === 'open');
    if (tab === 'closed') arr = arr.filter((j) => j.status !== 'open');
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          (j.location ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...arr];
    if (sort === 'recent') {
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else if (sort === 'applicants') {
      sorted.sort((a, b) => {
        const aN = apps.filter((x) => x.job_id === a.id).length;
        const bN = apps.filter((x) => x.job_id === b.id).length;
        return bN - aN;
      });
    } else if (sort === 'ats') {
      sorted.sort(
        (a, b) => (atsByJob[b.id] ?? -1) - (atsByJob[a.id] ?? -1)
      );
    }
    return sorted;
  }, [jobs, apps, atsByJob, tab, query, sort]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Jobs</h1>
      <p className="mt-1 text-slate-500">
        Track and manage all your open roles in one place.
      </p>

      {/* Search + sort + tabs */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search jobs by title or location..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="num h-10 w-44 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="recent">Most recent</option>
              <option value="applicants">Most applicants</option>
              <option value="ats">Highest ATS avg</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Underline tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200">
            <UnderlineTab
              active={tab === 'all'}
              onClick={() => setTab('all')}
              label="All"
              count={counts.all}
              showCount={false}
            />
            <UnderlineTab
              active={tab === 'open'}
              onClick={() => setTab('open')}
              label="Open"
              count={counts.open}
            />
            <UnderlineTab
              active={tab === 'closed'}
              onClick={() => setTab('closed')}
              label="Closed"
              count={counts.closed}
            />
          </div>
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

      {!loading && visible.length === 0 && (
        <div className="mt-12 rounded-2xl border border-slate-100 bg-white py-16 text-center">
          <div className="text-slate-500">
            {query ? (
              <>
                No jobs match <strong>&quot;{query}&quot;</strong>.
              </>
            ) : (
              'No jobs match. Try adjusting your filters or clearing them.'
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setTab('all');
              setQuery('');
            }}
            className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            apps={apps}
            avgAts={atsByJob[job.id] ?? null}
            canEdit={canEditJob}
            canDelete={canDeleteJob}
            onStatusChange={updateJobStatus}
            onRequestDelete={setDeleteTarget}
          />
        ))}
      </div>

      {/* Pagination shell — visual parity with design (single page in MVP) */}
      {visible.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-400 disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <button
            type="button"
            className="num h-9 w-9 rounded-lg bg-brand-500 font-medium text-white"
          >
            1
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-400 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle>Delete this job?</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <p className="text-sm text-slate-600">
              <strong className="text-slate-900">{deleteTarget.title}</strong> and all
              its applicants will be permanently removed. This cannot be undone.
            </p>
          )}
          {deleteError && <p className="text-sm text-rose-600">{deleteError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting ? 'Deleting…' : 'Delete job'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnderlineTab({
  active,
  onClick,
  label,
  count,
  showCount = true,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  showCount?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      )}
    >
      {label}
      {showCount && (
        <span className="num ml-1 text-slate-400">({count})</span>
      )}
    </button>
  );
}

function JobCard({
  job,
  apps,
  avgAts,
  canEdit,
  canDelete,
  onStatusChange,
  onRequestDelete,
}: {
  job: Job;
  apps: Application[];
  avgAts: number | null;
  canEdit: boolean;
  canDelete: boolean;
  onStatusChange: (jobId: string, status: 'open' | 'closed') => void;
  onRequestDelete: (job: Job) => void;
}) {
  // The 3-dots menu is only useful when the user can perform at least one of
  // the actions inside it. Recruiters get a clean read-only card.
  const showMenu = canEdit || canDelete;
  const router = useRouter();
  const jobApps = apps.filter((a) => a.job_id === job.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = job.status === 'open';
  const isNew = isWithinDays(job.created_at, 3);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  function navigate() {
    router.push(`/dashboard/jobs/${job.id}`);
  }

  async function setStatus(next: 'open' | 'closed') {
    setMenuOpen(false);
    setUpdating(true);
    const res = await authedFetch(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setUpdating(false);
    if (res.ok) onStatusChange(job.id, next);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate();
      }}
      className="group relative cursor-pointer rounded-2xl border border-slate-100 bg-white p-5 shadow-card transition-all hover:border-slate-200 hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {isNew && (
        <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600 ring-1 ring-brand-200">
          New
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <h3
          className={cn(
            'min-w-0 pr-2 text-[15px] font-semibold leading-tight text-slate-900',
            isNew && 'mt-5'
          )}
        >
          {job.title}
        </h3>
        <div
          className="flex flex-shrink-0 items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
              isOpen
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-slate-50 text-slate-700 ring-slate-200'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isOpen ? 'bg-emerald-500' : 'bg-slate-400'
              )}
            />
            {isOpen ? 'Open' : 'Closed'}
          </span>
          {showMenu && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={updating}
                onClick={() => setMenuOpen((o) => !o)}
                className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lift"
                >
                  {canEdit &&
                    (isOpen ? (
                      <RowMenuItem
                        icon={<Pause className="h-3.5 w-3.5" />}
                        onClick={() => setStatus('closed')}
                      >
                        Pause (close) job
                      </RowMenuItem>
                    ) : (
                      <RowMenuItem
                        icon={<Play className="h-3.5 w-3.5" />}
                        onClick={() => setStatus('open')}
                        tone="brand"
                      >
                        Re-open job
                      </RowMenuItem>
                    ))}
                  {canEdit && (
                    <Link
                      role="menuitem"
                      href={`/dashboard/jobs/${job.id}/edit`}
                      onClick={() => setMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      <span className="text-slate-400">
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                      Edit job
                    </Link>
                  )}
                  {canEdit && canDelete && <div className="my-1 h-px bg-slate-100" />}
                  {canDelete && (
                    <RowMenuItem
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestDelete(job);
                      }}
                      tone="danger"
                    >
                      Delete job
                    </RowMenuItem>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[13px] text-slate-500">
        {job.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {job.location}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" />
          {formatExperienceRange(job.min_experience, job.max_experience)}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <div className="inline-flex items-center gap-2 text-[13px] text-slate-600">
          <Users className="h-4 w-4 text-slate-400" />
          <span className="num font-medium">{jobApps.length}</span>
          <span className="text-slate-400">applicants</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-400">ATS</span>
          <AtsPill score={avgAts} />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[12px] text-slate-400">
        <span>{formatDate(job.created_at)}</span>
        <span className="inline-flex items-center gap-0.5 font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
          View applicants →
        </span>
      </div>
    </div>
  );
}

function RowMenuItem({
  icon,
  children,
  onClick,
  tone = 'default',
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'brand';
}) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
        tone === 'danger'
          ? 'text-rose-600 hover:bg-rose-50'
          : tone === 'brand'
          ? 'text-brand-600 hover:bg-brand-50'
          : 'text-slate-700 hover:bg-slate-100'
      )}
    >
      <span className={cn(tone === 'default' && 'text-slate-400')}>{icon}</span>
      {children}
    </button>
  );
}

function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const ms = Date.now() - new Date(iso).getTime();
  return ms <= days * 24 * 3600 * 1000;
}
