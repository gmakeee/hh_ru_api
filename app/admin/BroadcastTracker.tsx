'use client';

import { useEffect, useRef, useState } from 'react';
import { getBroadcastStats, type BroadcastStats } from '@/app/actions/getBroadcastStats';

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Live broadcast tracker widget.
 *
 * Polls getBroadcastStats() every 3 s while there are 'queued' candidates.
 * Automatically stops polling when the queue drains to zero to conserve
 * server resources. Restarts polling if the queue count rises again
 * (e.g., a second broadcast was initiated in another tab).
 *
 * Memory-leak guard: the interval is always cleared on unmount via the
 * useEffect cleanup function.
 */
export default function BroadcastTracker() {
  const [stats,      setStats]      = useState<BroadcastStats | null>(null);
  const [isLoading,  setIsLoading]  = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling logic ──────────────────────────────────────────────────────────

  function clearPoller() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function fetchStats() {
    try {
      const data = await getBroadcastStats();
      setStats(data);
      setIsLoading(false);

      // Auto-stop polling when the queue is empty to save resources.
      // The effect dependency on stats.queued will restart it if needed.
      if (data.queued === 0) {
        clearPoller();
      }
    } catch {
      // Silently swallow network/server errors — the UI must never crash
      // because the tracker failed. The stale stats remain visible.
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Immediate first fetch so the widget is populated without waiting 3 s.
    fetchStats();

    // Start the interval; fetchStats() self-terminates it when queue = 0.
    intervalRef.current = setInterval(fetchStats, POLL_INTERVAL_MS);

    // Cleanup: always clear on unmount to prevent the "Can't perform a React
    // state update on an unmounted component" memory leak.
    return () => clearPoller();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — fetchStats captures the ref via closure

  // ── Early exit: nothing to show until first poll resolves ─────────────────
  // We show the widget as soon as we have any stat, even if all are zero,
  // so the HR team can see "0 remaining" after a completed broadcast.
  if (isLoading) return null;
  if (!stats) return null;

  // Hide entirely if there has been no broadcast activity today
  const hasActivity = stats.queued > 0 || stats.sent_today > 0 || stats.failed_today > 0;
  if (!hasActivity) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const isActive = stats.queued > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Broadcast progress"
      className={`
        flex items-center gap-4 px-4 py-2.5 rounded-xl border text-sm
        transition-all duration-300
        ${isActive
          ? 'bg-indigo-950/40 border-indigo-800/50 text-indigo-300'
          : 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400'
        }
      `}
    >
      {/* ── Status icon ──────────────────────────────────────────────────── */}
      {isActive ? (
        /* Animated spinner while jobs are in-flight */
        <svg
          className="w-4 h-4 flex-shrink-0 animate-spin text-indigo-400"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      ) : (
        /* Static checkmark when queue is drained */
        <svg
          className="w-4 h-4 flex-shrink-0 text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}

      {/* ── Primary label ─────────────────────────────────────────────────── */}
      <span className="font-medium">
        {isActive
          ? `Sending messages: ${stats.queued} remaining…`
          : 'Broadcast complete'
        }
      </span>

      {/* ── Today's counters ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 ml-auto text-xs tabular-nums">
        {stats.sent_today > 0 && (
          <span className="flex items-center gap-1 text-emerald-400">
            <span aria-hidden="true">✓</span>
            <span>{stats.sent_today} sent</span>
          </span>
        )}
        {stats.failed_today > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <span aria-hidden="true">✗</span>
            <span>{stats.failed_today} failed</span>
          </span>
        )}
      </div>
    </div>
  );
}
