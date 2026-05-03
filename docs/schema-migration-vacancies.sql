-- ============================================
-- Migration: add `vacancies` column to jobs
-- Run this in Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================

alter table jobs
  add column if not exists vacancies int not null default 1;

-- Backfill existing rows that may have come in as null before the default
update jobs set vacancies = 1 where vacancies is null;
