-- ============================================
-- Migration: harden the on_auth_user_created trigger for multi-tenancy
-- Run this in Supabase SQL Editor. Safe to re-run.
-- ============================================
--
-- Why this exists
-- ---------------
-- The original trigger from docs/schema-migration-auth-link.sql does:
--
--   insert into team_members (auth_user_id, email, name, role, status, joined_at)
--   values (new.id, new.email, …, 'recruiter', 'active', now())
--   on conflict (email) do update set …;
--
-- After docs/schema-migration-multi-tenancy.sql made team_members.org_id
-- NOT NULL, the INSERT branch can no longer succeed when no matching row
-- exists — it would violate the NOT NULL constraint and Supabase Auth
-- surfaces the failure to clients as the opaque message:
--
--   "Database error saving new user"
--
-- The /api/team route already creates the team_members row (with org_id)
-- BEFORE calling auth.admin.inviteUserByEmail, so the trigger only ever
-- needs to LINK the auth_user_id back. Doing only the UPDATE removes the
-- failure mode entirely. If a user signs up through some channel without
-- a pre-existing team_members row, the AuthProvider client code
-- provisions one with the correct org context — see
-- components/shell/auth-provider.tsx.
--
-- The original trigger also flipped status from 'pending' to 'active' as
-- soon as auth.users got the row, which happens during invite send (long
-- before the invitee actually accepts). This version leaves status alone
-- — AuthProvider transitions it on the first authenticated dashboard
-- load, when joined_at is also stamped.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Link the new auth user to a pre-existing team_members row, if any.
  -- We never INSERT here: a new row would need an org_id we don't have.
  update public.team_members
  set auth_user_id = new.id
  where email = new.email
    and auth_user_id is null;
  return new;
end;
$$;

-- The trigger itself is unchanged; we just rebind it to the new function
-- definition. Re-creating is safe — `create or replace function` already
-- replaced the body, this line just normalizes the binding.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================
-- Verification
-- ============================================
--
-- After running, smoke-test by inviting a brand-new email from the Team
-- page. The flow should be:
--
--   1. POST /api/team inserts team_members(email=…, org_id=…, status='pending')
--   2. inviteUserByEmail creates auth.users(email=…)
--   3. Trigger UPDATEs team_members.auth_user_id to the new auth.users.id
--   4. Invitee gets a Brevo SMTP email and clicks the magic link
--   5. AuthProvider on /dashboard transitions status: pending → active
--      and stamps joined_at.
--
-- The "Database error saving new user" warning should no longer appear
-- on first invite. If you still see it, the cause is one of:
--
--   • Brevo SMTP not configured — see docs/brevo-email-setup.md
--   • Email already in auth.users from a prior invite attempt — handled
--     by the /api/team fallback (regenerates a magic link instead of
--     creating)
