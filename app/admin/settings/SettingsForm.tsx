'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { updateSystemSettings, AppSettings } from '@/app/actions/settings';

// ─── Submit button ─────────────────────────────────────────────────────────────

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 min-w-[160px]"
    >
      {pending ? 'Saving...' : 'Save Settings'}
    </button>
  );
}

// ─── Toggle switch ─────────────────────────────────────────────────────────────

interface ToggleProps {
  id: string;
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}

function ToggleSwitch({ id, name, checked, onChange, label, description }: ToggleProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-4 cursor-pointer group">
      {/* Hidden real checkbox — submitted with the form */}
      <input
        type="checkbox"
        id={id}
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {/* Visual pill */}
      <div
        className={`
          relative mt-0.5 flex-shrink-0 w-11 h-6 rounded-full border transition-colors duration-200
          ${checked
            ? 'bg-blue-600 border-blue-500'
            : 'bg-zinc-800 border-zinc-700'}
        `}
      >
        {/* Knob */}
        <span
          className={`
            absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm
            transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </div>
      <div>
        <span className="block text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
          {label}
        </span>
        {description && (
          <span className="block text-xs text-zinc-500 mt-0.5">{description}</span>
        )}
      </div>
    </label>
  );
}

// ─── Main form ─────────────────────────────────────────────────────────────────

interface Props {
  initialData: AppSettings | null;
}

export default function SettingsForm({ initialData }: Props) {
  const [state, formAction] = useFormState(updateSystemSettings, null);

  // Local state for the toggle — controls conditional disabling of the threshold input.
  const [autoRejectEnabled, setAutoRejectEnabled] = useState<boolean>(
    initialData?.auto_reject_enabled ?? false,
  );

  return (
    <form action={formAction} className="max-w-3xl space-y-6">

      {/* ── System Configuration card ──────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-xl font-semibold text-white">System Configuration</h2>

        {/* Status banner */}
        {state?.message && (
          <div
            className={`p-4 rounded-lg border text-sm ${
              state.success
                ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'
                : 'bg-red-950/30 border-red-900/50 text-red-400'
            }`}
          >
            {state.message}
          </div>
        )}

        {/* HH Access Token */}
        <div>
          <label
            htmlFor="hh_access_token"
            className="block text-sm font-medium text-zinc-400 mb-2"
          >
            HH.ru Access Token
          </label>
          <input
            type="text"
            id="hh_access_token"
            name="hh_access_token"
            defaultValue={initialData?.hh_access_token || ''}
            required
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Meta Prompt */}
        <div>
          <label
            htmlFor="meta_prompt"
            className="block text-sm font-medium text-zinc-400 mb-2"
          >
            Meta Prompt{' '}
            <span className="text-zinc-600 font-normal">(Instructions for AI Compiler)</span>
          </label>
          <textarea
            id="meta_prompt"
            name="meta_prompt"
            rows={5}
            defaultValue={initialData?.meta_prompt || ''}
            required
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
          />
          <p className="mt-2 text-xs text-zinc-500">
            How the LLM should generate the master search prompt from your company needs.
          </p>
        </div>
      </div>

      {/* ── Auto-Rejection card ────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">Auto-Rejection</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Automatically decline candidates via the HH.ru API when their overall score
            falls below the threshold.
          </p>
        </div>

        {/* Toggle */}
        <ToggleSwitch
          id="auto_reject_enabled"
          name="auto_reject_enabled"
          checked={autoRejectEnabled}
          onChange={setAutoRejectEnabled}
          label="Enable Auto-Rejection"
          description="When enabled, the scoring pipeline will trigger an automatic rejection for qualifying candidates."
        />

        {/* Threshold input — visually and functionally disabled when toggle is off */}
        <div className={`transition-opacity duration-200 ${autoRejectEnabled ? 'opacity-100' : 'opacity-40'}`}>
          <label
            htmlFor="auto_reject_threshold"
            className="block text-sm font-medium text-zinc-400 mb-2"
          >
            Rejection Threshold
            <span className="ml-2 text-zinc-600 font-normal text-xs">(0 – 100)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              id="auto_reject_threshold"
              name="auto_reject_threshold"
              min={0}
              max={100}
              step={1}
              defaultValue={initialData?.auto_reject_threshold ?? 30}
              disabled={!autoRejectEnabled}
              className="w-28 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-zinc-500">
              Candidates with an overall score{' '}
              <span className="text-zinc-300 font-medium">strictly below</span> this value
              will be automatically rejected.
            </p>
          </div>
        </div>

        {/* Destructive warning — shown only when the feature is active */}
        {autoRejectEnabled && (
          <div className="flex gap-3 p-3 rounded-lg bg-amber-950/20 border border-amber-900/40 text-amber-400 text-xs leading-relaxed">
            <span className="flex-shrink-0 mt-0.5">⚠️</span>
            <span>
              Auto-rejection sends irreversible decline messages through the HH.ru API.
              Ensure your threshold is calibrated before enabling this in production.
            </span>
          </div>
        )}
      </div>

      {/* ── Save bar ───────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
