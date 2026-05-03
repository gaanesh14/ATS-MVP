# Student C — Resume Parser & ATS Scorer

**Time budget:** Hours 1–3 build + Hour 6 testing & tuning
**Goal:** When Student B's apply form drops a resume into Supabase Storage and inserts an `applications` row, your API route fetches the PDF, extracts text, sends it to OpenAI for structured parsing, computes an ATS-compliance score, and updates the row.

## What you own

**File:** `app/api/applications/[id]/parse/route.ts`

Plus helpers inline in that file: PDF download, text extraction, OpenAI call, ATS scoring.

## Hour 1 — Skeleton API route

POST handler that:
1. Reads `{ id }` from params (in Next.js 14 App Router API routes, params is sync — `{ params }: { params: { id: string } }`)
2. Updates `applications.parse_status = 'processing'`
3. Fetches the application row
4. Downloads PDF from `resume_url` via `fetch`
5. Extracts text using `pdf-parse`:
   ```ts
   import pdf from 'pdf-parse/lib/pdf-parse.js';
   const buffer = Buffer.from(await response.arrayBuffer());
   const result = await pdf(buffer);
   const text = result.text;
   ```
6. Returns `NextResponse.json({ ok: true, textLength: text.length })`
7. On error: update `parse_status = 'failed'` and return 500 with error message

Add `console.log` at every step — you'll need it.

> **Why the deep import?** The default `pdf-parse` import has a debug block that runs at module load and tries to read `./test/data/...` files that don't exist in your project. Importing from `pdf-parse/lib/pdf-parse.js` skips that block. A type declaration for this submodule path lives at `types/pdf-parse.d.ts` so TypeScript stops complaining.

### Test the skeleton

After Student B uploads at least one application:
```powershell
curl -X POST http://localhost:3000/api/applications/<uuid>/parse
```

Check terminal logs — text length should be > 0. Check Supabase row — `parse_status` should be `processing` (then `parsed` once Hour 2/3 is done).

## Hour 2 — OpenAI-based field extraction

After extracting text, call OpenAI:

```ts
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

Use **`gpt-4o-mini`** — fast, cheap (~$0.0006 per resume), supports JSON mode. **Do not use `gpt-4o`** unless you need it.

### System prompt
```
You are a resume parser. Extract structured data from the resume text.
Return ONLY valid JSON, no markdown, no explanation, no code fences.
If a field is not found, use null.
```

> **JSON mode requirement:** OpenAI's `response_format: { type: 'json_object' }` requires the system prompt to mention "JSON" — this prompt does, so you're fine.

### User prompt
```
Extract these fields from the resume below. Return JSON exactly in this shape:
{
  "experience_years": number,
  "current_company": string | null,
  "current_role": string | null,
  "location": string | null,
  "skills": [string],
  "notice_period_days": number | null,
  "current_salary": number | null,
  "expected_salary": number | null,
  "email_in_resume": string | null,
  "phone_in_resume": string | null
}

For salary, return number in INR. If candidate writes "15 LPA" that's 1500000.
For experience_years, total years of professional experience as a number (e.g. 3.5).
For notice_period, in days (e.g. "2 months" = 60).

Resume:
[INSERT TEXT HERE]
```

### Call shape

```ts
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  max_tokens: 1024,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ],
});
const raw = completion.choices[0]?.message?.content ?? '';
const parsed = JSON.parse(raw);
```

JSON mode guarantees a valid JSON object — `JSON.parse` should never fail in practice. Wrap it in try/catch anyway as a safety net.

Then UPDATE `applications`:
- `resume_text`: text (truncated to 50000 chars)
- `parsed_data`: parsed JSON
- `parse_status`: `'parsed'` (we'll add `ats_score` next)

Wrap the whole OpenAI call in `try/catch`.

## Hour 3 — ATS-compliance scoring

ATS-compliance = is the resume machine-readable. A scanned PDF, a resume with images instead of text, or weird fonts will score low.

### Rubric (total 100)

| Check | Test | Points | Issue if fails |
|---|---|---|---|
| Text extracted | PDF yields ≥ 100 characters | 30 | "Resume appears to be scanned or image-only" |
| Contact info | Both email and phone in extracted text | 15 | "Missing contact info: email/phone" |
| Standard sections | Contains 'experience', 'education', AND 'skills' (case-insensitive) | 20 | "Missing standard sections: ..." |
| Reasonable length | Word count between 200 and 2000 | 10 | "Resume is too short/long (X words)" |
| **JD keyword match** | For each tech keyword in `TECH_KEYWORDS` that appears in the job description, check whether it also appears in the resume. Score = `matched / total_jd_keywords × 25`. If JD has zero matchable keywords (non-tech role), award full credit. | 25 | "Skill keywords missing from resume (X/Y matched): react, node, sql" |

A resume with perfect format but zero matching skills now scores 75, not 100. To reach 100 the resume must also match every tech keyword present in the job description.

### Implementation

```ts
function computeATS(text: string) {
  let score = 0;
  const issues: string[] = [];
  const lower = text.toLowerCase();

  // 1. Text extracted (40 pts)
  if (text.length >= 100) {
    score += 40;
  } else {
    issues.push('Resume appears to be scanned or image-only — text could not be extracted.');
  }

  // 2. Contact info (20 pts)
  const hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(text);
  const hasPhone = /\d{10}|\+\d{1,3}\s?\d{10}/.test(text.replace(/\s/g, ''));
  if (hasEmail && hasPhone) {
    score += 20;
  } else {
    const missing = [];
    if (!hasEmail) missing.push('email');
    if (!hasPhone) missing.push('phone');
    issues.push(`Missing contact info: ${missing.join(', ')}`);
  }

  // 3. Standard sections (30 pts)
  const hasExp = /experience|employment|work history/.test(lower);
  const hasEdu = /education|academic/.test(lower);
  const hasSkills = /skills|technologies|technical/.test(lower);
  if (hasExp && hasEdu && hasSkills) {
    score += 30;
  } else {
    const missing: string[] = [];
    if (!hasExp) missing.push('Experience');
    if (!hasEdu) missing.push('Education');
    if (!hasSkills) missing.push('Skills');
    issues.push(`Missing standard sections: ${missing.join(', ')}`);
  }

  // 4. Reasonable length (10 pts)
  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 200 && wordCount <= 2000) {
    score += 10;
  } else if (wordCount < 200) {
    issues.push(`Resume is too short (${wordCount} words). Aim for 300-1500.`);
  } else {
    issues.push(`Resume is too long (${wordCount} words). Aim for 300-1500.`);
  }

  return { score, issues };
}
```

After computing, save to the applications row:
- `ats_score`: result.score
- `ats_issues`: result.issues
- `parse_status`: 'parsed'

## Hour 6 — Testing & edge cases

Test with 3 real resumes:
1. **Good resume** (typed in Word, exported as PDF) — should score 90–100
2. **Average resume** (missing one section like 'Skills') — should score 60–80
3. **Scanned resume** (photo of a printed CV, saved as PDF) — should score 0–20 with issue "image-only"

If parsing fails on a real resume:
- Check terminal — what did `pdf-parse` return?
- Check raw OpenAI response — should always be valid JSON in JSON mode, but log it just in case
- If errors persist, tighten the system prompt or check that the system message contains the word "JSON"

## Common bugs

| Symptom | Fix |
|---|---|
| `pdf-parse` error: `Cannot find module './test/data/...'` | Use `import pdf from 'pdf-parse/lib/pdf-parse.js';` (NOT plain `'pdf-parse'`). The type declaration at `types/pdf-parse.d.ts` makes TS happy. |
| OpenAI 401 / "Incorrect API key" | Restart `npm run dev`. Verify `OPENAI_API_KEY` in `.env.local` has no quotes and starts with `sk-` |
| OpenAI 400 "messages must contain the word 'json'" | JSON mode requires the system or user prompt to mention "JSON". Don't remove that word from the system prompt. |
| Parser is slow (5–10 seconds) | Fine for the MVP. Expected with `gpt-4o-mini` for a full resume. |
| Costs are too high | Use `gpt-4o-mini`, NOT `gpt-4o`. `gpt-4o-mini` costs <$0.001 per resume. |

## Done definition

- [ ] `POST /api/applications/[id]/parse` exists and works
- [ ] `pdf-parse` extracts text correctly from typical resumes
- [ ] OpenAI returns valid structured JSON (JSON mode guarantees this)
- [ ] `parsed_data` is saved to the applications row
- [ ] `ats_score` (0–100) computed correctly using the 4-part rubric
- [ ] `ats_issues` is a JSON array of strings
- [ ] Tested with at least one good resume + one image-based PDF
