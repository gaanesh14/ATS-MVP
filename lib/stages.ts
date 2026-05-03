import type { Job, JobStage, Stage, StageColor } from '@/lib/supabase';

export type StageMeta = {
  id: Stage;
  label: string;
  color: StageColor;
  builtin: boolean;
  // 'open' = a normal pipeline step, 'terminal' = hired/rejected (no step beyond it)
  kind: 'open' | 'terminal';
};

const BUILTIN: StageMeta[] = [
  { id: 'new',         label: 'New',         color: 'sky',     builtin: true, kind: 'open' },
  { id: 'shortlisted', label: 'Shortlisted', color: 'amber',   builtin: true, kind: 'open' },
  { id: 'interview',   label: 'Interview',   color: 'violet',  builtin: true, kind: 'open' },
  { id: 'hired',       label: 'Hired',       color: 'emerald', builtin: true, kind: 'terminal' },
  { id: 'rejected',    label: 'Rejected',    color: 'rose',    builtin: true, kind: 'terminal' },
];

// Color palette offered to admins when creating a custom stage. Built-in
// colors are excluded so each stage stays visually distinct.
export const CUSTOM_STAGE_COLORS: StageColor[] = [
  'cyan',
  'teal',
  'orange',
  'indigo',
  'fuchsia',
  'slate',
];

// Tailwind tone classes per stage color. Centralised so every surface
// (pill, kanban dot, kanban bar, segmented control) renders the same way.
export const STAGE_TONES: Record<
  StageColor,
  { pill: string; dot: string; bar: string; text: string }
> = {
  sky:      { pill: 'bg-sky-50 text-sky-700 ring-sky-200',           dot: 'bg-sky-500',     bar: 'bg-sky-200',     text: 'text-sky-600' },
  amber:    { pill: 'bg-amber-50 text-amber-700 ring-amber-200',     dot: 'bg-amber-500',   bar: 'bg-amber-200',   text: 'text-amber-600' },
  violet:   { pill: 'bg-violet-50 text-violet-700 ring-violet-200',  dot: 'bg-violet-500',  bar: 'bg-violet-200',  text: 'text-violet-600' },
  emerald:  { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', bar: 'bg-emerald-200', text: 'text-emerald-600' },
  rose:     { pill: 'bg-rose-50 text-rose-700 ring-rose-200',         dot: 'bg-rose-500',    bar: 'bg-rose-200',    text: 'text-rose-600' },
  cyan:     { pill: 'bg-cyan-50 text-cyan-700 ring-cyan-200',         dot: 'bg-cyan-500',    bar: 'bg-cyan-200',    text: 'text-cyan-600' },
  teal:     { pill: 'bg-teal-50 text-teal-700 ring-teal-200',         dot: 'bg-teal-500',    bar: 'bg-teal-200',    text: 'text-teal-600' },
  orange:   { pill: 'bg-orange-50 text-orange-700 ring-orange-200',   dot: 'bg-orange-500',  bar: 'bg-orange-200',  text: 'text-orange-600' },
  indigo:   { pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200',   dot: 'bg-indigo-500',  bar: 'bg-indigo-200',  text: 'text-indigo-600' },
  fuchsia:  { pill: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', dot: 'bg-fuchsia-500', bar: 'bg-fuchsia-200', text: 'text-fuchsia-600' },
  slate:    { pill: 'bg-slate-50 text-slate-700 ring-slate-200',      dot: 'bg-slate-500',   bar: 'bg-slate-300',   text: 'text-slate-600' },
};

// Render order for a job's pipeline:
//   new → shortlisted → interview → [custom stages, in array order] → hired → rejected
// This keeps Hired/Rejected as terminal slots and slots customs into the
// natural "in-progress" segment of the pipeline.
export function getStagesForJob(job: { extra_stages?: JobStage[] | null } | null | undefined): StageMeta[] {
  const customs: StageMeta[] = (job?.extra_stages ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    builtin: false,
    kind: 'open',
  }));

  return [
    BUILTIN[0], // new
    BUILTIN[1], // shortlisted
    BUILTIN[2], // interview
    ...customs,
    BUILTIN[3], // hired
    BUILTIN[4], // rejected
  ];
}

// Look up a stage's display metadata from its id. Falls back to a 'New'
// shaped placeholder so the UI never renders blank if a candidate references
// a stage that has since been deleted.
export function getStageMeta(
  stageId: Stage,
  job: { extra_stages?: JobStage[] | null } | null | undefined
): StageMeta {
  const stages = getStagesForJob(job);
  return (
    stages.find((s) => s.id === stageId) ??
    BUILTIN[0] // safe default
  );
}

export const BUILTIN_STAGE_IDS = BUILTIN.map((s) => s.id);

// Slug a free-form label into an id usable as a stage key. Stable, lowercase,
// alphanumeric + hyphens. Must be unique within a job — caller checks.
export function slugStageId(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
