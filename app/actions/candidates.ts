'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { triggerScoringJob } from '@/lib/queue/qstashClient';
import { revalidatePath } from 'next/cache';

export async function forceScoreCandidate(candidateId: string) {
  try {
    // 1. Сброс состояния кандидата: ставим 'pending' и обнуляем ретраи
    const { error: updateError } = await supabaseAdmin
      .from('candidates')
      .update({
        status: 'pending',
        retry_count: 0
      })
      .eq('id', candidateId);

    if (updateError) {
      console.error('[forceScoreCandidate] Database update failed:', updateError.message);
      return { success: false, message: 'Database Error: Failed to reset candidate status.' };
    }

    // 2. Публикуем задачу в QStash — он асинхронно запустит LLM-скоринг через /api/queue/score
    try {
      await triggerScoringJob();
    } catch (publishError: any) {
      // Логируем в консоль Vercel, но возвращаем чистую ошибку клиенту
      console.error('[forceScoreCandidate] Failed to publish scoring job to QStash:', publishError);
      return { success: false, message: 'Failed to enqueue scoring job. Please try again.' };
    }

    // 3. Инвалидация кэша для обновления UI таблицы
    revalidatePath('/admin');
    
    return { success: true, message: 'Success' };

  } catch (error: any) {
    console.error('[forceScoreCandidate] Unexpected execution error:', error);
    return { success: false, message: 'Internal Server Error' };
  }
}
