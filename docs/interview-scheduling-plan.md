# Interview scheduling — research & plan

> Status: **planning only, no code yet**. This document compares ways to add
> "Schedule interview" with Google Meet to PhotonX, recommends one, and lays
> out the work in phases. Approve a path before I start implementing.

## 1. Goal

Recruiter clicks **Schedule interview** on a candidate → picks a slot →
candidate (and any internal interviewers) get a calendar invite with a Google
Meet link. Reschedule/cancel from the dashboard. Optional: pre-filter slots
by checking interviewer availability so we don't suggest times they're busy.

## 2. The three viable approaches

| | A. Direct Google API | B. Cal.com integration | C. ICS-only (no calendar API) |
|---|---|---|---|
| Effort | 5–7 days | 2–3 days | 1 day |
| Reads recruiter's real availability? | ✅ via FreeBusy API | ✅ Cal.com handles it | ❌ |
| Auto-creates Google Meet link | ✅ | ✅ | ❌ (use Jitsi/static room) |
| Per-recruiter OAuth setup | Required (one click) | Required (one click) | None |
| Reschedule / cancel UX | Built (we wire it) | Built-in | DIY |
| External vendor | Google only | Cal.com (add'l service) | None |
| Cost | Free | $12+/user paid OR self-hosted | Free |
| Lock-in | Google ecosystem | Cal.com API | None |
| Looks "real" at demo | Highest | High | Medium |

## 3. Recommendation

**Path A — direct Google Calendar + Meet API.** Reasons:

- The headline value is *"the candidate gets a real Meet link in their inbox"* — that's why this feature exists. Path C breaks that.
- Cal.com is a fine product but adds a third-party dependency for a feature we're already building anyway. Justifying it requires features we don't need yet (round-robin, payment, public booking pages).
- Google Cloud setup is a one-time chore (~30 min). After that, every recruiter just clicks "Connect Google Calendar" once.

**When I'd reverse this:**

- If the team uses Outlook/Microsoft 365, swap to Microsoft Graph (similar shape, same architecture).
- If the company already pays for Cal.com, use Cal.com (don't double-build).
- If you need to ship in <1 day for the hackathon, drop to **Path C** — generate `.ics` files server-side and send them via Brevo. No Meet link, but it gets a calendar event into the candidate's inbox.

The rest of this doc assumes Path A.

## 4. Architecture

```
┌─ Recruiter dashboard ──────────────────────────────────────┐
│ 1. Settings → "Connect Google Calendar"                     │
│ 2. Candidate dialog → "Schedule interview"                  │
│   ├─ pick date, duration, additional interviewers           │
│   ├─ FreeBusy lookup hides busy slots                       │
│   └─ confirm                                                │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           │  POST /api/interviews
                           ▼
┌─ Next.js API ────────────────────────────────────────────────┐
│  uses recruiter's stored refresh_token                       │
│  → calendar.events.insert with conferenceData ───┐           │
│                                                  ▼           │
│              Google Calendar API creates event + Meet link   │
│  ← google_event_id, hangout_link                              │
│  insert into `interviews` row                                │
│  send confirmation via Brevo SMTP (already wired)            │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           ▼
                 candidate inbox: invite + Meet link
```

OAuth tokens are stored encrypted in `team_members.google_refresh_token`.
Access tokens (1-hour TTL) are exchanged on the fly each time we call the
API; we don't persist them.

## 5. Schema migration

One new table, plus three nullable columns on `team_members`. No data loss.

```sql
-- docs/schema-migration-interviews.sql

alter table team_members
  add column if not exists google_email             text,
  add column if not exists google_refresh_token     text,
  add column if not exists google_connected_at      timestamptz;

create table if not exists interviews (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null references applications(id) on delete cascade,
  scheduled_by        uuid not null references team_members(id),
  scheduled_at        timestamptz not null,
  duration_minutes    int not null default 30,
  status              text not null default 'scheduled'
                          check (status in ('scheduled','completed','cancelled','no_show')),
  google_event_id     text,
  google_meet_link    text,
  participants        jsonb not null default '[]'::jsonb,  -- [{email, name, role}]
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists interviews_application_idx on interviews(application_id);
create index if not exists interviews_scheduled_at_idx on interviews(scheduled_at);

alter table interviews enable row level security;
create policy "open access interviews" on interviews
  for all using (true) with check (true);
```

`google_refresh_token` is sensitive — see §10 for encryption-at-rest options.

## 6. Phased implementation

Each phase ships something useful on its own; you can stop at any of them.

### Phase 0 — Google Cloud setup (you, 30 min, one-time)

1. Console → create project `photonx-ats`
2. **APIs & Services → Library** → enable:
   - Google Calendar API
   - Google Meet API *(optional: only needed for advanced Meet management)*
3. **OAuth consent screen** → User Type: External → fill in app name, support email, scopes:
   - `https://www.googleapis.com/auth/calendar.events` (create/edit events)
   - `https://www.googleapis.com/auth/calendar.freebusy` (read availability)
4. Add yourself + any teammates as **test users**
5. **Credentials → Create OAuth 2.0 Client ID** → Web application
   - Authorized redirect URI: `http://localhost:3000/api/google/callback` (+ prod equivalent later)
6. Copy **Client ID** and **Client Secret** → add to `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

### Phase 1 — Connect Google account flow (~1 day)

- New page section: **Settings → Integrations → Google Calendar**
  - Shows "Not connected" or "Connected as `<google_email>`" with disconnect button
- New routes:
  - `GET  /api/google/connect` — generates OAuth URL with state CSRF token, redirects
  - `GET  /api/google/callback` — exchanges code → tokens, stores refresh_token in `team_members`
  - `POST /api/google/disconnect` — revokes via Google + clears DB row
- Library: `googleapis` (official)

### Phase 2 — Schedule interview UI (~2 days)

- New button on Candidate dialog (job detail page) — visible when `can(role, 'applications.update')`
- New `<ScheduleInterviewDialog>` component:
  - Date picker (default: tomorrow 10:00 local time)
  - Duration: 30 / 45 / 60 minutes
  - Additional interviewers — typeahead from `team_members` (active only)
  - Notes (optional)
  - Live FreeBusy preview — strikes through busy slots once recruiter picks a date
- New API: `POST /api/interviews` → creates event via Calendar API + inserts row

### Phase 3 — Manage interviews (~1.5 days)

- New "Interviews" section on the candidate dialog showing scheduled events
- Each entry: scheduled time, duration, attendees, Meet link, status badge
- Actions: **Reschedule** (modal pre-filled with current values), **Cancel** (confirmation + Google delete + status='cancelled'), **Mark complete**, **No-show**
- New routes: `PATCH /api/interviews/[id]`, `DELETE /api/interviews/[id]`

### Phase 4 — Notifications (~0.5 day)

- Brevo SMTP (already wired) sends a custom HTML email to the candidate when interview is created/rescheduled/cancelled
- Email contains: who, when, duration, Meet link, ICS attachment for non-Google calendar users

### Total: ~5 working days

Can be split across two people.

## 7. Edge cases

| Scenario | Handling |
|---|---|
| Recruiter never connected Google | Schedule dialog shows "Connect your calendar first" + button |
| Refresh token revoked (user changed Google password / logged out) | API returns `invalid_grant` → mark token as invalid, prompt reconnect, leave existing interview rows untouched |
| Access token expired (1h TTL) | Library auto-refreshes via refresh token — transparent to us |
| Candidate's email is non-Google (Outlook/Yahoo) | Google Calendar still emails an invite + ICS; Meet works in any modern browser |
| Meet link missing in API response | Possible if Workspace policy disallows Meet creation — surface "Couldn't create Meet link" with retry, fallback to event without conference |
| Recruiter scheduling outside their working hours | We don't enforce; FreeBusy shows the conflict if there is one |
| Interview deleted directly in Google Calendar | Our row goes stale. Two options: (a) periodic `events.list` sync nightly, (b) rely on Google webhooks (push notifications). Defer until needed. |
| Time zones | Store all `timestamptz` in UTC. Display in viewer's `Intl.DateTimeFormat()` local zone. Calendar API expects RFC3339 with TZ — pass user's TZ from settings |
| Candidate already has a conflict | We can't see candidate's calendar (no OAuth). We'd need them to RSVP — Calendar handles this; mark `interview.status` `cancelled` if candidate declines (parse the response webhook later) |
| Reschedule | `events.patch` with new start/end — Google sends update emails automatically |
| Cancel | `events.delete` — Google sends cancellation emails. Then update local row to `status='cancelled'` |
| API rate limit hit (1M queries/day per project) | Far beyond hackathon scale; add exponential backoff for safety |
| Workspace blocks external attendees | Org-level setting; we can't override. If create returns 403, surface "Your Google Workspace blocks inviting external attendees — ask your admin" |
| Recruiter is archived but had open interviews | Future hire takes over by reconnecting same email + manually updating `scheduled_by`. Acceptable for MVP. |
| OAuth verification (when going public) | Until verified, the consent screen says "unverified app" and limits to 100 users. Verification takes ~4-6 weeks for sensitive scopes. Fine for internal use. |

## 8. Costs & quotas

| Resource | Free quota | Practical limit |
|---|---|---|
| Calendar API | 1,000,000 queries/day | ~10,000 interviews/day before throttling |
| Meet | Free with personal Google or Workspace | n/a |
| OAuth | Free | 100 users until verification (each Google project) |
| Storage in our DB | <1 KB per interview | n/a |

For PhotonX (let's say 50 interviews/week): **$0/month**.

## 9. Security & privacy

- **Refresh token storage** — encrypt at rest. Options:
  - Quick: store as plain text in Postgres (acceptable for hackathon if `team_members` has tight RLS)
  - Better: AES-256 encrypt server-side using a key in Vercel env. Decrypt on use.
  - Best: Supabase Vault (`pgsodium`) — column-level encryption built into Supabase.
- **Scope minimization** — request only `calendar.events` and `calendar.freebusy`, NOT `calendar.readonly` (which exposes everything). Google scrutinizes broad scopes during verification.
- **Disconnection actually revokes** — `POST /api/google/disconnect` should call `https://oauth2.googleapis.com/revoke` AND clear the DB row.
- **CSRF on OAuth redirect** — generate random state, store in cookie, verify in callback.

## 10. Production hardening

When this leaves "internal use only":

- [ ] Apply for OAuth verification (mandatory once you exceed 100 users)
- [ ] Encrypt `google_refresh_token` with `pgsodium` or similar
- [ ] Move from polling to push notifications for event sync (Google Calendar webhooks)
- [ ] Handle workspace domain restrictions gracefully
- [ ] Add a per-user "interview templates" feature (link to a job's template description in the event description)
- [ ] Audit log for who scheduled/cancelled what
- [ ] Time-zone preference saved to `team_members.timezone` (already a settings field; just persist it)

## 11. Things this doc deliberately does NOT cover

- **Self-service candidate slot picking** ("here are 5 times that work, candidate clicks one"). Doable but adds: a public booking page, slot-locking logic, race conditions. Can layer on after Phase 4.
- **Round-robin assignment** across interviewers. Cal.com territory.
- **Recording / transcripts**. Google Meet has these in Workspace; surfacing them in PhotonX is a separate phase.
- **Microsoft Outlook calendar support**. Architecture extends cleanly (swap `googleapis` for `@microsoft/microsoft-graph-client`), but the auth & event model is similar enough that it's a v2 thing.

## 12. Decision needed from you

Pick one:

1. **"Go path A, ship Phase 0–4"** — full Google Calendar + Meet, 5 days.
2. **"Go path A, just Phase 0–2"** — schedule + Meet link works, no manage UI yet, ~3 days.
3. **"Go path C — ICS-only for now"** — 1 day, no Meet link, no availability check, but candidates get calendar invites today.
4. **"Defer entirely"** — keep using whatever you use now; revisit after the hackathon.

Once you pick, I'll:

1. Write the schema migration file
2. Walk you through the Google Cloud setup with screenshots
3. Build the chosen phases
4. Write the user-facing onboarding (Settings → Integrations card)

For a hackathon-friendly demo, **option 3 (ICS-only) is the realistic one** — gets a candidate-facing calendar invite working in a day. Option 1 is the right answer for a real product.
