-- =============================================================================
-- Migration: Message dispatch status for candidates table
-- Target table: public.candidates
--
-- Tracks whether an automated message has been sent to a candidate.
-- Nullable — null means no message action has been taken (the default state
-- for all existing rows; no backfill required).
-- Idempotent — ADD COLUMN IF NOT EXISTS is safe to run multiple times.
-- =============================================================================

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS message_status TEXT NULL;

-- Optional constraint: only allow known status values (comment out if you
-- want to keep the column free-form for forward-compatibility).
-- ALTER TABLE public.candidates
--   ADD CONSTRAINT candidates_message_status_check
--   CHECK (message_status IN ('queued', 'sent', 'failed'));

-- =============================================================================
-- Verification query (run after migration):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'candidates'
--    AND column_name  = 'message_status';
-- =============================================================================
