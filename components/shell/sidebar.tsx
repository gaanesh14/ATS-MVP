'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  UsersRound,
  CalendarClock,
  Settings,
  HelpCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpcomingInterviews } from '@/components/interviews/upcoming-provider';

export function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);
  const { in1hCount } = useUpcomingInterviews();

  return (
    <aside
      className={cn(
        // Default (desktop): static, always visible.
        'flex w-[244px] flex-shrink-0 flex-col border-r border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900',
        // Mobile: fixed drawer that slides in from the left over the page.
        'fixed inset-y-0 left-0 z-40 -translate-x-full transition-transform duration-200 ease-out lg:static lg:translate-x-0',
        mobileOpen && 'translate-x-0 shadow-lift'
      )}
      aria-hidden={!mobileOpen ? undefined : false}
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-5 pb-6 pt-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white shadow-sm">
            <span className="text-[13px] font-bold tracking-tight">PX</span>
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">PhotonX ATS</div>
            <div className="text-[11.5px] text-slate-500 dark:text-slate-400">Hire smarter</div>
          </div>
        </Link>
        {/* Mobile-only close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 space-y-0.5 px-3 pb-4">
        <NavItem
          href="/dashboard"
          active={isActive('/dashboard', true)}
          icon={<LayoutDashboard className="h-[18px] w-[18px]" />}
          label="Dashboard"
        />
        <NavItem
          href="/dashboard/jobs"
          active={isActive('/dashboard/jobs')}
          icon={<Briefcase className="h-[18px] w-[18px]" />}
          label="Jobs"
        />
        <NavItem
          href="/dashboard/applicants"
          active={isActive('/dashboard/applicants')}
          icon={<Users className="h-[18px] w-[18px]" />}
          label="Applicants"
        />
        <NavItem
          href="/dashboard/interviews"
          active={isActive('/dashboard/interviews')}
          icon={<CalendarClock className="h-[18px] w-[18px]" />}
          label="Interviews"
          badge={in1hCount > 0 ? in1hCount : null}
        />
        <NavItem
          href="/dashboard/team"
          active={isActive('/dashboard/team')}
          icon={<UsersRound className="h-[18px] w-[18px]" />}
          label="Team"
        />
        <NavItem
          href="/dashboard/settings"
          active={isActive('/dashboard/settings')}
          icon={<Settings className="h-[18px] w-[18px]" />}
          label="Account Settings"
        />
        <NavItem
          href="/dashboard/help"
          active={isActive('/dashboard/help')}
          icon={<HelpCircle className="h-[18px] w-[18px]" />}
          label="Help"
        />
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number | null;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition-colors',
        active
          ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300'
          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
      )}
    >
      <span
        className={
          active
            ? 'text-brand-600 dark:text-brand-300'
            : 'text-slate-400 dark:text-slate-500'
        }
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span
          className={cn(
            'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold leading-none',
            active
              ? 'bg-brand-500 text-white'
              : 'bg-amber-500 text-white shadow-sm'
          )}
          aria-label={`${badge} starting within an hour`}
          title={`${badge} interview${badge === 1 ? '' : 's'} starting within the hour`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
