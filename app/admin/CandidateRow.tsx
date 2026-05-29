'use client';

import { useState } from 'react';
import CandidateActionButton from './CandidateActionButton';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Candidate {
  id: string;
  hh_negotiation_id: string;
  status: string;
  /** Overall composite score (0-100). Null until the candidate is evaluated. */
  score: number | null;
  summary: string | null;
  raw_data: any;
  created_at: string;
  prompt_id: number | null;
  /** Technical skills score (0-100). Null until multi-criteria evaluation runs. */
  score_tech: number | null;
  /** Soft skills score (0-100). Null until multi-criteria evaluation runs. */
  score_soft: number | null;
  /** Experience match score (0-100). Null until multi-criteria evaluation runs. */
  score_exp: number | null;
  /** AI-generated interview questions targeting candidate weak areas. Null for legacy evaluations. */
  interview_questions: string[] | null;
  /** Message dispatch state. Null = no message action taken yet. */
  message_status: 'queued' | 'sent' | 'failed' | null;
}

interface Props {
  candidate: Candidate;
  /** Whether this row's checkbox is currently checked. Controlled by CandidateTable. */
  isSelected: boolean;
  /** Called when the checkbox changes. CandidateTable updates selectedIds. */
  onToggle: (id: string) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    case 'rejected':
      colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      break;
    default:
      colorClass = 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium border uppercase tracking-wider ${colorClass}`}
    >
      {status}
    </span>
  );
}

interface ScoreBarProps {
  label: string;
  value: number;
  /** Tailwind bg colour class for the filled portion. */
  colorClass: string;
}

function ScoreBar({ label, value, colorClass }: ScoreBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span className="text-xs font-bold text-white tabular-nums">
          {value}
          <span className="text-zinc-500 font-normal">/100</span>
        </span>
      </div>
      {/* Track */}
      <div className="h-1.5 w-full rounded-full bg-zinc-800">
        {/* Fill — width set via inline style because Tailwind cannot compile
            dynamic arbitrary values like w-[${value}%] at build time. */}
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// Message status icon map — mirrors the one exported from CandidateTable
const MESSAGE_STATUS_ICON: Record<NonNullable<Candidate['message_status']>, string> = {
  queued: '⏳',
  sent:   '✅',
  failed: '❌',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CandidateRow({ candidate, isSelected, onToggle }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const resumeId =
    candidate.raw_data?.resume?.id ||
    candidate.raw_data?.negotiation?.resume?.id;
  const candidateName =
    candidate.raw_data?.negotiation?.id || candidate.hh_negotiation_id;
  const resumeUrl = resumeId ? `https://hh.ru/resume/${resumeId}` : '#';

  const hasMultiCriteria =
    candidate.score_tech !== null &&
    candidate.score_soft !== null &&
    candidate.score_exp  !== null;

  return (
    <>
      {/* ── Main row ─────────────────────────────────────────────────────── */}
      <tr
        className={`transition-colors ${
          isSelected ? 'bg-indigo-950/20 hover:bg-indigo-950/30' : 'hover:bg-zinc-800/20'
        }`}
      >
        {/* Checkbox */}
        <td className="pl-6 pr-3 py-4 align-middle">
          <input
            type="checkbox"
            aria-label={`Select candidate ${candidate.hh_negotiation_id}`}
            checked={isSelected}
            onChange={() => onToggle(candidate.id)}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-indigo-500
                       focus:ring-indigo-500/30 focus:ring-2 cursor-pointer accent-indigo-500"
          />
        </td>

        {/* ID / Resume */}
        <td className="px-4 py-4">
          <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-400 mb-1">
            <span>#{candidateName}</span>
            {candidate.message_status && (
              <span
                title={`Message: ${candidate.message_status}`}
                className="text-base leading-none"
              >
                {MESSAGE_STATUS_ICON[candidate.message_status]}
              </span>
            )}
          </div>
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

        {/* Status */}
        <td className="px-6 py-4">
          <StatusBadge status={candidate.status} />
        </td>

        {/* Overall AI Score */}
        <td className="px-6 py-4">
          {candidate.score !== null ? (
            <div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-bold text-lg text-white">
                  {candidate.score}
                </span>
                <span className="text-xs text-zinc-500">/100</span>
              </div>
              {candidate.prompt_id && (
                <div className="text-[10px] text-purple-400 font-mono bg-purple-500/10 inline-block px-1.5 py-0.5 rounded border border-purple-500/20">
                  PROMPT #{candidate.prompt_id}
                </div>
              )}
            </div>
          ) : (
            <span className="text-zinc-600 font-medium">-</span>
          )}
        </td>

        {/* Summary */}
        <td className="px-6 py-4 whitespace-normal">
          <div className="max-w-md lg:max-w-xl">
            {candidate.summary ? (
              <p
                className="text-zinc-400 text-sm line-clamp-2 leading-relaxed"
                title={candidate.summary}
              >
                {candidate.summary}
              </p>
            ) : (
              <span className="text-zinc-600 italic text-sm">
                Waiting for evaluation...
              </span>
            )}
          </div>
        </td>

        {/* Actions */}
        <td className="px-6 py-4 text-right align-middle">
          <div className="flex flex-col items-end gap-2">
            <CandidateActionButton
              candidateId={candidate.id}
              status={candidate.status}
            />
            {/* Toggle button — only shown for evaluated candidates */}
            {candidate.score !== null && (
              <button
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                className="text-[10px] font-medium px-2.5 py-1 rounded-md border border-zinc-700/60 bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors flex items-center gap-1"
              >
                {/* Chevron rotates on expand */}
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2 4 6 8 10 4" />
                </svg>
                {isExpanded ? 'Hide details' : 'Show details'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* ── Expanded detail row ───────────────────────────────────────────── */}
      {isExpanded && (
        <tr className="bg-zinc-900/60 border-t border-zinc-800/50">
          {/* Span all 6 columns (including the new checkbox column) */}
          <td colSpan={6} className="px-6 py-4">
            {hasMultiCriteria ? (
              <div className="space-y-6">

                {/* ── Section 1: Score breakdown ─────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4 max-w-2xl">
                  <ScoreBar
                    label="Tech Skills"
                    value={candidate.score_tech!}
                    colorClass="bg-blue-500"
                  />
                  <ScoreBar
                    label="Soft Skills"
                    value={candidate.score_soft!}
                    colorClass="bg-purple-500"
                  />
                  <ScoreBar
                    label="Experience Match"
                    value={candidate.score_exp!}
                    colorClass="bg-emerald-500"
                  />
                </div>

                {/* ── Divider ────────────────────────────────────────────── */}
                <div className="border-t border-zinc-800/60" />

                {/* ── Section 2: Interview questions ─────────────────────── */}
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    {/* Microphone icon */}
                    <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    Recommended Interview Questions
                  </h4>

                  {candidate.interview_questions && candidate.interview_questions.length > 0 ? (
                    <ol className="space-y-2">
                      {candidate.interview_questions.map((question, index) => (
                        <li
                          key={index}
                          className="flex gap-3 items-start p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/40"
                        >
                          {/* Question number badge */}
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                            {index + 1}
                          </span>
                          <p className="text-sm text-zinc-300 leading-relaxed">
                            {question}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    /* Candidate scored after multi-criteria but before interview questions step */
                    <p className="text-xs text-zinc-600 italic">
                      No custom questions generated for this candidate. Re-score to generate.
                    </p>
                  )}
                </div>

              </div>
            ) : (
              /* Null-state: candidate evaluated before multi-criteria was enabled */
              <p className="text-xs text-zinc-600 italic">
                Detailed metrics not available for legacy evaluations. Re-score
                this candidate to generate breakdown scores.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
