import { supabaseAdmin } from '@/lib/supabase/adminClient';

interface SystemLog {
  id: number;
  level: string;
  message: string;
  details: any;
  created_at: string;
}

function LogBadge({ level }: { level: string }) {
  let colorClass = '';
  switch (level) {
    case 'info':
      colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      break;
    case 'warning':
      colorClass = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      break;
    case 'error':
    case 'fatal':
      colorClass = 'bg-red-500/10 text-red-400 border-red-500/20';
      break;
    default:
      colorClass = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-widest ${colorClass}`}>
      {level}
    </span>
  );
}

export default async function LogsPage() {
  let logs: SystemLog[] = [];
  let fetchError = null;

  try {
    const { data, error } = await supabaseAdmin
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    logs = data || [];
  } catch (err: any) {
    fetchError = err.message;
    console.error('[Logs] Database fetch failed:', err);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">System Logs</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Real-time execution logs from background workers and API services. (Showing last 100 entries)
          </p>
        </div>
      </div>

      {fetchError && (
        <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 shadow-sm">
          <h3 className="font-semibold mb-1">Critical Error</h3>
          <p className="text-sm">Failed to load logs from the database: {fetchError}</p>
        </div>
      )}

      {!fetchError && logs.length === 0 && (
        <div className="p-16 text-center rounded-2xl bg-zinc-900/30 border border-zinc-800 border-dashed">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-zinc-500">📝</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-1">No Logs Found</h3>
          <p className="text-sm text-zinc-500">
            System logs will appear here once background workers execute.
          </p>
        </div>
      )}

      {!fetchError && logs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="px-6 py-4 font-medium tracking-wide">Time</th>
                  <th className="px-6 py-4 font-medium tracking-wide">Level</th>
                  <th className="px-6 py-4 font-medium tracking-wide w-full min-w-[300px]">Message</th>
                  <th className="px-6 py-4 font-medium tracking-wide">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="px-6 py-4 align-top">
                      <div className="font-mono text-xs text-zinc-500">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <LogBadge level={log.level} />
                    </td>
                    <td className="px-6 py-4 whitespace-normal align-top">
                      <p className="text-zinc-300 text-sm leading-relaxed">
                        {log.message}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-normal align-top text-xs text-zinc-500 font-mono">
                      <div className="max-w-[200px] overflow-hidden text-ellipsis">
                        {log.details && Object.keys(log.details).length > 0 ? (
                          JSON.stringify(log.details).substring(0, 100) + (JSON.stringify(log.details).length > 100 ? '...' : '')
                        ) : (
                          '-'
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
