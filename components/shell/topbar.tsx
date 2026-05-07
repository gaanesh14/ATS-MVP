'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Plus,
  Eye,
  LogOut,
  Menu,
  Sun,
  Moon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/shell/auth-provider';
import { can, roleLabel } from '@/lib/rbac';
import { useTheme } from '@/components/shell/theme-provider';

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, member, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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

  const displayName = member?.name ?? 'Member';
  const displayEmail = member?.email ?? '';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const items = breadcrumbItems(pathname);
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
    <div className="flex h-16 items-center justify-between gap-3 border-b border-slate-100 bg-white/80 px-4 backdrop-blur-sm sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-900/80">
      {/* Mobile hamburger + Back + Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-[14px]">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Menu className="h-4 w-4" />
        </button>
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            title="Go back"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex min-w-0 items-center gap-2 truncate">
          {items.map((it, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
              {i < items.length - 1 ? (
                <button
                  type="button"
                  onClick={() => onCrumbClick(i)}
                  className="text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {it}
                </button>
              ) : (
                <span className="truncate font-medium text-slate-900 dark:text-slate-100">{it}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {cta}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg border border-slate-200 py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {initials || '?'}
            </div>
            <div className="hidden min-w-0 max-w-[160px] text-left leading-tight sm:block">
              <div className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                {displayName}
              </div>
              <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {member ? roleLabel(member.role) : displayEmail}
              </div>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-slate-400 transition-transform dark:text-slate-500',
                menuOpen && 'rotate-180'
              )}
            />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lift dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
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

  // Pages where "Create New Job" isn't contextually relevant
  const ctaHiddenPaths = [
    '/dashboard/team',
    '/dashboard/interviews',
    '/dashboard/settings',
    '/dashboard/help',
  ];
  if (ctaHiddenPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null;
  }

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
