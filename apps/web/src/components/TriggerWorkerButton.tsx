'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function TriggerWorkerButton({
  isAgentRunning = false,
  onTriggered,
}: {
  isAgentRunning?: boolean;
  onTriggered?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleRun() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/worker/trigger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Worker trigger failed');
      toast.success('Agent discovery started — tracking live!');
      onTriggered?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || isAgentRunning;

  return (
    <Button onClick={handleRun} disabled={busy}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
      {submitting ? 'Starting...' : isAgentRunning ? 'Agent Running...' : 'Run Agent Now'}
    </Button>
  );
}
