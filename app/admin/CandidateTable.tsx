'use client';

import { useState, useCallback } from 'react';
import CandidateRow, { type Candidate } from './CandidateRow';
import { startBroadcast, type BroadcastResult } from '@/app/actions/broadcast';
import BroadcastTracker from './BroadcastTracker';

interface Props {
  initialCandidates: Candidate[];
}

// ─── Message status icon map ───────────────────────────────────────────────────

const MESSAGE_STATUS_ICON: Record<NonNullable<Candidate['message_status']>, string> = {
  queued: '⏳',
  sent:   '✅',
  failed: '❌',
};

export { MESSAGE_STATUS_ICON };

// ─── Component ─────────────────────────────────────────────────────────────────

export default function CandidateTable({ initialCandidates }: Props) {
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [customMessage,  setCustomMessage]   = useState<string>('');
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);

  const isEmpty     = initialCandidates.length === 0;
  const allSelected = !isEmpty && selectedIds.size === initialCandidates.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleAll = useCallback(() => {
    if (allSelected || someSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(initialCandidates.map((c) => c.id)));
    }
  }, [allSelected, someSelected, initialCandidates]);

  const handleToggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  async function handleBroadcast() {
    if (selectedIds.size === 0 || isBroadcasting) return;
    setIsBroadcasting(true);
    setBroadcastResult(null);

    const result = await startBroadcast(
      Array.from(selectedIds),
      customMessage || undefined,
    );

    setBroadcastResult(result);
    setIsBroadcasting(false);
    setSelectedIds(new Set());   // clear selection after dispatch
    setCustomMessage('');        // reset textarea
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* ── Broadcast result banner ───────────────────────────────────────── */}
      {broadcastResult && (
        <div
          className={`flex items-start justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${
            broadcastResult.success
              ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'
              : 'bg-red-950/30 border-red-900/50 text-red-400'
          }`}
        >
          <span>{broadcastResult.message}</span>
          <button
            onClick={() => setBroadcastResult(null)}
            className="flex-shrink-0 text-xs opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Live broadcast progress tracker ──────────────────────────────── */}
      <BroadcastTracker />

      {/* ── Bulk-action toolbar — visible only when rows are selected ──────── */}
      <div
        className={`
          rounded-xl border transition-all duration-200 overflow-hidden
          ${selectedIds.size > 0
            ? 'opacity-100 bg-indigo-950/30 border-indigo-800/50'
            : 'opacity-0 pointer-events-none border-transparent h-0'
          }
        `}
        aria-live="polite"
      >
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-300">
            {selectedIds.size} candidate{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => { setSelectedIds(new Set()); setBroadcastResult(null); }}
            disabled={isBroadcasting}
            className="text-xs px-2.5 py-1 rounded-md border border-indigo-700/50 text-indigo-400 hover:bg-indigo-900/40 transition-colors disabled:opacity-40"
          >
            Clear selection
          </button>
        </div>

        {/* Custom message textarea */}
        <div className="px-4 pb-2">
          <label htmlFor="custom-message" className="block text-[10px] font-semibold text-indigo-400/70 uppercase tracking-wider mb-1">
            Custom message <span className="normal-case font-normal opacity-60">(optional — leave blank to use the default template)</span>
          </label>
          <textarea
            id="custom-message"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            disabled={isBroadcasting}
            rows={2}
            placeholder="Hi! We reviewed your application and would like to discuss…"
            className="w-full bg-zinc-950/80 border border-indigo-800/40 rounded-lg px-3 py-2
                       text-sm text-zinc-300 placeholder-zinc-600 resize-none
                       focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20
                       disabled:opacity-50 transition-colors"
          />
        </div>

        {/* Send button */}
        <div className="px-4 pb-3">
          <button
            onClick={handleBroadcast}
            disabled={isBroadcasting || selectedIds.size === 0}
            className="
              px-4 py-2 text-sm font-medium rounded-lg
              bg-indigo-600 hover:bg-indigo-500 text-white
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40
              flex items-center gap-2
            "
          >
            {isBroadcasting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Scheduling…
              </>
            ) : (
              <>✉️ Send to {selectedIds.size} candidate{selectedIds.size !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
              <tr>
                {/* Select-all checkbox */}
                <th className="pl-6 pr-3 py-4 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all candidates"
                    disabled={isEmpty}
                    checked={allSelected}
                    ref={(el) => {
                      // Indeterminate state cannot be set via JSX prop — requires DOM ref
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={handleToggleAll}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500
                               focus:ring-indigo-500/30 focus:ring-2 cursor-pointer
                               disabled:opacity-40 disabled:cursor-not-allowed
                               accent-indigo-500"
                  />
                </th>
                <th className="px-4 py-4 font-medium tracking-wide">ID / Resume</th>
                <th className="px-4 py-4 font-medium tracking-wide">Status</th>
                <th className="px-4 py-4 font-medium tracking-wide">AI Score</th>
                <th className="px-4 py-4 font-medium tracking-wide w-full min-w-[300px]">
                  Evaluation Summary
                </th>
                <th className="px-4 py-4 font-medium tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
              {initialCandidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  isSelected={selectedIds.has(candidate.id)}
                  onToggle={handleToggleRow}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
