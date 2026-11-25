'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
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
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [justTriggered, setJustTriggered] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
  const latestRun = runs[0] ?? null;
  const inspectedRun = activeRun ?? runs.find((r) => r.id === inspectedRunId) ?? latestRun ?? null;

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
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { is_paused: !setup.isPaused } }),
    });
    if (res.ok) toast.success(setup.isPaused ? 'Scheduler resumed' : 'Scheduler paused');
    await refreshDashboard();
    setBusyId(null);
  }

  async function updateAppStatus(appId: string, status: 'applied' | 'skipped') {
    setBusyId(appId);
    const res = await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId, status }),
    });
    if (res.ok) toast.success(status === 'applied' ? 'Marked as Applied!' : 'Skipped job');
    await refreshDashboard();
    setBusyId(null);
  }

  async function handleDraftAction(action: 'regenerate' | 'save' | 'send_now' | 'copy') {
    if (!selectedItem) return;
    if (action === 'copy') {
      await navigator.clipboard.writeText(`Subject: ${editSubject}\n\n${editBody}`);
      toast.success('Copied email to clipboard');
      return;
    }

    setBusyId(selectedItem.id);
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
        toast.success('Generated fresh human-like initial email');
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
        toast.success(action === 'send_now' ? 'Email sent manually!' : 'Draft edits saved');
      }
      await refreshDashboard();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const workflowSteps = [
    {
      step: '01',
      label: 'Resume & Profile',
      state: setup.hasResume ? 'ready' : 'action',
      value: setup.hasResume ? setup.resumeTitle || 'Active' : 'Upload Resume',
      sub: setup.targetRoles.slice(0, 2).join(', ') || 'Set target roles',
      href: '/resume',
    },
    {
      step: '02',
      label: 'Sources & Rules',
      state: 'ready',
      value:
        setup.sourcesCount > 0
          ? `${setup.enabledSourcesCount}/${setup.sourcesCount} active`
          : '10 Default Feeds',
      sub: `Min ${setup.minMatchScore}% • ${setup.cronSchedule}`,
      href: '/settings',
    },
    {
      step: '03',
      label: 'Discovery Worker',
      state: activeRun ? 'active' : latestRun?.status === 'failed' ? 'action' : 'ready',
      value: activeRun
        ? `Running ${activeRun.log_summary?.progress ?? 10}%`
        : latestRun
          ? `${latestRun.jobs_found} found last run`
          : 'Ready',
      sub: setup.isPaused ? 'Scheduler paused' : 'Runs on schedule',
      href: '#live-bar',
    },
    {
      step: '04',
      label: 'Review & Apply',
      state: queue.length > 0 ? 'active' : 'ready',
      value: `${queue.length} waiting`,
      sub: `${kpis.draftCount} drafts ready`,
      href: '#review-queue',
    },
    {
      step: '05',
      label: 'Applied Pipeline',
      state: 'ready',
      value: `${kpis.appliedCount} applied`,
      sub: `${kpis.repliedCount} replies • ${kpis.employeesReached} reached`,
      href: '/tracker',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-5 ring-1 ring-white/[0.03]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Workflow Control Center</h1>
            <Badge variant="emerald">Manual Apply Only</Badge>
          </div>
          <p className="text-xs text-zinc-400">
            Autonomous discovery & matching runs 24/7. Review matches, edit human-like drafts, and apply manually below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant={setup.isPaused ? 'success' : 'outline'}
            disabled={busyId === 'pause'}
            onClick={togglePause}
          >
            {setup.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {setup.isPaused ? 'Resume Schedule' : 'Pause Schedule'}
          </Button>
          <TriggerWorkerButton
            isAgentRunning={Boolean(activeRun)}
            onTriggered={() => {
              setJustTriggered(true);
              setTimeout(() => void refreshDashboard(), 400);
            }}
          />
        </div>
      </div>

      {/* 5-Stage Pipeline Flow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {workflowSteps.map((item) => (
          <Link
            key={item.step}
            href={item.href}
            className={cn(
              'group rounded-2xl border p-4 transition-all hover:-translate-y-0.5',
              item.state === 'action'
                ? 'border-amber-500/35 bg-amber-500/[0.05] hover:border-amber-500/60'
                : item.state === 'active'
                  ? 'border-indigo-500/40 bg-indigo-500/[0.07] hover:border-indigo-400/70'
                  : 'border-zinc-800/90 bg-zinc-950/70 hover:border-zinc-700',
            )}
          >
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="font-mono text-zinc-500">{item.step}</span>
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  item.state === 'action'
                    ? 'bg-amber-400'
                    : item.state === 'active'
                      ? 'bg-indigo-400 animate-pulse'
                      : 'bg-emerald-400',
                )}
              />
            </div>
            <div className="text-xs font-medium text-zinc-400 mt-1.5">{item.label}</div>
            <div className="text-sm font-bold text-zinc-100 mt-0.5 truncate">{item.value}</div>
            <div className="text-[11px] text-zinc-500 mt-1 truncate">{item.sub}</div>
          </Link>
        ))}
      </div>

      {/* Compact Live Status Strip (expands only while running; logs open cleanly in Modal) */}
      {(latestRun || justTriggered) && (
        <div
          id="live-bar"
          className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 px-4 py-3 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              {activeRun || justTriggered ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              ) : latestRun?.status === 'failed' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className="font-medium text-zinc-200">
                {activeRun || justTriggered
                  ? activeRun?.log_summary?.message || 'Starting autonomous run...'
                  : latestRun?.log_summary?.message || `Last run ${latestRun?.status}`}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs text-zinc-400">
              {latestRun && (
                <div className="hidden sm:flex items-center gap-3">
                  <span>Found <strong className="text-zinc-100">{latestRun.jobs_found}</strong></span>
                  <span>Matched <strong className="text-zinc-100">{latestRun.jobs_matched}</strong></span>
                  <span>Drafted <strong className="text-zinc-100">{latestRun.emails_drafted}</strong></span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (latestRun) setInspectedRunId(latestRun.id);
                  setLogDialogOpen(true);
                }}
              >
                <Terminal className="w-3.5 h-3.5" /> Inspect Run Logs
              </Button>
            </div>
          </div>

          {(Boolean(activeRun) || justTriggered) && (
            <div className="h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${activeRun?.log_summary?.progress ?? 12}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Primary Review & Manual Apply Queue */}
      <Card id="review-queue">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-zinc-800/80 pb-4">
          <div>
            <CardTitle>Review & Manual Apply Queue ({queue.length})</CardTitle>
            <CardDescription>
              High-match roles awaiting your review. Customize the human-like apply email, send manually, or open the link.
            </CardDescription>
          </div>
          <Link
            href="/tracker"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
          >
            Full Job Pipeline <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>

        <CardContent className="pt-4">
          {queue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center space-y-2">
              <p className="text-sm font-medium text-zinc-300">Your review queue is clear</p>
              <p className="text-xs text-zinc-500">
                Click <strong>Run Agent Now</strong> to discover new matched jobs, or browse all discovered roles in the Job Pipeline.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left List */}
              <div className="lg:col-span-5 space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {queue.map((item) => {
                  const active = selectedItem?.id === item.id;
                  const initials = (item.job.company[0] ?? 'J').toUpperCase();
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedQueueId(item.id)}
                      className={cn(
                        'rounded-xl border p-3.5 cursor-pointer transition-all',
                        active
                          ? 'border-indigo-500/60 bg-indigo-500/[0.08] ring-1 ring-indigo-500/20'
                          : 'border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-xs text-zinc-100 truncate">
                              {item.job.title}
                            </div>
                            <Badge variant="indigo" className="shrink-0">
                              {item.job.match_score}%
                            </Badge>
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {item.job.company} • {item.job.location || 'Remote'}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <Badge variant="cyan" className="text-[10px] py-0 px-2">
                              {item.job.source_name}
                            </Badge>
                            {item.job.contact_email && (
                              <span className="text-[11px] text-emerald-300 inline-flex items-center gap-1 truncate max-w-[160px]">
                                <Mail className="w-3 h-3 shrink-0" /> {item.job.contact_email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Workspace */}
              {selectedItem && (
                <div className="lg:col-span-7 rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="cyan">{selectedItem.job.source_name}</Badge>
                        <Badge variant="indigo">{selectedItem.job.match_score}% Match</Badge>
                      </div>
                      <h3 className="text-base font-bold text-zinc-100">{selectedItem.job.title}</h3>
                      <p className="text-xs text-zinc-400">
                        {selectedItem.job.company} • {selectedItem.job.location || 'Remote'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={selectedItem.job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
                      >
                        Open Post <ExternalLink className="w-3 h-3" />
                      </a>
                      <Button
                        size="sm"
                        variant="success"
                        disabled={busyId === selectedItem.id}
                        onClick={() => updateAppStatus(selectedItem.id, 'applied')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Applied
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === selectedItem.id}
                        onClick={() => updateAppStatus(selectedItem.id, 'skipped')}
                      >
                        <SkipForward className="w-3.5 h-3.5" /> Skip
                      </Button>
                    </div>
                  </div>

                  <Tabs defaultValue="email">
                    <TabsList>
                      <TabsTrigger value="email">Apply Email Composer</TabsTrigger>
                      <TabsTrigger value="analysis">Match Analysis & Job Details</TabsTrigger>
                    </TabsList>

                    <TabsContent value="email" className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">
                          Human-like initial application draft (sent only when you click Send)
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === selectedItem.id}
                          onClick={() => handleDraftAction('regenerate')}
                        >
                          <RefreshCw className="w-3 h-3" />
                          {initialEmail ? 'Regenerate' : 'Generate Draft'}
                        </Button>
                      </div>

                      <Input
                        type="email"
                        value={editRecipient}
                        onChange={(e) => setEditRecipient(e.target.value)}
                        placeholder="Hiring manager / recruiter email (e.g. jobs@company.com)"
                      />
                      <Input
                        type="text"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        placeholder="Subject line"
                        className="font-medium"
                      />
                      <Textarea
                        rows={7}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        placeholder="Email body..."
                      />

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleDraftAction('copy')}>
                          <ClipboardCopy className="w-3.5 h-3.5" /> Copy Email
                        </Button>
                        {initialEmail && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyId === selectedItem.id}
                              onClick={() => handleDraftAction('save')}
                            >
                              Save Edit
                            </Button>
                            <Button
                              size="sm"
                              disabled={busyId === selectedItem.id}
                              onClick={() => handleDraftAction('send_now')}
                            >
                              <Send className="w-3.5 h-3.5" /> Send Manually Now
                            </Button>
                          </>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="analysis" className="space-y-3">
                      {selectedItem.job.match_summary?.rationale && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-2.5 text-xs">
                          <div className="font-semibold text-indigo-300">AI Match Rationale</div>
                          <p className="text-zinc-300 leading-relaxed">
                            {selectedItem.job.match_summary.rationale}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(selectedItem.job.match_summary.matchedSkills ?? []).map((s) => (
                              <Badge key={s} variant="emerald" className="text-[10px]">
                                ✓ {s}
                              </Badge>
                            ))}
                            {(selectedItem.job.match_summary.missingSkills ?? []).map((s) => (
                              <Badge key={s} variant="amber" className="text-[10px]">
                                Gap: {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5 text-xs text-zinc-300 max-h-52 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {selectedItem.job.description || 'No description excerpt stored.'}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Somewhat Search */}
      <SomewhatSearchBar />

      {/* Compact Run History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Run History</CardTitle>
          <CardDescription>Click any run to inspect source counts and execution logs.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-xs text-zinc-500">No runs recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400">
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 pr-4 font-medium">Trigger</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Found</th>
                    <th className="py-2 pr-4 font-medium">Matched</th>
                    <th className="py-2 pr-4 font-medium">Drafted</th>
                    <th className="py-2 font-medium">Employees Reached</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      onClick={() => {
                        setInspectedRunId(run.id);
                        setLogDialogOpen(true);
                      }}
                      className="border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-900/60 transition-colors"
                    >
                      <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-200">
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 uppercase text-zinc-400">{run.trigger_type}</td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={
                            run.status === 'completed'
                              ? 'emerald'
                              : run.status === 'failed'
                                ? 'red'
                                : 'indigo'
                          }
                          className="uppercase text-[10px]"
                        >
                          {run.status}
                        </Badge>
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
        </CardContent>
      </Card>

      {/* Run Logs & Per-Source Breakdown Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              Agent Run Telemetry
            </DialogTitle>
            <DialogDescription>
              {inspectedRun
                ? `${new Date(inspectedRun.started_at).toLocaleString()} • ${inspectedRun.status.toUpperCase()}`
                : 'No run selected'}
            </DialogDescription>
          </DialogHeader>

          {inspectedRun && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Found', val: inspectedRun.jobs_found },
                  { label: 'Matched', val: inspectedRun.jobs_matched },
                  { label: 'Drafted', val: inspectedRun.emails_drafted },
                  { label: 'Reached', val: inspectedRun.employees_reached },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5"
                  >
                    <div className="text-[11px] text-zinc-400">{stat.label}</div>
                    <div className="text-base font-bold text-zinc-100">{stat.val}</div>
                  </div>
                ))}
              </div>

              {inspectedRun.log_summary?.sourceResults &&
                inspectedRun.log_summary.sourceResults.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-300">Source Breakdown</div>
                    <div className="flex flex-wrap gap-1.5">
                      {inspectedRun.log_summary.sourceResults.map((sr) => (
                        <Badge
                          key={sr.source}
                          variant={sr.status === 'ok' ? 'emerald' : 'red'}
                          title={sr.error || `${sr.count} jobs`}
                        >
                          {sr.source}: {sr.status === 'ok' ? `${sr.count} found` : 'error'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {inspectedRun.log_summary?.events && inspectedRun.log_summary.events.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1.5">
                  {inspectedRun.log_summary.events
                    .slice()
                    .reverse()
                    .map((ev, idx) => (
                      <div key={idx} className="flex gap-2">
                        <span className="text-zinc-500 shrink-0">
                          {new Date(ev.ts).toLocaleTimeString()}
                        </span>
                        <span className="text-indigo-400 shrink-0">[{ev.step}]</span>
                        <span
                          className={
                            ev.status === 'error'
                              ? 'text-red-300'
                              : ev.status === 'ok'
                                ? 'text-emerald-300'
                                : 'text-zinc-200'
                          }
                        >
                          {ev.detail}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {inspectedRun.error_message && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {inspectedRun.error_message}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
