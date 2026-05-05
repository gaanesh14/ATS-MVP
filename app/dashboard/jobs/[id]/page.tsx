'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  supabase,
  type Job,
  type Application,
  type JobQuestion,
  type Stage,
  type JobStage,
  type StageColor,
  type Interview,
} from '@/lib/supabase';
import { ScheduleInterviewDialog } from '@/components/interviews/schedule-dialog';
import {
  INTERVIEW_STATUS_LABEL,
  INTERVIEW_STATUS_TONE,
  formatInterviewDateTime,
  formatDuration,
  isUpcoming,
} from '@/lib/interviews';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { StagePill } from '@/components/ui/stage-pill';
import { AtsRing } from '@/components/ui/ats-ring';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import {
  getStagesForJob,
  CUSTOM_STAGE_COLORS,
  STAGE_TONES,
  BUILTIN_STAGE_IDS,
  slugStageId,
} from '@/lib/stages';
import { cn, formatDate, formatINR, formatExperienceRange, formatExperience } from '@/lib/utils';
import {
  Copy,
  Check,
  RefreshCw,
  Calendar,
  Briefcase,
  Users,
  IndianRupee,
  Building,
  Pencil,
  Sparkles,
  Search,
  Filter as FilterIcon,
  List as ListIcon,
  Columns,
  Trash2,
  AlertTriangle,
  Mail,
  Phone,
  MapPin,
  Clock,
  FileText,
  Download,
  XCircle,
  Globe,
  Plus,
  X,
  TrendingUp,
  UserPlus,
  ArrowUp,
  ArrowDown,
  Eye,
  Tag,
  CalendarClock,
  Video,
} from 'lucide-react';

type AnswerWithQuestion = {
  answer: string;
  job_questions: { question: string } | null;
};

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      )}
    >
      {children}
    </button>
  );
}

function BreakdownRow({
  label,
  score,
  weight,
  note,
}: {
  label: string;
  score: number;
  weight: number;
  note?: string;
}) {
  const pct = Math.max(0, Math.min(100, (score / weight) * 100));
  return (
    <div className="grid grid-cols-[110px_1fr_64px] items-center gap-2">
      <span className="text-slate-600">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="num text-right text-[12px] text-slate-500">
        {score}/{weight}
        {note ? ` · ${note}` : ''}
      </span>
    </div>
  );
}

function DataField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-[13.5px] font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function StatRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{k}</span>
      <span className="num font-semibold text-slate-900">{v}</span>
    </div>
  );
}

function isWithinDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const ms = Date.now() - new Date(iso).getTime();
  return ms <= days * 24 * 3600 * 1000;
}

// Small client-side keyword set for "Required skills" extraction in the Details tab.
// Mirrors what the parser uses; intentionally a focused list — extend as you like.
const CLIENT_TECH_KEYWORDS = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'sql',
  'react', 'vue', 'angular', 'next.js', 'redux', 'tailwind', 'css', 'html',
  'node', 'node.js', 'express', 'django', 'flask', 'graphql', 'rest',
  'postgres', 'postgresql', 'mysql', 'mongodb', 'redis',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
  'git', 'jira', 'figma', 'jest', 'storybook',
];

function extractSkills(text: string | null | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of CLIENT_TECH_KEYWORDS) {
    const escaped = kw.replace(/[.+*?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?:$|[^a-z0-9+#.])`, 'i');
    if (re.test(lower)) {
      // Capitalise nicely for display
      const display = kw === 'javascript' ? 'JavaScript'
        : kw === 'typescript' ? 'TypeScript'
        : kw === 'next.js' ? 'Next.js'
        : kw === 'node.js' || kw === 'node' ? 'Node.js'
        : kw === 'graphql' ? 'GraphQL'
        : kw === 'postgresql' || kw === 'postgres' ? 'PostgreSQL'
        : kw === 'mongodb' ? 'MongoDB'
        : kw === 'aws' || kw === 'gcp' ? kw.toUpperCase()
        : kw[0].toUpperCase() + kw.slice(1);
      if (!found.includes(display)) found.push(display);
    }
  }
  return found;
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
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-all',
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-800'
      )}
    >
      {label}
      <span className={cn('num', active ? 'text-slate-400' : 'text-slate-400')}>({count})</span>
    </button>
  );
}

function JobStatCard({
  tone,
  icon,
  label,
  value,
  delta,
}: {
  tone: 'teal' | 'blue' | 'amber' | 'violet';
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
}) {
  const tones: Record<typeof tone, string> = {
    teal: 'bg-brand-50 text-brand-600',
    blue: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
      <div
        className={cn(
          'grid h-12 w-12 flex-shrink-0 place-items-center rounded-xl',
          tones[tone]
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] text-slate-500">{label}</div>
        <div className="num mt-1 text-[26px] font-semibold leading-none tracking-tight text-slate-900">
          {value}
        </div>
        <div className="mt-1.5 text-[12px] font-medium text-slate-500">{delta}</div>
      </div>
    </div>
  );
}

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const { id: jobId } = params;
  const router = useRouter();
  const { role, member } = useAuth();
  const canEditJob = can(role, 'jobs.edit');
  const canDeleteJob = can(role, 'jobs.delete');
  const canMoveStage = can(role, 'applications.update');

  const [job, setJob] = useState<Job | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [tab, setTab] = useState<'details' | 'candidates' | 'comments'>('candidates');
  const [searchQuery, setSearchQuery] = useState('');

  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [stageTab, setStageTab] = useState<'all' | Stage>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filterMinExp, setFilterMinExp] = useState('');
  const [filterMaxExp, setFilterMaxExp] = useState('');
  const [filterMaxNotice, setFilterMaxNotice] = useState('');
  const [filterMaxSalary, setFilterMaxSalary] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSkill, setFilterSkill] = useState('');
  const [filterAtsOnly, setFilterAtsOnly] = useState(false);

  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [answers, setAnswers] = useState<AnswerWithQuestion[]>([]);
  const [questions, setQuestions] = useState<JobQuestion[]>([]);
  const [reparsing, setReparsing] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [candidateInterviews, setCandidateInterviews] = useState<Interview[]>([]);

  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState('');
  const [newStageColor, setNewStageColor] = useState<StageColor>(CUSTOM_STAGE_COLORS[0]);
  const [savingStage, setSavingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  // Candidates view UI state
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleCandidate(id: string) {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllCandidates() {
    setSelectedCandidates((prev) => {
      const all = candidatesPage.every((c) => prev.has(c.id));
      if (all) return new Set();
      return new Set(candidatesPage.map((c) => c.id));
    });
  }

  async function bulkMoveTo(stageId: Stage) {
    const ids = Array.from(selectedCandidates);
    if (ids.length === 0) return;
    // Optimistic local update so the UI feels instant
    setApps((prev) =>
      prev.map((a) => (selectedCandidates.has(a.id) ? { ...a, stage: stageId } : a))
    );
    setSelectedCandidates(new Set());
    // Fire requests in parallel; failures get logged. We refetch on first failure
    // to resync.
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/applications/${id}/stage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: stageId }),
        }).then((r) => r.ok)
      )
    );
    if (results.some((ok) => !ok)) {
      console.error('bulkMoveTo: some applications failed to move; refetching');
      await fetchAll();
    }
  }

  async function fetchAll() {
    setLoading(true);
    const [{ data: jobData }, { data: appsData }, { data: qData }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('applications').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
      supabase.from('job_questions').select('*').eq('job_id', jobId).order('display_order'),
    ]);
    setJob(jobData as Job | null);
    setApps((appsData as Application[]) ?? []);
    setQuestions((qData as JobQuestion[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchAll();
  }, [jobId]);

  const publicLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/careers/apply?jobId=${jobId}`;
  }, [jobId]);

  function handleCopy() {
    navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function resetFilters() {
    setStageTab('all');
    setFilterMinExp('');
    setFilterMaxExp('');
    setFilterMaxNotice('');
    setFilterMaxSalary('');
    setFilterLocation('');
    setFilterSkill('');
    setFilterAtsOnly(false);
  }

  const requiredSkills = useMemo(
    () => extractSkills(job?.description),
    [job?.description]
  );

  const quickStats = useMemo(() => {
    const today = apps.filter((a) => isWithinDays(a.created_at, 1)).length;
    const week = apps.filter((a) => isWithinDays(a.created_at, 7)).length;
    const highAts = apps.filter((a) => (a.ats_score ?? 0) >= 70).length;
    const hired = apps.filter((a) => a.stage === 'hired').length;
    return { today, week, highAts, hired };
  }, [apps]);

  const stages = useMemo(() => getStagesForJob(job), [job]);

  // Count how many parsed-data filters are currently set so the filter button
  // can show a badge — useful so users can see filters ARE applied even when
  // the sidebar is collapsed.
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filterMinExp.trim()) n++;
    if (filterMaxExp.trim()) n++;
    if (filterMaxNotice.trim()) n++;
    if (filterMaxSalary.trim()) n++;
    if (filterLocation.trim()) n++;
    if (filterSkill.trim()) n++;
    if (filterAtsOnly) n++;
    return n;
  }, [filterMinExp, filterMaxExp, filterMaxNotice, filterMaxSalary, filterLocation, filterSkill, filterAtsOnly]);

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = { all: apps.length };
    stages.forEach((s) => {
      c[s.id] = 0;
    });
    apps.forEach((a) => {
      const s = a.stage ?? 'new';
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [apps, stages]);

  const filteredUnsorted = useMemo(() => {
    // Coerce filter strings to numbers once (NaN means "no filter set").
    const minExp = filterMinExp.trim() === '' ? null : Number(filterMinExp);
    const maxExp = filterMaxExp.trim() === '' ? null : Number(filterMaxExp);
    const maxNotice = filterMaxNotice.trim() === '' ? null : Number(filterMaxNotice);
    const maxSalary = filterMaxSalary.trim() === '' ? null : Number(filterMaxSalary);
    const locationQ = filterLocation.trim().toLowerCase();
    const skillQ = filterSkill.trim().toLowerCase();

    return apps.filter((a) => {
      // Stage
      if (stageTab !== 'all' && (a.stage ?? 'new') !== stageTab) return false;

      // Search by name or email — always applies
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !a.full_name.toLowerCase().includes(q) &&
          !a.email.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      // ATS gate — applies to every row including unparsed
      if (filterAtsOnly && (a.ats_score ?? 0) < 70) return false;

      const p = a.parsed_data;

      // Strict semantics: when a parsed-data filter is set, candidates that
      // don't satisfy it — including those with missing data — are excluded.
      // (Previously these passed through, which is what made the filters
      // appear to "not apply".) Use the search box if you want to find
      // unparsed candidates.
      if (minExp != null && Number.isFinite(minExp)) {
        if (!p || p.experience_years == null || p.experience_years < minExp) return false;
      }
      if (maxExp != null && Number.isFinite(maxExp)) {
        if (!p || p.experience_years == null || p.experience_years > maxExp) return false;
      }
      if (maxNotice != null && Number.isFinite(maxNotice)) {
        if (!p || p.notice_period_days == null || p.notice_period_days > maxNotice) return false;
      }
      if (maxSalary != null && Number.isFinite(maxSalary)) {
        if (!p || p.expected_salary == null || p.expected_salary > maxSalary) return false;
      }
      if (locationQ) {
        if (!p || !p.location || !p.location.toLowerCase().includes(locationQ)) return false;
      }
      if (skillQ) {
        const skills = p?.skills ?? [];
        if (!skills.some((sk) => sk.toLowerCase().includes(skillQ))) return false;
      }
      return true;
    });
  }, [apps, stageTab, searchQuery, filterMinExp, filterMaxExp, filterMaxNotice, filterMaxSalary, filterLocation, filterSkill, filterAtsOnly]);

  // Default sort: highest ATS first (replaces the old sort button — recruiters
  // almost always want strongest matches first).
  const filtered = useMemo(() => {
    return [...filteredUnsorted].sort((a, b) => (b.ats_score ?? -1) - (a.ats_score ?? -1));
  }, [filteredUnsorted]);

  // Page sliced for the table view, sorted by user-controlled sortDir.
  const candidatesPage = useMemo(() => {
    const arr = [...filteredUnsorted];
    arr.sort((a, b) => {
      const aS = a.ats_score ?? -1;
      const bS = b.ats_score ?? -1;
      return sortDir === 'desc' ? bS - aS : aS - bS;
    });
    return arr.slice(0, 20);
  }, [filteredUnsorted, sortDir]);

  async function openApplicant(app: Application) {
    setSelectedApp(app);
    const { data } = await supabase
      .from('application_answers')
      .select('answer, job_questions(question)')
      .eq('application_id', app.id);
    setAnswers((data as unknown as AnswerWithQuestion[]) ?? []);
    refreshInterviews(app.id);
  }

  async function refreshInterviews(appId: string) {
    const { data } = await supabase
      .from('interviews')
      .select('*')
      .eq('application_id', appId)
      .order('scheduled_at', { ascending: true });
    setCandidateInterviews((data as Interview[]) ?? []);
  }

  async function deleteJob() {
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setDeleteError(err.error ?? `Delete failed: HTTP ${res.status}`);
      setDeleting(false);
      return;
    }
    router.push('/dashboard/jobs');
  }

  async function moveStage(appId: string, newStage: Stage) {
    // Snapshot for rollback if the API rejects
    const prevApps = apps;
    const prevSelected = selectedApp;

    // Optimistic update
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, stage: newStage } : a)));
    if (selectedApp?.id === appId) {
      setSelectedApp({ ...selectedApp, stage: newStage });
    }

    const res = await fetch(`/api/applications/${appId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    });

    if (!res.ok) {
      console.error('moveStage failed', await res.text());
      // Roll back optimistic update
      setApps(prevApps);
      setSelectedApp(prevSelected);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (data.autoClosedJob && job) {
      setJob({ ...job, status: 'closed' });
    }
  }

  async function addStage() {
    if (!job) return;
    const label = newStageLabel.trim();
    if (!label) {
      setStageError('Stage name is required.');
      return;
    }
    if (label.length > 30) {
      setStageError('Stage name must be 30 characters or fewer.');
      return;
    }
    const id = slugStageId(label);
    if (!id) {
      setStageError('Use letters or numbers in the stage name.');
      return;
    }
    if (BUILTIN_STAGE_IDS.includes(id)) {
      setStageError('That name conflicts with a built-in stage.');
      return;
    }
    const existing = job.extra_stages ?? [];
    if (existing.some((s) => s.id === id || s.label.toLowerCase() === label.toLowerCase())) {
      setStageError('A stage with that name already exists.');
      return;
    }

    setSavingStage(true);
    setStageError(null);
    const next: JobStage[] = [...existing, { id, label, color: newStageColor }];
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra_stages: next }),
    });
    setSavingStage(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStageError(err.error ?? `Failed: HTTP ${res.status}`);
      return;
    }
    setJob({ ...job, extra_stages: next });
    setNewStageLabel('');
    setNewStageColor(CUSTOM_STAGE_COLORS[0]);
    setShowAddStage(false);
  }

  async function removeStage(stageId: string) {
    if (!job) return;
    // Block removal if anyone is in this stage
    const inUse = apps.some((a) => a.stage === stageId);
    if (inUse) {
      setStageError('Move all candidates out of this stage before removing it.');
      return;
    }
    const next = (job.extra_stages ?? []).filter((s) => s.id !== stageId);
    setStageError(null);
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra_stages: next }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStageError(err.error ?? `Failed: HTTP ${res.status}`);
      return;
    }
    setJob({ ...job, extra_stages: next });
  }

  async function reparse(appId: string) {
    setReparsing(true);
    try {
      await fetch(`/api/applications/${appId}/parse`, { method: 'POST' });
      await fetchAll();
      const updated = apps.find((a) => a.id === appId);
      if (updated) setSelectedApp(updated);
    } finally {
      setReparsing(false);
    }
  }

  if (loading) {
    return <main className="container mx-auto px-4 py-12 text-muted-foreground">Loading…</main>;
  }
  if (!job) {
    return (
      <main className="container mx-auto px-4 py-12">
        <p className="text-destructive">Job not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard">← Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  const newApplicants = apps.filter((a) => isWithinDays(a.created_at, 7)).length;
  const shortlisted = apps.filter((a) => a.stage === 'shortlisted').length;
  const scoredApps = apps.filter((a) => a.ats_score != null);
  const avgAts = scoredApps.length
    ? Math.round(scoredApps.reduce((s, a) => s + (a.ats_score ?? 0), 0) / scoredApps.length)
    : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">
              {job.title}
            </h1>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
                job.status === 'open'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-slate-50 text-slate-700 ring-slate-200'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  job.status === 'open' ? 'bg-emerald-500' : 'bg-slate-400'
                )}
              />
              {job.status === 'open' ? 'Active' : 'Closed'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Posted on {formatDate(job.created_at)}
            </span>
            {job.location && (
              <>
                <span className="text-slate-300">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {job.location}
                </span>
              </>
            )}
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {formatExperienceRange(job.min_experience, job.max_experience)}
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5">
              <IndianRupee className="h-3.5 w-3.5" />
              {formatINR(job.min_salary)} – {formatINR(job.max_salary)}
            </span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {canEditJob && (
            <Button asChild className="bg-brand-500 hover:bg-brand-600">
              <Link href={`/dashboard/jobs/${jobId}/edit`}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Link>
            </Button>
          )}
          {canDeleteJob && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              title="Delete job"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Job stats row */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <JobStatCard
          tone="blue"
          icon={<Users className="h-5 w-5" />}
          label="Total Applicants"
          value={String(apps.length)}
          delta={`${apps.filter((a) => a.stage === 'hired').length} / ${
            job.vacancies ?? 1
          } hired`}
        />
        <JobStatCard
          tone="teal"
          icon={<TrendingUp className="h-5 w-5" />}
          label="Avg. ATS Score"
          value={avgAts != null ? String(avgAts) : '—'}
          delta={`${scoredApps.length} scored`}
        />
        <JobStatCard
          tone="amber"
          icon={<UserPlus className="h-5 w-5" />}
          label="New Applicants"
          value={String(newApplicants)}
          delta="last 7 days"
        />
        <JobStatCard
          tone="violet"
          icon={<FilterIcon className="h-5 w-5" />}
          label="Shortlisted"
          value={String(shortlisted)}
          delta="awaiting interview"
        />
      </div>

      {/* Tabs */}
      <div className="mt-7 flex items-center gap-7 border-b border-slate-100">
        <TabPill active={tab === 'candidates'} onClick={() => setTab('candidates')}>
          Candidates ({apps.length})
        </TabPill>
        <TabPill active={tab === 'details'} onClick={() => setTab('details')}>
          Details
        </TabPill>
        <TabPill active={tab === 'comments'} onClick={() => setTab('comments')}>
          Comments
        </TabPill>
      </div>

      {/* Details tab */}
      {tab === 'details' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Description */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-slate-900">Description</h3>
              </div>
              {job.description ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                  {job.description}
                </p>
              ) : (
                <p className="text-sm italic text-slate-400">
                  No description yet. Use the <strong>Edit</strong> button above to
                  add one.
                </p>
              )}
            </div>

            {/* Required skills */}
            {requiredSkills.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
                <h3 className="mb-4 text-[15px] font-semibold text-slate-900">Required skills</h3>
                <div className="flex flex-wrap gap-2">
                  {requiredSkills.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-400">
                  Auto-detected from the job description. Used when computing each candidate's matched score.
                </p>
              </div>
            )}

            {/* Screening Questions */}
            {questions.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
                <h3 className="mb-4 text-[15px] font-semibold text-slate-900">Screening Questions</h3>
                <div className="space-y-2.5">
                  {questions.map((q, i) => (
                    <div
                      key={q.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 p-3.5"
                    >
                      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-brand-50 text-[12px] font-bold text-brand-600">
                        Q{i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] text-slate-900">{q.question}</div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                            {q.question_type === 'yesno' ? 'Yes/No' : q.question_type === 'number' ? 'Number' : 'Text'}
                          </span>
                          {q.is_required && (
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600 ring-1 ring-brand-200">
                              Required
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Public apply link + Quick stats */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
              <h3 className="mb-3 text-[15px] font-semibold text-slate-900">Public apply link</h3>
              <div className="flex gap-2">
                <Input value={publicLink} readOnly className="bg-slate-50 text-[13px] text-slate-700" />
                <Button onClick={handleCopy} variant="outline" size="icon">
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-3 text-[12px] text-slate-500">
                Append{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">?source=linkedin</code>{' '}
                (or naukri/indeed/whatsapp) to track sources.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
              <h3 className="mb-4 text-[15px] font-semibold text-slate-900">Quick stats</h3>
              <div className="space-y-3 text-[13px]">
                <StatRow k="Applications today" v={String(quickStats.today)} />
                <StatRow k="This week" v={String(quickStats.week)} />
                <StatRow k="With ATS ≥ 70" v={String(quickStats.highAts)} />
                <StatRow k="Hired" v={String(quickStats.hired)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comments tab */}
      {tab === 'comments' && (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-card">
          Comments are coming soon. For now, share notes via your team chat.
        </div>
      )}

      {/* Candidates tab */}
      {tab === 'candidates' && (
        <div className="mt-5">
          {/* Stage tabs row (with custom stages + Add) */}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 no-scrollbar">
            <StageTab
              active={stageTab === 'all'}
              onClick={() => setStageTab('all')}
              label="All"
              count={stageCounts.all ?? 0}
            />
            {stages.map((s) => (
              <StageTab
                key={s.id}
                active={stageTab === s.id}
                onClick={() => setStageTab(s.id)}
                label={s.label}
                count={stageCounts[s.id] ?? 0}
              />
            ))}
            <button
              onClick={() => setShowAddStage(true)}
              title="Add custom stage"
              className="ml-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-brand-600 hover:shadow-sm"
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Toolbar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {/* Left: List / Kanban as text buttons */}
            <div className="inline-flex items-center gap-2">
              <ViewToggleButton
                active={view === 'list'}
                onClick={() => setView('list')}
                icon={<ListIcon className="h-4 w-4" />}
                label="List View"
              />
              <ViewToggleButton
                active={view === 'kanban'}
                onClick={() => setView('kanban')}
                icon={<Columns className="h-4 w-4" />}
                label="Kanban View"
              />
            </div>
            {/* Right: search + filter popover + sort */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, skill or email…"
                  className="pl-9"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowFilterPopover((s) => !s)}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[13.5px] font-medium transition-colors',
                    showFilterPopover || activeFilterCount > 0
                      ? 'border-brand-200 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                  type="button"
                >
                  <FilterIcon className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="num grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                {showFilterPopover && (
                  <FilterPopover
                    onClose={() => setShowFilterPopover(false)}
                    state={{
                      filterMinExp,
                      filterMaxExp,
                      filterMaxNotice,
                      filterMaxSalary,
                      filterLocation,
                      filterSkill,
                      filterAtsOnly,
                    }}
                    setters={{
                      setFilterMinExp,
                      setFilterMaxExp,
                      setFilterMaxNotice,
                      setFilterMaxSalary,
                      setFilterLocation,
                      setFilterSkill,
                      setFilterAtsOnly,
                    }}
                    onReset={resetFilters}
                  />
                )}
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
          </div>

          {/* Active filter summary line (only when filters are applied) */}
          {(activeFilterCount > 0 || stageTab !== 'all' || searchQuery.trim()) && (
            <div className="mt-3 flex items-center justify-between text-[12.5px]">
              <span className="text-slate-500">
                <span className="num font-medium text-slate-700">{filtered.length}</span>{' '}
                of <span className="num">{apps.length}</span> shown
                {activeFilterCount > 0 && (
                  <>
                    {' '}·{' '}
                    <span className="num font-medium text-brand-600">
                      {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} active
                    </span>
                  </>
                )}
              </span>
              {(activeFilterCount > 0 || stageTab !== 'all' || searchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    resetFilters();
                    setSearchQuery('');
                  }}
                  className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {view === 'kanban' ? (
            <div className="mt-4">
              <KanbanBoard
                candidates={filtered}
                stages={stages}
                onMove={moveStage}
                onOpen={openApplicant}
                onAddStage={() => setShowAddStage(true)}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-card">
              <p className="text-[14px] font-medium text-slate-700">
                {apps.length === 0
                  ? 'No applicants yet for this job.'
                  : activeFilterCount > 0 || stageTab !== 'all' || searchQuery.trim()
                  ? 'No candidates match your filters.'
                  : 'No applicants in this view.'}
              </p>
              {(activeFilterCount > 0 || stageTab !== 'all' || searchQuery.trim()) &&
                apps.length > 0 && (
                  <>
                    <p className="mt-1 text-[12.5px] text-slate-500">
                      Note: candidates whose resume hasn&apos;t been parsed yet are
                      hidden when any data-driven filter is set.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        resetFilters();
                        setSearchQuery('');
                      }}
                      className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      Clear all filters
                    </button>
                  </>
                )}
            </div>
          ) : (
            <CandidatesTable
              rows={candidatesPage}
              sortDir={sortDir}
              onSortToggle={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
              selected={selectedCandidates}
              toggleSel={toggleCandidate}
              toggleAll={toggleAllCandidates}
              onOpen={openApplicant}
              jobForStages={job}
            />
          )}

          {/* Bulk actions bar — fixed-positioned so the table doesn't shift
              when the bar appears after the first checkbox click. */}
          {view === 'list' && canMoveStage && selectedCandidates.size > 0 && (
            <div className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex justify-center sm:inset-x-6">
              <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-lift">
                <div className="text-sm">
                  <span className="num font-semibold">{selectedCandidates.size}</span>{' '}
                  candidate{selectedCandidates.size > 1 ? 's' : ''} selected
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => bulkMoveTo('shortlisted')}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/15"
                >
                  Move to Shortlisted
                </button>
                <button
                  type="button"
                  onClick={() => bulkMoveTo('interview')}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/15"
                >
                  Move to Interview
                </button>
                <button
                  type="button"
                  onClick={() => bulkMoveTo('rejected')}
                  className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium hover:bg-rose-600"
                >
                  Reject all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCandidates(new Set())}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-white/10"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={(o) => {
          if (!o) {
            setShowDeleteConfirm(false);
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
          <p className="text-sm text-slate-600">
            <strong className="text-slate-900">{job.title}</strong> and all{' '}
            <span className="num">{apps.length}</span> applicant
            {apps.length === 1 ? '' : 's'} will be permanently removed. This cannot be undone.
          </p>
          {deleteError && (
            <p className="text-sm text-rose-600">{deleteError}</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={deleteJob}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting ? 'Deleting…' : 'Delete job'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add custom stage */}
      <Dialog
        open={showAddStage}
        onOpenChange={(o) => {
          if (!o) {
            setShowAddStage(false);
            setStageError(null);
            setNewStageLabel('');
            setNewStageColor(CUSTOM_STAGE_COLORS[0]);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Plus className="h-5 w-5" />
            </div>
            <DialogTitle>Add a pipeline stage</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">
            Custom stages slot between <strong>Interview</strong> and{' '}
            <strong>Hired</strong>. They&apos;re scoped to this job only.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="stage-label" className="text-xs text-slate-500">
                Stage name
              </Label>
              <Input
                id="stage-label"
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                placeholder="e.g. Tech screen"
                maxLength={30}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !savingStage) addStage();
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Color</Label>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {CUSTOM_STAGE_COLORS.map((c) => {
                  const tone = STAGE_TONES[c];
                  const active = c === newStageColor;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewStageColor(c)}
                      title={c}
                      aria-label={`${c} color`}
                      aria-pressed={active}
                      className={cn(
                        'group flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors',
                        active ? 'bg-slate-100' : 'hover:bg-slate-50'
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-8 w-8 place-items-center rounded-full ring-2 ring-offset-2 transition-all',
                          tone.dot,
                          active
                            ? 'ring-slate-900'
                            : 'ring-transparent group-hover:ring-slate-300'
                        )}
                      >
                        {active && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                      <span
                        className={cn(
                          'text-[10.5px] font-medium capitalize',
                          active ? 'text-slate-900' : 'text-slate-500'
                        )}
                      >
                        {c}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Existing custom stages — let admin remove empty ones */}
            {(job.extra_stages?.length ?? 0) > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Custom stages on this job
                </p>
                <div className="space-y-1.5">
                  {(job.extra_stages ?? []).map((s) => {
                    const tone = STAGE_TONES[s.color];
                    const inUse = apps.some((a) => a.stage === s.id);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5"
                      >
                        <span className="inline-flex items-center gap-2 text-[13px] text-slate-700">
                          <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
                          {s.label}
                          {inUse && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                              in use
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeStage(s.id)}
                          disabled={inUse}
                          title={
                            inUse
                              ? 'Move all candidates out of this stage to remove it'
                              : 'Remove this stage'
                          }
                          className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {stageError && <p className="text-sm text-rose-600">{stageError}</p>}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowAddStage(false)}
              disabled={savingStage}
            >
              Cancel
            </Button>
            <Button
              onClick={addStage}
              disabled={savingStage || !newStageLabel.trim()}
              className="bg-brand-500 hover:bg-brand-600"
            >
              {savingStage ? 'Saving…' : 'Add stage'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedApp} onOpenChange={(o) => !o && setSelectedApp(null)}>
        <DialogContent className="max-w-5xl gap-0 p-0">
          {selectedApp && (() => {
            const stage = (selectedApp.stage ?? 'new') as Stage;
            const isFailed = selectedApp.parse_status === 'failed';
            const isPending =
              !isFailed &&
              !selectedApp.parsed_data &&
              selectedApp.parse_status !== 'parsed';
            const initials = selectedApp.full_name
              .split(' ')
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase();
            const score = selectedApp.ats_score;
            const scoreTone =
              score == null
                ? 'text-slate-400 ring-slate-200'
                : score >= 70
                ? 'text-emerald-600 ring-emerald-200'
                : score >= 40
                ? 'text-amber-600 ring-amber-200'
                : 'text-rose-600 ring-rose-200';

            return (
              <>
                {/* Header — gradient surface, larger candidate identity */}
                <DialogHeader className="space-y-0 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-6 pb-5 pt-6">
                  <div className="flex items-start justify-between gap-4 pr-8">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-base font-semibold text-white shadow-sm">
                        {initials || '?'}
                      </div>
                      <div className="min-w-0">
                        <DialogTitle className="truncate text-[20px] font-semibold text-slate-900">
                          {selectedApp.full_name}
                        </DialogTitle>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            <a
                              href={`mailto:${selectedApp.email}`}
                              className="hover:text-brand-600 hover:underline"
                            >
                              {selectedApp.email}
                            </a>
                          </span>
                          {selectedApp.phone && (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              <a
                                href={`tel:${selectedApp.phone}`}
                                className="hover:text-brand-600 hover:underline"
                              >
                                {selectedApp.phone}
                              </a>
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5 text-slate-400" />
                            via {selectedApp.source.replace('_', ' ')}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            Applied {formatDate(selectedApp.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {can(role, 'interviews.schedule') && (
                        <button
                          type="button"
                          onClick={() => setShowSchedule(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                          Schedule interview
                        </button>
                      )}
                      <StagePill stage={stage} job={job} />
                    </div>
                  </div>

                  {/* Stage move — segmented pills, current stage highlighted with stage color.
                      Custom stages render between Interview and Hired. */}
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Move to stage
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAddStage(true)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-600"
                      >
                        <Plus className="h-3 w-3" />
                        Add stage
                      </button>
                    </div>
                    <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                      {stages.map((s) => {
                        const active = stage === s.id;
                        const tone = STAGE_TONES[s.color];
                        return (
                          <button
                            key={s.id}
                            onClick={() => moveStage(selectedApp.id, s.id)}
                            disabled={active}
                            className={cn(
                              'rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all',
                              active
                                ? cn('cursor-default ring-1', tone.pill)
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            )}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </DialogHeader>

                {/* Body */}
                <div className="grid gap-6 px-6 py-6 md:grid-cols-[1.1fr_1fr]">
                  {/* Resume column */}
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold text-slate-900">
                        <FileText className="h-4 w-4 text-slate-400" />
                        Resume
                      </h3>
                      {selectedApp.resume_url && (
                        <a
                          href={selectedApp.resume_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      )}
                    </div>
                    {selectedApp.resume_url ? (
                      <iframe
                        src={selectedApp.resume_url}
                        className="h-[560px] w-full rounded-xl border border-slate-200 bg-white"
                        title="Resume"
                      />
                    ) : (
                      <div className="grid h-[560px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 text-sm text-slate-400">
                        No resume uploaded
                      </div>
                    )}
                  </div>

                  {/* Score + parsed data column */}
                  <div className="min-w-0 space-y-4">
                    {/* Score card */}
                    <div
                      className={cn(
                        'rounded-2xl border p-4',
                        isFailed
                          ? 'border-rose-100 bg-rose-50/40'
                          : isPending
                          ? 'border-amber-100 bg-amber-50/40'
                          : 'border-slate-200 bg-white'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            ATS Score
                          </p>
                          <div className="mt-2 flex items-baseline gap-2">
                            {isFailed ? (
                              <span className="inline-flex items-center gap-2 text-[28px] font-semibold leading-none text-rose-600">
                                <XCircle className="h-7 w-7" />
                                Failed
                              </span>
                            ) : isPending ? (
                              <span className="inline-flex items-center gap-2 text-[22px] font-semibold leading-none text-amber-600">
                                <Clock className="h-5 w-5 animate-pulse" />
                                Parsing…
                              </span>
                            ) : (
                              <>
                                <span
                                  className={cn(
                                    'num text-[40px] font-semibold leading-none',
                                    score == null
                                      ? 'text-slate-400'
                                      : score >= 70
                                      ? 'text-emerald-600'
                                      : score >= 40
                                      ? 'text-amber-600'
                                      : 'text-rose-600'
                                  )}
                                >
                                  {score ?? '—'}
                                </span>
                                <span className="text-sm text-slate-500">/ 100</span>
                              </>
                            )}
                          </div>
                          {!isFailed && !isPending && score != null && (
                            <span
                              className={cn(
                                'mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
                                scoreTone,
                                'bg-white'
                              )}
                            >
                              {score >= 70
                                ? 'Strong match'
                                : score >= 40
                                ? 'Moderate match'
                                : 'Weak match'}
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reparse(selectedApp.id)}
                          disabled={reparsing}
                        >
                          <RefreshCw
                            className={cn(
                              'mr-1.5 h-3.5 w-3.5',
                              reparsing && 'animate-spin'
                            )}
                          />
                          Re-parse
                        </Button>
                      </div>

                      {/* Failure / pending explanation */}
                      {isFailed && (
                        <div className="mt-3 rounded-lg border border-rose-100 bg-white p-3 text-[13px] leading-relaxed text-slate-700">
                          <p className="font-medium text-rose-700">
                            Resume couldn&apos;t be parsed.
                          </p>
                          {selectedApp.ats_issues &&
                          selectedApp.ats_issues.length > 0 ? (
                            <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
                              {selectedApp.ats_issues.map((iss, i) => (
                                <li key={i}>{iss}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-slate-600">
                              The file may be corrupt, scanned-image-only, or in an
                              unsupported format. Try Re-parse, or ask the candidate
                              to re-upload.
                            </p>
                          )}
                        </div>
                      )}

                      {isPending && (
                        <p className="mt-3 text-[13px] text-slate-600">
                          Parsing typically takes 10–30 seconds. Try Re-parse if it
                          stays in this state.
                        </p>
                      )}

                      {/* Match summary */}
                      {!isFailed && selectedApp.match_summary && (
                        <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-700">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-600" />
                            <span>{selectedApp.match_summary}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Skills matched / missing */}
                    {!isFailed &&
                      ((selectedApp.matched_skills?.length ?? 0) +
                        (selectedApp.missing_skills?.length ?? 0) >
                        0) && (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Skills
                          </p>
                          <div className="mt-2 space-y-2.5">
                            {selectedApp.matched_skills &&
                              selectedApp.matched_skills.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                    Matched ({selectedApp.matched_skills.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedApp.matched_skills.map((s) => (
                                      <span
                                        key={s}
                                        className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                                      >
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            {selectedApp.missing_skills &&
                              selectedApp.missing_skills.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                                    Missing ({selectedApp.missing_skills.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedApp.missing_skills.map((s) => (
                                      <span
                                        key={s}
                                        className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200"
                                      >
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      )}

                    {/* Score breakdown */}
                    {!isFailed && selectedApp.score_breakdown && (
                      <details className="group rounded-2xl border border-slate-200 bg-white p-4 open:pb-3">
                        <summary className="flex cursor-pointer items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500 marker:hidden">
                          Score breakdown
                          <span className="text-slate-400 transition-transform group-open:rotate-180">
                            ▾
                          </span>
                        </summary>
                        <div className="mt-3 space-y-2 text-[13px]">
                          {selectedApp.score_breakdown.skill_overlap && (
                            <BreakdownRow
                              label="Skills"
                              score={selectedApp.score_breakdown.skill_overlap.score}
                              weight={selectedApp.score_breakdown.skill_overlap.weight}
                              note={`${selectedApp.score_breakdown.skill_overlap.matched}/${selectedApp.score_breakdown.skill_overlap.required}`}
                            />
                          )}
                          {selectedApp.score_breakdown.semantic && (
                            <BreakdownRow
                              label="Semantic"
                              score={selectedApp.score_breakdown.semantic.score}
                              weight={selectedApp.score_breakdown.semantic.weight}
                              note={`cos ${selectedApp.score_breakdown.semantic.cosine}`}
                            />
                          )}
                          {selectedApp.score_breakdown.experience && (
                            <BreakdownRow
                              label="Experience"
                              score={selectedApp.score_breakdown.experience.score}
                              weight={selectedApp.score_breakdown.experience.weight}
                              note={
                                selectedApp.score_breakdown.experience.actual != null
                                  ? `${selectedApp.score_breakdown.experience.actual}y vs ${selectedApp.score_breakdown.experience.required ?? '—'}y`
                                  : '—'
                              }
                            />
                          )}
                          {selectedApp.score_breakdown.title && (
                            <BreakdownRow
                              label="Title"
                              score={selectedApp.score_breakdown.title.score}
                              weight={selectedApp.score_breakdown.title.weight}
                              note={
                                selectedApp.score_breakdown.title.matched
                                  ? 'match'
                                  : 'mismatch'
                              }
                            />
                          )}
                          {selectedApp.score_breakdown.education && (
                            <BreakdownRow
                              label="Education"
                              score={selectedApp.score_breakdown.education.score}
                              weight={selectedApp.score_breakdown.education.weight}
                              note={selectedApp.score_breakdown.education.matched}
                            />
                          )}
                          {selectedApp.score_breakdown.recency && (
                            <BreakdownRow
                              label="Recency"
                              score={selectedApp.score_breakdown.recency.score}
                              weight={selectedApp.score_breakdown.recency.weight}
                              note={
                                selectedApp.score_breakdown.recency.fresh
                                  ? 'fresh'
                                  : 'stale'
                              }
                            />
                          )}
                        </div>
                      </details>
                    )}

                    {/* Parsed data — only when we have it */}
                    {!isFailed && selectedApp.parsed_data && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Parsed data
                        </p>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                          <DataField
                            icon={<Briefcase className="h-3.5 w-3.5" />}
                            label="Experience"
                            value={
                              selectedApp.parsed_data.experience_years != null
                                ? `${selectedApp.parsed_data.experience_years} yrs`
                                : '—'
                            }
                          />
                          <DataField
                            icon={<Building className="h-3.5 w-3.5" />}
                            label="Current company"
                            value={selectedApp.parsed_data.current_company ?? '—'}
                          />
                          <DataField
                            icon={<Briefcase className="h-3.5 w-3.5" />}
                            label="Current role"
                            value={selectedApp.parsed_data.current_role ?? '—'}
                          />
                          <DataField
                            icon={<MapPin className="h-3.5 w-3.5" />}
                            label="Location"
                            value={selectedApp.parsed_data.location ?? '—'}
                          />
                          <DataField
                            icon={<Clock className="h-3.5 w-3.5" />}
                            label="Notice period"
                            value={
                              selectedApp.parsed_data.notice_period_days != null
                                ? `${selectedApp.parsed_data.notice_period_days} days`
                                : '—'
                            }
                          />
                          <DataField
                            icon={<IndianRupee className="h-3.5 w-3.5" />}
                            label="Current salary"
                            value={formatINR(selectedApp.parsed_data.current_salary)}
                          />
                          <DataField
                            icon={<IndianRupee className="h-3.5 w-3.5" />}
                            label="Expected salary"
                            value={formatINR(selectedApp.parsed_data.expected_salary)}
                          />
                        </dl>
                        {selectedApp.parsed_data.skills?.length ? (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Skills
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedApp.parsed_data.skills.map((s, i) => (
                                <Badge key={i} variant="secondary">
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {!isFailed && isPending && (
                      <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-4 text-[13px] text-amber-800">
                        Parsed data not yet available.
                      </div>
                    )}
                  </div>
                </div>

                {/* Interviews */}
                {candidateInterviews.length > 0 && (
                  <div className="border-t border-slate-100 px-6 py-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="inline-flex items-center gap-2 text-[14px] font-semibold text-slate-900">
                        <CalendarClock className="h-4 w-4 text-slate-400" />
                        Interviews
                      </h3>
                      <span className="text-[11.5px] text-slate-500">
                        {candidateInterviews.filter(isUpcoming).length} upcoming
                      </span>
                    </div>
                    <div className="space-y-2">
                      {candidateInterviews.map((iv) => {
                        const tone = INTERVIEW_STATUS_TONE[iv.status];
                        return (
                          <div
                            key={iv.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                                <CalendarClock className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-[13px] font-semibold text-slate-900">
                                  {formatInterviewDateTime(iv.scheduled_at, iv.timezone)}
                                </div>
                                <div className="text-[11.5px] text-slate-500">
                                  {formatDuration(iv.duration_minutes)}
                                  {iv.participants.length > 0 &&
                                    ` · ${iv.participants.length} interviewer${iv.participants.length > 1 ? 's' : ''}`}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {iv.meeting_link && iv.status === 'scheduled' && (
                                <a
                                  href={iv.meeting_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-medium text-brand-600 hover:border-brand-200 hover:bg-brand-50/40"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  Join
                                </a>
                              )}
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1',
                                  tone.pill
                                )}
                              >
                                <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                                {INTERVIEW_STATUS_LABEL[iv.status]}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Screening answers */}
                {answers.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-5">
                    <h3 className="mb-3 text-[14px] font-semibold text-slate-900">
                      Screening answers
                    </h3>
                    <div className="grid gap-2.5 md:grid-cols-2">
                      {answers.map((a, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-slate-200 bg-white p-3.5"
                        >
                          <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
                            Q{i + 1}
                          </p>
                          <p className="mt-1 text-[13.5px] font-medium text-slate-900">
                            {a.job_questions?.question ?? '(question missing)'}
                          </p>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
                            {a.answer || <span className="italic text-slate-400">No answer</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Schedule interview dialog — opens from the candidate dialog header */}
      {selectedApp && (
        <ScheduleInterviewDialog
          open={showSchedule}
          onOpenChange={setShowSchedule}
          applicationId={selectedApp.id}
          candidateName={selectedApp.full_name}
          candidateEmail={selectedApp.email}
          jobTitle={job?.title ?? ''}
          scheduledById={member?.id ?? null}
          onSaved={() => {
            setShowSchedule(false);
            refreshInterviews(selectedApp.id);
          }}
        />
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Candidates table — separate component so the parent stays readable.
// ──────────────────────────────────────────────────────────────────────────
function CandidatesTable({
  rows,
  sortDir,
  onSortToggle,
  selected,
  toggleSel,
  toggleAll,
  onOpen,
  jobForStages,
}: {
  rows: Application[];
  sortDir: 'asc' | 'desc';
  onSortToggle: () => void;
  selected: Set<string>;
  toggleSel: (id: string) => void;
  toggleAll: () => void;
  onOpen: (a: Application) => void;
  jobForStages: Job | null;
}) {
  const allChecked = rows.length > 0 && rows.every((c) => selected.has(c.id));
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="w-10 py-3 pl-5 pr-2">
                <CheckboxBox checked={allChecked} onChange={toggleAll} />
              </th>
              <th className="px-3 py-3 text-left">Candidate</th>
              <th className="w-28 px-3 py-3 text-left">Experience</th>
              <th className="w-32 px-3 py-3 text-left">Location</th>
              <th className="w-32 px-3 py-3 text-left">
                <button
                  type="button"
                  onClick={onSortToggle}
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
              <th className="w-32 px-3 py-3 text-left">Applied on</th>
              <th className="w-24 px-3 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((a) => {
              const isFailed = a.parse_status === 'failed';
              const isPending =
                !isFailed && !a.parsed_data && a.parse_status !== 'parsed';
              const stage = a.stage ?? 'new';
              const appliedDays = daysAgo(a.created_at);
              return (
                <tr
                  key={a.id}
                  onClick={() => onOpen(a)}
                  className={cn(
                    'group cursor-pointer transition-colors hover:bg-slate-50/60',
                    selected.has(a.id) && 'bg-brand-50/40'
                  )}
                >
                  <td
                    className="py-4 pl-5 pr-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CheckboxBox
                      checked={selected.has(a.id)}
                      onChange={() => toggleSel(a.id)}
                    />
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                        {initialsOf(a.full_name)}
                      </div>
                      <div className="leading-tight">
                        <div className="font-medium text-slate-900">{a.full_name}</div>
                        <div className="text-[12px] text-slate-500">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num px-3 py-4 text-slate-700">
                    {formatExperience(a.parsed_data?.experience_years)}
                  </td>
                  <td className="px-3 py-4 text-slate-700">
                    {a.parsed_data?.location ?? '—'}
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
                    <StagePill stage={stage} job={jobForStages} />
                  </td>
                  <td className="px-3 py-4">
                    <div className="leading-tight">
                      <div className="text-slate-700">{formatDate(a.created_at)}</div>
                      <div className="text-[11.5px] text-slate-400">
                        {appliedDays === 0 ? 'today' : `${appliedDays}d ago`}
                      </div>
                    </div>
                  </td>
                  <td
                    className="px-3 py-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Quick view"
                        onClick={() => onOpen(a)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckboxBox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] border transition-colors',
        checked
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-slate-300 bg-white hover:border-slate-400'
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

function ViewToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[13.5px] font-medium transition-colors',
        active
          ? 'border-brand-200 bg-brand-50 text-brand-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterPopover({
  onClose,
  state,
  setters,
  onReset,
}: {
  onClose: () => void;
  state: {
    filterMinExp: string;
    filterMaxExp: string;
    filterMaxNotice: string;
    filterMaxSalary: string;
    filterLocation: string;
    filterSkill: string;
    filterAtsOnly: boolean;
  };
  setters: {
    setFilterMinExp: (v: string) => void;
    setFilterMaxExp: (v: string) => void;
    setFilterMaxNotice: (v: string) => void;
    setFilterMaxSalary: (v: string) => void;
    setFilterLocation: (v: string) => void;
    setFilterSkill: (v: string) => void;
    setFilterAtsOnly: (v: boolean) => void;
  };
  onReset: () => void;
}) {
  return (
    <>
      {/* backdrop to close on outside click */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-11 z-40 w-[360px] rounded-xl border border-slate-200 bg-white p-4 shadow-lift">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Filters</h4>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FilterField label="Min Experience">
            <Input
              type="number"
              placeholder="0"
              value={state.filterMinExp}
              onChange={(e) => setters.setFilterMinExp(e.target.value)}
            />
          </FilterField>
          <FilterField label="Max Experience">
            <Input
              type="number"
              placeholder="10"
              value={state.filterMaxExp}
              onChange={(e) => setters.setFilterMaxExp(e.target.value)}
            />
          </FilterField>
          <FilterField label="Max Notice (days)">
            <Input
              type="number"
              placeholder="60"
              value={state.filterMaxNotice}
              onChange={(e) => setters.setFilterMaxNotice(e.target.value)}
            />
          </FilterField>
          <FilterField label="Max Salary (INR)">
            <Input
              type="number"
              placeholder="2500000"
              value={state.filterMaxSalary}
              onChange={(e) => setters.setFilterMaxSalary(e.target.value)}
            />
          </FilterField>
          <div className="col-span-2">
            <FilterField label="Location">
              <Input
                placeholder="e.g. Bangalore"
                value={state.filterLocation}
                onChange={(e) => setters.setFilterLocation(e.target.value)}
              />
            </FilterField>
          </div>
          <div className="col-span-2">
            <FilterField label="Skill keyword">
              <Input
                placeholder="e.g. React"
                value={state.filterSkill}
                onChange={(e) => setters.setFilterSkill(e.target.value)}
              />
            </FilterField>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-sm text-slate-700">ATS-Compliant Only (≥ 70)</span>
          <button
            type="button"
            onClick={() => setters.setFilterAtsOnly(!state.filterAtsOnly)}
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors',
              state.filterAtsOnly ? 'bg-brand-500' : 'bg-slate-300'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                state.filterAtsOnly ? 'left-[18px]' : 'left-0.5'
              )}
            />
          </button>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset
          </Button>
          <Button
            size="sm"
            onClick={onClose}
            className="bg-brand-500 hover:bg-brand-600"
          >
            Apply
          </Button>
        </div>
      </div>
    </>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[12px] text-slate-500">{label}</div>
      {children}
    </div>
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

function daysAgo(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 3600 * 1000)));
}
