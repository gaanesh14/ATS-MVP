// Kanban board with HTML5 drag-and-drop

const { Icons, UI, MOCK } = window;
const { Avatar, AtsPill, cn } = UI;

const STAGE_META = {
  new:         { label: "New",         color: "border-sky-200 bg-sky-50/40 text-sky-700" },
  shortlisted: { label: "Shortlisted", color: "border-amber-200 bg-amber-50/40 text-amber-700" },
  interview:   { label: "Interview",   color: "border-violet-200 bg-violet-50/40 text-violet-700" },
  hired:       { label: "Hired",       color: "border-emerald-200 bg-emerald-50/40 text-emerald-700" },
  rejected:    { label: "Rejected",    color: "border-rose-200 bg-rose-50/40 text-rose-700" },
};

function KanbanBoard({ candidates, onMove, onOpen }) {
  const [draggingId, setDraggingId] = React.useState(null);
  const [hoverStage, setHoverStage] = React.useState(null);

  const groups = React.useMemo(() => {
    const g = { new: [], shortlisted: [], interview: [], hired: [], rejected: [] };
    candidates.forEach((c) => { (g[c.stage] || g.new).push(c); });
    return g;
  }, [candidates]);

  const handleDragStart = (id) => (e) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };
  const handleDragEnd = () => { setDraggingId(null); setHoverStage(null); };

  const onDropCol = (stageId) => (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    if (id) onMove(id, stageId);
    setDraggingId(null); setHoverStage(null);
  };

  return (
    <div className="mt-4 overflow-x-auto pb-4 scrollbar-thin">
      <div className="flex items-start gap-4 min-w-max">
        {Object.keys(STAGE_META).map((sid) => {
          const meta = STAGE_META[sid];
          const items = groups[sid] || [];
          const isHover = hoverStage === sid && draggingId;
          return (
            <div
              key={sid}
              onDragOver={(e) => { e.preventDefault(); setHoverStage(sid); }}
              onDragLeave={() => setHoverStage((h) => h === sid ? null : h)}
              onDrop={onDropCol(sid)}
              className={cn(
                "w-[300px] flex-shrink-0 rounded-2xl border bg-white transition-colors",
                isHover ? "border-brand-300 bg-brand-50/40" : "border-slate-100"
              )}
            >
              <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-block w-2 h-2 rounded-full",
                    sid === "new" ? "bg-sky-500" :
                    sid === "shortlisted" ? "bg-amber-500" :
                    sid === "interview" ? "bg-violet-500" :
                    sid === "hired" ? "bg-emerald-500" : "bg-rose-500"
                  )} />
                  <h4 className="font-semibold text-sm text-slate-900">{meta.label}</h4>
                  <span className="text-xs text-slate-400 num">({items.length})</span>
                </div>
                <button title={`Add candidate to ${meta.label}`} className="w-7 h-7 rounded-full hover:bg-slate-100 grid place-items-center text-slate-400 border border-transparent hover:border-slate-200">
                  <Icons.Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 space-y-2 max-h-[640px] overflow-y-auto scrollbar-thin">
                {items.slice(0, 8).map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={handleDragStart(c.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onOpen(c)}
                    className={cn(
                      "border border-slate-100 rounded-xl p-3 cursor-grab active:cursor-grabbing bg-white hover:border-slate-200 transition-all",
                      draggingId === c.id && "opacity-40 shadow-lift"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar src={c.avatar} name={c.name} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 truncate">{c.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{c.email}</div>
                      </div>
                    </div>
                <div className="mt-3 flex items-center justify-between">
                  <AtsPill score={c.ats} />
                  <span className={UI.cn("text-[11px] num inline-flex items-center gap-1", c.daysInStage > 7 ? "text-rose-600" : "text-slate-400")}>
                    {c.daysInStage > 7 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                    {c.daysInStage}d in stage
                  </span>
                </div>
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      {c.tags.slice(0, 2).map((t) => (
                        <span key={t} className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-6">Drop candidates here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.KanbanBoard = KanbanBoard;
