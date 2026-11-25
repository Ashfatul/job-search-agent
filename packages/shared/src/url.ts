const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'ref',
  'refid',
  'referrer',
  'trk',
  'trkid',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'gh_src',
  'lever-source',
  'lever-origin',
  'source',
  'src',
]);

const IMPORTANT_JOB_ID_PARAMS = new Set([
  'gh_jid',
  'jk',
  'vjk',
  'currentjobid',
  'jobid',
  'job_id',
  'id',
  'ashby_jid',
]);

/**
 * Normalizes a job URL for deterministic deduplication across boards
 * while preserving essential query identifiers such as `gh_jid` or `jk`.
 */
export function normalizeJobUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    parsed.protocol = 'https:';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    parsed.hash = '';

    const keptParams = new URLSearchParams();
    const sortedEntries = Array.from(parsed.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    for (const [key, value] of sortedEntries) {
      const lowerKey = key.toLowerCase();
      if (TRACKING_PARAMS.has(lowerKey)) continue;
      if (IMPORTANT_JOB_ID_PARAMS.has(lowerKey) || !lowerKey.startsWith('utm_')) {
        if (IMPORTANT_JOB_ID_PARAMS.has(lowerKey)) {
          keptParams.set(key, value);
        }
      }
    }

    parsed.search = keptParams.toString() ? `?${keptParams.toString()}` : '';
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.hostname}${pathname}${parsed.search}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Extracts potential direct hiring/recruiter email addresses from job descriptions,
 * filtering out generic placeholder or automated no-reply addresses.
 */
export function extractEmailsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const ignored = /^(no-?reply|noreply|donotreply|privacy|support|abuse|example)@/i;
  const unique = new Set<string>();
  for (const email of matches) {
    const cleaned = email.toLowerCase().replace(/[.,;)]+$/, '');
    if (!ignored.test(cleaned) && !cleaned.endsWith('.png') && !cleaned.endsWith('.jpg')) {
      unique.add(cleaned);
    }
  }
  return Array.from(unique);
}

/**
 * Computes a lightweight token overlap score (0..1) useful as a local fallback
 * or pre-filter before hitting external LLM APIs.
 */
export function computeKeywordOverlap(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

/**
 * Normalizes a (company, title) pair into a canonical deduplication key so
 * identical roles cross-posted on different job boards are not appended twice.
 */
export function normalizeCompanyTitleKey(company: string, title: string): string {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${clean(company)}::${clean(title)}`;
}
