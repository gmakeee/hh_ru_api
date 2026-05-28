'use client';
import { useState } from 'react';
import { setActivePromptAction } from '@/app/actions/prompts';

interface Prompt {
  id: number;
  company_needs: string;
  prompt_text: string;
  created_at: string;
}

export default function PromptSelector({ prompts, activePromptId }: { prompts: Prompt[], activePromptId: number | null | undefined }) {
  const [selectedId, setSelectedId] = useState<number | null>(activePromptId || (prompts.length > 0 ? prompts[0].id : null));
  const [pending, setPending] = useState(false);

  const selectedPrompt = prompts.find(p => p.id === selectedId);

  async function handleActivate() {
    if (!selectedId) return;
    setPending(true);
    await setActivePromptAction(selectedId);
    setPending(false);
  }

  return (
    <div className="max-w-3xl bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm space-y-6">
      <h2 className="text-xl font-semibold text-white">Prompt Library</h2>
      
      {prompts.length === 0 ? (
        <p className="text-zinc-500 text-sm">No compiled prompts yet.</p>
      ) : (
        <div className="space-y-6">
          <select 
            value={selectedId || ''} 
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {prompts.map(p => (
              <option key={p.id} value={p.id}>
                #{p.id} — {p.company_needs.substring(0, 60)}{p.company_needs.length > 60 ? '...' : ''} ({new Date(p.created_at).toLocaleDateString()}) {activePromptId === p.id ? '[ACTIVE]' : ''}
              </option>
            ))}
          </select>

          {selectedPrompt && (
            <div className="space-y-4">
              <div>
                <span className="text-xs text-zinc-500 uppercase font-semibold mb-2 block">Generated Master Prompt:</span>
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 font-mono text-xs max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {selectedPrompt.prompt_text}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-zinc-800">
                <button 
                  onClick={handleActivate}
                  disabled={pending || activePromptId === selectedId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition-all disabled:opacity-50"
                >
                  {pending ? 'Updating...' : activePromptId === selectedId ? 'Currently Active' : 'Set as Active'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
