import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [appsRes, queueRes, outreachRes, runsRes, resumeRes, sourcesRes, settingsRes, profileRes] =
    await Promise.all([
      ctx.supabase.from('applications').select('id, status, applied_at').eq('user_id', ctx.user.id),
      ctx.supabase
        .from('applications')
        .select('*, job:jobs(*), outreach_emails(*)')
        .eq('user_id', ctx.user.id)
        .in('status', ['discovered', 'matched', 'draft_ready'])
        .order('updated_at', { ascending: false })
        .limit(25),
      ctx.supabase
        .from('outreach_emails')
        .select('id, recipient_email, status, email_type')
        .eq('user_id', ctx.user.id)
        .eq('status', 'sent'),
      ctx.supabase
        .from('agent_runs')
        .select('*')
        .eq('user_id', ctx.user.id)
        .order('started_at', { ascending: false })
        .limit(8),
      ctx.supabase
        .from('resumes')
        .select('id, title, updated_at')
        .eq('user_id', ctx.user.id)
        .eq('is_active', true)
        .maybeSingle(),
      ctx.supabase
        .from('job_sources')
        .select('id, enabled')
        .eq('user_id', ctx.user.id),
      ctx.supabase
        .from('agent_settings')
        .select('is_paused, cron_schedule, target_roles, min_match_score, remote_only')
        .eq('user_id', ctx.user.id)
        .maybeSingle(),
      ctx.supabase
        .from('profiles')
        .select('telegram_chat_id, summary_email')
        .eq('id', ctx.user.id)
        .maybeSingle(),
    ]);

  const apps = appsRes.data ?? [];
  const sentEmails = outreachRes.data ?? [];
  const runs = runsRes.data ?? [];
  const sources = sourcesRes.data ?? [];

  const statusCounts: Record<string, number> = {};
  for (const a of apps) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  }

  const totalFound = apps.length;
  const matchedCount = (statusCounts.matched ?? 0) + (statusCounts.discovered ?? 0);
  const draftCount = statusCounts.draft_ready ?? 0;
  const appliedCount = apps.filter((a) =>
    ['applied', 'followed_up', 'replied', 'interviewing', 'offer'].includes(a.status),
  ).length;
  const repliedCount = apps.filter((a) =>
    ['replied', 'interviewing', 'offer'].includes(a.status),
  ).length;
  const employeesReached = new Set(
    sentEmails.map((e) => e.recipient_email).filter((e): e is string => Boolean(e)),
  ).size;

  return NextResponse.json({
    kpis: {
      totalFound,
      matchedCount,
      draftCount,
      appliedCount,
      employeesReached,
      repliedCount,
      statusCounts,
    },
    runs,
    readyQueue: queueRes.data ?? [],
    setup: {
      hasResume: Boolean(resumeRes.data?.id),
      resumeTitle: resumeRes.data?.title ?? null,
      sourcesCount: sources.length,
      enabledSourcesCount: sources.filter((s) => s.enabled).length,
      hasTelegram: Boolean(profileRes.data?.telegram_chat_id),
      hasSummaryEmail: Boolean(profileRes.data?.summary_email),
      isPaused: Boolean(settingsRes.data?.is_paused),
      cronSchedule: settingsRes.data?.cron_schedule ?? '0 */6 * * *',
      targetRoles: (settingsRes.data?.target_roles as string[]) ?? [],
      minMatchScore: settingsRes.data?.min_match_score ?? 65,
      remoteOnly: Boolean(settingsRes.data?.remote_only ?? true),
    },
  });
}
