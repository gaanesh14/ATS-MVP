// Server-only Supabase client using the service-role key. Bypasses RLS;
// MUST never be imported from a client component. The 'server-only' import
// turns an accidental client import into a build-time error.

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Lazy singleton. Throws a clear, actionable error if env vars are missing
 * — only when an API route actually tries to use it, so the rest of the
 * app keeps booting if the service-role key isn't configured yet.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Server admin client is not configured. ' +
        'Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart the dev server. ' +
        'See docs/brevo-email-setup.md for the full setup.'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Helper that wraps `auth.admin.inviteUserByEmail` and adds the bits the
 * app cares about: a name in the user metadata so the on_auth_user_created
 * trigger picks it up, and a redirectTo that lands the invitee on our
 * /accept-invite page so they can set a password before being signed in.
 *
 * Fallback path: when `inviteUserByEmail` fails because the auth user
 * already exists (re-inviting an archived member, retrying after a prior
 * attempt that committed auth.users but not the team_members row, etc.),
 * we regenerate an invite link for the existing user. The Brevo SMTP
 * relay configured on the project sends that link out the same way.
 *
 * Resolves to either { ok: true } or { ok: false, error } — never throws,
 * so callers can decide whether the failure is fatal.
 */
export async function sendTeamInvite(opts: {
  email: string;
  name: string;
  origin: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const redirectTo = `${opts.origin}/accept-invite`;
  const userMetadata = {
    name: opts.name,
    invite_flow: 'team',
    must_set_password: true,
  };

  try {
    const { error } = await admin.auth.admin.inviteUserByEmail(opts.email, {
      data: userMetadata,
      // The path here must also be in Supabase → Auth → URL Configuration
      // → Redirect URLs, otherwise the magic-link click bounces.
      redirectTo,
    });
    if (!error) return { ok: true };

    // Two messages mean "the user is already registered in auth.users":
    //   • "User already registered" — clean error path
    //   • "Database error saving new user" — opaque wrapper around the
    //     same uniqueness violation, plus other auth-trigger failures.
    // In either case we retry by generating a fresh invite link, which
    // works for existing users.
    if (!isExistingUserError(error.message)) {
      return { ok: false, error: error.message };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Fallback: existing auth.users row. Generate an invite link the
  // server-side way. `email_redirect_to` lands them on /accept-invite
  // exactly like the first-time invite, so the password-set UX is the
  // same regardless of which branch ran.
  try {
    const { error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: opts.email,
      options: { data: userMetadata, redirectTo },
    });
    if (linkErr) return { ok: false, error: linkErr.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function isExistingUserError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('already exists') ||
    m.includes('database error saving new user')
  );
}
