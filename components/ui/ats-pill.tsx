import { cn } from '@/lib/utils';

type Tone = 'emerald' | 'amber' | 'rose' | 'slate';

const TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-50 text-slate-700 ring-slate-200',
};

export function AtsPill({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return (
      <span
        className={cn(
          'num inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1',
          TONES.slate
        )}
      >
        —
      </span>
    );
  }
  let tone: Tone = 'emerald';
  if (score < 40) tone = 'rose';
  else if (score < 70) tone = 'amber';
  return (
    <span
      className={cn(
        'num inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1',
        TONES[tone]
      )}
    >
      {score}
    </span>
  );
}
