'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase, type Job, type JobQuestion } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MapPin,
  Briefcase,
  IndianRupee,
  ArrowLeft,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Lock,
  X,
  Sparkles,
} from 'lucide-react';
import { cn, formatINR, formatExperienceRange } from '@/lib/utils';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function ApplyPageWrapper() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-4 py-12 text-sm text-slate-500">
          Loading…
        </main>
      }
    >
      <ApplyPage />
    </Suspense>
  );
}

function ApplyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId') ?? searchParams.get('id');
  const source = searchParams.get('source') ?? 'careers_page';

  const [job, setJob] = useState<Job | null>(null);
  const [questions, setQuestions] = useState<JobQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [location, setLocation] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      const [{ data: jobData }, { data: qData }] = await Promise.all([
        supabase.from('jobs').select('*').eq('id', jobId).single(),
        supabase.from('job_questions').select('*').eq('job_id', jobId).order('display_order'),
      ]);
      setJob(jobData as Job | null);
      setQuestions((qData as JobQuestion[]) ?? []);
      setLoading(false);
    }
    fetchData();
  }, [jobId]);

  function pickFile(f: File | null) {
    if (!f) {
      setResumeFile(null);
      return;
    }
    if (f.type !== 'application/pdf') {
      setError('Resume must be a PDF.');
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError('Resume must be under 5 MB.');
      return;
    }
    setError(null);
    setResumeFile(f);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!jobId) {
      setError('No job selected.');
      return;
    }

    if (!fullName.trim() || !email.trim() || !phone.trim() || !resumeFile) {
      setError('Please fill all required fields and attach a resume.');
      return;
    }
    if (!/^[\w.-]+@[\w.-]+\.\w+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid phone number (10+ digits).');
      return;
    }
    const expNum = experienceYears.trim() === '' ? null : Number(experienceYears);
    if (expNum == null || !Number.isFinite(expNum) || expNum < 0 || expNum > 50) {
      setError('Please enter your years of experience (between 0 and 50).');
      return;
    }
    for (const q of questions) {
      if (q.is_required && !answers[q.id]?.trim()) {
        setError(`Please answer: "${q.question}"`);
        return;
      }
    }

    setSubmitting(true);

    const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from('resumes')
      .upload(fileName, resumeFile);
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`);
      setSubmitting(false);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('resumes').getPublicUrl(fileName);

    const { data: appRow, error: appErr } = await supabase
      .from('applications')
      .insert({
        job_id: jobId,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        resume_url: publicUrl,
        source,
        // Seed experience + location from candidate self-report. The resume
        // parser may overwrite these with values extracted from the PDF;
        // until then the recruiter sees the candidate's claimed values
        // immediately so location/experience filters can match.
        parsed_data: {
          experience_years: expNum,
          location: location.trim() || null,
        },
      })
      .select('id')
      .single();

    if (appErr || !appRow) {
      setError(`Could not save application: ${appErr?.message ?? 'unknown'}`);
      setSubmitting(false);
      return;
    }

    if (questions.length > 0) {
      const rows = questions
        .filter((q) => answers[q.id]?.trim())
        .map((q) => ({
          application_id: appRow.id,
          question_id: q.id,
          answer: answers[q.id].trim(),
        }));
      if (rows.length > 0) {
        await supabase.from('application_answers').insert(rows);
      }
    }

    fetch(`/api/applications/${appRow.id}/parse`, { method: 'POST' }).catch(() => {});

    router.push(`/careers/success?jobId=${jobId}`);
  }

  if (!jobId) {
    return (
      <ErrorShell
        title="No job selected"
        body="The link is missing the jobId parameter. Please check the URL."
      />
    );
  }
  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-sm text-slate-500">Loading…</main>
    );
  }
  if (!job) {
    return (
      <ErrorShell
        title="Job not found"
        body="This job no longer exists or the link is incorrect."
      />
    );
  }
  if (job.status !== 'open') {
    return (
      <ErrorShell
        title={job.title}
        body="This position is no longer accepting applications."
      />
    );
  }

  const formIncomplete =
    !fullName.trim() ||
    !email.trim() ||
    !phone.trim() ||
    !experienceYears.trim() ||
    !resumeFile ||
    questions.some((q) => q.is_required && !answers[q.id]?.trim());

  return (
    <div className="min-h-screen bg-page">
      {/* Brand header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/careers" className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-[11px] font-bold text-white shadow-sm">
              PX
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-slate-900">
              PhotonX Careers
            </span>
          </Link>
          <Link
            href="/careers"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All positions
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Job header card */}
        <section className="rounded-2xl border border-slate-100 bg-white p-7 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[26px] font-semibold capitalize tracking-tight text-slate-900">
                {job.title}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-slate-500">
                {job.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="capitalize">{job.location}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  {formatExperienceRange(job.min_experience, job.max_experience)}
                </span>
                {(job.min_salary || job.max_salary) && (
                  <span className="inline-flex items-center gap-1.5">
                    <IndianRupee className="h-3.5 w-3.5" />
                    {formatINR(job.min_salary)} – {formatINR(job.max_salary)}
                  </span>
                )}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Now hiring
            </span>
          </div>
          {job.description && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-600">
                {job.description}
              </p>
            </div>
          )}
        </section>

        {/* Apply form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white shadow-card">
            <header className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <h2 className="text-[16px] font-semibold text-slate-900">Apply now</h2>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  Takes about 2 minutes. We&apos;ll get back to you within a week.
                </p>
              </div>
            </header>

            <div className="space-y-5 px-6 py-5">
              <Field id="full-name" label="Full name" required>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Aarav Sharma"
                  autoComplete="name"
                  required
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="email" label="Email" required>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </Field>
                <Field id="phone" label="Phone" required>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="experience"
                  label="Years of experience"
                  required
                  suffix="yrs"
                  hint="We'll cross-check this against your resume."
                >
                  <Input
                    id="experience"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    max="50"
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(e.target.value)}
                    placeholder="e.g. 3"
                    required
                  />
                </Field>
                <Field
                  id="location"
                  label="Current location"
                  // hint="City you're based in. Used by the recruiter to filter candidates."
                >
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Bangalore"
                    autoComplete="address-level2"
                  />
                </Field>
              </div>

              {/* Resume drag-drop */}
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label className="text-[13px] font-medium text-slate-700">
                    Resume <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-medium text-slate-400">
                    PDF · max 5 MB
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="sr-only"
                  id="resume"
                />
                {resumeFile ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
                    <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[14px] font-medium text-slate-900">
                        {resumeFile.name}
                      </div>
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-emerald-700">
                        <CheckCircle className="h-3 w-3" />
                        {(resumeFile.size / 1024).toFixed(0)} KB · ready to submit
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setResumeFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      title="Remove file"
                      className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    className={cn(
                      'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all',
                      dragActive
                        ? 'border-brand-400 bg-brand-50/50'
                        : 'border-slate-200 bg-slate-50/40 hover:border-brand-300 hover:bg-brand-50/30'
                    )}
                  >
                    <div
                      className={cn(
                        'grid h-10 w-10 place-items-center rounded-full transition-colors',
                        dragActive
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-white text-brand-600'
                      )}
                    >
                      <Upload className="h-4 w-4" />
                    </div>
                    <div className="text-[13.5px] font-medium text-slate-700">
                      <span className="text-brand-600">Click to upload</span> or drag &
                      drop
                    </div>
                    <div className="text-[12px] text-slate-500">
                      PDF only · up to 5 MB
                    </div>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Screening questions */}
          {questions.length > 0 && (
            <section className="rounded-2xl border border-slate-100 bg-white shadow-card">
              <header className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-[15px] font-semibold text-slate-900">
                  Screening questions
                </h2>
                <p className="mt-0.5 text-[12.5px] text-slate-500">
                  Quick context so we can match you to the right team.
                </p>
              </header>
              <div className="space-y-5 px-6 py-5">
                {questions.map((q, i) => (
                  <div key={q.id}>
                    <div className="mb-2 flex items-start gap-2.5">
                      <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md bg-brand-50 text-[11px] font-bold text-brand-600">
                        Q{i + 1}
                      </span>
                      <label
                        htmlFor={`q-${q.id}`}
                        className="text-[13.5px] font-medium leading-snug text-slate-800"
                      >
                        {q.question}
                        {q.is_required && (
                          <span className="ml-0.5 text-rose-500">*</span>
                        )}
                      </label>
                    </div>
                    <div className="pl-[34px]">
                      {q.question_type === 'yesno' ? (
                        <div className="flex gap-2">
                          {(['Yes', 'No'] as const).map((v) => {
                            const active = answers[q.id] === v;
                            return (
                              <button
                                key={v}
                                type="button"
                                onClick={() =>
                                  setAnswers((a) => ({ ...a, [q.id]: v }))
                                }
                                className={cn(
                                  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-5 text-[13.5px] font-medium transition-colors',
                                  active
                                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                )}
                              >
                                {active && <CheckCircle className="h-3.5 w-3.5" />}
                                {v}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <Input
                          id={`q-${q.id}`}
                          type={q.question_type === 'number' ? 'number' : 'text'}
                          value={answers[q.id] || ''}
                          onChange={(e) =>
                            setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                          }
                          placeholder={
                            q.question_type === 'number'
                              ? 'Enter a number'
                              : 'Type your answer…'
                          }
                          required={q.is_required}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-[13px] text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
            <Button
              type="submit"
              disabled={submitting || formIncomplete}
              className="h-11 w-full bg-brand-500 text-[14.5px] font-semibold hover:bg-brand-600 disabled:bg-slate-300"
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
            <p className="mt-3 inline-flex items-center justify-center gap-1.5 text-center text-[12px] text-slate-500">
              <Lock className="h-3 w-3" />
              Your information is shared only with the hiring team for this role.
            </p>
            {source !== 'careers_page' && (
              <p className="mt-1 text-center text-[11px] text-slate-400">
                Applied via <span className="font-medium text-slate-600">{source}</span>
              </p>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  suffix,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  suffix?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="block text-[13px] font-medium text-slate-700"
        >
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
        {suffix && (
          <span className="text-[11px] font-medium text-slate-400">{suffix}</span>
        )}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-slate-500">{hint}</p>}
    </div>
  );
}

function ErrorShell({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-3 text-sm text-slate-500">{body}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/careers">View open positions</Link>
      </Button>
    </main>
  );
}
