import { NextResponse, type NextRequest } from 'next/server';
import { sendEmailViaGmail } from '@/lib/mailer';
import { getAuthenticatedContext } from '@/lib/supabase/auth-guard';

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    emailId: string;
    recipientEmail?: string;
    subject?: string;
    bodyText?: string;
    action: 'save' | 'approve' | 'send_now';
  };

  const { data: emailRow, error: fetchErr } = await ctx.supabase
    .from('outreach_emails')
    .select('*')
    .eq('id', body.emailId)
    .eq('user_id', ctx.user.id)
    .single();

  if (fetchErr || !emailRow) {
    return NextResponse.json({ error: 'Outreach email not found.' }, { status: 404 });
  }

  const recipientEmail = (body.recipientEmail ?? emailRow.recipient_email ?? '').trim();
  const subject = (body.subject ?? emailRow.subject).trim();
  const textBody = (body.bodyText ?? emailRow.body).trim();

  if (body.action === 'save' || body.action === 'approve') {
    const { data: updated, error } = await ctx.supabase
      .from('outreach_emails')
      .update({
        recipient_email: recipientEmail || null,
        subject,
        body: textBody,
        status: body.action === 'approve' ? 'approved' : emailRow.status,
      })
      .eq('id', emailRow.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ email: updated });
  }

  // Send immediately via Gmail SMTP
  if (!recipientEmail) {
    return NextResponse.json({ error: 'Recipient email address is required to send.' }, { status: 400 });
  }

  const { data: profile } = await ctx.supabase
    .from('profiles')
    .select('full_name')
    .eq('id', ctx.user.id)
    .maybeSingle();

  const { data: prevSent } = await ctx.supabase
    .from('outreach_emails')
    .select('gmail_message_id')
    .eq('application_id', emailRow.application_id)
    .eq('status', 'sent')
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  try {
    const { messageId } = await sendEmailViaGmail({
      to: recipientEmail,
      subject,
      text: textBody,
      senderName: profile?.full_name ?? undefined,
      inReplyTo: prevSent?.gmail_message_id ?? null,
      references: prevSent?.gmail_message_id ?? null,
    });

    const nowIso = new Date().toISOString();
    const { data: updated } = await ctx.supabase
      .from('outreach_emails')
      .update({
        recipient_email: recipientEmail,
        subject,
        body: textBody,
        status: 'sent',
        gmail_message_id: messageId,
        sent_at: nowIso,
        error: null,
      })
      .eq('id', emailRow.id)
      .select()
      .single();

    // Schedule follow-up if initial
    const { data: settings } = await ctx.supabase
      .from('agent_settings')
      .select('followup_delays_days')
      .eq('user_id', ctx.user.id)
      .maybeSingle();

    const delays = (settings?.followup_delays_days as number[]) ?? [4, 9];
    let nextFollowupAt: string | null = null;
    let followupStage = 0;

    if (emailRow.email_type === 'initial' && delays[0]) {
      nextFollowupAt = new Date(Date.now() + delays[0] * 86400_000).toISOString();
      followupStage = 0;
    } else if (emailRow.email_type === 'followup_1' && delays[1]) {
      const gap = Math.max(1, delays[1] - (delays[0] ?? 4));
      nextFollowupAt = new Date(Date.now() + gap * 86400_000).toISOString();
      followupStage = 1;
    } else if (emailRow.email_type === 'followup_2') {
      followupStage = 2;
    }

    await ctx.supabase
      .from('applications')
      .update({
        status: emailRow.email_type === 'initial' ? 'applied' : 'followed_up',
        channel: 'email',
        applied_at: emailRow.email_type === 'initial' ? nowIso : undefined,
        next_followup_at: nextFollowupAt,
        followup_stage: followupStage,
        updated_at: nowIso,
      })
      .eq('id', emailRow.application_id);

    if (nextFollowupAt) {
      const nextType = emailRow.email_type === 'initial' ? 'followup_1' : 'followup_2';
      await ctx.supabase
        .from('outreach_emails')
        .update({ scheduled_for: nextFollowupAt, recipient_email: recipientEmail })
        .eq('application_id', emailRow.application_id)
        .eq('email_type', nextType)
        .in('status', ['draft', 'approved']);
    }

    return NextResponse.json({ email: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.supabase
      .from('outreach_emails')
      .update({ status: 'failed', error: msg })
      .eq('id', emailRow.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
