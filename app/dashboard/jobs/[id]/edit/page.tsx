'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, type Job } from '@/lib/supabase';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Briefcase,
  IndianRupee,
  AlertCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EditJobPage({ params }: { params: { id: string } }) {
  const { id: jobId } = params;
  const router = useRouter();
  const { role, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Bounce recruiters back to the job detail — they can read but not modify.
  useEffect(() => {
    if (!authLoading && role && !can(role, 'jobs.edit')) {
      router.replace(`/dashboard/jobs/${jobId}`);
    }
  }, [authLoading, role, router, jobId]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [minSalary, setMinSalary] = useState('');
  const [maxSalary, setMaxSalary] = useState('');
  const [vacancies, setVacancies] = useState('1');
  const [status, setStatus] = useState<'open' | 'closed'>('open');

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      const job = data as Job | null;
      if (!job) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTitle(job.title);
      setDescription(job.description ?? '');
      setLocation(job.location ?? '');
      // Show min as blank if it's the schema default 0; users can re-enter if needed.
      setMinExp(job.min_experience && job.min_experience > 0 ? String(job.min_experience) : '');
      // Show max as blank if it's the "no upper bound" sentinel (>= 50).
      setMaxExp(job.max_experience && job.max_experience < 50 ? String(job.max_experience) : '');
      setMinSalary(job.min_salary != null ? String(job.min_salary) : '');
      setMaxSalary(job.max_salary != null ? String(job.max_salary) : '');
      setVacancies(String(job.vacancies ?? 1));
      setStatus(job.status === 'closed' ? 'closed' : 'open');
      setLoading(false);
    }
    load();
  }, [jobId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);

    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        min_experience: Number(minExp) || 0,
        max_experience: Number(maxExp) || 100,
        min_salary: minSalary ? Number(minSalary) : null,
        max_salary: maxSalary ? Number(maxSalary) : null,
        vacancies: Math.max(1, Number(vacancies) || 1),
        status,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? `Save failed: HTTP ${res.status}`);
      setSubmitting(false);
      return;
    }
    router.push(`/dashboard/jobs/${jobId}`);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-8 py-12 text-sm text-slate-500">Loading…</main>
    );
  }
  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-8 py-12">
        <p className="text-rose-600">Job not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/jobs">← Back to jobs</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-8 py-6">
      <Link
        href={`/dashboard/jobs/${jobId}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to job
      </Link>

      <div className="mt-3">
        <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">Edit job</h1>
        <p className="mt-1 text-[14px] text-slate-500">
          Update fields below and save. Changes apply immediately.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <FormSection
          icon={<Briefcase className="h-4 w-4" />}
          title="Basic details"
          description="Job title, description, and location."
        >
          <Field id="title" label="Title" required>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Field>
          <Field
            id="description"
            label="Description"
            hint="Used to extract required skills for ATS scoring."
          >
            <Textarea
              id="description"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field id="location" label="Location">
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Bangalore, Remote, Hybrid"
            />
          </Field>
        </FormSection>

        <FormSection
          icon={<IndianRupee className="h-4 w-4" />}
          title="Experience & compensation"
          description="Optional ranges. Leave blank for no upper bound."
        >
          <div className="grid grid-cols-2 gap-4">
            <Field id="min-exp" label="Min experience" suffix="yrs">
              <Input
                id="min-exp"
                type="number"
                step="0.5"
                min="0"
                value={minExp}
                onChange={(e) => setMinExp(e.target.value)}
                placeholder="e.g. 2"
              />
            </Field>
            <Field id="max-exp" label="Max experience" suffix="yrs">
              <Input
                id="max-exp"
                type="number"
                step="0.5"
                min="0"
                value={maxExp}
                onChange={(e) => setMaxExp(e.target.value)}
                placeholder="No limit"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field id="min-sal" label="Min salary" suffix="INR / yr">
              <Input
                id="min-sal"
                type="number"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
              />
            </Field>
            <Field id="max-sal" label="Max salary" suffix="INR / yr">
              <Input
                id="max-sal"
                type="number"
                value={maxSalary}
                onChange={(e) => setMaxSalary(e.target.value)}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          icon={<SettingsIcon className="h-4 w-4" />}
          title="Status & openings"
          description="Hiring capacity and visibility on the public careers page."
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              id="vacancies"
              label="Number of openings"
              hint="Job auto-closes once this many candidates are marked Hired."
            >
              <Input
                id="vacancies"
                type="number"
                min="1"
                value={vacancies}
                onChange={(e) => setVacancies(e.target.value)}
              />
            </Field>
            <Field id="status" label="Status">
              <div className="inline-flex w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <StatusToggle
                  active={status === 'open'}
                  onClick={() => setStatus('open')}
                  tone="emerald"
                  label="Open"
                />
                <StatusToggle
                  active={status === 'closed'}
                  onClick={() => setStatus('closed')}
                  tone="slate"
                  label="Closed"
                />
              </div>
            </Field>
          </div>
        </FormSection>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-[13px] text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-card">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !title.trim()}
            className="bg-brand-500 hover:bg-brand-600"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </main>
  );
}

function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-card">
      <header className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          {icon}
        </div>
        <div className="leading-tight">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12.5px] text-slate-500">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-4 px-6 py-5">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  suffix,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <Label htmlFor={id} className="text-[13px] font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </Label>
        {suffix && (
          <span className="text-[11px] font-medium text-slate-400">{suffix}</span>
        )}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-slate-500">{hint}</p>}
    </div>
  );
}

function StatusToggle({
  active,
  onClick,
  tone,
  label,
}: {
  active: boolean;
  onClick: () => void;
  tone: 'emerald' | 'slate';
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all',
        active
          ? tone === 'emerald'
            ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200'
            : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-500 hover:text-slate-700'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          active ? (tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-400') : 'bg-slate-300'
        )}
      />
      {label}
    </button>
  );
}
