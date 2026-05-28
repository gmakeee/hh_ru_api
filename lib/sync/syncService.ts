import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { HhApiService, HhAuthError } from '@/lib/hh/apiClient';
import { sleep } from '@/lib/utils/sleep';

/**
 * Вспомогательная утилита для логирования событий в таблицу system_logs
 */
async function logSystemEvent(level: 'info' | 'warning' | 'error', message: string, details?: any) {
  try {
    await supabaseAdmin.from('system_logs').insert({
      level,
      message,
      details: details || {},
      created_at: new Date().toISOString(),
    });
    // Дублируем в консоль для видимости в логах сервера (Vercel/Node.js)
    console[level === 'warning' ? 'warn' : level](`[syncService] ${message}`, details || '');
  } catch (err) {
    console.error('[syncService] Failed to write to system_logs table:', err);
  }
}

/**
 * Запускает процесс синхронизации для новых кандидатов.
 */
export async function runSyncNew(): Promise<void> {
  await logSystemEvent('info', 'Starting runSyncNew pipeline.');

  try {
    // 1. Fetch Config: Получаем hh_access_token из app_settings
    const { data: appSettings, error: configError } = await supabaseAdmin
      .from('app_settings')
      .select('hh_access_token')
      .eq('id', 1)
      .maybeSingle();

    if (configError || !appSettings || !appSettings.hh_access_token) {
      await logSystemEvent(
        'error', 
        'Failed to retrieve hh_access_token from app_settings. Run terminated.', 
        configError || 'Token missing or empty'
      );
      return;
    }

    // 2. Initialize Client: Создаем инстанс сервиса hh.ru
    const hhService = new HhApiService(appSettings.hh_access_token);

    // 3. Fetch Negotiations: Получаем список активных откликов
    const negotiations = await hhService.getNegotiations();
    
    if (!negotiations || negotiations.length === 0) {
      await logSystemEvent('info', 'No active negotiations found. Pipeline finished.');
      return;
    }

    let processedCount = 0;
    let newCandidatesCount = 0;

    // 4. Sequential Processing: Строго for...of, чтобы избежать Rate Limit
    for (const negotiation of negotiations) {
      processedCount++;
      
      try {
        // Check DB: Проверяем, существует ли уже кандидат в базе
        const { data: existingCandidate, error: dbError } = await supabaseAdmin
          .from('candidates')
          .select('id')
          .eq('hh_negotiation_id', negotiation.id)
          .maybeSingle(); // maybeSingle не бросит ошибку, если вернется 0 строк

        if (dbError) {
          await logSystemEvent('warning', `Database error checking candidate ${negotiation.id}`, dbError);
          continue;
        }

        if (existingCandidate) {
          // Кандидат уже есть в базе, пропускаем
          continue;
        }

        // Fetch Details & Insert: Кандидат новый, скачиваем детали
        newCandidatesCount++;
        
        // Скачиваем историю переписки
        const messages = await hhService.getMessages(negotiation.id);

        // Скачиваем резюме, если есть URL/ID
        let resumeData = null;
        if (negotiation.resume && negotiation.resume.id) {
            resumeData = await hhService.getResume(negotiation.resume.id);
        }

        // Вставляем новую запись в БД
        const { error: insertError } = await supabaseAdmin
          .from('candidates')
          .insert({
            hh_negotiation_id: negotiation.id,
            status: 'pending',
            raw_data: {
              negotiation: negotiation,
              messages: messages,
              resume: resumeData
            },
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
        }

        // Искусственное троттлирование: ждем 500мс после добавления нового кандидата
        await sleep(500);

      } catch (candidateError: any) {
        // Edge Case: Протухший токен (HhAuthError)
        // Пробрасываем наверх, чтобы прервать ВЕСЬ процесс синхронизации
        if (candidateError instanceof HhAuthError) {
          throw candidateError; 
        }

        // Edge Case: Изолированная ошибка при получении сообщений, резюме или вставке в БД
        await logSystemEvent(
          'warning', 
          `Failed to process candidate ${negotiation.id}. Skipping.`, 
          candidateError?.message || candidateError
        );
        // Продолжаем цикл для остальных кандидатов
        continue;
      }
    }

    // Логируем успешное завершение
    await logSystemEvent(
      'info', 
      `Successfully finished runSyncNew pipeline. Scanned: ${processedCount}. New added: ${newCandidatesCount}.`
    );

  } catch (error: any) {
    // Обработка критических ошибок, прерывающих пайплайн (например, протух токен)
    if (error instanceof HhAuthError) {
      await logSystemEvent('error', 'HH Token Expired/Invalid. Synchronization gracefully terminated.', error.message);
      return;
    }

    await logSystemEvent('error', 'Unhandled error in runSyncNew pipeline.', error?.message || error);
  }
}
