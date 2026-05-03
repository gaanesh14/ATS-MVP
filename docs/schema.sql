-- ============================================
-- ATS MVP — Database Schema
-- Run this entire file in Supabase SQL Editor
-- DO NOT MODIFY column names after running this
-- ============================================

-- Jobs created by recruiters
create table jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  min_experience numeric default 0,
  max_experience numeric default 100,
  min_salary numeric,
  max_salary numeric,
  status text default 'open',
  created_at timestamptz default now()
);

-- Custom screening questions for each job
create table job_questions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  question text not null,
  question_type text default 'text',
  is_required boolean default true,
  display_order int default 0
);

-- Candidate applications
create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  resume_url text,
  resume_text text,
  parsed_data jsonb,
  ats_score int,
  ats_issues jsonb,
  source text default 'careers_page',
  parse_status text default 'pending',
  created_at timestamptz default now()
);

-- Candidate answers to screening questions
create table application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) on delete cascade,
  question_id uuid references job_questions(id) on delete cascade,
  answer text
);

-- Helpful indexes
create index on applications(job_id);
create index on application_answers(application_id);
create index on job_questions(job_id);

-- For the MVP, allow public read/write (we will lock this down with auth in Hour 7)
alter table jobs enable row level security;
alter table job_questions enable row level security;
alter table applications enable row level security;
alter table application_answers enable row level security;

create policy "open access jobs" on jobs for all using (true) with check (true);
create policy "open access questions" on job_questions for all using (true) with check (true);
create policy "open access apps" on applications for all using (true) with check (true);
create policy "open access answers" on application_answers for all using (true) with check (true);
