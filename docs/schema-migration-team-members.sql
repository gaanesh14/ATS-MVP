-- ============================================
-- Migration: team_members table for RBAC
-- Run this in Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).
-- ============================================
--
-- Adds the people who can sign in to the recruiter dashboard. Three roles:
--
--   super_admin — full access to everything
--   admin       — can create/edit/delete jobs; CANNOT add team members
--   recruiter   — read-only across the dashboard
--
-- A row is `pending` until the invitee accepts (joined_at is set), `active`
-- once they're working, or `archived` if removed from the team. Archive is a
-- soft delete so audit trails survive.
--
-- Passwords are NOT stored here — they live in Supabase Auth (auth.users).
-- This table is the role/permissions layer keyed by email; once Auth is
-- enabled, link rows by email or add an auth_user_id uuid column.

create table if not exists team_members (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text not null,
  role            text not null check (role in ('super_admin', 'admin', 'recruiter')),
  status          text not null default 'pending'
                       check (status in ('active', 'pending', 'archived')),
  title           text,
  invited_at      timestamptz,
  joined_at       timestamptz,
  last_active_at  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists team_members_email_idx  on team_members (email);
create index if not exists team_members_status_idx on team_members (status);
create index if not exists team_members_role_idx   on team_members (role);

alter table team_members enable row level security;

-- Open RLS for the MVP. When Supabase Auth lands, replace with:
--   create policy "team manage by super_admin" on team_members
--     for all using (
--       exists (select 1 from team_members
--               where email = auth.jwt() ->> 'email'
--                 and role  = 'super_admin'
--                 and status = 'active')
--     );
drop policy if exists "open access team_members" on team_members;
create policy "open access team_members" on team_members
  for all using (true) with check (true);

-- Seed one super_admin so the recruiter dashboard has a "current user"
-- identity until Supabase Auth is enabled. Edit the email/name to match
-- the real owner before sharing the workspace.
insert into team_members (email, name, role, status, title, joined_at)
values ('darlene@photonx.com', 'Darlene Roberts', 'super_admin', 'active',
        'Head of Talent', now())
on conflict (email) do nothing;
