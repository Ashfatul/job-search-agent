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
import { APPLICATION_STATUSES, type ApplicationStatus } from '@job-bot/shared';

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
  const [notice, setNotice] = useState<string | null>(null);
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
    await fetch('/api/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    });
    await loadApplications();
    setBusyId(null);
  }

  async function generateDrafts(
    applicationId: string,
    emailType: 'initial' | 'followup_1' | 'followup_2' = 'initial',
  ) {
    setBusyId(applicationId);
    setNotice(null);
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
    if (!res.ok) setNotice(data.error || 'Failed to draft email');
    else
      setNotice(
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
    setNotice(null);
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
    if (!res.ok) setNotice(data.error || 'Email action failed');
    else setNotice(action === 'send_now' ? 'Email sent manually!' : 'Email draft saved.');
    await loadApplications();
    setBusyId(null);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Job Pipeline & Application Area</h1>
          <p className="text-xs text-[var(--muted)]">
            Primary tab shows filtered matches; switch tabs to view your Applied Area or All Discovered jobs. Search by title, company, email, or source.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 self-start">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1.5 rounded-md text-xs inline-flex items-center gap-1 cursor-pointer ${
              viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-[var(--muted)]'
            }`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            className={`px-2.5 py-1.5 rounded-md text-xs inline-flex items-center gap-1 cursor-pointer ${
              viewMode === 'board' ? 'bg-blue-600 text-white' : 'text-[var(--muted)]'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" /> Board
          </button>
        </div>
      </div>

      {/* Clear Area Separation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {(
          [
            { id: 'primary', label: 'Filtered Matches (Primary)', count: sectionCounts.primary },
            { id: 'applied', label: 'Job Applied Area', count: sectionCounts.applied },
            { id: 'all', label: 'All Discovered Jobs', count: sectionCounts.all },
            { id: 'closed', label: 'Skipped / Closed', count: sectionCounts.closed },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setSection(tab.id);
              setStatusFilter('all');
            }}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold border transition-colors cursor-pointer ${
              section === tab.id
                ? tab.id === 'applied'
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.id === 'applied' && <CheckCircle2 className="w-3.5 h-3.5" />}
            <span>{tab.label}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--bg)] text-[10px]">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search & Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by company, email, job title, location, or source..."
            className="w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="md:col-span-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-xs"
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
          className="md:col-span-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-xs"
        >
          <option value="all">All Statuses in Tab</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              Status: {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs text-blue-200">
          {notice}
        </div>
      )}

      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {BOARD_STAGES.map((col) => {
            const colItems = filteredApps.filter((a) => col.statuses.includes(a.status));
            return (
              <div
                key={col.label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{col.label}</span>
                  <span className="px-2 py-0.5 rounded-full bg-[var(--bg)] text-[10px]">
                    {colItems.length}
                  </span>
                </div>
                <div className="space-y-2 max-h-[440px] overflow-y-auto">
                  {colItems.map((app) => (
                    <div
                      key={app.id}
                      onClick={() => {
                        setSelected(app);
                        setNotesDraft(app.notes ?? '');
                        setViewMode('list');
                      }}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 cursor-pointer hover:border-blue-500/50 text-xs"
                    >
                      <div className="font-semibold truncate">{app.job?.title}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">{app.job?.company}</div>
                      <div className="mt-1.5 flex items-center justify-between text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-slate-300">
                          {app.job?.source_name}
                        </span>
                        <span className="text-blue-300">{app.job?.match_score ?? 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Clean Paginated Job List */}
          <div className="lg:col-span-5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs text-[var(--muted)] px-1">
              <span>
                Showing {pagedApps.length} of {filteredApps.length} jobs
              </span>
              {totalPages > 1 && (
                <span>
                  Page {currentPage} of {totalPages}
                </span>
              )}
            </div>

            {loading ? (
              <div className="text-sm text-[var(--muted)]">Loading jobs...</div>
            ) : pagedApps.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-xs text-[var(--muted)]">
                No jobs in this view match your search/filters.
              </div>
            ) : (
              <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
                {pagedApps.map((app) => (
                  <div
                    key={app.id}
                    onClick={() => {
                      setSelected(app);
                      setNotesDraft(app.notes ?? '');
                    }}
                    className={`rounded-xl border p-3.5 cursor-pointer transition-colors ${
                      selected?.id === app.id
                        ? 'border-blue-500 bg-[var(--surface-elevated)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-blue-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{app.job?.title}</div>
                        <div className="text-xs text-[var(--muted)] truncate">
                          {app.job?.company} • {app.job?.location || 'Remote'}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 shrink-0">
                        {app.job?.match_score ?? 0}%
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-[var(--bg)] border border-[var(--border)] text-[10px] font-medium text-cyan-300">
                          {app.job?.source_name}
                        </span>
                        <select
                          value={app.status}
                          disabled={busyId === app.id}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            updateApplication(app.id, { status: e.target.value as ApplicationStatus })
                          }
                          className="rounded-md bg-[var(--bg)] border border-[var(--border)] px-1.5 py-0.5 text-[11px]"
                        >
                          {APPLICATION_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
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
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <span className="text-xs text-[var(--muted)]">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs disabled:opacity-40 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Detail & Outreach Workspace */}
          <div className="lg:col-span-7">
            {!selected ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
                Select a job on the left to inspect source, match details, and manage outreach.
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-medium">
                        Found via {selected.job.source_name}
                      </span>
                      {selected.applied_at && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px]">
                          Applied {new Date(selected.applied_at).toLocaleDateString()} via {selected.channel}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold">{selected.job.title}</h2>
                    <p className="text-xs text-[var(--muted)]">
                      {selected.job.company} • {selected.job.location || 'Remote/Unspecified'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={selected.job.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-elevated)]"
                    >
                      Open Post <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => generateDrafts(selected.id, 'initial')}
                      disabled={busyId === selected.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {selected.outreach_emails?.some((e) => e.email_type === 'initial')
                        ? 'Regenerate Initial Draft'
                        : 'Draft Initial Apply Email'}
                    </button>
                  </div>
                </div>

                {selected.job.match_summary?.rationale && (
                  <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] p-3 text-xs space-y-2">
                    <div className="font-semibold text-blue-300">
                      Match Analysis ({selected.job.match_score}%)
                    </div>
                    <p className="text-[var(--muted)]">{selected.job.match_summary.rationale}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected.job.match_summary.matchedSkills ?? []).map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px]"
                        >
                          ✓ {s}
                        </span>
                      ))}
                      {(selected.job.match_summary.missingSkills ?? []).map((s) => (
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

                <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] p-3 space-y-2">
                  <div className="text-xs font-semibold">Application Notes</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Add interview dates, salary info, or contact notes..."
                      className="flex-1 rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => updateApplication(selected.id, { notes: notesDraft })}
                      className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-elevated)] cursor-pointer"
                    >
                      Save Note
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {(selected.outreach_emails ?? []).map((email) => (
                    <EmailEditorCard
                      key={email.id}
                      email={email}
                      defaultRecipient={email.recipient_email || selected.job.contact_email || ''}
                      busy={busyId === email.id}
                      onAction={(action, recipient, subject, body) =>
                        handleEmailAction(email, action, recipient, subject, body)
                      }
                    />
                  ))}
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-blue-300">
                      On-Demand Follow-Up / Reply Generator
                    </div>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5">
                      Follow-ups are never pre-generated. Paste their reply (if any) or instructions to draft one on demand.
                    </p>
                  </div>
                  <textarea
                    rows={3}
                    value={theirReply}
                    onChange={(e) => setTheirReply(e.target.value)}
                    placeholder="Paste the recruiter/employer reply here (optional)..."
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-2 text-xs"
                  />
                  <input
                    type="text"
                    value={followupNotes}
                    onChange={(e) => setFollowupNotes(e.target.value)}
                    placeholder="Extra notes (e.g. available Tue/Thu afternoon, highlight Next.js work)"
                    className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === selected.id}
                      onClick={() => generateDrafts(selected.id, 'followup_1')}
                      className="rounded-md border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-300 cursor-pointer"
                    >
                      Draft Follow-Up / Reply #1
                    </button>
                    <button
                      type="button"
                      disabled={busyId === selected.id}
                      onClick={() => generateDrafts(selected.id, 'followup_2')}
                      className="rounded-md border border-[var(--border)] hover:bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium cursor-pointer"
                    >
                      Draft Follow-Up #2
                    </button>
                  </div>
                </div>
              </div>
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3.5 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-blue-300">
          {email.email_type.replace('_', ' ')}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[10px] uppercase">
          {email.status}
        </span>
      </div>

      <input
        type="email"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Hiring manager / recruiter email (e.g. jobs@company.com)"
        className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs"
      />
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
      />
      <textarea
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-md bg-[var(--surface)] border border-[var(--border)] px-2.5 py-2 text-xs leading-relaxed"
      />

      {email.status !== 'sent' && email.status !== 'cancelled' && (
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => onAction('save', recipient, subject, body)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--surface-elevated)] cursor-pointer"
          >
            Save Edit
          </button>
          <button
            disabled={busy}
            onClick={() => onAction('send_now', recipient, subject, body)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs font-medium cursor-pointer"
          >
            <Send className="w-3 h-3" /> Send Manually Now
          </button>
        </div>
      )}
    </div>
  );
}
