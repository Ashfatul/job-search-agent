'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
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
import { toast } from 'sonner';
import {
  SOURCE_CATALOG,
  type SourceMethod,
  type SourceType,
} from '@job-bot/shared';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { CustomCheckbox, CustomSwitch } from '@/components/CustomCheckbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface JobSourceRow {
  id: string;
  name: string;
  source_type: SourceType;
  config: Record<string, unknown>;
  enabled: boolean;
  last_run_at: string | null;
}

const CRON_PRESETS = [
  { label: 'Every 4 hours (6x/day)', value: '0 */4 * * *' },
  { label: 'Every 6 hours (4x/day)', value: '0 */6 * * *' },
  { label: 'Every 12 hours (2x/day)', value: '0 */12 * * *' },
  { label: 'Daily at 9:00 AM', value: '0 9 * * *' },
];

export default function SettingsPage() {
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('user');
  const [fullName, setFullName] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [summaryEmail, setSummaryEmail] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [summaryEmailEnabled, setSummaryEmailEnabled] = useState(true);

  const [cronSchedule, setCronSchedule] = useState('0 */6 * * *');
  const [targetRoles, setTargetRoles] = useState('Software Engineer, Full Stack Developer');
  const [targetLocations, setTargetLocations] = useState('Remote');
  const [minMatchScore, setMinMatchScore] = useState(65);
  const [dailyEmailCap, setDailyEmailCap] = useState(12);
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const [sources, setSources] = useState<JobSourceRow[]>([]);
  const [methodFilter, setMethodFilter] = useState<'all' | SourceMethod>('all');
  const [newSourceMethod, setNewSourceMethod] = useState<SourceMethod>('api');
  const [newSourceType, setNewSourceType] = useState<SourceType>('greenhouse');
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceParam, setNewSourceParam] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newSourceName.trim()) {
      toast.error('Please enter a source name.');
      return;
    }
    setBusy(true);
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
      toast.success('Added new job source!');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function quickAddFromCatalog(type: SourceType, label: string) {
    setBusy(true);
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
      toast.success(
        meta?.requiresParam ? `Added ${label}` : `Enabled ${label}`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
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
      toast.error(data.error || 'Failed to toggle source');
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
      toast.success(enabled ? 'All sources enabled' : 'All sources paused');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
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
      toast.error(data.error || 'Failed to delete source');
      return;
    }
    toast.success('Source removed');
    await load();
  }

  async function seedRecommendedSources() {
    setBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedRecommendedSources: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load recommended sources');
      toast.success('Loaded all 10 recommended free remote & regional sources!');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendTestTelegram() {
    setBusy(true);
    try {
      const res = await fetch('/api/settings/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: telegramChatId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Telegram test failed');
      toast.success('Test Telegram message sent!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const methodBadge = (method: SourceMethod) => {
    if (method === 'api') return <Badge variant="indigo">API</Badge>;
    if (method === 'scraping') return <Badge variant="purple">Scraping</Badge>;
    return <Badge variant="amber">RSS</Badge>;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Settings & Source Manager</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure API & scraping sources, matching thresholds, Telegram/Email alerts, and account security.
          </p>
        </div>
        <Badge variant="emerald" className="self-start">
          {sources.filter((s) => s.enabled).length} / {sources.length || 10} Active Sources
        </Badge>
      </div>

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">
            <Globe className="w-3.5 h-3.5" /> Job Sources
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Sliders className="w-3.5 h-3.5" /> Discovery & Rules
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-3.5 h-3.5" /> Telegram & Email
          </TabsTrigger>
          <TabsTrigger value="security">
            <KeyRound className="w-3.5 h-3.5" /> Account & Password
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SOURCES */}
        <TabsContent value="sources" className="space-y-5">
          <Card>
            <CardHeader className="flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-400" /> Add Custom Job Source
                </CardTitle>
                <CardDescription>
                  Select API, Web Scraping, or RSS feed provider.
                </CardDescription>
              </div>
              <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
                {(['api', 'scraping', 'rss'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNewSourceMethod(m)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-semibold uppercase cursor-pointer transition-colors',
                      newSourceMethod === m ? 'bg-indigo-600 text-white' : 'text-zinc-400',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={addSource} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4 space-y-1.5">
                    <label className="text-[11px] text-zinc-400">Provider / Type</label>
                    <select
                      value={newSourceType}
                      onChange={(e) => setNewSourceType(e.target.value as SourceType)}
                      className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-200 focus:border-indigo-500/70 focus:outline-none"
                    >
                      {addableTypesForMethod.map((item) => (
                        <option key={item.type} value={item.type}>
                          {item.label} ({item.method.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4 space-y-1.5">
                    <label className="text-[11px] text-zinc-400">Display Name</label>
                    <Input
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      placeholder={`e.g. ${selectedCatalogMeta?.label ?? 'My Source'}`}
                    />
                  </div>

                  <div className="md:col-span-4 space-y-1.5">
                    <label className="text-[11px] text-zinc-400">
                      {selectedCatalogMeta?.paramLabel ?? 'URL / Keyword / Token (Optional)'}
                    </label>
                    <Input
                      value={newSourceParam}
                      onChange={(e) => setNewSourceParam(e.target.value)}
                      placeholder={selectedCatalogMeta?.paramPlaceholder ?? 'Optional'}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-zinc-400">
                    {selectedCatalogMeta?.description}
                  </span>
                  <Button type="submit" disabled={busy}>
                    <Plus className="w-3.5 h-3.5" /> Add Source
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>Your Configured Sources ({sources.length})</CardTitle>
                <CardDescription>
                  {sources.length === 0
                    ? 'No custom list saved yet — worker runs all 10 recommended free feeds automatically.'
                    : 'Toggle any source on or off anytime.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={seedRecommendedSources}>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Load Recommended (10)
                </Button>
                {sources.length > 0 && (
                  <>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => toggleAllSources(true)}>
                      Enable All
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => toggleAllSources(false)}>
                      Pause All
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>

            {sources.length > 0 && (
              <CardContent>
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
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all',
                          src.enabled
                            ? 'border-zinc-800 bg-zinc-900/40'
                            : 'border-zinc-800/50 bg-zinc-950/40 opacity-60',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-zinc-100 truncate">
                              {src.name}
                            </span>
                            {methodBadge(meta?.method ?? 'api')}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5">
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
                            className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                            title="Remove source"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>All Available Sources Catalog ({SOURCE_CATALOG.length})</CardTitle>
                <CardDescription>
                  Built-in API, Scraping, and RSS providers supported by the VPS worker.
                </CardDescription>
              </div>
              <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1">
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
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer',
                      methodFilter === f.id ? 'bg-indigo-600 text-white' : 'text-zinc-400',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCatalog.map((entry) => {
                  const existing = sources.find((s) => s.source_type === entry.type);
                  return (
                    <div
                      key={entry.type}
                      className="flex flex-col justify-between rounded-xl border border-zinc-800/90 bg-zinc-900/40 p-4 gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-zinc-100">{entry.label}</span>
                          {methodBadge(entry.method)}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          {entry.description}
                        </p>
                        {entry.requiresEnvKey && (
                          <Badge variant="amber" className="text-[10px]">
                            Requires {entry.requiresEnvKey}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
                        <span className="text-[11px] text-zinc-400">
                          {existing ? (existing.enabled ? 'Enabled' : 'Paused') : 'Not added'}
                        </span>
                        {existing ? (
                          <CustomSwitch
                            checked={existing.enabled}
                            onChange={(next) => toggleSource(existing.id, next)}
                            label={`Toggle ${entry.label}`}
                          />
                        ) : entry.requiresParam === 'boardToken' ||
                          entry.type === 'rss' ||
                          entry.type === 'web_page' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setNewSourceMethod(entry.method);
                              setNewSourceType(entry.type);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Configure ↑
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => quickAddFromCatalog(entry.type, entry.label)}
                          >
                            + Enable
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: DISCOVERY RULES */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>Discovery & Matching Rules</CardTitle>
              <CardDescription>
                Tune target roles, locations, match threshold, and background cron schedule.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveAllSettings} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-zinc-400">Target Roles (comma-separated)</label>
                    <Input value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-zinc-400">Preferred Locations (comma-separated)</label>
                    <Input
                      value={targetLocations}
                      onChange={(e) => setTargetLocations(e.target.value)}
                      placeholder="Remote, Dhaka, Worldwide"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-400">
                      Minimum Match Score: <strong className="text-indigo-300">{minMatchScore}%</strong>
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={95}
                      value={minMatchScore}
                      onChange={(e) => setMinMatchScore(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-500">
                      <span>20% Broad</span>
                      <span>65% Balanced</span>
                      <span>95% Strict</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-400">Daily Manual Email Cap</label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={dailyEmailCap}
                      onChange={(e) => setDailyEmailCap(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-400">Cron Schedule Preset</label>
                    <select
                      value={CRON_PRESETS.some((p) => p.value === cronSchedule) ? cronSchedule : ''}
                      onChange={(e) => {
                        if (e.target.value) setCronSchedule(e.target.value);
                      }}
                      className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-200"
                    >
                      <option value="">Custom cron expression</option>
                      {CRON_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-400">Cron Expression</label>
                    <Input
                      value={cronSchedule}
                      onChange={(e) => setCronSchedule(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CustomCheckbox
                    checked={remoteOnly}
                    onChange={setRemoteOnly}
                    label="Remote-Only Filter"
                    description="Skip non-remote postings during autonomous runs."
                  />
                  <CustomCheckbox
                    checked={isPaused}
                    onChange={setIsPaused}
                    label="Pause Autonomous Scheduler"
                    description="Temporarily pause scheduled runs while keeping manual runs active."
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800">
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                    <ShieldCheck className="w-4 h-4" /> Manual-only outreach enforced
                  </span>
                  <Button type="submit" disabled={busy}>
                    <Save className="w-3.5 h-3.5" /> Save Rules
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: NOTIFICATIONS */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Telegram & Summary Email Reports</CardTitle>
              <CardDescription>
                Sent strictly to you after discovery runs with found, matched, applied, and employees-reached counts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveAllSettings} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-zinc-400">Full Name (Email Sender Name)</label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-zinc-400">Summary Report Email</label>
                    <Input
                      type="email"
                      value={summaryEmail}
                      onChange={(e) => setSummaryEmail(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-zinc-400">Telegram Chat ID</label>
                    <div className="flex gap-2">
                      <Input
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="e.g. 5582710381"
                      />
                      <Button type="button" variant="outline" disabled={busy} onClick={sendTestTelegram}>
                        Send Test Ping
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CustomCheckbox
                    checked={telegramEnabled}
                    onChange={setTelegramEnabled}
                    label="Enable Telegram Run Alerts"
                    description="Receive instant run summaries and top matched links on Telegram."
                  />
                  <CustomCheckbox
                    checked={summaryEmailEnabled}
                    onChange={setSummaryEmailEnabled}
                    label="Enable Summary Email Digest"
                    description="Receive an HTML summary report in your personal inbox."
                  />
                </div>

                <div className="flex justify-end pt-3 border-t border-zinc-800">
                  <Button type="submit" disabled={busy}>
                    <Save className="w-3.5 h-3.5" /> Save Notification Settings
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: ACCOUNT & PASSWORD */}
        <TabsContent value="security">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <Card className="md:col-span-5">
              <CardHeader>
                <CardTitle>Account Identity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3 text-xs">
                  <div>
                    <span className="text-zinc-400">Signed in as</span>
                    <div className="font-semibold text-sm text-zinc-100 mt-0.5">
                      {userEmail || 'Loading...'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800">
                    <span className="text-zinc-400">Authorization Role</span>
                    <Badge variant="emerald" className="uppercase text-[10px]">
                      {userRole}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Row Level Security</span>
                    <span className="text-emerald-300 font-medium">Active (auth.uid)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-7">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-indigo-400" /> Change Password
                </CardTitle>
                <CardDescription>
                  Update your Supabase account password immediately.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">New Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Confirm New Password</label>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                    />
                  </div>

                  <Button type="submit" disabled={busy}>
                    <KeyRound className="w-3.5 h-3.5" /> Update Password
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
