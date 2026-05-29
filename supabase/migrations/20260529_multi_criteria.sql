-- =============================================================================
-- Migration: Multi-criteria LLM scoring columns for candidates table
-- Target table: public.candidates
--
-- Adds three granular score columns alongside the existing overall `score`.
-- All columns are nullable so existing rows remain valid before re-evaluation.
-- Safe to run multiple times — ADD COLUMN IF NOT EXISTS is fully idempotent.
-- =============================================================================

-- Technical skills score (0-100) — maps from LLM JSON key: tech_skills
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS score_tech INTEGER NULL;

-- Soft skills score (0-100) — maps from LLM JSON key: soft_skills
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS score_soft INTEGER NULL;

-- Experience match score (0-100) — maps from LLM JSON key: experience_match
ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS score_exp  INTEGER NULL;

-- =============================================================================
-- Verification query (run after migration to confirm all score columns exist):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'candidates'
--    AND column_name  LIKE 'score%'
--  ORDER BY ordinal_position;
-- =============================================================================
