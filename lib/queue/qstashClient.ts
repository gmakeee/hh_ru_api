/**
 * @file lib/queue/qstashClient.ts
 * @description QStash Publisher Utility.
 *
 * Single responsibility: publish a message to the QStash queue that instructs
 * the receiver endpoint (/api/queue/score) to run the LLM scoring pipeline.
 *
 * The receiver pulls its own data from Supabase autonomously, so the published
 * message body can be empty — we are sending a signal, not a payload.
 */

import { Client } from '@upstash/qstash';

// ---------------------------------------------------------------------------
// Client initialisation
// ---------------------------------------------------------------------------

/**
 * Lazily-validated QStash client.
 * We defer the env-var check to call time (inside triggerScoringJob) so that
 * importing this module in environments where QSTASH_TOKEN is absent (e.g.,
 * local dev without QStash) does not crash the process on module load.
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

// ---------------------------------------------------------------------------
// Publisher
// ---------------------------------------------------------------------------

/**
 * Publishes a scoring job to QStash.
 *
 * QStash will make an authenticated POST request to
 * `${APP_URL}/api/queue/score`, which is verified and handled by
 * `verifySignatureAppRouter` in the receiver route.
 *
 * @throws {Error} If QSTASH_TOKEN or APP_URL env vars are missing.
 * @throws {Error} If the QStash API call itself fails (network / auth).
 *
 * @example
 * ```typescript
 * import { triggerScoringJob } from '@/lib/queue/qstashClient';
 * await triggerScoringJob(); // fire-and-forget from the publisher's perspective
 * ```
 */
export async function triggerScoringJob(): Promise<void> {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    throw new Error(
      '[qstashClient] CRITICAL: APP_URL environment variable is not set. ' +
        'QStash needs the absolute URL of the receiver endpoint.',
    );
  }

  const client = getQStashClient();
  const destination = `${appUrl}/api/queue/score`;

  await client.publishJSON({
    url:  destination,
    body: {}, // Receiver is self-contained — no payload required.
  });

  console.info(`[qstashClient] Scoring job successfully published to QStash → ${destination}`);
}
