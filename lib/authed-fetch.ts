// Client-side fetch wrapper that injects the Supabase access token as an
// Authorization: Bearer header.
//
// Why this exists: @supabase/supabase-js v2 stores the session in
// localStorage by default, not cookies. Server route handlers can't see
// localStorage, so without this helper our requireRole() in
// lib/auth-server.ts has nothing to read and rejects every request as
// "Not signed in".
//
// Drop-in replacement for fetch — same shape, same return type. Use it
// for any call to /api/* that requires auth.

import { supabase } from '@/lib/supabase';

export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;

  const headers = new Headers(init?.headers);
  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
