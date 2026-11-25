import { NextResponse, type NextRequest } from 'next/server';
import {
  draftFollowupWithAI,
  draftHumanOutreachWithAI,
  type OutreachEmailType,
  type ParsedResume,
} from '@job-bot/shared';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    applicationId: string;
    emailType?: OutreachEmailType;
    theirReply?: string;
    extraNotes?: string;
    recipientEmail?: string;
  };

  const emailType: OutreachEmailType = body.emailType ?? 'initial';

  const { data: app } = await ctx.supabase
    .from('applications')
    .select('*, job:jobs(*)')
    .eq('id', body.applicationId)
    .eq('user_id', ctx.user.id)
    .single();

  if (!app || !app.job) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const { data: resumeRow } = await ctx.supabase
    .from('resumes')
    .select('parsed_profile')
    .eq('user_id', ctx.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!resumeRow?.parsed_profile) {
    return NextResponse.json({ error: 'Upload and parse an active resume first.' }, { status: 400 });
  }

  const candidate = resumeRow.parsed_profile as ParsedResume;
  const recipient = body.recipientEmail?.trim() || app.job.contact_email || null;

  let draft;
  if (emailType === 'initial') {
    draft = await draftHumanOutreachWithAI({
      candidate,
      company: app.job.company,
      title: app.job.title,
      description: app.job.description || `${app.job.title} at ${app.job.company}`,
      contactName: app.job.contact_name,
      extraNotes: body.extraNotes,
    });
  } else {
    const { data: prevEmail } = await ctx.supabase
      .from('outreach_emails')
      .select('subject, body')
      .eq('application_id', app.id)
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    draft = await draftFollowupWithAI({
      candidate,
      company: app.job.company,
      title: app.job.title,
      description: app.job.description || `${app.job.title} at ${app.job.company}`,
      contactName: app.job.contact_name,
      previousSubject: prevEmail?.subject ?? null,
      previousBody: prevEmail?.body ?? null,
      theirReply: body.theirReply,
      extraNotes: body.extraNotes,
      emailType,
    });
  }

  // Replace only unsent drafts of the requested email_type
  await ctx.supabase
    .from('outreach_emails')
    .delete()
    .eq('application_id', app.id)
    .eq('user_id', ctx.user.id)
    .eq('email_type', emailType)
    .eq('status', 'draft');

  const { data: emails, error } = await ctx.supabase
    .from('outreach_emails')
    .insert({
      user_id: ctx.user.id,
      application_id: app.id,
      recipient_email: recipient,
      recipient_name: app.job.contact_name,
      email_type: emailType,
      subject: draft.subject,
      body: draft.body,
      status: 'draft',
    })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (app.status === 'discovered' || app.status === 'matched') {
    await ctx.supabase
      .from('applications')
      .update({ status: 'draft_ready', updated_at: new Date().toISOString() })
      .eq('id', app.id);
  }

  return NextResponse.json({ emails });
}
