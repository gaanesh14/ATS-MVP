import { cn } from '@/lib/utils';
import type { Job, JobStage, Stage } from '@/lib/supabase';
import { getStageMeta, STAGE_TONES } from '@/lib/stages';

export function StagePill({
  stage,
  job,
}: {
  stage: Stage;
  job?: Pick<Job, 'extra_stages'> | { extra_stages?: JobStage[] | null } | null;
}) {
  const meta = getStageMeta(stage, job ?? null);
  const tone = STAGE_TONES[meta.color];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
        tone.pill
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
      {meta.label}
    </span>
  );
}

// Re-exported for callers that haven't migrated to getStagesForJob yet.
// Prefer `getStagesForJob(job).map(s => s.id)` — it includes custom stages.
export { getStagesForJob, getStageMeta } from '@/lib/stages';

export function stageLabel(stage: Stage, job?: Pick<Job, 'extra_stages'> | null): string {
  return getStageMeta(stage, job ?? null).label;
}
