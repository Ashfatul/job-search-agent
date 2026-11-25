-- =============================================================================
-- Grant Schema, Table, Sequence, and Function Privileges for Supabase API Roles
-- =============================================================================

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

-- Backfill profiles & agent_settings for any user who signed up before trigger existed
insert into public.profiles (id, email, full_name, role, summary_email)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, ''), '@', 1)),
  'owner',
  u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.agent_settings (user_id)
select u.id
from auth.users u
where not exists (select 1 from public.agent_settings s where s.user_id = u.id);
