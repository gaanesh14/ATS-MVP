'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Users,
  TrendingUp,
  Target,
  Sparkles,
  ArrowRight,
  ArrowUp,
  MapPin,
} from 'lucide-react';
import { supabase, type Job, type Application } from '@/lib/supabase';
import { AtsPill } from '@/components/ui/ats-pill';
import { StagePill } from '@/components/ui/stage-pill';
import { SourceTag } from '@/components/ui/source-tag';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import { cn, formatDate, formatExperienceRange } from '@/lib/utils';

type AppWithJob = Application & { jobs?: { title: string } | null };

export default function DashboardPage() {
  const { role, member, authUser } = useAuth();
  const canCreateJob = can(role, 'jobs.create');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [recentApps, setRecentApps] = useState<AppWithJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      const [{ data: jobsData }, { data: appsData }] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase
          .from('applications')
          .select('*, jobs(title)')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      setJobs((jobsData as Job[]) ?? []);
      setRecentApps((appsData as AppWithJob[]) ?? []);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const openJobs = jobs.filter((j) => j.status === 'open');
  const newThisWeek = recentApps.filter((a) => isWithinDays(a.created_at, 7)).length;
  const scored = recentApps.filter((a) => a.ats_score != null);
  const avgAts =
    scored.length > 0
      ? Math.round(scored.reduce((s, a) => s + (a.ats_score ?? 0), 0) / scored.length)
      : 0;

  const topCandidates = useMemo(() => {
    return recentApps
      .filter((a) => (a.ats_score ?? 0) >= 80)
      .sort((a, b) => (b.ats_score ?? 0) - (a.ats_score ?? 0))
      .slice(0, 5);
  }, [recentApps]);

  const displayName =
    member?.name?.trim() ||
    ((authUser?.user_metadata as { name?: string } | null)?.name ?? '').trim() ||
    authUser?.email?.split('@')[0] ||
    'there';
  const firstName = displayName.split(' ').filter(Boolean)[0] || displayName;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Action / greeting strip */}
      <Link
        href={openJobs[0] ? `/dashboard/jobs/${openJobs[0].id}` : '/dashboard/jobs'}
        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-brand-50/40 px-5 py-3 transition-colors hover:border-brand-200 dark:border-brand-500/20 dark:from-brand-500/10 dark:to-brand-500/5 dark:hover:border-brand-500/40"
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white shadow-sm dark:bg-slate-800">
            <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
          </span>
          <span className="text-slate-700 dark:text-slate-200">
            <span className="font-medium">Good morning, {firstName}.</span>{' '}
            <span className="text-slate-600 dark:text-slate-300">
              You have{' '}
              <span className="num font-semibold text-brand-700 dark:text-brand-300">
                {topCandidates.length} candidate{topCandidates.length === 1 ? '' : 's'}
              </span>{' '}
              with ATS ≥ 80 awaiting review
            </span>
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-brand-600 transition-transform group-hover:translate-x-0.5 dark:text-brand-300" />
      </Link>

      <div className="mt-6">
        <h1 className="text-[24px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          tone="teal"
          icon={<Briefcase className="h-5 w-5" />}
          label="Active Jobs"
          value={String(openJobs.length)}
          delta={`${jobs.length} total`}
          href="/dashboard/jobs"
        />
        <StatCard
          tone="blue"
          icon={<Users className="h-5 w-5" />}
          label="Total Applicants"
          value={String(recentApps.length)}
          delta={`${newThisWeek} this week`}
        />
        <StatCard
          tone="amber"
          icon={<TrendingUp className="h-5 w-5" />}
          label="New This Week"
          value={String(newThisWeek)}
          delta="last 7 days"
        />
        <StatCard
          tone="violet"
          icon={<Target className="h-5 w-5" />}
          label="Avg ATS Score"
          value={String(avgAts || '—')}
          delta="across applicants"
        />
      </div>


      {/* Recent Jobs */}
      <div className="mt-10 flex items-end justify-between">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Recent Jobs</h2>
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          View all jobs <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading && <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

      {!loading && jobs.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          {canCreateJob ? (
            <>
              No jobs yet.{' '}
              <Link
                href="/dashboard/jobs/new"
                className="font-medium text-brand-600 hover:underline"
              >
                Create your first job
              </Link>
              .
            </>
          ) : (
            'No jobs yet. Ask an admin to post one.'
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {jobs.slice(0, 6).map((job) => (
          <MiniJobCard key={job.id} job={job} apps={recentApps} />
        ))}
      </div>

      {/* Recent Applicants */}
      <div className="mt-12 flex items-end justify-between">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Recent Applicants
        </h2>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card dark:border-slate-800 dark:bg-slate-900">
        {recentApps.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No applicants yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                <th className="w-12 px-5 py-3 text-left">#</th>
                <th className="px-5 py-3 text-left">Applicant</th>
                <th className="px-5 py-3 text-left">Job</th>
                <th className="px-5 py-3 text-left">Applied</th>
                <th className="px-5 py-3 text-left">ATS Score</th>
                <th className="px-5 py-3 text-left">Stage</th>
                <th className="px-5 py-3 text-left">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {recentApps.slice(0, 8).map((a, i) => (
                <tr key={a.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="num px-5 py-3.5 text-slate-400 dark:text-slate-500">
                    #{String(i + 1).padStart(2, '0')}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                        {initials(a.full_name)}
                      </div>
                      <div className="leading-tight">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{a.full_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{a.jobs?.title ?? '—'}</td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">{formatDate(a.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <AtsPill score={a.ats_score} />
                  </td>
                  <td className="px-5 py-3.5">
                    <StagePill stage={a.stage ?? 'new'} />
                  </td>
                  <td className="px-5 py-3.5">
                    <SourceTag source={a.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  tone,
  icon,
  label,
  value,
  delta,
  href,
}: {
  tone: 'teal' | 'blue' | 'amber' | 'violet';
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  href?: string;
}) {
  const tones: Record<typeof tone, string> = {
    teal: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300',
    blue: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  };
  const inner = (
    <>
      <div className={cn('grid h-11 w-11 place-items-center rounded-xl', tones[tone])}>{icon}</div>
      <div className="mt-5 text-[14px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="num mt-2 text-[34px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
        <ArrowUp className="h-3.5 w-3.5" />
        {delta}
      </div>
    </>
  );
  const className = cn(
    'flex w-full flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-card text-left dark:border-slate-800 dark:bg-slate-900',
    href && 'transition-all hover:border-slate-200 hover:shadow-soft dark:hover:border-slate-700'
  );
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function MiniJobCard({ job, apps }: { job: Job; apps: AppWithJob[] }) {
  const jobApps = apps.filter((a) => a.job_id === job.id);
  const scored = jobApps.filter((a) => a.ats_score != null);
  const avgAts = scored.length
    ? Math.round(scored.reduce((s, a) => s + (a.ats_score ?? 0), 0) / scored.length)
    : null;
  const isNew = isWithinDays(job.created_at, 3);

  return (
    <Link
      href={`/dashboard/jobs/${job.id}`}
      className="group relative block rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-card transition-all hover:border-slate-200 hover:shadow-soft dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      {isNew && (
        <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600 ring-1 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/30">
          New
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <h3
          className={cn(
            'min-w-0 text-[15px] font-semibold leading-tight text-slate-900 dark:text-slate-100',
            isNew && 'mt-5'
          )}
        >
          {job.title}
        </h3>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
            job.status === 'open'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
              : 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              job.status === 'open' ? 'bg-emerald-500' : 'bg-slate-400'
            )}
          />
          {job.status === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[13px] text-slate-500 dark:text-slate-400">
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
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="inline-flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
          <Users className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <span className="num font-medium">{jobApps.length}</span>
          <span className="text-slate-400 dark:text-slate-500">applicants</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-400 dark:text-slate-500">ATS</span>
          <AtsPill score={avgAts} />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[12px] text-slate-400 dark:text-slate-500">
        <span>{formatDate(job.created_at)}</span>
        <span className="inline-flex items-center gap-0.5 font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brand-300">
          View applicants <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const ms = Date.now() - new Date(iso).getTime();
  return ms <= days * 24 * 3600 * 1000;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
