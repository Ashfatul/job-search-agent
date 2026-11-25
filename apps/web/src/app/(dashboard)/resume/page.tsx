'use client';

import { useEffect, useState } from 'react';
import { FileUp, Sparkles } from 'lucide-react';
import type { ParsedResume } from '@job-bot/shared';

interface ResumeRecord {
  id: string;
  title: string;
  raw_text: string;
  parsed_profile: ParsedResume;
  is_active: boolean;
  updated_at: string;
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [title, setTitle] = useState('Primary Resume');
  const [rawText, setRawText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadResumes() {
    const res = await fetch('/api/resume', { cache: 'no-store' });
    const data = await res.json();
    setResumes(data.resumes ?? []);
    const active = (data.resumes ?? []).find((r: ResumeRecord) => r.is_active);
    if (active && !rawText) setRawText(active.raw_text);
  }

  useEffect(() => {
    void loadResumes();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      let res: Response;
      if (file) {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('file', file);
        res = await fetch('/api/resume', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, rawText }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse resume');
      setMessage('Resume parsed with Vercel AI SDK and saved as active!');
      setFile(null);
      await loadResumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const active = resumes.find((r) => r.is_active);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold">Resume & AI Candidate Profile</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Upload your PDF or paste resume text. Extracted skills, target roles, and achievements power matching and human-like email drafting.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Resume Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">
              Upload PDF / TXT / MD (Optional)
            </label>
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--muted)] mb-1">Or Paste Resume Text</label>
          <textarea
            rows={10}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your full resume text here..."
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] p-3 text-sm"
          />
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}
        {message && <div className="text-xs text-emerald-300">{message}</div>}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white cursor-pointer"
        >
          <FileUp className="w-4 h-4" />
          {saving ? 'Parsing with AI...' : 'Save & Extract AI Profile'}
        </button>
      </form>

      {active?.parsed_profile?.fullName && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            Active Extracted Profile ({active.parsed_profile.fullName})
          </h2>
          <p className="text-xs text-[var(--muted)]">{active.parsed_profile.summary}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
            <div>
              <div className="font-semibold mb-1.5">Preferred Roles</div>
              <div className="flex flex-wrap gap-1.5">
                {active.parsed_profile.preferredRoles.map((r) => (
                  <span key={r} className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="font-semibold mb-1.5">Core Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {active.parsed_profile.coreSkills.map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)]"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs pt-2">
            <div className="font-semibold mb-1.5">Key Quantified Achievements (Used in Emails)</div>
            <ul className="list-disc pl-5 space-y-1 text-[var(--muted)]">
              {active.parsed_profile.keyAchievements.map((a, idx) => (
                <li key={idx}>{a}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
