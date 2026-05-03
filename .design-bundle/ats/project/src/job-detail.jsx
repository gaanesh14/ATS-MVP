// Job Detail view — header, info strip, tabs

const { Icons, UI, MOCK } = window;
const { Avatar, Badge, Button, IconButton, Input, cn } = UI;

function InfoChip({ icon, label, value, edit }) {
  return (
    <div className="flex-1 min-w-[160px] flex items-center gap-3 px-5 py-3.5">
      <div className="text-slate-400">{icon}</div>
      <div className="leading-tight">
        <div className="text-[12px] text-slate-500">{label}</div>
        <div className="mt-0.5 text-[14px] font-semibold text-slate-900 inline-flex items-center gap-1.5">
          {value}
          {edit && <Icons.Pencil className="w-3 h-3 text-slate-400" />}
        </div>
      </div>
    </div>
  );
}

function JobDetail({ route, navigate }) {
  const job = MOCK.JOBS.find((j) => j.id === route.jobId) || MOCK.JOBS[0];
  const [tab, setTab] = React.useState(route.tab || "candidates");
  const [copied, setCopied] = React.useState(false);

  // Generate candidates per job (cache)
  const candidates = React.useMemo(() => {
    const idNum = parseInt(job.id.slice(1), 10);
    return MOCK.makeCandidates(Math.max(40, job.applicants), idNum);
  }, [job.id]);

  const stageCounts = React.useMemo(() => {
    const counts = { all: candidates.length, new: 0, shortlisted: 0, interview: 0, hired: 0, rejected: 0 };
    candidates.forEach((c) => { counts[c.stage]++; });
    return counts;
  }, [candidates]);

  return (
    <div className="px-8 py-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="inline-flex items-center gap-2 group">
              <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">{job.title}</h1>
              <Icons.ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
            </button>
            <Badge color={job.status === "Open" ? "emerald" : "slate"} dot>{job.status === "Open" ? "Active" : "Closed"}</Badge>
          </div>
          <div className="mt-2 text-[13px] text-slate-500">
            <span className="num">{job.applicants} applicants</span>
            <span className="text-slate-300 mx-2">•</span>
            <span className="num">Avg ATS {job.ats}</span>
            <span className="text-slate-300 mx-2">•</span>
            <span>Posted {job.postedAt}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton title="Job settings"><Icons.Settings className="w-4 h-4" /></IconButton>
          <IconButton title="More actions"><Icons.MoreVertical className="w-4 h-4" /></IconButton>
        </div>
      </div>

      {/* Info strip */}
      <div className="mt-5 bg-slate-50/60 border border-slate-100 rounded-2xl flex items-stretch divide-x divide-slate-100 overflow-hidden">
        <InfoChip icon={<Icons.Calendar className="w-4 h-4" />} label="Posted date" value={job.postedDate} />
        <InfoChip icon={<Icons.Building   className="w-4 h-4" />} label="Job Type"    value={job.type} />
        <InfoChip icon={<Icons.Users      className="w-4 h-4" />} label="Vacancy"     value={job.vacancies} />
        <InfoChip icon={<Icons.Briefcase  className="w-4 h-4" />} label="Experience"  value={`${job.expMin}–${job.expMax} Years`} />
        <InfoChip icon={<Icons.DollarSign className="w-4 h-4" />} label="Salary range" value={`₹${job.salaryMin}L – ₹${job.salaryMax}L`} />
        <InfoChip icon={<Icons.Clock      className="w-4 h-4" />} label="Deadline"    value={job.deadline} edit />
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-200 flex items-center gap-1">
        {[
          { id: "details", label: "Details" },
          { id: "candidates", label: `Candidates (${job.applicants})` },
          { id: "comments", label: "Comments" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors",
              tab === t.id ? "text-brand-600 border-brand-500" : "text-slate-500 border-transparent hover:text-slate-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <DetailsTab job={job} copied={copied} setCopied={setCopied} />
      )}

      {tab === "candidates" && (
        <window.Candidates job={job} candidates={candidates} stageCounts={stageCounts} />
      )}

      {tab === "comments" && (
        <CommentsTab />
      )}
    </div>
  );
}

function DetailsTab({ job, copied, setCopied }) {
  const link = "https://photonx.app/careers/abc-123";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      <div className="lg:col-span-2 space-y-6">
        <Section
          title="Description"
          right={<Button variant="secondary" size="sm" icon={<Icons.Pencil className="w-3.5 h-3.5" />}>Edit job</Button>}
        >
          <div className="space-y-4 text-[14px] text-slate-600 leading-relaxed">
            {MOCK.JOB_DESCRIPTION.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </Section>

        <Section title="Required skills">
          <div className="flex flex-wrap gap-2">
            {MOCK.JOB_SKILLS.map((s) => (
              <span key={s} className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-[13px] font-medium text-slate-700">{s}</span>
            ))}
          </div>
        </Section>

        <Section title="Screening Questions">
          <div className="space-y-2.5">
            {MOCK.JOB_QUESTIONS.map((q, i) => (
              <div key={i} className="flex items-start gap-3 p-3.5 border border-slate-100 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 grid place-items-center text-[12px] font-bold flex-shrink-0">Q{i+1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-slate-900">{q.q}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge color="slate" size="xs">{q.type}</Badge>
                    {q.required && <Badge color="brand" size="xs">Required</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Public apply link">
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-[13px] text-slate-600 truncate">{link}</div>
            <Button variant="secondary" size="sm" icon={<Icons.Copy className="w-3.5 h-3.5" />} onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Share via</span>
            <button className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 grid place-items-center text-sky-600"><Icons.Linkedin className="w-4 h-4" /></button>
            <button className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 grid place-items-center text-emerald-600"><Icons.MessageCircle className="w-4 h-4" /></button>
            <button className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 grid place-items-center text-slate-700"><Icons.Twitter className="w-4 h-4" /></button>
          </div>
        </Section>

        <Section title="Quick stats">
          <div className="space-y-3 text-[13px]">
            <Row k="Applications today" v="18" />
            <Row k="This week"           v="42" />
            <Row k="Avg time to review"  v="2.3 days" />
            <Row k="Conversion rate"     v="12.4%" />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{k}</span>
      <span className="font-semibold text-slate-900 num">{v}</span>
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 text-[15px]">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function CommentsTab() {
  const comments = [
    { name: "Esther Howard", avatar: "https://i.pravatar.cc/64?img=20", time: "2h ago", text: "Savannah's portfolio looks great — would love to fast-track her to interview." },
    { name: "Floyd Miles",   avatar: "https://i.pravatar.cc/64?img=14", time: "Yesterday", text: "Heads up: notice period is 90 days. Worth confirming budget." },
    { name: "Jenny Wilson",  avatar: "https://i.pravatar.cc/64?img=44", time: "3 days ago", text: "Closing this position to new applicants on Friday." },
  ];
  return (
    <div className="mt-6 max-w-2xl">
      <div className="bg-white border border-slate-100 rounded-2xl shadow-card p-6">
        <h3 className="font-semibold text-slate-900 text-[15px] mb-4">Internal team comments</h3>
        <div className="space-y-5">
          {comments.map((c, i) => (
            <div key={i} className="flex gap-3">
              <Avatar src={c.avatar} name={c.name} size={36} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 text-sm">{c.name}</span>
                  <span className="text-xs text-slate-400">{c.time}</span>
                </div>
                <div className="mt-1 text-sm text-slate-600">{c.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-end gap-2">
          <textarea
            placeholder="Write an internal note…"
            rows={2}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
          />
          <Button icon={<Icons.Send className="w-4 h-4" />}>Post</Button>
        </div>
      </div>
    </div>
  );
}

window.JobDetail = JobDetail;
