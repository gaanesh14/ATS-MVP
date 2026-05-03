import { NextResponse } from 'next/server';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// OpenAI helpers — direct fetch, no SDK dependency.
// ---------------------------------------------------------------------------

const OPENAI_BASE = 'https://api.openai.com/v1';

async function callChat(args: {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  json?: boolean;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    max_tokens: args.max_tokens ?? 1024,
    temperature: args.temperature ?? 0.1,
  };
  if (args.json) body.response_format = { type: 'json_object' };

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI chat ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

async function callEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI embedding ${res.status}: ${t}`);
  }
  const json = await res.json();
  return json.data?.[0]?.embedding ?? [];
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---------------------------------------------------------------------------
// Module 2 — Resume parser (NER via LLM)
// ---------------------------------------------------------------------------

const RESUME_SYSTEM = `You are a resume parser. Extract structured data from the resume text.
Return ONLY valid JSON, no markdown, no explanation, no code fences.
If a field is not found, use null. Skill names should be lowercased and normalized
(e.g. "JS" → "javascript", "ReactJS" → "react", "Postgres" → "postgresql").`;

const RESUME_PROMPT = (text: string) => `Extract these fields from the resume below. Return JSON exactly in this shape:
{
  "experience_years": number,
  "current_company": string | null,
  "current_role": string | null,
  "previous_titles": [string],
  "location": string | null,
  "skills": [string],
  "education_level": "phd" | "masters" | "bachelors" | "diploma" | "other" | null,
  "education_field": string | null,
  "notice_period_days": number | null,
  "current_salary": number | null,
  "expected_salary": number | null,
  "email_in_resume": string | null,
  "phone_in_resume": string | null,
  "last_skill_used_year": number | null
}

For salary, return number in INR. If candidate writes "15 LPA" that's 1500000.
For experience_years, total years of professional experience as a number (e.g. 3.5).
For notice_period, in days (e.g. "2 months" = 60).
For last_skill_used_year, the year of the candidate's most recent role (or null).

Resume:
${text.slice(0, 30000)}`;

// ---------------------------------------------------------------------------
// Module 3 — JD parser
// ---------------------------------------------------------------------------

const JD_SYSTEM = `You are a job description parser. Extract structured requirements.
Return ONLY valid JSON, no markdown. Normalize skill names like a resume parser
("JS" → "javascript"). If a field is not found, use null or [].`;

const JD_PROMPT = (jd: string) => `Extract requirements from this job description. Return JSON exactly:
{
  "required_skills": [string],
  "nice_to_have_skills": [string],
  "min_years_experience": number | null,
  "target_title": string | null,
  "role_family": string | null,
  "seniority": "intern" | "junior" | "mid" | "senior" | "lead" | "principal" | null,
  "education_required": "phd" | "masters" | "bachelors" | "any" | null,
  "education_field": string | null
}

Job description:
${jd.slice(0, 12000)}`;

// ---------------------------------------------------------------------------
// Module 6 — LLM reasoning / validation
// ---------------------------------------------------------------------------

const REASONING_SYSTEM = `You are an expert technical recruiter. You'll receive a deterministic
match score and the parsed candidate + job, and your job is to validate the score, write a one-line
summary, and produce final matched/missing skill lists. Return ONLY valid JSON.`;

const REASONING_PROMPT = (
  parsedResume: unknown,
  parsedJD: unknown,
  rawScore: number,
  breakdown: unknown,
  resumeText: string,
) => `Deterministic score: ${rawScore}/100
Score breakdown: ${JSON.stringify(breakdown)}
Parsed candidate: ${JSON.stringify(parsedResume)}
Parsed job: ${JSON.stringify(parsedJD)}

Resume excerpt (first 4000 chars):
${resumeText.slice(0, 4000)}

Validate the score. If the deterministic scorer missed something obvious (e.g. years of experience
were misparsed because of formatting), adjust. Otherwise return the same number.

Return JSON exactly:
{
  "validated_score": number,
  "summary": string,
  "matched_skills": [string],
  "missing_skills": [string]
}

Rules:
- validated_score: integer 0-100. Adjust by at most ±10 from the deterministic score unless you find a clear error.
- summary: ONE sentence, 12-25 words, telling the recruiter the headline. E.g. "Strong fit — 7 years of relevant backend experience, missing only Kubernetes."
- matched_skills: required skills the candidate has, lowercased.
- missing_skills: required skills the candidate lacks, lowercased.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ResumeStruct = {
  experience_years?: number | null;
  current_company?: string | null;
  current_role?: string | null;
  previous_titles?: string[] | null;
  location?: string | null;
  skills?: string[] | null;
  education_level?: string | null;
  education_field?: string | null;
  notice_period_days?: number | null;
  current_salary?: number | null;
  expected_salary?: number | null;
  email_in_resume?: string | null;
  phone_in_resume?: string | null;
  last_skill_used_year?: number | null;
};

type JDStruct = {
  required_skills?: string[];
  nice_to_have_skills?: string[];
  min_years_experience?: number | null;
  target_title?: string | null;
  role_family?: string | null;
  seniority?: string | null;
  education_required?: string | null;
  education_field?: string | null;
};

function safeParseJson<T>(s: string): T | null {
  try {
    const cleaned = s
      .trim()
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?```\s*$/, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\.js$/, 'js').replace(/[\s_-]+/g, '');
}

const EDUCATION_LEVELS = ['other', 'diploma', 'bachelors', 'masters', 'phd'];
function eduLevelIndex(level: string | null | undefined): number {
  if (!level) return -1;
  return EDUCATION_LEVELS.indexOf(level.toLowerCase());
}

// ---------------------------------------------------------------------------
// Module 5 — Multi-signal scorer
// ---------------------------------------------------------------------------

function scoreSignals(
  resume: ResumeStruct,
  jd: JDStruct,
  cosineSim: number,
  resumeText: string,
) {
  const issues: string[] = [];

  // 1. Skill overlap (35%)
  const required = (jd.required_skills ?? []).map(normalize);
  const candidateSkills = new Set(
    [...(resume.skills ?? []), ...((resume.previous_titles ?? []).join(' ').split(/\s+/))].map(
      normalize,
    ),
  );
  // Also fall back to substring search in raw resume text for skills not in the parsed list
  const lowerText = resumeText.toLowerCase();
  let matchedCount = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const req of required) {
    if (!req) continue;
    const inSkills = Array.from(candidateSkills).some(
      (s) => s === req || s.includes(req) || req.includes(s),
    );
    const inText = lowerText.includes(req);
    if (inSkills || inText) {
      matched.push(req);
      matchedCount++;
    } else {
      missing.push(req);
    }
  }
  const skillRatio = required.length > 0 ? matchedCount / required.length : 0.5;
  const skillScore = Math.round(skillRatio * 35);

  // 2. Semantic similarity (25%) — cosine is in [-1, 1]; clamp + scale to [0, 1]
  const semanticNorm = Math.max(0, Math.min(1, (cosineSim + 1) / 2));
  // Embeddings of unrelated text often sit around 0.3–0.5; we treat ≥0.7 as strong.
  // Apply a curve: map [0.4, 0.85] → [0, 1] for more meaningful spread.
  const semanticCalibrated = Math.max(0, Math.min(1, (semanticNorm - 0.4) / 0.45));
  const semanticScore = Math.round(semanticCalibrated * 25);

  // 3. Experience match (15%)
  const requiredYears = jd.min_years_experience;
  const actualYears = resume.experience_years;
  let expScore = 15;
  if (requiredYears != null && actualYears != null) {
    const ratio = Math.min(actualYears / requiredYears, 1.5);
    if (ratio < 0.5) expScore = 5;
    else if (ratio < 0.85) expScore = 10;
    else expScore = 15;
  } else if (requiredYears == null) {
    expScore = 8; // neutral when JD doesn't specify
  } else if (actualYears == null) {
    issues.push('Experience could not be inferred from resume.');
    expScore = 8; // neutral
  }

  // 4. Role/title relevance (10%) — exact-ish title match or family
  const targetTitle = (jd.target_title ?? '').toLowerCase();
  const titles = [resume.current_role, ...(resume.previous_titles ?? [])]
    .filter(Boolean)
    .map((t) => (t as string).toLowerCase());
  let titleMatched = false;
  if (targetTitle && titles.length > 0) {
    titleMatched = titles.some((t) => {
      // any non-trivial token overlap
      const a = new Set(t.split(/[\s,/-]+/).filter((w) => w.length > 2));
      const b = new Set(targetTitle.split(/[\s,/-]+/).filter((w) => w.length > 2));
      for (const w of Array.from(b)) if (a.has(w)) return true;
      return false;
    });
  } else if (!targetTitle) {
    titleMatched = false; // no requirement
  }
  const titleScore = titleMatched ? 10 : (targetTitle ? 4 : 7);

  // 5. Education match (10%)
  const reqEdu = jd.education_required;
  const candEdu = resume.education_level;
  let eduMatched: 'yes' | 'no' | 'partial' | 'unknown' = 'unknown';
  let eduScore = 8; // benefit of the doubt
  if (!reqEdu || reqEdu === 'any') {
    eduMatched = 'unknown';
    eduScore = 7;
  } else if (candEdu) {
    const reqIdx = eduLevelIndex(reqEdu);
    const candIdx = eduLevelIndex(candEdu);
    if (candIdx >= reqIdx) {
      eduMatched = 'yes';
      eduScore = 10;
    } else if (candIdx >= 0) {
      eduMatched = 'partial';
      eduScore = 5;
    } else {
      eduMatched = 'no';
      eduScore = 2;
    }
  }

  // 6. Recency (5%)
  const lastUsed = resume.last_skill_used_year;
  const thisYear = new Date().getFullYear();
  let fresh = true;
  let recencyScore = 5;
  if (lastUsed != null && thisYear - lastUsed > 3) {
    fresh = false;
    recencyScore = 2;
  } else if (lastUsed == null) {
    recencyScore = 4; // unknown → near-full credit
  }

  const totalRaw = skillScore + semanticScore + expScore + titleScore + eduScore + recencyScore;

  return {
    matched,
    missing,
    issues,
    breakdown: {
      skill_overlap: { score: skillScore, weight: 35, matched: matchedCount, required: required.length },
      semantic: { score: semanticScore, weight: 25, cosine: Number(cosineSim.toFixed(3)) },
      experience: { score: expScore, weight: 15, actual: actualYears ?? null, required: requiredYears ?? null },
      title: { score: titleScore, weight: 10, matched: titleMatched },
      education: { score: eduScore, weight: 10, matched: eduMatched },
      recency: { score: recencyScore, weight: 5, fresh },
      total_raw: totalRaw,
    },
  };
}

// ---------------------------------------------------------------------------
// Format gates — run before scoring; produce warnings, not score deductions.
// ---------------------------------------------------------------------------

function formatGates(text: string): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (text.length < 100) {
    issues.push('Resume appears to be scanned or image-only — text could not be extracted.');
    return { ok: false, issues };
  }
  const hasEmail = /[\w.-]+@[\w.-]+\.\w+/.test(text);
  const hasPhone = /\d{10}|\+\d{1,3}\s?\d{10}/.test(text.replace(/\s/g, ''));
  if (!hasEmail) issues.push('No email detected in resume.');
  if (!hasPhone) issues.push('No phone number detected in resume.');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 200) issues.push(`Resume is short (${wordCount} words). Aim for 300–1500.`);
  if (wordCount > 2000) issues.push(`Resume is long (${wordCount} words). Aim for 300–1500.`);
  return { ok: true, issues };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  console.log(`[parse] start id=${id}`);

  await supabase.from('applications').update({ parse_status: 'processing' }).eq('id', id);

  try {
    // -- Fetch application + parent job (for the JD).
    //    Pull existing parsed_data too so we can preserve any user-supplied
    //    fields (location, experience_years) the apply form seeded.
    const { data: app, error: fetchErr } = await supabase
      .from('applications')
      .select('id, resume_url, job_id, parsed_data')
      .eq('id', id)
      .single();
    if (fetchErr || !app) {
      throw new Error(`Could not fetch application: ${fetchErr?.message ?? 'not found'}`);
    }
    if (!app.resume_url) throw new Error('Application has no resume_url');

    // What the candidate self-reported on the apply form. Used as a fallback
    // for any field the LLM extractor couldn't pull from the PDF.
    const userSupplied = (app.parsed_data ?? {}) as {
      location?: string | null;
      experience_years?: number | null;
    };

    let jobDescription = '';
    let jobTitle = '';
    if (app.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('title, description, min_experience')
        .eq('id', app.job_id)
        .single();
      jobDescription = job?.description ?? '';
      jobTitle = job?.title ?? '';
      if (job?.min_experience) {
        jobDescription += `\nMinimum Experience Required: ${job.min_experience} years.`;
      }
    }

    // -- Module 1: Text extraction
    const pdfRes = await fetch(app.resume_url);
    if (!pdfRes.ok) throw new Error(`Failed to download PDF: HTTP ${pdfRes.status}`);
    const buffer = Buffer.from(await pdfRes.arrayBuffer());
    const pdfData = await pdf(buffer);
    const text = (pdfData.text || '').trim();
    console.log(`[parse] extracted ${text.length} chars`);

    const gates = formatGates(text);
    if (!gates.ok) {
      // Hard fail — resume isn't readable. Score is null. Preserve the
      // candidate's self-reported location/experience so location filters
      // still match and the recruiter sees something.
      const fallbackParsed =
        userSupplied.experience_years != null || userSupplied.location != null
          ? {
              experience_years: userSupplied.experience_years ?? null,
              location: userSupplied.location ?? null,
            }
          : null;
      await supabase.from('applications').update({
        resume_text: text.slice(0, 50000),
        parse_status: 'failed',
        ats_score: null,
        ats_issues: gates.issues,
        parsed_data: fallbackParsed,
        matched_skills: null,
        missing_skills: null,
        match_summary: 'Resume could not be read.',
        score_breakdown: null,
      }).eq('id', id);
      return NextResponse.json({ ok: false, error: gates.issues[0] }, { status: 200 });
    }

    // -- Run modules 2, 3, 4 in parallel — they're independent.
    const jdForLlm = jobDescription || jobTitle || '(no job description provided)';
    const [resumeRaw, jdRaw, resumeEmb, jdEmb] = await Promise.all([
      callChat({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: RESUME_SYSTEM },
          { role: 'user', content: RESUME_PROMPT(text) },
        ],
        json: true,
      }),
      callChat({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: JD_SYSTEM },
          { role: 'user', content: JD_PROMPT(jdForLlm) },
        ],
        json: true,
      }),
      callEmbedding(text),
      callEmbedding(jdForLlm),
    ]);

    const parsedResume = safeParseJson<ResumeStruct>(resumeRaw) ?? {};
    const parsedJD = safeParseJson<JDStruct>(jdRaw) ?? {};
    const cos = cosine(resumeEmb, jdEmb);
    console.log(`[parse] cosine=${cos.toFixed(3)}`);

    // -- Module 5: Deterministic weighted scorer
    const det = scoreSignals(parsedResume, parsedJD, cos, text);
    const allIssues = [...gates.issues, ...det.issues];
    console.log(`[parse] deterministic=${det.breakdown.total_raw}`);

    // -- Module 6: LLM reasoning / validation
    let validated = det.breakdown.total_raw;
    let summary = '';
    let matched_skills = det.matched;
    let missing_skills = det.missing;

    try {
      const reasoningRaw = await callChat({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: REASONING_SYSTEM },
          {
            role: 'user',
            content: REASONING_PROMPT(parsedResume, parsedJD, det.breakdown.total_raw, det.breakdown, text),
          },
        ],
        json: true,
        max_tokens: 600,
      });
      const reasoning = safeParseJson<{
        validated_score?: number;
        summary?: string;
        matched_skills?: string[];
        missing_skills?: string[];
      }>(reasoningRaw);

      if (reasoning?.validated_score != null) {
        const v = Math.max(0, Math.min(100, Math.round(reasoning.validated_score)));
        // Cap LLM adjustments at ±10 so it can't override the deterministic score wildly
        const drift = v - det.breakdown.total_raw;
        validated = det.breakdown.total_raw + Math.max(-10, Math.min(10, drift));
      }
      if (reasoning?.summary) summary = reasoning.summary.trim();
      if (Array.isArray(reasoning?.matched_skills)) matched_skills = reasoning.matched_skills.map(String);
      if (Array.isArray(reasoning?.missing_skills)) missing_skills = reasoning.missing_skills.map(String);
    } catch (reasonErr) {
      console.error('[parse] reasoning step failed (non-fatal):', reasonErr);
      allIssues.push('LLM validation step failed; deterministic score used.');
    }

    const finalScore = Math.max(0, Math.min(100, validated));

    // -- Persist. For location + experience, fall back to the candidate's
    //    self-reported values when the LLM couldn't extract from the PDF.
    //    The parser's value still wins when present.
    const mergedParsed = {
      ...parsedResume,
      experience_years:
        (parsedResume as { experience_years?: number | null }).experience_years ??
        userSupplied.experience_years ??
        null,
      location:
        (parsedResume as { location?: string | null }).location ??
        userSupplied.location ??
        null,
    };

    const breakdown = { ...det.breakdown, llm_validated: finalScore };
    const { error: updErr } = await supabase
      .from('applications')
      .update({
        resume_text: text.slice(0, 50000),
        parsed_data: mergedParsed,
        ats_score: finalScore,
        ats_issues: allIssues,
        matched_skills,
        missing_skills,
        match_summary: summary || `Match score ${finalScore}/100.`,
        score_breakdown: breakdown,
        parse_status: 'parsed',
      })
      .eq('id', id);

    if (updErr) throw new Error(`Could not update application: ${updErr.message}`);

    console.log(`[parse] done id=${id} score=${finalScore}`);

    return NextResponse.json({
      ok: true,
      ats_score: finalScore,
      ats_issues: allIssues,
      parsed_data: mergedParsed,
      matched_skills,
      missing_skills,
      match_summary: summary,
      score_breakdown: breakdown,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[parse] FATAL id=${id}:`, msg);

    // Preserve self-reported parsed_data on fatal failure so the candidate's
    // claimed location/experience aren't lost.
    const { data: existing } = await supabase
      .from('applications')
      .select('parsed_data')
      .eq('id', id)
      .single();

    await supabase
      .from('applications')
      .update({
        parse_status: 'failed',
        ats_score: null,
        ats_issues: [msg],
        parsed_data: existing?.parsed_data ?? null,
        matched_skills: null,
        missing_skills: null,
        match_summary: 'Parsing failed.',
        score_breakdown: null,
      })
      .eq('id', id);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
