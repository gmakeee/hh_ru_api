'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { revalidatePath } from 'next/cache';

export interface AppSettings {
  hh_access_token: string;
  master_prompt: string;
}

// Тип для состояния ответа Server Action
export type FormState = {
  success: boolean;
  message: string;
} | null;

/**
 * Получает настройки приложения из БД
 */
export async function getSettings(): Promise<AppSettings | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('hh_access_token, master_prompt')
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

/**
 * Обновляет настройки приложения. Вызывается как Server Action.
 */
export async function updateSettings(prevState: FormState, formData: FormData): Promise<FormState> {
  const hh_access_token = formData.get('hh_access_token')?.toString().trim();
  const master_prompt = formData.get('master_prompt')?.toString().trim();

  // Edge Case 1: Empty Submissions
  // Серверная валидация, если клиентская HTML5 валидация была проигнорирована
  if (!hh_access_token || !master_prompt) {
    return {
      success: false,
      message: 'Validation Error: Both HH Access Token and Master Prompt are required.',
    };
  }

  try {
    // Edge Case 2: Database Update Failure
    const { error } = await supabaseAdmin
      .from('app_settings')
      .update({
        hh_access_token,
        master_prompt,
      })
      .eq('id', 1);

    if (error) {
      // Логируем ошибку безопасно на сервере
      console.error('[updateSettings] Database error:', error.message, error.details);
      
      return {
        success: false,
        message: 'Database Error: Failed to save settings. Please try again later.',
      };
    }

    // Очищаем кэш Next.js для страницы настроек
    revalidatePath('/admin/settings');
    
    return {
      success: true,
      message: 'Settings successfully saved!',
    };
  } catch (err: any) {
    console.error('[updateSettings] Unexpected error:', err);
    return {
      success: false,
      message: 'Internal Server Error: ' + (err.message || 'Unknown error occurred'),
    };
  }
}
