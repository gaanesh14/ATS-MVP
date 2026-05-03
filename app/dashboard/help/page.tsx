'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Mail,
  FileText,
  Sparkles,
  ArrowRight,
  Briefcase,
  Users,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';

type FAQ = { q: string; a: string };

const FAQS: FAQ[] = [
  {
    q: 'How does ATS scoring work?',
    a: 'When a candidate applies, their resume is downloaded, text-extracted, and analyzed against the job description. We compute a 0–100 score from six signals: skill overlap, semantic similarity to the JD, experience match, title match, education, and recency. The LLM validates and lightly adjusts the deterministic score within ±10 points.',
  },
  {
    q: 'Why does a candidate show "Failed" or "Parsing"?',
    a: '"Parsing" means the resume has been received but the extraction job is still running — usually 10–30 seconds. "Failed" means the PDF was corrupt, image-only, or in an unsupported format. You can hit Re-parse from the candidate dialog to retry.',
  },
  {
    q: 'Can I customize the pipeline stages?',
    a: 'Yes. Open any job, click the + at the end of the stage tabs, and add a custom stage with a name and color. Custom stages slot between Interview and Hired. Each job has its own pipeline.',
  },
  {
    q: 'What does the source tag mean?',
    a: 'Source is where the candidate applied from. Append ?source=linkedin (or naukri, indeed, whatsapp, referred) to your public job link to track it. Default is "careers_page" when no source is provided.',
  },
  {
    q: 'How do I share a job link with candidates?',
    a: 'Open the job, go to the Details tab, copy the Public apply link from the right sidebar. Anyone with that link can apply — no login needed.',
  },
  {
    q: 'How are filters applied to candidates?',
    a: "Filters work client-side on the candidates you've already loaded. When a parsed-data filter (experience, location, skill) is set, candidates whose resume hasn't been parsed yet are hidden — apply the search filter instead if you want to find unparsed candidates.",
  },
  {
    q: 'Can I bulk move candidates between stages?',
    a: 'Super Admins and Admins can. Tick the checkbox on each row, and a black bulk-actions bar floats at the bottom with options to move them to Shortlisted, Interview, or Reject all. Recruiters are read-only and won\'t see this bar.',
  },
  {
    q: 'What happens when a job hits its vacancies?',
    a: "When the number of candidates marked Hired equals the job's vacancies count, the job auto-closes and stops accepting new applications.",
  },
  {
    q: 'How do I change my password?',
    a: 'Go to Settings → Security → Change password. Enter your current password, then your new one (8+ characters), and confirm. We re-verify your current password before applying the change so a stolen session can\'t silently lock you out.',
  },
  {
    q: 'I forgot my password. What now?',
    a: 'On the sign-in screen, click "Forgot password" to receive a reset link by email. The link is single-use and expires after 1 hour. If your address has bounced, ask a Super Admin to re-invite you from Team → Pending invites → Resend invite.',
  },
  {
    q: 'What can each role do?',
    a: 'Three roles. Super Admin has full access — jobs, team, settings. Admin can create/edit/delete jobs and edit org settings, but cannot add or remove team members. Recruiter is read-only across the dashboard — they sign in to review, not modify. Roles are managed from Team → Manage member.',
  },
  {
    q: "Why can't I invite team members?",
    a: 'Only Super Admins can invite. If your role badge in the sidebar says Admin or Recruiter, ask a Super Admin to upgrade you, or to send the invite themselves.',
  },
];

type QuickLink = {
  title: string;
  body: string;
  href: string;
  icon: React.ReactNode;
  // Permission required to follow this link. If null, anyone can.
  requires: 'jobs.create' | 'team.invite' | null;
};

const ALL_QUICK_LINKS: QuickLink[] = [
  {
    title: 'Posting your first job',
    body: 'Create a job and share the apply link.',
    href: '/dashboard/jobs/new',
    icon: <Briefcase className="h-4 w-4" />,
    requires: 'jobs.create',
  },
  {
    title: 'Reviewing candidates',
    body: 'Filter, score, and shortlist applicants from one screen.',
    href: '/dashboard/applicants',
    icon: <Users className="h-4 w-4" />,
    requires: null,
  },
  {
    title: 'Inviting your team',
    body: 'Add hiring managers and recruiters with the right access.',
    href: '/dashboard/team',
    icon: <UsersRound className="h-4 w-4" />,
    requires: 'team.invite',
  },
  {
    title: 'Customizing the pipeline',
    body: 'Create custom stages between Interview and Hired.',
    href: '/dashboard/jobs',
    icon: <Workflow className="h-4 w-4" />,
    requires: null,
  },
];

export default function HelpPage() {
  const { role } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const quickLinks = ALL_QUICK_LINKS.filter(
    (q) => q.requires === null || can(role, q.requires)
  );

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-brand-50/40 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-slate-900 sm:text-[28px]">
              How can we help?
            </h1>
            <p className="mt-1.5 text-[14px] text-slate-600">
              Browse common questions, walk through quick guides, or get in touch.
            </p>
          </div>
        </div>
      </div>

      {/* Quick links */}
      {quickLinks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
            Quick guides
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {quickLinks.map((q) => (
              <Link
                key={q.title}
                href={q.href}
                className="group flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-card transition-all hover:border-slate-200 hover:shadow-soft"
              >
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                  {q.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-slate-900">{q.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">
                    {q.body}
                  </p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="mt-10">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
          Frequently asked
        </h2>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          {FAQS.map((f, i) => {
            const isOpen = openFaq === i;
            return (
              <div
                key={f.q}
                className="border-b border-slate-100 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/60"
                >
                  <span className="text-[14px] font-medium text-slate-900">
                    {f.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 flex-shrink-0 text-slate-400 transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-[13.5px] leading-relaxed text-slate-600">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact — only the channels that actually work right now. */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <ContactCard
          icon={<Mail className="h-5 w-5" />}
          title="Email support"
          body="Reply within 1 business day."
          action="support@photonxtech.com"
          href="mailto:support@photonxtech.com"
        />
        <ContactCard
          icon={<FileText className="h-5 w-5" />}
          title="Project docs"
          body="Architecture, schema migrations, and the recruiter playbook."
          action="Browse docs"
          // Project-internal docs live under /docs in the repo. Keep an
          // anchor that downloads or opens the index when served.
          href="/docs"
        />
      </div>

      <p className="mt-10 text-center text-[12px] text-slate-400">
        PhotonX ATS · v0.1 · Built as a 3-student MVP sprint
      </p>
    </div>
  );
}

function ContactCard({
  icon,
  title,
  body,
  action,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: string;
  href: string;
}) {
  const isExternal = href.startsWith('mailto:') || href.startsWith('http');
  return (
    <a
      href={href}
      target={isExternal ? '_self' : undefined}
      className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-card transition-all hover:border-slate-200 hover:shadow-soft"
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </div>
      <p className="mt-3 text-[14px] font-semibold text-slate-900">{title}</p>
      <p className="mt-0.5 text-[12.5px] text-slate-500">{body}</p>
      <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-600 group-hover:text-brand-700">
        {action}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </p>
    </a>
  );
}
