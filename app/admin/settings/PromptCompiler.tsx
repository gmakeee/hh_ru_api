'use client';
import { useState } from 'react';
import { compilePromptAction } from '@/app/actions/prompts';

export default function PromptCompiler() {
  const [needs, setNeeds] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleCompile() {
    setPending(true);
    setMessage(null);
    const result = await compilePromptAction(needs);
    setMessage({ text: result.message, isError: !result.success });
    if (result.success) setNeeds('');
    setPending(false);
  }

  return (
    <div className="max-w-3xl bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">AI Prompt Compiler</h2>
        <p className="text-sm text-zinc-400 mt-1">Describe what kind of candidate you are looking for in plain text. The AI will generate a strict JSON evaluation prompt and activate it.</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border ${!message.isError ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' : 'bg-red-950/30 border-red-900/50 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div>
        <label htmlFor="company_needs" className="block text-sm font-medium text-zinc-400 mb-2">Company Needs (e.g. Role, Tasks, Tech Stack)</label>
        <textarea id="company_needs" value={needs} onChange={e => setNeeds(e.target.value)} rows={6} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500" placeholder="Ищем мидл фронтендера со знанием Next.js..." />
      </div>

      <div className="flex justify-end pt-2">
        <button onClick={handleCompile} disabled={pending || !needs.trim()} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50">
          {pending ? 'Compiling AI Prompt...' : 'Compile & Activate Prompt'}
        </button>
      </div>
    </div>
  );
}
