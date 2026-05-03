# Student B — Candidate Side

**Time budget:** Hours 1–3 build + Hour 5 polish
**Goal:** A candidate visits the public careers page, picks a job, fills the apply form, uploads a resume, and lands a row in the database that triggers Student C's parser.

## Pages you own

| Path | Purpose |
|---|---|
| `/careers` | Public list of all open jobs |
| `/careers/apply?jobId=xxx` | Public job detail + apply form |
| `/careers/success?jobId=xxx` | Thank-you page |

> ⚠️ These pages **must be public** (no login). Do NOT put them under `/dashboard`. Auth in Hour 7 will only protect `/dashboard/*`, leaving `/careers/*` open.

## Hour 1 — Public careers list

**File:** `app/careers/page.tsx`

Already scaffolded. The page should:
1. Header: "Careers at PhotonX Technologies" + subtitle "Open positions"
2. Fetch all `jobs` WHERE `status = 'open'`, sorted by `created_at desc`
3. Render each job as a card showing: title, location, exp range (e.g. "2-5 yrs"), short description snippet (first 200 chars + "...")
4. Whole card links to `/careers/[id]`
5. Empty state: "No open positions right now."
6. Centered (`max-w-3xl`), generous padding, subtle hover effect on cards

## Hour 2 — Job detail + apply form

**File:** `app/careers/apply/page.tsx` (uses `useSearchParams()` to read `jobId` from the URL query string)

Build in two halves.

### First half — fetch and show the job

1. Get `jobId` from route params. In Next.js 14, params is sync: `{ params }: { params: { jobId: string } }` then `const { jobId } = params;`
2. Fetch the job and its `job_questions` (sorted by `display_order`)
3. Show: title, location, exp range, salary range, full description
4. Below the description, render the apply form
5. Read query param `source` — e.g. `?source=linkedin` — store it to send when applying
6. If `status != 'open'`, show "This position is no longer accepting applications."

### Second half — the apply form

Form fields:
- Full Name (required)
- Email (required, validated)
- Phone (required, 10+ digits)
- Resume (PDF only, max 5MB) — file input
- One field per `job_question` (text input, number input, or yes/no radio based on `question_type`)

On submit:
1. **Validate** all required fields. Show errors inline.
2. **Upload resume** to Supabase Storage:
   ```ts
   const fileName = `${Date.now()}_${file.name}`;
   const { data, error } = await supabase.storage
     .from('resumes')
     .upload(fileName, file);
   const { data: { publicUrl } } = supabase.storage
     .from('resumes')
     .getPublicUrl(fileName);
   ```
3. **Insert** into `applications`:
   ```ts
   {
     job_id,
     full_name,
     email,
     phone,
     resume_url: publicUrl,
     source: sourceFromQueryParam || 'careers_page',
   }
   ```
   Capture the inserted row's `id`.
4. **Insert each answer** into `application_answers`:
   ```ts
   { application_id, question_id, answer }
   ```
5. **Trigger the parser** (fire-and-forget — DO NOT await):
   ```ts
   fetch(`/api/applications/${applicationId}/parse`, { method: 'POST' });
   ```
6. **Redirect** to `/careers/success?jobId=...`

Show a loading spinner during submit. Disable the submit button while submitting.

## Hour 3 — Success page

**File:** `app/careers/success/page.tsx`

Simple centered page:
- Big green checkmark icon (`lucide-react` `CheckCircle2`)
- "Application received!"
- "We will review your application and get back to you within 5 working days."
- Button: "View other openings" → `/careers`

## Hour 5 — Source tracking & polish

This is your "multi-portal" feature, the honest version.

When sharing the job link on different sites, append a `source` query param:
- LinkedIn → `/careers/apply?jobId=abc123&source=linkedin`
- Naukri → `/careers/apply?jobId=abc123&source=naukri`
- Indeed → `/careers/apply?jobId=abc123&source=indeed`
- WhatsApp → `/careers/apply?jobId=abc123&source=whatsapp`

Your apply form already captures this and saves to `applications.source`. Student A's dashboard shows it.

### Polish tasks
- File-size validation BEFORE upload (error if > 5MB)
- File-type validation (only `application/pdf`)
- Show selected file name after upload
- Success/error toast notifications
- Mobile responsive — test by resizing the browser

## Common bugs

| Symptom | Fix |
|---|---|
| Resume upload fails with RLS error | Storage policy not set up. Re-check `setup.md` 0.6 |
| Public URL is null | Bucket isn't public. Supabase → Storage → bucket settings → toggle Public |
| Form submits twice | Forgot `e.preventDefault()` in the form's `onSubmit` |
| Parser never runs | Check DevTools Network tab — POST to `/api/.../parse` should fire. If 404, Student C hasn't built it yet |

## Done definition

- [ ] `/careers` shows all open jobs as cards
- [ ] `/careers/apply?jobId=xxx` shows job + apply form with dynamic questions
- [ ] Resume uploads successfully to Supabase Storage
- [ ] Application + answers rows appear in DB after submit
- [ ] Source query param is captured in `applications.source`
- [ ] Parser endpoint is triggered (fire-and-forget)
- [ ] Success page renders after submit
