// Candidates tab — list view, filter popover, bulk actions, modal trigger

const { Icons, UI, MOCK } = window;
const { Avatar, Badge, AtsPill, StagePlain, Button, IconButton, Input, Checkbox, Toggle, cn } = UI;

function Candidates({ job, candidates, stageCounts }) {
  const [stage, setStage] = React.useState("all");
  const [view, setView] = React.useState("list"); // list | kanban
  const [query, setQuery] = React.useState("");
  // Pre-select first 3 to demo the bulk action bar
  const [selected, setSelected] = React.useState(new Set(candidates.slice(0, 3).map((c) => c.id)));
  const [openCandidate, setOpenCandidate] = React.useState(null);
  const [showFilter, setShowFilter] = React.useState(false);
  const [sortDir, setSortDir] = React.useState(null); // null|asc|desc
  const [list, setList] = React.useState(candidates);

  React.useEffect(() => { setList(candidates); }, [candidates]);

  const visible = React.useMemo(() => {
    let arr = list;
    if (stage !== "all") arr = arr.filter((c) => c.stage === stage);
    if (query) {
      const q = query.toLowerCase();
      arr = arr.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    if (sortDir) {
      arr = [...arr].sort((a, b) => sortDir === "asc" ? a.ats - b.ats : b.ats - a.ats);
    }
    return arr;
  }, [list, stage, query, sortDir]);

  const toggleSel = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const moveStage = (id, newStage) => {
    setList((prev) => prev.map((c) => c.id === id ? { ...c, stage: newStage } : c));
  };

  const stageTabs = [
    { id: "all",         label: `All (${stageCounts.all})` },
    { id: "new",         label: `New (${stageCounts.new})` },
    { id: "shortlisted", label: `Shortlisted (${stageCounts.shortlisted})` },
    { id: "interview",   label: `Interview (${stageCounts.interview})` },
    { id: "hired",       label: `Hired (${stageCounts.hired})` },
    { id: "rejected",    label: `Rejected (${stageCounts.rejected})` },
  ];

  return (
    <div className="mt-5">
      {/* Sub-toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-full p-1">
          {stageTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setStage(t.id)}
              className={cn(
                "px-3 py-1 rounded-full text-[12.5px] font-medium transition-all",
                stage === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Icons.Search className="w-4 h-4" />}
            placeholder="Search by name…"
            className="w-60"
          />
          <div className="relative">
            <IconButton onClick={() => setShowFilter((s) => !s)} active={showFilter} title="Filter candidates">
              <Icons.Filter className="w-4 h-4" />
            </IconButton>
            {showFilter && <FilterPopover onClose={() => setShowFilter(false)} />}
          </div>
          <IconButton title="Sort by ATS" onClick={() => setSortDir(sortDir === "desc" ? "asc" : sortDir === "asc" ? null : "desc")} active={!!sortDir}>
            <Icons.ArrowUpDown className="w-4 h-4" />
          </IconButton>
          <div className="ml-1 flex items-center gap-1">
            <IconButton active={view === "list"} onClick={() => setView("list")} title="List view"><Icons.ListIcon className="w-4 h-4" /></IconButton>
            <IconButton active={view === "kanban"} onClick={() => setView("kanban")} title="Kanban view"><Icons.Columns className="w-4 h-4" /></IconButton>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <CandidatesList
          rows={visible}
          selected={selected}
          toggleSel={toggleSel}
          onOpen={setOpenCandidate}
          sortDir={sortDir}
          onSortToggle={() => setSortDir(sortDir === "desc" ? "asc" : sortDir === "asc" ? null : "desc")}
        />
      ) : (
        <window.KanbanBoard candidates={visible.length ? visible : list} onMove={moveStage} onOpen={setOpenCandidate} />
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && view === "list" && (
        <div className="sticky bottom-4 mt-4 z-30">
          <div className="mx-auto max-w-3xl bg-slate-900 text-white rounded-2xl shadow-lift px-5 py-3 flex items-center gap-3">
            <div className="text-sm">
              <span className="num font-semibold">{selected.size}</span> candidate{selected.size > 1 ? "s" : ""} selected
            </div>
            <div className="flex-1" />
            <button className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15">
              Move to stage <Icons.ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15">
              Add tag <Icons.ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button className="text-sm font-medium px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600">Reject all</button>
            <button onClick={() => setSelected(new Set())} className="text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10">
              Clear
            </button>
          </div>
        </div>
      )}

      {openCandidate && <CandidateModal candidate={openCandidate} onClose={() => setOpenCandidate(null)} onMove={(s) => { moveStage(openCandidate.id, s); setOpenCandidate({ ...openCandidate, stage: s }); }} />}
    </div>
  );
}

function CandidatesList({ rows, selected, toggleSel, onOpen, sortDir, onSortToggle }) {
  const pageRows = rows.slice(0, 10);
  return (
    <div className="mt-4 bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">
              <th className="py-3 pl-5 pr-2 w-10"></th>
              <th className="text-left py-3 pr-3 w-16">#No</th>
              <th className="text-left py-3 px-3">Applicant name</th>
              <th className="text-left py-3 px-3">Applied Date</th>
              <th className="text-left py-3 px-3">
                <button onClick={onSortToggle} className="inline-flex items-center gap-1 hover:text-slate-600">
                  <Icons.Sparkles className="w-3 h-3" />
                  ATS Score
                  {sortDir === "desc" && <Icons.ChevronDown className="w-3 h-3" />}
                  {sortDir === "asc" && <Icons.ChevronUp className="w-3 h-3" />}
                </button>
              </th>
              <th className="text-left py-3 px-3">Current Stage</th>
              <th className="text-left py-3 px-3"><span className="inline-flex items-center gap-1"><Icons.Tag className="w-3 h-3" /> Tags</span></th>
              <th className="text-left py-3 px-3"><span className="inline-flex items-center gap-1"><Icons.Globe className="w-3 h-3" /> Source</span></th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-500">
                  No candidates match your filters.
                </td>
              </tr>
            )}
            {pageRows.map((c) => (
              <tr
                key={c.id}
                onClick={() => onOpen(c)}
                className={cn("hover:bg-brand-50/40 transition-colors cursor-pointer group", selected.has(c.id) && "bg-brand-50/40")}
              >
                <td className="py-3.5 pl-5 pr-2">
                  <Checkbox checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} />
                </td>
                <td className="py-3.5 pr-3 text-slate-400 num">#{String(c.idx).padStart(2, "0")}</td>
                <td className="py-3.5 px-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={c.avatar} name={c.name} size={36} />
                    <div className="leading-tight">
                      <div className="font-medium text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-slate-600">{c.applied}</td>
                <td className="py-3.5 px-3"><AtsPill score={c.ats} /></td>
                <td className="py-3.5 px-3"><StagePlain stage={c.stage} daysInStage={c.daysInStage} /></td>
                <td className="py-3.5 px-3">
                  <div className="flex items-center gap-1 flex-wrap">
                    {c.tags.map((t) => (
                      <span key={t} className="text-[11px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="py-3.5 px-3"><UI.SourceTag source={c.source} /></td>
                <td className="py-3.5 px-3 text-right pr-5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[11px] text-brand-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-0.5">Open <Icons.ArrowRight className="w-3 h-3" /></span>
                    <button title="More actions" className="w-8 h-8 grid place-items-center rounded-lg hover:bg-slate-100 text-slate-400"><Icons.MoreVertical className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-1.5 py-4 border-t border-slate-100 text-sm">
        <Button variant="secondary" size="sm" icon={<Icons.ChevronLeft className="w-3.5 h-3.5" />}>Previous</Button>
        <button className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500"><Icons.ChevronsLeft className="w-3.5 h-3.5 mx-auto" /></button>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} className={cn("w-9 h-9 rounded-lg font-medium num", n === 1 ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100")}>{n}</button>
        ))}
        <span className="text-slate-400 px-1">…</span>
        {[12, 13, 14].map((n) => (
          <button key={n} className="w-9 h-9 rounded-lg font-medium num text-slate-600 hover:bg-slate-100">{n}</button>
        ))}
        <button className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-500"><Icons.ChevronsRight className="w-3.5 h-3.5 mx-auto" /></button>
        <Button variant="secondary" size="sm">Next <Icons.ChevronRight className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

function FilterPopover({ onClose }) {
  const [vals, setVals] = React.useState({ minExp: "", maxExp: "", maxNotice: "", maxSalary: "", location: "", skill: "", atsOnly: false });
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-11 z-40 w-[340px] bg-white border border-slate-200 rounded-xl shadow-lift p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-slate-900 text-sm">Filters</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><Icons.X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min Experience"><Input type="number" placeholder="0" value={vals.minExp} onChange={(e) => setVals({ ...vals, minExp: e.target.value })} /></Field>
          <Field label="Max Experience"><Input type="number" placeholder="10" value={vals.maxExp} onChange={(e) => setVals({ ...vals, maxExp: e.target.value })} /></Field>
          <Field label="Max Notice (days)"><Input type="number" placeholder="60" value={vals.maxNotice} onChange={(e) => setVals({ ...vals, maxNotice: e.target.value })} /></Field>
          <Field label="Max Salary (₹L)"><Input type="number" placeholder="30" value={vals.maxSalary} onChange={(e) => setVals({ ...vals, maxSalary: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Location"><Input placeholder="e.g. Bangalore" value={vals.location} onChange={(e) => setVals({ ...vals, location: e.target.value })} /></Field></div>
          <div className="col-span-2"><Field label="Skill keyword"><Input placeholder="e.g. React" value={vals.skill} onChange={(e) => setVals({ ...vals, skill: e.target.value })} /></Field></div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-slate-700">ATS-Compliant Only</span>
          <Toggle checked={vals.atsOnly} onChange={(v) => setVals({ ...vals, atsOnly: v })} />
        </div>
        <div className="mt-4 flex items-center gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => setVals({ minExp: "", maxExp: "", maxNotice: "", maxSalary: "", location: "", skill: "", atsOnly: false })}>Reset</Button>
          <Button size="sm" onClick={onClose}>Apply</Button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[12px] text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function CandidateModal({ candidate, onClose, onMove }) {
  const c = candidate;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-lift w-full max-w-4xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar src={c.avatar} name={c.name} size={56} />
            <div>
              <div className="text-[18px] font-semibold text-slate-900">{c.name}</div>
              <div className="mt-0.5 text-sm text-slate-500 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5"><Icons.Mail className="w-3.5 h-3.5" />{c.email}</span>
                <span className="inline-flex items-center gap-1.5"><Icons.Phone className="w-3.5 h-3.5" />{c.phone}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-100 grid place-items-center text-slate-400"><Icons.X className="w-4 h-4" /></button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
          <div className="lg:col-span-2 space-y-5">
            <div>
              <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Parsed data</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <KV k="Current company" v={c.currentCompany} />
                <KV k="Current role" v={c.currentRole} />
                <KV k="Location" v={c.location} />
                <KV k="Experience" v={`${c.experience} years`} />
                <KV k="Notice period" v={`${c.noticePeriod} days`} />
                <KV k="Current salary" v={`₹${c.currentSalary}L`} />
                <KV k="Expected salary" v={`₹${c.expectedSalary}L`} />
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Skills</h4>
              <div className="flex flex-wrap gap-2">
                {[...c.tags, "Tailwind", "GraphQL", "Jest"].map((t, i) => (
                  <span key={i} className="px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-[12px] font-medium text-slate-700">{t}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Resume preview</h4>
              <div className="aspect-[3/2] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 grid place-items-center text-slate-400 text-sm">
                <div className="text-center">
                  <Icons.FileText className="w-8 h-8 mx-auto mb-2" />
                  PDF Preview · {c.name.split(" ")[0]}_Resume.pdf
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <div className="text-[12px] text-slate-500 uppercase tracking-wider">ATS Score</div>
              <div className={cn("mt-1 text-[44px] font-semibold leading-none num",
                c.ats >= 70 ? "text-emerald-600" : c.ats >= 40 ? "text-amber-600" : "text-rose-600")}>
                {c.ats}<span className="text-slate-400 text-2xl">/100</span>
              </div>
              <div className="mt-3 text-[13px]">
                <div className="font-medium text-slate-700">Stage</div>
                <div className="mt-1"><UI.StageBadge stage={c.stage} /></div>
              </div>
            </div>

            {c.atsIssues.length > 0 && (
              <div>
                <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-2">ATS Issues</h4>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {c.atsIssues.map((i, k) => (
                    <li key={k} className="flex gap-2"><Icons.AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />{i}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Screening Answers</h4>
              <div className="space-y-3">
                {c.answers.map((a, i) => (
                  <div key={i} className="text-sm">
                    <div className="font-medium text-slate-700">Q: {a.q}</div>
                    <div className="mt-0.5 text-slate-600">A: {a.a}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50/40">
          <div className="flex items-center gap-2 flex-wrap">
            <select onChange={(e) => onMove(e.target.value)} value={c.stage} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="new">New</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview">Interview</option>
              <option value="hired">Hired</option>
              <option value="rejected">Rejected</option>
            </select>
            <Button variant="secondary" size="sm" icon={<Icons.Tag className="w-3.5 h-3.5" />}>Add tag</Button>
            <Button variant="secondary" size="sm" icon={<Icons.Refresh className="w-3.5 h-3.5" />}>Re-parse resume</Button>
          </div>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div>
      <div className="text-slate-500 text-xs">{k}</div>
      <div className="font-medium text-slate-900 mt-0.5">{v}</div>
    </div>
  );
}

window.Candidates = Candidates;
