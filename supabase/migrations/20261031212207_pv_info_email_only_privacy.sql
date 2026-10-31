set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Incremental migration for the existing PV Info database.
-- Inspect the target project and existing schema before applying.
-- Does not delete historical names, assignments, account metadata or audit history.

revoke update (name) on public.team_members from authenticated;

create or replace function public.create_team(team_name text, member_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.teams (name, created_by) values (trim(team_name), auth.uid()) returning id into t;
  insert into public.team_members (team_id, user_id, email, name, role)
    values (t, auth.uid(), auth.jwt() ->> 'email', null, 'owner');
  return t;
end $$;

create or replace function public.join_team(code text, member_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into t from public.teams where invite_code = trim(code);
  if t is null then raise exception 'That invite code was not found'; end if;
  insert into public.team_members (team_id, user_id, email, name)
    values (t, auth.uid(), auth.jwt() ->> 'email', null)
    on conflict (team_id, user_id) do update set name = null;
  return t;
end $$;

create or replace function public.admin_set_manifest_approval(v text, approve boolean, approver text default null, why text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare who text := 'Administrator'; -- Public attribution never contains a personal name or email.
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if coalesce(trim(v), '') = '' then raise exception 'Which manifest version?'; end if;
  insert into public.manifest_approvals (version, status, approved_by, approved_on, note, by_email, updated_at)
    values (trim(v), case when approve then 'approved' else 'draft' end, case when approve then who end, case when approve then current_date end, nullif(trim(why), ''), auth.jwt() ->> 'email', now())
    on conflict (version) do update set status = excluded.status, approved_by = excluded.approved_by, approved_on = excluded.approved_on, note = excluded.note, by_email = excluded.by_email, updated_at = now();
  perform public.admin_log(case when approve then 'company list approved' else 'company list approval withdrawn' end, trim(v), jsonb_build_object('by', who, 'note', nullif(trim(why), '')));
end $$;
revoke execute on function public.admin_set_manifest_approval(text, boolean, text, text) from public, anon;
grant execute on function public.admin_set_manifest_approval(text, boolean, text, text) to authenticated;

-- Email-only account policy. Keep the nullable legacy column for compatibility,
-- but do not accept personal display names through old clients or direct requests.
create or replace function public.email_only_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := null;
  return new;
end $$;
drop trigger if exists email_only_member on public.team_members;
create trigger email_only_member before insert or update on public.team_members
  for each row execute function public.email_only_member();
revoke all on function public.email_only_member() from public, anon, authenticated;

create or replace function public.email_only_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.assign is not null and coalesce(new.assign ->> 'to', '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Assignments require an email address, not a personal name';
  end if;
  return new;
end $$;
drop trigger if exists "00_email_only_assignment" on public.team_items;
create trigger "00_email_only_assignment" before insert or update on public.team_items
  for each row execute function public.email_only_assignment();
revoke all on function public.email_only_assignment() from public, anon, authenticated;
