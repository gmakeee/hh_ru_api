import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { anonymizeCandidateData } from '@/lib/security/anonymizer';
import { HhApiService } from '@/lib/hh/apiClient';
import { getValidAccessToken } from '@/lib/hh/tokenManager';

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
  /** Overall composite score (0-100). */
  score: number;
  /** Free-text evaluation summary. */
  summary: string;
  /** Technical skills score (0-100). Maps to DB column: score_tech. */
  tech_skills: number;
  /** Soft skills score (0-100). Maps to DB column: score_soft. */
  soft_skills: number;
  /** Experience match score (0-100). Maps to DB column: score_exp. */
  experience_match: number;
  /** Exactly 3 personalised technical interview questions targeting weak areas. */
  interview_questions: string[];
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
    // 1. Fetch Config: системный промпт + настройки авто-отказа через JOIN
    const { data: appSettings, error: configError } = await supabaseAdmin
      .from('app_settings')
      .select(`
        active_prompt_id,
        auto_reject_enabled,
        auto_reject_threshold,
        prompts (
          id,
          prompt_text
        )
      `)
      .eq('id', 1)
      .maybeSingle();

    const activePromptId      = appSettings?.active_prompt_id;
    const masterPrompt        = (appSettings?.prompts as any)?.prompt_text;
    const autoRejectEnabled   = (appSettings as any)?.auto_reject_enabled  as boolean ?? false;
    const autoRejectThreshold = (appSettings as any)?.auto_reject_threshold as number ?? 30;

    if (configError || !appSettings || !activePromptId || !masterPrompt) {
      throw new Error(
        'active_prompt is missing in app_settings or database error occurred. ' +
        'Ensure app_settings.active_prompt_id points to a valid row in the prompts table.',
      );
    }

    // NOTE: masterPrompt comes from prompts.prompt_text (via JOIN on active_prompt_id),
    // NOT from app_settings.meta_prompt. The Settings UI writes to the active prompt
    // in the prompts table — if scoring seems to ignore settings changes, verify
    // that active_prompt_id in app_settings matches the prompt being edited.

    // 2. Initialize HH client (token validated / refreshed by tokenManager)
    const hhAccessToken = await getValidAccessToken();
    const hhService     = new HhApiService(hhAccessToken);

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
        const systemPrompt = `${masterPrompt}\n\nCRITICAL INSTRUCTION: You must return ONLY valid JSON containing exactly six fields:\n- "score" (number, 0-100): overall composite score\n- "summary" (string): concise evaluation summary\n- "tech_skills" (number, 0-100): technical skills assessment\n- "soft_skills" (number, 0-100): communication, teamwork, attitude\n- "experience_match" (number, 0-100): relevance of past experience to the role\n- "interview_questions" (array of exactly 3 strings): personalised technical questions targeting the candidate's weakest areas\nExample: {"score": 72, "summary": "...", "tech_skills": 80, "soft_skills": 65, "experience_match": 70, "interview_questions": ["Question 1?", "Question 2?", "Question 3?"]}\nDo not wrap the JSON in markdown blocks (like \`\`\`json) or include any other text.`;

        // Security Step 1.1 — Anonymize PII before data leaves our servers.
        // raw_cv_data / raw_chat_history in the DB are NEVER touched here;
        // we only anonymize the in-transit copy sent to OpenRouter.
        let anonymizedPayload: ReturnType<typeof anonymizeCandidateData>;
        try {
          anonymizedPayload = anonymizeCandidateData(
            candidate.raw_cv_data,
            candidate.raw_chat_history,
          );
        } catch {
          throw new Error('Anonymization failed: could not sanitize candidate data before LLM submission.');
        }

        const userData = JSON.stringify({
          messages: anonymizedPayload.messages,
          resume: anonymizedPayload.resume,
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
        // APP_URL is used as Referer so OpenRouter can attribute usage to this project.
        const appUrl = process.env.APP_URL || 'https://localhost:3000';
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': appUrl,
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
          
          if (
            typeof parsedResult.score            !== 'number' ||
            typeof parsedResult.summary          !== 'string' ||
            typeof parsedResult.tech_skills      !== 'number' ||
            typeof parsedResult.soft_skills      !== 'number' ||
            typeof parsedResult.experience_match !== 'number'
          ) {
            throw new Error(
              'Parsed JSON is missing required multi-criteria score fields. ' +
              'Expected: score (number), summary (string), tech_skills (number), ' +
              'soft_skills (number), experience_match (number).'
            );
          }

          // Validate interview_questions: must be an array of exactly 3 strings.
          const iq = parsedResult.interview_questions;
          if (
            !Array.isArray(iq) ||
            iq.length !== 3 ||
            !iq.every((q) => typeof q === 'string')
          ) {
            throw new Error(
              'Expected exactly 3 interview questions as an array of strings, ' +
              `but received: ${JSON.stringify(iq)}`
            );
          }
        } catch (parseError: any) {
          throw new Error(`Failed to parse LLM output as JSON: ${parseError.message}.`);
        }

        // 6. Auto-Reject branch — evaluated only when feature is enabled
        const shouldAutoReject =
          autoRejectEnabled && parsedResult.score < autoRejectThreshold;

        if (shouldAutoReject) {
          // Attempt HH API rejection — failure is non-fatal for the pipeline.
          try {
            // candidate.hh_negotiation_id is the HH response/отклик ID.
            await hhService.rejectCandidate(candidate.hh_negotiation_id);
          } catch (rejectError: any) {
            // Edge Case: HH rejection API failed (already rejected, network, etc.).
            // Log it but do NOT propagate — we still save our scores locally.
            await logSystemEvent(
              'warning',
              `Auto-reject API call failed for candidate ${candidate.id}. Saving as scored instead.`,
              { error: rejectError.message },
            );
          }
        }

        // 7. Persist scores — status reflects whether rejection succeeded
        const finalStatus = shouldAutoReject ? 'rejected' : 'scored';

        const { error: updateError } = await supabaseAdmin
          .from('candidates')
          .update({
            status:               finalStatus,
            score:                parsedResult.score,
            summary:              parsedResult.summary,
            // Multi-criteria scores — LLM JSON key → DB column mapping:
            score_tech:           parsedResult.tech_skills,
            score_soft:           parsedResult.soft_skills,
            score_exp:            parsedResult.experience_match,
            // JSONB column — Supabase serializes the JS array automatically:
            interview_questions:  parsedResult.interview_questions,
            prompt_id:            activePromptId,
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
