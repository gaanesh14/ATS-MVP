# Interviews — setup & operations

> Status: **shipped** as of 2026-05-04. Recruiters can schedule, reschedule,
> and cancel interviews from the dashboard. Each interview gets an
> auto-generated Jitsi Meet link and an .ics calendar invite emailed to the
> candidate via Brevo.

This doc covers:

1. The 30-second mental model
2. One-time bootstrap (schema migration + Brevo API key)
3. How a recruiter uses it day-to-day
4. Roles & permissions
5. Edge cases and how the code handles them
6. Troubleshooting
7. Roadmap — what's deferred for now

---

## 1. Mental model

```
Recruiter  ───▶  Schedule dialog  ───▶  POST /api/interviews
                                              │
                                              ├─ Validate slot (future, sane duration)
                                              ├─ Conflict check vs candidate's other rows
                                              ├─ Generate Jitsi link  (or use pasted link)
                                              ├─ Insert into `interviews`
                                              └─ Brevo  ──▶  Candidate inbox
                                                              + .ics attachment
                                                              + interviewers on CC
```

No Google OAuth. No third-party scheduler. The "Meet link" is a free,
no-login Jitsi room (e.g. `https://meet.jit.si/photonx-acme-jane-a3f9`).
Works in any modern browser, on any device, from any provider.

---

## 2. Bootstrap

### Step 1 — Run the schema migration

Open Supabase → SQL editor → paste the contents of
[`docs/schema-migration-interviews.sql`](./schema-migration-interviews.sql) →
Run. The script is idempotent; safe to re-run.

What it creates:

| Object | Purpose |
|---|---|
| `interviews` table | One row per scheduled interview. Has `application_id`, `scheduled_at`, `duration_minutes`, `meeting_link`, `participants` (jsonb), `status`. |
| Indexes | `application_id`, `job_id`, `scheduled_at`, `status` — keep the list page snappy. |
| `set_updated_at` trigger | Stamps `updated_at` on every PATCH. |
| `RLS open access` | Mirrors `applications`. Tighten when production-ready. |

### Step 1b — Re-run schema if upgrading from the first version

The reminder feature added two columns. The migration file is idempotent
(`add column if not exists`) — re-running it is safe and adds:

| Column | Purpose |
|---|---|
| `reminder_24h_sent_at` | Stamp set when the cron emails the 24h reminder. |
| `reminder_1h_sent_at` | Stamp set when the cron emails the 1h reminder. |

Both auto-reset to `NULL` whenever an interview is rescheduled, so the
next cron pass picks the row up again.

### Step 2 — Add Brevo API credentials (≈ 5 min)

Interviews use Brevo's transactional email API directly (NOT the SMTP relay
that `/team` uses for invites). You need a separate **API key**:

1. Brevo → **SMTP & API → API Keys → Create a new API key**.
2. Save the key (looks like `xkeysib-…`). It's shown once.
3. Add to `.env.local`:

   ```bash
   BREVO_API_KEY=xkeysib-...
   BREVO_SENDER_EMAIL=hire@yourcompany.com   # must be a verified sender in Brevo
   BREVO_SENDER_NAME=PhotonX Hiring          # optional, defaults to "PhotonX ATS"
   ```

4. Restart `npm run dev`.

If `BREVO_API_KEY` or `BREVO_SENDER_EMAIL` is missing, the interview row
still saves but the UI surfaces an amber banner: *"Saved, but the invite
email failed: BREVO_API_KEY not set in .env.local."* Fix the env var, click
**Reschedule → Save** to retry the email.

### Step 3 — (Optional) Configure automatic reminders

The cron route at `app/api/interviews/cron/reminders` sends 24h-before
and 1h-before reminder emails to candidates. Setup:

1. **Generate a cron secret.** Anything random, ≥ 32 chars. Add to
   `.env.local` and to your Vercel project env:
   ```
   CRON_SECRET=replace-me-with-random-32-char-string
   ```
2. **Deploy to Vercel.** [`vercel.json`](../vercel.json) declares the
   schedule (`*/10 * * * *` — every 10 minutes). Vercel Cron picks it up
   automatically on the next deploy. Vercel signs each request with
   `Authorization: Bearer ${CRON_SECRET}`.
3. **Local testing.** In dev (`NODE_ENV !== 'production'`), the auth
   check is skipped. Hit `http://localhost:3000/api/interviews/cron/reminders`
   directly to fire pending reminders manually.
4. **Without cron** the feature degrades gracefully: scheduled emails go
   out at create-time, and the recruiter can still resend manually from
   the row's ⋯ menu.

Reminder windows are deliberately wider than the cron interval (50–70 min
for the 1h reminder, 23–25 hours for the 24h) so a single missed cron
tick doesn't cause a missed email.

### Step 4 — Verify

1. `/dashboard/interviews` — should render the empty state.
2. Open any candidate → click **Schedule interview** → save.
3. Check the candidate's inbox — "You're shortlisted — interview scheduled"
   email + Join button + .ics attachment.
4. Click **Join the meeting** in the email — Jitsi room should load.
5. (If cron configured) wait ≤ 10 min before/after the 1h-before mark to
   see the reminder email arrive.
6. Schedule one for ~10 minutes from now — within 15 min of start, an
   amber banner appears at the top of the dashboard with a "Join now"
   button, and the sidebar shows a numeric badge on **Interviews**.

---

## 3. Day-to-day flow

### Schedule
- Recruiter opens a candidate (any list/kanban view).
- Click **Schedule interview** in the dialog header.
- Pick date / time / duration (15, 30, 45, 60, 90 min).
- Pick provider:
  - **Jitsi Meet** — auto-generated link (default, no setup).
  - **Custom link** — paste a Zoom/Teams/Meet URL.
  - **No video** — in-person or phone screen.
- Optionally add internal interviewers from `team_members`.
- Optionally add notes (visible to candidate in the email).
- Save → email goes out, row appears in the candidate dialog and on
  `/dashboard/interviews`.

### Reschedule
From the **Interviews** page → row's **⋯ menu → Reschedule**. Updates the
row, sends a "rescheduled" email with a fresh `.ics` (replaces the old one
in calendar clients via matching `UID`).

### Cancel
Same menu → **Cancel interview**. Sets `status='cancelled'`, sends a
cancellation email with `STATUS:CANCELLED` in the .ics so the calendar
event is removed automatically.

### Resend invite
Row ⋯ menu → **Resend invite email**. Re-fires the "you've been
shortlisted" email with the current details. Useful when:
- The candidate didn't receive (or deleted) the first email.
- Brevo wasn't configured at create-time and the row exists silently.
- Notes / meeting link were edited and you want the candidate to re-sync.

### Mark complete / no-show
Quick status updates after the interview happens. Doesn't email anyone.

### Automatic reminders

Once cron is configured (Step 3 above), the candidate gets:

| When | Subject |
|---|---|
| 24h before | *"Reminder: your interview is tomorrow"* |
| 1h before  | *"Starting in 1 hour — your interview"* (button reads **Join now**) |

Each reminder fires at most once per interview. If the recruiter
reschedules, both timestamps reset and the reminders fire again for the
new slot.

### In-dashboard alerts

- **Sidebar badge** — amber number on **Interviews** = how many are
  starting within the next hour.
- **Top banner** — appears 15 min before start, says *"Starts in 12
  mins — Interview with Jane Doe"* and offers a **Join now** button.
  Stays visible while the interview is in progress, dismissible per row.

---

## 4. Roles & permissions

| Action | Super Admin | Admin | Recruiter |
|---|---|---|---|
| View Interviews page | ✅ | ✅ | ✅ |
| Schedule interview (`interviews.schedule`) | ✅ | ✅ | ❌ |
| Reschedule / cancel / mark status (`interviews.manage`) | ✅ | ✅ | ❌ |

Recruiters see the page (read-only) but the **⋯** action menu is hidden and
the **Schedule interview** button is gated. Server APIs don't enforce these
yet — RBAC is client-side. Tighten with RLS when you go production.

---

## 5. Edge cases (and how the code handles them)

| Scenario | Handling |
|---|---|
| Recruiter picks a slot in the past | `validateSchedule()` rejects with a friendly message. |
| Two interviews overlap on the same candidate | `findConflicts()` runs on POST/PATCH and returns 409 with the conflicting rows. The dialog shows "Schedule anyway" to override (sets `force_conflict: true`). |
| Cancelled interviews don't block | Conflict check skips rows with `status='cancelled'`. |
| Brevo not configured | Row saves; UI shows amber warning. No retry queue — just edit & save. |
| Brevo rejects the sender email | Returns the API error verbatim in the warning. Most common cause: sender not verified in Brevo. |
| Candidate's email bounces | We don't currently parse Brevo bounces. Recruiter sees the row as "scheduled" until they manually mark it. |
| Recruiter changes provider after creation | Switching to `jitsi` from another provider regenerates the link. Switching to `none` clears it. |
| Time zone | Dialog reads `Intl.DateTimeFormat().resolvedOptions().timeZone` from the recruiter's browser. Stored as `timestamptz` (UTC). Displayed in viewer's local zone. |
| Candidate's email client doesn't render HTML | Plain-text fallback included in every email. |
| .ics arrives but candidate's calendar shows a different time | Their calendar is in their local zone — that's correct. The .ics has a UTC `DTSTART` so every client renders it locally. |
| Reschedule before the candidate accepts | New `.ics` replaces the old one because we re-use the `UID`. Calendar clients merge by UID. |
| Candidate reuses an old Jitsi link from a cancelled interview | Each interview has a unique slug (`+ randomToken(4)`), so old links keep working as separate rooms. |
| Interview rows when an application is deleted | `ON DELETE CASCADE` on `application_id` — interviews go with the candidate. |
| Recruiter who scheduled it gets archived | `scheduled_by` is `ON DELETE SET NULL`. Row is preserved; "scheduled by" just shows blank in audit. |
| Page list very long (thousands) | Currently loads all rows. Add pagination once we exceed ~500. |
| Two recruiters double-book by racing | Last write wins. Conflict check is per-candidate, not per-recruiter (we don't track recruiter availability yet). Acceptable for MVP. |
| Cron retries / fires twice | Each row's `reminder_*_sent_at` column is the idempotency token — second invocation finds 0 due rows. |
| Cron fires while Brevo is down | We stamp `*_sent_at` even on failure to avoid daily spam loops. Recruiter sees no email; the manual "Resend invite" button is the recovery path. |
| Recruiter reschedules between 24h reminder and 1h reminder | `reminder_*_sent_at` columns are wiped on PATCH if `scheduled_at` changes — both reminders fire again for the new slot. |
| Cron runs but `BREVO_API_KEY` missing | Each due row gets stamped with the failure; no retry storm. Banner / sidebar badge keep working (they don't depend on email). |
| Banner shows during a meeting that's already happening | Intentional: until interview ends (start + duration), the row is "in progress" and the banner stays as a "Join now" affordance. Dismiss button hides per row. |
| Sidebar badge stale | Provider re-fetches every 60 seconds. After a manual schedule, the dialog's `onSaved` callback refreshes the parent list; the provider catches up on the next poll. |

---

## 6. Troubleshooting

**"Saved, but the invite email failed: …"**
The interview is in the DB; only the email failed. Common causes:
- `BREVO_API_KEY` missing → set it & restart.
- `BREVO_SENDER_EMAIL` not verified in Brevo → verify in Brevo → Senders.
- API key revoked → regenerate, replace, restart.
- Quota exceeded → Brevo free tier is 300 emails/day.

**"This candidate already has an interview at that time."**
Conflict check fired. The conflicting rows are returned in the response;
the dialog renders a "Schedule anyway" link to override.

**Jitsi link 404s**
Jitsi is hosted by jitsi.org — outages happen rarely. As a workaround,
edit the row → switch provider to **Custom link** → paste a Zoom/Teams
URL → save. The candidate gets a "rescheduled" email with the new link.

**Calendar invite shows up as plain attachment, not as an event**
Some webmail clients (Gmail web) auto-detect .ics; some require manual
"Add to calendar." Outlook desktop always works. We can't fix this from
our side.

**Recruiter sees no Schedule button**
They are signed in as Recruiter role, which is read-only. Promote to
Admin if they should schedule.

---

## 7. What's deferred (deliberately)

These were considered and skipped to keep the MVP shippable:

- **Google Calendar / Meet OAuth integration** — full plan in
  [`interview-scheduling-plan.md`](./interview-scheduling-plan.md). Adds
  ~5 days of work plus an ongoing OAuth verification chore. Worth it if
  you're going production; overkill for a hackathon demo.
- **FreeBusy availability** — needs a real calendar integration to read
  the recruiter's busy slots. Falls out of the Google Calendar work above.
- **Self-service candidate slot picking** — public booking page where
  candidate picks from N slots. Adds slot-locking, race conditions, public
  page styling. Layer on after the OAuth integration if needed.
- **Push reminders 1h before** — would need a cron worker or scheduled
  function. Trivial to add later (`reminder_sent_at` column already
  exists on the table).
- **Round-robin / load-balanced interviewer assignment** — this is
  Cal.com territory.
- **Microsoft Outlook calendar support** — same shape as Google but using
  Microsoft Graph. Easy to slot in next to the Google flow.
- **Bounce / decline parsing** — we send the email but don't track
  delivery state. Brevo webhooks can fix this in a day if needed.
- **Server-side RBAC enforcement** — currently client-side via `can()`.
  When you tighten Supabase RLS, layer in matching server checks on the
  API routes.

---

## 8. Files of interest

| Path | Purpose |
|---|---|
| `docs/schema-migration-interviews.sql` | DB schema |
| `lib/supabase.ts` | `Interview` types |
| `lib/interviews.ts` | Validation, conflict detection, Jitsi link, .ics builder, formatters |
| `lib/email/interview-invite.ts` | Brevo v3 API sender (server-only) |
| `lib/rbac.ts` | `interviews.schedule`, `interviews.manage` permissions |
| `app/api/interviews/route.ts` | `GET` list, `POST` create |
| `app/api/interviews/[id]/route.ts` | `PATCH` reschedule/status, `DELETE` cancel |
| `app/api/interviews/[id]/send-invite/route.ts` | Manual resend of the candidate email |
| `app/api/interviews/cron/reminders/route.ts` | Cron-driven 24h + 1h reminders |
| `vercel.json` | Cron schedule (`*/10 * * * *`) |
| `components/interviews/schedule-dialog.tsx` | Create + edit modal with calendar/clock icons |
| `components/interviews/upcoming-provider.tsx` | Shared context for sidebar badge + banner |
| `components/interviews/alert-banner.tsx` | Floating "Starts in N mins — Join now" banner |
| `app/dashboard/interviews/page.tsx` | List + month-grid calendar view + stats strip |
| `components/shell/dashboard-shell.tsx` | Wraps the dashboard in `UpcomingInterviewsProvider` and renders the banner |
| `components/shell/sidebar.tsx` | "Interviews" nav link with `CalendarClock` icon + 1h-window badge |
| `app/dashboard/jobs/[id]/page.tsx` | "Schedule interview" button on candidate dialog header + interviews section in the body |
