'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Video, X } from 'lucide-react';
import { useUpcomingInterviews } from '@/components/interviews/upcoming-provider';
import { formatDuration } from '@/lib/interviews';

// A floating top banner that appears when an interview is starting within
// ~15 minutes. Shows: "Interview with Jane Doe in 12 minutes — Join now".
// Self-updates every 30 seconds so the countdown stays fresh.

export function InterviewAlertBanner() {
  const { imminent, dismissImminent } = useUpcomingInterviews();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!imminent) return null;

  const startMs = +new Date(imminent.scheduled_at);
  const diffMin = Math.round((startMs - now) / 60_000);
  const isStartingNow = diffMin <= 0;
  const isInProgress =
    isStartingNow && now <= startMs + imminent.duration_minutes * 60_000;

  const label = isInProgress
    ? 'Interview in progress'
    : isStartingNow
    ? 'Starting now'
    : `Starts in ${diffMin} min${diffMin === 1 ? '' : 's'}`;

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-amber-200 bg-gradient-to-r from-amber-50 via-amber-50 to-amber-100/60 px-4 py-2.5 text-[13px] sm:px-6">
      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-700">
        <CalendarClock className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-amber-900">{label}</span>
        <span className="ml-2 text-amber-800">
          Interview with{' '}
          <span className="font-medium">{imminent.candidate_name}</span> ·{' '}
          {formatDuration(imminent.duration_minutes)}
        </span>
      </div>
      {imminent.meeting_link && (
        <a
          href={imminent.meeting_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
        >
          <Video className="h-3.5 w-3.5" />
          Join now
        </a>
      )}
      <button
        type="button"
        onClick={() => dismissImminent(imminent.id)}
        aria-label="Dismiss"
        className="grid h-7 w-7 place-items-center rounded-lg text-amber-700 hover:bg-amber-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
