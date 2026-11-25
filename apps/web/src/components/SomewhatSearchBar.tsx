'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Search } from 'lucide-react';
import type { SomewhatSearchMatch } from '@job-bot/shared';

export function SomewhatSearchBar() {
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [matches, setMatches] = useState<SomewhatSearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() && !url.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), url: url.trim(), limit: 8 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setMatches(data.matches ?? []);
      setAlreadyApplied(Boolean(data.alreadyApplied));
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-400" />
          Somewhat Search — Already-Applied Checker
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Paste a job URL, partial company name, or rough title to check if you already applied or saved a similar role.
        </p>
      </div>

      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='e.g. "stripe backend" or "Senior React Engineer Acme"'
          className="md:col-span-6 rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Optional job post URL"
          className="md:col-span-4 rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="md:col-span-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white cursor-pointer"
        >
          {loading ? 'Checking...' : 'Check'}
        </button>
      </form>

      {error && (
        <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {searched && !error && (
        <div className="mt-4 space-y-2">
          <div
            className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border ${
              alreadyApplied
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : matches.length > 0
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            {alreadyApplied ? (
              <>
                <AlertCircle className="w-4 h-4 shrink-0" />
                Heads up: You appear to have already applied to a matching post.
              </>
            ) : matches.length > 0 ? (
              <>
                <AlertCircle className="w-4 h-4 shrink-0" />
                Found {matches.length} similar job(s) in your tracker (not yet marked applied).
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                No matching applications found — looks safe to apply!
              </>
            )}
          </div>

          {matches.map((m) => (
            <div
              key={m.jobId}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2.5 text-xs"
            >
              <div>
                <div className="font-semibold text-[var(--text)]">
                  {m.title} <span className="text-[var(--muted)] font-normal">@ {m.company}</span>
                </div>
                <div className="text-[var(--muted)] mt-0.5 flex flex-wrap gap-2">
                  <span>Similarity: {Math.round(m.combinedSimilarity * 100)}%</span>
                  <span>• {m.matchReason}</span>
                  {m.appliedAt && <span>• Applied {new Date(m.appliedAt).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] uppercase tracking-wider text-[10px]">
                  {m.applicationStatus}
                </span>
                <a
                  href={m.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  Open <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
