'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Users, Briefcase, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // If already logged in, jump straight into the dashboard. Otherwise stay on
  // this landing page — public visitors can still browse /careers without
  // ever seeing the auth flow.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return;
      if (user) {
        router.replace('/dashboard');
      } else {
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center bg-page">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-white shadow-sm">
            <span className="text-[14px] font-bold tracking-tight">PX</span>
          </div>
          <p className="text-[13px] text-slate-500">Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-500 text-[11px] font-bold text-white shadow-sm">
              PX
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-slate-900">
              PhotonX ATS
            </span>
          </Link>
          <div className="flex items-center gap-3 text-[13px]">
            <Link
              href="/login"
              className="font-medium text-slate-600 hover:text-slate-900"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-500 px-3.5 py-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[12px] font-medium text-brand-700">
          <Sparkles className="h-3 w-3" />
          AI-assisted candidate scoring
        </span>
        <h1 className="mt-5 text-[44px] font-semibold leading-tight tracking-tight text-slate-900">
          Hire smarter, not harder.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-slate-600">
          PhotonX is a mini Applicant Tracking System. Post a job, share a public
          apply link, and review candidates with parsed resumes and ATS scores in
          one place.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-5 py-3 text-[14.5px] font-semibold text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-soft"
          >
            Create an account
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/careers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-5 py-3 text-[14.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Looking for jobs?
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="grid gap-5 md:grid-cols-3">
          <FeatureCard
            icon={<Briefcase className="h-5 w-5" />}
            title="Post a job in minutes"
            body="Title, description, screening questions — get a public apply link instantly."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Resumes parsed for you"
            body="OpenAI extracts experience, skills, salary, and location from each PDF."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Pipeline that fits your team"
            body="Custom stages per job, drag-and-drop kanban, and bulk actions."
          />
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white/80 py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-[12px] text-slate-500">
          PhotonX ATS · v0.1
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}
