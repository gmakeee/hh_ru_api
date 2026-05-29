'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { triggerMessageJob } from '@/lib/queue/qstashClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BroadcastResult = {
  success: boolean;
  message: string;
  /** Number of jobs successfully enqueued. */
  scheduled: number;
  /** Number of jobs that failed to enqueue (DB was still marked 'queued'). */
  failed: number;
};

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

/**
 * Initiates a serialised broadcast of HH.ru messages to a batch of candidates.
 *
 * Flow:
 *   1. Bulk-update all candidate rows to message_status = 'queued'.
 *   2. Iterate over candidateIds, publishing a QStash job for each with an
 *      incremental 5-second delay to serialise delivery and respect HH rate limits.
 *
 * Edge Case — Publish Failure:
 *   If a single triggerMessageJob() call throws, we log the error and continue
 *   the loop. The candidate remains 'queued' in the DB and can be retried later.
 *   We do NOT abort the entire batch for one failed publish.
 *
 * @param candidateIds  - Array of Supabase UUIDs to message.
 * @param customMessage - Optional override text. Undefined / empty → null (use template).
 */
export async function startBroadcast(
  candidateIds: string[],
  customMessage?: string,
): Promise<BroadcastResult> {
  if (candidateIds.length === 0) {
    return { success: false, message: 'No candidates selected.', scheduled: 0, failed: 0 };
  }

  const message = customMessage?.trim() || null;

  // ── Step 1: Bulk mark as 'queued' ─────────────────────────────────────────
  const { error: bulkUpdateError } = await supabaseAdmin
    .from('candidates')
    .update({ message_status: 'queued' })
    .in('id', candidateIds);

  if (bulkUpdateError) {
    console.error('[startBroadcast] Failed to bulk-update message_status:', bulkUpdateError);
    return {
      success: false,
      message: 'Database error: failed to mark candidates as queued.',
      scheduled: 0,
      failed: candidateIds.length,
    };
  }

  // ── Step 2: Serialised QStash publishing (5s gap between each job) ────────
  let scheduled = 0;
  let failed    = 0;

  for (let i = 0; i < candidateIds.length; i++) {
    const candidateId  = candidateIds[i];
    const delaySeconds = i * 5; // 0s, 5s, 10s, … — keeps HH.ru rate limits happy

    try {
      await triggerMessageJob(candidateId, message, delaySeconds);
      scheduled++;
    } catch (publishError: any) {
      // Non-fatal: log and continue so the rest of the batch is not lost.
      // The candidate stays 'queued' in the DB for a manual retry later.
      console.error(
        `[startBroadcast] Failed to schedule message job for candidate ${candidateId}:`,
        publishError.message,
      );
      failed++;
    }
  }

  // ── Step 3: Result summary ─────────────────────────────────────────────────
  if (failed === 0) {
    return {
      success: true,
      message: `${scheduled} message${scheduled !== 1 ? 's' : ''} successfully queued.`,
      scheduled,
      failed,
    };
  }

  if (scheduled === 0) {
    return {
      success: false,
      message: `All ${failed} jobs failed to publish. Candidates remain queued for retry.`,
      scheduled,
      failed,
    };
  }

  // Partial success
  return {
    success: true,
    message: `${scheduled} queued, ${failed} failed to publish (those candidates remain in 'queued' state).`,
    scheduled,
    failed,
  };
}
