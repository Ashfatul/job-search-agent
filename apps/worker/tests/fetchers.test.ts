import { describe, expect, it } from 'vitest';
import {
  parseBDJobsHtml,
  parseBDJobsJson,
  parseLinkedInGuestHtml,
  parseRssXml,
} from '../src/sources/fetchers.js';
import { formatTelegramReport } from '../src/reporters/telegram.js';

describe('parseRssXml', () => {
  it('extracts jobs and direct contact emails from RSS items', () => {
    const sampleXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Acme Corp: Senior TypeScript Engineer</title>
            <link>https://acme.dev/jobs/ts-eng?utm_source=rss</link>
            <description>Remote role. Send portfolio to hiring@acme.dev.</description>
          </item>
        </channel>
      </rss>
    `;
    const jobs = parseRssXml(sampleXml, 'WeWorkRemotely');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].company).toBe('Acme Corp');
    expect(jobs[0].title).toBe('Senior TypeScript Engineer');
    expect(jobs[0].contactEmail).toBe('hiring@acme.dev');
    expect(jobs[0].isRemote).toBe(true);
  });
});

describe('formatTelegramReport', () => {
  it('includes found, matched, applied, follow-up, and employees reached counts', () => {
    const text = formatTelegramReport({
      dryRun: false,
      metrics: {
        jobsFound: 42,
        jobsMatched: 7,
        emailsDrafted: 5,
        emailsSent: 3,
        followupsSent: 2,
        employeesReached: 4,
        topMatches: [
          {
            company: 'Acme',
            title: 'Full Stack Engineer',
            matchScore: 91,
            applyUrl: 'https://acme.dev/jobs/1',
            status: 'applied',
          },
        ],
        errors: [],
      },
    });
    expect(text).toContain('<b>42</b>');
    expect(text).toContain('<b>7</b>');
    expect(text).toContain('<b>3</b>');
    expect(text).toContain('<b>4</b>');
    expect(text).toContain('Full Stack Engineer');
  });
});

describe('parseBDJobsJson', () => {
  it('parses BDJobs JSON gateway results cleanly', () => {
    const jobs = parseBDJobsJson({
      data: [
        {
          Jobid: '1559053',
          jobTitle: 'Senior React Developer',
          companyName: 'Dhaka Remote Co',
          location: 'Remote',
          jobDescription: 'Build apps. Send CV to jobs@dhakaremote.dev',
          publishDate: '2026-11-25T14:07:00Z',
        },
      ],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Senior React Developer');
    expect(jobs[0].contactEmail).toBe('jobs@dhakaremote.dev');
    expect(jobs[0].isRemote).toBe(true);
  });
});

describe('parseBDJobsHtml', () => {
  it('parses BDJobs job cards with title, company, and apply link', () => {
    const html = `
      <div class="norm-jobs-wrapper">
        <div class="job-title-text"><a href="jobdetails.asp?id=12345">Full Stack Developer</a></div>
        <div class="comp-name-text">Dhaka Tech Ltd</div>
        <div class="locon-text">Dhaka (Remote)</div>
      </div>
    `;
    const jobs = parseBDJobsHtml(html);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Full Stack Developer');
    expect(jobs[0].company).toBe('Dhaka Tech Ltd');
    expect(jobs[0].applyUrl).toBe('https://jobs.bdjobs.com/jobdetails.asp?id=12345');
    expect(jobs[0].isRemote).toBe(true);
  });
});

describe('parseLinkedInGuestHtml', () => {
  it('parses LinkedIn guest job search cards cleanly', () => {
    const html = `
      <li>
        <div class="base-card">
          <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/senior-node-dev-987654?trk=public"></a>
          <h3 class="base-search-card__title">Senior Node.js Engineer</h3>
          <h4 class="base-search-card__subtitle">CloudScale Inc</h4>
          <span class="job-search-card__location">Remote</span>
        </div>
      </li>
    `;
    const jobs = parseLinkedInGuestHtml(html);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Senior Node.js Engineer');
    expect(jobs[0].company).toBe('CloudScale Inc');
    expect(jobs[0].applyUrl).toBe('https://www.linkedin.com/jobs/view/senior-node-dev-987654');
    expect(jobs[0].isRemote).toBe(true);
  });
});
