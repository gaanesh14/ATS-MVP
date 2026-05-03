'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Eye,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { supabase, type Application } from '@/lib/supabase';
import { AtsRing } from '@/components/ui/ats-ring';
import { StagePill } from '@/components/ui/stage-pill';
import { SourceTag } from '@/components/ui/source-tag';
import { Input } from '@/components/ui/input';
import { cn, formatDate, formatExperience } from '@/lib/utils';

type AppWithJob = Application & { jobs?: { title: string } | null };

export default function ApplicantsPage() {
  const router = useRouter();
  const [apps, setApps] = useState<AppWithJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [stageTab, setStageTab] = useState<
    'all' | 'new' | 'shortlisted' | 'interview' | 'hired' | 'rejected'
  >('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    async function fetchAll() {
      const { data } = await supabase
        .from('applications')
        .select('*, jobs(title)')
        .order('created_at', { ascending: false });
      setApps((data as AppWithJob[]) ?? []);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const stageCounts = useMemo(() => {
    const c = { all: apps.length, new: 0, shortlisted: 0, interview: 0, hired: 0, rejected: 0 };
    apps.forEach((a) => {
      const s = (a.stage ?? 'new') as keyof typeof c;
      if (c[s] != null) c[s]++;
    });
    return c;
  }, [apps]);

  const visible = useMemo(() => {
    let arr = apps;
    if (stageTab !== 'all') {
      arr = arr.filter((a) => (a.stage ?? 'new') === stageTab);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      arr = arr.filter(
        (a) =>
          a.full_name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          (a.jobs?.title ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...arr];
    sorted.sort((a, b) => {
      const aS = a.ats_score ?? -1;
      const bS = b.ats_score ?? -1;
      return sortDir === 'desc' ? bS - aS : aS - bS;
    });
    return sorted;
  }, [apps, query, stageTab, sortDir]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Applicants</h1>
      <p className="mt-1 text-slate-500">
        Every candidate across every job, in one place.
      </p>

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or job…"
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Sort by: ATS Score
          {sortDir === 'desc' ? (
            <ArrowDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ArrowUp className="h-4 w-4 text-slate-400" />
          )}
        </button>
      </div>

      {/* Stage tabs */}
      <div className="mt-4 flex items-center gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 no-scrollbar">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'new', label: 'New' },
            { id: 'shortlisted', label: 'Shortlisted' },
            { id: 'interview', label: 'Interview' },
            { id: 'hired', label: 'Hired' },
            { id: 'rejected', label: 'Rejected' },
          ] as const
        ).map((s) => (
          <StageTab
            key={s.id}
            active={stageTab === s.id}
            onClick={() => setStageTab(s.id)}
            label={s.label}
            count={stageCounts[s.id]}
          />
        ))}
      </div>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}

      {!loading && visible.length === 0 && (
        <div className="mt-12 rounded-2xl border border-slate-100 bg-white py-16 text-center">
          <div className="text-slate-500">
            {apps.length === 0
              ? 'No applicants yet. Share a job link to start collecting applications.'
              : 'No applicants match the current filters.'}
          </div>
          {(query || stageTab !== 'all') && apps.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStageTab('all');
              }}
              className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="w-12 px-5 py-3 text-left">#</th>
                  <th className="px-3 py-3 text-left">Applicant</th>
                  <th className="px-3 py-3 text-left">Job</th>
                  <th className="w-28 px-3 py-3 text-left">Experience</th>
                  <th className="w-32 px-3 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                      className="inline-flex items-center gap-1 hover:text-slate-700"
                    >
                      ATS Score
                      {sortDir === 'desc' ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUp className="h-3 w-3" />
                      )}
                    </button>
                  </th>
                  <th className="w-32 px-3 py-3 text-left">Stage</th>
                  <th className="w-28 px-3 py-3 text-left">Applied</th>
                  <th className="w-28 px-3 py-3 text-left">Source</th>
                  <th className="w-20 px-3 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((a, i) => {
                  const isFailed = a.parse_status === 'failed';
                  const isPending =
                    !isFailed && !a.parsed_data && a.parse_status !== 'parsed';
                  const stage = a.stage ?? 'new';
                  return (
                    <tr
                      key={a.id}
                      onClick={() =>
                        a.job_id && router.push(`/dashboard/jobs/${a.job_id}`)
                      }
                      className={cn(
                        'group cursor-pointer transition-colors hover:bg-slate-50/60',
                        !a.job_id && 'cursor-default'
                      )}
                    >
                      <td className="num px-5 py-4 text-slate-400">
                        #{String(i + 1).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                            {initials(a.full_name)}
                          </div>
                          <div className="leading-tight">
                            <div className="font-medium text-slate-900">{a.full_name}</div>
                            <div className="text-[12px] text-slate-500">{a.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-slate-700">
                        {a.jobs?.title ?? <span className="text-slate-400">—</span>}
                      </td>
                      <td className="num px-3 py-4 text-slate-700">
                        {formatExperience(a.parsed_data?.experience_years)}
                      </td>
                      <td className="px-3 py-4">
                        {isFailed ? (
                          <span
                            title={a.ats_issues?.[0] ?? 'Parse failed'}
                            className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 ring-1 ring-rose-200"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Failed
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                            Parsing
                          </span>
                        ) : (
                          <AtsRing score={a.ats_score} />
                        )}
                      </td>
                      <td className="px-3 py-4">
                        <StagePill stage={stage} />
                      </td>
                      <td className="px-3 py-4 text-[12.5px] text-slate-600">
                        {formatDate(a.created_at)}
                      </td>
                      <td className="px-3 py-4">
                        <SourceTag source={a.source} />
                      </td>
                      <td
                        className="px-3 py-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          {a.job_id && (
                            <Link
                              href={`/dashboard/jobs/${a.job_id}`}
                              title="Open in job"
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StageTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all',
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-800'
      )}
    >
      {label}
      <span className="num text-slate-400">({count})</span>
    </button>
  );
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
