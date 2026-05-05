-- Interview scheduling — schema migration.
--
-- Run this once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- Adds a single `interviews` table that links an application to a scheduled
-- time slot, optional video meeting link, and a small list of internal
-- participants. A candidate can have multiple rows (reschedule history is
-- captured by the row's `status` rather than overwriting in place).
--
-- Notes on the design:
--   * `meeting_provider='jitsi'` is the default — we generate a free, no-auth
--     Jitsi Meet link server-side (https://meet.jit.si/<random>). This means
--     the feature works on day one without any Google OAuth setup.
--   * `meeting_provider='google_meet'` is reserved for the future Google
--     Calendar integration (see docs/interview-scheduling-plan.md).
--   * `meeting_provider='manual'` lets recruiters paste a Zoom/Teams link.
--   * RLS policy mirrors `applications` — open access for now since we gate
--     all writes through API routes that use the service-role key.

create table if not exists interviews (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null references applications(id) on delete cascade,
  job_id              uuid not null references jobs(id) on delete cascade,
  scheduled_by        uuid references team_members(id) on delete set null,
  candidate_email     text not null,
  candidate_name      text not null,
  scheduled_at        timestamptz not null,
  duration_minutes    int not null default 30 check (duration_minutes between 15 and 240),
  timezone            text not null default 'Asia/Kolkata',
  status              text not null default 'scheduled'
                          check (status in ('scheduled','completed','cancelled','no_show')),
  meeting_provider    text not null default 'jitsi'
                          check (meeting_provider in ('jitsi','google_meet','manual','none')),
  meeting_link        text,
  -- Internal participants (interviewers from the team). Stored as
  -- [{ id, name, email, role }] so we don't break when a member is archived.
  participants        jsonb not null default '[]'::jsonb,
  notes               text,
  -- One row, two reminders: 24h before and 1h before. Both null means none
  -- sent. The cron job updates these as it fires emails so we never spam.
  reminder_sent_at    timestamptz,        -- legacy / "any reminder fired"
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- For existing tables created before reminder_24h_sent_at + reminder_1h_sent_at
-- were added. Idempotent.
alter table interviews
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at  timestamptz;

create index if not exists interviews_application_idx on interviews(application_id);
create index if not exists interviews_job_idx on interviews(job_id);
create index if not exists interviews_scheduled_at_idx on interviews(scheduled_at);
create index if not exists interviews_status_idx on interviews(status);

-- Auto-update `updated_at` on every row change. Re-uses the generic trigger
-- that other tables already share if it exists.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create function set_updated_at() returns trigger as $f$
    begin
      new.updated_at := now();
      return new;
    end;
    $f$ language plpgsql;
  end if;
end $$;

drop trigger if exists trg_interviews_updated_at on interviews;
create trigger trg_interviews_updated_at
  before update on interviews
  for each row execute function set_updated_at();

alter table interviews enable row level security;
drop policy if exists "open access interviews" on interviews;
create policy "open access interviews" on interviews
  for all using (true) with check (true);
