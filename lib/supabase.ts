import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type StageColor =
  | 'sky'
  | 'amber'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'cyan'
  | 'teal'
  | 'orange'
  | 'indigo'
  | 'fuchsia'
  | 'slate';

export type JobStage = {
  id: string;
  label: string;
  color: StageColor;
};

export type Job = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  min_experience: number;
  max_experience: number;
  min_salary: number | null;
  max_salary: number | null;
  vacancies: number;
  status: string;
  extra_stages: JobStage[];
  created_at: string;
};

export type JobQuestion = {
  id: string;
  job_id: string;
  question: string;
  question_type: 'text' | 'number' | 'yesno';
  is_required: boolean;
  display_order: number;
};

export type ParsedData = {
  experience_years: number | null;
  current_company: string | null;
  current_role: string | null;
  location: string | null;
  skills: string[];
  notice_period_days: number | null;
  current_salary: number | null;
  expected_salary: number | null;
  email_in_resume: string | null;
  phone_in_resume: string | null;
};

export type BuiltinStage =
  | 'new'
  | 'shortlisted'
  | 'interview'
  | 'hired'
  | 'rejected';

// Stage IDs are free-form because admins can add custom stages on a per-job
// basis (see Job.extra_stages). The five built-in IDs are still treated
// specially for ordering (new → shortlisted → interview → … → hired → rejected)
// and to keep Hired/Rejected as terminal stages.
export type Stage = string;

export type ScoreBreakdown = {
  skill_overlap?: { score: number; weight: number; matched: number; required: number };
  semantic?: { score: number; weight: number; cosine: number };
  experience?: { score: number; weight: number; actual: number | null; required: number | null };
  title?: { score: number; weight: number; matched: boolean };
  education?: { score: number; weight: number; matched: 'yes' | 'no' | 'partial' | 'unknown' };
  recency?: { score: number; weight: number; fresh: boolean };
  total_raw?: number;
  llm_validated?: number;
};

export type TeamRole = 'super_admin' | 'admin' | 'recruiter';
export type TeamStatus = 'active' | 'pending' | 'archived';

export type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: TeamRole;
  status: TeamStatus;
  title: string | null;
  invited_at: string | null;
  joined_at: string | null;
  last_active_at: string | null;
  created_at: string;
};

export type Application = {
  id: string;
  job_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  resume_text: string | null;
  parsed_data: ParsedData | null;
  ats_score: number | null;
  ats_issues: string[] | null;
  matched_skills: string[] | null;
  missing_skills: string[] | null;
  match_summary: string | null;
  score_breakdown: ScoreBreakdown | null;
  source: string;
  parse_status: 'pending' | 'processing' | 'parsed' | 'failed';
  stage: Stage;
  created_at: string;
};
