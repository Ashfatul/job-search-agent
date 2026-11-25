import { ToolLoopAgent, Output, stepCountIs, tool } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  computeKeywordOverlap,
  draftHumanOutreachWithAI,
  generateJobEmbedding,
  normalizeCompanyTitleKey,
  normalizeJobUrl,
  scoreJobsBatchWithAI,
  withFreeModelFallback,
  type AgentRunMetrics,
  type ParsedResume,
  type RawDiscoveredJob,
} from '@job-bot/shared';
import {
  fetchAdzuna,
  fetchArbeitnow,
  fetchAshbyBoard,
  fetchBDJobs,
  fetchGreenhouseBoard,
  fetchHNHiring,
  fetchHimalayas,
  fetchJobicy,
  fetchLeverBoard,
  fetchLinkedInPublic,
  fetchReadableWebPage,
  fetchRemoteOK,
  fetchRemotive,
  fetchRssFeed,
  fetchTheMuse,
  fetchWeWorkRemotely,
  fetchWorkingNomads,
} from '../sources/fetchers.js';
import { sendTelegramSummary } from '../reporters/telegram.js';
import { sendSummaryEmail } from '../reporters/summary-email.js';

const DiscoverySummarySchema = z.object({
  extraJobsDiscovered: z.number().int().min(0),
  notes: z.string(),
});

export interface SourceFetchResult {
  source: string;
  count: number;
  status: 'ok' | 'error';
  error?: string;
}

export interface AgentLogEvent {
  ts: string;
  step: string;
  detail: string;
  status: 'info' | 'ok' | 'warn' | 'error';
}

async function collectConfiguredJobs(
  supabase: SupabaseClient,
  userId: string,
  targetRoles: string[],
  remoteOnly: boolean,
  errors: string[],
  sourceResults: SourceFetchResult[],
): Promise<RawDiscoveredJob[]> {
  const { data: sources } = await supabase
    .from('job_sources')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true);

  const activeSources = sources ?? [];
  const collected: RawDiscoveredJob[] = [];
  const primaryQuery = targetRoles[0] ?? 'Software Engineer';

  // If user has not added custom sources yet, run all free remote + public regional sources in parallel
  if (activeSources.length === 0) {
    const defaultRuns: Array<{ label: string; run: () => Promise<RawDiscoveredJob[]> }> = [
      { label: 'RemoteOK', run: () => fetchRemoteOK() },
      { label: 'Remotive', run: () => fetchRemotive(primaryQuery) },
      { label: 'Arbeitnow', run: () => fetchArbeitnow() },
      { label: 'Himalayas', run: () => fetchHimalayas() },
      { label: 'Jobicy', run: () => fetchJobicy() },
      { label: 'WorkingNomads', run: () => fetchWorkingNomads() },
      { label: 'WeWorkRemotely', run: () => fetchWeWorkRemotely() },
      { label: 'HN WhoIsHiring', run: () => fetchHNHiring() },
      { label: 'BDJobs', run: () => fetchBDJobs(targetRoles.length ? targetRoles : [primaryQuery], 3) },
      { label: 'LinkedIn Public', run: () => fetchLinkedInPublic(primaryQuery, remoteOnly) },
    ];
    const settled = await Promise.allSettled(defaultRuns.map((item) => item.run()));
    settled.forEach((res, idx) => {
      const label = defaultRuns[idx].label;
      if (res.status === 'fulfilled') {
        collected.push(...res.value);
        sourceResults.push({ source: label, count: res.value.length, status: 'ok' });
      } else {
        const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
        errors.push(`${label}: ${msg}`);
        sourceResults.push({ source: label, count: 0, status: 'error', error: msg });
      }
    });
    return collected;
  }

  for (const src of activeSources) {
    const cfg = (src.config as Record<string, string>) ?? {};
    let batch: RawDiscoveredJob[] = [];
    try {
      switch (src.source_type) {
        case 'remoteok':
          batch = await fetchRemoteOK();
          break;
        case 'remotive':
          batch = await fetchRemotive(cfg.query ?? primaryQuery);
          break;
        case 'arbeitnow':
          batch = await fetchArbeitnow();
          break;
        case 'himalayas':
          batch = await fetchHimalayas();
          break;
        case 'jobicy':
          batch = await fetchJobicy(cfg.query ?? '');
          break;
        case 'workingnomads':
          batch = await fetchWorkingNomads();
          break;
        case 'weworkremotely':
          batch = await fetchWeWorkRemotely(cfg.url || undefined);
          break;
        case 'bdjobs':
          batch = await fetchBDJobs(
            cfg.query ? [cfg.query] : targetRoles.length ? targetRoles : [primaryQuery],
            3,
          );
          break;
        case 'linkedin_public':
          batch = await fetchLinkedInPublic(cfg.query ?? primaryQuery, remoteOnly);
          break;
        case 'themuse':
          if (!process.env.THEMUSE_API_KEY) {
            sourceResults.push({
              source: src.name,
              count: 0,
              status: 'ok',
              error: 'Skipped (add THEMUSE_API_KEY in .env to enable The Muse)',
            });
          } else {
            batch = await fetchTheMuse(cfg.category ?? 'Software Engineering');
          }
          break;
        case 'hn_hiring':
          batch = await fetchHNHiring();
          break;
        case 'greenhouse':
          if (cfg.boardToken) batch = await fetchGreenhouseBoard(cfg.boardToken);
          break;
        case 'lever':
          if (cfg.boardToken) batch = await fetchLeverBoard(cfg.boardToken);
          break;
        case 'ashby':
          if (cfg.boardToken) batch = await fetchAshbyBoard(cfg.boardToken);
          break;
        case 'rss':
          if (cfg.url) batch = await fetchRssFeed(cfg.url, src.name);
          break;
        case 'adzuna':
          if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
            batch = await fetchAdzuna({
              appId: process.env.ADZUNA_APP_ID,
              appKey: process.env.ADZUNA_APP_KEY,
              country: process.env.ADZUNA_COUNTRY,
              query: primaryQuery,
            });
          }
          break;
        case 'web_page':
          // Handled by ToolLoopAgent below so the AI can navigate and extract structured roles
          break;
      }
      if (src.source_type !== 'web_page' && !(src.source_type === 'themuse' && !process.env.THEMUSE_API_KEY)) {
        collected.push(...batch);
        sourceResults.push({ source: src.name, count: batch.length, status: 'ok' });
      }
      await supabase
        .from('job_sources')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', src.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${src.name}: ${msg}`);
      sourceResults.push({ source: src.name, count: 0, status: 'error', error: msg });
    }
  }

  return collected;
}

/**
 * Runs a Vercel AI SDK ToolLoopAgent over custom web_page career URLs and
 * exploratory ATS boards to uncover extra roles the structured feeds missed.
 */
async function runToolLoopExplorer(params: {
  supabase: SupabaseClient;
  userId: string;
  resume: ParsedResume;
  targetRoles: string[];
  webUrls: string[];
  discoveredBucket: RawDiscoveredJob[];
}): Promise<void> {
  if (params.webUrls.length === 0) return;

  const inspectCareerPageTool = tool({
    description: 'Fetch readable text, links, and hiring emails from a public career or job page.',
    inputSchema: z.object({
      url: z.string().url(),
    }),
    execute: async ({ url }) => {
      return await fetchReadableWebPage(url);
    },
  });

  const recordDiscoveredJobTool = tool({
    description: 'Record a relevant job posting found on a public career page.',
    inputSchema: z.object({
      company: z.string(),
      title: z.string(),
      applyUrl: z.string().url(),
      location: z.string().optional(),
      isRemote: z.boolean().optional(),
      description: z.string(),
      contactEmail: z.string().nullable().optional(),
    }),
    execute: async (job) => {
      const normalizedUrl = normalizeJobUrl(job.applyUrl);
      const { data: existing } = await params.supabase
        .from('jobs')
        .select('id')
        .eq('user_id', params.userId)
        .eq('normalized_url', normalizedUrl)
        .maybeSingle();

      if (existing) {
        return { recorded: false, reason: 'Already exists in tracker' };
      }

      params.discoveredBucket.push({
        sourceName: 'ToolLoopAgent',
        sourceType: 'web_page',
        applyUrl: job.applyUrl,
        company: job.company,
        title: job.title,
        location: job.location,
        isRemote: job.isRemote,
        description: job.description,
        contactEmail: job.contactEmail ?? null,
      });
      return { recorded: true };
    },
  });

  await withFreeModelFallback(async (model) => {
    const agent = new ToolLoopAgent({
      model,
      instructions: `You are an autonomous job-hunting agent. Inspect the provided career page URLs, find open positions matching the candidate's target roles (${params.targetRoles.join(', ')}), and record each valid match using recordDiscoveredJob.`,
      tools: {
        inspectCareerPage: inspectCareerPageTool,
        recordDiscoveredJob: recordDiscoveredJobTool,
      },
      output: Output.object({ schema: DiscoverySummarySchema }),
      stopWhen: stepCountIs(8),
    });

    const response = await agent.generate({
      prompt: `Candidate headline: ${params.resume.headline}. Core skills: ${params.resume.coreSkills.join(', ')}. Inspect these URLs and record matching roles:\n${params.webUrls.join('\n')}`,
    });
    return response.output;
  });
}

export async function runAgentForUser(params: {
  supabase: SupabaseClient;
  userId: string;
  trigger: 'cron' | 'manual' | 'extension';
}): Promise<AgentRunMetrics> {
  const { supabase, userId, trigger } = params;
  const dryRun = process.env.DRY_RUN === 'true';

  const metrics: AgentRunMetrics = {
    jobsFound: 0,
    jobsMatched: 0,
    emailsDrafted: 0,
    emailsSent: 0,
    followupsSent: 0,
    employeesReached: 0,
    topMatches: [],
    errors: [],
  };

  const sourceResults: SourceFetchResult[] = [];
  const events: AgentLogEvent[] = [
    {
      ts: new Date().toISOString(),
      step: 'starting',
      detail: 'Initialized autonomous job discovery run',
      status: 'info',
    },
  ];

  const { data: runRow } = await supabase
    .from('agent_runs')
    .insert({
      user_id: userId,
      trigger_type: trigger,
      status: 'running',
      log_summary: {
        stage: 'starting',
        message: 'Starting autonomous job agent...',
        progress: 5,
        sourceResults,
        events,
      },
    })
    .select()
    .single();

  const updateProgress = async (
    stage: string,
    message: string,
    progress: number,
    eventStatus: AgentLogEvent['status'] = 'info',
  ) => {
    events.push({
      ts: new Date().toISOString(),
      step: stage,
      detail: message,
      status: eventStatus,
    });
    if (events.length > 40) events.shift();
    if (!runRow) return;
    await supabase
      .from('agent_runs')
      .update({
        jobs_found: metrics.jobsFound,
        jobs_matched: metrics.jobsMatched,
        emails_drafted: metrics.emailsDrafted,
        emails_sent: metrics.emailsSent,
        followups_sent: metrics.followupsSent,
        employees_reached: metrics.employeesReached,
        log_summary: {
          stage,
          message,
          progress,
          sourceResults,
          events,
          topMatches: metrics.topMatches,
        },
      })
      .eq('id', runRow.id);
  };

  const reachedSet = new Set<string>();

  try {
    const [profileRes, settingsRes, resumeRes, webSourcesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('agent_settings').select('*').eq('user_id', userId).single(),
      supabase
        .from('resumes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('job_sources')
        .select('config')
        .eq('user_id', userId)
        .eq('enabled', true)
        .eq('source_type', 'web_page'),
    ]);

    const profile = profileRes.data;
    const settings = settingsRes.data;
    const resume = resumeRes.data?.parsed_profile as ParsedResume | undefined;

    if (!resume?.coreSkills) {
      throw new Error('No active parsed resume found for user.');
    }

    const targetRoles: string[] = settings?.target_roles ?? resume.preferredRoles ?? [];
    const minScore: number = settings?.min_match_score ?? 65;

    // 1. Collect jobs from structured sources
    await updateProgress('collecting', 'Fetching jobs from remote boards, BDJobs, and LinkedIn...', 12);
    const rawJobs = await collectConfiguredJobs(
      supabase,
      userId,
      targetRoles,
      Boolean(settings?.remote_only),
      metrics.errors,
      sourceResults,
    );
    const okSources = sourceResults.filter((s) => s.status === 'ok').length;
    await updateProgress(
      'collecting',
      `Collected ${rawJobs.length} raw postings across ${okSources}/${sourceResults.length} sources`,
      22,
      'ok',
    );

    // 2. Run Vercel AI SDK ToolLoopAgent on custom web_page career URLs
    const webUrls = (webSourcesRes.data ?? [])
      .map((s) => (s.config as Record<string, string>)?.url)
      .filter((u): u is string => Boolean(u));
    if (webUrls.length > 0) {
      await updateProgress('exploring', `Exploring ${webUrls.length} custom career page(s) with AI agent...`, 22);
      try {
        await runToolLoopExplorer({
          supabase,
          userId,
          resume,
          targetRoles,
          webUrls,
          discoveredBucket: rawJobs,
        });
      } catch (err) {
        metrics.errors.push(`ToolLoopExplorer: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Deduplicate strictly (URL + Company/Title signature) against existing DB jobs
    const roleKeywords = [...targetRoles, resume.headline].join(' ');
    const skillKeywords = resume.coreSkills.slice(0, 15).join(' ');

    const { data: existingJobs } = await supabase
      .from('jobs')
      .select('normalized_url, company, title')
      .eq('user_id', userId);

    const existingUrls = new Set((existingJobs ?? []).map((j) => j.normalized_url));
    const existingKeys = new Set(
      (existingJobs ?? []).map((j) => normalizeCompanyTitleKey(j.company, j.title)),
    );

    const uniqueNewJobs = new Map<string, RawDiscoveredJob>();
    const seenKeysThisRun = new Set<string>();
    for (const job of rawJobs) {
      const norm = normalizeJobUrl(job.applyUrl);
      const compTitleKey = normalizeCompanyTitleKey(job.company, job.title);
      if (!norm || existingUrls.has(norm) || existingKeys.has(compTitleKey)) continue;
      if (uniqueNewJobs.has(norm) || seenKeysThisRun.has(compTitleKey)) continue;
      if (settings?.remote_only && job.isRemote === false) continue;
      uniqueNewJobs.set(norm, job);
      seenKeysThisRun.add(compTitleKey);
    }

    const candidates = Array.from(uniqueNewJobs.entries())
      .map(([normUrl, job]) => {
        const titleScore = computeKeywordOverlap(roleKeywords, job.title);
        const skillTitleScore = computeKeywordOverlap(skillKeywords, job.title);
        const descSkillScore = computeKeywordOverlap(
          skillKeywords,
          `${job.title} ${job.description.slice(0, 1400)}`,
        );
        const preScore = titleScore * 0.55 + skillTitleScore * 0.25 + descSkillScore * 0.20;
        return { normUrl, job, titleScore, preScore };
      })
      .sort((a, b) => b.preScore - a.preScore);

    // Top 30 relevant roles get full AI batch scoring; remaining new roles are also saved as 'discovered'
    const aiBatchCandidates = candidates
      .filter((c) => c.titleScore >= 0.12 || c.preScore >= 0.12)
      .slice(0, 30);
    const aiCandidateUrls = new Set(aiBatchCandidates.map((c) => c.normUrl));
    const extraDiscovered = candidates.filter((c) => !aiCandidateUrls.has(c.normUrl)).slice(0, 35);

    metrics.jobsFound = uniqueNewJobs.size;
    await updateProgress(
      'scoring',
      `Found ${metrics.jobsFound} brand-new jobs (${aiBatchCandidates.length} to AI-score). Evaluating...`,
      30,
    );

    const BATCH_SIZE = 10;
    let processed = 0;
    let llmDraftQuotaExceeded = false;

    for (let i = 0; i < aiBatchCandidates.length; i += BATCH_SIZE) {
      const chunk = aiBatchCandidates.slice(i, i + BATCH_SIZE);
      const pct = 30 + Math.round(((i + chunk.length) / Math.max(1, aiBatchCandidates.length)) * 45);
      await updateProgress(
        'scoring',
        `Batch-scoring jobs ${i + 1}-${i + chunk.length} of ${aiBatchCandidates.length}...`,
        pct,
      );

      const batchScored = await scoreJobsBatchWithAI({
        resume,
        targetRoles,
        remoteOnly: Boolean(settings?.remote_only),
        jobs: chunk.map((c) => c.job),
      });

      if (batchScored.usedFallback && batchScored.error) {
        metrics.errors.push(`AI Batch Score fallback: ${batchScored.error.slice(0, 220)}`);
      }

      for (let j = 0; j < chunk.length; j++) {
        processed++;
        const { normUrl, job } = chunk[j];
        const match = batchScored.results[j];
        if (!match) continue;

        const passedFilter = match.matchScore >= minScore && match.shouldApply;
        if (passedFilter) metrics.jobsMatched++;

        const embedding = passedFilter
          ? await generateJobEmbedding(`${job.company} ${job.title}\n${job.description}`)
          : null;

        const { data: savedJob, error: saveJobErr } = await supabase
          .from('jobs')
          .upsert(
            {
              user_id: userId,
              source_name: job.sourceName,
              external_id: job.externalId ?? null,
              normalized_url: normUrl,
              apply_url: job.applyUrl,
              company: job.company,
              title: job.title,
              location: job.location ?? null,
              is_remote: Boolean(job.isRemote),
              salary_text: job.salaryText ?? null,
              description: job.description,
              contact_email: match.extractedContactEmail ?? job.contactEmail ?? null,
              contact_name: match.extractedContactName ?? job.contactName ?? null,
              match_score: match.matchScore,
              match_summary: {
                rationale: match.rationale,
                matchedSkills: match.matchedSkills,
                missingSkills: match.missingSkills,
              },
              ...(embedding ? { embedding } : {}),
              posted_at: job.postedAt ?? null,
            },
            { onConflict: 'user_id,normalized_url', ignoreDuplicates: true },
          )
          .select()
          .maybeSingle();

        if (saveJobErr || !savedJob) continue;

        const initialAppStatus = passedFilter ? 'matched' : 'discovered';
        const { data: app } = await supabase
          .from('applications')
          .upsert(
            {
              user_id: userId,
              job_id: savedJob.id,
              status: initialAppStatus,
              channel: savedJob.contact_email ? 'email' : 'portal',
            },
            { onConflict: 'user_id,job_id', ignoreDuplicates: true },
          )
          .select()
          .maybeSingle();

        if (!app || !passedFilter) continue;

        // Draft initial email (only top 10 matches per run to preserve free quota)
        let appStatus = 'matched';
        if (!llmDraftQuotaExceeded && metrics.emailsDrafted < 10) {
          try {
            const draft = await draftHumanOutreachWithAI({
              candidate: resume,
              company: savedJob.company,
              title: savedJob.title,
              description: savedJob.description,
              contactName: savedJob.contact_name,
            });

            await supabase.from('outreach_emails').insert({
              user_id: userId,
              application_id: app.id,
              recipient_email: savedJob.contact_email,
              recipient_name: savedJob.contact_name,
              email_type: 'initial',
              subject: draft.subject,
              body: draft.body,
              status: 'draft',
            });

            await supabase
              .from('applications')
              .update({ status: 'draft_ready', updated_at: new Date().toISOString() })
              .eq('id', app.id);

            metrics.emailsDrafted++;
            appStatus = 'draft_ready';
            await updateProgress(
              'drafting',
              `Matched ${savedJob.match_score}% & drafted email: ${savedJob.title} @ ${savedJob.company}`,
              Math.min(90, 75 + Math.round((processed / Math.max(1, aiBatchCandidates.length)) * 15)),
              'ok',
            );
          } catch (err) {
            llmDraftQuotaExceeded = true;
            metrics.errors.push(`Draft ${savedJob.title}: ${err instanceof Error ? err.message.slice(0, 180) : String(err)}`);
          }
        }

        metrics.topMatches.push({
          company: savedJob.company,
          title: savedJob.title,
          matchScore: savedJob.match_score,
          applyUrl: savedJob.apply_url,
          status: appStatus,
        });
      }
    }

    // Append extra discovered jobs (below pre-filter threshold) so "All Jobs" shows everything without duplicates
    if (extraDiscovered.length > 0) {
      for (const { normUrl, job, preScore } of extraDiscovered) {
        const { data: savedExtra } = await supabase
          .from('jobs')
          .upsert(
            {
              user_id: userId,
              source_name: job.sourceName,
              external_id: job.externalId ?? null,
              normalized_url: normUrl,
              apply_url: job.applyUrl,
              company: job.company,
              title: job.title,
              location: job.location ?? null,
              is_remote: Boolean(job.isRemote),
              salary_text: job.salaryText ?? null,
              description: job.description,
              contact_email: job.contactEmail ?? null,
              contact_name: job.contactName ?? null,
              match_score: Math.round(preScore * 100),
              match_summary: { rationale: 'Saved in All Discovered feed (below primary match threshold).' },
              posted_at: job.postedAt ?? null,
            },
            { onConflict: 'user_id,normalized_url', ignoreDuplicates: true },
          )
          .select()
          .maybeSingle();

        if (savedExtra) {
          await supabase
            .from('applications')
            .upsert(
              {
                user_id: userId,
                job_id: savedExtra.id,
                status: 'discovered',
                channel: savedExtra.contact_email ? 'email' : 'portal',
              },
              { onConflict: 'user_id,job_id', ignoreDuplicates: true },
            );
        }
      }
    }

    // Aggregate manual application & outreach metrics for user reporting (never auto-sends)
    const { data: sentRows } = await supabase
      .from('outreach_emails')
      .select('recipient_email, email_type')
      .eq('user_id', userId)
      .eq('status', 'sent');

    for (const row of sentRows ?? []) {
      if (row.email_type === 'initial') metrics.emailsSent++;
      else metrics.followupsSent++;
      if (row.recipient_email) reachedSet.add(row.recipient_email.toLowerCase());
    }

    metrics.employeesReached = reachedSet.size;

    // 5. Send Telegram & Summary Email reports
    await updateProgress('reporting', 'Sending Telegram & summary email report...', 93);
    if (settings?.telegram_enabled !== false) {
      try {
        await sendTelegramSummary({
          chatId: profile?.telegram_chat_id,
          metrics,
          dryRun,
          dashboardUrl: process.env.WEB_APP_URL,
        });
      } catch (err) {
        metrics.errors.push(`Telegram: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (settings?.summary_email_enabled !== false) {
      try {
        await sendSummaryEmail({
          toEmail: profile?.summary_email ?? profile?.email,
          metrics,
          dryRun,
          dashboardUrl: process.env.WEB_APP_URL,
        });
      } catch (err) {
        metrics.errors.push(`SummaryEmail: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (runRow) {
      const doneMsg = `Completed: ${metrics.jobsFound} found, ${metrics.jobsMatched} matched, ${metrics.emailsDrafted} drafted`;
      events.push({ ts: new Date().toISOString(), step: 'completed', detail: doneMsg, status: 'ok' });
      await supabase
        .from('agent_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'completed',
          jobs_found: metrics.jobsFound,
          jobs_matched: metrics.jobsMatched,
          emails_drafted: metrics.emailsDrafted,
          emails_sent: metrics.emailsSent,
          followups_sent: metrics.followupsSent,
          employees_reached: metrics.employeesReached,
          error_message: metrics.errors.length ? metrics.errors.join('\n') : null,
          log_summary: {
            stage: 'completed',
            message: doneMsg,
            progress: 100,
            sourceResults,
            events: events.slice(-40),
            topMatches: metrics.topMatches,
          },
        })
        .eq('id', runRow.id);
    }

    return metrics;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    metrics.errors.push(message);
    if (runRow) {
      events.push({ ts: new Date().toISOString(), step: 'failed', detail: message, status: 'error' });
      await supabase
        .from('agent_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          error_message: message,
          log_summary: {
            stage: 'failed',
            message: `Failed: ${message}`,
            progress: 100,
            sourceResults,
            events: events.slice(-40),
          },
        })
        .eq('id', runRow.id);
    }
    throw err;
  }
}
