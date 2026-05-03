-- ============================================
-- Migration: link team_members to Supabase Auth
-- Run this in Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================
--
-- Pre-requisites:
--   1. Run docs/schema-migration-team-members.sql first.
--   2. In the Supabase dashboard, Project Settings → Authentication →
--      enable "Email" provider. For the MVP, also disable "Confirm email"
--      so signup → login is one step.
--
-- This migration adds a foreign key from team_members back to auth.users.
-- The link is by user id (uuid), set when the user signs up. Email matching
-- is the fallback for invites that pre-existed the auth user.

alter table team_members
  add column if not exists auth_user_id uuid references auth.users(id)
    on delete set null;

create index if not exists team_members_auth_user_id_idx
  on team_members (auth_user_id);

-- Optional: trigger that auto-creates a team_members row when a new auth user
-- signs up via supabase.auth.signUp(). Default role is 'recruiter'. The app
-- already does this client-side after signup, so this is a safety net.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.team_members (auth_user_id, email, name, role, status, joined_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'recruiter',
    'active',
    now()
  )
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        status       = case when team_members.status = 'pending'
                            then 'active' else team_members.status end,
        joined_at    = coalesce(team_members.joined_at, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================
-- RLS roadmap (uncomment + run when ready to lock down)
-- ============================================
--
-- The team_members policy currently allows anything (open access). When you
-- want real auth-gated access:
--
--   drop policy if exists "open access team_members" on team_members;
--
--   -- Anyone signed in can read the directory.
--   create policy "team read all signed in" on team_members
--     for select using (auth.uid() is not null);
--
--   -- Only super_admins can write.
--   create policy "team write super_admin" on team_members
--     for all using (
--       exists (
--         select 1 from team_members me
--         where me.auth_user_id = auth.uid()
--           and me.role = 'super_admin'
--           and me.status = 'active'
--       )
--     ) with check (
--       exists (
--         select 1 from team_members me
--         where me.auth_user_id = auth.uid()
--           and me.role = 'super_admin'
--           and me.status = 'active'
--       )
--     );
--
-- Repeat the same pattern on jobs / applications etc. to enforce role-based
-- writes server-side instead of trusting the client.
