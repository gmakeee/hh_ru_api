-- =============================================================================
-- Migration: Auto-rejection configuration columns for app_settings
-- Target table: public.app_settings
--
-- Idempotent — ADD COLUMN IF NOT EXISTS is safe to run multiple times.
-- Default values ensure the feature is OFF with a sane threshold on existing rows.
-- =============================================================================

-- 1. Feature toggle — defaults to false so auto-rejection is opt-in.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS auto_reject_enabled BOOLEAN NOT NULL DEFAULT false;

-- 2. Score threshold (0-100) — candidates scoring below this value are rejected.
--    Defaults to 30, matching the product spec.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS auto_reject_threshold INTEGER NOT NULL DEFAULT 30;

-- =============================================================================
-- Verification query (run after migration):
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'app_settings'
--    AND column_name  IN ('auto_reject_enabled', 'auto_reject_threshold')
--  ORDER BY ordinal_position;
-- =============================================================================
