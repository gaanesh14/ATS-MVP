# Hour 4 — Integration Lunch + Deploy + (Optional) Auth

## Hour 4 — Integration test (60 min, all 3 together)

> ⚠️ **Hard rule:** if by end of Hour 4 the end-to-end flow does NOT work, STOP polish in Hours 5–6 and use that time to fix the broken flow first. A polished broken product < an ugly working one.

This is the most underrated hour. Skip it and you'll spend Hour 8 panicking.

### The end-to-end test

Sit at one laptop with all 3 students. Run the full flow:

1. **Student A** creates a job called "Test Engineer" with 2 screening questions
2. **Student A** copies the public apply link from the job detail page
3. Open the link in an **incognito window** (simulates a real candidate)
4. Fill the form with real data. Upload a real PDF resume.
5. Submit → land on the success page
6. In Supabase Table Editor, verify:
   - 1 new row in `applications`
   - 2 new rows in `application_answers`
7. **Wait 10–20 seconds.** Refresh the row — `parsed_data` should be populated, `ats_score` should be a number
8. Go back to `/dashboard`, click into the job. Candidate should appear with ATS score badge and parsed data.
9. Click **View** — dialog shows resume iframe, parsed fields, screening answers, ATS issues.

### Bugs to expect (and who fixes them)

| Symptom | Likely cause | Owner |
|---|---|---|
| Resume URL is null in DB | Storage upload failed silently | B |
| `parsed_data` stays null forever | Parser endpoint never fired or 404'd | B + C |
| Filters on dashboard show nothing | `parsed_data` shape doesn't match what A expects | A + C |
| Application form crashes | Schema mismatch (column name typo) | B |
| ATS score is always 0 | Text extraction failed (check `pdf-parse` log) | C |
| Cards on `/careers` don't show | `status` filter or empty DB | B |

## Vercel deploy verification

You should already have `https://ats-mvp-xyz.vercel.app` from Hour 0.

After Hour 4 fixes, push to `main` and verify the live URL:
- `/careers` loads
- `/dashboard` loads
- Apply flow works on the live URL (test with a different browser)

If env vars are missing in Vercel, the parser will 500 — go to Vercel Project Settings → Environment Variables and re-paste them.

## Hour 7 — (Optional) Auth on /dashboard

Add Supabase Auth to protect `/dashboard/*` while keeping `/careers/*` public.

### Steps

1. Supabase → **Authentication → Providers** → enable Email
2. Disable "Confirm email" for the demo (saves time)
3. Create a test user manually in Authentication → Users
4. Install: `npm install @supabase/auth-helpers-nextjs` (or use `@supabase/ssr` for newer setups)
5. Create `app/login/page.tsx` — email + password form
6. Create `middleware.ts` at the project root:

```ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // Only protect /dashboard
  if (req.nextUrl.pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

> **Don't try to add auth before the rest works.** The basic flow must succeed first.

## Final checklist

- [ ] Recruiter can create a job with screening questions
- [ ] Public apply link works in an incognito window
- [ ] Resume uploads to Supabase Storage
- [ ] Parser populates `parsed_data` and `ats_score` within 30 seconds
- [ ] Recruiter sees applicant on the dashboard with ATS badge
- [ ] All 7 filters work
- [ ] Applicant detail dialog shows resume iframe + parsed data + answers
- [ ] Source query param tracking works (`?source=linkedin` etc.)
- [ ] Live on Vercel
- [ ] (Optional) Auth gates `/dashboard/*`

## Demo script (for Hussain)

Have this ready to run live:

1. Open `/dashboard` → "Here's the recruiter view, with all jobs."
2. Click "Create New Job" → fill in "Senior React Developer", add 2 questions ("Notice period?", "Comfortable with TypeScript?") → Create
3. Click into the job → copy the public apply link
4. Open the link in incognito → "This is what a candidate sees on LinkedIn"
5. Add `?source=linkedin` to the URL → "We track where they came from"
6. Fill the form, upload a real PDF resume → submit
7. Wait 15 seconds, refresh the recruiter dashboard for that job
8. "The resume was parsed by Claude, here's the structured data, ATS score, and iframe preview"
9. Show the filters: "Experience, salary, notice period, location, skills, ATS-compliant only"
10. Done.
