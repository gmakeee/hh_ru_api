'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { updateSettings, AppSettings } from '@/app/actions/settings';

// Кнопка Submit, которая подтягивает состояние pending из контекста формы
function SubmitButton() {
  const { pending } = useFormStatus();
  
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center justify-center min-w-[160px] bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Saving...' : 'Save Settings'}
    </button>
  );
}

interface Props {
  initialData: AppSettings | null;
}

export default function SettingsForm({ initialData }: Props) {
  // Использование хука useFormState (Next.js 14 / React 18) для обработки Server Actions
  const [state, formAction] = useFormState(updateSettings, null);

  return (
    <form action={formAction} className="space-y-6 max-w-3xl">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-white mb-6">API & LLM Configuration</h2>
        
        {/* Индикатор успеха или ошибки (сообщение от сервера) */}
        {state?.message && (
          <div className={`p-4 rounded-lg mb-6 border ${
            state.success 
              ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' 
              : 'bg-red-950/30 border-red-900/50 text-red-400'
          }`}>
            {state.message}
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label htmlFor="hh_access_token" className="block text-sm font-medium text-zinc-400 mb-2">
              HH.ru Access Token
            </label>
            <input
              type="text"
              id="hh_access_token"
              name="hh_access_token"
              defaultValue={initialData?.hh_access_token || ''}
              required // Edge Case 1: HTML5 Required validation
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm"
              placeholder="Paste your HH.ru access token..."
            />
            <p className="mt-2 text-xs text-zinc-500">
              The access token used by the background worker to fetch new candidates from HeadHunter.
            </p>
          </div>

          <div>
            <label htmlFor="master_prompt" className="block text-sm font-medium text-zinc-400 mb-2">
              Master System Prompt (LLM Instruction)
            </label>
            <textarea
              id="master_prompt"
              name="master_prompt"
              rows={12}
              defaultValue={initialData?.master_prompt || ''}
              required // Edge Case 1: HTML5 Required validation
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono text-sm resize-y leading-relaxed"
              placeholder="You are an expert HR recruiter. Analyze the following candidate..."
            />
            <p className="mt-2 text-xs text-zinc-500">
              This prompt is sent to OpenRouter as the 'system' message. The candidate's raw data will be appended automatically as the 'user' message.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end pt-6 border-t border-zinc-800">
          {/* Кнопка с защитой от двойного нажатия (Edge Case 3) */}
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
