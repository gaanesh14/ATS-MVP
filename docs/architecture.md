# Architecture

## What you're building

A small ATS. Recruiter creates a job → gets a public URL → candidates apply with a resume → resume is parsed by Claude → recruiter sees a filterable dashboard.

## The 3 tracks

```
  ┌────────────────────────┐         ┌────────────────────────┐
  │  Student B             │         │  Student A             │
  │  Candidate Side        │         │  Recruiter Side        │
  │  /careers/*            │         │  /dashboard/*          │
  │                        │         │                        │
  │  WRITES rows to        │         │  READS rows from       │
  │  applications +        │         │  applications +        │
  │  application_answers   │         │  job_questions         │
  └───────────┬────────────┘         └────────────────────────┘
              │                                   ▲
              │ fire-and-forget POST              │
              ▼                                   │
  ┌─────────────────────────────────────┐         │
  │  Student C                          │         │
  │  /api/applications/[id]/parse       │─────────┘
  │                                     │  UPDATEs the same row
  │  pdf-parse → OpenAI → ATS score     │  (parsed_data, ats_score)
  └─────────────────────────────────────┘
```

**Why this split is parallel-safe:** each student touches different routes, but they all read/write the same `applications` table. As long as nobody renames a column, they don't collide.

## Data flow for one application

1. Candidate hits `/careers/<jobId>?source=linkedin` (Student B)
2. Fills form, picks a PDF → uploaded to Supabase Storage `resumes/` bucket
3. **One INSERT** into `applications` (resume_url, source='linkedin', parse_status='pending')
4. **N INSERTs** into `application_answers` (one per screening question)
5. Browser fires `POST /api/applications/<new-id>/parse` and **does not await** it
6. That endpoint (Student C): downloads PDF → `pdf-parse` extracts text → OpenAI `gpt-4o-mini` (JSON mode) returns structured JSON → ATS rubric runs → **UPDATE** the row with `parsed_data`, `ats_score`, `ats_issues`, `parse_status='parsed'`
7. Recruiter visits `/dashboard/jobs/<jobId>` (Student A) — sees the new row, score badge, can open dialog with parsed data + iframe of resume

## File tree (target state at end of Hour 3)

```
ats-mvp/
├── .env.local                         ← 3 keys, never commit
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
│
├── lib/
│   ├── supabase.ts                    ← shared client
│   ├── stages.ts                      ← stage helpers (built-in + custom)
│   └── utils.ts                       ← cn(), formatINR, formatDate, etc.
│
├── components/
│   ├── ui/                            ← shadcn-generated + ats-pill, ats-ring,
│   │                                     stage-pill, source-tag, kanban-board
│   └── shell/                         ← sidebar, topbar
│
└── app/
    ├── layout.tsx
    ├── page.tsx                       ← landing → redirect to /careers
    ├── globals.css
    │
    ├── careers/                                   ← STUDENT B (public, no auth)
    │   ├── page.tsx                               list of open jobs (cards)
    │   ├── apply/
    │   │   └── page.tsx                           apply form (Full name, Email,
    │   │                                          Phone, Years exp, Location,
    │   │                                          Resume, screening questions)
    │   └── success/
    │       └── page.tsx                           thank-you page
    │
    ├── dashboard/                                 ← STUDENT A (recruiter)
    │   ├── layout.tsx                             sidebar + topbar shell
    │   ├── page.tsx                               overview (stat cards, top
    │   │                                          candidates, recent jobs/apps)
    │   ├── jobs/
    │   │   ├── page.tsx                           jobs list (cards + tabs)
    │   │   ├── new/page.tsx                       create-job form
    │   │   └── [id]/
    │   │       ├── page.tsx                       job detail (stat cards + tabs:
    │   │       │                                  Candidates / Details / Comments)
    │   │       └── edit/page.tsx                  edit job form
    │   ├── applicants/page.tsx                    global candidates list, all jobs
    │   ├── team/page.tsx                          team members + invites (seed)
    │   ├── settings/page.tsx                      profile, org, notifications, sec
    │   └── help/page.tsx                          FAQ + quick guides + contact
    │
    └── api/
        ├── applications/
        │   └── [id]/
        │       ├── parse/route.ts                 STUDENT C: pdf → OpenAI → ATS
        │       └── stage/route.ts                 PATCH: move candidate stage
        └── jobs/
            └── [id]/route.ts                      PATCH/DELETE a job
```

**Recruiter-side pages (Student A territory):** Dashboard / Jobs / Job detail /
Create / Edit / Applicants / Team / Settings / Help. Sidebar lists all six top-
level entries. **Settings persists to localStorage** and **Team uses seed data**
until auth + a `team_members` table land.

## Database mental map

| Table | Owned by | Purpose |
|---|---|---|
| `jobs` | A writes, B reads | One row per posting |
| `job_questions` | A writes, B reads | Screening questions per job |
| `applications` | B inserts, C updates, A reads | One row per candidate — the central table |
| `application_answers` | B writes, A reads | Candidate's answers to screening questions |
| `team_members` | A writes (super_admin) | Recruiter dashboard users + their role |

### Roles

`team_members.role` is one of:

- **`super_admin`** — full access; only role allowed to invite, edit or
  archive other members
- **`admin`** — can create/edit/delete jobs and edit org settings; cannot
  touch the team
- **`recruiter`** — read-only across the dashboard; can sign in and observe
  but not modify

Permissions are centralized in [`lib/rbac.ts`](../lib/rbac.ts). Every gated
button in the UI calls `can(role, permission)` from that file — adding a new
gated action means adding it to `Permission` and `ROLE_PERMISSIONS`, not
sprinkling role checks across pages.

The "current user" is resolved by `fetchCurrentUser()` in the same file. Until
Supabase Auth is wired, it falls back to the first active super admin in
`team_members` (seeded by the migration). When Auth lands, replace that
fallback with `supabase.auth.getUser()` + lookup-by-email.

### Migrations to run (in order)

1. `docs/schema.sql` — base tables
2. `docs/schema-migration-vacancies.sql`
3. `docs/schema-migration-stage.sql`
4. `docs/schema-migration-match-fields.sql`
5. `docs/schema-migration-extra-stages.sql`
6. `docs/schema-migration-self-reported.sql`
7. `docs/schema-migration-team-members.sql`
8. `docs/schema-migration-auth-link.sql` ← **new**

### Authentication

Sign-in is **Supabase Auth** (email + password). Required setup in the
Supabase dashboard before signup will work:

- Project Settings → Authentication → enable the **Email** provider
- For the MVP, also disable **Confirm email** so signup → login is one step
- Optional: configure the password reset email template (subject, redirect URL)

The auth wiring lives in:

- [`components/shell/auth-provider.tsx`](../components/shell/auth-provider.tsx) —
  client-side session guard that wraps `app/dashboard/layout.tsx`. Anyone
  without a session is redirected to `/login`. Exposes `useAuth()` with
  `{ authUser, member, role, signOut }`.
- [`app/(auth)/login/page.tsx`](../app/(auth)/login/page.tsx) — email + password
- [`app/(auth)/signup/page.tsx`](../app/(auth)/signup/page.tsx) — creates the
  auth user, upserts a `team_members` row with default role=`recruiter`
- [`app/(auth)/forgot-password/page.tsx`](../app/(auth)/forgot-password/page.tsx)
  — sends a reset email via `supabase.auth.resetPasswordForEmail`
- [`app/(auth)/reset-password/page.tsx`](../app/(auth)/reset-password/page.tsx)
  — picks up the recovery session and updates the password
- The `on_auth_user_created` trigger (added in
  `schema-migration-auth-link.sql`) is a server-side safety net that inserts
  a `team_members` row for any new `auth.users` row, so manual Supabase Auth
  signups stay in sync.

Public pages (`/`, `/careers/*`) stay unauthenticated — anyone can browse
open jobs and apply without an account. Only `/dashboard/*` requires login.

Plus one **Storage bucket** `resumes/` (public) for PDFs.

### The `parsed_data` JSON contract (do NOT change)

This is the shape Student C writes and Student A reads:

```ts
{
  experience_years: number,
  current_company: string | null,
  current_role: string | null,
  location: string | null,
  skills: string[],
  notice_period_days: number | null,
  current_salary: number | null,
  expected_salary: number | null,
  email_in_resume: string | null,
  phone_in_resume: string | null,
}
```

Student A's filter bar reads from `parsed_data.*` client-side — that's why C must keep the JSON shape exactly as documented.

## Hourly schedule

| Hour | Activity |
|---|---|
| 0 (30 min) | All 3 together: setup, schema, bucket, .env, Vercel deploy |
| 1–3 | Each student on their own branch, building their track |
| 4 (60 min) | All 3 reconverge: end-to-end test, fix integration bugs |
| 5–6 | Polish (filters, dialog, source tracking, retries) |
| 7 | (Optional) Auth on `/dashboard/*` |
| 8 | Demo / buffer |
