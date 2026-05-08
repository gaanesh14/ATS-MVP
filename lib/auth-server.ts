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

  // We can't read req.headers from inside `cookies()` alone, so the caller
  // passes us the Request via the wrapper below if Authorization header
  // support is needed. Default path is cookie-only.
  const token = readAccessTokenFromCookies();
  if (!token) throw unauthorized();

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) throw unauthorized('Session expired');

  const { data: row } = await admin
    .from('team_members')
    .select('*')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!row) throw forbidden('No active team membership');

  const member = row as TeamMember & { org_id?: string | null };
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

// Same as requireRole but accepts an explicit Request object so route
// handlers can also pass an Authorization: Bearer <token> header (useful
// for testing and for service-to-service calls). Cookie path still works
// when the header is absent.
export async function requireRoleFromRequest(
  req: Request,
  perm?: Permission
): Promise<RequireRoleResult> {
  const admin = getSupabaseAdmin();
  const token = readAccessToken(req);
  if (!token) throw unauthorized();

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) throw unauthorized('Session expired');

  const { data: row } = await admin
    .from('team_members')
    .select('*')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!row) throw forbidden('No active team membership');

  const member = row as TeamMember & { org_id?: string | null };
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
