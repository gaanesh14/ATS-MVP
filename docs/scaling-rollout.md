# Scaling rollout: multi-tenancy + race fixes + RLS hardening

This is the runbook for `docs/schema-migration-multi-tenancy.sql`. Read end-to-end once before you start. Estimated total time: 30–60 minutes including verification.

The migration is the single most important change you'll make before adding a second customer — every later feature compounds on it. Apply it now, while the dataset is still small.

---

## What changes

### Database

- New `organizations` table with one seed row (`Default Organization`).
- New `org_id uuid not null` foreign key on every tenant-scoped table:
  `jobs`, `applications`, `application_answers`, `job_questions`,
  `team_members`, and `interviews` (if present).
- New composite indexes on `(org_id, created_at desc)` etc. — these
  matter once you have 10K+ applications because every dashboard query
  filters by org.
- New `applications.version int` and `applications.updated_at` plus a
  trigger that bumps version on every update. Powers optimistic
  concurrency on stage moves.
- New unique index on `applications(job_id, lower(email))` — same
  candidate cannot apply to the same job twice. Fixes the apply-form
  double-submit race.
- New trigger `stamp_org_from_job()` that auto-fills `org_id` on new
  applications from the parent job's org. Keeps the public apply page
  working without exposing org_id to the candidate.
- New stored procedure `try_hire_application(app_id, expected_version)`
  — atomic compare-and-swap that hires a candidate and closes the job
  if the hired count reaches `vacancies`. Replaces the two-query
  pattern in `app/api/applications/[id]/stage/route.ts` that races
  with itself when two recruiters click "Hire" simultaneously.
- All `using (true)` RLS policies are dropped and replaced with
  org-scoped policies anchored on a new `current_org_id()` function.
  RLS becomes real for the first time.
- A narrow `public_can_apply` exception lets anonymous candidates
  insert into `applications` and `application_answers` only when the
  job is `status='open'`. They still cannot read, update, or delete.

### Code (this PR — minimal foundation)

- `lib/supabase.ts` — adds `Organization` type, adds `org_id` to every
  row type. Backwards compatible: existing callers keep working
  because they don't reference `org_id` yet.
- `components/shell/auth-provider.tsx` — loads the active org and
  exposes `currentOrg` via context. New components can consume it;
  existing components are unaffected.
- `lib/auth-server.ts` (new) — `requireRole(req, perm)` helper for
  API routes. Reads the session, looks up the team_member row, and
  throws 401/403 as appropriate. Includes `org_id` in the returned
  shape so callers don't have to look it up themselves.
- `app/api/applications/[id]/stage/route.ts` — switches the
  hire-vs-close path to `try_hire_application(...)` so two
  simultaneous hires can no longer both succeed past vacancy.

### Code (deferred — mechanical follow-up, file-by-file)

The following pages still query Supabase directly and don't yet
filter by `org_id`. They keep working after the migration because
every existing row belongs to the default org and every existing
user resolves to that org via team_members. Update them when you
want to actually onboard a second tenant:

- `app/dashboard/page.tsx`
- `app/dashboard/jobs/page.tsx`
- `app/dashboard/jobs/[id]/page.tsx`
- `app/dashboard/jobs/[id]/edit/page.tsx`
- `app/dashboard/jobs/new/page.tsx`
- `app/dashboard/applicants/page.tsx`
- `app/dashboard/team/page.tsx`
- `app/dashboard/interviews/page.tsx`
- `app/api/jobs/[id]/route.ts`
- `app/api/team/route.ts`, `app/api/team/[id]/route.ts`
- `app/api/interviews/*`
- `app/api/applications/[id]/parse/route.ts`
- `app/careers/apply/page.tsx`

For each one the change is the same shape: read `currentOrg` from
context (client) or call `requireRole(req, perm)` (server), filter
queries by `.eq('org_id', orgId)`, and stamp `org_id` on inserts
where the trigger doesn't already do it.

---

## Pre-flight checklist

Do not skip these.

1. **Backup the database.** Supabase Dashboard → Settings → Backups
   → "Take new backup". Wait for it to complete before proceeding.

2. **Quiesce writes.** Either announce a 15-minute window to your
   team, or temporarily put the dashboard behind a maintenance flag.
   Long-running stage changes during the migration can deadlock with
   the new triggers.

3. **Verify the auth-link migration is applied.** Run this in the
   SQL editor:
   ```sql
   select column_name from information_schema.columns
    where table_name = 'team_members' and column_name = 'auth_user_id';
   ```
   If this returns zero rows, run `docs/schema-migration-auth-link.sql`
   first. The org-scoping function relies on `auth_user_id`.

4. **Confirm super_admin row.** Make sure there's at least one
   `team_members` row with `role='super_admin'`, `status='active'`,
   and a non-null `auth_user_id` matching your Supabase auth user.
   Without this, `current_org_id()` returns NULL for you and the new
   RLS policies will lock you out of your own data.
   ```sql
   select id, email, role, status, auth_user_id is not null as linked
     from team_members where role = 'super_admin' and status = 'active';
   ```

5. **Note the in-flight numbers.** Before migration, record:
   ```sql
   select 'jobs' as t, count(*) from jobs
   union all select 'applications', count(*) from applications
   union all select 'team_members', count(*) from team_members;
   ```
   You'll re-run this after to confirm no row was lost.

---

## Migration steps

### 1. Apply the SQL

Open the Supabase Dashboard → SQL Editor → "New query". Paste the
entire contents of `docs/schema-migration-multi-tenancy.sql`. Click
"Run". On a database with <10K rows it takes a few seconds. Watch
for any red NOTICE/ERROR — there should be none.

### 2. Run the sanity checks at the bottom of the migration

The migration ends with a commented-out sanity-check block. Copy
those queries into a new SQL editor tab and run them one at a time:

```sql
select count(*) from organizations;                   -- expect >= 1
select count(*) from jobs                where org_id is null;  -- expect 0
select count(*) from applications        where org_id is null;  -- expect 0
select count(*) from team_members        where org_id is null;  -- expect 0

select schemaname, tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and tablename in ('jobs','applications','application_answers',
                     'job_questions','team_members','interviews')
 order by tablename, policyname;

select proname from pg_proc where proname = 'try_hire_application';
select current_org_id();
```

Expect:
- All counts of `org_id is null` are `0`.
- Each of the six tables has a `tenant_isolation_*` policy plus the
  applicable `public_can_*` exceptions.
- `try_hire_application` and `current_org_id` both exist.
- `current_org_id()` returns the default org's UUID when run by you.

If any of these fail, **stop** and investigate before deploying any
code. The most common issue is missing `auth_user_id` on your own
team_members row (see pre-flight item 4).

### 3. Smoke test from the app

Before deploying the code changes:

- Open `/dashboard` while the existing code is still running.
  Everything should look identical because every row belongs to the
  default org and `current_org_id()` returns the default org for
  every signed-in user.
- Open the public `/careers/apply?jobId=<some-open-job-id>` link in
  an incognito window and submit a test application. The trigger
  should stamp it with the default org. Verify:
  ```sql
  select id, email, org_id from applications
   order by created_at desc limit 1;
  ```
- Try moving a candidate's stage. The stage update should still
  work, and `select version, updated_at from applications where id =
  '<that_id>'` should show version > 1 and a fresh `updated_at`.

### 4. Deploy the code changes

Deploy `lib/supabase.ts`, `lib/auth-server.ts`,
`components/shell/auth-provider.tsx`, and
`app/api/applications/[id]/stage/route.ts` together. They're all
backwards-compatible with the database before the migration too,
so it doesn't matter if a small drift opens between the SQL apply
and the deploy.

### 5. Schedule the page-by-page rollout

Pick the next paying customer's go-live date. Two weeks before that,
walk the deferred-files list above and add `org_id` filtering to
each page. Order of priority (by blast radius if it leaks):

1. `/api/applications/[id]/parse/route.ts` — runs against any row
   today. Add `requireRole`.
2. `/api/jobs/[id]/route.ts` and `/api/team/*` — anyone can call.
3. `/dashboard/jobs/page.tsx` and `/dashboard/applicants/page.tsx`
   — biggest queries, most likely to leak across orgs in the UI.
4. `/dashboard/team/page.tsx` — already org-tight via team_members
   role check, but should still filter by org_id.
5. `/dashboard/interviews/page.tsx` and `/api/interviews/*`.
6. `/careers/apply/page.tsx` — last because it's already protected
   by the public_can_apply policy.

---

## Rollback plan

If something goes wrong **before** the code changes are deployed:

```sql
-- Restore the open RLS policies so the running app keeps working.
drop policy if exists "tenant_isolation_jobs"          on jobs;
drop policy if exists "public_can_read_open_jobs"      on jobs;
create policy "open access jobs" on jobs for all using (true) with check (true);

drop policy if exists "tenant_isolation_questions"     on job_questions;
drop policy if exists "public_can_read_questions"      on job_questions;
create policy "open access questions" on job_questions for all using (true) with check (true);

drop policy if exists "tenant_isolation_apps"          on applications;
drop policy if exists "public_can_apply"               on applications;
create policy "open access apps" on applications for all using (true) with check (true);

drop policy if exists "tenant_isolation_answers"       on application_answers;
drop policy if exists "public_can_submit_answers"      on application_answers;
create policy "open access answers" on application_answers for all using (true) with check (true);

drop policy if exists "tenant_isolation_team"          on team_members;
create policy "open access team_members" on team_members for all using (true) with check (true);

drop policy if exists "tenant_isolation_interviews"    on interviews;
create policy "open access interviews" on interviews for all using (true) with check (true);
```

Leave the `org_id` columns and the `organizations` table in place
— they're harmless without the policies and you'll want them on
the second attempt. Then dig into whatever broke and re-apply the
RLS section once it's fixed.

If a code change has shipped and you need to revert past it: roll
back the deployment first, then reset the policies. Code expecting
`current_org_id()` to work but running against open RLS is a recipe
for "it works in dev, the prod query returns 0 rows".

---

## What stays open after this migration

- **JWT custom claim path is wired but optional.** `current_org_id()`
  reads `request.jwt.claim.org_id` first, falling back to the
  `team_members.auth_user_id` lookup. To eliminate the per-request
  table lookup, configure a Supabase Auth Hook that emits `org_id`
  in the JWT after sign-in. Until then the lookup adds <1ms per
  request — fine for the first 10K users.

- **Org switching for users in multiple orgs.** Today,
  `current_org_id()` picks the first matching team_members row. If
  you let one user belong to two orgs (consultant scenario), pick
  one as primary on sign-in and let them switch via a header. Wire
  it through the JWT custom claim path so policies don't have to
  guess.

- **Audit log.** Phase 2 of the audit. Not in this migration, but
  the trigger pattern used for `bump_applications_version` is the
  same shape you'll want for `audit_events`.

- **Public `careers` page route move.** Today, candidates upload
  resumes directly via the anon Supabase client. The
  `public_can_apply` policy keeps this working but the resume
  bucket is still public. The follow-up PR is to route the upload
  through `/api/careers/apply` server-side, switch the bucket to
  private, and serve resumes via signed URLs.

---

## Edge cases this migration addresses

- **Apply-form double-submit creates duplicate applications.**
  Fixed by the unique index on `(job_id, lower(email))`. Second
  insert errors with `23505 unique_violation` — the apply page
  should catch this and show "You've already applied to this job".

- **Two recruiters move the same candidate simultaneously.** Fixed
  by `applications.version`. Stage update endpoints now compare
  expected vs current version; second writer fails and the UI
  refreshes.

- **Two simultaneous hires both pass the vacancies cap.** Fixed by
  `try_hire_application(...)` taking a row-level lock on jobs
  before counting hired candidates.

- **Anonymous user calls a privileged API endpoint.** Fixed by the
  org-scoped RLS policies. Combined with the new `requireRole()`
  helper in route handlers, this is defense-in-depth.

- **Cross-tenant data leak via direct Supabase client query.** Fixed
  by the `tenant_isolation_*` policies — the anon key can no
  longer read other orgs' rows even if a frontend bug forgets to
  filter.

## Edge cases NOT yet addressed (next PRs)

- **Resume bucket is public.** Until the careers route move,
  resume URLs are still guessable.
- **No retries on OpenAI 429/5xx.** Parse pipeline still throws on
  first failure.
- **Stuck `parse_status='processing'` rows after a worker crash.**
  Need a sweeper that flips them after 10 min.
- **Prompt injection via resume body.** Still concatenated raw into
  the LLM prompt.
- **No GDPR/DPDP delete endpoint.** No path for a candidate to
  request their data be erased.

These are the next three PRs after this one, in roughly that
order. See section 8 of the audit (`/scaling-plan` artifact) for
prioritization.
