// Reusable UI primitives

const { Icons } = window;

const cn = (...xs) => xs.filter(Boolean).join(" ");

function Avatar({ src, name, size = 32, ring = false }) {
  const initials = (name || "")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const [err, setErr] = React.useState(false);
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-600 font-medium overflow-hidden flex-shrink-0",
        ring && "ring-2 ring-white"
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {!err && src ? (
        <img src={src} alt={name} onError={() => setErr(true)} className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function Badge({ children, color = "slate", size = "sm", dot = false, className = "" }) {
  const palette = {
    slate:   "bg-slate-50 text-slate-700 ring-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    green:   "bg-emerald-50 text-emerald-700 ring-emerald-200",
    red:     "bg-rose-50 text-rose-700 ring-rose-200",
    rose:    "bg-rose-50 text-rose-700 ring-rose-200",
    amber:   "bg-amber-50 text-amber-700 ring-amber-200",
    yellow:  "bg-amber-50 text-amber-700 ring-amber-200",
    blue:    "bg-sky-50 text-sky-700 ring-sky-200",
    sky:     "bg-sky-50 text-sky-700 ring-sky-200",
    violet:  "bg-violet-50 text-violet-700 ring-violet-200",
    teal:    "bg-brand-50 text-brand-600 ring-brand-200",
    brand:   "bg-brand-50 text-brand-600 ring-brand-200",
  };
  const dotClr = {
    slate: "bg-slate-400", emerald: "bg-emerald-500", green: "bg-emerald-500",
    red: "bg-rose-500", rose: "bg-rose-500", amber: "bg-amber-500", yellow: "bg-amber-500",
    blue: "bg-sky-500", sky: "bg-sky-500", violet: "bg-violet-500", teal: "bg-brand-500", brand: "bg-brand-500",
  };
  const sz = size === "xs" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-medium ring-1", palette[color] || palette.slate, sz, className)}>
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", dotClr[color] || dotClr.slate)} />}
      {children}
    </span>
  );
}

// Standardized ATS pill — used everywhere. Just the number, color-coded.
function AtsPill({ score }) {
  if (score == null) return <Badge color="slate">—</Badge>;
  let color = "emerald";
  if (score < 40) color = "rose";
  else if (score < 70) color = "amber";
  return <Badge color={color}>{score}</Badge>;
}

const STAGE_INFO = {
  new:         { label: "New",         color: "blue"    },
  shortlisted: { label: "Shortlisted", color: "amber"   },
  interview:   { label: "Interview",   color: "violet"  },
  hired:       { label: "Hired",       color: "emerald" },
  rejected:    { label: "Rejected",    color: "rose"    },
};

function StageBadge({ stage, daysInStage = null }) {
  const s = STAGE_INFO[stage] || STAGE_INFO.new;
  const stale = daysInStage != null && daysInStage > 7 && stage !== "hired" && stage !== "rejected";
  return (
    <span className="inline-flex items-center gap-2">
      <Badge color={s.color} dot>{s.label}</Badge>
      {daysInStage != null && (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 num">
          {stale && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
          {daysInStage}d
        </span>
      )}
    </span>
  );
}

const StagePlain = StageBadge;

function Button({ as: As = "button", variant = "primary", size = "md", className = "", icon, children, ...props }) {
  const variants = {
    primary:   "bg-brand-500 hover:bg-brand-600 text-white shadow-sm",
    secondary: "bg-white hover:bg-slate-50 text-slate-800 border border-slate-200",
    ghost:     "bg-transparent hover:bg-slate-100 text-slate-700",
    danger:    "bg-rose-600 hover:bg-rose-700 text-white",
    outline:   "bg-white hover:bg-brand-50 text-brand-600 border border-brand-500",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-lg",
    md: "px-4 py-2 text-sm rounded-lg",
    lg: "px-5 py-2.5 text-[15px] rounded-lg",
  };
  return (
    <As
      className={cn(
        "inline-flex items-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </As>
  );
}

function IconButton({ className = "", children, active = false, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors",
        active ? "border-brand-500 text-brand-600 bg-brand-50" : "border-slate-200 text-slate-600 hover:bg-slate-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Input({ icon, className = "", ...props }) {
  return (
    <div className={cn("relative", className)}>
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {icon}
        </div>
      )}
      <input
        className={cn(
          "w-full h-10 rounded-lg border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-colors",
          icon ? "pl-9 pr-3" : "px-3"
        )}
        {...props}
      />
    </div>
  );
}

function Select({ children, className = "", ...props }) {
  return (
    <div className={cn("relative", className)}>
      <select
        className="w-full h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
        {...props}
      >
        {children}
      </select>
      <Icons.ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

function Checkbox({ checked, onChange, className = "" }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange?.(!checked); }}
      className={cn(
        "w-[18px] h-[18px] rounded-[5px] border flex-shrink-0 inline-flex items-center justify-center transition-colors",
        checked ? "bg-brand-500 border-brand-500 text-white" : "bg-white border-slate-300 hover:border-slate-400",
        className
      )}
    >
      {checked && <Icons.Check className="w-3 h-3" strokeWidth={3} />}
    </button>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className={cn(
        "w-9 h-5 rounded-full relative transition-colors",
        checked ? "bg-brand-500" : "bg-slate-300"
      )}
    >
      <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}

function SourceTag({ source }) {
  const map = {
    LinkedIn: Icons.Linkedin,
    Website:  Icons.Globe,
    Twitter:  Icons.Twitter,
    Referred: Icons.UserCheck,
  };
  const Icon = map[source] || Icons.Globe;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 group">
      <Icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-500 transition-colors" />
      {source}
    </span>
  );
}

window.UI = { Avatar, Badge, AtsPill, StageBadge, StagePlain, Button, IconButton, Input, Select, Checkbox, Toggle, SourceTag, cn };
