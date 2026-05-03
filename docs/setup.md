# Hour 0 — Setup (All 3 Together, 30 min)

Do this together on ONE laptop. Other two students wait and watch. If the setup is wrong, all 3 tracks break.

## 0.1 Accounts you need

| Account | Who | Where |
|---|---|---|
| GitHub | one per student | github.com |
| Supabase | ONE shared team account | supabase.com — already created, project ref `ebjkuzmxcadgxpmiguyz` |
| Vercel | ONE shared team account, sign in with GitHub | vercel.com |
| OpenAI API key | one per team | platform.openai.com/api-keys — DO NOT share publicly |

## 0.2 Grab your Supabase keys

Project URL is already set: **`https://ebjkuzmxcadgxpmiguyz.supabase.co`**

You still need to grab:
1. Go to **Project Settings → API**
2. Copy the **anon public** key (long string starting with `eyJ...`)

> **Note:** the direct Postgres connection string (`postgresql://postgres:...@db.ebjkuzmxcadgxpmiguyz.supabase.co:5432/postgres`) is NOT used by this app. The Next.js app talks to Supabase only via the JS client using the URL + anon key. Keep the connection string private — that password gives full DB access.

## 0.3 Project is already scaffolded

The project files are already in this repo. Skip the `npx create-next-app` step.

Install deps:

```powershell
npm install
```

This installs:
- `next`, `react`, `react-dom`, `typescript`
- `tailwindcss`, `postcss`, `autoprefixer`
- `@supabase/supabase-js` — DB client
- `openai` — OpenAI API (used in JSON mode for guaranteed-valid output)
- `pdf-parse` — PDF text extraction
- `lucide-react` — icons
- shadcn/ui dependencies (`@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`)

## 0.4 Create your `.env.local`

In the project root, create a file called **`.env.local`** (note the dot at the start). Paste:

```
NEXT_PUBLIC_SUPABASE_URL=https://ebjkuzmxcadgxpmiguyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key-here
OPENAI_API_KEY=sk-proj-...your-openai-key-here
```

Replace the two placeholders. Save.

> ⚠️ **NEVER commit `.env.local`.** It's already in `.gitignore`. Verify with `git status` before each commit. **Also never put real keys in `.env.local.example` — that file IS committed.** OpenAI keys cost real money if leaked.

## 0.5 Run the database schema

This is the most important step. **If the schema is wrong, all 3 tracks break.**

1. Open Supabase → **SQL Editor → New Query**
2. Open `docs/schema.sql` in this repo
3. Paste the entire contents
4. Click **Run**
5. Open **Table Editor** — you should see 4 tables: `jobs`, `job_questions`, `applications`, `application_answers`

If any table is missing, fix it BEFORE moving on.

## 0.6 Create the resumes Storage bucket

1. Supabase → **Storage → New Bucket**
2. Name: **`resumes`**
3. **Public bucket: ON**
4. Click **Create**
5. Click the bucket → **Policies → New Policy → "For full customization"** → paste:

```sql
create policy "anyone can upload resumes"
on storage.objects for insert
to public
with check (bucket_id = 'resumes');

create policy "anyone can read resumes"
on storage.objects for select
to public
using (bucket_id = 'resumes');
```

Click Save.

## 0.7 Test locally

```powershell
npm run dev
```

Open http://localhost:3000 — you should see the landing page. Then:

- http://localhost:3000/careers — empty list of jobs
- http://localhost:3000/dashboard — empty list of jobs

If both load without errors, you're good.

## 0.8 Push to GitHub

On GitHub, create an **empty** repo called `ats-mvp` (Public is fine).

```powershell
git init
git add .
git commit -m "initial setup"
git remote add origin https://github.com/<your-username>/ats-mvp.git
git branch -M main
git push -u origin main
```

Then add your two teammates as Collaborators (Settings → Collaborators).

## 0.9 Deploy to Vercel — do this NOW, not at the end

1. vercel.com → **Add New → Project** → import the GitHub repo
2. Under **Environment Variables**, paste the same 3 keys from `.env.local`
3. Click **Deploy** (~2 min)
4. You'll get a live URL like `ats-mvp-xyz.vercel.app`

Every push to `main` will auto-redeploy. **Why deploy now?** You'll catch env-var bugs early instead of at Hour 7 panic time.

## 0.10 Other teammates clone

```powershell
git clone https://github.com/<username>/ats-mvp.git
cd ats-mvp
npm install
# copy .env.local from main laptop (USB, secure channel)
npm run dev
```

## 0.11 Branching strategy

Each student works on their own branch:

```powershell
# Student A
git checkout -b student-a-recruiter
# Student B
git checkout -b student-b-candidate
# Student C
git checkout -b student-c-parser
```

Push your branch and open a Pull Request when your section is done.

## 0.12 Setup checklist (all 3 must confirm)

- [ ] 4 tables visible in Supabase Table Editor
- [ ] `resumes` bucket exists, is public, has read/upload policies
- [ ] `npm run dev` works on all 3 laptops
- [ ] Vercel deployment is live and shows the landing page
- [ ] Each student is on their own git branch
- [ ] Everyone has the `.env.local` file
- [ ] Anon key and Anthropic key both work (test by visiting `/careers` — no console errors)
