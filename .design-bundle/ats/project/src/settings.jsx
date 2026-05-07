// Account Settings view

const { Icons, UI } = window;
const { Avatar, Input, Button, cn } = UI;

const SETTINGS_KEY = "photonx:settings:v1";

function readSettings() {
  try {
    const raw = window.localStorage && window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) { return {}; }
}

function writeSettings(next) {
  try { window.localStorage && window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
}

function FormSection({ title, description, children }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-card p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-900 text-[15px]">{title}</h3>
        {description && <p className="text-[13px] text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="text-[13px] font-medium text-slate-700 mb-1.5">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[12px] text-slate-500">{hint}</div>}
    </div>
  );
}

function Settings({ navigate }) {
  const initial = React.useMemo(() => readSettings(), []);
  const [fullName, setFullName] = React.useState(initial.fullName || "");
  const [email, setEmail] = React.useState(initial.email || "");
  const [company, setCompany] = React.useState(initial.company || "");
  const [savedAt, setSavedAt] = React.useState(null);

  const onSave = () => {
    const next = { ...initial, fullName: fullName.trim(), email: email.trim(), company: company.trim() };
    writeSettings(next);
    setSavedAt(Date.now());
  };

  const onReset = () => {
    setFullName(initial.fullName || "");
    setEmail(initial.email || "");
    setCompany(initial.company || "");
    setSavedAt(null);
  };

  const initials = (fullName || email || "A").trim().slice(0, 1).toUpperCase();

  return (
    <div className="px-8 py-6 max-w-2xl mx-auto">
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Account settings</h1>
      <p className="mt-1 text-slate-500">Update your profile details. Changes are saved to this browser.</p>

      <div className="mt-6 space-y-6">
        <FormSection title="Profile" description="This is how teammates will see you across PhotonX ATS.">
          <div className="flex items-center gap-4">
            <Avatar src="https://i.pravatar.cc/96?img=49" name={fullName || initials} size={64} />
            <div className="text-[13px] text-slate-500">
              Avatar comes from your linked profile picture.
            </div>
          </div>
          <Field label="Full name">
            <Input placeholder="e.g. Darlene Robertson" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email" hint="Used for sign-in and notifications.">
            <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Company">
            <Input placeholder="e.g. PhotonX" value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
        </FormSection>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-[12.5px] text-slate-500 inline-flex items-center gap-1.5">
            {savedAt && <><Icons.CheckCircle className="w-4 h-4 text-emerald-500" /> Saved just now</>}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onReset}>Reset</Button>
            <Button onClick={onSave}>Save changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Settings = Settings;
