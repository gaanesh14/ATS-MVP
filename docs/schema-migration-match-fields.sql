-- ============================================
-- Migration: 6-module match scoring fields
-- Run this in Supabase SQL Editor.
-- Safe to re-run.
-- ============================================

alter table applications
  add column if not exists matched_skills  jsonb,
  add column if not exists missing_skills  jsonb,
  add column if not exists match_summary   text,
  add column if not exists score_breakdown jsonb;

-- score_breakdown shape:
-- {
--   "skill_overlap":   { "score": 32,  "weight": 35, "matched": 4, "required": 5 },
--   "semantic":        { "score": 22,  "weight": 25, "cosine": 0.87 },
--   "experience":      { "score": 15,  "weight": 15, "actual": 6, "required": 4 },
--   "title":           { "score": 10,  "weight": 10, "matched": true },
--   "education":       { "score": 8,   "weight": 10, "matched": "partial" },
--   "recency":         { "score": 5,   "weight": 5,  "fresh": true },
--   "total_raw":       92,
--   "llm_validated":   90
-- }
