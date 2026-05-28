'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { runScoringPipeline } from '@/lib/scoring/scoringService';
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

    // 2. Принудительный запуск пайплайна
    // Edge Case 3 (Action Timeout/Failure): Перехватываем ошибки внутри самого пайплайна
    try {
      // Это вызовет пайплайн, который немедленно найдет нашего 'pending' кандидата
      await runScoringPipeline();
    } catch (pipelineError: any) {
      // Логируем в консоль Vercel, но возвращаем красивую ошибку клиенту
      console.error('[forceScoreCandidate] Scoring pipeline failed during manual trigger:', pipelineError);
      return { success: false, message: 'LLM Pipeline Failed. Check system logs.' };
    }

    // 3. Инвалидация кэша для обновления UI таблицы
    revalidatePath('/admin');
    
    return { success: true, message: 'Success' };

  } catch (error: any) {
    console.error('[forceScoreCandidate] Unexpected execution error:', error);
    return { success: false, message: 'Internal Server Error' };
  }
}
