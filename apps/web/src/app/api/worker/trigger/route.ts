import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workerUrl = process.env.WORKER_URL ?? `http://127.0.0.1:${process.env.WORKER_PORT ?? '4001'}`;
  const workerSecret = process.env.WORKER_SECRET ?? '';

  try {
    const res = await fetch(`${workerUrl}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': workerSecret,
      },
      body: JSON.stringify({ userId: ctx.user.id, trigger: 'manual' }),
    });
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          'Could not reach VPS worker service. Ensure apps/worker is running and WORKER_URL is configured.',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
