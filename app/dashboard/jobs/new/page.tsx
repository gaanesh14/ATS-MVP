'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Trash2,
  Plus,
  ArrowLeft,
  Briefcase,
  IndianRupee,
  HelpCircle,
  ListChecks,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type QuestionDraft = {
  question: string;
  question_type: 'text' | 'number' | 'yesno';
  is_required: boolean;
};

export default function NewJobPage() {
  const router = useRouter();
  const { role, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recruiters land here only by typing the URL; bounce them back. The CTA
  // is hidden everywhere else for them.
  useEffect(() => {
    if (!authLoading && role && !can(role, 'jobs.create')) {
      router.replace('/dashboard/jobs');
    }
  }, [authLoading, role, router]);

  if (role && !can(role, 'jobs.create')) return null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [minExp, setMinExp] = useState('');
  const [maxExp, setMaxExp] = useState('');
  const [minSalary, setMinSalary] = useState('');
  const [maxSalary, setMaxSalary] = useState('');
  const [vacancies, setVacancies] = useState('1');
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  function addQuestion() {
    setQuestions((q) => [...q, { question: '', question_type: 'text', is_required: true }]);
  }
  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
  }
  function updateQuestion(i: number, patch: Partial<QuestionDraft>) {
    setQuestions((q) => q.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);

    const { data: jobRow, error: jobError } = await supabase
      .from('jobs')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        min_experience: Number(minExp) || 0,
        max_experience: Number(maxExp) || 100,
        min_salary: minSalary ? Number(minSalary) : null,
        max_salary: maxSalary ? Number(maxSalary) : null,
        vacancies: Math.max(1, Number(vacancies) || 1),
        status: 'open',
      })
      .select('id')
      .single();

    if (jobError || !jobRow) {
      setError(jobError?.message ?? 'Failed to create job');
      setSubmitting(false);
      return;
    }

    const validQs = questions.filter((q) => q.question.trim().length > 0);
    if (validQs.length > 0) {
      const { error: qErr } = await supabase.from('job_questions').insert(
        validQs.map((q, i) => ({
          job_id: jobRow.id,
          question: q.question.trim(),
          question_type: q.question_type,
          is_required: q.is_required,
          display_order: i,
        }))
      );
      if (qErr) {
        setError(`Job created but failed to save questions: ${qErr.message}`);
        setSubmitting(false);
        return;
      }
    }

    router.push('/dashboard/jobs');
  }

  return (
    <main className="mx-auto max-w-3xl px-8 py-6">
      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to jobs
      </Link>

      <div className="mt-3">
        <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">
          Create a new job
        </h1>
        <p className="mt-1 text-[14px] text-slate-500">
          Once created, you&apos;ll get a public apply link to share with candidates.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* Basic details */}
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
              placeholder="e.g. Senior Frontend Developer"
              required
            />
          </Field>
          <Field
            id="description"
            label="Description"
            hint="Role summary, responsibilities, and requirements. Used to extract required skills."
          >
            <Textarea
              id="description"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the role, must-have skills, and team you'd be joining…"
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

        {/* Experience & compensation */}
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
                placeholder="e.g. 1000000"
              />
            </Field>
            <Field id="max-sal" label="Max salary" suffix="INR / yr">
              <Input
                id="max-sal"
                type="number"
                value={maxSalary}
                onChange={(e) => setMaxSalary(e.target.value)}
                placeholder="e.g. 2500000"
              />
            </Field>
          </div>

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
        </FormSection>

        {/* Screening questions */}
        <FormSection
          icon={<ListChecks className="h-4 w-4" />}
          title="Screening questions"
          description="Optional. Asked once on the apply form, before resume upload."
          action={
            <button
              type="button"
              onClick={addQuestion}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add question
            </button>
          }
        >
          {questions.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-8 text-center">
              <HelpCircle className="h-5 w-5 text-slate-400" />
              <p className="mt-2 text-[13px] text-slate-600">No screening questions added.</p>
              <p className="mt-0.5 text-[12px] text-slate-400">
                Useful for years of experience, location preference, notice period, etc.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {questions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3.5"
                >
                  <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-brand-50 text-[12px] font-bold text-brand-600">
                    Q{i + 1}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={q.question}
                      onChange={(e) => updateQuestion(i, { question: e.target.value })}
                      placeholder="e.g. How many years of React experience do you have?"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={q.question_type}
                        onChange={(e) =>
                          updateQuestion(i, {
                            question_type: e.target.value as QuestionDraft['question_type'],
                          })
                        }
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 focus:border-brand-400 focus:outline-none"
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="yesno">Yes / No</option>
                      </select>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
                        <Checkbox
                          checked={q.is_required}
                          onCheckedChange={(v) =>
                            updateQuestion(i, { is_required: Boolean(v) })
                          }
                        />
                        Required
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    aria-label="Remove question"
                    className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </FormSection>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-[13px] text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Sticky-ish action bar */}
        <div className="flex items-center justify-end gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-card">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/dashboard/jobs')}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !title.trim()}
            className="bg-brand-500 hover:bg-brand-600"
          >
            {submitting ? 'Creating…' : 'Create job'}
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
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-card">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </div>
          <div className="leading-tight">
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="mt-0.5 text-[12.5px] text-slate-500">{description}</p>
            )}
          </div>
        </div>
        {action}
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
        <Label
          htmlFor={id}
          className={cn('text-[13px] font-medium text-slate-700')}
        >
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
