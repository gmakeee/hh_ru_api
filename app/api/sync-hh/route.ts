import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { runSyncNew } from '@/lib/sync/syncService';
import { runScoringPipeline } from '@/lib/scoring/scoringService';

// Define the expected request payload structure
interface SyncRequestPayload {
  mode: 'sync_all' | 'sync_new' | 'retry_errors';
}

const VALID_MODES = ['sync_all', 'sync_new', 'retry_errors'];

export async function POST(request: Request) {
  try {
    // Edge Case 2: Unauthorized Access Check
    const authHeader = request.headers.get('authorization');
    const secretKey = process.env.API_SECRET_KEY;

    if (!secretKey) {
      console.error('API_SECRET_KEY is not defined in environment variables.');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Edge Case 3: Malformed Request / Invalid Mode
    if (!body || !body.mode || !VALID_MODES.includes(body.mode)) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          message: 'Missing or invalid "mode" parameter. Valid modes are: sync_all, sync_new, retry_errors.' 
        }, 
        { status: 400 }
      );
    }

    const payload = body as SyncRequestPayload;

    // Supabase client validation
    if (!supabaseAdmin) {
       throw new Error('Supabase admin client failed to initialize');
    }

    // Execution Flow & Mapping based on the selected mode
    switch (payload.mode) {
      case 'sync_all':
        console.log('[sync-hh] Triggered mode: sync_all');
        // TODO: В будущем этот режим может игнорировать проверку наличия в БД для форсированного обновления всех данных.
        // Для MVP работаем аналогично sync_new.
        await runSyncNew();
        await runScoringPipeline();
        break;
        
      case 'sync_new':
        console.log('[sync-hh] Triggered mode: sync_new');
        // Стандартный пайплайн
        // 1. Скачиваем новые отклики с hh.ru и кладем в БД со статусом pending
        await runSyncNew();
        // 2. Сразу берем батч из 5 (максимум) pending кандидатов и прогоняем через LLM
        await runScoringPipeline();
        break;
        
      case 'retry_errors':
        console.log('[sync-hh] Triggered mode: retry_errors');
        // Пайплайн восстановления:
        // Нам не нужно обращаться к HH API, достаточно просто дернуть скоринг,
        // так как он сам цепляет кандидатов со статусом 'error' и retry_count < 3
        await runScoringPipeline();
        break;
        
      default:
        // Недостижимо благодаря валидации выше
        break;
    }

    return NextResponse.json(
      { 
        success: true, 
        message: `Successfully executed pipeline in '${payload.mode}' mode.`,
        mode: payload.mode
      },
      { status: 200 }
    );

  } catch (error: any) {
    // Внешний try/catch защищает эндпоинт от падения
    // и гарантирует возврат чистого 500 статуса при критических ошибках
    console.error('[sync-hh] Unhandled execution error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
