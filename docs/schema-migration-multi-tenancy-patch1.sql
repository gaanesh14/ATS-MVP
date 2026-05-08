-- =============================================================================
-- Patch 1 for schema-migration-multi-tenancy.sql
--
-- Adds two triggers we missed in the first cut:
--
--   1. stamp_org_on_job — fills jobs.org_id from the inserter's team_members
--      row when the client-side create-job form does
--      `supabase.from('jobs').insert({...})` without supplying org_id.
--
--   2. stamp_org_from_job_questions — same idea for job_questions, but
--      derives org_id from the parent job (matches the pattern used for
--      applications and application_answers).
--
-- Run this AFTER schema-migration-multi-tenancy.sql. Idempotent.
-- =============================================================================

-- 1. jobs: derive org_id from auth.uid() → team_members lookup. Mirrors the
--    `current_org_id()` helper but inlined here so the trigger can run on
--    INSERT (when no row yet, RLS hasn't kicked in).
create or replace function stamp_org_from_user()
returns trigger language plpgsql security definer as $$
declare
  v_org_id uuid;
begin
  if new.org_id is null then
    select org_id into v_org_id
    from team_members
    where auth_user_id = auth.uid()
      and status = 'active'
    limit 1;

    if v_org_id is null then
      raise exception 'Cannot create row: no active team membership for this user';
    end if;

    new.org_id := v_org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_org_jobs on jobs;
create trigger trg_stamp_org_jobs
  before insert on jobs
  for each row execute function stamp_org_from_user();


-- 2. job_questions: derive from parent job, matching the application_answers
--    pattern.
create or replace function stamp_org_from_parent_job()
returns trigger language plpgsql as $$
declare
  v_org_id uuid;
begin
  if new.org_id is null then
    select org_id into v_org_id from jobs where id = new.job_id;
    if v_org_id is null then
      raise exception 'Cannot create question: parent job % not found', new.job_id;
    end if;
    new.org_id := v_org_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_org_job_questions on job_questions;
create trigger trg_stamp_org_job_questions
  before insert on job_questions
  for each row execute function stamp_org_from_parent_job();

  


-- 3. Sanity checks (run after applying)
--
--   -- Both triggers exist
--   select tgname from pg_trigger
--    where tgname in ('trg_stamp_org_jobs', 'trg_stamp_org_job_questions');
--
--   -- Quick smoke test: insert a fake row and confirm org_id was stamped.
--   -- Only run as your signed-in app user, not the SQL editor's superuser.
--   --
--   -- insert into jobs (title) values ('test trigger');
--   -- select id, title, org_id from jobs where title = 'test trigger';
--   -- delete from jobs where title = 'test trigger';
