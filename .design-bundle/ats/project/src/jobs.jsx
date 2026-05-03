// Jobs list view

const { Icons, UI, MOCK } = window;
const { Input, Button, Badge, cn } = UI;

function JobsView({ navigate }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("All");

  const filtered = MOCK.JOBS.filter((j) => {
    if (filter !== "All" && j.status !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!j.title.toLowerCase().includes(q) && !j.location.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Jobs</h1>
      <p className="mt-1 text-slate-500">Track and manage all your open roles in one place.</p>

      <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          icon={<Icons.Search className="w-4 h-4" />}
          placeholder="Search jobs by title or location..."
          className="max-w-md flex-1"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <UI.Select className="w-44" defaultValue="recent">
            <option value="recent">Most recent</option>
            <option value="applicants">Most applicants</option>
            <option value="ats">Highest ATS avg</option>
          </UI.Select>
          <div className="flex items-center gap-1 border-b border-slate-200">
          {["All", "Open", "Closed"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
                filter === t ? "text-brand-600 border-brand-500" : "text-slate-500 border-transparent hover:text-slate-700"
              )}
            >
              {t} {t !== "All" && <span className="text-slate-400 num">({MOCK.JOBS.filter((j) => j.status === t).length})</span>}
            </button>
          ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-12 text-center py-16 bg-white border border-slate-100 rounded-2xl">
          <div className="text-slate-500">No jobs match. Try adjusting your filters or clearing them.</div>
          <button onClick={() => { setFilter("All"); setQuery(""); }} className="mt-3 text-brand-600 font-medium text-sm hover:text-brand-700">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6">
          {filtered.map((j) => (
            <button
              key={j.id}
              onClick={() => navigate({ name: "job-detail", jobId: j.id, jobTitle: j.title, tab: "candidates" })}
              className="text-left bg-white border border-slate-100 rounded-2xl p-5 shadow-card hover:shadow-soft hover:border-slate-200 transition-all group relative"
            >
              {j.isNew && <span className="absolute top-3 left-3"><Badge color="brand" size="xs">New</Badge></span>}
              <div className="flex items-start justify-between gap-3">
                <div className={cn("min-w-0", j.isNew && "mt-5")}>
                  <h3 className="font-semibold text-slate-900 text-[15px] leading-tight">{j.title}</h3>
                </div>
                <Badge color={j.status === "Open" ? "emerald" : "slate"} size="xs" dot>{j.status}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[13px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Icons.MapPin className="w-3.5 h-3.5" />{j.location}</span>
                <span className="inline-flex items-center gap-1.5"><Icons.Briefcase className="w-3.5 h-3.5" />{j.expMin}–{j.expMax} yrs</span>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-[13px] text-slate-600">
                  <Icons.Users className="w-4 h-4 text-slate-400" />
                  <span className="num font-medium">{j.applicants}</span>
                  <span className="text-slate-400">applicants</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-slate-400">ATS</span>
                  <UI.AtsPill score={j.ats} />
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[12px] text-slate-400">
                <span>{j.postedAt}</span>
                <span className="text-brand-600 opacity-0 group-hover:opacity-100 font-medium inline-flex items-center gap-0.5 transition-opacity">View applicants <Icons.ArrowRight className="w-3 h-3" /></span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm">
          <Button variant="secondary" size="sm" icon={<Icons.ChevronLeft className="w-3.5 h-3.5" />}>Previous</Button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={cn(
                "w-9 h-9 rounded-lg font-medium",
                n === 1 ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {n}
            </button>
          ))}
          <span className="text-slate-400 px-1">…</span>
          <button className="w-9 h-9 rounded-lg font-medium text-slate-600 hover:bg-slate-100">4</button>
          <Button variant="secondary" size="sm">Next <Icons.ChevronRight className="w-3.5 h-3.5" /></Button>
        </div>
      )}
    </div>
  );
}

window.JobsView = JobsView;
