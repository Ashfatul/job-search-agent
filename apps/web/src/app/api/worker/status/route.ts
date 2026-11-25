import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workerUrl = process.env.WORKER_URL ?? `http://127.0.0.1:${process.env.WORKER_PORT ?? '4001'}`;

  const [settingsRes, healthRes] = await Promise.all([
    ctx.supabase
      .from('agent_settings')
      .select('is_paused, cron_schedule')
      .eq('user_id', ctx.user.id)
      .maybeSingle(),
    (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${workerUrl}/health`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return { online: false };
        const data = (await res.json()) as { dryRun?: boolean; cronSchedule?: string };
        return { online: true, dryRun: Boolean(data.dryRun), cronSchedule: data.cronSchedule };
      } catch {
        return { online: false };
      }
    })(),
  ]);

  return NextResponse.json({
    online: healthRes.online,
    dryRun: healthRes.dryRun ?? process.env.DRY_RUN === 'true',
    cronSchedule: settingsRes.data?.cron_schedule ?? healthRes.cronSchedule ?? '0 */6 * * *',
    isPaused: Boolean(settingsRes.data?.is_paused),
  });
}
