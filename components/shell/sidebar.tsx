'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  UsersRound,
  Settings,
  HelpCircle,
  ChevronDown,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/shell/auth-provider';
import { roleLabel } from '@/lib/rbac';

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
  const { member, signOut } = useAuth();

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

  return (
    <aside
      className={cn(
        // Default (desktop): static, always visible.
        'flex w-[244px] flex-shrink-0 flex-col border-r border-slate-100 bg-white',
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
            <div className="text-[15px] font-semibold text-slate-900">PhotonX ATS</div>
            <div className="text-[11.5px] text-slate-500">Hire smarter</div>
          </div>
        </Link>
        {/* Mobile-only close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
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
          href="/dashboard/team"
          active={isActive('/dashboard/team')}
          icon={<UsersRound className="h-[18px] w-[18px]" />}
          label="Team"
        />
        <NavItem
          href="/dashboard/help"
          active={isActive('/dashboard/help')}
          icon={<HelpCircle className="h-[18px] w-[18px]" />}
          label="Help"
        />
      </div>

      {/* User card with dropdown */}
      <div className="relative px-3 pb-4" ref={menuRef}>
        {menuOpen && (
          <div className="absolute bottom-[80px] left-3 right-3 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lift">
            <Link
              href="/dashboard/settings"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              Account settings
            </Link>
            {/* <Link
              href="/dashboard/help"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <HelpCircle className="h-4 w-4 text-slate-400" />
              Help &amp; docs
            </Link> */}
            <div className="mx-2 my-1 h-px bg-slate-100" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-2 transition-colors hover:bg-slate-50"
        >
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-700">
            {initials || '?'}
          </div>
          <div className="min-w-0 flex-1 text-left leading-tight">
            <div className="truncate text-[13px] font-semibold text-slate-900">
              {displayName}
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {member ? roleLabel(member.role) : displayEmail}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-slate-400 transition-transform',
              menuOpen && 'rotate-180'
            )}
          />
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-medium transition-colors',
        active ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50'
      )}
    >
      <span className={active ? 'text-brand-600' : 'text-slate-400'}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
