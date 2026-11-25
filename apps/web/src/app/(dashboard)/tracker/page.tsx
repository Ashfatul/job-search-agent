'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ExternalLink,
  List,
  Mail,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@job-bot/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface OutreachEmailRow {
  id: string;
  recipient_email: string | null;
  email_type: 'initial' | 'followup_1' | 'followup_2';
  subject: string;
  body: string;
  status: string;
  sent_at: string | null;
}

interface ApplicationRow {
  id: string;
  status: ApplicationStatus;
  channel: string;
  applied_at: string | null;
  created_at: string;
  notes: string;
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
  outreach_emails: OutreachEmailRow[];
}

type SectionTab = 'primary' | 'applied' | 'all' | 'closed';

const APPLIED_STATUSES = new Set<ApplicationStatus>([
  'applied',
  'followed_up',
  'replied',
  'interviewing',
  'offer',
]);
const PRIMARY_STATUSES = new Set<ApplicationStatus>(['matched', 'draft_ready']);
const CLOSED_STATUSES = new Set<ApplicationStatus>(['rejected', 'skipped', 'archived']);

const BOARD_STAGES: Array<{ label: string; statuses: ApplicationStatus[] }> = [
  { label: 'Filtered / Draft Ready', statuses: ['matched', 'draft_ready'] },
  { label: 'Applied', statuses: ['applied'] },
  { label: 'Followed Up', statuses: ['followed_up'] },
  { label: 'Replied & Interviewing', statuses: ['replied', 'interviewing', 'offer'] },
  { label: 'Discovered / Closed', statuses: ['discovered', 'rejected', 'skipped', 'archived'] },
];

const PAGE_SIZE = 20;

export default function TrackerPage() {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [section, setSection] = useState<SectionTab>('primary');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [selected, setSelected] = useState<ApplicationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [theirReply, setTheirReply] = useState('');
  const [followupNotes, setFollowupNotes] = useState('');
  const [notesDraft, setNotesDraft] = useState('');

  async function loadApplications() {
    setLoading(true);
    const res = await fetch('/api/applications?status=all', { cache: 'no-store' });
    const data = await res.json();
    const list = (data.applications ?? []) as ApplicationRow[];
    setApplications(list);
    if (selected) {
      const updated = list.find((a) => a.id === selected.id) ?? null;
      setSelected(updated);
      if (updated) setNotesDraft(updated.notes ?? '');
    } else if (list[0]) {
      setSelected(list[0]);
      setNotesDraft(list[0].notes ?? '');
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadApplications();
  }, []);

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    for (const app of applications) {
      if (app.job?.source_name) set.add(app.job.source_name);
    }
    return Array.from(set).sort();
  }, [applications]);

  const sectionCounts = useMemo(
    () => ({
      primary: applications.filter((a) => PRIMARY_STATUSES.has(a.status)).length,
      applied: applications.filter((a) => APPLIED_STATUSES.has(a.status)).length,
      all: applications.length,
      closed: applications.filter((a) => CLOSED_STATUSES.has(a.status)).length,
    }),
    [applications],
  );

  const filteredApps = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return applications.filter((a) => {
      if (section === 'primary' && !PRIMARY_STATUSES.has(a.status)) return false;
      if (section === 'applied' && !APPLIED_STATUSES.has(a.status)) return false;
      if (section === 'closed' && !CLOSED_STATUSES.has(a.status)) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (sourceFilter !== 'all' && a.job?.source_name !== sourceFilter) return false;

      if (!q) return true;
      const emailPool = [
        a.job?.contact_email ?? '',
        ...(a.outreach_emails ?? []).map((e) => e.recipient_email ?? ''),
      ]
        .join(' ')
        .toLowerCase();

      return (
        a.job?.title?.toLowerCase().includes(q) ||
        a.job?.company?.toLowerCase().includes(q) ||
        a.job?.source_name?.toLowerCase().includes(q) ||
        (a.job?.location ?? '').toLowerCase().includes(q) ||
        emailPool.includes(q)
      );
    });
  }, [applications, section, statusFilter, sourceFilter, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredApps.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedApps = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredApps.slice(start, start + PAGE_SIZE);
  }, [filteredApps, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [section, statusFilter, sourceFilter, searchText]);

  async function updateApplication(id: string, payload: { status?: ApplicationStatus; notes?: string }) {
    setBusyId(id);
    const res = await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    });
    if (res.ok) toast.success(payload.status ? `Status updated to ${payload.status}` : 'Note saved');
    else toast.error('Failed to update application');
    await loadApplications();
    setBusyId(null);
  }

  async function generateDrafts(
    applicationId: string,
    emailType: 'initial' | 'followup_1' | 'followup_2' = 'initial',
  ) {
    setBusyId(applicationId);
    const res = await fetch('/api/outreach/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId,
        emailType,
        theirReply: emailType === 'initial' ? undefined : theirReply,
        extraNotes: emailType === 'initial' ? undefined : followupNotes,
      }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || 'Failed to draft email');
    else
      toast.success(
        emailType === 'initial'
          ? 'Generated fresh human-like initial apply email!'
          : `Generated on-demand ${emailType.replace('_', ' ')} draft!`,
      );
    await loadApplications();
    setBusyId(null);
  }

  async function handleEmailAction(
    email: OutreachEmailRow,
    action: 'save' | 'send_now',
    editedRecipient: string,
    editedSubject: string,
    editedBody: string,
  ) {
    setBusyId(email.id);
    const res = await fetch('/api/outreach/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailId: email.id,
        recipientEmail: editedRecipient,
        subject: editedSubject,
        bodyText: editedBody,
        action,
      }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || 'Email action failed');
    else toast.success(action === 'send_now' ? 'Email sent manually!' : 'Email draft saved.');
    await loadApplications();
    setBusyId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Job Pipeline & Application Area</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Primary tab shows filtered matches; switch to Job Applied Area or All Discovered jobs anytime.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1 self-start">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors',
              viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors',
              viewMode === 'board' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            <Columns3 className="w-3.5 h-3.5" /> Board
          </button>
        </div>
      </div>

      {/* Clear Area Separation */}
      <Tabs
        value={section}
        onValueChange={(val) => {
          setSection(val as SectionTab);
          setStatusFilter('all');
        }}
      >
        <TabsList className="w-full justify-start">
          <TabsTrigger value="primary">
            Filtered Matches <Badge variant="indigo">{sectionCounts.primary}</Badge>
          </TabsTrigger>
          <TabsTrigger value="applied">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Job Applied Area <Badge variant="emerald">{sectionCounts.applied}</Badge>
          </TabsTrigger>
          <TabsTrigger value="all">
            All Discovered <Badge>{sectionCounts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="closed">
            Skipped / Closed <Badge>{sectionCounts.closed}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by company, email, job title, location, or source..."
            className="pl-9"
          />
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="md:col-span-3 h-9 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 text-xs text-zinc-200 focus:border-indigo-500/70 focus:outline-none"
        >
          <option value="all">All Sources ({availableSources.length})</option>
          {availableSources.map((src) => (
            <option key={src} value={src}>
              Source: {src}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="md:col-span-3 h-9 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 text-xs text-zinc-200 focus:border-indigo-500/70 focus:outline-none"
        >
          <option value="all">All Statuses in Tab</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              Status: {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {BOARD_STAGES.map((col) => {
            const colItems = filteredApps.filter((a) => col.statuses.includes(a.status));
            return (
              <Card key={col.label} className="p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold px-1">
                  <span className="text-zinc-200">{col.label}</span>
                  <Badge>{colItems.length}</Badge>
                </div>
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5">
                  {colItems.map((app) => (
                    <div
                      key={app.id}
                      onClick={() => {
                        setSelected(app);
                        setNotesDraft(app.notes ?? '');
                        setViewMode('list');
                      }}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 cursor-pointer hover:border-indigo-500/50 text-xs transition-colors"
                    >
                      <div className="font-semibold text-zinc-100 truncate">{app.job?.title}</div>
                      <div className="text-[11px] text-zinc-400 truncate">{app.job?.company}</div>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <Badge variant="cyan" className="py-0 px-1.5 text-[10px]">
                          {app.job?.source_name}
                        </Badge>
                        <span className="text-indigo-300 font-semibold">
                          {app.job?.match_score ?? 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column */}
          <div className="lg:col-span-5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span>
                Showing <strong className="text-zinc-200">{pagedApps.length}</strong> of{' '}
                <strong className="text-zinc-200">{filteredApps.length}</strong> jobs
              </span>
              {totalPages > 1 && (
                <span>
                  Page {currentPage} of {totalPages}
                </span>
              )}
            </div>

            {loading ? (
              <Card className="p-6 text-xs text-zinc-400">Loading jobs...</Card>
            ) : pagedApps.length === 0 ? (
              <Card className="p-8 text-center text-xs text-zinc-400">
                No jobs in this view match your search/filters.
              </Card>
            ) : (
              <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
                {pagedApps.map((app) => {
                  const active = selected?.id === app.id;
                  const initials = (app.job?.company?.[0] ?? 'J').toUpperCase();
                  return (
                    <div
                      key={app.id}
                      onClick={() => {
                        setSelected(app);
                        setNotesDraft(app.notes ?? '');
                      }}
                      className={cn(
                        'rounded-2xl border p-3.5 cursor-pointer transition-all',
                        active
                          ? 'border-indigo-500/60 bg-indigo-500/[0.08] ring-1 ring-indigo-500/20'
                          : 'border-zinc-800/80 bg-zinc-950/70 hover:border-zinc-700',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-xs font-bold text-zinc-200 shrink-0">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold text-xs text-zinc-100 truncate">
                              {app.job?.title}
                            </div>
                            <Badge variant="indigo" className="shrink-0">
                              {app.job?.match_score ?? 0}%
                            </Badge>
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {app.job?.company} • {app.job?.location || 'Remote'}
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="cyan" className="py-0 px-2 text-[10px]">
                                {app.job?.source_name}
                              </Badge>
                              <select
                                value={app.status}
                                disabled={busyId === app.id}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  updateApplication(app.id, {
                                    status: e.target.value as ApplicationStatus,
                                  })
                                }
                                className="rounded-md bg-zinc-900 border border-zinc-700/80 px-1.5 py-0.5 text-[10px] text-zinc-200 focus:outline-none"
                              >
                                {APPLICATION_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-2 text-[11px]">
                              {app.applied_at && (
                                <span className="text-emerald-300">
                                  Applied {new Date(app.applied_at).toLocaleDateString()}
                                </span>
                              )}
                              {app.job?.contact_email && (
                                <span className="inline-flex items-center gap-1 text-emerald-300 max-w-[140px] truncate">
                                  <Mail className="w-3 h-3 shrink-0" /> {app.job.contact_email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </Button>
                <span className="text-xs text-zinc-400">
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7">
            {!selected ? (
              <Card className="p-8 text-center text-xs text-zinc-400">
                Select a job on the left to inspect source, match details, and manage outreach.
              </Card>
            ) : (
              <Card>
                <CardHeader className="border-b border-zinc-800/80 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <Badge variant="cyan">Found via {selected.job.source_name}</Badge>
                        <Badge variant="indigo">{selected.job.match_score}% Match</Badge>
                        {selected.applied_at && (
                          <Badge variant="emerald">
                            Applied {new Date(selected.applied_at).toLocaleDateString()} via{' '}
                            {selected.channel}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-base">{selected.job.title}</CardTitle>
                      <CardDescription>
                        {selected.job.company} • {selected.job.location || 'Remote/Unspecified'}
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={selected.job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
                      >
                        Open Post <ExternalLink className="w-3 h-3" />
                      </a>
                      <Button
                        size="sm"
                        onClick={() => generateDrafts(selected.id, 'initial')}
                        disabled={busyId === selected.id}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {selected.outreach_emails?.some((e) => e.email_type === 'initial')
                          ? 'Regenerate Initial'
                          : 'Draft Initial Email'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-5">
                  <Tabs defaultValue="outreach">
                    <TabsList>
                      <TabsTrigger value="outreach">Outreach & Reply Follow-Up</TabsTrigger>
                      <TabsTrigger value="details">Match Analysis & Description</TabsTrigger>
                    </TabsList>

                    <TabsContent value="outreach" className="space-y-4">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
                        <div className="text-xs font-semibold text-zinc-300">Application Notes</div>
                        <div className="flex gap-2">
                          <Input
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            placeholder="Add interview dates, salary info, or contact notes..."
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => updateApplication(selected.id, { notes: notesDraft })}
                          >
                            Save
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(selected.outreach_emails ?? []).map((email) => (
                          <EmailEditorCard
                            key={email.id}
                            email={email}
                            defaultRecipient={
                              email.recipient_email || selected.job.contact_email || ''
                            }
                            busy={busyId === email.id}
                            onAction={(action, recipient, subject, body) =>
                              handleEmailAction(email, action, recipient, subject, body)
                            }
                          />
                        ))}
                      </div>

                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-indigo-300">
                            On-Demand Follow-Up / Reply Generator
                          </div>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Follow-ups are never pre-generated. Paste their reply (if any) or instructions to draft one on demand.
                          </p>
                        </div>
                        <Textarea
                          rows={3}
                          value={theirReply}
                          onChange={(e) => setTheirReply(e.target.value)}
                          placeholder="Paste the recruiter/employer reply here (optional)..."
                        />
                        <Input
                          value={followupNotes}
                          onChange={(e) => setFollowupNotes(e.target.value)}
                          placeholder="Extra notes (e.g. available Tue/Thu afternoon, highlight Next.js work)"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === selected.id}
                            onClick={() => generateDrafts(selected.id, 'followup_1')}
                          >
                            Draft Follow-Up / Reply #1
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === selected.id}
                            onClick={() => generateDrafts(selected.id, 'followup_2')}
                          >
                            Draft Follow-Up #2
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="details" className="space-y-3">
                      {selected.job.match_summary?.rationale && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs space-y-2">
                          <div className="font-semibold text-indigo-300">
                            Match Analysis ({selected.job.match_score}%)
                          </div>
                          <p className="text-zinc-300 leading-relaxed">
                            {selected.job.match_summary.rationale}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(selected.job.match_summary.matchedSkills ?? []).map((s) => (
                              <Badge key={s} variant="emerald" className="text-[10px]">
                                ✓ {s}
                              </Badge>
                            ))}
                            {(selected.job.match_summary.missingSkills ?? []).map((s) => (
                              <Badge key={s} variant="amber" className="text-[10px]">
                                Gap: {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs text-zinc-300 max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {selected.job.description || 'No description stored.'}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmailEditorCard({
  email,
  defaultRecipient,
  busy,
  onAction,
}: {
  email: OutreachEmailRow;
  defaultRecipient: string;
  busy: boolean;
  onAction: (action: 'save' | 'send_now', recipient: string, subject: string, body: string) => void;
}) {
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-indigo-300">
          {email.email_type.replace('_', ' ')}
        </span>
        <Badge variant={email.status === 'sent' ? 'emerald' : 'default'} className="uppercase text-[10px]">
          {email.status}
        </Badge>
      </div>

      <Input
        type="email"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Hiring manager / recruiter email (e.g. jobs@company.com)"
      />
      <Input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="font-medium"
      />
      <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />

      {email.status !== 'sent' && email.status !== 'cancelled' && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction('save', recipient, subject, body)}
          >
            Save Edit
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onAction('send_now', recipient, subject, body)}
          >
            <Send className="w-3 h-3" /> Send Manually Now
          </Button>
        </div>
      )}
    </div>
  );
}
