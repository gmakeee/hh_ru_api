'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BroadcastStats {
  /** Candidates still waiting for QStash to deliver their message job. */
  queued: number;
  /** Messages successfully sent today (UTC date boundary). */
  sent_today: number;
  /** Messages that failed to send today (UTC date boundary). */
  failed_today: number;
}

// ─── Server Action ────────────────────────────────────────────────────────────

/**
 * Returns a snapshot of today's broadcast activity.
 *
 * "Today" is defined as UTC midnight — avoids mixing yesterday's failed jobs
 * into the live tracker widget so the HR team sees only the current session.
 *
 * Three separate queries instead of GROUP BY so each can use its own index
 * efficiently (message_status is low-cardinality — index scan is ideal).
 */
export async function getBroadcastStats(): Promise<BroadcastStats> {
  // Supabase count queries return { count: number | null } when you pass
  // { count: 'exact', head: true } — no row data transferred, minimal cost.

  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const todayIso = todayUtc.toISOString();

  const [queuedRes, sentRes, failedRes] = await Promise.all([
    supabaseAdmin
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('message_status', 'queued'),

    supabaseAdmin
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('message_status', 'sent')
      .gte('updated_at', todayIso),

    supabaseAdmin
      .from('candidates')
      .select('*', { count: 'exact', head: true })
      .eq('message_status', 'failed')
      .gte('updated_at', todayIso),
  ]);

  return {
    queued:     queuedRes.count  ?? 0,
    sent_today: sentRes.count    ?? 0,
    failed_today: failedRes.count ?? 0,
  };
}
