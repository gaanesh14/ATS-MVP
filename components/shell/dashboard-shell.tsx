'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { UpcomingInterviewsProvider } from '@/components/interviews/upcoming-provider';
import { InterviewAlertBanner } from '@/components/interviews/alert-banner';

// Owns the mobile-sidebar open/closed state and lays out the dashboard
// chrome. Above lg the sidebar is always visible; below lg it slides in over
// the page when the topbar's hamburger is tapped.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer when navigating between pages so the user isn't left
  // staring at the menu after they tap a link.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <UpcomingInterviewsProvider>
      {/* Single-scroller layout: only the window scrolls. No nested
          overflow containers — that's what was producing two scrollbars
          on pages whose content fit within the viewport. Sidebar and
          topbar stay visible via `sticky top-0`. */}
      <div className="flex min-h-screen bg-page dark:bg-slate-950">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

        {/* Backdrop — only on mobile when the drawer is open */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-20">
            <Topbar onMenuClick={() => setMobileOpen(true)} />
          </div>
          <main className="flex-1">
            <InterviewAlertBanner />
            {children}
          </main>
        </div>
      </div>
    </UpcomingInterviewsProvider>
  );
}
