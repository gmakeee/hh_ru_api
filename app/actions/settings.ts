'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { revalidatePath } from 'next/cache';

export interface AppSettings {
  /** Current short-lived access token. Present for both legacy static tokens and OAuth tokens. */
  hh_access_token: string;
  meta_prompt: string;
  active_prompt_id: number | null;
  /** OAuth 2.0 refresh token from HH.ru. Null until the first OAuth login is completed. */
  hh_refresh_token: string | null;
  /** UTC expiry timestamp for hh_access_token. Null for legacy static tokens. */
  hh_token_expires_at: string | null; // ISO-8601 string as returned by Supabase JS client
  /** Whether the auto-rejection feature is active. Defaults to false in the DB. */
  auto_reject_enabled: boolean;
  /** Score threshold (0-100): candidates scoring below this are auto-rejected. */
  auto_reject_threshold: number;
}

export type FormState = {
  success: boolean;
  message: string;
} | null;

export async function getSettings(): Promise<AppSettings | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select(
        'hh_access_token, meta_prompt, active_prompt_id, hh_refresh_token, hh_token_expires_at, auto_reject_enabled, auto_reject_threshold',
      )
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('[getSettings] Database error:', error.message);
      return null;
    }

    return data as AppSettings;
  } catch (err) {
    console.error('[getSettings] Unexpected error:', err);
    return null;
  }
}

export async function updateSystemSettings(prevState: FormState, formData: FormData): Promise<FormState> {
  const hh_access_token = formData.get('hh_access_token')?.toString().trim();
  const meta_prompt     = formData.get('meta_prompt')?.toString().trim();

  // Checkbox: present with value 'on' when checked, absent (null) when unchecked.
  const auto_reject_enabled   = formData.get('auto_reject_enabled') === 'on';
  const thresholdRaw          = formData.get('auto_reject_threshold')?.toString().trim();

  if (!hh_access_token || !meta_prompt) {
    return {
      success: false,
      message: 'Validation Error: Both HH Access Token and Meta Prompt are required.',
    };
  }

  // Validate threshold: must be a whole number in [0, 100].
  const auto_reject_threshold = Number(thresholdRaw);
  if (
    !Number.isInteger(auto_reject_threshold) ||
    auto_reject_threshold < 0 ||
    auto_reject_threshold > 100
  ) {
    return {
      success: false,
      message: 'Validation Error: Rejection threshold must be a whole number between 0 and 100.',
    };
  }

  try {
    const { error } = await supabaseAdmin
      .from('app_settings')
      .update({
        hh_access_token,
        meta_prompt,
        auto_reject_enabled,
        auto_reject_threshold,
        // When saving a token manually, reset the expiry to null.
        // tokenManager.isTokenFresh(null) returns true → treats it as a
        // legacy static token and never attempts to auto-refresh it.
        hh_token_expires_at: null,
      })
      .eq('id', 1);

    if (error) {
      console.error('[updateSettings] Database error:', error.message, error.details);
      return { success: false, message: 'Database Error: Failed to save settings.' };
    }

    revalidatePath('/admin/settings');

    return { success: true, message: 'Settings successfully saved!' };
  } catch (err: any) {
    console.error('[updateSettings] Unexpected error:', err);
    return { success: false, message: 'Internal Server Error' };
  }
}

