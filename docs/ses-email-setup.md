# Sending invite emails with AWS SES

> Status: **planned, not yet wired**. Today, hitting "Invite team member" only
> writes a `team_members` row with `status='pending'` — no email is sent. This
> document covers how to add real email delivery using AWS SES.

## TL;DR

Three integration paths, in increasing order of effort:

| | Effort | What you get | Recommended |
|---|---|---|---|
| **A. SES as Supabase SMTP** | ~30 min, no app code | All Supabase Auth emails (invite, signup, reset) sent via SES | ✅ for MVP |
| **B. Direct SES from `/api/team`** | ~2 hr, custom code | Custom-branded invite email; same verified identity for any future transactional mail | If you want full control |
| **C. Resend / Postmark / SendGrid** | Same as B | Better DX (REST APIs, simpler templates) but a separate vendor | If SES feels heavy |

**My recommendation:** start with **A**. It gets the invite + password-reset
emails working end-to-end with zero application code changes — just AWS + Supabase
configuration. Move to **B** later if you want a custom HTML template that says
"Aarav invited you to join PhotonX" rather than the generic Supabase template.

---

## 0. Prerequisites

1. **An AWS account** — free tier covers SES easily for our volume
2. **A domain you own** — e.g. `photonxtech.com`. SES needs to verify it before
   you can send mail "from" addresses on it.
3. **DNS access for that domain** — to add the DKIM and SPF records SES asks
   for.

If you don't have a domain yet, Cloudflare Registrar or Namecheap will set one
up in ~15 minutes for around $10/year.

## 1. AWS-side setup (one-time)

### 1.1 Verify your domain in SES

1. Sign in to the AWS console → switch region to **`ap-south-1`** (Mumbai),
   `us-east-1`, or whatever's nearest. Stay consistent — SES is regional.
2. **Amazon SES → Verified identities → Create identity**
3. Choose **Domain**, enter `photonxtech.com`, leave "Use a custom MAIL FROM
   domain" unchecked for now.
4. Enable **DKIM signing** with the default Easy DKIM option.
5. AWS gives you 3 CNAME records. Add them at your DNS provider. Verification
   takes 5–60 minutes.
6. Once status flips to **Verified**, create a sender identity for the address
   you want emails to come from, e.g. `invites@photonxtech.com`. (Domain
   verification covers all addresses on it, but having an explicit identity
   makes the dashboard clearer.)

### 1.2 Get out of the SES sandbox

By default new SES accounts can only send to **verified addresses** — perfect
for testing, useless in prod. To send to anyone:

1. SES dashboard → **Account dashboard** → **Request production access**
2. Fill the form: use case "Transactional / team invitations", expected volume
   "<100/day", website URL, brief description. AWS usually approves within a
   business day.

Until then, you can manually verify a few teammate emails (Verified identities
→ Create identity → Email) and test against those.

### 1.3 Create SMTP credentials

This is what Supabase will use.

1. SES → **SMTP settings** → **Create SMTP credentials**
2. AWS creates an IAM user with `ses:SendRawEmail` permission and gives you a
   **username** and **password** (one-time download — save them).
3. Note the SMTP endpoint shown — e.g. `email-smtp.ap-south-1.amazonaws.com`,
   port `587`, STARTTLS.

> **These are SMTP credentials, not the same as your IAM access keys.**
> They're scoped to SES sending only.

---

## 2. Option A — Wire SES into Supabase Auth (recommended)

Supabase Auth ships with a default SMTP relay that's heavily rate-limited (4
emails/hour per project). Pointing it at SES removes the limit and means any
email Supabase sends — invite, signup confirmation, magic link, password
reset — goes through SES.

### 2.1 Configure custom SMTP in Supabase

1. Supabase dashboard → **Project Settings → Authentication → SMTP Settings**
2. Toggle **Enable Custom SMTP**
3. Fill in:

   | Field | Value |
   |---|---|
   | Sender email | `invites@photonxtech.com` |
   | Sender name | `PhotonX ATS` |
   | Host | `email-smtp.ap-south-1.amazonaws.com` *(your SES region)* |
   | Port | `587` |
   | Username | *the SMTP credential username from §1.3* |
   | Password | *the SMTP credential password* |
   | Min interval | `60` *(seconds; safety throttle)* |

4. Click **Save**, then **Send test email** to your own address to confirm.

### 2.2 Customize the templates (optional)

**Authentication → Email Templates** — edit the **Invite user** template.
Defaults are fine but you can change subject + body.

Available variables: `{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .SiteURL }}`, `{{ .Token }}`.

A reasonable invite template:

```html
<h2>You've been invited to PhotonX ATS</h2>
<p>Click the link below to set your password and join the team:</p>
<p><a href="{{ .ConfirmationURL }}">Accept invite</a></p>
<p>If you weren't expecting this, ignore this email.</p>
```

### 2.3 App code change

Replace the body of the `POST /api/team` handler so it both inserts the row
**and** kicks off the invite email. This needs the **service-role key** (not
the anon key) because `auth.admin.*` is admin-only.

Add to `.env.local` (server-only, do not prefix with `NEXT_PUBLIC_`):

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key...
```

Create `lib/supabase-admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

// Server-only. NEVER import this from a client component.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
```

Update `app/api/team/route.ts` POST handler:

```ts
// AFTER successfully inserting the team_members row:
import { supabaseAdmin } from '@/lib/supabase-admin';

const redirectTo = new URL('/login', req.url).toString();
const { error: inviteErr } =
  await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo,
  });

if (inviteErr) {
  // Don't roll back the team_members row — the invite can be resent later.
  console.warn('[team] invite email failed:', inviteErr.message);
}
```

Now clicking **Send invite** in the UI:

1. Inserts `team_members` row (`status='pending'`)
2. Supabase Auth creates a placeholder `auth.users` row (no password yet)
3. SES delivers an email with a one-time link
4. The recipient clicks it → lands on Supabase's password-set screen → after
   submitting, they hit `/login` already authenticated
5. The `on_auth_user_created` trigger we already added auto-links the
   `team_members.auth_user_id` and flips status to `active`

That's the entire end-to-end. No template logic in the app, no AWS SDK
dependency — Supabase talks SMTP to SES on every send.

---

## 3. Option B — Call SES directly from `/api/team`

Use this if you want a fully custom HTML email that doesn't go through
Supabase's templating, or you want to send other transactional emails (e.g.
"someone applied to your job") that aren't auth events.

### 3.1 Install the AWS SDK

```bash
npm install @aws-sdk/client-sesv2
```

`@aws-sdk/client-sesv2` is the modular v3 client — small, tree-shakable,
≈15 KB after compression.

### 3.2 IAM credentials

Don't reuse the SMTP credentials. Make a fresh IAM user for the API:

1. IAM → Users → Create user → name `photonx-ses-sender`
2. Attach an inline policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["ses:SendEmail"],
         "Resource": "*"
       }
     ]
   }
   ```
3. Create access keys → save the access key ID and secret.

### 3.3 Env vars

Add to `.env.local`:

```
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
SES_FROM_ADDRESS="PhotonX ATS <invites@photonxtech.com>"
```

### 3.4 Helper

Create `lib/ses.ts`:

```ts
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({ region: process.env.AWS_REGION });

export async function sendInviteEmail({
  to,
  inviterName,
  joinUrl,
}: {
  to: string;
  inviterName: string;
  joinUrl: string;
}): Promise<void> {
  const subject = `${inviterName} invited you to PhotonX ATS`;
  const html = `
    <p>Hi,</p>
    <p>${inviterName} added you to their team on PhotonX ATS.</p>
    <p><a href="${joinUrl}" style="display:inline-block;background:#0F7B6C;
       color:white;padding:10px 20px;border-radius:8px;text-decoration:none;
       font-weight:600">Accept invite</a></p>
    <p>If you weren't expecting this, you can ignore the email.</p>
  `;

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: process.env.SES_FROM_ADDRESS!,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: {
              Data: `${inviterName} invited you to PhotonX ATS. Accept: ${joinUrl}`,
              Charset: 'UTF-8',
            },
          },
        },
      },
    })
  );
}
```

### 3.5 Call from the API route

In `POST /api/team`, after inserting the row:

```ts
const joinUrl = new URL(
  `/signup?email=${encodeURIComponent(email)}`,
  req.url
).toString();

try {
  await sendInviteEmail({
    to: email,
    inviterName: 'A teammate',  // pull from current user once auth is wired
    joinUrl,
  });
} catch (err) {
  console.warn('[team] SES send failed:', err);
}
```

The recipient signs up at `/signup`, our existing trigger links the
`auth_user_id` and flips `team_members.status` to `active`.

Caveat: this path doesn't include a single-use token, so if your invite link
leaks anyone could sign up at that email. For real security use Option A
(Supabase generates and tracks the token) or hand-roll a token table.

---

## 4. Cost & limits

| Metric | SES limit | What it costs |
|---|---|---|
| Free tier | 62,000 outbound/month *if sent from EC2*; otherwise none | $0 |
| Outside free tier | First 1,000 emails / month | $0.10 |
| Beyond | per email | $0.0001 |
| Sandbox max | 200 emails/day, 1 email/sec | n/a |
| Production max | starts at 50,000/day, ramps as your reputation grows | n/a |

For PhotonX-scale volume (let's say 50 invites + 200 application
notifications / month), this is **effectively free**.

## 5. Caveats and operational gotchas

- **Bounces & complaints:** SES will pause your account if your bounce rate
  goes above 5% or complaint rate above 0.1%. Always validate email syntax
  before sending (we already do `^[\w.-]+@[\w.-]+\.\w+$`). For higher
  reliability, subscribe an SNS topic to bounce/complaint events and mark the
  affected addresses as invalid in `team_members`.
- **`MAIL FROM` domain:** SES recommends configuring a custom MAIL FROM
  subdomain (e.g. `mail.photonxtech.com`) to improve deliverability. Optional
  for v1.
- **DMARC alignment:** add a DMARC TXT record (`v=DMARC1; p=none;
  rua=mailto:postmaster@photonxtech.com`) once SPF + DKIM verify, otherwise
  Gmail flags messages as suspicious.
- **Localhost development:** Supabase's SMTP setting applies to the linked
  Supabase project. If you run two projects (dev + prod), configure SMTP on
  each separately or only on prod.
- **Service-role key handling (Option A):** never expose
  `SUPABASE_SERVICE_ROLE_KEY` in client code or commit it. It's effectively
  the master credential for your database.

## 6. Rollout checklist

If you want me to actually implement this, the work is:

- [ ] You: complete §1 (verify domain, request production access, generate
      SMTP credentials)
- [ ] You: §2.1 (paste the credentials into Supabase SMTP settings)
- [ ] Me: change `POST /api/team` to call `supabaseAdmin.auth.admin
      .inviteUserByEmail` (Option A — ~10 lines)
- [ ] You: add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
- [ ] You: send a real invite from the Team page; verify the email lands

Tell me when you're at the last step and I'll wire up the code.

---

## Appendix — alternatives at a glance

| Provider | Free tier | Best for |
|---|---|---|
| **AWS SES** | 62k/month from EC2 | Existing AWS users; cheapest at scale |
| **Resend** | 3k/month, 100/day | Best DX; React Email templates |
| **Postmark** | 100/month | Highest deliverability; transactional only |
| **SendGrid** | 100/day forever | Established choice; UI is dated |
| **Supabase built-in** | 4 emails/hour | Demos only |

For PhotonX, SES is the right answer if you're already comfortable with AWS;
Resend is the right answer if you want to minimize friction and don't mind
paying $20/mo above the free tier.
