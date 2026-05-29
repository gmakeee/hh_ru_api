/**
 * @file lib/hh/tokenManager.ts
 * @description OAuth 2.0 Token Lifecycle Manager for the HeadHunter API.
 *
 * Single responsibility: return a guaranteed-valid HH access token to the
 * caller, transparently refreshing and persisting it when necessary.
 *
 * SECURITY RULES enforced here:
 *  - Access tokens and refresh tokens are NEVER written to any log output.
 *  - Env-var credentials are validated before every refresh attempt.
 *  - A failed DB write after a successful token refresh throws immediately —
 *    we never silently discard a new refresh token (that would permanently
 *    break the auth cycle).
 */

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { HhAuthError } from '@/lib/hh/apiClient';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum remaining lifetime (ms) required to consider a token "still valid".
 *  If the token expires within this window we proactively refresh it so the
 *  in-flight API call never hits an expired token mid-request. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/** HH.ru OAuth 2.0 token endpoint. */
const HH_TOKEN_URL = 'https://hh.ru/oauth/token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Columns we need from app_settings to evaluate token health. */
interface TokenSettings {
  hh_access_token: string;
  hh_refresh_token: string | null;
  hh_token_expires_at: string | null;
}

/** Shape of a successful HH.ru OAuth token response. */
interface HhTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Lifetime of the new access_token in seconds. */
  expires_in: number;
  token_type: string;
}

/** Payload written back to app_settings after a successful refresh. */
interface TokenUpdatePayload {
  hh_access_token: string;
  hh_refresh_token: string;
  hh_token_expires_at: string; // ISO-8601 UTC
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Loads the three token-related columns from `app_settings` row id = 1.
 * Throws if the row is missing or the access token is empty.
 */
async function fetchTokenSettings(): Promise<TokenSettings> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('hh_access_token, hh_refresh_token, hh_token_expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[tokenManager] Database error fetching token settings: ${error.message}`,
    );
  }

  if (!data || !data.hh_access_token) {
    throw new HhAuthError(
      '[tokenManager] hh_access_token is missing from app_settings. ' +
        'Complete the OAuth login flow first.',
    );
  }

  return data as TokenSettings;
}

/**
 * Returns true when the token is still valid with the 5-minute buffer applied.
 *
 * @param expiresAt - ISO-8601 string stored in app_settings, or null for
 *                    legacy static tokens (which are considered always valid).
 */
function isTokenFresh(expiresAt: string | null): boolean {
  // Legacy static token: no expiry tracked — caller must treat it as valid.
  if (expiresAt === null) return true;

  const expiryMs = new Date(expiresAt).getTime();
  const nowMs    = Date.now();

  // Valid if more than EXPIRY_BUFFER_MS remains before expiry.
  return expiryMs - nowMs > EXPIRY_BUFFER_MS;
}

/**
 * Reads OAuth application credentials from environment variables.
 * Throws a descriptive error if either variable is absent.
 */
function requireOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId     = process.env.HH_CLIENT_ID;
  const clientSecret = process.env.HH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Edge Case 1: Env vars missing — throw a hard error so the pipeline
    // knows this is a configuration problem, not a transient network issue.
    throw new Error(
      '[tokenManager] CRITICAL: HH_CLIENT_ID and/or HH_CLIENT_SECRET ' +
        'environment variables are not set. Cannot perform token refresh.',
    );
  }

  return { clientId, clientSecret };
}

/**
 * Calls the HH.ru token endpoint to exchange the refresh token for a new
 * access/refresh token pair.
 *
 * @param refreshToken - The current refresh token stored in app_settings.
 * @returns Parsed HhTokenResponse on success.
 * @throws HhAuthError when HH returns a 4xx (token revoked / expired).
 * @throws Error for unexpected network or server failures.
 */
async function callHhRefreshEndpoint(
  refreshToken: string,
): Promise<HhTokenResponse> {
  const { clientId, clientSecret } = requireOAuthCredentials();

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     clientId,
    client_secret: clientSecret,
  });

  let response: Response;
  try {
    response = await fetch(HH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
  } catch (networkError: any) {
    throw new Error(
      `[tokenManager] Network error reaching HH token endpoint: ${networkError.message}`,
    );
  }

  if (!response.ok) {
    // Edge Case 2: 4xx from HH — refresh token is revoked or the app credentials
    // are wrong. Signal with HhAuthError so callers can stop retrying and alert.
    if (response.status >= 400 && response.status < 500) {
      // Safe log: we include the status code only, never the token values.
      throw new HhAuthError(
        `[tokenManager] HH OAuth refresh rejected with HTTP ${response.status}. ` +
          'The refresh token may be revoked or expired. Re-authentication required.',
      );
    }

    throw new Error(
      `[tokenManager] HH token endpoint returned unexpected HTTP ${response.status}.`,
    );
  }

  let parsed: HhTokenResponse;
  try {
    parsed = (await response.json()) as HhTokenResponse;
  } catch {
    throw new Error(
      '[tokenManager] Failed to parse JSON from HH token endpoint response.',
    );
  }

  if (!parsed.access_token || !parsed.refresh_token || !parsed.expires_in) {
    throw new Error(
      '[tokenManager] HH token response is missing required fields ' +
        '(access_token, refresh_token, or expires_in).',
    );
  }

  return parsed;
}

/**
 * Persists the freshly obtained token set to app_settings row id = 1.
 *
 * Edge Case 3: If this write fails we MUST throw — losing the new
 * refresh_token would permanently break the auth cycle.
 */
async function persistNewTokens(payload: TokenUpdatePayload): Promise<void> {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .update({
      hh_access_token:    payload.hh_access_token,
      hh_refresh_token:   payload.hh_refresh_token,
      hh_token_expires_at: payload.hh_token_expires_at,
    })
    .eq('id', 1);

  if (error) {
    // Edge Case 3: DB write failed after a successful token refresh.
    // NEVER silently swallow this — log the DB error (safe: no token values)
    // and throw so the caller aborts rather than using a token we cannot track.
    throw new Error(
      '[tokenManager] CRITICAL: Received new tokens from HH but failed to ' +
        `persist them to app_settings: ${error.message}. ` +
        'The refresh token has been consumed and cannot be recovered. ' +
        'Manual re-authentication via the OAuth flow is required.',
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a valid HH.ru access token, refreshing it transparently if it is
 * expired (or about to expire within 5 minutes).
 *
 * **Decision tree:**
 * ```
 * hh_token_expires_at IS NULL  →  legacy static token, return as-is
 * token expires > 5 min away   →  return existing hh_access_token
 * token expires ≤ 5 min away
 *   hh_refresh_token available →  refresh → persist → return new token
 *   hh_refresh_token is null   →  throw HhAuthError (cannot refresh)
 * ```
 *
 * @returns The current (or newly refreshed) HH access token.
 *
 * @throws {HhAuthError}  When the token needs refreshing but no refresh token
 *                         is stored, or when HH rejects the refresh request.
 * @throws {Error}        For configuration problems (missing env vars),
 *                         network failures, or DB persistence failures.
 *
 * @example
 * ```typescript
 * import { getValidAccessToken } from '@/lib/hh/tokenManager';
 * import { HhApiService }        from '@/lib/hh/apiClient';
 *
 * const token    = await getValidAccessToken();
 * const hhClient = new HhApiService(token);
 * ```
 */
export async function getValidAccessToken(): Promise<string> {
  const settings = await fetchTokenSettings();

  // Fast path: token is fresh (or is a legacy static token with no expiry).
  if (isTokenFresh(settings.hh_token_expires_at)) {
    return settings.hh_access_token;
  }

  // Token is stale — attempt a refresh.
  if (!settings.hh_refresh_token) {
    throw new HhAuthError(
      '[tokenManager] The HH access token has expired and no refresh token is ' +
        'stored in app_settings. Re-authentication via the OAuth flow is required.',
    );
  }

  console.info(
    '[tokenManager] Access token is expired or expiring soon. Attempting refresh…',
  );

  // Exchange the refresh token for a new pair.
  const tokenResponse = await callHhRefreshEndpoint(settings.hh_refresh_token);

  // Calculate the new absolute expiry timestamp.
  const newExpiresAt = new Date(
    Date.now() + tokenResponse.expires_in * 1_000,
  ).toISOString();

  // Persist to DB — throws on failure (see Edge Case 3 above).
  await persistNewTokens({
    hh_access_token:    tokenResponse.access_token,
    hh_refresh_token:   tokenResponse.refresh_token,
    hh_token_expires_at: newExpiresAt,
  });

  console.info(
    `[tokenManager] Token successfully refreshed. New expiry: ${newExpiresAt}`,
  );

  return tokenResponse.access_token;
}
