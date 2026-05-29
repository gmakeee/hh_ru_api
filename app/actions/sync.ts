'use server';

import { runSyncNew } from '@/lib/sync/syncService';
import { triggerScoringJob } from '@/lib/queue/qstashClient';

const VALID_LIMITS = [5, 10, 20, 50, 100] as const;
type SyncLimit = typeof VALID_LIMITS[number];

export interface ManualSyncResult {
  success: boolean;
  message: string;
}

/**
 * Server Action: Manual sync with a configurable new-candidate cap.
 *
 * Called directly from the SyncTester Client Component — no HTTP round-trip,
 * no API_SECRET_KEY needed. The limit only counts NEW inserts; candidates
 * already in the DB are skipped instantly and never counted toward the limit.
 */
export async function triggerManualSync(limit: SyncLimit): Promise<ManualSyncResult> {
  // Validate — never trust client-supplied values
  if (!VALID_LIMITS.includes(limit)) {
    return {
      success: false,
      message: `Invalid limit "${limit}". Allowed: ${VALID_LIMITS.join(', ')}.`,
    };
  }

  try {
    // 1. Sync new candidates from HH.ru (stops when `limit` new rows are inserted)
    await runSyncNew(limit);

    // 2. Enqueue the scoring job so the freshly added candidates get evaluated
    await triggerScoringJob();

    return {
      success: true,
      message: `Sync complete. Up to ${limit} new candidates were fetched and queued for scoring.`,
    };
  } catch (err: any) {
    console.error('[triggerManualSync] Error:', err);
    return {
      success: false,
      message: err?.message || 'Internal server error during sync.',
    };
  }
}
