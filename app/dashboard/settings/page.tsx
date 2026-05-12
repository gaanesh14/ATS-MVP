'use client';

import { useEffect, useState } from 'react';
import {
  User,
  Building2,
  Bell,
  Shield,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Key,
  Plug,
  Calendar,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/shell/auth-provider';
import { can } from '@/lib/rbac';
import { authedFetch } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

// Profile + notification preferences persist to localStorage. The display
// name and job title also write back to team_members so the rest of the
// dashboard (sidebar, team list) reflects the change immediately.
const STORAGE_KEY = 'photonx:settings:v1';

type Settings = {
  fullName: string;
  email: string;
  jobTitle: string;
  orgName: string;
  orgWebsite: string;
  timezone: string;
  notifyNewApplicant: boolean;
  notifyDailyDigest: boolean;
  notifyHighAts: boolean;
};

// Org/notification-only defaults. Profile fields seed from the auth user.
const DEFAULTS: Settings = {
  fullName: '',
  email: '',
  jobTitle: '',
  orgName: 'PhotonX',
  orgWebsite: 'https://photonx.com',
  timezone: 'Asia/Kolkata',
  notifyNewApplicant: true,
  notifyDailyDigest: true,
  notifyHighAts: true,
};

export default function SettingsPage() {
  const { member, refreshMember } = useAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [tab, setTab] = useState<
    'profile' | 'organization' | 'notifications' | 'security' | 'integrations'
  >('profile');

  // Two ways to land on the Integrations tab:
  //   • `?tab=integrations`     — direct deep-link (used by the "Connect
  //                                in Settings → Integrations" banner in
  //                                the schedule dialog)
  //   • `?integration=google&…` — the OAuth callback redirects here so
  //                                the post-connect flash is visible
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('integration') === 'google' ||
      params.get('tab') === 'integrations'
    ) {
      setTab('integrations');
    }
  }, []);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const canEditOrg = can(member?.role, 'settings.edit_org');

  // Seed from member + localStorage. Member fields take precedence on first
  // load so the live name/email/title from team_members win over any stale
  // localStorage snapshot.
  useEffect(() => {
    let stored: Partial<Settings> = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    setSettings((s) => ({
      ...s,
      ...stored,
      fullName: member?.name ?? stored.fullName ?? '',
      email: member?.email ?? stored.email ?? '',
      jobTitle: member?.title ?? stored.jobTitle ?? '',
    }));
    setHydrated(true);
  }, [member]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error('Failed to save settings to localStorage:', err);
    }

    // Persist profile fields back to team_members so the sidebar + team list
    // show the latest. Only do this when the values actually changed and
    // the user has permission.
    if (
      member &&
      (settings.fullName.trim() !== member.name ||
        (settings.jobTitle.trim() || null) !== (member.title ?? null))
    ) {
      const res = await authedFetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settings.fullName.trim(),
          title: settings.jobTitle.trim(),
        }),
      });
      if (res.ok) {
        await refreshMember();
      } else {
        console.error('Failed to update profile:', await res.text());
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function reset() {
    setSettings({
      ...DEFAULTS,
      fullName: member?.name ?? '',
      email: member?.email ?? '',
      jobTitle: member?.title ?? '',
    });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Settings</h1>
      <p className="mt-1 text-slate-500">
        Manage your profile, workspace, and notification preferences.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Section nav */}
        <nav className="space-y-1">
          <SectionLink
            icon={<User className="h-4 w-4" />}
            label="Profile"
            active={tab === 'profile'}
            onClick={() => setTab('profile')}
          />
          <SectionLink
            icon={<Building2 className="h-4 w-4" />}
            label="Organization"
            active={tab === 'organization'}
            onClick={() => setTab('organization')}
          />
          <SectionLink
            icon={<Bell className="h-4 w-4" />}
            label="Notifications"
            active={tab === 'notifications'}
            onClick={() => setTab('notifications')}
          />
          <SectionLink
            icon={<Shield className="h-4 w-4" />}
            label="Security"
            active={tab === 'security'}
            onClick={() => setTab('security')}
          />
          <SectionLink
            icon={<Plug className="h-4 w-4" />}
            label="Integrations"
            active={tab === 'integrations'}
            onClick={() => setTab('integrations')}
          />
        </nav>

        {/* Body */}
        <div className="min-w-0 space-y-6">
          {tab === 'profile' && (
            <Section title="Profile" description="Your name, email and role.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">
                  <Input
                    value={settings.fullName}
                    onChange={(e) => update('fullName', e.target.value)}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={settings.email}
                    onChange={(e) => update('email', e.target.value)}
                  />
                </Field>
                <Field label="Job title">
                  <Input
                    value={settings.jobTitle}
                    onChange={(e) => update('jobTitle', e.target.value)}
                  />
                </Field>
                <Field label="Timezone">
                  <select
                    value={settings.timezone}
                    onChange={(e) => update('timezone', e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </Field>
              </div>
            </Section>
          )}

          {tab === 'organization' && (
            <Section
              title="Organization"
              description={
                canEditOrg
                  ? 'Public details candidates see on apply pages.'
                  : 'Read-only — only Super Admins and Admins can edit org details.'
              }
            >
              <div className="space-y-4">
                <Field label="Organization name">
                  <Input
                    value={settings.orgName}
                    onChange={(e) => update('orgName', e.target.value)}
                    disabled={!canEditOrg}
                  />
                </Field>
                <Field label="Website">
                  <Input
                    type="url"
                    value={settings.orgWebsite}
                    onChange={(e) => update('orgWebsite', e.target.value)}
                    placeholder="https://example.com"
                    disabled={!canEditOrg}
                  />
                </Field>
                <Field label="About (optional)">
                  <Textarea
                    rows={4}
                    placeholder="A short pitch shown on your public careers page."
                    disabled={!canEditOrg}
                  />
                </Field>
              </div>
            </Section>
          )}

          {tab === 'notifications' && (
            <Section
              title="Notifications"
              description="Choose what lands in your inbox."
            >
              <div className="space-y-1">
                <ToggleRow
                  label="New applicant"
                  description="Email me whenever someone applies to a job I own."
                  checked={settings.notifyNewApplicant}
                  onChange={(v) => update('notifyNewApplicant', v)}
                />
                <ToggleRow
                  label="High-ATS alerts"
                  description="Email me when a candidate scores ≥ 80."
                  checked={settings.notifyHighAts}
                  onChange={(v) => update('notifyHighAts', v)}
                />
                <ToggleRow
                  label="Daily digest"
                  description="A summary of pipeline activity once a day at 9am."
                  checked={settings.notifyDailyDigest}
                  onChange={(v) => update('notifyDailyDigest', v)}
                />
              </div>
            </Section>
          )}

          {tab === 'security' && (
            <Section
              title="Security"
              description="Account access and password."
            >
              <div className="space-y-4">
                <ChangePasswordCard email={settings.email} />

                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white text-slate-600 shadow-sm">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-slate-900">
                        Two-factor authentication
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-slate-500">
                        Available once Supabase Auth is enabled with an MFA factor.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                      Soon
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
                  <p className="text-[13.5px] font-medium text-rose-700">Danger zone</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-600">
                    Permanently delete your account and all jobs.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-rose-200 text-rose-600 hover:bg-rose-50"
                  >
                    Delete account
                  </Button>
                </div>
              </div>
            </Section>
          )}

          {tab === 'integrations' && (
            <Section
              title="Integrations"
              description="Connect external services so PhotonX can write to them on your behalf."
            >
              <GoogleCalendarCard />
            </Section>
          )}

          {/* Sticky save bar */}
          {tab !== 'security' && tab !== 'integrations' && hydrated && (
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-card">
              <p className="text-[12.5px] text-slate-500">
                Changes save to your browser until backend wiring lands.
              </p>
              <div className="flex items-center gap-2">
                {saved && (
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Saved
                  </span>
                )}
                <Button variant="ghost" onClick={reset}>
                  Reset
                </Button>
                <Button onClick={save} className="bg-brand-500 hover:bg-brand-600">
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLink({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors',
        active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
      )}
    >
      <span className={active ? 'text-brand-600' : 'text-slate-400'}>{icon}</span>
      {label}
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-card">
      <header className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-500">{description}</p>
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ChangePasswordCard({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setShowCurrent(false);
    setShowNext(false);
    setBusy(false);
    setError(null);
    setSuccess(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (next === current) {
      setError('New password must be different from the current one.');
      return;
    }

    setBusy(true);

    // Step 1: verify the current password by re-signing-in. Without this,
    // anyone with a stolen session cookie could change the password silently.
    const { error: signinErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (signinErr) {
      setBusy(false);
      // Two cases:
      //   - "Invalid login credentials" → wrong current password
      //   - Most other errors → Auth isn't configured (no users yet)
      const msg = signinErr.message.toLowerCase();
      if (msg.includes('invalid')) {
        setError('Current password is incorrect.');
      } else {
        setError(
          'Password change requires Supabase Auth to be enabled with an existing account. ' +
            `Auth error: ${signinErr.message}`
        );
      }
      return;
    }

    // Step 2: update to the new password.
    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setBusy(false);

    if (updErr) {
      setError(updErr.message);
      return;
    }

    setSuccess(true);
    setCurrent('');
    setNext('');
    setConfirm('');
    setTimeout(() => {
      setOpen(false);
      setSuccess(false);
    }, 1600);
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-white text-slate-600 shadow-sm">
            <Key className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-slate-900">Password</p>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Update the password used to sign into <span className="num">{email}</span>.
              Requires Supabase Auth.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Key className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-slate-900">Change password</p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            We&apos;ll verify your current password before updating.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <PasswordField
          label="Current password"
          value={current}
          onChange={setCurrent}
          show={showCurrent}
          toggleShow={() => setShowCurrent((s) => !s)}
          autoComplete="current-password"
        />
        <PasswordField
          label="New password"
          value={next}
          onChange={setNext}
          show={showNext}
          toggleShow={() => setShowNext((s) => !s)}
          autoComplete="new-password"
          hint="Minimum 8 characters."
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          show={showNext}
          toggleShow={() => setShowNext((s) => !s)}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 text-[12.5px] text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5 text-[12.5px] font-medium text-emerald-700">
          <CheckCircle className="h-3.5 w-3.5" />
          Password updated.
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="bg-brand-500 hover:bg-brand-600"
        >
          {busy ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </form>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  toggleShow,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggleShow: () => void;
  autoComplete: string;
  hint?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[13px] font-medium text-slate-700">
        {label}
      </Label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={toggleShow}
          tabIndex={-1}
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title={show ? 'Hide' : 'Show'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11.5px] text-slate-500">{hint}</p>}
    </div>
  );
}

// Google Calendar integration card. Shows the current connection state,
// surfaces the flash from the OAuth callback (?integration=google&status=…),
// and exposes Connect / Disconnect buttons that hit the routes in
// app/api/integrations/google/*.
function GoogleCalendarCard() {
  const [status, setStatus] = useState<
    { connected: boolean; email: string | null; connected_at: string | null } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<
    { kind: 'success' | 'error'; msg: string } | null
  >(null);

  // 1. Parse the OAuth callback flash params on mount.
  // 2. Strip them from the URL so a page refresh doesn't replay the flash.
  // 3. Fetch the current connection status.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('integration') === 'google') {
        const s = params.get('status');
        if (s === 'connected') {
          const email = params.get('email');
          setFlash({
            kind: 'success',
            msg: email
              ? `Connected as ${email}.`
              : 'Connected to Google Calendar.',
          });
        } else if (s === 'error') {
          setFlash({
            kind: 'error',
            msg: errorReasonToMessage(params.get('reason')),
          });
        }
        const url = new URL(window.location.href);
        ['integration', 'status', 'email', 'reason'].forEach((k) =>
          url.searchParams.delete(k)
        );
        window.history.replaceState({}, '', url.toString());
      }
    }
    refresh();
  }, []);

  async function refresh() {
    const res = await authedFetch('/api/integrations/google');
    if (res.ok) setStatus(await res.json());
  }

  async function connect() {
    setBusy(true);
    setFlash(null);
    try {
      const res = await authedFetch('/api/integrations/google/connect', {
        method: 'POST',
      });
      if (!res.ok) {
        setFlash({ kind: 'error', msg: 'Could not start Google connect flow.' });
        setBusy(false);
        return;
      }
      const { url } = (await res.json()) as { url: string };
      // Full-page navigation — the consent screen needs a top-level browser
      // context. We don't restore busy=false because the page is about to
      // unmount.
      window.location.href = url;
    } catch {
      setFlash({ kind: 'error', msg: 'Network error starting Google connect.' });
      setBusy(false);
    }
  }

  async function disconnect() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Disconnect Google Calendar? Existing interviews keep their Meet links; new google_meet interviews will lose auto-link generation.'
      )
    ) {
      return;
    }
    setBusy(true);
    setFlash(null);
    const res = await authedFetch('/api/integrations/google', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      setFlash({ kind: 'error', msg: 'Could not disconnect. Try again.' });
      return;
    }
    setFlash({ kind: 'success', msg: 'Disconnected.' });
    await refresh();
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-white text-slate-600 shadow-sm">
          <Calendar className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-slate-900">
            Google Calendar
          </p>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Required for auto-generated Google Meet links on new interviews.
            Events sync to your Calendar; reschedule and cancel propagate.
          </p>
          {status?.connected && (
            <p className="mt-1.5 text-[12px] font-medium text-emerald-700">
              <CheckCircle className="-mt-px mr-1 inline h-3.5 w-3.5" />
              Connected as {status.email}
            </p>
          )}
        </div>
        {status === null ? (
          <div className="grid h-9 w-24 place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        ) : status.connected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={disconnect}
            disabled={busy}
            className="border-rose-200 text-rose-600 hover:bg-rose-50"
          >
            {busy ? 'Working…' : 'Disconnect'}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={connect}
            disabled={busy}
            className="bg-brand-500 hover:bg-brand-600"
          >
            {busy ? 'Redirecting…' : 'Connect'}
          </Button>
        )}
      </div>

      {flash && (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-[12.5px]',
            flash.kind === 'success'
              ? 'border-emerald-100 bg-emerald-50/60 text-emerald-700'
              : 'border-rose-100 bg-rose-50/60 text-rose-700'
          )}
        >
          {flash.kind === 'success' ? (
            <CheckCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span>{flash.msg}</span>
        </div>
      )}
    </div>
  );
}

// Maps the `reason=` codes from app/api/integrations/google/callback to
// human-readable text. The codes themselves are stable — any new failure
// mode added on the server must be added here too.
function errorReasonToMessage(reason: string | null): string {
  switch (reason) {
    case 'cancelled':
      return 'You cancelled the consent screen — nothing was connected.';
    case 'state_mismatch':
    case 'missing_state_cookie':
    case 'invalid_or_expired_state':
      return 'The connect link expired before you finished. Try again.';
    case 'no_refresh_token':
      return 'Google didn\'t return a refresh token. This usually means the OAuth client is misconfigured. Contact support.';
    case 'token_exchange_failed':
    case 'userinfo_failed':
      return 'Google rejected the connect attempt. Try again, or check that the Calendar API is enabled in the Google Cloud project.';
    case 'store_failed':
      return 'Connected to Google but could not save the credentials. Try again.';
    case 'member_not_found':
    case 'member_inactive':
    case 'member_missing_org':
      return 'Your team membership changed during the connect flow. Refresh and try again.';
    default:
      return reason ? `Connect failed: ${reason}` : 'Connect failed.';
  }
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-3.5 last:border-b-0">
      <div className="min-w-0 leading-tight">
        <p className="text-[13.5px] font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-[12.5px] text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 flex-shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-slate-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </button>
    </div>
  );
}
