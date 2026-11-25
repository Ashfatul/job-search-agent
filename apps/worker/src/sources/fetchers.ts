import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { extractEmailsFromText, type RawDiscoveredJob } from '@job-bot/shared';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function stripHtml(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, ' ').trim();
}

export async function fetchRemoteOK(): Promise<RawDiscoveredJob[]> {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`RemoteOK HTTP ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;

  return data
    .filter((item) => item && typeof item.position === 'string' && typeof item.url === 'string')
    .slice(0, 40)
    .map((item) => {
      const desc = stripHtml(String(item.description ?? ''));
      const emails = extractEmailsFromText(desc);
      return {
        sourceName: 'RemoteOK',
        sourceType: 'remoteok',
        externalId: String(item.id ?? ''),
        applyUrl: String(item.apply_url || item.url),
        company: String(item.company ?? 'Unknown'),
        title: String(item.position),
        location: String(item.location ?? 'Remote'),
        isRemote: true,
        salaryText:
          item.salary_min && item.salary_max ? `$${item.salary_min} - $${item.salary_max}` : undefined,
        description: desc,
        contactEmail: emails[0] ?? null,
        postedAt: item.date ? String(item.date) : null,
      };
    });
}

export async function fetchRemotive(search = ''): Promise<RawDiscoveredJob[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}&limit=35` : '?limit=35';
  const res = await fetch(`https://remotive.com/api/remote-jobs${qs}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Remotive HTTP ${res.status}`);
  const json = (await res.json()) as { jobs?: Array<Record<string, unknown>> };

  return (json.jobs ?? []).map((item) => {
    const desc = stripHtml(String(item.description ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: 'Remotive',
      sourceType: 'remotive',
      externalId: String(item.id ?? ''),
      applyUrl: String(item.url ?? ''),
      company: String(item.company_name ?? 'Unknown'),
      title: String(item.title ?? ''),
      location: String(item.candidate_required_location ?? 'Remote'),
      isRemote: true,
      salaryText: item.salary ? String(item.salary) : undefined,
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.publication_date ? String(item.publication_date) : null,
    };
  });
}

export async function fetchArbeitnow(): Promise<RawDiscoveredJob[]> {
  const res = await fetch('https://www.arbeitnow.com/api/job-board-api', {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Arbeitnow HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };

  return (json.data ?? []).slice(0, 40).map((item) => {
    const desc = stripHtml(String(item.description ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: 'Arbeitnow',
      sourceType: 'arbeitnow',
      externalId: String(item.slug ?? ''),
      applyUrl: String(item.url ?? ''),
      company: String(item.company_name ?? 'Unknown'),
      title: String(item.title ?? ''),
      location: String(item.location ?? 'Remote'),
      isRemote: Boolean(item.remote),
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.created_at ? new Date(Number(item.created_at) * 1000).toISOString() : null,
    };
  });
}

export async function fetchTheMuse(category = 'Software Engineering'): Promise<RawDiscoveredJob[]> {
  const apiKeyParam = process.env.THEMUSE_API_KEY
    ? `&api_key=${encodeURIComponent(process.env.THEMUSE_API_KEY)}`
    : '';
  const url = `https://www.themuse.com/api/public/jobs?category=${encodeURIComponent(category)}&page=1${apiKeyParam}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 403) {
    throw new Error('The Muse requires THEMUSE_API_KEY or blocked unauthenticated access (403)');
  }
  if (!res.ok) throw new Error(`The Muse HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Array<Record<string, unknown>> };

  return (json.results ?? []).slice(0, 25).map((item) => {
    const companyObj = (item.company as Record<string, unknown>) ?? {};
    const locations = (item.locations as Array<Record<string, unknown>>) ?? [];
    const locName = locations.map((l) => String(l.name ?? '')).filter(Boolean).join(', ');
    const refs = (item.refs as Record<string, unknown>) ?? {};
    const desc = stripHtml(String(item.contents ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: 'TheMuse',
      sourceType: 'themuse',
      externalId: String(item.id ?? ''),
      applyUrl: String(refs.landing_page ?? ''),
      company: String(companyObj.name ?? 'Unknown'),
      title: String(item.name ?? ''),
      location: locName || 'Unspecified',
      isRemote: locName.toLowerCase().includes('remote'),
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.publication_date ? String(item.publication_date) : null,
    };
  });
}

export async function fetchHNHiring(): Promise<RawDiscoveredJob[]> {
  const searchRes = await fetch(
    'https://hn.algolia.com/api/v1/search_by_date?query=%22Ask%20HN%3A%20Who%20is%20hiring%22&tags=story&hitsPerPage=1',
  );
  if (!searchRes.ok) throw new Error(`HN Algolia HTTP ${searchRes.status}`);
  const searchJson = (await searchRes.json()) as { hits?: Array<{ objectID: string }> };
  const storyId = searchJson.hits?.[0]?.objectID;
  if (!storyId) return [];

  const itemRes = await fetch(`https://hn.algolia.com/api/v1/items/${storyId}`);
  if (!itemRes.ok) throw new Error(`HN Item HTTP ${itemRes.status}`);
  const story = (await itemRes.json()) as { children?: Array<Record<string, unknown>> };

  const jobs: RawDiscoveredJob[] = [];
  for (const comment of (story.children ?? []).slice(0, 60)) {
    const text = stripHtml(String(comment.text ?? ''));
    if (text.length < 40) continue;
    const firstLine = text.split(/\n|\|/)[0]?.trim() ?? '';
    const parts = firstLine.split('|').map((s) => s.trim());
    const company = parts[0]?.slice(0, 60) || 'HN Startup';
    const title = parts[1]?.slice(0, 100) || 'Engineering Role';
    const emails = extractEmailsFromText(text);
    const urlMatch = text.match(/https?:\/\/[^\s)]+/);
    const commentUrl = `https://news.ycombinator.com/item?id=${comment.id}`;

    jobs.push({
      sourceName: 'HN WhoIsHiring',
      sourceType: 'hn_hiring',
      externalId: String(comment.id ?? ''),
      applyUrl: urlMatch?.[0] ?? commentUrl,
      company,
      title,
      location: text.toLowerCase().includes('remote') ? 'Remote' : 'Check post',
      isRemote: text.toLowerCase().includes('remote'),
      description: text,
      contactEmail: emails[0] ?? null,
      postedAt: comment.created_at ? String(comment.created_at) : null,
    });
  }
  return jobs;
}

export async function fetchGreenhouseBoard(boardToken: string): Promise<RawDiscoveredJob[]> {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`,
  );
  if (!res.ok) throw new Error(`Greenhouse (${boardToken}) HTTP ${res.status}`);
  const json = (await res.json()) as { jobs?: Array<Record<string, unknown>> };

  return (json.jobs ?? []).slice(0, 40).map((item) => {
    const loc = (item.location as Record<string, unknown>)?.name;
    const desc = stripHtml(String(item.content ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: `Greenhouse:${boardToken}`,
      sourceType: 'greenhouse',
      externalId: String(item.id ?? ''),
      applyUrl: String(item.absolute_url ?? ''),
      company: boardToken,
      title: String(item.title ?? ''),
      location: loc ? String(loc) : 'Unspecified',
      isRemote: String(loc ?? '').toLowerCase().includes('remote'),
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.updated_at ? String(item.updated_at) : null,
    };
  });
}

export async function fetchLeverBoard(slug: string): Promise<RawDiscoveredJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  if (!res.ok) throw new Error(`Lever (${slug}) HTTP ${res.status}`);
  const list = (await res.json()) as Array<Record<string, unknown>>;

  return list.slice(0, 40).map((item) => {
    const cats = (item.categories as Record<string, unknown>) ?? {};
    const loc = String(cats.location ?? 'Unspecified');
    const desc = stripHtml(String(item.descriptionPlain ?? item.description ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: `Lever:${slug}`,
      sourceType: 'lever',
      externalId: String(item.id ?? ''),
      applyUrl: String(item.hostedUrl ?? ''),
      company: slug,
      title: String(item.text ?? ''),
      location: loc,
      isRemote: loc.toLowerCase().includes('remote'),
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.createdAt ? new Date(Number(item.createdAt)).toISOString() : null,
    };
  });
}

export async function fetchAshbyBoard(slug: string): Promise<RawDiscoveredJob[]> {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(`Ashby (${slug}) HTTP ${res.status}`);
  const json = (await res.json()) as { jobs?: Array<Record<string, unknown>> };

  return (json.jobs ?? []).slice(0, 40).map((item) => {
    const desc = stripHtml(String(item.descriptionPlain ?? item.descriptionHtml ?? ''));
    const emails = extractEmailsFromText(desc);
    const loc = String(item.location ?? 'Unspecified');
    return {
      sourceName: `Ashby:${slug}`,
      sourceType: 'ashby',
      externalId: String(item.id ?? ''),
      applyUrl: String(item.jobUrl ?? item.applyUrl ?? ''),
      company: slug,
      title: String(item.title ?? ''),
      location: loc,
      isRemote: Boolean(item.isRemote) || loc.toLowerCase().includes('remote'),
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.publishedAt ? String(item.publishedAt) : null,
    };
  });
}

export function parseRssXml(xml: string, sourceName = 'RSS'): RawDiscoveredJob[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const jobs: RawDiscoveredJob[] = [];

  $('item, entry').each((_, el) => {
    const title = $(el).find('title').first().text().trim();
    const link =
      $(el).find('link').first().text().trim() ||
      $(el).find('link').first().attr('href')?.trim() ||
      '';
    const rawDesc =
      $(el).find('description').first().text() || $(el).find('content').first().text() || '';
    const desc = stripHtml(rawDesc);
    const emails = extractEmailsFromText(desc);
    if (!title || !link) return;

    const parts = title.split(/:\s+| at /i);
    const parsedTitle = parts.length > 1 ? parts.slice(1).join(' ') : title;
    const parsedCompany = parts.length > 1 ? parts[0] : sourceName;

    jobs.push({
      sourceName,
      sourceType: 'rss',
      applyUrl: link,
      company: parsedCompany.trim(),
      title: parsedTitle.trim(),
      location: desc.toLowerCase().includes('remote') ? 'Remote' : 'Unspecified',
      isRemote: desc.toLowerCase().includes('remote'),
      description: desc,
      contactEmail: emails[0] ?? null,
    });
  });

  return jobs.slice(0, 35);
}

export async function fetchRssFeed(url: string, sourceName = 'RSS'): Promise<RawDiscoveredJob[]> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`RSS (${url}) HTTP ${res.status}`);
  const xml = await res.text();
  return parseRssXml(xml, sourceName);
}

export async function fetchAdzuna(params: {
  appId: string;
  appKey: string;
  country?: string;
  query: string;
}): Promise<RawDiscoveredJob[]> {
  const country = params.country || 'us';
  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${encodeURIComponent(
    params.appId,
  )}&app_key=${encodeURIComponent(params.appKey)}&results_per_page=25&what=${encodeURIComponent(
    params.query,
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Adzuna HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Array<Record<string, unknown>> };

  return (json.results ?? []).map((item) => {
    const companyObj = (item.company as Record<string, unknown>) ?? {};
    const locObj = (item.location as Record<string, unknown>) ?? {};
    const desc = stripHtml(String(item.description ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: 'Adzuna',
      sourceType: 'adzuna',
      externalId: String(item.id ?? ''),
      applyUrl: String(item.redirect_url ?? ''),
      company: String(companyObj.display_name ?? 'Unknown'),
      title: String(item.title ?? ''),
      location: String(locObj.display_name ?? 'Unspecified'),
      isRemote: desc.toLowerCase().includes('remote'),
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.created ? String(item.created) : null,
    };
  });
}

/**
 * Fetches a public web page for the ToolLoopAgent. Uses lightweight fetch+cheerio
 * first, and only falls back to headless Playwright Chromium when ENABLE_PLAYWRIGHT=true
 * and static HTML has negligible readable text (i.e. SPA/JS-rendered).
 */
export async function fetchReadableWebPage(url: string): Promise<{
  title: string;
  text: string;
  emails: string[];
  links: Array<{ text: string; href: string }>;
}> {
  let html = '';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) html = await res.text();
  } catch {
    // Fall through to Playwright if enabled
  }

  const parseHtml = (rawHtml: string) => {
    const $ = cheerio.load(rawHtml);
    $('script, style, noscript').remove();
    const title = $('title').text().trim();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const emails = extractEmailsFromText(text);
    const links: Array<{ text: string; href: string }> = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const linkText = $(el).text().replace(/\s+/g, ' ').trim();
      if (href && linkText && href.startsWith('http')) {
        links.push({ text: linkText.slice(0, 100), href });
      }
    });
    return { title, text: text.slice(0, 14000), emails, links: links.slice(0, 40) };
  };

  const staticParsed = parseHtml(html);
  if (staticParsed.text.length >= 400 || process.env.ENABLE_PLAYWRIGHT !== 'true') {
    return staticParsed;
  }

  // On-demand single-page Chromium fallback for JS-rendered public career boards (only if installed)
  const { chromium } = await import('playwright');
  const execPath = chromium.executablePath();
  if (!fs.existsSync(execPath)) {
    return staticParsed;
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const renderedHtml = await page.content();
    return parseHtml(renderedHtml);
  } finally {
    await browser.close();
  }
}

export async function fetchHimalayas(): Promise<RawDiscoveredJob[]> {
  const res = await fetch('https://himalayas.app/jobs/api?limit=40', {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Himalayas HTTP ${res.status}`);
  const json = (await res.json()) as { jobs?: Array<Record<string, unknown>> };

  return (json.jobs ?? []).map((item) => {
    const desc = stripHtml(String(item.description ?? item.excerpt ?? ''));
    const emails = extractEmailsFromText(desc);
    const locs = Array.isArray(item.locationRestrictions)
      ? (item.locationRestrictions as string[]).join(', ')
      : 'Remote';
    const minSal = item.minSalary ? `$${item.minSalary}` : '';
    const maxSal = item.maxSalary ? `$${item.maxSalary}` : '';
    const salaryText = minSal && maxSal ? `${minSal} - ${maxSal}` : minSal || undefined;

    return {
      sourceName: 'Himalayas',
      sourceType: 'himalayas',
      externalId: String(item.guid ?? item.applicationLink ?? ''),
      applyUrl: String(item.applicationLink ?? item.guid ?? ''),
      company: String(item.companyName ?? 'Unknown'),
      title: String(item.title ?? ''),
      location: locs || 'Remote',
      isRemote: true,
      salaryText,
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.pubDate ? new Date(Number(item.pubDate) * 1000).toISOString() : null,
    };
  });
}

export async function fetchJobicy(tag = ''): Promise<RawDiscoveredJob[]> {
  const qs = tag ? `?count=40&tag=${encodeURIComponent(tag)}` : '?count=40';
  const res = await fetch(`https://jobicy.com/api/v2/remote-jobs${qs}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Jobicy HTTP ${res.status}`);
  const json = (await res.json()) as { jobs?: Array<Record<string, unknown>> };

  return (json.jobs ?? []).map((item) => {
    const desc = stripHtml(String(item.jobDescription ?? item.jobExcerpt ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: 'Jobicy',
      sourceType: 'jobicy',
      externalId: String(item.id ?? ''),
      applyUrl: String(item.url ?? ''),
      company: String(item.companyName ?? 'Unknown'),
      title: String(item.jobTitle ?? ''),
      location: String(item.jobGeo ?? 'Remote'),
      isRemote: true,
      salaryText:
        item.annualSalaryMin && item.annualSalaryMax
          ? `${item.salaryCurrency ?? '$'}${item.annualSalaryMin} - ${item.annualSalaryMax}`
          : undefined,
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.pubDate ? String(item.pubDate) : null,
    };
  });
}

export async function fetchWorkingNomads(): Promise<RawDiscoveredJob[]> {
  const res = await fetch('https://www.workingnomads.com/api/exposed_jobs/', {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`WorkingNomads HTTP ${res.status}`);
  const list = (await res.json()) as Array<Record<string, unknown>>;

  return list.slice(0, 40).map((item) => {
    const desc = stripHtml(String(item.description ?? ''));
    const emails = extractEmailsFromText(desc);
    return {
      sourceName: 'WorkingNomads',
      sourceType: 'workingnomads',
      applyUrl: String(item.url ?? ''),
      company: String(item.company_name ?? 'Unknown'),
      title: String(item.title ?? ''),
      location: String(item.location ?? 'Remote'),
      isRemote: true,
      description: desc,
      contactEmail: emails[0] ?? null,
      postedAt: item.pub_date ? String(item.pub_date) : null,
    };
  });
}

export async function fetchWeWorkRemotely(
  feedUrl = 'https://weworkremotely.com/remote-jobs.rss',
): Promise<RawDiscoveredJob[]> {
  const jobs = await fetchRssFeed(feedUrl, 'WeWorkRemotely');
  return jobs.map((j) => ({ ...j, sourceType: 'weworkremotely' }));
}

export function parseBDJobsHtml(html: string): RawDiscoveredJob[] {
  const $ = cheerio.load(html);
  const jobs: RawDiscoveredJob[] = [];
  const seen = new Set<string>();

  $('a[href*="jobdetails.asp"], .job-title-text a, .norm-jobs-wrapper a').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (!href || !title || title.length < 3) return;

    const fullUrl = href.startsWith('http') ? href : `https://jobs.bdjobs.com/${href.replace(/^\/+/, '')}`;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    const card = $(el)
      .closest('.norm-jobs-wrapper, .sout-jobs-wrapper, .job-card')
      .first();
    const scope = card.length ? card : $(el).parent().parent();
    const company =
      scope.find('.comp-name-text, .company-name, h3').first().text().replace(/\s+/g, ' ').trim() ||
      'BDJobs Employer';
    const location =
      scope.find('.locon-text, .location').first().text().replace(/\s+/g, ' ').trim() ||
      'Bangladesh / Remote';
    const cardText = scope.text().replace(/\s+/g, ' ').trim();
    const emails = extractEmailsFromText(cardText);

    jobs.push({
      sourceName: 'BDJobs',
      sourceType: 'bdjobs',
      applyUrl: fullUrl,
      company,
      title,
      location,
      isRemote: cardText.toLowerCase().includes('remote') || cardText.toLowerCase().includes('work from home'),
      description: cardText || `${title} at ${company}`,
      contactEmail: emails[0] ?? null,
    });
  });

  return jobs.slice(0, 25);
}

export function parseBDJobsJson(payload: {
  data?: Array<Record<string, unknown>>;
}): RawDiscoveredJob[] {
  return (payload.data ?? [])
    .filter((item) => item && item.Jobid && item.jobTitle)
    .slice(0, 35)
    .map((item) => {
      const id = String(item.Jobid);
      const title = String(item.jobTitle ?? '').trim();
      const company = String(item.companyName ?? 'BDJobs Employer').trim();
      const location = String(item.location ?? 'Bangladesh').trim();
      const desc = stripHtml(
        [item.jobContext, item.jobDescription, item.eduRec, item.experience]
          .filter(Boolean)
          .map(String)
          .join(' '),
      );
      const emails = extractEmailsFromText(desc);
      return {
        sourceName: 'BDJobs',
        sourceType: 'bdjobs',
        externalId: id,
        applyUrl: `https://jobs.bdjobs.com/jobdetails.asp?id=${encodeURIComponent(id)}`,
        company,
        title,
        location,
        isRemote:
          location.toLowerCase().includes('remote') ||
          desc.toLowerCase().includes('remote') ||
          desc.toLowerCase().includes('work from home'),
        description: desc || `${title} at ${company} (${location})`,
        contactEmail: emails[0] ?? null,
        postedAt: item.publishDate ? String(item.publishDate) : null,
      };
    });
}

export async function fetchBDJobs(
  keywordOrList: string | string[] = 'software',
  maxPages = 3,
): Promise<RawDiscoveredJob[]> {
  const keywords = (
    Array.isArray(keywordOrList) ? keywordOrList : [keywordOrList]
  )
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (keywords.length === 0) keywords.push('software');

  const seenIds = new Set<string>();
  const jobs: RawDiscoveredJob[] = [];

  // 1. Primary: BDJobs public JSON search gateway with keyword + page pagination
  for (const kw of keywords) {
    for (let pg = 1; pg <= maxPages; pg++) {
      try {
        const apiUrl = `https://gateway.bdjobs.com/recruitment-account-test/api/JobSearch/GetJobSearch?isPro=1&rpp=40&pg=${pg}&txtKeyword=${encodeURIComponent(
          kw,
        )}`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': USER_AGENT } });
        if (!res.ok) break;
        const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
        const pageJobs = parseBDJobsJson(json);
        let addedOnPage = 0;
        for (const item of pageJobs) {
          const key = item.externalId || item.applyUrl;
          if (seenIds.has(key)) continue;
          seenIds.add(key);
          jobs.push(item);
          addedOnPage++;
        }
        if (pageJobs.length < 30 || addedOnPage === 0) break;
      } catch {
        break;
      }
    }
  }

  // 2. Fallback: classic HTML search page if gateway returned nothing
  const searchUrl = `https://jobs.bdjobs.com/jobsearch.asp?txtkeyword=${encodeURIComponent(keywords[0])}`;
  if (jobs.length === 0) {
    try {
      const res = await fetch(searchUrl, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) {
        jobs.push(...parseBDJobsHtml(await res.text()));
      }
    } catch {
      // Optional Playwright check below
    }
  }

  if (jobs.length === 0 && process.env.ENABLE_PLAYWRIGHT === 'true') {
    const { chromium } = await import('playwright');
    if (fs.existsSync(chromium.executablePath())) {
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        const page = await browser.newPage({ userAgent: USER_AGENT });
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2000);
        jobs.push(...parseBDJobsHtml(await page.content()));
      } finally {
        await browser.close();
      }
    }
  }

  // Enrich top 10 unique jobs via BDJobs JSON jobDetails API
  for (const job of jobs.slice(0, 10)) {
    if (!job.externalId) continue;
    try {
      const detailRes = await fetch(
        `https://gateway.bdjobs.com/ActtivejobsTest/api/JobSubsystem/jobDetails?jobId=${encodeURIComponent(
          job.externalId,
        )}`,
        { headers: { 'User-Agent': USER_AGENT } },
      );
      if (!detailRes.ok) continue;
      const detailJson = (await detailRes.json()) as { data?: Array<Record<string, unknown>> };
      const detail = detailJson.data?.[0];
      if (!detail) continue;
      const fullText = stripHtml(
        [
          detail.JobDescription,
          detail.JobContext,
          detail.AdditionJobRequirements,
          detail.ApplyInstruction,
          detail.CompanyEmail,
        ]
          .filter(Boolean)
          .map(String)
          .join(' '),
      );
      if (fullText.length > job.description.length) {
        job.description = fullText.slice(0, 8000);
      }
      const directEmail = typeof detail.CompanyEmail === 'string' ? detail.CompanyEmail.trim() : '';
      const emails = extractEmailsFromText(`${directEmail} ${fullText}`);
      if (emails[0] && !job.contactEmail) job.contactEmail = emails[0];
    } catch {
      // Keep summary card data on detail fetch error
    }
  }

  return jobs;
}

export function parseLinkedInGuestHtml(html: string): RawDiscoveredJob[] {
  const $ = cheerio.load(html);
  const jobs: RawDiscoveredJob[] = [];
  const seen = new Set<string>();

  $('li, .base-card').each((_, el) => {
    const linkEl = $(el).find('a.base-card__full-link, a[href*="/jobs/view/"]').first();
    const applyUrl = linkEl.attr('href')?.split('?')[0]?.trim() || '';
    if (!applyUrl || seen.has(applyUrl)) return;
    seen.add(applyUrl);

    const title = $(el).find('.base-search-card__title, h3').first().text().replace(/\s+/g, ' ').trim();
    const company = $(el)
      .find('.base-search-card__subtitle, h4')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const location = $(el)
      .find('.job-search-card__location')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    if (!applyUrl || !title) return;
    jobs.push({
      sourceName: 'LinkedIn Public',
      sourceType: 'linkedin_public',
      applyUrl,
      company: company || 'LinkedIn Employer',
      title,
      location: location || 'Remote',
      isRemote:
        location.toLowerCase().includes('remote') || title.toLowerCase().includes('remote'),
      description: `${title} at ${company} (${location})`,
    });
  });

  return jobs.slice(0, 20);
}

/**
 * Fetches LinkedIn's unauthenticated public guest job listings endpoint.
 * Never attempts to bypass login walls or CAPTCHAs; stops gracefully on rate limits.
 */
export async function fetchLinkedInPublic(
  keyword = 'Software Engineer',
  remoteOnly = true,
): Promise<RawDiscoveredJob[]> {
  const remoteFlag = remoteOnly ? '&f_WT=2' : '';
  const searchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
    keyword,
  )}${remoteFlag}&start=0`;

  const res = await fetch(searchUrl, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn public guest HTTP ${res.status} (use Chrome Extension while browsing)`);
  }

  const jobs = parseLinkedInGuestHtml(await res.text());

  // Enrich up to 5 public guest job detail views politely
  for (const job of jobs.slice(0, 5)) {
    const idMatch = job.applyUrl.match(/-(\d+)(?:\/|$)/);
    if (!idMatch?.[1]) continue;
    try {
      await new Promise((r) => setTimeout(r, 400));
      const detailRes = await fetch(
        `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${idMatch[1]}`,
        { headers: { 'User-Agent': USER_AGENT } },
      );
      if (!detailRes.ok) continue;
      const $ = cheerio.load(await detailRes.text());
      const desc = $('.show-more-less-html__markup, .description__text')
        .text()
        .replace(/\s+/g, ' ')
        .trim();
      if (desc.length > 60) {
        job.description = desc.slice(0, 8000);
        const emails = extractEmailsFromText(desc);
        if (emails[0]) job.contactEmail = emails[0];
      }
    } catch {
      // Keep card metadata on transient error
    }
  }

  return jobs;
}
