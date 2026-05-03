-- ============================================
-- Migration: candidate self-reported fields
-- Run this in Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================
--
-- Adds two stable columns on `applications` to capture what the candidate
-- types into the apply form. These are independent of `parsed_data`, which
-- is owned by the resume parser and gets overwritten on every parse run.
--
--   applicant_location           — city the candidate lives in
--   applicant_experience_years   — years of professional experience claimed
--
-- The recruiter dashboard can show both values side-by-side when they
-- disagree with the parser's extracted values, e.g.:
--   "Self-reported: Bangalore · Resume: Hyderabad"

alter table applications
  add column if not exists applicant_location text;

alter table applications
  add column if not exists applicant_experience_years numeric;

-- Index location for fast LIKE filters on the candidates list.
create index if not exists applications_applicant_location_idx
  on applications (applicant_location);
