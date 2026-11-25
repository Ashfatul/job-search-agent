function extractJobDetails() {
  const url = window.location.href;
  const host = window.location.hostname.toLowerCase();

  const pickText = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.trim()) {
        return el.textContent.replace(/\s+/g, ' ').trim();
      }
    }
    return '';
  };

  let title = '';
  let company = '';
  let description = '';

  if (host.includes('facebook.com')) {
    // Extract active Facebook job / group hiring post text
    const postText =
      pickText([
        '[role="dialog"] [data-ad-preview="message"]',
        '[role="article"] [data-ad-preview="message"]',
        '[role="dialog"] [dir="auto"]',
        '[role="article"]',
      ]) || (document.body?.innerText || '').slice(0, 6000);
    description = postText.slice(0, 8000);
    const firstLine = postText.split(/\n|\.|!/)[0]?.trim() || 'Facebook Hiring Post';
    title = firstLine.slice(0, 120);
    company = 'Facebook Hiring Post';
  } else if (host.includes('bdjobs.com')) {
    title = pickText(['.job-title', '.jtitle', 'h2', 'h1']);
    company = pickText(['.company-name', '.cname', 'h3']);
    description = pickText(['.job_des', '.job-details', '#job-details', 'main', 'body']);
  } else {
    title = pickText([
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      '.top-card-layout__title',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.app-title',
      '.posting-headline h2',
      'h1',
    ]);

    company = pickText([
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.topcard__org-name-link',
      '[data-testid="inlineHeader-companyName"]',
      '.company-name',
      '.posting-categories .sort-by-team',
    ]);

    description =
      pickText([
        '.jobs-description__content',
        '.show-more-less-html__markup',
        '#jobDescriptionText',
        '#content',
        '.posting-page',
        'main',
        'article',
      ]) || (document.body?.innerText || '').slice(0, 6000);
  }

  if (!title) {
    title = document.title.split('|')[0].split(' - ')[0].trim();
  }

  if (!company) {
    const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
    company = ogSite?.trim() || host.replace(/^www\./, '').split('.')[0];
  }

  return {
    url,
    title: title.slice(0, 140),
    company: company.slice(0, 100),
    description: description.slice(0, 8000),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'EXTRACT_JOB_INFO') {
    sendResponse(extractJobDetails());
  }
  return true;
});
