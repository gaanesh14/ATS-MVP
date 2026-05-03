-- ============================================
-- Migration: add stage column to applications
-- Run this in Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================

alter table applications
  add column if not exists stage text not null default 'new';

-- Optional: enforce known values via a CHECK constraint.
-- (Skipped here for flexibility — you can add it later.)
-- alter table applications
--   add constraint applications_stage_check
--   check (stage in ('new', 'shortlisted', 'interview', 'hired', 'rejected'));

-- Backfill: set all existing rows to 'new' if any had nulls before the default.
update applications set stage = 'new' where stage is null;

-- Index for fast filtering by stage in the dashboard
create index if not exists applications_stage_idx on applications(stage);
