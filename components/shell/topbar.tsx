'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  Eye,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import { RecentApplicantsStack } from '@/components/shell/global-search';

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useAuth();

  const items = breadcrumbItems(pathname);
  const isJobDetail = /^\/dashboard\/jobs\/[^/]+$/.test(pathname);
  // Don't show a back arrow on the dashboard root — there's nothing useful to
  // go back to from there.
  const showBack = pathname !== '/dashboard';

  function onCrumbClick(i: number) {
    // First crumb on Job detail / Create / Edit goes back to /dashboard/jobs
    if (
      i === 0 &&
      (pathname.startsWith('/dashboard/jobs/') || pathname === '/dashboard/jobs/new')
    ) {
      router.push('/dashboard/jobs');
    }
  }

  const cta = ctaFor(pathname, can(role, 'jobs.create'));

  return (
    <div className="flex h-16 items-center justify-between gap-3 border-b border-slate-100 bg-white/80 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      {/* Mobile hamburger + Back + Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-[14px]">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            title="Go back"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex min-w-0 items-center gap-2 truncate">
          {items.map((it, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
              {i < items.length - 1 ? (
                <button
                  type="button"
                  onClick={() => onCrumbClick(i)}
                  className="text-slate-500 transition-colors hover:text-slate-700"
                >
                  {it}
                </button>
              ) : (
                <span className="truncate font-medium text-slate-900">{it}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
        {!isJobDetail && <RecentApplicantsStack />}
        {cta}
      </div>
    </div>
  );
}

function breadcrumbItems(pathname: string): string[] {
  if (pathname === '/dashboard') return ['Dashboard'];
  if (pathname === '/dashboard/jobs') return ['Jobs'];
  if (pathname === '/dashboard/jobs/new') return ['Jobs', 'Create new job'];
  if (/^\/dashboard\/jobs\/[^/]+\/edit$/.test(pathname)) return ['Jobs', 'Edit job'];
  if (/^\/dashboard\/jobs\/[^/]+$/.test(pathname)) return ['Jobs', 'Detail'];
  if (pathname === '/dashboard/applicants') return ['Applicants'];
  if (pathname === '/dashboard/team') return ['Team'];
  if (pathname === '/dashboard/settings') return ['Settings'];
  if (pathname === '/dashboard/help') return ['Help'];
  return ['PhotonX'];
}

function ctaFor(pathname: string, canCreateJob: boolean): React.ReactNode {
  // No CTA on the create form itself
  if (pathname === '/dashboard/jobs/new') return null;
  if (/^\/dashboard\/jobs\/[^/]+\/edit$/.test(pathname)) return null;

  // Job detail: "Preview public page" → opens the careers apply page in a new tab
  const detailMatch = pathname.match(/^\/dashboard\/jobs\/([^/]+)$/);
  if (detailMatch) {
    const jobId = detailMatch[1];
    return (
      <Link
        href={`/careers/apply?jobId=${jobId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600'
        )}
      >
        <Eye className="h-4 w-4" />
        Preview public page
      </Link>
    );
  }

  // Default: Create New Job — recruiters can't post jobs, so the CTA hides.
  if (!canCreateJob) return null;
  return (
    <Link
      href="/dashboard/jobs/new"
      className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
    >
      <Plus className="h-4 w-4" />
      Create New Job
    </Link>
  );
}
