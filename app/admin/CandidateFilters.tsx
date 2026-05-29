'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FiltersProps {
  /** Total number of rows matching the current filters (from Supabase count). */
  totalCount: number;
  /** Current page number (1-based). */
  currentPage: number;
  /** Rows per page — must match the server-side LIMIT. */
  pageSize: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamps value to [min, max] and returns default if NaN. */
function safeInt(raw: string | null, defaultVal: number, min = 0, max = 100): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FilterInputProps {
  label: string;
  name: string;
  defaultValue: number;
}

function FilterInput({ label, name, defaultValue }: FilterInputProps) {
  return (
    <div className="flex flex-col gap-1 min-w-[90px]">
      <label htmlFor={name} className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          type="number"
          id={name}
          name={name}
          min={0}
          max={100}
          step={1}
          defaultValue={defaultValue}
          className="
            w-full bg-zinc-900 border border-zinc-700/60 rounded-lg
            px-3 py-1.5 text-sm text-white font-mono
            focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30
            placeholder-zinc-600 transition-colors
          "
          placeholder="0"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 pointer-events-none">
          min
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CandidateFilters({ totalCount, currentPage, pageSize }: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // Read current filter values from URL to seed the form defaults
  const currentScoreMin = safeInt(searchParams.get('score_min'), 0);
  const currentTechMin  = safeInt(searchParams.get('tech_min'),  0);
  const currentSoftMin  = safeInt(searchParams.get('soft_min'),  0);
  const currentExpMin   = safeInt(searchParams.get('exp_min'),   0);

  // ── Navigation helper ────────────────────────────────────────────────────

  const navigateTo = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(overrides).forEach(([k, v]) => {
        if (v === '0' || v === '') {
          params.delete(k); // keep URL clean — omit defaults
        } else {
          params.set(k, v);
        }
      });
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  // ── Form submit (Apply Filters button) ──────────────────────────────────

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const score_min = safeInt(fd.get('score_min') as string, 0);
    const tech_min  = safeInt(fd.get('tech_min')  as string, 0);
    const soft_min  = safeInt(fd.get('soft_min')  as string, 0);
    const exp_min   = safeInt(fd.get('exp_min')   as string, 0);

    navigateTo({
      page:      '1', // reset to page 1 when filters change
      score_min: String(score_min),
      tech_min:  String(tech_min),
      soft_min:  String(soft_min),
      exp_min:   String(exp_min),
    });
  }

  // ── Pagination ───────────────────────────────────────────────────────────

  function goToPage(page: number) {
    navigateTo({ page: String(page) });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">

      {/* ── Filter form ──────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3"
      >
        <FilterInput label="Overall ≥"  name="score_min" defaultValue={currentScoreMin} />
        <FilterInput label="Tech ≥"     name="tech_min"  defaultValue={currentTechMin}  />
        <FilterInput label="Soft ≥"     name="soft_min"  defaultValue={currentSoftMin}  />
        <FilterInput label="Exp ≥"      name="exp_min"   defaultValue={currentExpMin}   />

        <button
          type="submit"
          className="
            h-[34px] px-4 text-sm font-medium rounded-lg
            bg-indigo-600 hover:bg-indigo-500 text-white
            transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40
          "
        >
          Apply
        </button>

        {/* Reset — only visible when any filter is active */}
        {(currentScoreMin > 0 || currentTechMin > 0 || currentSoftMin > 0 || currentExpMin > 0) && (
          <button
            type="button"
            onClick={() => navigateTo({ score_min: '0', tech_min: '0', soft_min: '0', exp_min: '0', page: '1' })}
            className="
              h-[34px] px-3 text-xs font-medium rounded-lg
              border border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500
              transition-colors
            "
          >
            Clear filters
          </button>
        )}
      </form>

      {/* ── Pagination controls ───────────────────────────────────────────── */}
      {totalCount > 0 && (
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-zinc-500 tabular-nums">
            Page{' '}
            <span className="text-zinc-300 font-medium">{currentPage}</span>
            {' '}of{' '}
            <span className="text-zinc-300 font-medium">{totalPages}</span>
            {' '}
            <span className="text-zinc-600">({totalCount} total)</span>
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={!hasPrev}
              aria-label="Previous page"
              className="
                w-8 h-8 flex items-center justify-center rounded-md
                border border-zinc-700/60 text-zinc-400
                hover:text-zinc-200 hover:border-zinc-500
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-colors
              "
            >
              ‹
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={!hasNext}
              aria-label="Next page"
              className="
                w-8 h-8 flex items-center justify-center rounded-md
                border border-zinc-700/60 text-zinc-400
                hover:text-zinc-200 hover:border-zinc-500
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-colors
              "
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
