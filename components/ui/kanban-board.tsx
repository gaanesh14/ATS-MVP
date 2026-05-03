'use client';

import { useRef, useState } from 'react';
import { GripVertical, Plus } from 'lucide-react';
import { type Application, type Stage } from '@/lib/supabase';
import { type StageMeta, STAGE_TONES } from '@/lib/stages';
import { cn, formatDate } from '@/lib/utils';

export function KanbanBoard({
  candidates,
  stages,
  onMove,
  onOpen,
  onAddStage,
}: {
  candidates: Application[];
  stages: StageMeta[];
  onMove: (id: string, stage: Stage) => void | Promise<void>;
  onOpen: (a: Application) => void;
  onAddStage?: () => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Stage | null>(null);

  // Track whether a drag just happened so we can suppress the trailing click.
  // Browsers don't always fire click after drag, but some do — and a click on
  // a card opens the candidate dialog, which shouldn't happen after drag.
  const justDraggedRef = useRef(false);

  const byStage: Record<Stage, Application[]> = {};
  stages.forEach((s) => {
    byStage[s.id] = [];
  });
  candidates.forEach((c) => {
    const s = c.stage ?? 'new';
    if (byStage[s]) {
      byStage[s].push(c);
    } else {
      // Stage no longer exists on this job (e.g. custom stage was removed).
      // Keep the row visible by parking it under "New".
      (byStage['new'] ?? (byStage['new'] = [])).push(c);
    }
  });

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.setData('application/x-candidate-id', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
    justDraggedRef.current = true;
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
    // Clear the just-dragged flag on next tick so the trailing click is suppressed
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 50);
  }

  function handleColumnDragOver(e: React.DragEvent<HTMLDivElement>, stage: Stage) {
    // preventDefault is REQUIRED for drop to fire — without it the drop is
    // silently rejected by the browser. This is the #1 reason HTML5 d-n-d
    // "doesn't work" in React.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== stage) setDropTarget(stage);
  }

  function handleColumnDragLeave(e: React.DragEvent<HTMLDivElement>, stage: Stage) {
    // Only clear if we're really leaving the column (not entering a child)
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    if (dropTarget === stage) setDropTarget(null);
  }

  function handleColumnDrop(e: React.DragEvent<HTMLDivElement>, stage: Stage) {
    e.preventDefault();
    const id =
      e.dataTransfer.getData('application/x-candidate-id') ||
      e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    setDropTarget(null);
    if (id) {
      // Don't call onMove if the candidate is already in this stage
      const existing = candidates.find((c) => c.id === id);
      if (existing && (existing.stage ?? 'new') !== stage) {
        onMove(id, stage);
      }
    }
  }

  function handleCardClick(c: Application) {
    if (justDraggedRef.current) return;
    onOpen(c);
  }

  return (
    <div className="-mx-2 flex gap-3 overflow-x-auto pb-2 no-scrollbar">
      {stages.map((meta) => {
        const tone = STAGE_TONES[meta.color];
        const cs = byStage[meta.id] ?? [];
        const isTarget = dropTarget === meta.id;
        return (
          <div
            key={meta.id}
            onDragOver={(e) => handleColumnDragOver(e, meta.id)}
            onDragLeave={(e) => handleColumnDragLeave(e, meta.id)}
            onDrop={(e) => handleColumnDrop(e, meta.id)}
            className={cn(
              'flex w-[280px] flex-shrink-0 flex-col gap-2 rounded-xl border bg-slate-50/40 p-2 transition-all',
              isTarget ? 'border-brand-400 bg-brand-50/60 shadow-soft' : 'border-slate-100'
            )}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-2 pt-1.5">
              <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
              <span className="text-[13px] font-semibold text-slate-700">{meta.label}</span>
              <span className="num text-[12px] text-slate-400">({cs.length})</span>
              {!meta.builtin && (
                <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  Custom
                </span>
              )}
            </div>

            <div className={cn('-mt-0.5 h-1 rounded-full', tone.bar)} />

            {/* Cards */}
            <div className="flex flex-col gap-2">
              {cs.length === 0 ? (
                <div
                  className={cn(
                    'rounded-lg border border-dashed p-4 text-center text-[12px]',
                    isTarget
                      ? 'border-brand-400 bg-brand-50 text-brand-600'
                      : 'border-slate-200 text-slate-400'
                  )}
                >
                  {isTarget ? 'Drop here' : 'Empty'}
                </div>
              ) : (
                cs.map((c) => (
                  <KanbanCard
                    key={c.id}
                    candidate={c}
                    dragging={draggingId === c.id}
                    onDragStart={(e) => handleDragStart(e, c.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleCardClick(c)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}

      {/* Add-stage column — only shown when a handler is provided */}
      {onAddStage && (
        <button
          type="button"
          onClick={onAddStage}
          className="group flex w-[260px] flex-shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white/60 p-6 text-slate-500 transition-all hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-600"
          title="Add a custom stage"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500 transition-colors group-hover:bg-brand-100 group-hover:text-brand-600">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-[13px] font-medium">Add stage</span>
          <span className="px-3 text-center text-[11px] text-slate-400">
            Slots in between Interview and Hired
          </span>
        </button>
      )}
    </div>
  );
}

function KanbanCard({
  candidate,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  candidate: Application;
  dragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const score = candidate.ats_score;
  const scoreTone =
    score == null
      ? 'text-slate-400'
      : score >= 70
      ? 'text-emerald-600'
      : score >= 40
      ? 'text-amber-600'
      : 'text-rose-600';
  const tags = (candidate.parsed_data?.skills ?? []).slice(0, 2);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      className={cn(
        'group relative cursor-grab rounded-lg border border-slate-100 bg-white p-3 shadow-card transition-all hover:border-brand-300 hover:shadow-soft active:cursor-grabbing',
        dragging && 'opacity-30'
      )}
    >
      {/* Drag handle indicator (visible on hover) */}
      <div className="absolute right-2 top-2 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="h-4 w-4" />
      </div>

      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
          {initials(candidate.full_name)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-slate-900">{candidate.full_name}</div>
          <div className="truncate text-[11px] text-slate-500">{candidate.email}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className={cn('num font-semibold', scoreTone)}>
          {score != null ? `${score}%` : '—'}
          <span className="ml-0.5 text-[10px] font-normal text-slate-400">ATS</span>
        </span>
        <span className="text-[11px] text-slate-400">{formatDate(candidate.created_at)}</span>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
