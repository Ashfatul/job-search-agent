import { NextResponse, type NextRequest } from 'next/server';
import type { ApplicationStatus } from '@job-bot/shared';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

const TERMINAL_STATUSES = new Set<ApplicationStatus>(['replied', 'interviewing', 'offer', 'rejected', 'archived', 'skipped']);

export async function GET(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const statusFilter = request.nextUrl.searchParams.get('status');

  let query = ctx.supabase
    .from('applications')
    .select(
      `
      *,
      job:jobs(*),
      outreach_emails(*)
    `,
    )
    .eq('user_id', ctx.user.id)
    .order('updated_at', { ascending: false })
    .limit(600);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ applications: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    id: string;
    status?: ApplicationStatus;
    notes?: string;
    contactEmail?: string;
  };

  if (!body.id) return NextResponse.json({ error: 'Application id is required.' }, { status: 400 });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.status) {
    updates.status = body.status;
    if (body.status === 'applied') {
      updates.applied_at = new Date().toISOString();
    }
    if (TERMINAL_STATUSES.has(body.status)) {
      updates.next_followup_at = null;
    }
  }
  if (typeof body.notes === 'string') {
    updates.notes = body.notes;
  }

  const { data, error } = await ctx.supabase
    .from('applications')
    .update(updates)
    .eq('id', body.id)
    .eq('user_id', ctx.user.id)
    .select('*, job:jobs(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-cancel pending followups if candidate received a reply or closed the application
  if (body.status && TERMINAL_STATUSES.has(body.status)) {
    await ctx.supabase
      .from('outreach_emails')
      .update({ status: 'cancelled' })
      .eq('application_id', body.id)
      .eq('user_id', ctx.user.id)
      .in('status', ['draft', 'approved']);
  }

  if (typeof body.contactEmail === 'string' && data?.job_id) {
    await ctx.supabase
      .from('jobs')
      .update({ contact_email: body.contactEmail.trim() || null })
      .eq('id', data.job_id)
      .eq('user_id', ctx.user.id);
  }

  return NextResponse.json({ application: data });
}
