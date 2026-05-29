'use client';

import { useState } from 'react';
import { triggerManualSync } from '@/app/actions/sync';

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT_OPTIONS = [5, 10, 20, 50, 100] as const;
type SyncLimit = typeof LIMIT_OPTIONS[number];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Manual sync tester with a discrete step slider.
 *
 * The slider maps an integer index (0–4) to the LIMIT_OPTIONS array so
 * that the snap points feel evenly spaced even though the values are not.
 * Existing candidates are never re-inserted — the sync pipeline skips them
 * instantly (no delay, no API call). The limit only counts net-new rows.
 */
export default function SyncTester() {
  const [sliderIndex, setSliderIndex] = useState(2); // default = 20
  const [isRunning,   setIsRunning]   = useState(false);
  const [result,      setResult]      = useState<{ success: boolean; message: string } | null>(null);

  const selectedLimit: SyncLimit = LIMIT_OPTIONS[sliderIndex];

  async function handleSync() {
    setIsRunning(true);
    setResult(null);
    const res = await triggerManualSync(selectedLimit);
    setResult(res);
    setIsRunning(false);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-semibold text-white">Manual Sync</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Fetch new candidates from HH.ru and queue them for scoring.
          Candidates already in the database are skipped — no duplicates possible.
        </p>
      </div>

      {/* ── Limit picker ────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-300">
            New candidates per run
          </label>
          <span
            className="text-2xl font-bold tabular-nums text-white min-w-[3ch] text-right"
            aria-live="polite"
            aria-atomic="true"
          >
            {selectedLimit}
          </span>
        </div>

        {/* Slider */}
        <div className="relative">
          <input
            id="sync-limit-slider"
            type="range"
            min={0}
            max={LIMIT_OPTIONS.length - 1}
            step={1}
            value={sliderIndex}
            onChange={(e) => setSliderIndex(Number(e.target.value))}
            disabled={isRunning}
            className="
              w-full h-2 rounded-full appearance-none cursor-pointer
              bg-zinc-700 disabled:cursor-not-allowed
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-blue-500
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:hover:scale-110
              [&::-moz-range-thumb]:w-5
              [&::-moz-range-thumb]:h-5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-blue-500
              [&::-moz-range-thumb]:border-0
            "
          />

          {/* Tick labels */}
          <div className="flex justify-between mt-2 px-0.5" aria-hidden="true">
            {LIMIT_OPTIONS.map((val, idx) => (
              <button
                key={val}
                type="button"
                onClick={() => setSliderIndex(idx)}
                disabled={isRunning}
                className={`
                  text-xs font-medium tabular-nums transition-colors
                  ${idx === sliderIndex ? 'text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}
                  disabled:cursor-not-allowed
                `}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Contextual hint */}
        <p className="text-xs text-zinc-600">
          {selectedLimit <= 20
            ? '✓ Safe for testing — minimal API load.'
            : selectedLimit <= 50
            ? '⚡ Moderate load — watch for Vercel timeout on slow connections.'
            : '⚠️ Full run — ensure your Vercel plan supports 60s+ function timeouts.'}
        </p>
      </div>

      {/* ── Result banner ───────────────────────────────────────────────────── */}
      {result && (
        <div
          className={`
            p-4 rounded-lg border text-sm transition-all
            ${result.success
              ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'
              : 'bg-red-950/30 border-red-900/50 text-red-400'
            }
          `}
        >
          {result.message}
        </div>
      )}

      {/* ── Trigger button ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          id="manual-sync-btn"
          type="button"
          onClick={handleSync}
          disabled={isRunning}
          className="
            flex items-center gap-2 px-5 py-2.5
            bg-blue-600 hover:bg-blue-500
            text-white text-sm font-medium rounded-lg
            transition-all active:scale-[0.97]
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          {isRunning ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Syncing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15" />
              </svg>
              Run Sync ({selectedLimit} candidates)
            </>
          )}
        </button>

        {isRunning && (
          <p className="text-xs text-zinc-500 animate-pulse">
            Fetching from HH.ru and queuing scoring jobs…
          </p>
        )}
      </div>

    </div>
  );
}
