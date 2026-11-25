'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, FileUp, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { ParsedResume } from '@job-bot/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';

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
      toast.success('Resume parsed with Vercel AI SDK and set as active!');
      setFile(null);
      await loadResumes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const active = resumes.find((r) => r.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Resume & AI Candidate Profile</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Upload your PDF or paste resume text. Extracted skills and quantified achievements power matching and outreach.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="w-4 h-4 text-indigo-400" /> Upload or Paste Resume
            </CardTitle>
            <CardDescription>
              Supports PDF, TXT, Markdown, or direct pasted text.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Resume Title</label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Upload File (.pdf, .txt, .md)</label>
                  <label className="flex h-9 items-center justify-between rounded-lg border border-dashed border-zinc-700 bg-zinc-950 px-3 text-xs text-zinc-400 hover:border-indigo-500/60 cursor-pointer">
                    <span className="truncate">{file ? file.name : 'Choose PDF / TXT file...'}</span>
                    <FileText className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                    <input
                      type="file"
                      accept=".pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400">Resume Text</label>
                <Textarea
                  rows={12}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste your full resume text here..."
                />
              </div>

              <Button type="submit" disabled={saving}>
                <Sparkles className="w-3.5 h-3.5" />
                {saving ? 'Extracting AI Profile...' : 'Save & Extract AI Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" /> Extracted AI Profile
              </CardTitle>
              {active && (
                <Badge variant="emerald">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </Badge>
              )}
            </div>
            <CardDescription>
              {active ? active.title : 'Upload a resume to inspect extracted profile.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            {!active?.parsed_profile?.fullName ? (
              <p className="text-zinc-500">No active parsed profile yet.</p>
            ) : (
              <>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-1">
                  <div className="font-bold text-sm text-zinc-100">
                    {active.parsed_profile.fullName}
                  </div>
                  <div className="text-indigo-300 font-medium">
                    {active.parsed_profile.headline} • {active.parsed_profile.yearsOfExperience} yrs
                  </div>
                  <p className="text-zinc-400 pt-1 leading-relaxed">
                    {active.parsed_profile.summary}
                  </p>
                </div>

                <div>
                  <div className="font-semibold text-zinc-300 mb-2">Target Roles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {active.parsed_profile.preferredRoles.map((r) => (
                      <Badge key={r} variant="indigo">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-zinc-300 mb-2">Core Skills</div>
                  <div className="flex flex-wrap gap-1.5">
                    {active.parsed_profile.coreSkills.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-zinc-300 mb-2">
                    Key Quantified Achievements (Used in Emails)
                  </div>
                  <ul className="space-y-1.5 text-zinc-400 list-disc pl-4">
                    {active.parsed_profile.keyAchievements.map((a, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
