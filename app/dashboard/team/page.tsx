'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  UserPlus,
  MoreVertical,
  Mail,
  CheckCircle,
  AlertCircle,
  Lock,
  Trash2,
  Shield,
  RotateCcw,
  Pencil,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type TeamMember, type TeamRole, type TeamStatus } from '@/lib/supabase';
import { allRoles, can, roleDescription, roleLabel } from '@/lib/rbac';
import { useAuth } from '@/components/shell/auth-provider';
import { authedFetch } from '@/lib/authed-fetch';
import { cn, formatDate } from '@/lib/utils';

const ROLE_PILL: Record<TeamRole, string> = {
  super_admin: 'bg-violet-50 text-violet-700 ring-violet-200',
  admin: 'bg-brand-50 text-brand-700 ring-brand-200',
  recruiter: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export default function TeamPage() {
  // The signed-in user comes from the auth context. Refreshing the team list
  // (after invite/save/archive) doesn't need to re-fetch them.
  const { member: me } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TeamStatus>('active');

  const [showInvite, setShowInvite] = useState(false);
  const [manageMember, setManageMember] = useState<TeamMember | null>(null);

  async function load() {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await authedFetch('/api/team', { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setLoadError(
          err.error ??
            'Failed to load the team. Have you run docs/schema-migration-team-members.sql?'
        );
        setMembers([]);
      } else {
        const json = await res.json();
        setMembers((json.members as TeamMember[]) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      active: members.filter((m) => m.status === 'active').length,
      pending: members.filter((m) => m.status === 'pending').length,
      archived: members.filter((m) => m.status === 'archived').length,
    }),
    [members]
  );

  const visible = useMemo(() => {
    return members
      .filter((m) => m.status === tab)
      .filter((m) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.title ?? '').toLowerCase().includes(q)
        );
      });
  }, [members, query, tab]);

  const canInvite = can(me?.role, 'team.invite');
  const canEdit = can(me?.role, 'team.edit');
  const canArchive = can(me?.role, 'team.archive');

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900">Team</h1>
          <p className="mt-1 text-slate-500">
            Manage who can post, review and decide on candidates.
          </p>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          disabled={!canInvite}
          title={canInvite ? undefined : 'Only Super Admins can invite team members'}
          className="bg-brand-500 hover:bg-brand-600 disabled:bg-slate-300 disabled:hover:bg-slate-300"
        >
          {canInvite ? (
            <UserPlus className="mr-1.5 h-4 w-4" />
          ) : (
            <Lock className="mr-1.5 h-4 w-4" />
          )}
          Invite team member
        </Button>
      </div>

      {/* Role banner */}
      {me && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-card">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1',
              ROLE_PILL[me.role]
            )}
          >
            {roleLabel(me.role)}
          </span>
          <p className="text-[13px] text-slate-600">
            <span className="font-medium text-slate-900">Signed in as {me.name}.</span>{' '}
            {roleDescription(me.role)}
          </p>
        </div>
      )}

      {loadError && (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-[13px] text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email or title…"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1 border-b border-slate-200">
          <UnderlineTab
            active={tab === 'active'}
            onClick={() => setTab('active')}
            label="Active"
            count={counts.active}
          />
          <UnderlineTab
            active={tab === 'pending'}
            onClick={() => setTab('pending')}
            label="Pending invites"
            count={counts.pending}
          />
          <UnderlineTab
            active={tab === 'archived'}
            onClick={() => setTab('archived')}
            label="Archived"
            count={counts.archived}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="mt-12 text-center text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-slate-100 bg-white py-16 text-center">
          <p className="text-slate-500">
            {tab === 'pending'
              ? 'No pending invites.'
              : tab === 'archived'
              ? 'Nobody is archived.'
              : members.length === 0
              ? 'No team members yet — invite your first teammate.'
              : 'No team members match.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  <th className="px-5 py-3 text-left">Member</th>
                  <th className="w-40 px-3 py-3 text-left">Role</th>
                  <th className="w-44 px-3 py-3 text-left">
                    {tab === 'pending' ? 'Invited' : tab === 'archived' ? 'Status' : 'Last active'}
                  </th>
                  <th className="w-16 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((m) => (
                  <tr
                    key={m.id}
                    className={cn(
                      'group transition-colors hover:bg-slate-50/60',
                      canEdit && 'cursor-pointer'
                    )}
                    onClick={() => canEdit && setManageMember(m)}
                  >
                    <td className="py-4 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-slate-200 text-[13px] font-semibold text-slate-600',
                            m.status === 'archived' && 'opacity-60 grayscale'
                          )}
                        >
                          {initials(m.name)}
                        </div>
                        <div className="leading-tight">
                          <div
                            className={cn(
                              'font-semibold text-slate-900',
                              m.status === 'archived' && 'line-through opacity-60'
                            )}
                          >
                            {m.name}
                            {me?.id === m.id && (
                              <span className="ml-2 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 ring-1 ring-brand-200">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[12.5px] text-slate-500">{m.email}</div>
                          {m.title && (
                            <div className="mt-0.5 text-[11.5px] text-slate-400">
                              {m.title}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium ring-1',
                          ROLE_PILL[m.role]
                        )}
                      >
                        {roleLabel(m.role)}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-[13px] text-slate-600">
                      {m.status === 'pending' ? (
                        <span className="text-amber-700">
                          Invited {timeAgo(m.invited_at)}
                        </span>
                      ) : m.status === 'archived' ? (
                        <span className="text-slate-400">
                          Archived
                        </span>
                      ) : m.last_active_at ? (
                        timeAgo(m.last_active_at)
                      ) : m.joined_at ? (
                        `Joined ${formatDate(m.joined_at)}`
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => setManageMember(m)}
                            title="Manage member"
                            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-slate-300" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite dialog */}
      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSent={() => {
          setShowInvite(false);
          setTab('pending');
          load();
        }}
      />

      {/* Manage member dialog */}
      <ManageMemberDialog
        member={manageMember}
        currentUser={me}
        canEdit={canEdit}
        canArchive={canArchive}
        onClose={() => setManageMember(null)}
        onSaved={() => {
          setManageMember(null);
          load();
        }}
      />
    </div>
  );
}

function UnderlineTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      )}
    >
      {label}
      <span className="num ml-1 text-slate-400">({count})</span>
    </button>
  );
}

function InviteDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>('recruiter');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Soft warning shown when the row was saved but the email layer failed
  // (e.g. Brevo SMTP not configured yet, service-role key missing).
  const [emailWarning, setEmailWarning] = useState<string | null>(null);
  // A synchronous lock against rapid double-clicks. The button's
  // `disabled` prop reads `submitting` (a state variable), but state
  // updates are batched and async — between the first click firing
  // `send()` and React applying setSubmitting(true), a second click
  // can sneak in and trigger a duplicate POST /api/team. The ref flips
  // immediately, so the second invocation early-returns.
  const sendingRef = useRef(false);

  function reset() {
    setEmail('');
    setName('');
    setRole('recruiter');
    setSubmitting(false);
    setError(null);
    setEmailWarning(null);
    sendingRef.current = false;
  }

  async function send() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setError(null);
    setEmailWarning(null);
    if (!email.trim()) {
      setError('Email is required.');
      sendingRef.current = false;
      return;
    }
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), role }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Failed: HTTP ${res.status}`);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        emailSent?: boolean;
        emailWarning?: string | null;
      };
      if (json.emailWarning) {
        // Row saved, email failed. Keep the dialog open so the user sees why.
        setEmailWarning(json.emailWarning);
        return;
      }
      reset();
      onSent();
    } finally {
      setSubmitting(false);
      sendingRef.current = false;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
            <UserPlus className="h-5 w-5" />
          </div>
          <DialogTitle>Invite a team member</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-slate-500">
          They&apos;ll appear under <strong>Pending invites</strong> until they accept.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Email address <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@photonx.com"
                className="pl-9"
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Name (optional)
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Aarav Sharma"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Role
            </label>
            <div className="space-y-2">
              {allRoles().map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    role === r
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  )}
                >
                  <span
                    className={cn(
                      'mt-1 grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded-full border',
                      role === r
                        ? 'border-brand-500 bg-brand-500'
                        : 'border-slate-300 bg-white'
                    )}
                  >
                    {role === r && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="leading-tight">
                    <span
                      className={cn(
                        'block text-[13.5px] font-semibold',
                        role === r ? 'text-brand-700' : 'text-slate-900'
                      )}
                    >
                      {roleLabel(r)}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-slate-500">
                      {roleDescription(r)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 text-[12.5px] text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {emailWarning && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[12.5px] text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <div className="leading-relaxed">
              <p className="font-medium">Saved, but the invite email didn&apos;t send.</p>
              <p className="mt-0.5 text-amber-700">{emailWarning}</p>
              <p className="mt-1 text-amber-700">
                The team member is now under <strong>Pending invites</strong>. Use{' '}
                <strong>Resend invite</strong> on their row once SMTP is configured.
                See <code>docs/brevo-email-setup.md</code>.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {emailWarning ? (
            <Button
              onClick={() => {
                reset();
                onSent();
              }}
              className="bg-brand-500 hover:bg-brand-600"
            >
              Got it
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={send}
                disabled={submitting || !email.trim()}
                className="bg-brand-500 hover:bg-brand-600"
              >
                {submitting ? 'Sending…' : 'Send invite'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageMemberDialog({
  member,
  currentUser,
  canEdit,
  canArchive,
  onClose,
  onSaved,
}: {
  member: TeamMember | null;
  currentUser: TeamMember | null;
  canEdit: boolean;
  canArchive: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>('recruiter');
  const [busy, setBusy] = useState<'save' | 'archive' | 'restore' | 'reactivate' | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setName(member.name);
      setRole(member.role);
      setError(null);
      setBusy(null);
    }
  }, [member]);

  if (!member) return null;

  const isSelf = currentUser?.id === member.id;

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    const res = await authedFetch(`/api/team/${member!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? `Failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  }

  async function save() {
    setBusy('save');
    const ok = await patch({ name: name.trim(), role });
    setBusy(null);
    if (ok) onSaved();
  }

  async function archive() {
    setBusy('archive');
    const res = await authedFetch(`/api/team/${member!.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? `Failed: HTTP ${res.status}`);
      return;
    }
    onSaved();
  }

  async function restore() {
    setBusy('restore');
    const ok = await patch({ status: 'active' });
    setBusy(null);
    if (ok) onSaved();
  }

  async function reactivateInvite() {
    setBusy('reactivate');
    const ok = await patch({ status: 'pending', invited_at: new Date().toISOString() });
    setBusy(null);
    if (ok) onSaved();
  }

  const dirty = name.trim() !== member.name || role !== member.role;

  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
            <Pencil className="h-5 w-5" />
          </div>
          <DialogTitle>Manage team member</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-slate-200 text-[13px] font-semibold text-slate-600">
              {initials(member.name)}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[14px] font-semibold text-slate-900">
                {member.name}
              </div>
              <div className="truncate text-[12px] text-slate-500">{member.email}</div>
            </div>
            <span
              className={cn(
                'ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
                member.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : member.status === 'pending'
                  ? 'bg-amber-50 text-amber-700 ring-amber-200'
                  : 'bg-slate-50 text-slate-600 ring-slate-200'
              )}
            >
              {member.status}
            </span>
          </div>
        </div>

        {/* Edit form */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
              <Shield className="h-3.5 w-3.5 text-slate-400" />
              Role
            </label>
            <div className="space-y-2">
              {allRoles().map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={!canEdit || (isSelf && r !== member.role)}
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    role === r
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  )}
                >
                  <span
                    className={cn(
                      'mt-1 grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded-full border',
                      role === r
                        ? 'border-brand-500 bg-brand-500'
                        : 'border-slate-300 bg-white'
                    )}
                  >
                    {role === r && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="leading-tight">
                    <span
                      className={cn(
                        'block text-[13.5px] font-semibold',
                        role === r ? 'text-brand-700' : 'text-slate-900'
                      )}
                    >
                      {roleLabel(r)}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-slate-500">
                      {roleDescription(r)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {isSelf && (
              <p className="mt-2 text-[11.5px] text-slate-500">
                You can&apos;t change your own role. Ask another super admin.
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50/60 p-2.5 text-[12.5px] text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {member.status === 'archived' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={restore}
                disabled={!canArchive || !!busy}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {busy === 'restore' ? 'Restoring…' : 'Restore'}
              </Button>
            ) : member.status === 'pending' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={reactivateInvite}
                disabled={!canEdit || !!busy}
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" />
                {busy === 'reactivate' ? 'Sending…' : 'Resend invite'}
              </Button>
            ) : null}
            {member.status !== 'archived' && (
              <Button
                variant="outline"
                size="sm"
                onClick={archive}
                disabled={!canArchive || !!busy || isSelf}
                title={isSelf ? "You can't archive your own account" : undefined}
                className="border-rose-200 text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {busy === 'archive' ? 'Archiving…' : 'Archive'}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!canEdit || !dirty || !!busy}
              className="bg-brand-500 hover:bg-brand-600"
            >
              {busy === 'save' ? (
                'Saving…'
              ) : (
                <>
                  <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}
