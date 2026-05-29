import { supabaseAdmin } from '@/lib/supabase/adminClient';
import CandidateTable from './CandidateTable';
import CandidateFilters from './CandidateFilters';
import { type Candidate } from './CandidateRow';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely parses an integer from a searchParam string.
 * Returns `defaultVal` on NaN, and clamps to [min, max].
 */
function safeInt(raw: string | undefined, defaultVal: number, min = 0, max = Infinity): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return defaultVal;
  return Math.max(min, Math.min(max, n));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  // Next.js 15/16: searchParams is a Promise — must be awaited.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  // Await the searchParams promise before reading values
  const params = await searchParams;

  // ── Parse & validate URL params with safe defaults ─────────────────────
  const page      = safeInt(params.page      as string, 1,  1, 10_000);
  const score_min = safeInt(params.score_min as string, 0,  0, 100);
  const tech_min  = safeInt(params.tech_min  as string, 0,  0, 100);
  const soft_min  = safeInt(params.soft_min  as string, 0,  0, 100);
  const exp_min   = safeInt(params.exp_min   as string, 0,  0, 100);

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  // ── Supabase query: filtered + paginated + counted ─────────────────────
  let candidates: Candidate[] = [];
  let totalCount = 0;
  let fetchError: string | null = null;

  try {
    let query = supabaseAdmin
      .from('candidates')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Apply filters only when above the zero default (skip clause if 0)
    if (score_min > 0) query = query.gte('score',      score_min);
    if (tech_min  > 0) query = query.gte('score_tech', tech_min);
    if (soft_min  > 0) query = query.gte('score_soft', soft_min);
    if (exp_min   > 0) query = query.gte('score_exp',  exp_min);

    const { data, error, count } = await query;

    if (error) throw error;
    candidates = (data as Candidate[]) || [];
    totalCount = count ?? 0;
  } catch (err: any) {
    fetchError = err.message;
    console.error('[Dashboard] Database fetch failed:', err);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Candidates Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Overview of synced applications and their AI evaluations.
          </p>
        </div>
      </div>

      {/* Edge Case 2: Critical DB failure */}
      {fetchError && (
        <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 shadow-sm">
          <h3 className="font-semibold mb-1">Critical Error</h3>
          <p className="text-sm">Failed to load candidates from the database: {fetchError}</p>
        </div>
      )}

      {/* Edge Case 1: Never-synced empty state (no filters active) */}
      {!fetchError && totalCount === 0 && score_min === 0 && tech_min === 0 && soft_min === 0 && exp_min === 0 && (
        <div className="p-16 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800 border-dashed">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-zinc-500">⏳</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-1">No Candidates Yet</h3>
          <p className="text-sm text-zinc-500">
            Waiting for the background worker to sync data from HH.ru...
          </p>
        </div>
      )}

      {/* Filters + pagination bar (shown whenever data fetched without error) */}
      {!fetchError && (
        <CandidateFilters
          totalCount={totalCount}
          currentPage={page}
          pageSize={PAGE_SIZE}
        />
      )}

      {/* Edge Case 3: Filters too strict — results exist but this page is empty */}
      {!fetchError && totalCount === 0 && (score_min > 0 || tech_min > 0 || soft_min > 0 || exp_min > 0) && (
        <div className="p-12 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800 border-dashed">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-zinc-500">🔍</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-1">No Candidates Match These Filters</h3>
          <p className="text-sm text-zinc-500">
            Try lowering the score thresholds or clearing the filters.
          </p>
        </div>
      )}

      {/* Candidate table */}
      {!fetchError && candidates.length > 0 && (
        <CandidateTable initialCandidates={candidates} />
      )}
    </div>
  );
}
