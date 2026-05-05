// Role-based access control.
//
// Three roles map to a fixed permission set. The list is exhaustive — adding a
// new gated action means adding it here and to ROLE_PERMISSIONS, not sprinkling
// role checks through pages.

import type { TeamRole } from '@/lib/supabase';

export type Permission =
  | 'jobs.create'
  | 'jobs.edit'
  | 'jobs.delete'
  // Move stage, add tag, re-parse, bulk actions. Anything that mutates an
  // application row falls under this single permission.
  | 'applications.update'
  | 'interviews.schedule'
  | 'interviews.manage'
  | 'team.view'
  | 'team.invite'
  | 'team.edit'
  | 'team.archive'
  | 'settings.edit_self'
  | 'settings.edit_org';

const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  super_admin: [
    'jobs.create',
    'jobs.edit',
    'jobs.delete',
    'applications.update',
    'interviews.schedule',
    'interviews.manage',
    'team.view',
    'team.invite',
    'team.edit',
    'team.archive',
    'settings.edit_self',
    'settings.edit_org',
  ],
  // Admin: full access to jobs, applicants and org settings; no team writes.
  admin: [
    'jobs.create',
    'jobs.edit',
    'jobs.delete',
    'applications.update',
    'interviews.schedule',
    'interviews.manage',
    'team.view',
    'settings.edit_self',
    'settings.edit_org',
  ],
  // Recruiter: read-only across the dashboard. Login + observe + manage own
  // profile/password.
  recruiter: ['team.view', 'settings.edit_self'],
};

const ROLE_LABEL: Record<TeamRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  recruiter: 'Recruiter',
};

const ROLE_DESC: Record<TeamRole, string> = {
  super_admin: 'Full access — can manage jobs, the team, and all settings.',
  admin: 'Can manage jobs and org settings; cannot add or remove team members.',
  recruiter: 'Read-only. Can sign in and view candidates, but not modify them.',
};

const ROLE_ORDER: TeamRole[] = ['super_admin', 'admin', 'recruiter'];

export function can(role: TeamRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] ?? []).includes(perm);
}

export function roleLabel(role: TeamRole): string {
  return ROLE_LABEL[role];
}

export function roleDescription(role: TeamRole): string {
  return ROLE_DESC[role];
}

export function allRoles(): TeamRole[] {
  return [...ROLE_ORDER];
}

// ──────────────────────────────────────────────────────────────────────────
// Current user resolution
//
// In-app, prefer the `useAuth()` hook from
// `components/shell/auth-provider.tsx` — it returns { authUser, member, role }
// sourced from the live Supabase Auth session.
//
// The legacy localStorage helper below is kept only for ad-hoc role-switching
// during local testing. Setting `localStorage['photonx:current-user-id']` to
// a team-member id has NO effect on real auth — it's purely a developer
// hint that some pages (now removed) used to consult.
// ──────────────────────────────────────────────────────────────────────────

export const CURRENT_USER_KEY = 'photonx:current-user-id';

export function setCurrentUserId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CURRENT_USER_KEY, id);
  } catch {
    /* ignore */
  }
}
