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
 * Resolves to either { ok: true } or { ok: false, error } — never throws,
 * so callers can decide whether the failure is fatal.
 */
export async function sendTeamInvite(opts: {
  email: string;
  name: string;
  origin: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.inviteUserByEmail(opts.email, {
      data: {
        name: opts.name,
        invite_flow: 'team',
        must_set_password: true,
      },
      // Land on /accept-invite so we can prompt for a password. Without
      // this, Supabase signs the user in via the magic link's one-time
      // session, but they never set a password and can't sign back in.
      // The path here must also be in Supabase → Auth → URL Configuration
      // → Redirect URLs.
      redirectTo: `${opts.origin}/accept-invite`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
