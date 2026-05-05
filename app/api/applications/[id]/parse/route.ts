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
("JS" → "javascript", "ReactJS" → "react"). If a field is not found, use null or [].`;

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

Rules for required_skills (CRITICAL):
- Prefer CONCRETE technologies, languages, frameworks, databases, tools.
  Examples: "react", "node", "mongodb", "typescript", "docker", "aws".
- DO list category labels ("full stack", "frontend", "backend", "devops",
  "ci/cd", "deployment") only if the JD explicitly emphasizes them as a
  requirement. Don't fabricate them.
- Do NOT include soft skills, methodology buzzwords, or generic phrases like
  "team player", "fast learner", "agile", "scrum", "good communication".
- Aim for 4-10 specific skills. Avoid lumping many tools under one umbrella.

Job description:
${jd.slice(0, 12000)}`;

// ---------------------------------------------------------------------------
// Module 6 — LLM reasoning / validation
// ---------------------------------------------------------------------------

const REASONING_SYSTEM = `You are an expert technical recruiter. Be honest, not optimistic.
You'll receive a deterministic match score plus the parsed candidate and job, and you
must produce an honest validated score, a one-line summary, and final matched/missing
skill lists. Return ONLY valid JSON.`;

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

Independently judge the candidate against the role. The deterministic score is a
starting point — it can be wrong. Do NOT anchor to it. If the candidate is missing
core required skills, the score must reflect that even if vocabulary is similar.

When deciding matched_skills vs missing_skills, USE YOUR OWN JUDGMENT — the
deterministic scorer can be too literal:
- A required "full stack" / "fullstack" skill IS satisfied when the candidate
  has both a frontend technology (React, Vue, Angular, …) AND a backend
  technology (Node, Django, Express, Rails, Spring, …). MERN/MEAN/MEVN stack
  candidates ARE full-stack — count it as matched.
- A required "frontend" / "backend" skill is matched when the candidate has any
  representative tool from that category (don't require the literal word).
- A required "deployment" or "ci/cd" skill is matched only if the candidate
  has shipped to a real platform (Vercel/AWS/Docker/etc.) or used a real CI
  tool (GitHub Actions/Jenkins/etc.) — vague verbs like "deployed" in a bullet
  point alone are NOT enough; require a concrete platform.
- Treat "REST APIs", "RESTful APIs", "API development" as backend-equivalent.
- Hyphenation/spacing variants ("full-stack" vs "full stack") are the same skill.

Return JSON exactly:
{
  "validated_score": number,
  "summary": string,
  "matched_skills": [string],
  "missing_skills": [string]
}

Scoring rubric (use the FULL range — most candidates are NOT 70+):
- 85-100: strong fit. Has all/nearly all required skills, right experience level, right domain.
- 65-84: good fit. Missing at most 1 required skill, otherwise solid.
- 45-64: partial fit. Missing several required skills, OR clear seniority mismatch, OR adjacent domain.
- 25-44: weak fit. Missing core skills the role depends on, or wrong domain entirely.
- 0-24: not a fit. Fundamentally mismatched (e.g. frontend candidate for ML role).

Rules:
- validated_score: integer 0-100. Use the rubric above. Be willing to score below 50 when warranted.
- summary: ONE sentence, 12-25 words. Lead with the verdict. E.g. "Weak fit — missing Kubernetes and AWS, the two main infra requirements, despite 5 years of backend experience."
- matched_skills: required skills the candidate genuinely has (verified in the resume), lowercased.
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

// Common skill aliases. The map's KEY is the result of `normalize(...)`,
// so the source variant on the right doesn't matter — only the canonical form.
const SKILL_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  reactjs: 'react',
  nextjs: 'next',
  nodejs: 'node',
  postgres: 'postgresql',
  postgressql: 'postgresql',
  py: 'python',
  k8s: 'kubernetes',
  golang: 'go',
  cpp: 'c++',
  csharp: 'c#',
  dotnet: '.net',
  ml: 'machinelearning',
  ai: 'artificialintelligence',
  tf: 'tensorflow',
};

function canonicalSkill(s: string): string {
  const n = normalize(s);
  return SKILL_ALIASES[n] ?? n;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary match using a custom non-alphanumeric boundary so that skills
// containing punctuation (c++, c#, .net, node.js) still match correctly.
// Whitespace, hyphens, and underscores INSIDE the search term are treated as
// flexible separators so "full stack" matches "full-stack", "fullstack",
// "full_stack" — JDs and resumes use these variants interchangeably.
function makeWordBoundaryRegex(s: string): RegExp {
  const lower = s.toLowerCase();
  // Split on internal separators, escape each chunk, join with a flexible
  // separator class so any of space/hyphen/underscore/none works.
  const flexibleBody = lower
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map(escapeRegex)
    .join('[\\s\\-_]*');
  if (!flexibleBody) return /a^/; // never matches
  return new RegExp(`(^|[^a-z0-9])${flexibleBody}([^a-z0-9]|$)`, 'i');
}

// Vague meta-skills that JDs love listing as if they were concrete tools.
// When one of these appears in `required_skills`, treat it as satisfied if
// the candidate has any of the listed concrete member skills (or, for the
// "full stack" special case, both a frontend AND a backend technology).
const SKILL_CATEGORY_FRONTEND = [
  'react', 'reactnative', 'vue', 'angular', 'svelte', 'next', 'nuxt',
  'remix', 'tailwindcss', 'tailwind', 'bootstrap', 'jquery', 'html',
  'css', 'scss', 'sass', 'redux', 'mui', 'chakraui', 'shadcn',
];
const SKILL_CATEGORY_BACKEND = [
  'node', 'express', 'expressjs', 'nestjs', 'django', 'flask',
  'fastapi', 'spring', 'springboot', 'rails', 'laravel', 'gin',
  'go', 'java', 'python', 'ruby', 'php', '.net', 'dotnet',
  'graphql', 'rest', 'restapi', 'restfulapi', 'restfulapis',
];
const SKILL_CATEGORY_DEPLOYMENT = [
  'vercel', 'netlify', 'aws', 'gcp', 'azure', 'docker', 'kubernetes',
  'heroku', 'render', 'cloudflare', 'digitalocean', 'fly', 'flyio',
  'firebase', 'amplify', 's3', 'ec2', 'lambda', 'cloudrun',
];
const SKILL_CATEGORY_CICD = [
  'githubactions', 'gitlabci', 'jenkins', 'circleci', 'travis',
  'travisci', 'azurepipelines', 'argocd', 'bitbucketpipelines',
];
const SKILL_CATEGORY_DEVOPS = [
  ...SKILL_CATEGORY_DEPLOYMENT,
  ...SKILL_CATEGORY_CICD,
  'terraform', 'ansible', 'pulumi', 'helm', 'prometheus', 'grafana',
];
const SKILL_CATEGORY_DATABASE = [
  'mongodb', 'postgresql', 'mysql', 'sqlite', 'redis', 'dynamodb',
  'firestore', 'cassandra', 'elasticsearch', 'oracle', 'sqlserver',
];
const SKILL_CATEGORY_MOBILE = [
  'reactnative', 'flutter', 'swift', 'kotlin', 'objectivec', 'ionic', 'expo',
];

type SkillCategory =
  | { mode: 'any'; members: string[] }
  | { mode: 'frontend_and_backend' };

const SKILL_CATEGORIES: Record<string, SkillCategory> = {
  fullstack: { mode: 'frontend_and_backend' },
  fullstackdeveloper: { mode: 'frontend_and_backend' },
  fullstackdevelopment: { mode: 'frontend_and_backend' },
  frontend: { mode: 'any', members: SKILL_CATEGORY_FRONTEND },
  frontenddevelopment: { mode: 'any', members: SKILL_CATEGORY_FRONTEND },
  ui: { mode: 'any', members: SKILL_CATEGORY_FRONTEND },
  backend: { mode: 'any', members: SKILL_CATEGORY_BACKEND },
  backenddevelopment: { mode: 'any', members: SKILL_CATEGORY_BACKEND },
  serverside: { mode: 'any', members: SKILL_CATEGORY_BACKEND },
  api: { mode: 'any', members: SKILL_CATEGORY_BACKEND },
  apis: { mode: 'any', members: SKILL_CATEGORY_BACKEND },
  cicd: { mode: 'any', members: SKILL_CATEGORY_CICD },
  ci: { mode: 'any', members: SKILL_CATEGORY_CICD },
  cd: { mode: 'any', members: SKILL_CATEGORY_CICD },
  deployment: { mode: 'any', members: SKILL_CATEGORY_DEPLOYMENT },
  deployments: { mode: 'any', members: SKILL_CATEGORY_DEPLOYMENT },
  devops: { mode: 'any', members: SKILL_CATEGORY_DEVOPS },
  cloud: { mode: 'any', members: SKILL_CATEGORY_DEPLOYMENT },
  databases: { mode: 'any', members: SKILL_CATEGORY_DATABASE },
  database: { mode: 'any', members: SKILL_CATEGORY_DATABASE },
  mobile: { mode: 'any', members: SKILL_CATEGORY_MOBILE },
};

function skillExistsInTexts(
  member: string,
  candidateSkillsCanon: Set<string>,
  candidateSkillsText: string,
  resumeText: string,
): boolean {
  if (candidateSkillsCanon.has(member)) return true;
  if (member.length < 3) return false;
  const re = makeWordBoundaryRegex(member);
  return re.test(candidateSkillsText) || re.test(resumeText);
}

// Decide if a required skill is present in the candidate's profile.
//   1. Canonical equality against the candidate's parsed skills.
//   2. Category expansion (full stack / frontend / cicd / deployment / …).
//   3. Word-boundary match in the candidate's raw skill strings AND resume body
//      with flexible internal separators ("full stack" → "full-stack").
//
// Skills shorter than 3 chars only match exact (avoids "go" → "going",
// "ml" → "html" false positives).
function skillMatches(
  req: string,
  candidateSkillsCanon: Set<string>,
  candidateSkillsText: string,
  resumeText: string,
): boolean {
  const reqCanon = canonicalSkill(req);
  if (!reqCanon) return false;
  if (candidateSkillsCanon.has(reqCanon)) return true;

  // Category expansion — vague terms are satisfied by concrete member skills.
  const cat = SKILL_CATEGORIES[reqCanon];
  if (cat) {
    if (cat.mode === 'frontend_and_backend') {
      const hasFE = SKILL_CATEGORY_FRONTEND.some((m) =>
        skillExistsInTexts(m, candidateSkillsCanon, candidateSkillsText, resumeText),
      );
      const hasBE = SKILL_CATEGORY_BACKEND.some((m) =>
        skillExistsInTexts(m, candidateSkillsCanon, candidateSkillsText, resumeText),
      );
      if (hasFE && hasBE) return true;
    } else {
      if (
        cat.members.some((m) =>
          skillExistsInTexts(m, candidateSkillsCanon, candidateSkillsText, resumeText),
        )
      )
        return true;
    }
    // Category didn't match — fall through to literal text match below in
    // case the resume actually says "full stack" verbatim.
  }

  const minLen = Math.min(req.length, reqCanon.length);
  if (minLen < 3) return false;

  // Try both the original input and the canonical form — handles cases like
  // "react.js" (original) vs "react" (canonical) cleanly.
  for (const variant of new Set([req.toLowerCase(), reqCanon])) {
    if (variant.length < 3) continue;
    const re = makeWordBoundaryRegex(variant);
    if (re.test(candidateSkillsText) || re.test(resumeText)) return true;
  }
  return false;
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

  // ---------------------------------------------------------------------
  // 1. Skill overlap (35%) — strict matching, no substring false positives.
  // ---------------------------------------------------------------------
  const required = (jd.required_skills ?? [])
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  const candidateSkillsRaw = (resume.skills ?? [])
    .map((s) => (s ?? '').toLowerCase().trim())
    .filter(Boolean);
  const candidateSkillsCanon = new Set(candidateSkillsRaw.map(canonicalSkill));
  const candidateSkillsText = candidateSkillsRaw.join(' ');
  const lowerText = resumeText.toLowerCase();

  let matchedCount = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const req of required) {
    if (skillMatches(req, candidateSkillsCanon, candidateSkillsText, lowerText)) {
      matched.push(req.toLowerCase());
      matchedCount++;
    } else {
      missing.push(req.toLowerCase());
    }
  }

  // If JD has no extractable required skills, drop this signal entirely
  // (rather than gifting 17.5/35 free points). The total is later rescaled.
  let skillScore = 0;
  let skillWeightApplied = 35;
  let skillRatio = 0;
  if (required.length === 0) {
    skillWeightApplied = 0;
    issues.push(
      'Job description has no clearly defined required skills — score relies on semantic similarity and LLM judgment.',
    );
  } else {
    skillRatio = matchedCount / required.length;
    skillScore = Math.round(skillRatio * 35);
  }

  // ---------------------------------------------------------------------
  // 2. Semantic similarity (25%) — recalibrated.
  //    cosine ∈ [-1, 1]; norm = (cos+1)/2 ∈ [0, 1].
  //    Map [0.55, 0.9] → [0, 1] so generic tech-vs-tech vocabulary overlap
  //    (cosine ~0.3-0.5) doesn't earn meaningful points anymore.
  // ---------------------------------------------------------------------
  const semanticNorm = Math.max(0, Math.min(1, (cosineSim + 1) / 2));
  const semanticCalibrated = Math.max(0, Math.min(1, (semanticNorm - 0.55) / 0.35));
  const semanticScore = Math.round(semanticCalibrated * 25);

  // ---------------------------------------------------------------------
  // 3. Experience match (15%) — tighter neutral defaults.
  // ---------------------------------------------------------------------
  const requiredYears = jd.min_years_experience;
  const actualYears = resume.experience_years;
  let expScore: number;
  if (requiredYears != null && actualYears != null) {
    const ratio = Math.min(actualYears / requiredYears, 1.5);
    if (ratio < 0.5) expScore = 3;
    else if (ratio < 0.85) expScore = 9;
    else expScore = 15;
  } else if (requiredYears == null && actualYears != null) {
    expScore = 10; // candidate has experience, JD didn't specify a minimum
  } else if (requiredYears == null && actualYears == null) {
    expScore = 5; // both unknown
  } else {
    issues.push('Experience could not be inferred from resume.');
    expScore = 5; // requirement exists, candidate years unknown
  }

  // ---------------------------------------------------------------------
  // 4. Role/title relevance (10%) — require ≥50% of significant JD title
  //    tokens to appear in one of the candidate's titles. Single-word
  //    titles fall back to exact token presence.
  // ---------------------------------------------------------------------
  const targetTitle = (jd.target_title ?? '').toLowerCase().trim();
  const titles = [resume.current_role, ...(resume.previous_titles ?? [])]
    .filter(Boolean)
    .map((t) => (t as string).toLowerCase());
  let titleMatched = false;
  if (targetTitle && titles.length > 0) {
    const reqTokens = targetTitle.split(/[\s,/-]+/).filter((w) => w.length > 2);
    if (reqTokens.length > 0) {
      titleMatched = titles.some((t) => {
        const candTokens = new Set(t.split(/[\s,/-]+/).filter((w) => w.length > 2));
        const overlap = reqTokens.filter((w) => candTokens.has(w)).length;
        return overlap / reqTokens.length >= 0.5;
      });
    }
  }
  let titleScore: number;
  if (!targetTitle) titleScore = 5;
  else if (titleMatched) titleScore = 10;
  else titleScore = 2;

  // ---------------------------------------------------------------------
  // 5. Education match (10%) — tighter neutral defaults.
  // ---------------------------------------------------------------------
  const reqEdu = jd.education_required;
  const candEdu = resume.education_level;
  let eduMatched: 'yes' | 'no' | 'partial' | 'unknown' = 'unknown';
  let eduScore: number;
  if (!reqEdu || reqEdu === 'any') {
    eduMatched = 'unknown';
    eduScore = 5;
  } else if (candEdu) {
    const reqIdx = eduLevelIndex(reqEdu);
    const candIdx = eduLevelIndex(candEdu);
    if (candIdx >= reqIdx) {
      eduMatched = 'yes';
      eduScore = 10;
    } else if (candIdx >= 0) {
      eduMatched = 'partial';
      eduScore = 4;
    } else {
      eduMatched = 'no';
      eduScore = 1;
    }
  } else {
    eduMatched = 'unknown';
    eduScore = 4;
  }

  // ---------------------------------------------------------------------
  // 6. Recency (5%)
  // ---------------------------------------------------------------------
  const lastUsed = resume.last_skill_used_year;
  const thisYear = new Date().getFullYear();
  let fresh = true;
  let recencyScore: number;
  if (lastUsed != null) {
    const gap = thisYear - lastUsed;
    if (gap > 5) {
      fresh = false;
      recencyScore = 1;
    } else if (gap > 3) {
      fresh = false;
      recencyScore = 2;
    } else {
      recencyScore = 5;
    }
  } else {
    recencyScore = 3;
  }

  const totalRaw = skillScore + semanticScore + expScore + titleScore + eduScore + recencyScore;

  // Rescale to /100 if the skill signal was dropped (no JD requirements).
  let totalScaled = totalRaw;
  if (skillWeightApplied < 35) {
    const maxPossible = 100 - (35 - skillWeightApplied); // 65 when skills dropped
    totalScaled = Math.round((totalRaw / maxPossible) * 100);
  }

  // Hard cap: missing core skills is disqualifying. If <40% of required
  // skills matched (and at least 2 were required), cap final at 50.
  let coreCapApplied = false;
  if (required.length >= 2 && skillRatio < 0.4 && totalScaled > 50) {
    totalScaled = 50;
    coreCapApplied = true;
    issues.push(
      `Missing ${missing.length} of ${required.length} required skills — score capped at 50.`,
    );
  }

  return {
    matched,
    missing,
    issues,
    breakdown: {
      skill_overlap: {
        score: skillScore,
        weight: skillWeightApplied,
        matched: matchedCount,
        required: required.length,
        ratio: Number(skillRatio.toFixed(2)),
      },
      semantic: { score: semanticScore, weight: 25, cosine: Number(cosineSim.toFixed(3)) },
      experience: { score: expScore, weight: 15, actual: actualYears ?? null, required: requiredYears ?? null },
      title: { score: titleScore, weight: 10, matched: titleMatched, target: targetTitle || null },
      education: { score: eduScore, weight: 10, matched: eduMatched },
      recency: { score: recencyScore, weight: 5, fresh, last_used_year: lastUsed ?? null },
      total_raw: totalRaw,
      total_scaled: totalScaled,
      core_skill_cap_applied: coreCapApplied,
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
    let jdMinExperience: number | null = null;
    if (app.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('title, description, min_experience')
        .eq('id', app.job_id)
        .single();
      jobDescription = job?.description ?? '';
      jobTitle = job?.title ?? '';
      if (job?.min_experience != null) {
        const n = Number(job.min_experience);
        if (Number.isFinite(n)) {
          jdMinExperience = n;
          jobDescription += `\nMinimum Experience Required: ${n} years.`;
        }
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

    // Apply fallbacks BEFORE scoring so the deterministic scorer sees the
    // best information we have, not just what the LLM extractor produced.
    //
    // The candidate's self-reported `experience_years` and `location` from the
    // apply form WIN over the LLM extraction — the candidate knows their own
    // tenure better than a PDF parser, and LLM mis-reads (e.g. picking up the
    // most recent role's duration instead of total) are the leading cause of
    // wrong experience scores. We still log a discrepancy in ats_issues so the
    // recruiter can spot inflated self-reports.
    const llmExpYears = parsedResume.experience_years;
    if (userSupplied.experience_years != null) {
      parsedResume.experience_years = userSupplied.experience_years;
      if (
        llmExpYears != null &&
        Math.abs(llmExpYears - userSupplied.experience_years) >= 2
      ) {
        gates.issues.push(
          `Self-reported ${userSupplied.experience_years} yrs differs from resume estimate ${llmExpYears} yrs.`,
        );
      }
    }
    if (userSupplied.location != null) {
      parsedResume.location = userSupplied.location;
    }
    if (parsedJD.min_years_experience == null && jdMinExperience != null) {
      parsedJD.min_years_experience = jdMinExperience;
    }

    const cos = cosine(resumeEmb, jdEmb);
    console.log(`[parse] cosine=${cos.toFixed(3)}`);

    // -- Module 5: Deterministic weighted scorer
    const det = scoreSignals(parsedResume, parsedJD, cos, text);
    const allIssues = [...gates.issues, ...det.issues];
    console.log(
      `[parse] deterministic raw=${det.breakdown.total_raw} scaled=${det.breakdown.total_scaled} cap=${det.breakdown.core_skill_cap_applied}`,
    );

    // -- Module 6: LLM reasoning / validation (gpt-4o for stronger judgment).
    //    Asymmetric drift: LLM may pull score DOWN by up to 25 points, but
    //    push UP by only 10 — LLMs tend toward optimism on resumes, so we
    //    trust them more on negatives. The core-skill cap is never overridden.
    let validated = det.breakdown.total_scaled;
    let summary = '';
    let matched_skills = det.matched;
    let missing_skills = det.missing;

    try {
      const reasoningRaw = await callChat({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: REASONING_SYSTEM },
          {
            role: 'user',
            content: REASONING_PROMPT(parsedResume, parsedJD, det.breakdown.total_scaled, det.breakdown, text),
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
        const drift = v - det.breakdown.total_scaled;
        const cappedDrift = Math.max(-25, Math.min(10, drift));
        validated = det.breakdown.total_scaled + cappedDrift;
      }
      if (reasoning?.summary) summary = reasoning.summary.trim();
      if (Array.isArray(reasoning?.matched_skills)) matched_skills = reasoning.matched_skills.map(String);
      if (Array.isArray(reasoning?.missing_skills)) missing_skills = reasoning.missing_skills.map(String);
    } catch (reasonErr) {
      console.error('[parse] reasoning step failed (non-fatal):', reasonErr);
      allIssues.push('LLM validation step failed; deterministic score used.');
    }

    // Enforce the core-skill cap even after the LLM step — it cannot raise
    // a clearly-disqualified candidate above 50.
    if (det.breakdown.core_skill_cap_applied && validated > 50) {
      validated = 50;
    }

    const finalScore = Math.max(0, Math.min(100, validated));

    // -- Persist. The candidate's self-reported values WIN over the LLM
    //    extraction for experience + location (see the pre-score fallback
    //    block above for rationale). If the candidate left a field blank,
    //    we fall back to whatever the LLM was able to pull from the PDF.
    const mergedParsed = {
      ...parsedResume,
      experience_years:
        userSupplied.experience_years ??
        (parsedResume as { experience_years?: number | null }).experience_years ??
        null,
      location:
        userSupplied.location ??
        (parsedResume as { location?: string | null }).location ??
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
