# Student A — Recruiter Side

**Time budget:** Hours 1–3 build + Hours 5–6 polish
**Goal:** A recruiter can create jobs, see all jobs, click into one, and see filtered applicants with their parsed data.

## Pages you own

| Path | Purpose |
|---|---|
| `/dashboard` | Overview — stat cards, top candidates, recent jobs/applicants |
| `/dashboard/jobs` | Jobs list (cards + tabs: All / Open / Closed) |
| `/dashboard/jobs/new` | Form to create a new job |
| `/dashboard/jobs/[id]` | Detail page for one job — applicants, filters, dialog |
| `/dashboard/jobs/[id]/edit` | Edit job form |
| `/dashboard/applicants` | Global candidates list across every job |
| `/dashboard/team` | Team members and invites (seed data, no DB yet) |
| `/dashboard/settings` | Profile / Organization / Notifications / Security (localStorage) |
| `/dashboard/help` | FAQ, quick guides, contact options |

**Wiring status:**

- Dashboard / Jobs / Job detail / Edit / Applicants → Supabase (real CRUD)
- **Team → Supabase** (`team_members` table + `/api/team` routes). Buttons
  are gated client-side by `lib/rbac.ts`; super admins can invite/edit/archive,
  admins and recruiters get read-only.
- **Settings → localStorage** for profile/org/notifications (`photonx:settings:v1`),
  **Supabase Auth** for password change (`supabase.auth.signInWithPassword` to
  verify current, then `supabase.auth.updateUser({ password })` to apply).
  Password change shows a clear error until Supabase Auth is enabled.
- Help → static.

## Roles & permissions

| Role | Jobs | Applicants (move stage / re-parse / bulk) | Team | Settings (org) | Settings (self) |
|---|---|---|---|---|---|
| Super Admin   | Create / Edit / Delete | ✓ | Invite / Edit / Archive | ✓ | ✓ |
| Admin         | Create / Edit / Delete | ✓ | View only               | ✓ | ✓ |
| Recruiter     | View only              | View only | View only | — | ✓ (password + name) |

The full permission list lives in [`lib/rbac.ts`](../lib/rbac.ts) under
`Permission`. Every gated UI control reads from `can(role, perm)` so adding a
new permission is single-source-of-truth.

**Where roles are enforced today:**

- Topbar **Create New Job** CTA — hidden for Recruiter
- Dashboard "Create your first job" link — replaced with "Ask an admin to
  post one" for Recruiter
- Job card 3-dots menu — entire button hidden for Recruiter
- Job detail **Edit / Delete** header buttons — hidden for Recruiter
- `/dashboard/jobs/new` and `/dashboard/jobs/[id]/edit` — route guards
  redirect Recruiter back to the jobs list
- Candidate bulk-actions bar — hidden for Recruiter
- Team page **Invite** button — disabled with a lock icon for non-Super-Admin
- Team page **Manage member** dialog — Save / Archive / Resend disabled for
  non-Super-Admin
- Settings → Organization tab — inputs disabled for Recruiter

**What's NOT yet enforced server-side:** the API routes still trust the
client. Until Supabase Auth + RLS policies are turned on, role checks are UX
only. The migration files include commented-out RLS policy templates ready
to paste in when you're ready to lock down writes.

## Auth flow

1. Public landing at `/` → "Get started" sends users to `/signup` (or
   `/login` if they already have a session)
2. Sign-up creates an `auth.users` row (Supabase Auth) and a `team_members`
   row with role=`recruiter`. Promote them from Team → Manage member.
3. Sign-in via `/login` → on success, `AuthProvider` looks up the matching
   `team_members` row, stamps `last_active_at`, and the dashboard renders.
4. Forgot password → email link → `/reset-password` → updates via
   `supabase.auth.updateUser({ password })`.
5. Logout from the sidebar dropdown → `supabase.auth.signOut()` → bounced to
   `/login`.

The dashboard layout is gated by [`components/shell/auth-provider.tsx`](../components/shell/auth-provider.tsx).
Pages inside it use `useAuth()` instead of querying the user themselves.

## Hour 1 — Dashboard list page

**File:** `app/dashboard/page.tsx`

Already scaffolded. Verify it runs:
1. `npm run dev`
2. Open `/dashboard` — empty table with "Create New Job" button

Manually insert one row in `jobs` table via Supabase Table Editor. Refresh — you should see it.

## Hour 2 — Create-job form

**File:** `app/dashboard/jobs/new/page.tsx`

Form fields:
- Title (text)
- Description (textarea, 8 rows)
- Location (text)
- Min Experience, Max Experience (numbers)
- Min Salary, Max Salary (numbers, INR)
- Dynamic list of **Screening Questions** — add/remove rows
  - Each row: question text + dropdown for type (`text`, `number`, `yesno`) + required checkbox

On submit:
1. INSERT one row into `jobs` (status='open')
2. Get the new job's `id`
3. INSERT all questions into `job_questions` with that `job_id`
4. Redirect to `/dashboard`

**Test:** create "Frontend Developer" with 2 questions. Verify in Supabase Table Editor: 1 row in `jobs`, 2 rows in `job_questions`. Then check `/dashboard` shows it.

## Hour 3 — Job detail page (basic)

**File:** `app/dashboard/jobs/[id]/page.tsx`

In Hour 3 just show the job + basic applicant list. Filters come in Hour 5.

The page should:
1. Fetch job by id, show: title, description, location, exp range, salary range
2. Show **"Public Apply Link"** with copy-to-clipboard button:
   ```
   ${window.location.origin}/careers/apply?jobId=${jobId}
   ```
3. Below, fetch all `applications` for this `job_id`, sorted by `created_at desc`
4. Render in a table: Name, Email, Phone, Source, ATS Score, Created At, "View" button
5. ATS Score is a colored badge:
   - Green if `>= 70`
   - Yellow if `40–69`
   - Red if `< 40`
   - Gray if `null` (not parsed yet)
6. "View" button opens a Dialog (filled in Hour 6)

> **Note on params:** In Next.js 14 (what we use), route params are a plain sync object: `{ params }: { params: { id: string } }` and `const { id } = params;`. The `await params` / `use(params)` pattern is Next.js 15+ only — don't copy that from blog posts.

## Hour 5 — Filters

Add a filter bar between the "Public Apply Link" section and the applicants table.

Filters (all optional):
- Min Experience (number)
- Max Experience (number)
- Max Notice Period (days, number)
- Max Expected Salary (INR, number)
- Location (text, "contains" match, case-insensitive)
- Skill keyword (text, "contains" any element of `skills` array)
- **ATS-Compliant Only** (toggle — when on, only show rows with `ats_score >= 70`)

`parsed_data` is JSONB with this shape (Student C writes it):
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
}
```

**Apply filters CLIENT-SIDE** on the array of applications you already fetched. Server-side JSONB filtering is overkill for the MVP.

Show "Showing X of Y candidates" + a **Reset Filters** button.

## Hour 6 — Applicant detail dialog

When recruiter clicks "View" on an applicant, show a dialog with:
- Name, email, phone
- Embedded resume preview using `<iframe src={resume_url} className="w-full h-96"/>`
- Parsed data: experience, current company, role, location, skills as badges, notice period, current salary, expected salary
- ATS score (big colored number) + `ats_issues` as a bulleted list
- Screening question answers (JOIN with `job_questions` for question text):

```ts
const { data } = await supabase
  .from('application_answers')
  .select('answer, job_questions(question)')
  .eq('application_id', appId);
```

Make the dialog wide (`max-w-4xl`) and scrollable.

Add a **"Re-parse Resume"** button that calls:
```ts
await fetch(`/api/applications/${id}/parse`, { method: 'POST' });
```

## Common bugs

| Symptom | Fix |
|---|---|
| Hydration error: "text content does not match" | You're using `new Date()` or `Math.random()` in a Server Component. Add `'use client'` at the top. |
| `supabase` undefined | Restart `npm run dev` after editing `.env.local`. Env vars only load on startup. |
| `[id]` is undefined | In Next.js 14, params is sync: `{ params }: { params: { id: string } }` then `const { id } = params;` (no await) |
| Filter shows nothing | `parsed_data` is null until Student C runs the parser. Test the real apply flow first. |

## Done definition

- [ ] `/dashboard` lists all jobs
- [ ] `/dashboard/jobs/new` creates a job + screening questions
- [ ] `/dashboard/jobs/[id]` shows job, public apply link, applicants
- [ ] Filter bar works for all 7 filters
- [ ] "View" → dialog shows resume, parsed data, answers, ATS score
- [ ] "Re-parse Resume" button works
