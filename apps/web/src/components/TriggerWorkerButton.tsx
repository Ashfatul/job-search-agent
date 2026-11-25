'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';

export function TriggerWorkerButton({
  isAgentRunning = false,
  onTriggered,
}: {
  isAgentRunning?: boolean;
  onTriggered?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleRun() {
    setSubmitting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/worker/trigger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Worker trigger failed');
      setStatusMsg('Agent started — tracking live below...');
      onTriggered?.();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || isAgentRunning;

  return (
    <div className="flex items-center gap-3">
      {statusMsg && <span className="text-xs text-[var(--muted)]">{statusMsg}</span>}
      <button
        onClick={handleRun}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        {submitting ? 'Starting...' : isAgentRunning ? 'Agent Running...' : 'Run Agent Now'}
      </button>
    </div>
  );
}
