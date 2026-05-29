/**
 * @file lib/queue/qstashClient.ts
 * @description QStash Publisher Utility.
 *
 * Exports two publisher functions:
 *   - triggerScoringJob()   — signals the LLM scoring pipeline (no payload)
 *   - triggerMessageJob()   — schedules a single candidate message with a delay
 *
 * The receiver endpoints pull their own data from Supabase autonomously.
 */

import { Client } from '@upstash/qstash';

// ---------------------------------------------------------------------------
// Client initialisation
// ---------------------------------------------------------------------------

/**
 * Lazily-validated QStash client.
 * We defer the env-var check to call time so that importing this module in
 * environments where QSTASH_TOKEN is absent does not crash the process on load.
 */
function getQStashClient(): Client {
  const token = process.env.QSTASH_TOKEN;

  if (!token) {
    throw new Error(
      '[qstashClient] CRITICAL: QSTASH_TOKEN environment variable is not set. ' +
        'Cannot publish jobs to QStash.',
    );
  }

  return new Client({ token });
}

/** Validates APP_URL and returns it. Throws if missing. */
function requireAppUrl(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error(
      '[qstashClient] CRITICAL: APP_URL environment variable is not set. ' +
        'QStash needs the absolute URL of the receiver endpoint.',
    );
  }
  return appUrl;
}

// ---------------------------------------------------------------------------
// Publishers
// ---------------------------------------------------------------------------

/**
 * Publishes a scoring job to QStash.
 *
 * QStash will POST to `${APP_URL}/api/queue/score`, verified by
 * `verifySignatureAppRouter`. No payload — the receiver is self-contained.
 *
 * @throws {Error} If QSTASH_TOKEN or APP_URL env vars are missing.
 */
export async function triggerScoringJob(): Promise<void> {
  const appUrl  = requireAppUrl();
  const client  = getQStashClient();
  const destination = `${appUrl}/api/queue/score`;

  await client.publishJSON({
    url:  destination,
    body: {},
  });

  console.info(`[qstashClient] Scoring job published → ${destination}`);
}

// ---------------------------------------------------------------------------

/** Payload shape sent to /api/queue/message */
export interface MessageJobPayload {
  /** Supabase candidate UUID. */
  candidateId: string;
  /** Optional custom message text. Null if the template default should be used. */
  customMessage: string | null;
}

/**
 * Schedules a candidate message job via QStash with a specified delay.
 *
 * QStash will POST to `${APP_URL}/api/queue/message` after `delaySeconds`.
 * This serialises concurrent messages to respect HH.ru rate limits.
 *
 * @param candidateId   - Supabase UUID of the candidate to message.
 * @param customMessage - Optional override text; null = use default template.
 * @param delaySeconds  - Seconds QStash waits before delivering the job.
 *                        Increment by 5 per candidate to serialise the batch.
 *
 * @throws {Error} If QSTASH_TOKEN or APP_URL env vars are missing.
 * @throws {Error} If the QStash API call itself fails.
 */
export async function triggerMessageJob(
  candidateId: string,
  customMessage: string | null,
  delaySeconds: number,
): Promise<void> {
  const appUrl  = requireAppUrl();
  const client  = getQStashClient();
  const destination = `${appUrl}/api/queue/message`;

  const body: MessageJobPayload = { candidateId, customMessage };

  await client.publishJSON({
    url:   destination,
    body,
    // QStash delay format: bigint followed by "s" (seconds). The SDK type is
    // `${bigint}s` — Math.trunc ensures no decimal before the BigInt cast.
    delay: `${BigInt(Math.trunc(delaySeconds))}s`,
  });

  console.info(
    `[qstashClient] Message job published → ${destination} ` +
    `(candidateId=${candidateId}, delay=${delaySeconds}s)`,
  );
}

