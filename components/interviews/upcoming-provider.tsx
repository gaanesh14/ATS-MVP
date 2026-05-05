'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase, type Interview } from '@/lib/supabase';

// Loads scheduled interviews once and refreshes them every minute. The data
// is shared by:
//   - the sidebar badge ("3" next to the Interviews link, if 3 are starting
//     within the hour)
//   - the InterviewAlertBanner that floats above the dashboard when an
//     interview is starting within ~15 minutes
//
// We intentionally fetch from the client (anon key) — RLS allows it and
// the dataset is tiny. A heavier future approach would be a server
// component pre-fetch + revalidation; not needed at this scale.

type UpcomingContextValue = {
  upcoming: Interview[];
  imminent: Interview | null;     // starts in next 15 min, currently #1
  in1hCount: number;              // for the sidebar badge
  refresh: () => Promise<void>;
  dismissImminent: (id: string) => void;
};

const UpcomingContext = createContext<UpcomingContextValue>({
  upcoming: [],
  imminent: null,
  in1hCount: 0,
  refresh: async () => {},
  dismissImminent: () => {},
});

export function useUpcomingInterviews() {
  return useContext(UpcomingContext);
}

const POLL_MS = 60_000;
const IMMINENT_WINDOW_MS = 15 * 60_000;
const ONE_HOUR_MS = 60 * 60_000;

export function UpcomingInterviewsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [rows, setRows] = useState<Interview[]>([]);
  const [tick, setTick] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('interviews')
      .select('*')
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true });
    setRows((data as Interview[]) ?? []);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      refresh();
      setTick((t) => t + 1); // force re-evaluation of "imminent"
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const value = useMemo<UpcomingContextValue>(() => {
    const now = Date.now();
    const upcoming = rows.filter((r) => +new Date(r.scheduled_at) > now - 60_000);
    const in1hCount = upcoming.filter(
      (r) => +new Date(r.scheduled_at) - now <= ONE_HOUR_MS
    ).length;
    const imminent =
      upcoming.find((r) => {
        const d = +new Date(r.scheduled_at) - now;
        return (
          d <= IMMINENT_WINDOW_MS &&
          d >= -r.duration_minutes * 60_000 &&
          !dismissedIds.has(r.id)
        );
      }) ?? null;
    return {
      upcoming,
      imminent,
      in1hCount,
      refresh,
      dismissImminent: (id: string) =>
        setDismissedIds((prev) => new Set(prev).add(id)),
    };
    // tick is a dependency only to force this useMemo to re-run on the
    // poll cadence even when `rows` hasn't changed (so "imminent" updates
    // as time progresses).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dismissedIds, refresh, tick]);

  return (
    <UpcomingContext.Provider value={value}>
      {children}
    </UpcomingContext.Provider>
  );
}
