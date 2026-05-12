import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Tenant. Every row in the dashboard belongs to one organization. The
// `org_id` foreign key is added by docs/schema-migration-multi-tenancy.sql
// and is used by RLS policies + the `current_org_id()` Postgres function.
export type Organization = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

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
  org_id: string;
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
  org_id: string;
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
  org_id: string;
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

export type InterviewStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type InterviewMeetingProvider =
  | 'jitsi'
  | 'google_meet'
  | 'manual'
  | 'none';

export type InterviewParticipant = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
};

export type Interview = {
  id: string;
  org_id: string;
  application_id: string;
  job_id: string;
  scheduled_by: string | null;
  candidate_email: string;
  candidate_name: string;
  scheduled_at: string;
  duration_minutes: number;
  timezone: string;
  status: InterviewStatus;
  meeting_provider: InterviewMeetingProvider;
  meeting_link: string | null;
  // Populated when meeting_provider='google_meet' and the scheduling
  // recruiter has connected their Google account. Used by reschedule and
  // cancel paths to patch/delete the right Calendar event instead of
  // orphaning one and creating a duplicate. Added by
  // docs/schema-migration-google-integration.sql.
  google_calendar_event_id: string | null;
  participants: InterviewParticipant[];
  notes: string | null;
  reminder_sent_at: string | null;
  reminder_24h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

// Per-recruiter Google OAuth state. Mirrors recruiter_google_tokens added by
// docs/schema-migration-google-integration.sql. The encrypted_* columns are
// only ever read on the server (see lib/crypto.ts); the client should call
// /api/integrations/google to find out whether the current user is connected.
export type RecruiterGoogleTokens = {
  id: string;
  team_member_id: string;
  org_id: string;
  encrypted_refresh_token: string;
  encrypted_access_token: string | null;
  access_token_expires_at: string | null;
  google_email: string;
  scopes: string[];
  connected_at: string;
  updated_at: string;
};

export type Application = {
  id: string;
  org_id: string;
  job_id: string;
  // Optimistic-concurrency token bumped on every UPDATE by a Postgres
  // trigger. Stage-change endpoints compare-and-swap on (id, version) so
  // two recruiters moving the same candidate at the same time can't both
  // succeed silently — the second one's update no-ops and the UI refreshes.
  version: number;
  updated_at: string;
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
