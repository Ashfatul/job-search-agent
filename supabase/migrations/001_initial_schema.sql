-- =============================================================================
-- Job Search Bot — Supabase PostgreSQL Schema, RLS, pg_trgm & pgvector Search
-- =============================================================================

-- Extensions (available on Supabase Free Tier)
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists vector;

-- -----------------------------------------------------------------------------
-- 1. Profiles & Authorization Roles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('owner', 'user')),
  telegram_chat_id text,
  summary_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Automatically create profile & default settings on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  user_count int;
  assigned_role text;
begin
  select count(*) into user_count from public.profiles;
  if user_count = 0 then
    assigned_role := 'owner';
  else
    assigned_role := 'user';
  end if;

  insert into public.profiles (id, email, full_name, role, summary_email)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    assigned_role,
    new.email
  )
  on conflict (id) do nothing;

  insert into public.agent_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. Agent Settings
-- -----------------------------------------------------------------------------
create table if not exists public.agent_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cron_schedule text not null default '0 */6 * * *',
  target_roles text[] not null default array['Software Engineer', 'Full Stack Developer'],
  target_locations text[] not null default array['Remote'],
  remote_only boolean not null default true,
  min_match_score int not null default 65 check (min_match_score between 0 and 100),
  auto_send_enabled boolean not null default false,
  auto_send_min_score int not null default 85 check (auto_send_min_score between 0 and 100),
  daily_email_cap int not null default 12 check (daily_email_cap between 1 and 100),
  followup_delays_days int[] not null default array[4, 9],
  telegram_enabled boolean not null default true,
  summary_email_enabled boolean not null default true,
  is_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.agent_settings enable row level security;

create policy "Users manage own agent_settings"
  on public.agent_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. Resumes
-- -----------------------------------------------------------------------------
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Primary Resume',
  raw_text text not null,
  parsed_profile jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resumes enable row level security;

create policy "Users manage own resumes"
  on public.resumes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_resumes_user_active on public.resumes(user_id, is_active);

-- -----------------------------------------------------------------------------
-- 4. Job Sources (APIs, RSS, ATS boards, Career pages)
-- -----------------------------------------------------------------------------
create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('remoteok', 'remotive', 'arbeitnow', 'themuse', 'hn_hiring', 'himalayas', 'jobicy', 'workingnomads', 'weworkremotely', 'bdjobs', 'linkedin_public', 'adzuna', 'greenhouse', 'lever', 'ashby', 'rss', 'web_page')),
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.job_sources enable row level security;

create policy "Users manage own job_sources"
  on public.job_sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. Jobs (Discovered or Saved via Chrome Extension)
-- -----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.job_sources(id) on delete set null,
  source_name text not null default 'manual',
  external_id text,
  normalized_url text not null,
  apply_url text not null,
  company text not null,
  title text not null,
  location text,
  is_remote boolean not null default false,
  salary_text text,
  description text not null default '',
  contact_email text,
  contact_name text,
  match_score int not null default 0 check (match_score between 0 and 100),
  match_summary jsonb not null default '{}'::jsonb,
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(company, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored,
  embedding vector(768),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);

alter table public.jobs enable row level security;

create policy "Users manage own jobs"
  on public.jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_jobs_user_created on public.jobs(user_id, created_at desc);
create index if not exists idx_jobs_company_trgm on public.jobs using gin (company gin_trgm_ops);
create index if not exists idx_jobs_title_trgm on public.jobs using gin (title gin_trgm_ops);
create index if not exists idx_jobs_search_tsv on public.jobs using gin (search_tsv);
create index if not exists idx_jobs_embedding_hnsw on public.jobs using hnsw (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- 6. Applications (Full Lifecycle Tracker)
-- -----------------------------------------------------------------------------
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'matched' check (
    status in (
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
      'archived'
    )
  ),
  channel text not null default 'email' check (channel in ('email', 'portal', 'extension', 'manual')),
  applied_at timestamptz,
  next_followup_at timestamptz,
  followup_stage int not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

alter table public.applications enable row level security;

create policy "Users manage own applications"
  on public.applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_applications_user_status on public.applications(user_id, status);
create index if not exists idx_applications_followup on public.applications(user_id, next_followup_at)
  where next_followup_at is not null;

-- -----------------------------------------------------------------------------
-- 7. Outreach Emails (Initial Apply + Follow-up Thread Tracking)
-- -----------------------------------------------------------------------------
create table if not exists public.outreach_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  recipient_email text,
  recipient_name text,
  email_type text not null check (email_type in ('initial', 'followup_1', 'followup_2')),
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'cancelled', 'failed')),
  gmail_message_id text,
  gmail_thread_id text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

alter table public.outreach_emails enable row level security;

create policy "Users manage own outreach_emails"
  on public.outreach_emails for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_outreach_user_status on public.outreach_emails(user_id, status, scheduled_for);

-- -----------------------------------------------------------------------------
-- 8. Agent Run Logs & Metrics
-- -----------------------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_type text not null default 'cron' check (trigger_type in ('cron', 'manual', 'extension')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  jobs_found int not null default 0,
  jobs_matched int not null default 0,
  emails_drafted int not null default 0,
  emails_sent int not null default 0,
  followups_sent int not null default 0,
  employees_reached int not null default 0,
  error_message text,
  log_summary jsonb not null default '{}'::jsonb
);

alter table public.agent_runs enable row level security;

create policy "Users view own agent_runs"
  on public.agent_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 9. "Somewhat Search" Fuzzy + Semantic Deduplication RPC
-- -----------------------------------------------------------------------------
create or replace function public.search_applied_jobs(
  p_user_id uuid,
  p_query text default '',
  p_normalized_url text default '',
  p_company text default '',
  p_title text default '',
  p_embedding vector(768) default null,
  p_limit int default 10
)
returns table (
  job_id uuid,
  application_id uuid,
  company text,
  title text,
  apply_url text,
  normalized_url text,
  source_name text,
  match_score int,
  application_status text,
  applied_at timestamptz,
  channel text,
  combined_similarity float,
  match_reason text
)
language sql
stable
security invoker
as $$
  with candidates as (
    select
      j.id as job_id,
      a.id as application_id,
      j.company,
      j.title,
      j.apply_url,
      j.normalized_url,
      j.source_name,
      j.match_score,
      coalesce(a.status, 'discovered') as application_status,
      a.applied_at,
      coalesce(a.channel, 'email') as channel,
      (p_normalized_url <> '' and j.normalized_url = p_normalized_url) as is_exact_url,
      greatest(
        case when p_company <> '' then similarity(lower(j.company), lower(p_company)) else 0 end,
        case when p_query <> '' then similarity(lower(j.company || ' ' || j.title), lower(p_query)) else 0 end
      ) as trgm_company_score,
      greatest(
        case when p_title <> '' then similarity(lower(j.title), lower(p_title)) else 0 end,
        case when p_query <> '' then similarity(lower(j.title), lower(p_query)) else 0 end
      ) as trgm_title_score,
      case
        when p_query <> '' then ts_rank_cd(j.search_tsv, plainto_tsquery('english', p_query))
        else 0
      end as fts_score,
      case
        when p_embedding is not null and j.embedding is not null then 1 - (j.embedding <=> p_embedding)
        else 0
      end as vec_score
    from public.jobs j
    left join public.applications a on a.job_id = j.id and a.user_id = p_user_id
    where j.user_id = p_user_id
  )
  select
    job_id,
    application_id,
    company,
    title,
    apply_url,
    normalized_url,
    source_name,
    match_score,
    application_status,
    applied_at,
    channel,
    case
      when is_exact_url then 1.0
      else least(
        0.99,
        greatest(
          (trgm_company_score * 0.45 + trgm_title_score * 0.55),
          trgm_title_score * 0.85,
          vec_score,
          least(0.85, fts_score)
        )
      )
    end as combined_similarity,
    case
      when is_exact_url then 'EXACT_URL'
      when vec_score >= 0.86 then 'SEMANTIC_MATCH'
      when (trgm_company_score >= 0.45 and trgm_title_score >= 0.40) then 'FUZZY_COMPANY_TITLE'
      when trgm_title_score >= 0.50 or trgm_company_score >= 0.60 then 'FUZZY_PARTIAL'
      else 'TEXT_MATCH'
    end as match_reason
  from candidates
  where
    is_exact_url
    or trgm_company_score >= 0.25
    or trgm_title_score >= 0.25
    or fts_score > 0.01
    or vec_score >= 0.72
  order by combined_similarity desc, applied_at desc nulls last
  limit p_limit;
$$;

-- -----------------------------------------------------------------------------
-- 10. Supabase API Role Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.search_applied_jobs(
  uuid, text, text, text, text, vector, int
) to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
