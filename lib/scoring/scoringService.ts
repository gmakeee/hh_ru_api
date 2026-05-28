import { supabaseAdmin } from '@/lib/supabase/adminClient';

// OpenRouter Interfaces для строгой типизации
interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  response_format?: { type: 'json_object' };
}

interface OpenRouterResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  error?: {
    message: string;
  };
}

interface CandidateScoringResult {
  score: number;
  summary: string;
}

/**
 * Вспомогательная утилита для логирования
 */
async function logSystemEvent(level: 'info' | 'warning' | 'error', message: string, details?: any) {
  try {
    await supabaseAdmin.from('system_logs').insert({
      level,
      message,
      details: details || {},
      created_at: new Date().toISOString(),
    });
    console[level === 'warning' ? 'warn' : level](`[scoringService] ${message}`);
  } catch (err) {
    console.error('[scoringService] Failed to write to system_logs:', err);
  }
}

export async function runScoringPipeline(): Promise<void> {
  await logSystemEvent('info', 'Starting runScoringPipeline.');

  try {
    // 1. Fetch Config: Получаем системный промпт через JOIN
    const { data: appSettings, error: configError } = await supabaseAdmin
      .from('app_settings')
      .select(`
        active_prompt_id,
        prompts (
          id,
          prompt_text
        )
      `)
      .eq('id', 1)
      .maybeSingle();

    const activePromptId = appSettings?.active_prompt_id;
    const masterPrompt = (appSettings?.prompts as any)?.prompt_text;

    if (configError || !appSettings || !activePromptId || !masterPrompt) {
      throw new Error('active_prompt is missing in app_settings or database error occurred.');
    }

    // 2. Fetch API Key
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is missing.');
    }

    // 3. Fetch Candidates (Batching: Limit 5)
    // Выбираем тех, кто 'pending' ИЛИ упал с ошибкой ('error'), но попыток < 3
    const { data: candidates, error: fetchError } = await supabaseAdmin
      .from('candidates')
      .select('*')
      .or('status.eq.pending,and(status.eq.error,retry_count.lt.3)')
      .limit(5);

    if (fetchError) throw fetchError;

    if (!candidates || candidates.length === 0) {
      await logSystemEvent('info', 'No candidates require scoring. Pipeline finished.');
      return;
    }

    let processedCount = 0;

    // 4. Process Batch Sequentially
    for (const candidate of candidates) {
      processedCount++;
      let rawLlmOutput = '';

      try {
        // State Update (Processing)
        // Блокируем кандидата, чтобы другие воркеры его не схватили
        await supabaseAdmin
          .from('candidates')
          .update({ status: 'processing' })
          .eq('id', candidate.id);

        // LLM Payload Construction
        // Инструктируем модель возвращать СТРОГО JSON
        const systemPrompt = `${masterPrompt}\n\nCRITICAL INSTRUCTION: You must return ONLY valid JSON containing two fields: "score" (a number) and "summary" (a string). Do not wrap the JSON in markdown blocks (like \`\`\`json) or include any other text.`;
        
        const userData = JSON.stringify({
          messages: candidate.raw_data?.messages || [],
          resume: candidate.raw_data?.resume || null
        });

        const requestPayload: OpenRouterRequest = {
          model: 'openai/gpt-4o-mini', // Выбран быстрый и надежный MVP-модель
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userData }
          ],
          response_format: { type: 'json_object' } // Поддерживается OpenAI моделями на OpenRouter
        };

        // OpenRouter API Call
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://candidate-scorer.local', // Обязательное поле для OpenRouter
            'X-Title': 'Candidate Scorer Pipeline' 
          },
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
           const errorText = await response.text();
           throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
        }

        const responseData: OpenRouterResponse = await response.json();

        if (responseData.error) {
           throw new Error(`OpenRouter returned an error: ${responseData.error.message}`);
        }

        rawLlmOutput = responseData.choices?.[0]?.message?.content || '';
        if (!rawLlmOutput) throw new Error('Empty response received from LLM.');

        // 5. Parse and Save (The "Broken World" scenarios)
        let parsedResult: CandidateScoringResult;
        try {
          // Очищаем потенциальные markdown-теги, если модель все же "сгаллюцинировала" их
          const cleanedOutput = rawLlmOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
          parsedResult = JSON.parse(cleanedOutput);
          
          if (typeof parsedResult.score !== 'number' || typeof parsedResult.summary !== 'string') {
             throw new Error('Parsed JSON does not contain the required "score" (number) or "summary" (string) fields.');
          }
        } catch (parseError: any) {
          throw new Error(`Failed to parse LLM output as JSON: ${parseError.message}.`);
        }

        // Успешное обновление статуса
        const { error: updateError } = await supabaseAdmin
          .from('candidates')
          .update({
            status: 'scored',
            score: parsedResult.score,
            summary: parsedResult.summary,
            prompt_id: activePromptId
          })
          .eq('id', candidate.id);

        if (updateError) throw updateError;

      } catch (candidateError: any) {
        // Failure Recovery
        const currentRetryCount = candidate.retry_count || 0;
        const newRetryCount = currentRetryCount + 1;
        const newStatus = newRetryCount >= 3 ? 'fatal_error' : 'error';

        await logSystemEvent('warning', `Candidate ${candidate.id} scoring failed. Status updated to ${newStatus}.`, {
          error: candidateError.message,
          rawLlmOutput: rawLlmOutput
        });

        // Сохраняем счетчик попыток и статус ошибки
        await supabaseAdmin
          .from('candidates')
          .update({
            status: newStatus,
            retry_count: newRetryCount
          })
          .eq('id', candidate.id);

        // Используем continue, чтобы не обвалить весь батч
        continue;
      }
    }

    await logSystemEvent('info', `Successfully finished runScoringPipeline. Processed batch of ${processedCount} candidates.`);

  } catch (globalError: any) {
    await logSystemEvent('error', 'Unhandled error in runScoringPipeline.', globalError?.message || globalError);
  }
}
