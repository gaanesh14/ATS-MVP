# Brevo email setup

> Status: **wired in code, requires manual config**. The code in
> `app/api/team/route.ts` calls `supabase.auth.admin.inviteUserByEmail` after
> every team invite. Whether the recipient actually receives an email depends
> on three things below being configured. Until then, the team_members row
> still saves and the UI shows an amber warning.

This doc covers:

1. Where the credentials live
2. The five-step bootstrap (Brevo → Supabase → app)
3. What the app does when an invite is sent
4. Edge cases and how the code handles them
5. Troubleshooting

---

## 1. Where credentials live

Three secrets — none of them in the repo:

| Secret | Where it goes | Rotates |
|---|---|---|
| Brevo SMTP login + key | **Supabase dashboard** → Project Settings → Authentication → SMTP Settings | Brevo dashboard → SMTP & API → regenerate |
| Supabase **service-role** key | `.env.local` as `SUPABASE_SERVICE_ROLE_KEY` (server-only) | Supabase dashboard → Project Settings → API → reset |
| Supabase **anon** key | `.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already there) | Supabase dashboard |

The Brevo SMTP key never touches our code — Supabase Auth holds it and uses
it to send the magic-link emails on our behalf.

The service-role key DOES touch our code, but only on the server. It lives in
`lib/supabase-admin.ts` which is gated by an `import 'server-only'` line.
Importing that module from a client component is a build-time error.

---

## 2. Bootstrap

### Step 1 — Brevo (≈ 10 min)

1. Sign up at [brevo.com](https://www.brevo.com/) — free, no card.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**.
   Use a real address you control (your own email is fine for development).
   Click the verification link Brevo emails to that address.
3. **SMTP & API → SMTP** tab → **Generate a new SMTP key**.
   Save the **login** (looks like `aa1271001@smtp-brevo.com`) and the
   **SMTP key** (looks like `xsmtpsib-...`). The key is shown once.

### Step 2 — Supabase Auth SMTP (≈ 5 min)

1. Supabase dashboard → **Project Settings → Authentication → SMTP Settings**.
2. Toggle **Enable Custom SMTP**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Sender email | the verified address from Step 1 |
   | Sender name | `PhotonX ATS` |
   | Host | `smtp-relay.brevo.com` |
   | Port | `587` |
   | Username | the **login** from Step 1.3 |
   | Password | the **SMTP key** from Step 1.3 |
   | Min interval | `60` |

4. Click **Save**, then **Send test email** to your own address. You should
   see it in your inbox within ~10 seconds. If not, jump to
   [Troubleshooting](#5-troubleshooting).

### Step 2b — Allowlist the redirect URL (≈ 1 min)

Supabase rejects redirect URLs that aren't in the allowlist, even if the
host matches `SITE_URL`. Add the accept-invite path explicitly:

1. Supabase dashboard → **Authentication → URL Configuration**.
2. Under **Redirect URLs**, click **Add URL** and add:
   - `http://localhost:3000/accept-invite` — for local dev
   - `https://YOUR-DOMAIN.com/accept-invite` — for production (add later)
3. Save.

Without this, the invite link from Supabase will redirect to a "redirect not
allowed" error page instead of `/accept-invite`.

### Step 3 — Supabase service-role key (≈ 1 min)

1. Supabase dashboard → **Project Settings → API**.
2. Copy the **service_role** key (NOT the anon key).
3. Add it to `.env.local` in the project root:

   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
   ```

4. Restart `next dev` (env vars only load on boot).

### Step 4 — App code (already done)

The repo already contains:

- `lib/supabase-admin.ts` — lazy server-only client + `sendTeamInvite()`
- `app/api/team/route.ts` — POST sends invite after DB insert
- `app/api/team/[id]/route.ts` — PATCH re-sends when status flips to `pending`

No further code changes needed.

### Step 5 — Smoke test

1. Sign in as the seeded super-admin.
2. **Team → Invite team member** → enter your own personal email →
   pick a role → **Send invite**.
3. Watch the inbox — invite arrives within 10 seconds.
4. Click the link → set a password → land in `/dashboard` already authed.
5. Verify in **Team → Pending invites**: the row should now be in **Active**
   with `joined_at` populated. The trigger and `AuthProvider` handle this.

---

## 3. What the app does on invite

### Initial invite (POST /api/team)

```
client     team_members      auth.users     Brevo / SMTP    invitee
  │
  │ POST /api/team
  ├──► insert {role, status: 'pending', invited_at: now()}
  │
  │ sendTeamInvite() →
  │ supabase.auth.admin.inviteUserByEmail(email, {
  │   data: { name },
  │   redirectTo: '<origin>/accept-invite'
  │ })
  │             ┌── creates auth.users row (no password,
  │             │   email_confirmed_at: now())
  │             │
  │             │   trigger on_auth_user_created fires:
  │             │   team_members.auth_user_id ← auth.users.id
  │             │
  │             └── sends magic-link mail via Brevo SMTP ──►
  │                                                          email arrives
  │ ◄── { member, emailSent: true }
  │
  │                                                          clicks link
  │
  │   Supabase verifies token → creates session →
  │   redirects to /accept-invite#access_token=...&type=invite
  │
  │   Our /accept-invite page:
  │     1. supabase.auth.getSession() → finds session
  │     2. shows "Set your password" form
  │     3. supabase.auth.updateUser({ password })
  │     4. router.replace('/dashboard')
  │
  │   AuthProvider on /dashboard:
  │     finds team_members row by auth_user_id
  │     flips status: 'pending' → 'active', stamps joined_at
```

### Resend (PATCH /api/team/[id] with status='pending')

The Manage Member dialog's **Resend invite** button bumps `invited_at` and
sets `status='pending'`. The PATCH route detects `status==='pending'` in the
update payload and re-calls `inviteUserByEmail`, which generates a fresh
magic link and re-sends it. Old links are invalidated.

---

## 4. Edge cases

| Scenario | What happens |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` missing | `getSupabaseAdmin()` throws. POST/PATCH catch it, return `{ emailSent: false, emailWarning: '…service-role key…' }`. Row is still saved. UI shows amber banner pointing at this doc. |
| Brevo SMTP not yet configured in Supabase | Supabase falls back to its built-in relay, which is rate-limited to 4 emails/hour. With light testing this works; at any real volume it returns 429. UI shows the Supabase error verbatim. |
| Email already in `auth.users` (active user) | `inviteUserByEmail` returns `User already registered`. POST has already saved/updated the team_members row, so the user just appears in the Active or Pending tab depending on their state. |
| Email already in `auth.users` (unconfirmed, prior invite) | Supabase resends the magic link to the same address. Old link is invalidated. |
| Trying to re-invite an active member | API returns 409 with `A team member with that email already exists`. UI shows the error. |
| Re-inviting an archived member | `team_members` row is reactivated to `pending` with a new `invited_at`, fresh email is sent. |
| Magic link expires (24h default) | Invitee asks a super-admin to click **Resend invite**. New 24h window. |
| Invitee opens the link twice | First click consumes the token; second click lands on /accept-invite with no session → page shows "Invite link is invalid or expired" + "Go to sign in". They sign in with the password they already set. |
| Invitee's email bounces | Brevo accepts the send, we get success from Supabase, but the email never arrives. Brevo dashboard → Statistics → Bounces shows it. No automatic re-try; super-admin can correct the email by archiving the pending row and inviting the right address. |
| `/accept-invite` not in Supabase Redirect URLs | Supabase blocks the redirect, invitee sees a Supabase-hosted error. Fix: add `http://localhost:3000/accept-invite` (and the prod equivalent) to **Auth → URL Configuration → Redirect URLs**. |
| Invitee sets a weak password | `/accept-invite` rejects passwords under 8 chars before the API call. |
| Last super-admin tries to demote/archive themselves | Both `PATCH` and `DELETE` reject with 400 — the last active super_admin guard from the team-members migration. |
| Service-role key accidentally imported into a client component | `lib/supabase-admin.ts` starts with `import 'server-only'` → build fails with `You're importing a component that needs "server-only"…`. |
| Rate limit hit on Brevo (300/day free tier) | Supabase returns the SMTP 421 error. UI shows it. Either upgrade Brevo or wait for the daily reset. |

---

## 5. Troubleshooting

**The test email from Supabase never arrives**

- Check Brevo dashboard → Statistics → Logs. If the send shows "Delivered"
  there but didn't land in your inbox, it's spam-filtered. Add the sender to
  your allowlist or verify the domain in Brevo for DKIM signing.
- Make sure the Sender email in Supabase exactly matches a *verified* sender
  in Brevo (case-sensitive).

**`emailWarning: 'Server admin client is not configured'`**

- `SUPABASE_SERVICE_ROLE_KEY` is missing from `.env.local` or you didn't
  restart `next dev` after adding it.

**`emailWarning: 'Invalid login: 535 Authentication failed'`**

- Brevo SMTP key / login mismatch. Regenerate in Brevo and re-paste into
  Supabase.

**`emailWarning: 'User already registered'`**

- The email already has an active auth account. They should sign in instead;
  the team_members row already updated to reflect the role change you wanted.

**Invite link clicks land on Supabase's default page, not our app**

- The `redirectTo` parameter we send is `${origin}/dashboard`. In production
  on Vercel, `origin` should resolve to your live URL. If you see the
  Supabase-hosted page hanging, check **Authentication → URL Configuration**
  → "Redirect URLs" — add your production origin to the allow-list.

**Test email works but team invites silently fail**

- `inviteUserByEmail` requires the service-role key, not the anon key. The
  Send test email button uses Supabase's own credentials. Make sure
  `SUPABASE_SERVICE_ROLE_KEY` is set, not `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 6. Production hardening checklist

When you stop hackathon-mode and go live:

- [ ] **Verify your domain in Brevo** (DKIM + SPF records). Sending from a
      verified domain rather than a free-mail address dramatically improves
      inbox placement.
- [ ] **Rotate the SMTP key** — anything that's been pasted in chat,
      committed, or screenshotted is compromised.
- [ ] **Rotate the service-role key** for the same reason.
- [ ] **Add a DMARC record** (`v=DMARC1; p=none; rua=mailto:…`) once SPF +
      DKIM align.
- [ ] **Disable open / click tracking** in Brevo if you care about candidate
      privacy — it's on by default.
- [ ] **Set a sane `Min interval`** in Supabase SMTP (60s is fine for
      hackathon; raise to 300s in production to avoid being flagged).
- [ ] **Enable RLS policies** on `team_members` (templates in
      `docs/schema-migration-team-members.sql`). Today server-side gating
      relies on the service-role key being held only by trusted code paths.
