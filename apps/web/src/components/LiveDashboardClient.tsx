'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  Mail,
  Pause,
  Play,
  RefreshCw,
  Send,
  SkipForward,
  Terminal,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { SomewhatSearchBar } from './SomewhatSearchBar';
import { TriggerWorkerButton } from './TriggerWorkerButton';

export interface DashboardKpis {
  totalFound: number;
  matchedCount: number;
  draftCount: number;
  appliedCount: number;
  employeesReached: number;
  repliedCount: number;
  statusCounts: Record<string, number>;
}

export interface SourceFetchResult {
  source: string;
  count: number;
  status: 'ok' | 'error';
  error?: string;
}

export interface AgentLogEvent {
  ts: string;
  step: string;
  detail: string;
  status: 'info' | 'ok' | 'warn' | 'error';
}

export interface AgentRunRecord {
  id: string;
  trigger_type: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'completed' | 'failed';
  jobs_found: number;
  jobs_matched: number;
  emails_drafted: number;
  emails_sent: number;
  followups_sent: number;
  employees_reached: number;
  error_message: string | null;
  log_summary?: {
    stage?: string;
    message?: string;
    progress?: number;
    sourceResults?: SourceFetchResult[];
    events?: AgentLogEvent[];
  } | null;
}

export interface ReadyQueueItem {
  id: string;
  status: string;
  channel: string;
  job: {
    id: string;
    company: string;
    title: string;
    apply_url: string;
    location: string | null;
    source_name: string;
    contact_email: string | null;
    match_score: number;
    match_summary: { rationale?: string; matchedSkills?: string[]; missingSkills?: string[] };
    description: string;
  };
  outreach_emails: Array<{
    id: string;
    recipient_email: string | null;
    email_type: string;
    subject: string;
    body: string;
    status: string;
  }>;
}

export interface SetupSummary {
  hasResume: boolean;
  resumeTitle: string | null;
  sourcesCount: number;
  enabledSourcesCount: number;
  hasTelegram: boolean;
  hasSummaryEmail: boolean;
  isPaused: boolean;
  cronSchedule: string;
  targetRoles: string[];
  minMatchScore: number;
  remoteOnly: boolean;
}

export function LiveDashboardClient({
  userId,
  initialKpis,
  initialRuns,
  initialQueue,
  initialSetup,
}: {
  userId: string;
  initialKpis: DashboardKpis;
  initialRuns: AgentRunRecord[];
  initialQueue: ReadyQueueItem[];
  initialSetup: SetupSummary;
}) {
  const [kpis, setKpis] = useState<DashboardKpis>(initialKpis);
  const [runs, setRuns] = useState<AgentRunRecord[]>(initialRuns);
  const [queue, setQueue] = useState<ReadyQueueItem[]>(initialQueue);
  const [setup, setSetup] = useState<SetupSummary>(initialSetup);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(initialQueue[0]?.id ?? null);
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(initialRuns[0]?.id ?? null);
  const [justTriggered, setJustTriggered] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const selectedItem = queue.find((q) => q.id === selectedQueueId) ?? queue[0] ?? null;
  const initialEmail =
    selectedItem?.outreach_emails?.find((e) => e.email_type === 'initial') ?? null;

  const [editRecipient, setEditRecipient] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  useEffect(() => {
    if (!selectedItem) return;
    setEditRecipient(initialEmail?.recipient_email || selectedItem.job.contact_email || '');
    setEditSubject(initialEmail?.subject || '');
    setEditBody(initialEmail?.body || '');
  }, [selectedItem?.id, initialEmail?.id, initialEmail?.subject, initialEmail?.body]);

  const refreshDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        kpis: DashboardKpis;
        runs: AgentRunRecord[];
        readyQueue: ReadyQueueItem[];
        setup: SetupSummary;
      };
      setKpis(data.kpis);
      setRuns(data.runs);
      setQueue(data.readyQueue);
      setSetup(data.setup);
      if (data.runs[0]?.status === 'running') {
        setInspectedRunId(data.runs[0].id);
      }
    } catch {
      // Ignore transient polling errors
    }
  }, []);

  const activeRun = runs.find((r) => r.status === 'running') ?? null;
  const inspectedRun = activeRun ?? runs.find((r) => r.id === inspectedRunId) ?? runs[0] ?? null;

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`control-center-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_runs', filter: `user_id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as AgentRunRecord | undefined;
          if (!updated?.id) return;
          setRuns((prev) => {
            const exists = prev.some((r) => r.id === updated.id);
            const next = exists
              ? prev.map((r) => (r.id === updated.id ? updated : r))
              : [updated, ...prev];
            return next.slice(0, 8);
          });
          setInspectedRunId(updated.id);
          if (updated.status !== 'running') setJustTriggered(false);
          void refreshDashboard();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications', filter: `user_id=eq.${userId}` },
        () => {
          void refreshDashboard();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshDashboard]);

  // 2s live polling fallback while running
  useEffect(() => {
    if (!activeRun && !justTriggered) return;
    const timer = setInterval(() => void refreshDashboard(), 2000);
    const safety = justTriggered ? setTimeout(() => setJustTriggered(false), 20000) : null;
    return () => {
      clearInterval(timer);
      if (safety) clearTimeout(safety);
    };
  }, [activeRun, justTriggered, refreshDashboard]);

  async function togglePause() {
    setBusyId('pause');
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { is_paused: !setup.isPaused } }),
    });
    await refreshDashboard();
    setBusyId(null);
  }

  async function updateAppStatus(appId: string, status: 'applied' | 'skipped') {
    setBusyId(appId);
    setActionMsg(null);
    await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId, status }),
    });
    setActionMsg(status === 'applied' ? 'Marked as Applied!' : 'Skipped job.');
    await refreshDashboard();
    setBusyId(null);
  }

  async function handleDraftAction(action: 'regenerate' | 'save' | 'send_now' | 'copy') {
    if (!selectedItem) return;
    if (action === 'copy') {
      await navigator.clipboard.writeText(`Subject: ${editSubject}\n\n${editBody}`);
      setActionMsg('Copied subject & email body to clipboard.');
      return;
    }

    setBusyId(selectedItem.id);
    setActionMsg(null);
    try {
      if (action === 'regenerate' || !initialEmail) {
        const res = await fetch('/api/outreach/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicationId: selectedItem.id,
            emailType: 'initial',
            recipientEmail: editRecipient,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to draft');
        setActionMsg('Drafted fresh human-like initial email!');
      } else {
        const res = await fetch('/api/outreach/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emailId: initialEmail.id,
            recipientEmail: editRecipient,
            subject: editSubject,
            bodyText: editBody,
            action,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Action failed');
        setActionMsg(action === 'send_now' ? 'Email sent manually!' : 'Saved draft edits.');
      }
      await refreshDashboard();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const workflowSteps = [
    {
      step: '1. Resume & Criteria',
      status: setup.hasResume ? 'ok' : 'warn',
      value: setup.hasResume ? setup.resumeTitle || 'Active' : 'Upload Resume',
      sub: setup.targetRoles.slice(0, 2).join(', ') || 'Set target roles',
      href: '/resume',
    },
    {
      step: '2. Sources & Rules',
      status: 'ok',
      value:
        setup.sourcesCount > 0
          ? `${setup.enabledSourcesCount}/${setup.sourcesCount} active`
          : '10 Default Free Feeds',
      sub: `Min ${setup.minMatchScore}% • ${setup.cronSchedule}`,
      href: '/settings',
    },
    {
      step: '3. Discovery Worker',
      status: activeRun ? 'running' : inspectedRun?.status === 'failed' ? 'warn' : 'ok',
      value: activeRun
        ? `Running ${activeRun.log_summary?.progress ?? 10}%`
        : inspectedRun
          ? `${inspectedRun.jobs_found} found last run`
          : 'Ready to run',
      sub: setup.isPaused ? 'Scheduler paused' : 'Runs automatically',
      href: '#live-console',
    },
    {
      step: '4. Review & Apply Queue',
      status: queue.length > 0 ? 'running' : 'ok',
      value: `${queue.length} to review`,
      sub: `${kpis.draftCount} drafts ready`,
      href: '#review-queue',
    },
    {
      step: '5. Active Pipeline',
      status: 'ok',
      value: `${kpis.appliedCount} applied`,
      sub: `${kpis.repliedCount} replied • ${kpis.employeesReached} reached`,
      href: '/tracker',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Control Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div>
          <h1 className="text-xl font-bold">Job Search Control & Workflow</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Discovery & drafting run automatically on your schedule. All applications and emails are sent manually by you.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busyId === 'pause'}
            onClick={togglePause}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer ${
              setup.isPaused
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {setup.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {setup.isPaused ? 'Resume Schedule' : 'Pause Schedule'}
          </button>

          <TriggerWorkerButton
            isAgentRunning={Boolean(activeRun)}
            onTriggered={() => {
              setJustTriggered(true);
              setTimeout(() => void refreshDashboard(), 400);
            }}
          />
        </div>
      </div>

      {/* 5-Stage End-to-End Pipeline Flow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {workflowSteps.map((item) => (
          <Link
            key={item.step}
            href={item.href}
            className={`rounded-xl border p-3.5 transition-colors hover:border-blue-500/50 ${
              item.status === 'warn'
                ? 'border-amber-500/40 bg-amber-500/5'
                : item.status === 'running'
                  ? 'border-blue-500/40 bg-blue-500/5'
                  : 'border-[var(--border)] bg-[var(--surface)]'
            }`}
          >
            <div className="text-[11px] font-medium text-[var(--muted)]">{item.step}</div>
            <div className="text-sm font-bold mt-1 truncate">{item.value}</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">{item.sub}</div>
          </Link>
        ))}
      </div>

      {/* Live Execution Console (Compact strip when idle; expands live while running or when inspected) */}
      {(inspectedRun || justTriggered) && (
        <section
          id="live-console"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {activeRun || justTriggered ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
              ) : inspectedRun?.status === 'failed' ? (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>
                {activeRun || justTriggered ? 'Live Run: ' : 'Last Run: '}
                {inspectedRun?.log_summary?.message ||
                  (justTriggered ? 'Waiting for worker to start run...' : inspectedRun?.status)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
              {inspectedRun && (
                <>
                  <span>Found: <strong className="text-[var(--text)]">{inspectedRun.jobs_found}</strong></span>
                  <span>Matched: <strong className="text-[var(--text)]">{inspectedRun.jobs_matched}</strong></span>
                  <span>Drafted: <strong className="text-[var(--text)]">{inspectedRun.emails_drafted}</strong></span>
                </>
              )}
              {!activeRun && !justTriggered && (
                <button
                  type="button"
                  onClick={() => setShowLogs((v) => !v)}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:bg-[var(--surface-elevated)] cursor-pointer"
                >
                  {showLogs ? 'Hide Logs' : 'Inspect Logs'}
                </button>
              )}
            </div>
          </div>

          {(Boolean(activeRun) || justTriggered || showLogs) && (
            <div className="space-y-3 pt-1">
              <div className="h-1.5 w-full rounded-full bg-[var(--bg)] overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    inspectedRun?.status === 'failed'
                      ? 'bg-red-500'
                      : inspectedRun?.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${
                      inspectedRun?.log_summary?.progress ??
                      (inspectedRun?.status === 'completed' ? 100 : 12)
                    }%`,
                  }}
                />
              </div>

              {inspectedRun?.log_summary?.sourceResults &&
                inspectedRun.log_summary.sourceResults.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {inspectedRun.log_summary.sourceResults.map((sr) => (
                      <span
                        key={sr.source}
                        title={sr.error || `${sr.count} jobs fetched`}
                        className={`px-2 py-0.5 rounded-full text-[11px] border ${
                          sr.status === 'ok'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-500/30 bg-red-500/10 text-red-300'
                        }`}
                      >
                        {sr.source}: {sr.status === 'ok' ? `${sr.count} found` : 'error'}
                      </span>
                    ))}
                  </div>
                )}

              {inspectedRun?.log_summary?.events && inspectedRun.log_summary.events.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 max-h-40 overflow-y-auto font-mono text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5 text-[var(--muted)] mb-1 font-sans font-semibold">
                    <Terminal className="w-3.5 h-3.5" /> Run Event Log
                  </div>
                  {inspectedRun.log_summary.events
                    .slice()
                    .reverse()
                    .map((ev, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-[var(--muted)] shrink-0">
                          {new Date(ev.ts).toLocaleTimeString()}
                        </span>
                        <span className="text-blue-400 shrink-0">[{ev.step}]</span>
                        <span
                          className={
                            ev.status === 'error'
                              ? 'text-red-300'
                              : ev.status === 'ok'
                                ? 'text-emerald-300'
                                : 'text-[var(--text)]'
                          }
                        >
                          {ev.detail}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {inspectedRun?.error_message && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Warnings / Errors</span>
                    <button
                      type="button"
                      onClick={() => setShowErrors((v) => !v)}
                      className="text-[11px] underline cursor-pointer"
                    >
                      {showErrors ? 'Collapse' : 'Show full details'}
                    </button>
                  </div>
                  <div className="whitespace-pre-wrap text-[11px]">
                    {showErrors
                      ? inspectedRun.error_message
                      : inspectedRun.error_message.split('\n').slice(0, 2).join('\n')}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Step 4: Interactive Review & Manual Apply Queue */}
      <section
        id="review-queue"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">
              Review & Manual Apply Queue ({queue.length})
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Inspect matched roles, review or customize the human-like apply email, send manually, or open the portal.
            </p>
          </div>
          <Link href="/tracker" className="text-xs text-blue-400 hover:underline">
            Open Full Pipeline & Follow-Ups →
          </Link>
        </div>

        {actionMsg && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
            {actionMsg}
          </div>
        )}

        {queue.length === 0 ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-6 text-xs text-[var(--muted)]">
            No pending jobs waiting for review. Upload your resume and click <strong>Run Agent Now</strong> to discover & score matches.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Queue List */}
            <div className="lg:col-span-5 space-y-2 max-h-[540px] overflow-y-auto pr-1">
              {queue.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedQueueId(item.id)}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedItem?.id === item.id
                      ? 'border-blue-500 bg-[var(--surface-elevated)]'
                      : 'border-[var(--border)] bg-[var(--bg)] hover:border-blue-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs truncate">{item.job.title}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">
                        {item.job.company} • {item.job.source_name}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-300 shrink-0">
                      {item.job.match_score}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--muted)]">
                    <span className="uppercase">{item.status.replace('_', ' ')}</span>
                    {item.job.contact_email && (
                      <span className="text-emerald-300 inline-flex items-center gap-1 truncate max-w-[180px]">
                        <Mail className="w-3 h-3 shrink-0" /> {item.job.contact_email}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Job Action Workspace */}
            {selectedItem && (
              <div className="lg:col-span-7 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold">{selectedItem.job.title}</h3>
                    <p className="text-xs text-[var(--muted)]">
                      {selectedItem.job.company} • {selectedItem.job.location || 'Remote'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={selectedItem.job.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface-elevated)]"
                    >
                      Open Job <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      type="button"
                      disabled={busyId === selectedItem.id}
                      onClick={() => updateAppStatus(selectedItem.id, 'applied')}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 px-2.5 py-1.5 text-xs font-medium cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Applied
                    </button>
                    <button
                      type="button"
                      disabled={busyId === selectedItem.id}
                      onClick={() => updateAppStatus(selectedItem.id, 'skipped')}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-red-300 px-2.5 py-1.5 text-xs cursor-pointer"
                    >
                      <SkipForward className="w-3.5 h-3.5" /> Skip
                    </button>
                  </div>
                </div>

                {selectedItem.job.match_summary?.rationale && (
                  <div className="rounded-md bg-[var(--surface)] border border-[var(--border)] p-3 text-xs space-y-2">
                    <div className="text-[var(--muted)]">{selectedItem.job.match_summary.rationale}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedItem.job.match_summary.matchedSkills ?? []).slice(0, 6).map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px]"
                        >
                          ✓ {s}
                        </span>
                      ))}
                      {(selectedItem.job.match_summary.missingSkills ?? []).slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px]"
                        >
                          Gap: {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-300">
                      Initial Apply Email Draft (Manual Send Only)
                    </span>
                    <button
                      type="button"
                      disabled={busyId === selectedItem.id}
                      onClick={() => handleDraftAction('regenerate')}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> {initialEmail ? 'Regenerate' : 'Generate Draft'}
                    </button>
                  </div>

                  <input
                    type="email"
                    value={editRecipient}
                    onChange={(e) => setEditRecipient(e.target.value)}
                    placeholder="Recipient hiring email (e.g. hiring@company.com)"
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Email subject"
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                  />
                  <textarea
                    rows={6}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Draft email body..."
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-2 text-xs leading-relaxed"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDraftAction('copy')}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-elevated)] cursor-pointer"
                    >
                      <ClipboardCopy className="w-3.5 h-3.5" /> Copy
                    </button>
                    {initialEmail && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === selectedItem.id}
                          onClick={() => handleDraftAction('save')}
                          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-elevated)] cursor-pointer"
                        >
                          Save Edit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === selectedItem.id}
                          onClick={() => handleDraftAction('send_now')}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs font-semibold cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" /> Send Manually Now
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Somewhat Search Duplicate Checker */}
      <SomewhatSearchBar />

      {/* Run History Table (Click any run to inspect its sources & logs in the Console above) */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Run History (Click a row to inspect logs)</h2>
        </div>

        {runs.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No runs recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Trigger</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Stage / Result</th>
                  <th className="py-2 pr-4">Found</th>
                  <th className="py-2 pr-4">Matched</th>
                  <th className="py-2 pr-4">Drafted</th>
                  <th className="py-2">Employees Reached</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => {
                      setInspectedRunId(run.id);
                      setShowLogs(true);
                    }}
                    className={`border-b border-[var(--border)]/50 cursor-pointer hover:bg-[var(--surface-elevated)] ${
                      inspectedRun?.id === run.id ? 'bg-[var(--surface-elevated)]/70' : ''
                    }`}
                  >
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 uppercase">{run.trigger_type}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${
                          run.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : run.status === 'failed'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-blue-500/15 text-blue-300'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--muted)] max-w-[260px] truncate">
                      {run.log_summary?.message ?? run.log_summary?.stage ?? '—'}
                    </td>
                    <td className="py-2.5 pr-4">{run.jobs_found}</td>
                    <td className="py-2.5 pr-4">{run.jobs_matched}</td>
                    <td className="py-2.5 pr-4">{run.emails_drafted}</td>
                    <td className="py-2.5">{run.employees_reached}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
