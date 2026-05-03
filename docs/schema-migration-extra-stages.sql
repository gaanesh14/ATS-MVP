-- ============================================
-- Migration: per-job custom pipeline stages
-- Run this in Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================
--
-- Adds an `extra_stages` JSONB column on `jobs` so admins can extend the
-- built-in pipeline (new → shortlisted → interview → hired → rejected) with
-- custom stages — e.g. "Tech screen", "Take-home", "Onsite".
--
-- Shape stored in the column:
--   [
--     { "id": "tech-screen",  "label": "Tech screen",  "color": "cyan" },
--     { "id": "take-home",    "label": "Take-home",    "color": "orange" }
--   ]
--
-- Custom stages render in order, slotted between Interview and Hired.
-- `applications.stage` is already a free-form text column (no CHECK
-- constraint), so it can hold either a built-in id ('new', 'shortlisted',
-- 'interview', 'hired', 'rejected') or any custom stage id.

alter table jobs
  add column if not exists extra_stages jsonb not null default '[]'::jsonb;

-- Backfill: any existing rows with NULL get an empty array (the default
-- handles new rows; this catches anything that pre-existed without one).
update jobs set extra_stages = '[]'::jsonb where extra_stages is null;
