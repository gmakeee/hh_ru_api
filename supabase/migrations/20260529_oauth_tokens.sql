-- =============================================================================
-- Migration: OAuth 2.0 token storage for HH.ru API
-- Target table: public.app_settings
--
-- Safe to run multiple times — ADD COLUMN IF NOT EXISTS prevents duplicate
-- column errors. The existing hh_access_token column is NOT dropped.
-- =============================================================================

-- 1. Refresh token issued by HH.ru during the OAuth 2.0 Authorization Code
--    flow. Nullable so existing rows remain valid before the first OAuth login.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS hh_refresh_token TEXT NULL;

-- 2. UTC expiry timestamp for the current hh_access_token.
--    The token refresh logic will compare NOW() against this value to decide
--    whether a proactive refresh is required.
--    Nullable for backward compatibility with the current static token.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS hh_token_expires_at TIMESTAMP WITH TIME ZONE NULL;

-- =============================================================================
-- Verification query (run after migration to confirm columns exist):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'app_settings'
--    AND column_name  IN ('hh_access_token', 'hh_refresh_token', 'hh_token_expires_at')
--  ORDER BY ordinal_position;
-- =============================================================================
