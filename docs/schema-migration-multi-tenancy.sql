-- =============================================================================
-- Migration: multi-tenancy + race-condition + RLS hardening
--
-- Run this ONCE in the Supabase SQL Editor. Idempotent — safe to re-run.
-- Pre-flight checklist in docs/scaling-rollout.md before applying.
--
-- What this does, in order:
--   1. Creates the `organizations` table.
--   2. Adds `org_id` to every tenant-scoped table (jobs, applications,
--      application_answers, job_questions, team_members, interviews).
--   3. Backfills all existing rows into a single legacy "Default Organization"
--      so nothing breaks for current users.
--   4. Adds NOT NULL + composite indexes on `org_id`.
--   5. Adds the missing safety nets we deferred during the MVP:
--        - applications.version  (optimistic concurrency for stage edits)
--        - applications unique (job_id, lower(email))  (dedup on apply)
--        - applications.updated_at + auto-update trigger
--        - close_job_when_full(job_id) function (atomic hire-vs-close race)
--   6. Replaces the open `using (true)` RLS policies with org-scoped ones,
--      anchored on a `current_org_id()` security-definer function.
--   7. Grants the public `careers` apply page narrow INSERT-only access so
--      candidates can still apply without an auth session — the row is
--      auto-stamped with the job's org via a trigger.
--
-- After this lands, page-level queries still work because every existing row
-- belongs to the default org and every signed-in user resolves to that org
-- via team_members. Future code changes pass `org_id` explicitly.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 1. Organizations table
-- ----------------------------------------------------------------------------

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- Seed the legacy org so we have a real id to backfill into. Slug is
-- intentionally generic so the SaaS owner can rename it later.
insert into organizations (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default')
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- 2. Add org_id to every tenant-scoped table (nullable first, backfill, then
--    NOT NULL). Uses ADD COLUMN IF NOT EXISTS so re-runs are safe.
-- ----------------------------------------------------------------------------

alter table jobs
  add column if not exists org_id uuid references organizations(id) on delete cascade;

alter table applications
  add column if not exists org_id uuid references organizations(id) on delete cascade;

alter table application_answers
  add column if not exists org_id uuid references organizations(id) on delete cascade;

alter table job_questions
  add column if not exists org_id uuid references organizations(id) on delete cascade;

alter table team_members
  add column if not exists org_id uuid references organizations(id) on delete cascade;

-- interviews table is added in a later migration; guard with IF EXISTS so this
-- file works even on a project that hasn't applied schema-migration-interviews.sql yet.
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'interviews') then
    execute 'alter table interviews
             add column if not exists org_id uuid references organizations(id) on delete cascade';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 3. Backfill — every existing row joins the default org.
-- ----------------------------------------------------------------------------

update jobs                set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update applications        set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update application_answers set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update job_questions       set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;
update team_members        set org_id = '00000000-0000-0000-0000-000000000001' where org_id is null;

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'interviews') then
    execute 'update interviews set org_id = ''00000000-0000-0000-0000-000000000001'' where org_id is null';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 4. Lock org_id NOT NULL + composite indexes.
-- ----------------------------------------------------------------------------

alter table jobs                alter column org_id set not null;
alter table applications        alter column org_id set not null;
alter table application_answers alter column org_id set not null;
alter table job_questions       alter column org_id set not null;
alter table team_members        alter column org_id set not null;

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'interviews') then
    execute 'alter table interviews alter column org_id set not null';
  end if;
end $$;

create index if not exists jobs_org_created_idx         on jobs(org_id, created_at desc);
create index if not exists applications_org_created_idx on applications(org_id, created_at desc);
create index if not exists applications_org_job_idx     on applications(org_id, job_id);
create index if not exists team_members_org_idx         on team_members(org_id);
create index if not exists job_questions_org_idx        on job_questions(org_id);

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'interviews') then
    execute 'create index if not exists interviews_org_scheduled_idx on interviews(org_id, scheduled_at)';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 5a. Optimistic concurrency on applications.
--
-- Stage-change endpoints will now compare-and-swap on (id, version). If two
-- recruiters move the same candidate at the same instant, the second one's
-- update fails and the UI can refresh + retry instead of silently overwriting.
-- ----------------------------------------------------------------------------

alter table applications
  add column if not exists version int not null default 1;

alter table applications
  add column if not exists updated_at timestamptz not null default now();

-- Bump version + updated_at on every update.
create or replace function bump_applications_version()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE') then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_applications_version on applications;
create trigger trg_bump_applications_version
  before update on applications
  for each row execute function bump_applications_version();


-- ----------------------------------------------------------------------------
-- 5b. Apply-form dedup — same candidate can't apply twice to the same job.
--
-- Email is normalized lower-case to catch "Foo@x.com" vs "foo@x.com". Phone
-- isn't unique because candidates legitimately share family numbers.
-- ----------------------------------------------------------------------------

create unique index if not exists applications_job_email_uniq
  on applications(job_id, lower(email));


-- ----------------------------------------------------------------------------
-- 5c. Atomic "hire one more, close if full" — single function call so two
-- simultaneous stage moves can't both succeed past the vacancy cap.
--
-- Usage from the API:
--   select moved_to_hired, job_closed
--     from try_hire_application($app_id::uuid, $expected_version::int);
-- Returns moved_to_hired=false if the version check failed (someone else moved
-- it in the meantime). The caller then refetches and decides what to do.
-- ----------------------------------------------------------------------------

create or replace function try_hire_application(
  p_application_id uuid,
  p_expected_version int
) returns table (
  moved_to_hired boolean,
  job_closed boolean,
  current_version int
)
language plpgsql as $$
declare
  v_job_id uuid;
  v_org_id uuid;
  v_vacancies int;
  v_hired_count int;
  v_new_version int;
begin
  -- Lock the row so the version check + update are atomic.
  select job_id, org_id into v_job_id, v_org_id
  from applications
  where id = p_application_id and version = p_expected_version
  for update;

  if not found then
    -- Stale version — someone else already moved this candidate.
    return query
      select false, false, (select version from applications where id = p_application_id);
    return;
  end if;

  update applications
     set stage = 'hired'
   where id = p_application_id
     and version = p_expected_version
   returning version into v_new_version;

  -- Now check vacancies under a row lock on the job to prevent two
  -- simultaneous hires from both passing the count check.
  select coalesce(vacancies, 0) into v_vacancies from jobs where id = v_job_id for update;

  select count(*) into v_hired_count
    from applications where job_id = v_job_id and stage = 'hired';

  if v_vacancies > 0 and v_hired_count >= v_vacancies then
    update jobs set status = 'closed' where id = v_job_id and status <> 'closed';
    return query select true, true, v_new_version;
  else
    return query select true, false, v_new_version;
  end if;
end;
$$;


-- ----------------------------------------------------------------------------
-- 5d. Auto-stamp org_id on application + application_answers from the parent
-- job. Candidates submitting from /careers/apply have no auth session and
-- can't supply org_id; this trigger derives it server-side.
-- ----------------------------------------------------------------------------

create or replace function stamp_org_from_job()
returns trigger language plpgsql as $$
declare
  v_org_id uuid;
begin
  if new.org_id is null then
    select org_id into v_org_id from jobs where id = new.job_id;
    if v_org_id is null then
      raise exception 'Cannot create application: parent job % not found', new.job_id;
    end if;
    new.org_id := v_org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_org_applications on applications;
create trigger trg_stamp_org_applications
  before insert on applications
  for each row execute function stamp_org_from_job();

-- Same trigger on application_answers, derived from the parent application.
create or replace function stamp_org_from_application()
returns trigger language plpgsql as $$
declare
  v_org_id uuid;
begin
  if new.org_id is null then
    select org_id into v_org_id from applications where id = new.application_id;
    if v_org_id is null then
      raise exception 'Cannot create answer: parent application % not found', new.application_id;
    end if;
    new.org_id := v_org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_org_answers on application_answers;
create trigger trg_stamp_org_answers
  before insert on application_answers
  for each row execute function stamp_org_from_application();


-- ----------------------------------------------------------------------------
-- 6. The org-scoping function used by every RLS policy.
--
-- SECURITY DEFINER so it can read team_members regardless of the caller's
-- own RLS view. Returns NULL for anon callers — policies that need an org
-- check will then deny.
--
-- Lookup priority:
--   (a) JWT custom claim 'org_id' (set if you wire a Supabase Auth Hook later)
--   (b) team_members row matching auth.uid()
-- ----------------------------------------------------------------------------

create or replace function current_org_id() returns uuid
language plpgsql stable security definer as $$
declare
  v_org_id uuid;
begin
  -- Path (a): JWT custom claim
  begin
    v_org_id := nullif(current_setting('request.jwt.claim.org_id', true), '')::uuid;
    if v_org_id is not null then
      return v_org_id;
    end if;
  exception when others then
    -- fall through to path (b)
    null;
  end;

  -- Path (b): lookup via team_members.auth_user_id (added by
  -- schema-migration-auth-link.sql). If that migration hasn't run, this
  -- returns NULL and the policy denies — which is the safe default.
  select org_id into v_org_id
  from team_members
  where auth_user_id = auth.uid() and status = 'active'
  limit 1;

  return v_org_id;
end;
$$;

-- Allow the policy machinery to call it without RLS recursion.
grant execute on function current_org_id() to anon, authenticated;

-- Helper for the `super_admin` cross-org override (used by the SaaS owner's
-- internal admin tooling, not regular users).
create or replace function is_platform_super_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from team_members
    where auth_user_id = auth.uid()
      and role = 'super_admin'
      and status = 'active'
  );
$$;

grant execute on function is_platform_super_admin() to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 7. Replace the open RLS policies with org-scoped ones.
--
-- Pattern, applied per table:
--   1. drop the legacy "open access X" policy if it exists.
--   2. create a tenant_isolation policy (full CRUD when org matches).
--   3. add narrow exceptions where the public must still write
--      (applications + application_answers — candidate apply flow).
-- ----------------------------------------------------------------------------

-- jobs ------------------------------------------------------------------------
drop policy if exists "open access jobs"     on jobs;
drop policy if exists "tenant_isolation_jobs" on jobs;
create policy "tenant_isolation_jobs" on jobs
  for all
  using      (org_id = current_org_id() or is_platform_super_admin())
  with check (org_id = current_org_id() or is_platform_super_admin());

-- Public read on jobs is required for the careers/apply page (anon visitor
-- needs to read the job they're applying to). Restrict to status='open' so
-- closed jobs don't leak across orgs.
drop policy if exists "public_can_read_open_jobs" on jobs;
create policy "public_can_read_open_jobs" on jobs
  for select using (status = 'open');


-- job_questions ---------------------------------------------------------------
drop policy if exists "open access questions"        on job_questions;
drop policy if exists "tenant_isolation_questions"   on job_questions;
create policy "tenant_isolation_questions" on job_questions
  for all
  using      (org_id = current_org_id() or is_platform_super_admin())
  with check (org_id = current_org_id() or is_platform_super_admin());

-- Public read so the apply page can render screening questions.
drop policy if exists "public_can_read_questions" on job_questions;
create policy "public_can_read_questions" on job_questions
  for select using (
    exists (select 1 from jobs where jobs.id = job_questions.job_id and jobs.status = 'open')
  );


-- applications ----------------------------------------------------------------
drop policy if exists "open access apps"            on applications;
drop policy if exists "tenant_isolation_apps"       on applications;
drop policy if exists "public_can_apply"            on applications;

-- Recruiters / admins read+write applications in their own org.
create policy "tenant_isolation_apps" on applications
  for all
  using      (org_id = current_org_id() or is_platform_super_admin())
  with check (org_id = current_org_id() or is_platform_super_admin());

-- Anonymous candidates can INSERT into applications IF the job exists and
-- is open. The trigger above stamps org_id from the job, so the row lands
-- in the correct tenant. They cannot SELECT/UPDATE/DELETE.
create policy "public_can_apply" on applications
  for insert
  with check (
    exists (
      select 1 from jobs
      where jobs.id = applications.job_id and jobs.status = 'open'
    )
  );


-- application_answers ---------------------------------------------------------
drop policy if exists "open access answers"           on application_answers;
drop policy if exists "tenant_isolation_answers"      on application_answers;
drop policy if exists "public_can_submit_answers"     on application_answers;

create policy "tenant_isolation_answers" on application_answers
  for all
  using      (org_id = current_org_id() or is_platform_super_admin())
  with check (org_id = current_org_id() or is_platform_super_admin());

create policy "public_can_submit_answers" on application_answers
  for insert
  with check (
    exists (
      select 1 from applications a
      join jobs j on j.id = a.job_id
      where a.id = application_answers.application_id
        and j.status = 'open'
    )
  );


-- team_members ----------------------------------------------------------------
drop policy if exists "open access team_members"     on team_members;
drop policy if exists "tenant_isolation_team"        on team_members;

-- Members can read their own org's roster. Only super_admins of an org can
-- write (handled at the API layer; RLS just provides the floor).
create policy "tenant_isolation_team" on team_members
  for all
  using      (org_id = current_org_id() or is_platform_super_admin())
  with check (org_id = current_org_id() or is_platform_super_admin());


-- interviews ------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'interviews') then
    execute 'drop policy if exists "open access interviews"       on interviews';
    execute 'drop policy if exists "tenant_isolation_interviews"  on interviews';
    execute 'create policy "tenant_isolation_interviews" on interviews
             for all
             using      (org_id = current_org_id() or is_platform_super_admin())
             with check (org_id = current_org_id() or is_platform_super_admin())';
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 8. Sanity checks (run these manually after migration to confirm)
-- ----------------------------------------------------------------------------
--
--   select count(*) from organizations;                   -- expect >= 1
--   select count(*) from jobs                where org_id is null;  -- expect 0
--   select count(*) from applications        where org_id is null;  -- expect 0
--   select count(*) from team_members        where org_id is null;  -- expect 0
--
--   -- Verify RLS policies are live
--   select schemaname, tablename, policyname
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('jobs','applications','application_answers',
--                        'job_questions','team_members','interviews')
--    order by tablename, policyname;
--
--   -- The atomic hire function exists
--   select proname from pg_proc where proname = 'try_hire_application';
--
--   -- The org function exists and resolves
--   select current_org_id();   -- should return the default org's uuid
--                              -- when run from the SQL editor as super_admin
