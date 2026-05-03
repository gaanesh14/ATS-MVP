# ATS MVP — Project Documentation

A mini Applicant Tracking System (PhotonX Technologies sprint build).
Recruiters create jobs, candidates apply through a public link, resumes are auto-parsed by Claude and scored 0-100 for ATS-compliance.

## Read in this order

1. **[architecture.md](architecture.md)** — what you're building, the 3-track split, data flow, file tree
2. **[setup.md](setup.md)** — Hour 0 setup (do this all together, before splitting up)
3. **[schema.sql](schema.sql)** — the SQL to paste into Supabase SQL Editor
4. Your track:
   - **[track-a-recruiter.md](track-a-recruiter.md)** — Student A
   - **[track-b-candidate.md](track-b-candidate.md)** — Student B
   - **[track-c-parser.md](track-c-parser.md)** — Student C
5. **[integration.md](integration.md)** — Hour 4 end-to-end test + Vercel deploy + (optional) Hour 7 auth

## The five rules for using Claude

1. **Always paste the schema** when asking for queries or forms — otherwise Claude invents column names.
2. **One file, one prompt** — don't ask "build the dashboard," ask for one file at a time.
3. **Paste error messages verbatim** — full text, not summaries.
4. **If you can't explain the code in 3 lines, don't paste it** — ask for a simpler version.
5. **Use a Claude.ai Project** with the schema + your track file as Project knowledge — saves re-pasting.

## Stack at a glance

| Layer | Tool |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind + shadcn/ui |
| Database + Storage | Supabase (project ref `ebjkuzmxcadgxpmiguyz`) |
| Resume parsing | OpenAI `gpt-4o-mini` via the official `openai` SDK (JSON mode) |
| PDF text extraction | `pdf-parse` |
| Hosting | Vercel |

## Out of scope — DO NOT BUILD

- LinkedIn/Naukri/Indeed auto-posting (need paid partnerships → just paste the careers URL manually)
- Email notifications, interview scheduling
- Multi-recruiter teams, role-based permissions
- AI matching score against the JD
- Mobile app

If you finish your track early, **help the next person** — don't add features. Adding "just one more thing" is the #1 reason 8-hour sprints fail.
