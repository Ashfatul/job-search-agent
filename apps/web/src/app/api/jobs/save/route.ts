import { NextResponse, type NextRequest } from 'next/server';
import {
  draftHumanOutreachWithAI,
  generateJobEmbedding,
  normalizeJobUrl,
  scoreJobMatchWithAI,
  type ApplicationStatus,
  type ParsedResume,
} from '@job-bot/shared';
import { getAuthenticatedContext, withCors } from '@/lib/supabase/auth-guard';

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const body = (await request.json()) as {
    url: string;
    company: string;
    title: string;
    description?: string;
    location?: string;
    sourceName?: string;
    status?: ApplicationStatus;
    channel?: 'email' | 'portal' | 'extension' | 'manual';
    generateDraft?: boolean;
  };

  if (!body.url || !body.company || !body.title) {
    return withCors(
      NextResponse.json({ error: 'url, company, and title are required.' }, { status: 400 }),
    );
  }

  const normalizedUrl = normalizeJobUrl(body.url);
  const description = (body.description ?? '').trim();

  // Fetch active resume for match scoring and optional human-like draft
  const { data: resumeRow } = await ctx.supabase
    .from('resumes')
    .select('parsed_profile')
    .eq('user_id', ctx.user.id)
    .eq('is_active', true)
    .maybeSingle();

  const { data: settingsRow } = await ctx.supabase
    .from('agent_settings')
    .select('target_roles, remote_only')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  const parsedProfile = resumeRow?.parsed_profile as ParsedResume | undefined;

  let matchScore = 70;
  let matchSummary: Record<string, unknown> = {};
  let contactEmail: string | null = null;
  let contactName: string | null = null;

  if (parsedProfile?.coreSkills && description.length > 40) {
    try {
      const scored = await scoreJobMatchWithAI({
        resume: parsedProfile,
        targetRoles: (settingsRow?.target_roles as string[]) ?? [],
        remoteOnly: Boolean(settingsRow?.remote_only ?? false),
        company: body.company,
        title: body.title,
        location: body.location ?? null,
        description,
      });
      matchScore = scored.matchScore;
      matchSummary = {
        rationale: scored.rationale,
        matchedSkills: scored.matchedSkills,
        missingSkills: scored.missingSkills,
      };
      contactEmail = scored.extractedContactEmail;
      contactName = scored.extractedContactName;
    } catch {
      // Keep graceful default score if LLM quota is temporarily exhausted
    }
  }

  const embedding = await generateJobEmbedding(`${body.company} ${body.title}\n${description}`);

  const { data: job, error: jobErr } = await ctx.supabase
    .from('jobs')
    .upsert(
      {
        user_id: ctx.user.id,
        source_name: body.sourceName ?? 'extension',
        normalized_url: normalizedUrl,
        apply_url: body.url,
        company: body.company.trim(),
        title: body.title.trim(),
        location: body.location ?? null,
        description,
        contact_email: contactEmail,
        contact_name: contactName,
        match_score: matchScore,
        match_summary: matchSummary,
        ...(embedding ? { embedding } : {}),
      },
      { onConflict: 'user_id,normalized_url' },
    )
    .select()
    .single();

  if (jobErr || !job) {
    return withCors(NextResponse.json({ error: jobErr?.message ?? 'Failed to save job' }, { status: 500 }));
  }

  const targetStatus: ApplicationStatus = body.status ?? 'matched';
  const isApplied = targetStatus === 'applied';

  const { data: app, error: appErr } = await ctx.supabase
    .from('applications')
    .upsert(
      {
        user_id: ctx.user.id,
        job_id: job.id,
        status: targetStatus,
        channel: body.channel ?? 'extension',
        applied_at: isApplied ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,job_id' },
    )
    .select()
    .single();

  if (appErr || !app) {
    return withCors(NextResponse.json({ error: appErr?.message ?? 'Failed to create application' }, { status: 500 }));
  }

  let draft = null;
  if (body.generateDraft && parsedProfile?.fullName) {
    draft = await draftHumanOutreachWithAI({
      candidate: parsedProfile,
      company: job.company,
      title: job.title,
      description: description || `${job.title} at ${job.company}`,
      contactName,
    });

    await ctx.supabase.from('outreach_emails').insert({
      user_id: ctx.user.id,
      application_id: app.id,
      recipient_email: contactEmail,
      recipient_name: contactName,
      email_type: 'initial',
      subject: draft.subject,
      body: draft.body,
      status: 'draft',
    });

    if (!isApplied) {
      await ctx.supabase
        .from('applications')
        .update({ status: 'draft_ready', updated_at: new Date().toISOString() })
        .eq('id', app.id);
    }
  }

  return withCors(NextResponse.json({ job, application: app, draft }));
}
