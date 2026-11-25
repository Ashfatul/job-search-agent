'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { SomewhatSearchMatch } from '@job-bot/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function SomewhatSearchBar() {
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [matches, setMatches] = useState<SomewhatSearchMatch[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() && !url.trim()) return;

    setLoading(true);
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
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-400" />
          Somewhat Search — Already-Applied Checker
        </CardTitle>
        <CardDescription>
          Fuzzy & semantic check across URL, company, and title before you apply manually.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "stripe backend" or "Senior React Engineer"'
            className="md:col-span-6"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Optional job post URL"
            className="md:col-span-4"
          />
          <Button type="submit" disabled={loading} className="md:col-span-2">
            {loading ? 'Checking...' : 'Check'}
          </Button>
        </form>

        {searched && (
          <div className="space-y-2 pt-1">
            <div
              className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border ${
                alreadyApplied
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : matches.length > 0
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
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
                  No matching applications found — safe to apply!
                </>
              )}
            </div>

            {matches.map((m) => (
              <div
                key={m.jobId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80 px-3.5 py-2.5 text-xs"
              >
                <div>
                  <div className="font-semibold text-zinc-100">
                    {m.title} <span className="text-zinc-400 font-normal">@ {m.company}</span>
                  </div>
                  <div className="text-zinc-400 mt-0.5 flex flex-wrap gap-2 text-[11px]">
                    <span>{Math.round(m.combinedSimilarity * 100)}% similarity</span>
                    <span>• {m.matchReason}</span>
                    {m.appliedAt && <span>• Applied {new Date(m.appliedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="uppercase text-[10px]">
                    {m.applicationStatus}
                  </Badge>
                  <a
                    href={m.applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
