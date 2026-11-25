import { z } from 'zod';

export const APPLICATION_STATUSES = [
  'discovered',
  'matched',
  'draft_ready',
  'applied',
  'followed_up',
  'replied',
  'interviewing',
  'offer',
  'rejected',
  'skipped',
  'archived',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const OUTREACH_EMAIL_TYPES = ['initial', 'followup_1', 'followup_2'] as const;
export type OutreachEmailType = (typeof OUTREACH_EMAIL_TYPES)[number];

export const OUTREACH_STATUSES = ['draft', 'approved', 'sent', 'cancelled', 'failed'] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const SOURCE_TYPES = [
  'remoteok',
  'remotive',
  'arbeitnow',
  'themuse',
  'hn_hiring',
  'himalayas',
  'jobicy',
  'workingnomads',
  'weworkremotely',
  'bdjobs',
  'linkedin_public',
  'adzuna',
  'greenhouse',
  'lever',
  'ashby',
  'rss',
  'web_page',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const RECOMMENDED_DEFAULT_SOURCES: Array<{
  name: string;
  source_type: SourceType;
  config: Record<string, unknown>;
}> = [
  { name: 'RemoteOK', source_type: 'remoteok', config: {} },
  { name: 'Remotive', source_type: 'remotive', config: {} },
  { name: 'Arbeitnow', source_type: 'arbeitnow', config: {} },
  { name: 'Himalayas Remote', source_type: 'himalayas', config: {} },
  { name: 'Jobicy Remote', source_type: 'jobicy', config: {} },
  { name: 'Working Nomads', source_type: 'workingnomads', config: {} },
  {
    name: 'WeWorkRemotely',
    source_type: 'weworkremotely',
    config: { url: 'https://weworkremotely.com/remote-jobs.rss' },
  },
  { name: 'HN Who Is Hiring', source_type: 'hn_hiring', config: {} },
  { name: 'BDJobs Public Search', source_type: 'bdjobs', config: {} },
  { name: 'LinkedIn Public Guest Search', source_type: 'linkedin_public', config: {} },
];

export type SourceMethod = 'api' | 'scraping' | 'rss';

export interface SourceCatalogEntry {
  type: SourceType;
  label: string;
  method: SourceMethod;
  description: string;
  requiresParam?: 'url' | 'boardToken' | 'query';
  paramLabel?: string;
  paramPlaceholder?: string;
  requiresEnvKey?: string;
  recommended: boolean;
}

export const SOURCE_CATALOG: SourceCatalogEntry[] = [
  {
    type: 'remoteok',
    label: 'RemoteOK',
    method: 'api',
    description: 'Public remote tech & product jobs JSON API.',
    recommended: true,
  },
  {
    type: 'remotive',
    label: 'Remotive',
    method: 'api',
    description: 'Remote software, product, and marketing JSON API.',
    requiresParam: 'query',
    paramLabel: 'Optional Search Query',
    paramPlaceholder: 'e.g. react developer',
    recommended: true,
  },
  {
    type: 'arbeitnow',
    label: 'Arbeitnow',
    method: 'api',
    description: 'European & remote tech board JSON API.',
    recommended: true,
  },
  {
    type: 'himalayas',
    label: 'Himalayas Remote',
    method: 'api',
    description: 'Curated remote companies & salary-tagged JSON API.',
    recommended: true,
  },
  {
    type: 'jobicy',
    label: 'Jobicy Remote',
    method: 'api',
    description: 'Remote jobs v2 public JSON API.',
    requiresParam: 'query',
    paramLabel: 'Optional Tag',
    paramPlaceholder: 'e.g. dev, react, python',
    recommended: true,
  },
  {
    type: 'workingnomads',
    label: 'Working Nomads',
    method: 'api',
    description: 'Digital nomad & remote-first exposed JSON feed.',
    recommended: true,
  },
  {
    type: 'hn_hiring',
    label: 'HN Who Is Hiring',
    method: 'api',
    description: 'Monthly Hacker News hiring threads via Algolia API (rich in direct founder emails).',
    recommended: true,
  },
  {
    type: 'weworkremotely',
    label: 'WeWorkRemotely',
    method: 'rss',
    description: 'Remote programming, design, and devops RSS feed.',
    requiresParam: 'url',
    paramLabel: 'RSS Feed URL',
    paramPlaceholder: 'https://weworkremotely.com/remote-jobs.rss',
    recommended: true,
  },
  {
    type: 'bdjobs',
    label: 'BDJobs',
    method: 'scraping',
    description: 'Multi-page keyword search & detail extraction from BDJobs.',
    requiresParam: 'query',
    paramLabel: 'Optional Keyword Override',
    paramPlaceholder: 'e.g. software engineer',
    recommended: true,
  },
  {
    type: 'linkedin_public',
    label: 'LinkedIn Public Guest',
    method: 'scraping',
    description: 'Unauthenticated LinkedIn public guest job listings (use Chrome extension for logged-in feed).',
    requiresParam: 'query',
    paramLabel: 'Optional Keyword Override',
    paramPlaceholder: 'e.g. full stack developer',
    recommended: true,
  },
  {
    type: 'greenhouse',
    label: 'Greenhouse ATS Board',
    method: 'api',
    description: 'Direct company job board API (e.g. stripe, vercel, airbnb).',
    requiresParam: 'boardToken',
    paramLabel: 'Company Board Token',
    paramPlaceholder: 'e.g. stripe',
    recommended: false,
  },
  {
    type: 'lever',
    label: 'Lever ATS Board',
    method: 'api',
    description: 'Direct company Lever postings JSON API.',
    requiresParam: 'boardToken',
    paramLabel: 'Company Lever Slug',
    paramPlaceholder: 'e.g. netflix',
    recommended: false,
  },
  {
    type: 'ashby',
    label: 'Ashby ATS Board',
    method: 'api',
    description: 'Direct company Ashby job board JSON API.',
    requiresParam: 'boardToken',
    paramLabel: 'Company Ashby Slug',
    paramPlaceholder: 'e.g. linear',
    recommended: false,
  },
  {
    type: 'adzuna',
    label: 'Adzuna Global API',
    method: 'api',
    description: 'Multi-country job aggregator API (requires free ADZUNA_APP_ID & ADZUNA_APP_KEY).',
    requiresEnvKey: 'ADZUNA_APP_ID',
    recommended: false,
  },
  {
    type: 'themuse',
    label: 'The Muse API',
    method: 'api',
    description: 'Company profiles & engineering jobs (requires THEMUSE_API_KEY in .env).',
    requiresEnvKey: 'THEMUSE_API_KEY',
    recommended: false,
  },
  {
    type: 'rss',
    label: 'Custom RSS / Atom Feed',
    method: 'rss',
    description: 'Any custom job board RSS/XML feed URL.',
    requiresParam: 'url',
    paramLabel: 'RSS Feed URL',
    paramPlaceholder: 'https://example.com/jobs.rss',
    recommended: false,
  },
  {
    type: 'web_page',
    label: 'Custom Web Career Page',
    method: 'scraping',
    description: 'Scraped & explored dynamically by the Vercel AI SDK ToolLoopAgent.',
    requiresParam: 'url',
    paramLabel: 'Career Page URL',
    paramPlaceholder: 'https://company.com/careers',
    recommended: false,
  },
];

export const ParsedResumeSchema = z.object({
  fullName: z.string().describe('Candidate full name'),
  headline: z.string().describe('Short professional title/headline'),
  yearsOfExperience: z.number().min(0).max(60),
  coreSkills: z.array(z.string()).describe('Primary technical and domain skills'),
  preferredRoles: z.array(z.string()).describe('Job titles the candidate is qualified for'),
  preferredLocations: z.array(z.string()).describe('Preferred locations or Remote'),
  keyAchievements: z
    .array(z.string())
    .describe('3-6 concrete, quantified accomplishments from the resume for human outreach'),
  summary: z.string().describe('Concise 2-3 sentence summary of candidate profile'),
});
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

export const JobMatchResultSchema = z.object({
  matchScore: z.number().int().min(0).max(100),
  shouldApply: z.boolean(),
  rationale: z.string().describe('2-3 sentence explanation of why this role fits or does not fit'),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  extractedContactEmail: z
    .string()
    .nullable()
    .describe('Direct hiring manager/recruiter/jobs email if present in posting, else null'),
  extractedContactName: z
    .string()
    .nullable()
    .describe('Name of recruiter or hiring manager if mentioned, else null'),
});
export type JobMatchResult = z.infer<typeof JobMatchResultSchema>;

export const HumanOutreachDraftSchema = z.object({
  subject: z.string().min(5).max(140),
  body: z.string().min(40).max(2500),
});
export type HumanOutreachDraft = z.infer<typeof HumanOutreachDraftSchema>;

export interface RawDiscoveredJob {
  sourceName: string;
  sourceType: SourceType;
  externalId?: string;
  applyUrl: string;
  company: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  salaryText?: string;
  description: string;
  contactEmail?: string | null;
  contactName?: string | null;
  postedAt?: string | null;
}

export interface SomewhatSearchMatch {
  jobId: string;
  applicationId: string | null;
  company: string;
  title: string;
  applyUrl: string;
  normalizedUrl: string;
  sourceName: string;
  matchScore: number;
  applicationStatus: ApplicationStatus;
  appliedAt: string | null;
  channel: string;
  combinedSimilarity: number;
  matchReason: 'EXACT_URL' | 'SEMANTIC_MATCH' | 'FUZZY_COMPANY_TITLE' | 'FUZZY_PARTIAL' | 'TEXT_MATCH';
}

export interface AgentRunMetrics {
  jobsFound: number;
  jobsMatched: number;
  emailsDrafted: number;
  emailsSent: number;
  followupsSent: number;
  employeesReached: number;
  topMatches: Array<{
    company: string;
    title: string;
    matchScore: number;
    applyUrl: string;
    status: string;
  }>;
  errors: string[];
}
