-- PV Info database (Supabase Postgres).
-- Paste this whole file into Supabase → SQL Editor → New query, and press Run.
-- It is safe to run again after an update: everything is "if not exists" or replaced.
--
--   updates       every update and its impact card, kept for good (written by the hourly build)
--   workspaces    each signed-in reader's profile, groups and actions, synced across devices
--   teams         teams, their members and invite codes
--   team_items    the team's shared queue: assessment, assignment and dismissal per update
--   team_events   audit trail of every queue change, written only by the database itself
--
-- Row-level security is on for every table: anyone may read updates; a reader sees
-- only their own workspace; team data is visible only to that team's members.

-- ── Archive of updates ───────────────────────────────────────────────────────

create table if not exists public.updates (
  id text primary key,
  title text not null,
  link text not null,
  summary text,
  source text,
  kind text,
  country text,
  region text,
  agency text,
  category text,
  tags text[] not null default '{}',
  priority int,
  published timestamptz,
  retrieved timestamptz,
  impact jsonb,
  archived_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(source, '') || ' ' || coalesce(agency, ''))
  ) stored
);
create index if not exists updates_published on public.updates (published desc nulls last);
create index if not exists updates_country on public.updates (country);
create index if not exists updates_tags on public.updates using gin (tags);
create index if not exists updates_fts on public.updates using gin (fts);

alter table public.updates enable row level security;
drop policy if exists "Anyone can read updates" on public.updates;
create policy "Anyone can read updates" on public.updates for select using (true);
grant select on public.updates to anon, authenticated;

-- ── Personal workspace sync ──────────────────────────────────────────────────

create table if not exists public.workspaces (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
drop policy if exists "Own workspace" on public.workspaces;
create policy "Own workspace" on public.workspaces for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.workspaces to authenticated;

-- ── Teams ────────────────────────────────────────────────────────────────────

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  email text,
  name text,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members (user_id);

-- Membership checks used by the policies. Security definer so a policy on
-- team_members can ask about team_members without recursing.
create or replace function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid())
$$;
create or replace function public.is_team_owner(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = t and user_id = auth.uid() and role = 'owner')
$$;

alter table public.teams enable row level security;
drop policy if exists "Members see their team" on public.teams;
create policy "Members see their team" on public.teams for select to authenticated using (public.is_team_member(id));
drop policy if exists "Owners rename their team" on public.teams;
create policy "Owners rename their team" on public.teams for update to authenticated using (public.is_team_owner(id));
drop policy if exists "Owners delete their team" on public.teams;
create policy "Owners delete their team" on public.teams for delete to authenticated using (public.is_team_owner(id));
grant select, delete on public.teams to authenticated;
grant update (name) on public.teams to authenticated;

alter table public.team_members enable row level security;
drop policy if exists "Members see each other" on public.team_members;
create policy "Members see each other" on public.team_members for select to authenticated using (public.is_team_member(team_id));
drop policy if exists "Members edit their own name" on public.team_members;
create policy "Members edit their own name" on public.team_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Leave, or owner removes" on public.team_members;
create policy "Leave, or owner removes" on public.team_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_team_owner(team_id));
grant select, delete on public.team_members to authenticated;
grant update (name) on public.team_members to authenticated;

-- Teams are created and joined only through these functions, so nobody can add
-- themselves to a team without its invite code or make themselves an owner.
create or replace function public.create_team(team_name text, member_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.teams (name, created_by) values (trim(team_name), auth.uid()) returning id into t;
  insert into public.team_members (team_id, user_id, email, name, role)
    values (t, auth.uid(), auth.jwt() ->> 'email', nullif(trim(member_name), ''), 'owner');
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
    values (t, auth.uid(), auth.jwt() ->> 'email', nullif(trim(member_name), ''))
    on conflict (team_id, user_id) do update set name = coalesce(excluded.name, public.team_members.name);
  return t;
end $$;

-- An owner can replace the invite code, so an old link stops working.
create or replace function public.new_invite_code(t uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if not public.is_team_owner(t) then raise exception 'Only a team owner can do that'; end if;
  update public.teams set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) where id = t returning invite_code into c;
  return c;
end $$;

revoke execute on function public.create_team(text, text), public.join_team(text, text), public.new_invite_code(uuid) from public, anon;
grant execute on function public.create_team(text, text), public.join_team(text, text), public.new_invite_code(uuid) to authenticated;

-- ── Shared team queue ────────────────────────────────────────────────────────

create table if not exists public.team_items (
  team_id uuid not null references public.teams on delete cascade,
  update_id text not null,
  snapshot jsonb,
  assess jsonb,
  assign jsonb,
  dismissed jsonb,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, update_id)
);
create index if not exists team_items_recent on public.team_items (team_id, updated_at desc);

alter table public.team_items enable row level security;
drop policy if exists "Members read the queue" on public.team_items;
create policy "Members read the queue" on public.team_items for select to authenticated using (public.is_team_member(team_id));
drop policy if exists "Members add to the queue" on public.team_items;
create policy "Members add to the queue" on public.team_items for insert to authenticated with check (public.is_team_member(team_id));
drop policy if exists "Members update the queue" on public.team_items;
create policy "Members update the queue" on public.team_items for update to authenticated
  using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
grant select, insert, update on public.team_items to authenticated;

create table if not exists public.team_events (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams on delete cascade,
  update_id text not null,
  user_id uuid references auth.users on delete set null,
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);
create index if not exists team_events_recent on public.team_events (team_id, at desc);

alter table public.team_events enable row level security;
drop policy if exists "Members read the audit trail" on public.team_events;
create policy "Members read the audit trail" on public.team_events for select to authenticated using (public.is_team_member(team_id));
-- No insert, update or delete grants: only the trigger below writes here.
grant select on public.team_events to authenticated;

-- Who changed a queue item and when is set by the database, not the browser.
create or replace function public.team_item_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

create or replace function public.team_item_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  oa jsonb; og jsonb; od jsonb;
  title jsonb := jsonb_build_object('title', new.snapshot ->> 'title');
begin
  if tg_op = 'UPDATE' then oa := old.assess; og := old.assign; od := old.dismissed; end if;
  if new.assess is distinct from oa then
    insert into public.team_events (team_id, update_id, user_id, action, detail)
      values (new.team_id, new.update_id, auth.uid(), case when new.assess is null then 'unassessed' else 'assessed' end, title || coalesce(new.assess, '{}'));
  end if;
  if new.assign is distinct from og then
    insert into public.team_events (team_id, update_id, user_id, action, detail)
      values (new.team_id, new.update_id, auth.uid(), case when new.assign is null then 'unassigned' else 'assigned' end, title || coalesce(new.assign, '{}'));
  end if;
  if new.dismissed is distinct from od then
    insert into public.team_events (team_id, update_id, user_id, action, detail)
      values (new.team_id, new.update_id, auth.uid(), case when new.dismissed is null then 'restored' else 'dismissed' end, title || coalesce(new.dismissed, '{}'));
  end if;
  return null;
end $$;

drop trigger if exists team_items_stamp on public.team_items;
create trigger team_items_stamp before insert or update on public.team_items for each row execute function public.team_item_stamp();
drop trigger if exists team_items_log on public.team_items;
create trigger team_items_log after insert or update on public.team_items for each row execute function public.team_item_log();

-- ── Research review (Research & Innovation admin queue) ─────────────────────
--
--   research_admins          who may review research (add your email once, see below)
--   research_reviews         one editor decision per paper: corrected tags, summary
--                            approved or rejected, PV relevance, maturity, notes
--   research_review_events   revision history, written only by the database itself
--
-- Anyone may read the published parts of a review (the public pages show what an editor
-- changed); the reviewer's email and internal notes are visible to admins only.
-- To make yourself an admin, run once with your sign-in email:
--   insert into public.research_admins (email) values ('you@example.org') on conflict do nothing;

create table if not exists public.research_admins (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.research_admins enable row level security;
-- No policies: only the SQL editor (and the function below) can see this list.

create or replace function public.is_research_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.research_admins where email = lower(auth.jwt() ->> 'email'))
$$;
grant execute on function public.is_research_admin() to anon, authenticated;

create table if not exists public.research_reviews (
  paper_id text primary key,
  title text,
  tags jsonb,
  summary_status text check (summary_status in ('approved', 'rejected')),
  relevance text check (relevance in ('ok', 'weak')),
  maturity jsonb,
  version_of text,
  note text,
  reviewed_by text,
  reviewed_at timestamptz not null default now()
);
alter table public.research_reviews enable row level security;
drop policy if exists "Anyone can read research reviews" on public.research_reviews;
create policy "Anyone can read research reviews" on public.research_reviews for select using (true);
drop policy if exists "Admins add research reviews" on public.research_reviews;
create policy "Admins add research reviews" on public.research_reviews for insert to authenticated with check (public.is_research_admin());
drop policy if exists "Admins change research reviews" on public.research_reviews;
create policy "Admins change research reviews" on public.research_reviews for update to authenticated
  using (public.is_research_admin()) with check (public.is_research_admin());
drop policy if exists "Admins remove research reviews" on public.research_reviews;
create policy "Admins remove research reviews" on public.research_reviews for delete to authenticated using (public.is_research_admin());
grant select (paper_id, title, tags, summary_status, relevance, maturity, version_of, reviewed_at) on public.research_reviews to anon, authenticated;
grant insert, update, delete on public.research_reviews to authenticated;

-- The full rows, notes and reviewer included, for the admin queue.
create or replace function public.admin_research_reviews() returns setof public.research_reviews
language sql stable security definer set search_path = '' as $$
  select * from public.research_reviews where public.is_research_admin()
$$;
grant execute on function public.admin_research_reviews() to authenticated;

create table if not exists public.research_review_events (
  id bigint generated always as identity primary key,
  paper_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists research_review_events_paper on public.research_review_events (paper_id, at desc);
alter table public.research_review_events enable row level security;
drop policy if exists "Admins read review history" on public.research_review_events;
create policy "Admins read review history" on public.research_review_events for select to authenticated using (public.is_research_admin());
grant select on public.research_review_events to authenticated;

-- Who reviewed and when is set by the database, not the browser.
create or replace function public.research_review_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.reviewed_by := auth.jwt() ->> 'email';
  new.reviewed_at := now();
  return new;
end $$;

create or replace function public.research_review_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.research_review_events (paper_id, action, before, after, by_email)
    values (coalesce(new.paper_id, old.paper_id), lower(tg_op),
            case when tg_op <> 'INSERT' then to_jsonb(old) end,
            case when tg_op <> 'DELETE' then to_jsonb(new) end,
            auth.jwt() ->> 'email');
  return null;
end $$;

drop trigger if exists research_reviews_stamp on public.research_reviews;
create trigger research_reviews_stamp before insert or update on public.research_reviews for each row execute function public.research_review_stamp();
drop trigger if exists research_reviews_log on public.research_reviews;
create trigger research_reviews_log after insert or update or delete on public.research_reviews for each row execute function public.research_review_log();

-- ── Admin console (admin.html) ───────────────────────────────────────────────
--
-- One signed-in page where app admins (the research_admins list above) look after the
-- site without editing repo files or running SQL:
--
--   manifest_approvals   approval of a version of companies/manifest.json
--   company_overrides    companies added, edited or hidden by an admin, applied over the
--                        manifest at every build (the repo file itself is left as it is)
--   company_requests     companies that signed-in readers ask to have added
--   admin_events         log of every admin change, written only by the database
--   app_secrets          the Vercel deploy hook behind "Publish now"; never readable
--
-- Every change reaches the public site at the next build (hourly, or at once with
-- Publish now). Only the admin list is kept in research_admins, so an admin can review
-- research and run the console.

alter table public.research_admins add column if not exists added_by text;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_research_admin()
$$;
grant execute on function public.is_app_admin() to anon, authenticated;

create table if not exists public.admin_events (
  id bigint generated always as identity primary key,
  action text not null,
  target text,
  detail jsonb,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists admin_events_recent on public.admin_events (at desc);
alter table public.admin_events enable row level security;
drop policy if exists "Admins read the admin log" on public.admin_events;
create policy "Admins read the admin log" on public.admin_events for select to authenticated using (public.is_app_admin());
-- No insert, update or delete grants: only the functions and triggers below write here.
grant select on public.admin_events to authenticated;

create or replace function public.admin_log(act text, tgt text, info jsonb default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_events (action, target, detail, by_email) values (act, tgt, info, auth.jwt() ->> 'email')
$$;
revoke execute on function public.admin_log(text, text, jsonb) from public, anon, authenticated;

-- Admins: listed, added and removed through these functions, so the list itself stays
-- unreadable to everyone else.
create or replace function public.admin_list_admins() returns table (email text, added_at timestamptz, added_by text)
language sql stable security definer set search_path = '' as $$
  select a.email, a.added_at, a.added_by from public.research_admins a where public.is_app_admin() order by a.added_at
$$;

create or replace function public.admin_add_admin(new_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(new_email));
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That does not look like an email address'; end if;
  insert into public.research_admins (email, added_by) values (e, auth.jwt() ->> 'email') on conflict (email) do nothing;
  if found then perform public.admin_log('admin added', e); end if;
end $$;

create or replace function public.admin_remove_admin(old_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(trim(old_email));
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if e = lower(auth.jwt() ->> 'email') then raise exception 'You cannot remove yourself; ask another admin'; end if;
  delete from public.research_admins where email = e;
  if found then perform public.admin_log('admin removed', e); end if;
end $$;

revoke execute on function public.admin_list_admins(), public.admin_add_admin(text), public.admin_remove_admin(text) from public, anon;
grant execute on function public.admin_list_admins(), public.admin_add_admin(text), public.admin_remove_admin(text) to authenticated;

-- Company list approval. One row per manifest version, so editing the manifest in the
-- repo (a new version) needs a fresh approval. The approver's name is public, as it
-- was in the manifest; the email is for admins only.
create table if not exists public.manifest_approvals (
  version text primary key,
  status text not null check (status in ('approved', 'draft')),
  approved_by text check (length(approved_by) <= 120),
  approved_on date,
  note text check (length(note) <= 1000),
  by_email text,
  updated_at timestamptz not null default now()
);
alter table public.manifest_approvals enable row level security;
drop policy if exists "Anyone can read approvals" on public.manifest_approvals;
create policy "Anyone can read approvals" on public.manifest_approvals for select using (true);
grant select (version, status, approved_by, approved_on, note, updated_at) on public.manifest_approvals to anon, authenticated;

create or replace function public.admin_set_manifest_approval(v text, approve boolean, approver text default null, why text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare who text := coalesce(nullif(trim(approver), ''), nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''), split_part(auth.jwt() ->> 'email', '@', 1));
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

-- Companies added, edited or hidden by an admin. `data` holds only the fields that
-- differ from the manifest (for a new company, all of them); the build checks them
-- and reports any problem back on the admin page.
create table if not exists public.company_overrides (
  company_id text primary key check (company_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(company_id) <= 60),
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and length(data::text) <= 20000),
  hidden boolean not null default false,
  note text check (length(note) <= 1000),
  by_email text,
  updated_at timestamptz not null default now()
);
alter table public.company_overrides enable row level security;
drop policy if exists "Anyone can read company changes" on public.company_overrides;
create policy "Anyone can read company changes" on public.company_overrides for select using (true);
drop policy if exists "Admins add company changes" on public.company_overrides;
create policy "Admins add company changes" on public.company_overrides for insert to authenticated with check (public.is_app_admin());
drop policy if exists "Admins edit company changes" on public.company_overrides;
create policy "Admins edit company changes" on public.company_overrides for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "Admins remove company changes" on public.company_overrides;
create policy "Admins remove company changes" on public.company_overrides for delete to authenticated using (public.is_app_admin());
grant select (company_id, data, hidden, note, updated_at) on public.company_overrides to anon, authenticated;
grant insert, update, delete on public.company_overrides to authenticated;

create or replace function public.company_override_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.by_email := auth.jwt() ->> 'email';
  new.updated_at := now();
  return new;
end $$;

create or replace function public.company_override_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_log(
    case when tg_op = 'DELETE' then 'company change removed'
         when new.hidden and (tg_op = 'INSERT' or not old.hidden) then 'company hidden'
         when tg_op = 'UPDATE' and old.hidden and not new.hidden then 'company shown again'
         else 'company saved' end,
    coalesce(new.company_id, old.company_id),
    jsonb_build_object('before', case when tg_op <> 'INSERT' then to_jsonb(old) - 'by_email' end, 'after', case when tg_op <> 'DELETE' then to_jsonb(new) - 'by_email' end));
  return null;
end $$;

drop trigger if exists company_overrides_stamp on public.company_overrides;
create trigger company_overrides_stamp before insert or update on public.company_overrides for each row execute function public.company_override_stamp();
drop trigger if exists company_overrides_log on public.company_overrides;
create trigger company_overrides_log after insert or update or delete on public.company_overrides for each row execute function public.company_override_log();

-- Company requests from signed-in readers. A reader sees their own requests; admins
-- see all of them and mark each one added or declined.
create table if not exists public.company_requests (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 2 and 120),
  website text check (length(website) <= 300),
  country text check (length(country) <= 60),
  note text check (length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'added', 'declined')),
  company_id text,
  requested_by uuid default auth.uid() references auth.users on delete set null,
  requested_email text,
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz
);
create index if not exists company_requests_open on public.company_requests (status, created_at desc);
alter table public.company_requests enable row level security;
drop policy if exists "Readers request companies" on public.company_requests;
create policy "Readers request companies" on public.company_requests for insert to authenticated with check (requested_by = (select auth.uid()));
drop policy if exists "Own requests, or admins" on public.company_requests;
create policy "Own requests, or admins" on public.company_requests for select to authenticated using (requested_by = (select auth.uid()) or public.is_app_admin());
drop policy if exists "Admins answer requests" on public.company_requests;
create policy "Admins answer requests" on public.company_requests for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
grant select on public.company_requests to authenticated;
grant insert (name, website, country, note) on public.company_requests to authenticated;
grant update (status, company_id) on public.company_requests to authenticated;

create or replace function public.company_request_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.requested_by := auth.uid();
    new.requested_email := auth.jwt() ->> 'email';
    new.status := 'open';
    new.created_at := now();
  elsif new.status is distinct from old.status then
    new.resolved_by := case when new.status = 'open' then null else auth.jwt() ->> 'email' end;
    new.resolved_at := case when new.status = 'open' then null else now() end;
  end if;
  return new;
end $$;

create or replace function public.company_request_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform public.admin_log('company request ' || new.status, new.name, jsonb_build_object('request', new.id, 'company', new.company_id));
  end if;
  return null;
end $$;

drop trigger if exists company_requests_stamp on public.company_requests;
create trigger company_requests_stamp before insert or update on public.company_requests for each row execute function public.company_request_stamp();
drop trigger if exists company_requests_log on public.company_requests;
create trigger company_requests_log after update on public.company_requests for each row execute function public.company_request_log();

-- "Publish now": an admin saves the site's Vercel deploy hook once; after that the
-- database calls it (through Supabase's free pg_net extension) so the site rebuilds
-- without waiting for the hourly run. The hook never leaves the database.
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is not available (%); Publish now stays off and changes go live at the hourly build.', sqlerrm;
end $$;

create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
-- No policies and no grants: only the functions below use it.
revoke all on public.app_secrets from anon, authenticated;

create or replace function public.admin_set_deploy_hook(hook text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if coalesce(trim(hook), '') = '' then
    delete from public.app_secrets where key = 'vercel_deploy_hook';
    perform public.admin_log('publish button turned off', null);
    return;
  end if;
  if trim(hook) !~ '^https://api\.vercel\.com/v1/integrations/deploy/[A-Za-z0-9_/-]+$' then
    raise exception 'That is not a Vercel deploy hook URL (it starts with https://api.vercel.com/v1/integrations/deploy/)';
  end if;
  insert into public.app_secrets (key, value) values ('vercel_deploy_hook', trim(hook))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.admin_log('publish button set up', null);
end $$;

-- Whether Publish now is set up, and when it was last used (never the hook itself).
create or replace function public.admin_publish_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.is_app_admin() then jsonb_build_object(
    'hook', exists (select 1 from public.app_secrets where key = 'vercel_deploy_hook'),
    'lastPublish', (select max(at) from public.admin_events where action = 'publish requested')) end
$$;

create or replace function public.admin_publish() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare h text; last timestamptz;
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  select value into h from public.app_secrets where key = 'vercel_deploy_hook';
  if h is null then raise exception 'Set up the publish button first (paste the Vercel deploy hook)'; end if;
  select max(at) into last from public.admin_events where action = 'publish requested';
  if last > now() - interval '3 minutes' then raise exception 'A rebuild was started less than 3 minutes ago; it takes a few minutes to finish'; end if;
  begin
    perform net.http_post(url := h, body := '{}'::jsonb);
  exception when undefined_function or invalid_schema_name then
    raise exception 'Turn on the pg_net extension in Supabase (Database, Extensions) to use Publish now';
  end;
  perform public.admin_log('publish requested', null);
  return now();
end $$;

revoke execute on function public.admin_set_deploy_hook(text), public.admin_publish_status(), public.admin_publish() from public, anon;
grant execute on function public.admin_set_deploy_hook(text), public.admin_publish_status(), public.admin_publish() to authenticated;
