-- =============================================================================
-- Migration: AI-generated interview questions for candidates table
-- Target table: public.candidates
--
-- JSONB is chosen over TEXT[] because:
--   1. It enables future querying/indexing on individual question elements.
--   2. The Supabase JS client deserializes it automatically to a JS array,
--      requiring no manual JSON.parse() on the application side.
--
-- Nullable — existing rows remain valid; questions are populated on next score.
-- Idempotent — ADD COLUMN IF NOT EXISTS is safe to run multiple times.
-- =============================================================================

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS interview_questions JSONB NULL;

-- =============================================================================
-- Verification query (run after migration):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'candidates'
--    AND column_name  = 'interview_questions';
-- =============================================================================
