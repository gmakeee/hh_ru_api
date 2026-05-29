import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { runScoringPipeline } from '@/lib/scoring/scoringService';

/**
 * POST /api/queue/score
 *
 * QStash receiver endpoint for the LLM scoring pipeline.
 *
 * Security model:
 *   verifySignatureAppRouter() wraps the handler and validates the
 *   Upstash-Signature header using QSTASH_CURRENT_SIGNING_KEY and
 *   QSTASH_NEXT_SIGNING_KEY. Any request without a valid cryptographic
 *   signature — including direct cURL calls or malicious bots — receives
 *   an automatic 401 Unauthorized before our handler code ever runs.
 *
 * Retry contract with QStash:
 *   - Return 2xx  → QStash considers the job delivered successfully.
 *   - Return 5xx  → QStash schedules an automatic retry with exponential
 *                   backoff (up to the configured max retries on the queue).
 *   We therefore catch pipeline errors, log them, and return 500 so that
 *   transient LLM failures are retried automatically.
 */
async function handler(_request: Request): Promise<Response> {
  try {
    await runScoringPipeline();

    return NextResponse.json(
      { success: true, message: 'Scoring pipeline completed successfully.' },
      { status: 200 },
    );
  } catch (error: any) {
    // Log the failure without leaking internal details to the response body.
    // QStash will see the 500 and schedule a retry via its backoff policy.
    console.error('[queue/score] runScoringPipeline failed:', error?.message ?? error);

    return NextResponse.json(
      { success: false, error: 'Scoring pipeline encountered an internal error.' },
      { status: 500 },
    );
  }
}

// Wrap with verifySignatureAppRouter so ONLY authenticated QStash requests
// can invoke this endpoint. The middleware reads QSTASH_CURRENT_SIGNING_KEY
// and QSTASH_NEXT_SIGNING_KEY automatically from process.env.
export const POST = verifySignatureAppRouter(handler);
