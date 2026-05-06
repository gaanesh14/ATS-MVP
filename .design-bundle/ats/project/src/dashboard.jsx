// Dashboard view

const { Icons, UI, MOCK } = window;
const { Avatar, Badge, AtsPill, StageBadge, Button, cn } = UI;

function StatCard({ icon, color, label, value, delta, onAction }) {
  const tones = {
    teal: "bg-brand-50 text-brand-600",
    blue: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600"
  };
  return (
    <button
      onClick={onAction}
      className={cn(
        "text-left bg-white border border-slate-100 rounded-2xl p-6 shadow-card flex flex-col w-full",
        onAction && "hover:border-slate-200 hover:shadow-soft transition-all cursor-pointer"
      )} style={{ padding: "15px 15px 15px 24px" }}>
      
      <div className={cn("w-11 h-11 rounded-xl grid place-items-center", tones[color])}>{icon}</div>
      <div className="mt-5 text-[14px] text-slate-500">{label}</div>
      <div className="mt-2 text-[34px] font-semibold tracking-tight num text-slate-900 leading-none">{value}</div>
      <div className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-emerald-600 font-medium">
        <Icons.ArrowUp className="w-3.5 h-3.5" />
        {delta}
      </div>
    </button>);

}

function MiniJobCard({ job, onClick }) {
  return (
    <button onClick={onClick} className="text-left bg-white border border-slate-100 rounded-2xl p-5 shadow-card hover:shadow-soft hover:border-slate-200 transition-all relative group">
      {job.isNew && <span className="absolute top-3 left-3"><Badge color="brand" size="xs">New</Badge></span>}
      <div className="flex items-start justify-between gap-3">
        <div className={cn("min-w-0", job.isNew && "mt-5")}>
          <h3 className="font-semibold text-slate-900 text-[15px] leading-tight">{job.title}</h3>
        </div>
        <Badge color={job.status === "Open" ? "emerald" : "slate"} size="xs" dot>{job.status}</Badge>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[13px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><Icons.MapPin className="w-3.5 h-3.5" />{job.location}</span>
        <span className="inline-flex items-center gap-1.5"><Icons.Briefcase className="w-3.5 h-3.5" />{job.expMin}–{job.expMax} yrs</span>
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-[13px] text-slate-600">
          <Icons.Users className="w-4 h-4 text-slate-400" />
          <span className="num font-medium">{job.applicants}</span>
          <span className="text-slate-400">applicants</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-400">ATS</span>
          <AtsPill score={job.ats} />
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[12px] text-slate-400">
        <span>{job.postedAt}</span>
        <span className="text-brand-600 opacity-0 group-hover:opacity-100 font-medium inline-flex items-center gap-0.5 transition-opacity">View applicants <Icons.ArrowRight className="w-3 h-3" /></span>
      </div>
    </button>);

}

function normalizeAdminProfile(source) {
  if (!source) return null;
  const name =
  typeof source === "string" ? source :
  source.name || source.fullName || source.full_name ||
  source.user_metadata && source.user_metadata.name || "";
  const email =
  typeof source === "object" && (source.email || source.user_metadata && source.user_metadata.email) || "";
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();
  if (!cleanName && !cleanEmail) return null;
  const resolvedName = cleanName || cleanEmail.split("@")[0] || "Admin";
  return {
    name: resolvedName,
    firstName: resolvedName.split(" ").filter(Boolean)[0] || resolvedName,
    email: cleanEmail
  };
}

function getCurrentAdminProfile() {
  const fallback = {
    name: "Darlene Robertson",
    firstName: "Darlene",
    email: "darlene@photonx.com"
  };

  try {
    const direct =
    normalizeAdminProfile(window.__ATS_CURRENT_ADMIN__) ||
    normalizeAdminProfile(window.currentAdmin) ||
    normalizeAdminProfile(window.currentUser) ||
    normalizeAdminProfile(window.loggedInAdmin);
    if (direct) return direct;

    const settingsRaw = window.localStorage && window.localStorage.getItem("photonx:settings:v1");
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw);
      const fromSettings = normalizeAdminProfile({
        name: settings && settings.fullName,
        email: settings && settings.email
      });
      if (fromSettings) return fromSettings;
    }
  } catch (error) {}

  return fallback;
}

function Dashboard({ navigate }) {
  const recent = MOCK.JOBS.slice(0, 6);
  const admin = React.useMemo(() => getCurrentAdminProfile(), []);

  // Top candidates today: synthesize a few high-ATS folks across jobs
  const topCandidates = React.useMemo(() => {
    const all = [];
    MOCK.JOBS.slice(0, 4).forEach((j, i) => {
      const cs = MOCK.makeCandidates(8, parseInt(j.id.slice(1), 10));
      cs.forEach((c) => {if (c.ats >= 80) all.push({ ...c, jobTitle: j.title, jobId: j.id });});
    });
    return all.sort((a, b) => b.ats - a.ats).slice(0, 5);
  }, []);

  const highAtsToReview = topCandidates.length;

  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      {/* Action strip */}
      <button
        onClick={() => navigate({ name: "job-detail", jobId: "j1", jobTitle: "Senior Frontend Engineer", tab: "candidates" })}
        className="w-full bg-gradient-to-r from-brand-50 to-brand-50/40 border border-brand-100 rounded-xl px-5 py-3 flex items-center justify-between gap-3 hover:border-brand-200 transition-colors group">
        
        <div className="flex items-center gap-3 text-sm">
          <span className="w-7 h-7 rounded-full bg-white grid place-items-center shadow-sm"><Icons.Sparkles className="w-3.5 h-3.5 text-brand-600" /></span>
          <span className="text-slate-700">
            <span className="font-medium">Good morning, {admin.firstName}.</span>{" "}
            <span className="text-slate-600">You have <span className="font-semibold text-brand-700 num">{highAtsToReview} candidates</span> with ATS ≥ 80 awaiting review</span>
          </span>
        </div>
        <Icons.ArrowRight className="w-4 h-4 text-brand-600 group-hover:translate-x-0.5 transition-transform" />
      </button>

      <div className="mt-6">
        <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">Dashboard</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
        <StatCard color="teal" icon={<Icons.Briefcase className="w-5 h-5" />} label="Active Jobs" value="8" delta="2 new this week" onAction={() => navigate({ name: "jobs" })} />
        <StatCard color="blue" icon={<Icons.Users className="w-5 h-5" />} label="Total Applicants" value="247" delta="18 today" />
        <StatCard color="amber" icon={<Icons.TrendingUp className="w-5 h-5" />} label="New This Week" value="42" delta="23% vs last week" />
        <StatCard color="violet" icon={<Icons.Target className="w-5 h-5" />} label="Avg ATS Score" value="76" delta="4 pts vs last month" />
      </div>

      {/* Top candidates today */}
      <div className="mt-10 flex items-end justify-between">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">Top candidates today</h2>
          <p className="mt-0.5 text-sm text-slate-500">High-ATS applicants worth a closer look.</p>
        </div>
        <button className="text-[13px] font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
          See all <Icons.ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        {topCandidates.map((c) =>
        <button
          key={c.id}
          onClick={() => navigate({ name: "job-detail", jobId: c.jobId, jobTitle: c.jobTitle, tab: "candidates" })}
          className="flex-shrink-0 w-[260px] text-left bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:shadow-soft hover:border-slate-200 transition-all">
          
            <div className="flex items-center gap-3">
              <Avatar src={c.avatar} name={c.name} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-900 truncate">{c.name}</div>
                <div className="text-xs text-slate-500 truncate">{c.jobTitle}</div>
              </div>
              <AtsPill score={c.ats} />
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="num">Applied {c.applied}</span>
              <span className="text-brand-600 font-medium inline-flex items-center gap-0.5">View <Icons.ArrowRight className="w-3 h-3" /></span>
            </div>
          </button>
        )}
      </div>

      <div className="mt-10 flex items-end justify-between">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">Recent Jobs</h2>
        <button onClick={() => navigate({ name: "jobs" })} className="text-[13px] font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
          View all jobs <Icons.ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-4">
        {recent.map((j) =>
        <MiniJobCard key={j.id} job={j} onClick={() => navigate({ name: "job-detail", jobId: j.id, jobTitle: j.title, tab: "candidates" })} />
        )}
      </div>

      <div className="mt-12 flex items-end justify-between">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">Recent Applicants</h2>
        <button className="text-[13px] font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
          View all <Icons.ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-4 bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase bg-slate-50/50">
              <th className="text-left py-3 px-5 w-12">#</th>
              <th className="text-left py-3 px-5">Applicant</th>
              <th className="text-left py-3 px-5">Job</th>
              <th className="text-left py-3 px-5">Applied</th>
              <th className="text-left py-3 px-5">ATS Score</th>
              <th className="text-left py-3 px-5">Stage</th>
              <th className="text-left py-3 px-5">Source</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {MOCK.RECENT_APPLICANTS.map((a, i) => {
              const stages = ["new", "shortlisted", "interview", "shortlisted", "new"];
              return (
                <tr key={a.idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-5 text-slate-400 num">#0{a.idx}</td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      <Avatar src={a.avatar} name={a.name} size={36} />
                      <div className="leading-tight">
                        <div className="font-medium text-slate-900">{a.name}</div>
                        <div className="text-xs text-slate-500">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-5 text-slate-600">{a.job}</td>
                  <td className="py-3.5 px-5 text-slate-600">{a.applied}</td>
                  <td className="py-3.5 px-5"><AtsPill score={a.ats} /></td>
                  <td className="py-3.5 px-5"><StageBadge stage={stages[i]} /></td>
                  <td className="py-3.5 px-5"><UI.SourceTag source={a.source} /></td>
                  <td className="py-3.5 px-5 text-slate-400">
                    <button title="More actions" className="w-8 h-8 grid place-items-center rounded-lg hover:bg-slate-100"><Icons.MoreVertical className="w-4 h-4" /></button>
                  </td>
                </tr>);

            })}
          </tbody>
        </table>
      </div>
    </div>);

}

window.Dashboard = Dashboard;
