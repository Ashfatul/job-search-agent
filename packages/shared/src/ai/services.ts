import { generateText, Output } from 'ai';
import { z } from 'zod';
import {
  HumanOutreachDraftSchema,
  JobMatchResultSchema,
  ParsedResumeSchema,
  type HumanOutreachDraft,
  type JobMatchResult,
  type ParsedResume,
} from '../types.js';
import { computeKeywordOverlap, extractEmailsFromText } from '../url.js';
import {
  buildFollowupSystemPrompt,
  buildHumanOutreachSystemPrompt,
  JOB_MATCHER_SYSTEM_PROMPT,
  RESUME_PARSER_SYSTEM_PROMPT,
} from './prompts.js';
import { withFreeModelFallback } from './providers.js';

export async function parseResumeWithAI(rawText: string): Promise<ParsedResume> {
  const { result } = await withFreeModelFallback(async (model) => {
    const response = await generateText({
      model,
      system: RESUME_PARSER_SYSTEM_PROMPT,
      prompt: `Parse the following resume:\n\n${rawText.slice(0, 18000)}`,
      output: Output.object({ schema: ParsedResumeSchema }),
    });
    return response.output;
  });
  return result;
}

export async function scoreJobMatchWithAI(params: {
  resume: ParsedResume;
  targetRoles: string[];
  remoteOnly: boolean;
  company: string;
  title: string;
  location?: string | null;
  isRemote?: boolean;
  description: string;
}): Promise<JobMatchResult> {
  const foundEmails = extractEmailsFromText(params.description);

  const { result } = await withFreeModelFallback(async (model) => {
    const response = await generateText({
      model,
      system: JOB_MATCHER_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        candidate: {
          headline: params.resume.headline,
          yearsOfExperience: params.resume.yearsOfExperience,
          coreSkills: params.resume.coreSkills,
          preferredRoles: params.targetRoles.length
            ? params.targetRoles
            : params.resume.preferredRoles,
          remoteOnly: params.remoteOnly,
          summary: params.resume.summary,
        },
        job: {
          company: params.company,
          title: params.title,
          location: params.location ?? 'Not specified',
          isRemote: Boolean(params.isRemote),
          extractedEmailsHint: foundEmails,
          description: params.description.slice(0, 10000),
        },
      }),
      output: Output.object({ schema: JobMatchResultSchema }),
    });
    return response.output;
  });

  if (!result.extractedContactEmail && foundEmails.length > 0) {
    result.extractedContactEmail = foundEmails[0];
  }

  return result;
}

/**
 * Deterministic keyword/skill scorer used when all free LLM providers are
 * temporarily rate-limited so discovery never drops valid matches completely.
 */
export function localFallbackScoreJob(params: {
  resume: ParsedResume;
  targetRoles: string[];
  company: string;
  title: string;
  description: string;
}): JobMatchResult {
  const haystack = `${params.title} ${params.description}`.toLowerCase();
  const matchedSkills = params.resume.coreSkills.filter((skill) =>
    haystack.includes(skill.toLowerCase()),
  );
  const missingSkills = params.resume.coreSkills
    .filter((skill) => !haystack.includes(skill.toLowerCase()))
    .slice(0, 5);
  const rolePool = params.targetRoles.length ? params.targetRoles : params.resume.preferredRoles;
  const titleOverlap = computeKeywordOverlap(rolePool.join(' '), params.title);
  const skillRatio =
    params.resume.coreSkills.length > 0
      ? matchedSkills.length / Math.min(8, params.resume.coreSkills.length)
      : 0;
  const matchScore = Math.min(92, Math.round(titleOverlap * 55 + skillRatio * 45));
  const foundEmails = extractEmailsFromText(params.description);

  return {
    matchScore,
    shouldApply: matchScore >= 55,
    rationale: `Keyword fallback match (${matchedSkills.length} overlapping skills, ${Math.round(
      titleOverlap * 100,
    )}% title alignment with target roles).`,
    matchedSkills: matchedSkills.slice(0, 10),
    missingSkills,
    extractedContactEmail: foundEmails[0] ?? null,
    extractedContactName: null,
  };
}

const BatchJobMatchSchema = z.object({
  results: z.array(
    JobMatchResultSchema.extend({
      index: z.number().int().min(0),
    }),
  ),
});

/**
 * Evaluates up to 10 jobs in a single LLM request to stay well within free-tier
 * daily request limits, falling back to local deterministic scoring if needed.
 */
export async function scoreJobsBatchWithAI(params: {
  resume: ParsedResume;
  targetRoles: string[];
  remoteOnly: boolean;
  jobs: Array<{
    company: string;
    title: string;
    location?: string | null;
    isRemote?: boolean;
    description: string;
  }>;
}): Promise<{ results: JobMatchResult[]; usedFallback: boolean; error?: string }> {
  if (params.jobs.length === 0) return { results: [], usedFallback: false };

  try {
    const { result } = await withFreeModelFallback(async (model) => {
      const response = await generateText({
        model,
        system: `${JOB_MATCHER_SYSTEM_PROMPT}\nEvaluate EVERY job in the input array and return one item per index in the same order.`,
        prompt: JSON.stringify({
          candidate: {
            headline: params.resume.headline,
            yearsOfExperience: params.resume.yearsOfExperience,
            coreSkills: params.resume.coreSkills,
            preferredRoles: params.targetRoles.length
              ? params.targetRoles
              : params.resume.preferredRoles,
            remoteOnly: params.remoteOnly,
            summary: params.resume.summary,
          },
          jobs: params.jobs.map((j, index) => ({
            index,
            company: j.company,
            title: j.title,
            location: j.location ?? 'Not specified',
            isRemote: Boolean(j.isRemote),
            extractedEmailsHint: extractEmailsFromText(j.description),
            descriptionExcerpt: j.description.slice(0, 2200),
          })),
        }),
        output: Output.object({ schema: BatchJobMatchSchema }),
      });
      return response.output;
    });

    const byIndex = new Map(result.results.map((r) => [r.index, r]));
    const ordered = params.jobs.map((job, idx) => {
      const item = byIndex.get(idx);
      if (!item) {
        return localFallbackScoreJob({
          resume: params.resume,
          targetRoles: params.targetRoles,
          company: job.company,
          title: job.title,
          description: job.description,
        });
      }
      const foundEmails = extractEmailsFromText(job.description);
      if (!item.extractedContactEmail && foundEmails.length > 0) {
        item.extractedContactEmail = foundEmails[0];
      }
      return item;
    });

    return { results: ordered, usedFallback: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      results: params.jobs.map((job) =>
        localFallbackScoreJob({
          resume: params.resume,
          targetRoles: params.targetRoles,
          company: job.company,
          title: job.title,
          description: job.description,
        }),
      ),
      usedFallback: true,
      error: msg,
    };
  }
}

export async function draftHumanOutreachWithAI(params: {
  candidate: ParsedResume;
  company: string;
  title: string;
  description: string;
  contactName?: string | null;
  extraNotes?: string;
}): Promise<HumanOutreachDraft> {
  const { result } = await withFreeModelFallback(async (model) => {
    const response = await generateText({
      model,
      system: buildHumanOutreachSystemPrompt(params.candidate),
      prompt: JSON.stringify({
        candidate: {
          fullName: params.candidate.fullName,
          headline: params.candidate.headline,
          yearsOfExperience: params.candidate.yearsOfExperience,
          coreSkills: params.candidate.coreSkills.slice(0, 12),
          keyAchievements: params.candidate.keyAchievements,
        },
        targetJob: {
          company: params.company,
          title: params.title,
          contactName: params.contactName ?? null,
          descriptionExcerpt: params.description.slice(0, 6000),
        },
        extraNotes: params.extraNotes ?? '',
      }),
      output: Output.object({ schema: HumanOutreachDraftSchema }),
    });
    return response.output;
  });
  return result;
}

export async function draftFollowupWithAI(params: {
  candidate: ParsedResume;
  company: string;
  title: string;
  description: string;
  contactName?: string | null;
  previousSubject?: string | null;
  previousBody?: string | null;
  theirReply?: string;
  extraNotes?: string;
  emailType?: 'followup_1' | 'followup_2';
}): Promise<HumanOutreachDraft> {
  const { result } = await withFreeModelFallback(async (model) => {
    const response = await generateText({
      model,
      system: buildFollowupSystemPrompt(params.candidate),
      prompt: JSON.stringify({
        candidate: {
          fullName: params.candidate.fullName,
          headline: params.candidate.headline,
          coreSkills: params.candidate.coreSkills.slice(0, 10),
          keyAchievements: params.candidate.keyAchievements,
        },
        targetJob: {
          company: params.company,
          title: params.title,
          contactName: params.contactName ?? null,
          descriptionExcerpt: params.description.slice(0, 3000),
        },
        followupType: params.emailType ?? 'followup_1',
        previousEmail: {
          subject: params.previousSubject ?? null,
          body: params.previousBody ?? null,
        },
        theirReply: params.theirReply?.trim() || null,
        userInstructions: params.extraNotes?.trim() || '',
      }),
      output: Output.object({ schema: HumanOutreachDraftSchema }),
    });
    return response.output;
  });
  return result;
}
