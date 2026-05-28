'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { updateSystemSettings, AppSettings } from '@/app/actions/settings';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 min-w-[160px]">
      {pending ? 'Saving...' : 'Save Settings'}
    </button>
  );
}

interface Props { initialData: AppSettings | null; }

export default function SettingsForm({ initialData }: Props) {
  const [state, formAction] = useFormState(updateSystemSettings, null);

  return (
    <form action={formAction} className="max-w-3xl">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-semibold text-white">System Configuration</h2>
        
        {state?.message && (
          <div className={`p-4 rounded-lg border ${state.success ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' : 'bg-red-950/30 border-red-900/50 text-red-400'}`}>
            {state.message}
          </div>
        )}

        <div>
          <label htmlFor="hh_access_token" className="block text-sm font-medium text-zinc-400 mb-2">HH.ru Access Token</label>
          <input type="text" id="hh_access_token" name="hh_access_token" defaultValue={initialData?.hh_access_token || ''} required className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label htmlFor="meta_prompt" className="block text-sm font-medium text-zinc-400 mb-2">Meta Prompt (Instructions for AI Compiler)</label>
          <textarea id="meta_prompt" name="meta_prompt" rows={5} defaultValue={initialData?.meta_prompt || ''} required className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500" />
          <p className="mt-2 text-xs text-zinc-500">How the LLM should generate the master search prompt from your company needs.</p>
        </div>

        <div className="flex justify-end pt-4 border-t border-zinc-800"><SubmitButton /></div>
      </div>
    </form>
  );
}
