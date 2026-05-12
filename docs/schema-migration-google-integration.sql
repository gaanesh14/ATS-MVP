-- =============================================================================
-- Migration: Google Calendar integration
-- Run this in Supabase SQL Editor AFTER schema-migration-multi-tenancy.sql.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =============================================================================
--
-- Adds per-recruiter OAuth token storage for Google Calendar + a foreign-key
-- column on `interviews` so we can update/delete the right Calendar event when
-- an interview is rescheduled or cancelled.
--
-- Storage model: one row per team_member. Refresh tokens are long-lived
-- secrets and are stored encrypted (AES-256-GCM) using
-- GOOGLE_TOKEN_ENCRYPTION_KEY from the environment. Access tokens are short
-- lived (~1h) and are cached encrypted alongside; lib/google-oauth.ts
-- refreshes them on demand when expired.
--
-- The on-disk format for the encrypted columns is:
--   <iv-hex>:<auth-tag-hex>:<ciphertext-hex>
-- All three are hex-encoded, colon-separated. Postgres sees it as plain text;
-- decryption happens entirely in the Node runtime.

-- -----------------------------------------------------------------------------
-- 1. Token table
-- -----------------------------------------------------------------------------

create table if not exists recruiter_google_tokens (
  id                       uuid primary key default gen_random_uuid(),
  -- One Google account per team_member. UNIQUE so the connect flow is an
  -- upsert: re-connecting replaces the existing token rather than creating
  -- a second row for the same recruiter.
  team_member_id           uuid not null unique
                                references team_members(id) on delete cascade,
  org_id                   uuid not null
                                references organizations(id) on delete cascade,
  -- Always present. Refresh tokens are long-lived (until user revokes); the
  -- access token is derived from this on demand.
  encrypted_refresh_token  text not null,
  -- Optional cache of the short-lived access token to avoid hitting Google's
  -- token endpoint on every request. NULL means "fetch a fresh one".
  encrypted_access_token   text,
  access_token_expires_at  timestamptz,
  google_email             text not null,
  scopes                   text[] not null default '{}',
  connected_at             timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists recruiter_google_tokens_org_idx
  on recruiter_google_tokens (org_id);

-- -----------------------------------------------------------------------------
-- 2. updated_at trigger
-- -----------------------------------------------------------------------------

create or replace function touch_recruiter_google_tokens_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_recruiter_google_tokens_updated_at
  on recruiter_google_tokens;
create trigger trg_recruiter_google_tokens_updated_at
  before update on recruiter_google_tokens
  for each row execute function touch_recruiter_google_tokens_updated_at();

-- -----------------------------------------------------------------------------
-- 3. RLS
--
-- Reads: a user can see ONLY their own row. Useful for the settings page
-- "Are you connected to Google?" check via the anon client. The encrypted
-- columns are still useless without GOOGLE_TOKEN_ENCRYPTION_KEY, so even a
-- leaked SELECT wouldn't reveal tokens — but we lock it down anyway.
--
-- Writes: no policy = blocked for the anon client. The connect/disconnect
-- API routes use the service-role admin client to bypass RLS, which is
-- the only path that ever needs to write here.
-- -----------------------------------------------------------------------------

alter table recruiter_google_tokens enable row level security;

drop policy if exists "users_can_see_own_google_tokens"
  on recruiter_google_tokens;
create policy "users_can_see_own_google_tokens"
  on recruiter_google_tokens
  for select
  using (
    team_member_id in (
      select id from team_members
      where auth_user_id = auth.uid() and status = 'active'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. Link interviews back to their Calendar event so reschedule/cancel can
--    patch/delete the right event instead of creating duplicates.
-- -----------------------------------------------------------------------------

alter table interviews
  add column if not exists google_calendar_event_id text;

create index if not exists interviews_google_event_idx
  on interviews (google_calendar_event_id)
  where google_calendar_event_id is not null;

-- =============================================================================
-- Sanity checks (run after applying)
-- =============================================================================
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'recruiter_google_tokens'
--    order by ordinal_position;
--
--   select policyname from pg_policies
--    where tablename = 'recruiter_google_tokens';
--
--   select column_name from information_schema.columns
--    where table_name = 'interviews' and column_name = 'google_calendar_event_id';
