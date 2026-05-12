// Server-only auth + RBAC helper for API routes.
//
// Today every route under app/api/ uses the anon client and skips the session
// entirely — combined with open RLS that means an unauthenticated curl can
// PATCH or DELETE any row. This helper closes that gap without per-route
// boilerplate.
//
// Usage from a route handler:
//
//   import { requireRole, AuthError } from '@/lib/auth-server';
//
//   export async function PATCH(req: Request, { params }: { params: { id: string } }) {
//     try {
//       const { admin, member, orgId } = await requireRole('jobs.edit');
//       const { data, error } = await admin
//         .from('jobs')
//         .update({ ... })
//         .eq('id', params.id)
//         .eq('org_id', orgId);  // tenant scope
//       if (error) return Response.json({ error: error.message }, { status: 500 });
//       return Response.json(data);
//     } catch (err) {
//       if (err instanceof AuthError) return err.toResponse();
//       throw err;
//     }
//   }
//
// The helper:
//   1. Extracts the Supabase access token from the request (cookie or
//      Authorization header).
//   2. Verifies it via the service-role admin client → returns the auth user.
//   3. Looks up the team_members row keyed by auth_user_id.
//   4. Optionally checks `can(role, perm)`.
//   5. Returns { user, member, orgId, admin } so the caller can run scoped
//      queries against the admin client (which bypasses RLS) but still
//      filter by orgId for tenant isolation.

import 'server-only';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from './supabase-admin';
import { can, type Permission } from './rbac';
import type { TeamMember } from './supabase';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthError';
  }
  toResponse(): Response {
    return Response.json({ error: this.message }, { status: this.status });
  }
}

const unauthorized = (msg = 'Not signed in') => new AuthError(401, msg);
const forbidden = (msg = 'Forbidden') => new AuthError(403, msg);

type RequireRoleResult = {
  user: User;
  member: TeamMember;
  orgId: string | null;
  admin: SupabaseClient;
};

type MemberRow = TeamMember & { org_id?: string | null };

// Look up the team_members row for a signed-in user and self-heal common
// invitee states. Returns the row, or null if the user has no membership
// in any org.
//
// Why this exists: after the multi-tenancy migration, RLS on team_members
// only lets a user see their OWN row when current_org_id() resolves — and
// current_org_id() requires status='active'. A brand-new invitee whose row
// is still status='pending' is therefore invisible to themselves via the
// anon client (chicken-and-egg). The admin client used here bypasses RLS
// and can flip pending → active so the rest of the app behaves.
//
// Steps:
//   1. Look up by auth_user_id (set by the on_auth_user_created trigger).
//   2. If not found, fall back to email and backfill auth_user_id — covers
//      the case where the trigger didn't fire or fired before the FK was
//      added.
//   3. If status='pending', flip to 'active' and stamp joined_at. This is
//      the first-login transition the AuthProvider tried to do but RLS
//      blocked.
//   4. Return null only when the user genuinely has no membership.
async function resolveActiveMember(
  admin: SupabaseClient,
  user: User
): Promise<MemberRow | null> {
  // Step 1: by auth_user_id (admin client bypasses RLS).
  let { data: row } = await admin
    .from('team_members')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Step 2: fall back to email and link auth_user_id.
  if (!row && user.email) {
    const { data: byEmail } = await admin
      .from('team_members')
      .select('*')
      .eq('email', user.email)
      .maybeSingle();
    if (byEmail) {
      const patch: Record<string, unknown> = { auth_user_id: user.id };
      if (byEmail.status === 'pending') {
        patch.status = 'active';
        patch.joined_at = byEmail.joined_at ?? new Date().toISOString();
      }
      const { data: linked } = await admin
        .from('team_members')
        .update(patch)
        .eq('id', byEmail.id)
        .select('*')
        .single();
      row = linked ?? { ...byEmail, ...patch };
    }
  }

  if (!row) return null;

  // Step 3: self-heal pending → active on first authenticated request.
  if (row.status === 'pending') {
    const { data: activated } = await admin
      .from('team_members')
      .update({
        status: 'active',
        joined_at: row.joined_at ?? new Date().toISOString(),
      })
      .eq('id', row.id)
      .select('*')
      .single();
    if (activated) row = activated;
  }

  return row as MemberRow;
}

// Shared body for the two requireRole entry points. Throws AuthError on
// any failure so the caller can convert it to a Response.
async function checkSession(
  admin: SupabaseClient,
  token: string | null,
  perm?: Permission
): Promise<RequireRoleResult> {
  if (!token) throw unauthorized();

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) throw unauthorized('Session expired');

  const member = await resolveActiveMember(admin, user);
  if (!member) throw forbidden('No team membership found');
  if (member.status === 'archived') {
    throw forbidden('Your team membership has been archived');
  }
  // Anything other than 'active' at this point is unexpected — resolveActiveMember
  // promotes 'pending' to 'active'. Reject defensively rather than letting a
  // non-active row through.
  if (member.status !== 'active') {
    throw forbidden('No active team membership');
  }

  if (perm && !can(member.role, perm)) {
    throw forbidden(`Missing permission: ${perm}`);
  }

  return {
    user,
    member,
    orgId: member.org_id ?? null,
    admin,
  };
}

// Extract the Supabase access token from the request. Tries, in order:
//   1. Authorization: Bearer <token> header (set by client fetch when explicit)
//   2. The Supabase auth cookie set by @supabase/supabase-js v2
//
// The cookie name is `sb-<project_ref>-auth-token` where project_ref is the
// chunk of the Supabase URL before .supabase.co. The value is JSON; the
// access_token field is what auth.admin.getUser() expects.
function readAccessToken(req: Request): string | null {
  // Authorization header first — explicit and easiest to test.
  const authHeader = req.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim() || null;
  }

  // Fall back to the Supabase auth cookie. We can't know the project ref at
  // build time so we scan for any cookie matching the expected pattern.
  const cookieStore = cookies();
  const all = cookieStore.getAll();
  const authCookie = all.find(
    (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  );
  if (!authCookie?.value) return null;

  // The cookie value is JSON-encoded. Older format: a JSON string starting
  // with `{`. Newer format (post @supabase/ssr): may be `base64-` prefixed.
  let raw = authCookie.value;
  if (raw.startsWith('base64-')) {
    try {
      raw = Buffer.from(raw.slice(7), 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed && 'access_token' in parsed) {
      return (parsed as { access_token?: string }).access_token ?? null;
    }
    // Older client wraps as [access_token, refresh_token, ...]
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      return parsed[0];
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Verifies the request's session, looks up the team_member row, and
 * optionally checks a permission. Throws AuthError on any failure — the
 * caller is expected to catch and convert to a Response.
 *
 * @param perm Optional permission name from `lib/rbac.ts`. If provided,
 *             the user must have it or the request is rejected with 403.
 */
export async function requireRole(perm?: Permission): Promise<RequireRoleResult> {
  // Note: requireRole reads cookies, so the API route handler MUST be
  // dynamic. Next.js infers this automatically once `cookies()` is called.
  const admin = getSupabaseAdmin();
  return checkSession(admin, readAccessTokenFromCookies(), perm);
}

// Same as requireRole but accepts an explicit Request object so route
// handlers can also pass an Authorization: Bearer <token> header (useful
// for testing and for service-to-service calls). Cookie path still works
// when the header is absent.
export async function requireRoleFromRequest(
  req: Request,
  perm?: Permission
): Promise<RequireRoleResult> {
  const admin = getSupabaseAdmin();
  return checkSession(admin, readAccessToken(req), perm);
}

// Cookie-only token extraction (no Request handle). Used by the default
// requireRole() so route handlers don't have to thread the Request through.
function readAccessTokenFromCookies(): string | null {
  const cookieStore = cookies();
  const all = cookieStore.getAll();
  const authCookie = all.find(
    (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  );
  if (!authCookie?.value) return null;

  let raw = authCookie.value;
  if (raw.startsWith('base64-')) {
    try {
      raw = Buffer.from(raw.slice(7), 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed && 'access_token' in parsed) {
      return (parsed as { access_token?: string }).access_token ?? null;
    }
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      return parsed[0];
    }
  } catch {
    /* fall through */
  }
  return null;
}
