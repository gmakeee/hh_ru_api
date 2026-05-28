'use client';

import { useState } from 'react';
import { forceScoreCandidate } from '@/app/actions/candidates';

interface Props {
  candidateId: string;
  status: string;
}

export default function CandidateActionButton({ candidateId, status }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Кнопка ретрая имеет смысл только если кандидат еще не обработан успешно
  const canRetry = ['pending', 'error', 'fatal_error'].includes(status);

  if (!canRetry) {
    return <span className="text-zinc-600 text-sm font-medium">Completed</span>;
  }

  async function handleRetry() {
    setIsPending(true);
    setError(null);
    
    const result = await forceScoreCandidate(candidateId);
    
    // Если произошел сбой, показываем ошибку прямо под кнопкой
    if (result?.success === false) {
      setError(result.message);
    }
    
    setIsPending(false);
  }

  return (
    <div className="flex flex-col gap-1 items-end">
      <button
        onClick={handleRetry}
        disabled={isPending}
        className="text-xs font-medium px-3 py-1.5 bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 hover:text-blue-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-blue-900/50 flex items-center justify-center min-w-[90px]"
      >
        {isPending ? 'Running...' : 'Retry / Score'}
      </button>
      {error && (
        <span className="text-red-400 text-[10px] max-w-[120px] leading-tight text-right">
          {error}
        </span>
      )}
    </div>
  );
}
