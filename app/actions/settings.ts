'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { revalidatePath } from 'next/cache';

export interface AppSettings {
  hh_access_token: string;
  meta_prompt: string;
  active_prompt_id: number | null;
}

export type FormState = {
  success: boolean;
  message: string;
} | null;

export async function getSettings(): Promise<AppSettings | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('hh_access_token, meta_prompt, active_prompt_id')
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
  const meta_prompt = formData.get('meta_prompt')?.toString().trim();

  if (!hh_access_token || !meta_prompt) {
    return {
      success: false,
      message: 'Validation Error: Both HH Access Token and Meta Prompt are required.',
    };
  }

  try {
    const { error } = await supabaseAdmin
      .from('app_settings')
      .update({
        hh_access_token,
        meta_prompt,
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
