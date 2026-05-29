import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { HhApiService } from '@/lib/hh/apiClient';
import { getValidAccessToken } from '@/lib/hh/tokenManager';
import { type MessageJobPayload } from '@/lib/queue/qstashClient';

/**
 * POST /api/queue/message
 *
 * QStash receiver endpoint for the candidate message broadcast pipeline.
 *
 * Security model:
 *   Identical to /api/queue/score — verifySignatureAppRouter validates the
 *   Upstash-Signature header before our handler code ever runs.
 *
 * Retry contract with QStash:
 *   CRITICAL DESIGN DECISION — this handler ALWAYS returns 200 OK:
 *
 *   Unlike the scoring receiver (which returns 500 for transient LLM errors
 *   to trigger QStash retries), message failures here are often PERMANENT:
 *     - 403: candidate blocked employer messages
 *     - 404: negotiation no longer exists
 *     - The candidate already received the message (idempotency risk)
 *
 *   Returning 500 in these cases would cause infinite retry loops, wasting
 *   queue quota and spamming candidates. Instead:
 *     - Permanent failures → DB status = 'failed', return 200
 *     - Success           → DB status = 'sent',   return 200
 *
 *   The 'failed' status surfaces in the Admin Dashboard for manual review.
 */

// ─── Message construction helpers ─────────────────────────────────────────────

/** Minimum message length HH.ru requires (guard against empty sends). */
const MIN_MESSAGE_LENGTH = 5;

/**
 * Builds a polite formatted message from the candidate's AI-generated
 * interview questions. Falls back to a generic message if no questions exist.
 */
function buildQuestionsMessage(questions: string[] | null): string {
  if (!questions || questions.length === 0) {
    return (
      'Здравствуйте!\n\n' +
      'Спасибо за ваш отклик. Мы ознакомились с вашим резюме и хотели бы ' +
      'пригласить вас на следующий этап отбора. Пожалуйста, свяжитесь с нами ' +
      'для уточнения деталей.\n\n' +
      'С уважением,\nКоманда найма'
    );
  }

  const numbered = questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  return (
    'Здравствуйте!\n\n' +
    'Спасибо за ваш отклик. Мы изучили ваше резюме и подготовили несколько ' +
    'вопросов, которые помогут нам лучше оценить ваш опыт:\n\n' +
    `${numbered}\n\n` +
    'Будем рады получить ваши ответы в этом чате или на встрече.\n\n' +
    'С уважением,\nКоманда найма'
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function handler(request: Request): Promise<Response> {
  // ── 1. Parse payload ──────────────────────────────────────────────────────
  let payload: MessageJobPayload;
  try {
    payload = await request.json() as MessageJobPayload;
  } catch {
    // Malformed JSON — not retriable; drop with 200.
    console.error('[queue/message] Failed to parse request body as JSON.');
    return NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 200 });
  }

  const { candidateId, customMessage } = payload;

  if (!candidateId) {
    console.error('[queue/message] Missing candidateId in payload.');
    return NextResponse.json({ success: false, error: 'Missing candidateId.' }, { status: 200 });
  }

  // ── 2. Fetch candidate from DB ────────────────────────────────────────────
  const { data: candidate, error: fetchError } = await supabaseAdmin
    .from('candidates')
    .select('id, hh_negotiation_id, interview_questions, message_status')
    .eq('id', candidateId)
    .maybeSingle();

  if (fetchError) {
    // DB error — could be transient, but we return 200 to avoid infinite retries.
    console.error(`[queue/message] DB fetch error for candidate ${candidateId}:`, fetchError.message);
    return NextResponse.json({ success: false, error: 'Database fetch failed.' }, { status: 200 });
  }

  if (!candidate) {
    // Ghost job — candidate was deleted between scheduling and delivery.
    console.warn(`[queue/message] Candidate ${candidateId} not found. Dropping job.`);
    return NextResponse.json({ success: true, message: 'Candidate not found — job dropped.' }, { status: 200 });
  }

  // ── 3. Construct message ──────────────────────────────────────────────────
  let finalMessage: string;

  if (customMessage && customMessage.trim().length >= MIN_MESSAGE_LENGTH) {
    finalMessage = customMessage.trim();
  } else {
    finalMessage = buildQuestionsMessage(
      candidate.interview_questions as string[] | null,
    );
  }

  // ── 4. Initialise HH service via Token Manager ────────────────────────────
  let hhService: HhApiService;
  try {
    const accessToken = await getValidAccessToken();
    hhService = new HhApiService(accessToken);
  } catch (tokenError: any) {
    console.error('[queue/message] Token Manager failed:', tokenError.message);
    // Token failure is likely transient (refresh server down) — but we still
    // return 200 to avoid unbounded retries. The 'queued' status remains for
    // manual retry from the dashboard.
    return NextResponse.json({ success: false, error: 'Token refresh failed.' }, { status: 200 });
  }

  // ── 5. Send message via HH API ────────────────────────────────────────────
  const negotiationId = candidate.hh_negotiation_id;

  try {
    await hhService.sendMessage(negotiationId, finalMessage);
  } catch (sendError: any) {
    // Permanent or transient API failure — log it, mark 'failed', return 200.
    console.error(
      `[queue/message] sendMessage failed for candidate ${candidateId} ` +
      `(negotiation ${negotiationId}):`,
      sendError.message,
    );

    await supabaseAdmin
      .from('candidates')
      .update({ message_status: 'failed' })
      .eq('id', candidateId);

    return NextResponse.json(
      { success: false, error: 'HH API message send failed. Status set to failed.' },
      { status: 200 }, // 200 — intentional; we own the error, QStash must NOT retry
    );
  }

  // ── 6. Persist success ────────────────────────────────────────────────────
  const { error: updateError } = await supabaseAdmin
    .from('candidates')
    .update({ message_status: 'sent' })
    .eq('id', candidateId);

  if (updateError) {
    // Message was sent but we failed to record it — log prominently.
    console.error(
      `[queue/message] CRITICAL: Message sent to ${negotiationId} but ` +
      `DB update to 'sent' failed for candidate ${candidateId}:`,
      updateError.message,
    );
    // Still return 200 — the message was delivered; retrying would double-send.
  }

  console.info(
    `[queue/message] Message successfully sent and recorded for candidate ${candidateId}.`,
  );

  return NextResponse.json(
    { success: true, message: `Message delivered to negotiation ${negotiationId}.` },
    { status: 200 },
  );
}

// Wrap with verifySignatureAppRouter — only authenticated QStash requests reach
// our handler. Unauthenticated POSTs receive 401 before any code runs.
export const POST = verifySignatureAppRouter(handler);
