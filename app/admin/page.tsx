import { supabaseAdmin } from '@/lib/supabase/adminClient';
import CandidateActionButton from './CandidateActionButton';

interface Candidate {
  id: string;
  hh_negotiation_id: string;
  status: string;
  score: number | null;
  summary: string | null;
  raw_data: any;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  let colorClass = '';
  switch (status) {
    case 'scored':
      colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      break;
    case 'pending':
    case 'processing':
      colorClass = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      break;
    case 'error':
    case 'fatal_error':
      colorClass = 'bg-red-500/10 text-red-400 border-red-500/20';
      break;
    default:
      colorClass = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border uppercase tracking-wider ${colorClass}`}>
      {status}
    </span>
  );
}

export default async function DashboardPage() {
  let candidates: Candidate[] = [];
  let fetchError = null;

  try {
    // Edge Case 2: Database Failure on Fetch
    const { data, error } = await supabaseAdmin
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    candidates = data || [];
  } catch (err: any) {
    fetchError = err.message;
    console.error('[Dashboard] Database fetch failed:', err);
  }

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

      {/* Edge Case 2: Критическая ошибка загрузки БД */}
      {fetchError && (
        <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 shadow-sm">
          <h3 className="font-semibold mb-1">Critical Error</h3>
          <p className="text-sm">Failed to load candidates from the database: {fetchError}</p>
        </div>
      )}

      {/* Edge Case 1: Пустое состояние (Empty State) */}
      {!fetchError && candidates.length === 0 && (
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

      {/* Таблица кандидатов */}
      {!fetchError && candidates.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-medium tracking-wide">ID / Resume</th>
                  <th className="px-6 py-4 font-medium tracking-wide">Status</th>
                  <th className="px-6 py-4 font-medium tracking-wide">AI Score</th>
                  <th className="px-6 py-4 font-medium tracking-wide w-full min-w-[300px]">Evaluation Summary</th>
                  <th className="px-6 py-4 font-medium tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {candidates.map((candidate) => {
                  const resumeId = candidate.raw_data?.resume?.id || candidate.raw_data?.negotiation?.resume?.id;
                  const candidateName = candidate.raw_data?.negotiation?.id || candidate.hh_negotiation_id;
                  const resumeUrl = resumeId ? `https://hh.ru/resume/${resumeId}` : '#';

                  return (
                    <tr key={candidate.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs text-zinc-400 mb-1">#{candidateName}</div>
                        {resumeId ? (
                          <a 
                            href={resumeUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            View Resume ↗
                          </a>
                        ) : (
                          <span className="text-sm text-zinc-500">No Resume Link</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={candidate.status} />
                      </td>
                      <td className="px-6 py-4">
                        {candidate.score !== null ? (
                          <div className="flex items-baseline gap-1">
                            <span className="font-bold text-lg text-white">{candidate.score}</span>
                            <span className="text-xs text-zinc-500">/100</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 font-medium">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-normal">
                        {/* Summary Column with line-clamp */}
                        <div className="max-w-md lg:max-w-xl">
                          {candidate.summary ? (
                            <p className="text-zinc-400 text-sm line-clamp-2 leading-relaxed" title={candidate.summary}>
                              {candidate.summary}
                            </p>
                          ) : (
                            <span className="text-zinc-600 italic text-sm">Waiting for evaluation...</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right align-middle">
                        {/* Client Component Button */}
                        <CandidateActionButton 
                          candidateId={candidate.id} 
                          status={candidate.status} 
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
