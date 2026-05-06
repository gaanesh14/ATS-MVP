// Sidebar + Topbar shell

const { Icons, UI } = window;
const { Avatar, Button, IconButton, cn } = UI;

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
  return {
    name: cleanName || cleanEmail.split("@")[0] || "Admin",
    email: cleanEmail
  };
}

function getCurrentAdminProfile() {
  const fallback = {
    name: "Darlene Robertson",
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

function Sidebar({ route, navigate }) {
  const isDash = route.name === "dashboard";
  const isJobs = route.name === "jobs" || route.name === "job-detail" || route.name === "create-job";
  const admin = React.useMemo(() => getCurrentAdminProfile(), []);

  const NavItem = ({ active, icon, label, onClick }) => (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-medium transition-colors text-left",
        active ? "bg-brand-50 text-brand-600" : "text-slate-600 hover:bg-slate-50"
      )}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-500" />}
      <span className={cn(active ? "text-brand-600" : "text-slate-500")}>{icon}</span>
      <span>{label}</span>
    </button>
  );

  const SectionLabel = ({ children }) => (
    <div className="px-3 pt-5 pb-2 text-[11px] font-semibold tracking-[0.12em] text-slate-400">{children}</div>
  );

  return (
    <aside className="w-[244px] flex-shrink-0 border-r border-slate-100 bg-white flex flex-col">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-500 text-white grid place-items-center shadow-sm">
            <span className="text-[13px] font-bold tracking-tight">PX</span>
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-slate-900 text-[15px]">PhotonX ATS</div>
            <div className="text-xs text-slate-500">Hire smarter</div>
          </div>
        </div>
      </div>
      <div className="mx-5 border-t border-slate-100" />

      {/* Nav */}
      <div className="flex-1 px-3 pb-4">
        <SectionLabel>OVERVIEW</SectionLabel>
        <NavItem
          active={isDash}
          icon={<Icons.LayoutDashboard className="w-[18px] h-[18px]" />}
          label="Dashboard"
          onClick={() => navigate({ name: "dashboard" })}
        />
        <SectionLabel>RECRUITMENT</SectionLabel>
        <NavItem
          active={isJobs}
          icon={<Icons.Briefcase className="w-[18px] h-[18px]" />}
          label="Jobs"
          onClick={() => navigate({ name: "jobs" })}
        />
      </div>

      {/* User */}
      <div className="mx-5 border-t border-slate-100" />
      <div className="px-4 py-4">
        <button className="w-full flex items-center gap-3 p-1.5 rounded-lg hover:bg-slate-50 transition-colors">
          <Avatar src="https://i.pravatar.cc/64?img=49" name={admin.name} size={36} />
          <div className="flex-1 text-left leading-tight min-w-0">
            <div className="font-semibold text-slate-900 text-sm truncate">{admin.name}</div>
            <div className="text-xs text-slate-500 truncate">{admin.email}</div>
          </div>
          <Icons.ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </aside>
  );
}

function Breadcrumb({ items, onBack }) {
  return (
    <div className="flex items-center gap-2 text-[14px]">
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-lg hover:bg-slate-100 grid place-items-center text-slate-500"
        title="Back"
      >
        <Icons.ChevronLeft className="w-4 h-4" />
      </button>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-slate-300">/</span>}
          <span className={i === items.length - 1 ? "text-slate-900 font-medium" : "text-slate-500"}>
            {it}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function Topbar({ route, navigate }) {
  const items =
    route.name === "dashboard"   ? ["Dashboard"] :
    route.name === "jobs"        ? ["Jobs"] :
    route.name === "job-detail"  ? ["Jobs", route.jobTitle || "Job"] :
    route.name === "create-job"  ? ["Jobs", "Create new job"] :
    ["PhotonX"];

  const cta =
    route.name === "job-detail" ? (
      <Button variant="primary" icon={<Icons.Eye className="w-4 h-4" />} onClick={() => navigate({ name: "public", jobId: route.jobId })}>
        Preview public page
      </Button>
    ) : route.name === "create-job" ? null : (
      <Button variant="primary" icon={<Icons.Plus className="w-4 h-4" />} onClick={() => navigate({ name: "create-job" })}>
        Create New Job
      </Button>
    );

  const onBack = () => {
    if (route.name === "job-detail") navigate({ name: "jobs" });
    else if (route.name === "create-job") navigate({ name: "jobs" });
    else if (route.name === "dashboard") navigate({ name: "dashboard" });
    else navigate({ name: "dashboard" });
  };

  return (
    <div className="h-16 px-6 flex items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-sm">
      <Breadcrumb items={items} onBack={onBack} />
      <div className="flex items-center gap-2">
        <IconButton title="Search"><Icons.Search className="w-4 h-4" /></IconButton>
        <button className="relative w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 grid place-items-center" title="Notifications">
          <Icons.Bell className="w-4 h-4" />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">2</span>
        </button>
        <div className="flex items-center pl-2">
          <div className="flex -space-x-2">
            <img src="https://i.pravatar.cc/64?img=11" className="w-8 h-8 rounded-full ring-2 ring-white object-cover" />
            <img src="https://i.pravatar.cc/64?img=22" className="w-8 h-8 rounded-full ring-2 ring-white object-cover" />
            <img src="https://i.pravatar.cc/64?img=34" className="w-8 h-8 rounded-full ring-2 ring-white object-cover" />
          </div>
          <span className="ml-1.5 inline-flex items-center h-7 px-2 rounded-full bg-slate-100 text-[12px] font-medium text-slate-600 border border-white">+10</span>
        </div>
        {cta}
      </div>
    </div>
  );
}

window.Shell = { Sidebar, Topbar };
