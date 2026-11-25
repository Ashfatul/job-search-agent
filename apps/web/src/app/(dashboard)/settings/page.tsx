'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Plus,
  Save,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  SOURCE_CATALOG,
  type SourceMethod,
  type SourceType,
} from '@job-bot/shared';
import { createClient } from '@/lib/supabase/client';
import { CustomCheckbox, CustomSwitch } from '@/components/CustomCheckbox';

interface JobSourceRow {
  id: string;
  name: string;
  source_type: SourceType;
  config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
}

type SettingsTab = 'sources' | 'rules' | 'notifications' | 'security';

const CRON_PRESETS = [
  { label: 'Every 4 hours (6x/day)', value: '0 */4 * * *' },
  { label: 'Every 6 hours (4x/day)', value: '0 */6 * * *' },
  { label: 'Every 12 hours (2x/day)', value: '0 */12 * * *' },
  { label: 'Daily at 9:00 AM', value: '0 9 * * *' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sources');

  // Profile & notifications
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('user');
  const [fullName, setFullName] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [summaryEmail, setSummaryEmail] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [summaryEmailEnabled, setSummaryEmailEnabled] = useState(true);

  // Discovery & matching rules
  const [cronSchedule, setCronSchedule] = useState('0 */6 * * *');
  const [targetRoles, setTargetRoles] = useState('Software Engineer, Full Stack Developer');
  const [targetLocations, setTargetLocations] = useState('Remote');
  const [minMatchScore, setMinMatchScore] = useState(65);
  const [dailyEmailCap, setDailyEmailCap] = useState(12);
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Sources
  const [sources, setSources] = useState<JobSourceRow[]>([]);
  const [methodFilter, setMethodFilter] = useState<'all' | SourceMethod>('all');
  const [newSourceMethod, setNewSourceMethod] = useState<SourceMethod>('api');
  const [newSourceType, setNewSourceType] = useState<SourceType>('greenhouse');
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceParam, setNewSourceParam] = useState('');

  // Security / Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    const data = await res.json();
    if (data.user) {
      setUserEmail(data.user.email ?? '');
      setUserRole(data.user.role ?? 'user');
    }
    if (data.profile) {
      setFullName(data.profile.full_name ?? '');
      setTelegramChatId(data.profile.telegram_chat_id ?? '');
      setSummaryEmail(data.profile.summary_email ?? '');
    }
    if (data.settings) {
      setCronSchedule(data.settings.cron_schedule ?? '0 */6 * * *');
      setTargetRoles((data.settings.target_roles ?? []).join(', '));
      setTargetLocations((data.settings.target_locations ?? ['Remote']).join(', '));
      setMinMatchScore(data.settings.min_match_score ?? 65);
      setDailyEmailCap(data.settings.daily_email_cap ?? 12);
      setRemoteOnly(Boolean(data.settings.remote_only));
      setTelegramEnabled(Boolean(data.settings.telegram_enabled));
      setSummaryEmailEnabled(Boolean(data.settings.summary_email_enabled));
      setIsPaused(Boolean(data.settings.is_paused));
    }
    setSources(data.sources ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  const catalogByType = useMemo(
    () => new Map(SOURCE_CATALOG.map((c) => [c.type, c])),
    [],
  );

  const filteredCatalog = useMemo(
    () =>
      SOURCE_CATALOG.filter((item) =>
        methodFilter === 'all' ? true : item.method === methodFilter,
      ),
    [methodFilter],
  );

  const addableTypesForMethod = useMemo(
    () => SOURCE_CATALOG.filter((item) => item.method === newSourceMethod),
    [newSourceMethod],
  );

  useEffect(() => {
    if (!addableTypesForMethod.some((item) => item.type === newSourceType)) {
      if (addableTypesForMethod[0]) setNewSourceType(addableTypesForMethod[0].type);
    }
  }, [newSourceMethod, addableTypesForMethod, newSourceType]);

  const selectedCatalogMeta = catalogByType.get(newSourceType);

  async function saveAllSettings(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            full_name: fullName,
            telegram_chat_id: telegramChatId || null,
            summary_email: summaryEmail || null,
          },
          settings: {
            cron_schedule: cronSchedule,
            target_roles: targetRoles
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            target_locations: targetLocations
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
            min_match_score: Number(minMatchScore),
            auto_send_enabled: false,
            daily_email_cap: Number(dailyEmailCap),
            remote_only: remoteOnly,
            telegram_enabled: telegramEnabled,
            summary_email_enabled: summaryEmailEnabled,
            is_paused: isPaused,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      setBanner({ type: 'ok', text: 'All settings saved cleanly.' });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newSourceName.trim()) {
      setBanner({ type: 'err', text: 'Please enter a source name.' });
      return;
    }
    setBusy(true);
    setBanner(null);
    const paramVal = newSourceParam.trim();
    const config: Record<string, unknown> = {};
    if (paramVal) {
      if (selectedCatalogMeta?.requiresParam === 'url') config.url = paramVal;
      else if (selectedCatalogMeta?.requiresParam === 'boardToken') config.boardToken = paramVal;
      else config.query = paramVal;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addSource: {
            name: newSourceName.trim(),
            source_type: newSourceType,
            config,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add source');
      setNewSourceName('');
      setNewSourceParam('');
      setBanner({ type: 'ok', text: 'Added new job source.' });
      await load();
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function quickAddFromCatalog(type: SourceType, label: string) {
    setBusy(true);
    setBanner(null);
    const meta = catalogByType.get(type);
    const defaultCfg =
      type === 'weworkremotely'
        ? { url: 'https://weworkremotely.com/remote-jobs.rss' }
        : {};
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addSource: {
            name: label,
            source_type: type,
            config: defaultCfg,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to enable ${label}`);
      setBanner({
        type: 'ok',
        text: meta?.requiresParam
          ? `Added ${label}. Configure its ${meta.paramLabel} if needed.`
          : `Enabled ${label}.`,
      });
      await load();
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggleSource(id: string, enabled: boolean) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggleSource: { id, enabled } }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBanner({ type: 'err', text: data.error || 'Failed to toggle source' });
      return;
    }
    await load();
  }

  async function toggleAllSources(enabled: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggleAllSources: enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update sources');
      setBanner({
        type: 'ok',
        text: enabled ? 'All configured sources enabled.' : 'All configured sources paused.',
      });
      await load();
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSource(id: string) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteSourceId: id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBanner({ type: 'err', text: data.error || 'Failed to delete source' });
      return;
    }
    await load();
  }

  async function seedRecommendedSources() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedRecommendedSources: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load recommended sources');
      setBanner({ type: 'ok', text: 'Loaded all 10 recommended free remote & regional sources!' });
      await load();
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function sendTestTelegram() {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/settings/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: telegramChatId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Telegram test failed');
      setBanner({ type: 'ok', text: 'Test Telegram message sent! Check your Telegram app.' });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (newPassword.length < 6) {
      setBanner({ type: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setBanner({ type: 'err', text: 'Passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setBanner({ type: 'ok', text: 'Password updated successfully!' });
    } catch (err) {
      setBanner({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const methodBadge = (method: SourceMethod) => {
    if (method === 'api') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-semibold uppercase">
          API
        </span>
      );
    }
    if (method === 'scraping') {
      return (
        <span className="px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-semibold uppercase">
          Scraping
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-semibold uppercase">
        RSS
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Control Settings & Source Manager</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Manage all API & scraping sources, matching thresholds, notifications, and account security.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium">
            {sources.filter((s) => s.enabled).length} / {sources.length || 10} Active Sources
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {(
          [
            { id: 'sources', label: 'Job Sources (API & Scraping)', icon: Globe },
            { id: 'rules', label: 'Discovery & Matching Rules', icon: Sliders },
            { id: 'notifications', label: 'Telegram & Email Alerts', icon: Bell },
            { id: 'security', label: 'Account & Password', icon: KeyRound },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-all cursor-pointer ${
                active
                  ? 'border-blue-500/50 bg-blue-500/15 text-blue-300 shadow-sm'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {banner && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs ${
            banner.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {banner.text}
        </div>
      )}

      {/* TAB 1: JOB SOURCES */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          {/* Add New Source Card (API / Scraping / RSS) */}
          <form
            onSubmit={addSource}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-400" /> Add Job Source
                </h2>
                <p className="text-[11px] text-[var(--muted)]">
                  Choose whether the source uses a structured API, web scraping, or an RSS feed.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                {(['api', 'scraping', 'rss'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNewSourceMethod(m)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold uppercase cursor-pointer transition-colors ${
                      newSourceMethod === m ? 'bg-blue-600 text-white' : 'text-[var(--muted)]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <label className="block text-[11px] text-[var(--muted)] mb-1">Provider / Type</label>
                <select
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value as SourceType)}
                  className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-xs"
                >
                  {addableTypesForMethod.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.label} ({item.method.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-[11px] text-[var(--muted)] mb-1">Display Name</label>
                <input
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder={`e.g. ${selectedCatalogMeta?.label ?? 'My Source'}`}
                  className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-xs"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-[11px] text-[var(--muted)] mb-1">
                  {selectedCatalogMeta?.paramLabel ?? 'URL / Keyword / Board Token (Optional)'}
                </label>
                <input
                  value={newSourceParam}
                  onChange={(e) => setNewSourceParam(e.target.value)}
                  placeholder={selectedCatalogMeta?.paramPlaceholder ?? 'Optional config value'}
                  className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-[var(--muted)]">
                {selectedCatalogMeta?.description}
              </span>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Source
              </button>
            </div>
          </form>

          {/* Configured Sources List with Enable/Disable Switches */}
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  Your Configured Sources ({sources.length})
                </h2>
                <p className="text-[11px] text-[var(--muted)]">
                  {sources.length === 0
                    ? 'No custom list saved yet — worker uses all 10 recommended free sources automatically. Click Load Recommended to customize individually.'
                    : 'Toggle any source on/off without deleting it.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={seedRecommendedSources}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-300 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Load Recommended (10)
                </button>
                {sources.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleAllSources(true)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface-elevated)] cursor-pointer"
                    >
                      Enable All
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleAllSources(false)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-elevated)] cursor-pointer"
                    >
                      Pause All
                    </button>
                  </>
                )}
              </div>
            </div>

            {sources.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {sources.map((src) => {
                  const meta = catalogByType.get(src.source_type);
                  const cfgSummary =
                    (src.config?.url as string) ||
                    (src.config?.boardToken as string) ||
                    (src.config?.query as string) ||
                    '';
                  return (
                    <div
                      key={src.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                        src.enabled
                          ? 'border-[var(--border)] bg-[var(--bg)]'
                          : 'border-[var(--border)]/60 bg-[var(--bg)]/50 opacity-70'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs truncate">{src.name}</span>
                          {methodBadge(meta?.method ?? 'api')}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] truncate mt-0.5">
                          {cfgSummary || meta?.description || src.source_type}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <CustomSwitch
                          checked={src.enabled}
                          onChange={(next) => toggleSource(src.id, next)}
                          label={`Toggle ${src.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => deleteSource(src.id)}
                          className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                          title="Remove source"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* All Available Sources Catalog */}
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  All Available Sources Catalog ({SOURCE_CATALOG.length})
                </h2>
                <p className="text-[11px] text-[var(--muted)]">
                  Every supported API, Scraping, and RSS provider built into the worker.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'api', label: 'API' },
                    { id: 'scraping', label: 'Scraping' },
                    { id: 'rss', label: 'RSS' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMethodFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                      methodFilter === f.id ? 'bg-blue-600 text-white' : 'text-[var(--muted)]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCatalog.map((entry) => {
                const existing = sources.find((s) => s.source_type === entry.type);
                return (
                  <div
                    key={entry.type}
                    className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5 gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs">{entry.label}</span>
                        {methodBadge(entry.method)}
                      </div>
                      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                        {entry.description}
                      </p>
                      {entry.requiresEnvKey && (
                        <span className="inline-block text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
                          Requires {entry.requiresEnvKey} in .env
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/60">
                      <span className="text-[10px] text-[var(--muted)]">
                        {existing
                          ? existing.enabled
                            ? 'Enabled'
                            : 'Paused'
                          : 'Not added'}
                      </span>
                      {existing ? (
                        <CustomSwitch
                          checked={existing.enabled}
                          onChange={(next) => toggleSource(existing.id, next)}
                          label={`Toggle ${entry.label}`}
                        />
                      ) : entry.requiresParam === 'boardToken' || entry.type === 'rss' || entry.type === 'web_page' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNewSourceMethod(entry.method);
                            setNewSourceType(entry.type);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-blue-300 hover:bg-[var(--surface-elevated)] cursor-pointer"
                        >
                          Configure ↑
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => quickAddFromCatalog(entry.type, entry.label)}
                          className="rounded-md bg-blue-600/20 border border-blue-500/40 px-2.5 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-600/30 cursor-pointer"
                        >
                          + Enable
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: DISCOVERY & MATCHING RULES */}
      {activeTab === 'rules' && (
        <form
          onSubmit={saveAllSettings}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5"
        >
          <div>
            <h2 className="text-base font-semibold">Discovery & Matching Rules</h2>
            <p className="text-xs text-[var(--muted)]">
              Control what roles the worker targets, schedule frequency, and minimum AI match score.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="md:col-span-2">
              <label className="block text-[var(--muted)] mb-1">
                Target Roles (comma-separated, used for BDJobs/LinkedIn/Remotive queries & scoring)
              </label>
              <input
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[var(--muted)] mb-1">
                Preferred Locations (comma-separated)
              </label>
              <input
                value={targetLocations}
                onChange={(e) => setTargetLocations(e.target.value)}
                placeholder="Remote, Dhaka, Worldwide"
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-[var(--muted)] mb-1">
                Minimum Match Score: <strong className="text-blue-300">{minMatchScore}%</strong>
              </label>
              <input
                type="range"
                min={20}
                max={95}
                value={minMatchScore}
                onChange={(e) => setMinMatchScore(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[var(--muted)]">
                <span>20% (Broad)</span>
                <span>65% (Balanced)</span>
                <span>95% (Strict)</span>
              </div>
            </div>

            <div>
              <label className="block text-[var(--muted)] mb-1">Daily Manual Email Cap</label>
              <input
                type="number"
                min={1}
                max={100}
                value={dailyEmailCap}
                onChange={(e) => setDailyEmailCap(Number(e.target.value))}
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-[var(--muted)] mb-1">Cron Schedule Preset</label>
              <select
                value={CRON_PRESETS.some((p) => p.value === cronSchedule) ? cronSchedule : ''}
                onChange={(e) => {
                  if (e.target.value) setCronSchedule(e.target.value);
                }}
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
              >
                <option value="">Custom cron expression</option>
                {CRON_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[var(--muted)] mb-1">Cron Expression</label>
              <input
                value={cronSchedule}
                onChange={(e) => setCronSchedule(e.target.value)}
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <CustomCheckbox
              checked={remoteOnly}
              onChange={setRemoteOnly}
              label="Remote-Only Filter"
              description="Skip on-site jobs during autonomous discovery runs."
            />
            <CustomCheckbox
              checked={isPaused}
              onChange={setIsPaused}
              label="Pause Autonomous Scheduler"
              description="Temporarily stop automatic background cron runs (manual runs still work)."
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
              <ShieldCheck className="w-4 h-4" /> Manual-only outreach enforced (never auto-sends)
            </span>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <Save className="w-4 h-4" /> Save Rules
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: NOTIFICATIONS & ALERTS */}
      {activeTab === 'notifications' && (
        <form
          onSubmit={saveAllSettings}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5"
        >
          <div>
            <h2 className="text-base font-semibold">Telegram & Summary Email Reports</h2>
            <p className="text-xs text-[var(--muted)]">
              Reports are sent strictly to you after discovery runs (found count, matched count, applied & employees reached).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[var(--muted)] mb-1">Your Full Name (Email Sender Name)</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-[var(--muted)] mb-1">Summary Report Email</label>
              <input
                type="email"
                value={summaryEmail}
                onChange={(e) => setSummaryEmail(e.target.value)}
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[var(--muted)] mb-1">Telegram Chat ID</label>
              <div className="flex gap-2">
                <input
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 5582710381"
                  className="flex-1 rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={sendTestTelegram}
                  className="rounded-lg border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 px-4 py-2 text-xs font-semibold text-blue-300 cursor-pointer"
                >
                  Send Test Ping
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <CustomCheckbox
              checked={telegramEnabled}
              onChange={setTelegramEnabled}
              label="Enable Telegram Run Alerts"
              description="Send instant summary metrics and top matched links to your Telegram bot."
            />
            <CustomCheckbox
              checked={summaryEmailEnabled}
              onChange={setSummaryEmailEnabled}
              label="Enable Summary Email Digest"
              description="Send a formatted HTML summary report to your own inbox."
            />
          </div>

          <div className="flex justify-end pt-3 border-t border-[var(--border)]">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <Save className="w-4 h-4" /> Save Notification Settings
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: ACCOUNT & PASSWORD CHANGE */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
            <h2 className="text-base font-semibold">Account Identity</h2>
            <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-3.5 space-y-2 text-xs">
              <div>
                <span className="text-[var(--muted)]">Signed in as</span>
                <div className="font-semibold text-sm mt-0.5">{userEmail || 'Loading...'}</div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[var(--muted)]">Authorization Role</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 uppercase text-[10px] font-semibold">
                  {userRole}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">Row Level Security</span>
                <span className="text-emerald-300">Active (auth.uid)</span>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleChangePassword}
            className="md:col-span-7 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
          >
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-400" /> Change Password
              </h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Update your Supabase account password immediately.
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--muted)] mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-2.5 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[var(--muted)] mb-1">Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" /> Update Password
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
