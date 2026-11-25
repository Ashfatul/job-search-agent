import { describe, expect, it } from 'vitest';
import {
  computeKeywordOverlap,
  extractEmailsFromText,
  normalizeCompanyTitleKey,
  normalizeJobUrl,
} from '../src/url.js';

describe('normalizeJobUrl', () => {
  it('strips tracking parameters and trailing slashes while preserving job id params', () => {
    const a = normalizeJobUrl('https://www.boards.greenhouse.io/acme/jobs/12345/?utm_source=linkedin&gh_jid=987');
    const b = normalizeJobUrl('http://boards.greenhouse.io/acme/jobs/12345?gh_jid=987&ref=remoteok');
    expect(a).toBe('https://boards.greenhouse.io/acme/jobs/12345?gh_jid=987');
    expect(a).toBe(b);
  });

  it('normalizes indeed jk param cleanly', () => {
    expect(normalizeJobUrl('https://www.indeed.com/viewjob?jk=abc123&utm_campaign=daily')).toBe(
      'https://indeed.com/viewjob?jk=abc123',
    );
  });
});

describe('extractEmailsFromText', () => {
  it('extracts valid hiring emails and ignores noreply addresses', () => {
    const emails = extractEmailsFromText(
      'Send CV to jobs@acme.dev or alice.hr@acme.dev. Do not email noreply@acme.dev.',
    );
    expect(emails).toEqual(['jobs@acme.dev', 'alice.hr@acme.dev']);
  });
});

describe('computeKeywordOverlap', () => {
  it('computes overlap between similar job titles', () => {
    const score = computeKeywordOverlap('Senior Full Stack TypeScript Engineer', 'Full Stack Engineer TypeScript');
    expect(score).toBeGreaterThan(0.7);
  });
});

describe('normalizeCompanyTitleKey', () => {
  it('normalizes company and title across punctuation and casing', () => {
    expect(normalizeCompanyTitleKey('Acme, Inc.', 'Senior Full-Stack Engineer!')).toBe(
      normalizeCompanyTitleKey('acme inc', 'Senior Full Stack Engineer'),
    );
  });
});
