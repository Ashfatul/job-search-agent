-- Expand job_sources.source_type check constraint for additional remote & regional boards
alter table public.job_sources
  drop constraint if exists job_sources_source_type_check;

alter table public.job_sources
  add constraint job_sources_source_type_check check (
    source_type in (
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
      'web_page'
    )
  );
