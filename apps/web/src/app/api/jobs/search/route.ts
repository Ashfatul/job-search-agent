import { NextResponse, type NextRequest } from 'next/server';
import { generateJobEmbedding, normalizeJobUrl, type SomewhatSearchMatch } from '@job-bot/shared';
import { getAuthenticatedContext, withCors } from '@/lib/supabase/auth-guard';

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext(request);
  if (!ctx) return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const body = (await request.json()) as {
    query?: string;
    url?: string;
    company?: string;
    title?: string;
    snippet?: string;
    limit?: number;
  };

  const query = (body.query ?? '').trim();
  const normalizedUrl = body.url ? normalizeJobUrl(body.url) : '';
  const company = (body.company ?? '').trim();
  const title = (body.title ?? '').trim();
  const limit = Math.min(25, Math.max(1, body.limit ?? 10));

  if (!query && !normalizedUrl && !company && !title) {
    return withCors(
      NextResponse.json({ error: 'Provide query, url, company, or title to search.' }, { status: 400 }),
    );
  }

  const embeddingInput = [company, title, query, body.snippet ?? ''].filter(Boolean).join(' ').trim();
  const embedding = embeddingInput.length >= 10 ? await generateJobEmbedding(embeddingInput) : null;

  const { data, error } = await ctx.supabase.rpc('search_applied_jobs', {
    p_user_id: ctx.user.id,
    p_query: query,
    p_normalized_url: normalizedUrl,
    p_company: company,
    p_title: title,
    p_embedding: embedding,
    p_limit: limit,
  });

  if (error) {
    return withCors(NextResponse.json({ error: error.message }, { status: 500 }));
  }

  const matches: SomewhatSearchMatch[] = (data ?? []).map((row: Record<string, unknown>) => ({
    jobId: String(row.job_id),
    applicationId: row.application_id ? String(row.application_id) : null,
    company: String(row.company ?? ''),
    title: String(row.title ?? ''),
    applyUrl: String(row.apply_url ?? ''),
    normalizedUrl: String(row.normalized_url ?? ''),
    sourceName: String(row.source_name ?? ''),
    matchScore: Number(row.match_score ?? 0),
    applicationStatus: String(row.application_status ?? 'discovered') as SomewhatSearchMatch['applicationStatus'],
    appliedAt: row.applied_at ? String(row.applied_at) : null,
    channel: String(row.channel ?? 'email'),
    combinedSimilarity: Number(row.combined_similarity ?? 0),
    matchReason: String(row.match_reason ?? 'TEXT_MATCH') as SomewhatSearchMatch['matchReason'],
  }));

  const appliedStatuses = new Set(['applied', 'followed_up', 'replied', 'interviewing', 'offer']);
  const alreadyApplied = matches.some(
    (m) => appliedStatuses.has(m.applicationStatus) && m.combinedSimilarity >= 0.55,
  );

  return withCors(
    NextResponse.json({
      alreadyApplied,
      topMatch: matches[0] ?? null,
      matches,
    }),
  );
}
