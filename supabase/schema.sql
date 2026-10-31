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

-- Site settings from the Admin page, applied to every visitor at the next build:
--   hidden_nav    menu links hidden from everyone, e.g. ["companies"]
--   nav_order     the order of the menu links, e.g. ["index", "research", "briefing"]
--   status_strip  who sees the "Updated … · sources reachable" line: "admins" or "everyone"
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  by_email text,
  updated_at timestamptz not null default now()
);
alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check (key in ('hidden_nav', 'nav_order', 'status_strip'));
alter table public.site_settings enable row level security;
drop policy if exists "Anyone can read site settings" on public.site_settings;
create policy "Anyone can read site settings" on public.site_settings for select using (true);
grant select (key, value, updated_at) on public.site_settings to anon, authenticated;

create or replace function public.admin_set_setting(k text, v jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if k in ('hidden_nav', 'nav_order') and (jsonb_typeof(v) <> 'array' or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'string' or x #>> '{}' !~ '^[a-z-]{1,40}$')) then
    raise exception '% must be a list of page names', k;
  end if;
  if k = 'status_strip' and v not in ('"admins"'::jsonb, '"everyone"'::jsonb) then
    raise exception 'status_strip must be "admins" or "everyone"';
  end if;
  insert into public.site_settings (key, value, by_email) values (k, v, auth.jwt() ->> 'email')
    on conflict (key) do update set value = excluded.value, by_email = excluded.by_email, updated_at = now();
  perform public.admin_log('site setting changed', k, jsonb_build_object('value', v));
end $$;
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- ── Data sources (Admin → Data sources) ──────────────────────────────────────
--
-- The registry of everything the hourly build collects updates from. It is the build's
-- only list of sources (scripts/sources.mjs); admins add, edit, test, pause and resume
-- sources on admin-sources.html, with no code change or deployment.
--
--   data_sources         one row per source; the id never changes, so history survives a new address
--   data_source_events   audit log of every add, edit, pause, resume, revert and credential
--                        change, with who made it; written only by the database itself
--   data_source_runs     one row per source per build: success or failure, items found,
--                        kept and new (written by the build with the service key)
--   data_source_tests    Test now results (written by api/source-test.js). A source can only
--                        be activated, or its address or settings changed, after a passing test
--   data_source_secrets  credentials for sources that need a key; never readable from a browser
--
-- Only admins can read any of it. The public coverage page is built from it at each
-- build, without addresses, settings, credentials or health.
-- The 75 sources the build collected before the registry existed are imported at the
-- end of this section (once; running the file again leaves admin changes alone).

-- Which registry source collected each archived update.
alter table public.updates add column if not exists source_id text;

create table if not exists public.data_sources (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 60),
  name text not null check (length(trim(name)) between 2 and 160),
  organization text not null default '' check (length(organization) <= 160),
  url text not null check (length(url) <= 2000),
  source_type text not null check (source_type in ('rss', 'api', 'webpage', 'news_search')),
  classification text not null check (classification in ('regulator', 'research', 'vendor', 'news')),
  regions text[] not null default '{}' check (array_to_string(regions, ',') ~ '^([A-Z]{2,3}(,[A-Z]{2,3})*)?$'),
  topics text[] not null default '{}' check (array_to_string(topics, ',') ~ '^([a-z]+(,[a-z]+)*)?$'),
  status text not null default 'draft' check (status in ('active', 'paused', 'draft')),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and length(settings::text) <= 8000),
  notes text not null default '' check (length(notes) <= 2000),
  -- Items published before this are not collected: the catch-up window after a resume
  -- or a new address. Earlier items already collected are kept.
  collect_from timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.data_sources enable row level security;
drop policy if exists "Admins read data sources" on public.data_sources;
create policy "Admins read data sources" on public.data_sources for select to authenticated using (public.is_app_admin());
-- No insert, update or delete grants: changes go through the functions below.
grant select on public.data_sources to authenticated;

create table if not exists public.data_source_events (
  id bigint generated always as identity primary key,
  source_id text not null,
  action text not null,
  note text,
  before jsonb,
  after jsonb,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists data_source_events_by_source on public.data_source_events (source_id, at desc);
alter table public.data_source_events enable row level security;
drop policy if exists "Admins read source history" on public.data_source_events;
create policy "Admins read source history" on public.data_source_events for select to authenticated using (public.is_app_admin());
grant select on public.data_source_events to authenticated;

create table if not exists public.data_source_runs (
  id bigint generated always as identity primary key,
  source_id text not null,
  run_at timestamptz not null,
  ok boolean not null,
  http_status int,
  format text,
  error text,
  items_seen int not null default 0,
  items_kept int not null default 0,
  items_new int not null default 0,
  newest_item timestamptz,
  attempts int not null default 1,
  duration_ms int
);
create index if not exists data_source_runs_by_source on public.data_source_runs (source_id, run_at desc);
create index if not exists data_source_runs_recent on public.data_source_runs (run_at);
alter table public.data_source_runs enable row level security;
drop policy if exists "Admins read collection runs" on public.data_source_runs;
create policy "Admins read collection runs" on public.data_source_runs for select to authenticated using (public.is_app_admin());
grant select on public.data_source_runs to authenticated;

create table if not exists public.data_source_tests (
  id bigint generated always as identity primary key,
  source_id text,
  url text not null,
  source_type text not null,
  settings jsonb not null default '{}',
  ok boolean not null,
  http_status int,
  format text,
  items int,
  kept int,
  error text,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists data_source_tests_recent on public.data_source_tests (at desc);
alter table public.data_source_tests enable row level security;
drop policy if exists "Admins read source tests" on public.data_source_tests;
create policy "Admins read source tests" on public.data_source_tests for select to authenticated using (public.is_app_admin());
grant select on public.data_source_tests to authenticated;

create table if not exists public.data_source_secrets (
  source_id text not null references public.data_sources on delete cascade,
  name text not null check (name ~ '^[A-Z][A-Z0-9_]{1,40}$'),
  value text not null check (length(value) between 1 and 4000),
  by_email text,
  updated_at timestamptz not null default now(),
  primary key (source_id, name)
);
alter table public.data_source_secrets enable row level security;
-- No policies and no grants: only the build and Test now (with the service key) read it.
revoke all on public.data_source_secrets from anon, authenticated;

-- Address checks that need no lookup. The build and Test now also check every address a
-- host name resolves to, and every redirect (scripts/safe-fetch.mjs).
create or replace function public.source_url_problem(u text) returns text
language plpgsql immutable set search_path = '' as $$
declare host text;
begin
  if u is null or u !~* '^https?://[^/?#]' then return 'The address must start with https:// (or http://)'; end if;
  if length(u) > 2000 then return 'The address is too long'; end if;
  host := lower(substring(u from '^[a-zA-Z]+://([^/?#]*)'));
  if host like '%@%' then return 'Do not put a user name or password in the address; add it as a credential'; end if;
  if host ~ ':[0-9]*$' and host !~ ':(80|443)$' and host !~ '^\[' then return 'Only the standard web ports (80 and 443) are allowed'; end if;
  host := regexp_replace(host, ':[0-9]+$', '');
  if host ~ '^\[' or host ~ '^(localhost|metadata|metadata\.google\.internal|metadata\.goog|instance-data)$'
     or host ~ '\.(localhost|local|internal|intranet|lan)$'
     or host ~ '^(0|10|127)\.' or host ~ '^169\.254\.' or host ~ '^192\.168\.'
     or host ~ '^172\.(1[6-9]|2[0-9]|3[01])\.' or host ~ '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.' then
    return 'That is a private or internal address and cannot be collected';
  end if;
  if u ~* '[?&](api[_-]?key|apikey|key|token|access[_-]?token|secret|client[_-]?secret|password|passwd|pwd|signature|sig|auth)=(?!\{\{)' then
    return 'The address contains a key or token. Save it as a credential and write {{NAME}} in the address instead';
  end if;
  return null;
end $$;

-- Who changed a source and when is set by the database, not the browser.
create or replace function public.data_source_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.jwt() ->> 'email', 'import');
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', 'SQL editor');
  return new;
end $$;

-- Every change to a source's configuration goes into its history, with the whole
-- configuration before and after, so any change can be undone. The functions below say
-- what kind of change it was (pv.source_action) and why (pv.source_note).
create or replace function public.data_source_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  act text := coalesce(nullif(current_setting('pv.source_action', true), ''), case when tg_op = 'INSERT' then 'added' else 'edited' end);
  why text := nullif(current_setting('pv.source_note', true), '');
  was jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'created_at' - 'created_by' - 'updated_at' - 'updated_by' end;
  now_ jsonb := to_jsonb(new) - 'created_at' - 'created_by' - 'updated_at' - 'updated_by';
begin
  if was is not null and was = now_ then return null; end if;
  insert into public.data_source_events (source_id, action, note, before, after, by_email)
    values (new.id, act, why, was, now_, coalesce(auth.jwt() ->> 'email', case when act = 'imported' then 'initial import' else 'SQL editor' end));
  if act <> 'imported' then perform public.admin_log('source ' || act, new.id, jsonb_build_object('note', why)); end if;
  return null;
end $$;

drop trigger if exists data_sources_stamp on public.data_sources;
create trigger data_sources_stamp before insert or update on public.data_sources for each row execute function public.data_source_stamp();
drop trigger if exists data_sources_log on public.data_sources;
create trigger data_sources_log after insert or update on public.data_sources for each row execute function public.data_source_log();

-- Whether this exact configuration passed Test now in the last 24 hours. A news search
-- is identified by its settings (the address is built from the query).
create or replace function public.source_tested(typ text, u text, sets jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.data_source_tests t
    where t.ok and t.at > now() - interval '24 hours' and t.source_type = typ and t.settings = sets and (typ = 'news_search' or t.url = u))
$$;
revoke execute on function public.source_tested(text, text, jsonb) from public, anon, authenticated;

-- Adds a source or saves an edit. `src` is the form: id, name, organization, url, type,
-- classification, regions, topics, settings, notes, and status ('draft' or 'active')
-- for a new source or a draft being activated. Pause and resume use
-- admin_set_source_status. `expected` is the updated_at the admin started from, so two
-- admins can't overwrite each other's edit. Returns the new updated_at.
create or replace function public.admin_save_source(src jsonb, creating boolean, why text default null, expected timestamptz default null, catch_up_days int default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  sid text := trim(src ->> 'id');
  typ text := src ->> 'type';
  u text := trim(coalesce(src ->> 'url', ''));
  sets jsonb := coalesce(src -> 'settings', '{}'::jsonb);
  want text := coalesce(src ->> 'status', 'draft');
  cur public.data_sources;
  st text;
  fetch_changed boolean;
  problem text;
  is_new boolean;
  h record;
  out_at timestamptz;
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if sid is null or sid !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(sid) > 60 then raise exception 'The source id must be lower-case letters, numbers and dashes'; end if;
  if jsonb_typeof(sets) <> 'object' then raise exception 'Settings must be an object'; end if;
  if coalesce(sets ->> 'relevance', 'pv') not in ('pv', 'all') then raise exception 'Relevance must be pv or all'; end if;
  if typ = 'news_search' then
    if coalesce(trim(sets ->> 'query'), '') = '' then raise exception 'Enter the search query'; end if;
    if coalesce(sets ->> 'provider', 'google_news') <> 'google_news' then raise exception 'Unknown news search provider'; end if;
    if u !~ '^https://news\.google\.com/rss/search\?q=' then raise exception 'A news search address is built from its query; edit the query instead'; end if;
  else
    problem := public.source_url_problem(u);
    if problem is not null then raise exception '%', problem; end if;
  end if;
  for h in select key, value from jsonb_each_text(coalesce(sets -> 'headers', '{}'::jsonb)) loop
    if h.key ~* '^(authorization|x-api-key|api-key|apikey|cookie)$' and h.value !~ '\{\{[A-Z][A-Z0-9_]{1,40}\}\}' then
      raise exception 'The % header holds a credential. Save it as a credential and write {{NAME}} in the header instead', h.key;
    end if;
  end loop;
  if catch_up_days is not null and (catch_up_days < 0 or catch_up_days > 60) then raise exception 'The catch-up window is 0 to 60 days'; end if;

  select * into cur from public.data_sources where id = sid for update;
  is_new := not found;
  if creating and not is_new then raise exception 'A source with the id % already exists', sid; end if;
  if not creating and is_new then raise exception 'That source no longer exists'; end if;
  if not is_new and expected is not null and date_trunc('milliseconds', cur.updated_at) <> date_trunc('milliseconds', expected) then
    raise exception 'Someone else changed this source since you opened it. Reload the page and try again';
  end if;

  st := case when is_new then want when cur.status = 'draft' then want else cur.status end;
  if st not in ('draft', 'active', 'paused') or (is_new and st = 'paused') then raise exception 'A new source is saved as a draft or made active'; end if;
  fetch_changed := is_new or cur.url <> u or cur.source_type <> typ or cur.settings <> sets;
  -- Collection only ever runs a configuration that passed Test now.
  if st <> 'draft' and (fetch_changed or cur.status = 'draft') and not public.source_tested(typ, u, sets) then
    raise exception 'Run Test now on this address and these settings first. A source is activated, or its address or settings changed, only after a passing test';
  end if;

  perform set_config('pv.source_action', case when is_new then 'added' when cur.status = 'draft' and st = 'active' then 'activated' else 'edited' end, true);
  perform set_config('pv.source_note', coalesce(trim(why), ''), true);
  if is_new then
    insert into public.data_sources (id, name, organization, url, source_type, classification, regions, topics, status, settings, notes, collect_from)
    values (sid, trim(src ->> 'name'), coalesce(trim(src ->> 'organization'), ''), u, typ, src ->> 'classification',
      array(select jsonb_array_elements_text(coalesce(src -> 'regions', '[]'::jsonb))), array(select jsonb_array_elements_text(coalesce(src -> 'topics', '[]'::jsonb))),
      st, sets, coalesce(trim(src ->> 'notes'), ''), now() - make_interval(days => coalesce(catch_up_days, 30)))
    returning updated_at into out_at;
  else
    update public.data_sources set
      name = trim(src ->> 'name'), organization = coalesce(trim(src ->> 'organization'), ''), url = u, source_type = typ,
      classification = src ->> 'classification',
      regions = array(select jsonb_array_elements_text(coalesce(src -> 'regions', '[]'::jsonb))),
      topics = array(select jsonb_array_elements_text(coalesce(src -> 'topics', '[]'::jsonb))),
      status = st, settings = sets, notes = coalesce(trim(src ->> 'notes'), ''),
      collect_from = case when cur.url <> u or cur.source_type <> typ or cur.settings -> 'query' is distinct from sets -> 'query' or (cur.status = 'draft' and st = 'active')
        then now() - make_interval(days => coalesce(catch_up_days, case when cur.status = 'draft' then 30 else 7 end)) else cur.collect_from end
    where id = sid returning updated_at into out_at;
  end if;
  perform set_config('pv.source_action', '', true);
  perform set_config('pv.source_note', '', true);
  return out_at;
end $$;

-- Pause: the build stops collecting it at the next run; everything it collected stays,
-- with its provenance. Resume: collection restarts, taking only items published in the
-- last catch_up_days (0 to 60). Updates already collected are recognised by their link,
-- so nothing is added twice.
create or replace function public.admin_set_source_status(sid text, new_status text, why text default null, catch_up_days int default 7) returns void
language plpgsql security definer set search_path = '' as $$
declare cur public.data_sources;
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  select * into cur from public.data_sources where id = sid for update;
  if not found then raise exception 'That source no longer exists'; end if;
  if new_status = 'paused' then
    if cur.status <> 'active' then raise exception 'Only an active source can be paused'; end if;
  elsif new_status = 'active' then
    if cur.status <> 'paused' then raise exception 'Only a paused source can be resumed. Activate a draft from its edit form, after a test'; end if;
    if catch_up_days is null or catch_up_days < 0 or catch_up_days > 60 then raise exception 'The catch-up window is 0 to 60 days'; end if;
  else
    raise exception 'Status must be paused or active';
  end if;
  perform set_config('pv.source_action', case when new_status = 'paused' then 'paused' else 'resumed' end, true);
  perform set_config('pv.source_note', coalesce(trim(why), '') || case when new_status = 'active' then format(' (catch-up %s days)', catch_up_days) else '' end, true);
  update public.data_sources set status = new_status,
    collect_from = case when new_status = 'active' then now() - make_interval(days => catch_up_days) else collect_from end
  where id = sid;
  perform set_config('pv.source_action', '', true);
  perform set_config('pv.source_note', '', true);
end $$;

-- Undo one change: the source goes back to its configuration (and status) from just
-- before that change. Undoing the add of a source makes it a draft, so it stops being
-- collected and keeps its history. The undo is itself a change in the history.
create or replace function public.admin_revert_source(event_id bigint, why text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare ev public.data_source_events; cur public.data_sources; b jsonb;
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  select * into ev from public.data_source_events where id = event_id;
  if not found then raise exception 'That change is not in the history'; end if;
  if ev.after is null then raise exception 'That entry is not a configuration change'; end if;
  select * into cur from public.data_sources where id = ev.source_id for update;
  if not found then raise exception 'That source no longer exists'; end if;
  perform set_config('pv.source_action', 'reverted', true);
  perform set_config('pv.source_note', trim(format('Undid change #%s (%s, %s). %s', ev.id, ev.action, to_char(ev.at, 'YYYY-MM-DD HH24:MI'), coalesce(why, ''))), true);
  if ev.before is null then
    update public.data_sources set status = 'draft' where id = ev.source_id;
  else
    b := ev.before;
    update public.data_sources set
      name = b ->> 'name', organization = coalesce(b ->> 'organization', ''), url = b ->> 'url', source_type = b ->> 'source_type',
      classification = b ->> 'classification',
      regions = array(select jsonb_array_elements_text(coalesce(b -> 'regions', '[]'::jsonb))),
      topics = array(select jsonb_array_elements_text(coalesce(b -> 'topics', '[]'::jsonb))),
      status = b ->> 'status', settings = coalesce(b -> 'settings', '{}'::jsonb), notes = coalesce(b ->> 'notes', ''),
      collect_from = case when (b ->> 'status' = 'active' and cur.status <> 'active') or cur.url <> b ->> 'url' or cur.settings -> 'query' is distinct from b -> 'settings' -> 'query'
        then now() - interval '7 days' else cur.collect_from end
    where id = ev.source_id;
  end if;
  perform set_config('pv.source_action', '', true);
  perform set_config('pv.source_note', '', true);
end $$;

-- Credentials: an admin sets or removes one; the value can never be read back. The
-- source's address or headers refer to it as {{NAME}}.
create or replace function public.admin_set_source_secret(sid text, secret_name text, secret_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := upper(trim(secret_name));
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if n !~ '^[A-Z][A-Z0-9_]{1,40}$' then raise exception 'A credential name is capital letters, numbers and underscores, e.g. API_KEY'; end if;
  if not exists (select 1 from public.data_sources where id = sid) then raise exception 'Save the source first, then add its credentials'; end if;
  if coalesce(secret_value, '') = '' then
    delete from public.data_source_secrets where source_id = sid and name = n;
    if not found then return; end if;
    insert into public.data_source_events (source_id, action, note, by_email) values (sid, 'credential removed', n, auth.jwt() ->> 'email');
  else
    insert into public.data_source_secrets (source_id, name, value, by_email) values (sid, n, secret_value, auth.jwt() ->> 'email')
      on conflict (source_id, name) do update set value = excluded.value, by_email = excluded.by_email, updated_at = now();
    insert into public.data_source_events (source_id, action, note, by_email) values (sid, 'credential set', n, auth.jwt() ->> 'email');
  end if;
  perform public.admin_log('source credential changed', sid, jsonb_build_object('name', n));
end $$;

create or replace function public.admin_source_credentials() returns table (source_id text, name text, updated_at timestamptz, by_email text)
language sql stable security definer set search_path = '' as $$
  select s.source_id, s.name, s.updated_at, s.by_email from public.data_source_secrets s where public.is_app_admin() order by 1, 2
$$;

-- Per source: runs and items in the chosen period, and (over all time) the last attempt,
-- the last success and how many runs have failed since it.
create or replace function public.admin_source_stats(since timestamptz) returns table (
  source_id text, attempts int, successes int, items_seen bigint, items_kept bigint, items_new bigint,
  last_attempt timestamptz, last_ok boolean, last_error text, last_http int, last_items int,
  last_success timestamptz, newest_item timestamptz, failures_in_row int)
language sql stable security definer set search_path = '' as $$
  with last as (
    select distinct on (r.source_id) r.source_id, r.run_at, r.ok, r.error, r.http_status, r.items_seen
    from public.data_source_runs r order by r.source_id, r.run_at desc
  ), good as (
    select r.source_id, max(r.run_at) as at, max(r.newest_item) as newest from public.data_source_runs r where r.ok group by r.source_id
  ), period as (
    select r.source_id, count(*)::int as n, (count(*) filter (where r.ok))::int as s,
      sum(r.items_seen) as seen, sum(r.items_kept) as kept, sum(r.items_new) as fresh
    from public.data_source_runs r where r.run_at >= since group by r.source_id
  )
  select l.source_id, coalesce(p.n, 0), coalesce(p.s, 0), coalesce(p.seen, 0), coalesce(p.kept, 0), coalesce(p.fresh, 0),
    l.run_at, l.ok, l.error, l.http_status, l.items_seen, g.at, g.newest,
    (select count(*)::int from public.data_source_runs f where f.source_id = l.source_id and f.run_at > coalesce(g.at, '-infinity'::timestamptz))
  from last l left join good g on g.source_id = l.source_id left join period p on p.source_id = l.source_id
  where public.is_app_admin()
$$;

revoke execute on function public.admin_save_source(jsonb, boolean, text, timestamptz, int), public.admin_set_source_status(text, text, text, int),
  public.admin_revert_source(bigint, text), public.admin_set_source_secret(text, text, text), public.admin_source_credentials(),
  public.admin_source_stats(timestamptz) from public, anon;
grant execute on function public.admin_save_source(jsonb, boolean, text, timestamptz, int), public.admin_set_source_status(text, text, text, int),
  public.admin_revert_source(bigint, text), public.admin_set_source_secret(text, text, text), public.admin_source_credentials(),
  public.admin_source_stats(timestamptz) to authenticated;

-- Initial import: the sources the build collected before the registry, with their exact
-- addresses and settings, all active. Rows that already exist are left as the admins
-- have them. Generated from sources.json by `npm run sources:sql`; do not edit by hand.
-- BEGIN SOURCE IMPORT
do $import$ begin
  perform set_config('pv.source_action', 'imported', true);
  insert into public.data_sources (id, name, organization, url, source_type, classification, regions, topics, status, settings)
  select s.id, s.name, s.organization, s.url, s.type, s.classification,
    array(select jsonb_array_elements_text(s.regions)), array(select jsonb_array_elements_text(s.topics)), s.status, s.settings
  from jsonb_to_recordset($seed$[
{"id":"fda-medwatch","name":"FDA MedWatch safety alerts","organization":"US Food and Drug Administration (FDA)","type":"rss","classification":"regulator","regions":["US"],"topics":["safety","recall","label"],"status":"active","url":"https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml","settings":{"relevance":"all","category":"safety"}},
{"id":"fda-drugs","name":"FDA What's New: Drugs","organization":"US Food and Drug Administration (FDA)","type":"rss","classification":"regulator","regions":["US"],"topics":["approval","label","guideline","safety"],"status":"active","url":"https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/drugs/rss.xml","settings":{"relevance":"all"}},
{"id":"fda-biologics","name":"FDA What's New: Biologics","organization":"US Food and Drug Administration (FDA)","type":"rss","classification":"regulator","regions":["US"],"topics":["approval","safety"],"status":"active","url":"https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/biologics/rss.xml","settings":{"relevance":"pv"}},
{"id":"fda-press-releases","name":"FDA press releases","organization":"US Food and Drug Administration (FDA)","type":"rss","classification":"regulator","regions":["US"],"topics":["policy","safety","approval"],"status":"active","url":"https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml","settings":{"relevance":"pv"}},
{"id":"fda-recalls","name":"FDA recalls","organization":"US Food and Drug Administration (FDA)","type":"rss","classification":"regulator","regions":["US"],"topics":["recall"],"status":"active","url":"https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml","settings":{"relevance":"pv","category":"recall"}},
{"id":"ema-news","name":"EMA news","organization":"European Medicines Agency (EMA)","type":"rss","classification":"regulator","regions":["EU"],"topics":["safety","guideline","approval","policy"],"status":"active","url":"https://www.ema.europa.eu/en/news.xml","settings":{"relevance":"all"}},
{"id":"mhra-drug-safety-update","name":"MHRA Drug Safety Update","organization":"Medicines and Healthcare products Regulatory Agency (MHRA)","type":"rss","classification":"regulator","regions":["GB"],"topics":["safety","label"],"status":"active","url":"https://www.gov.uk/drug-safety-update.atom","settings":{"relevance":"all","category":"safety"}},
{"id":"mhra-alerts-recalls","name":"MHRA alerts, recalls and safety information","organization":"Medicines and Healthcare products Regulatory Agency (MHRA)","type":"rss","classification":"regulator","regions":["GB"],"topics":["recall","safety"],"status":"active","url":"https://www.gov.uk/drug-device-alerts.atom","settings":{"relevance":"all","category":"recall"}},
{"id":"mhra-news-guidance","name":"MHRA news and guidance","organization":"Medicines and Healthcare products Regulatory Agency (MHRA)","type":"rss","classification":"regulator","regions":["GB"],"topics":["guideline","policy"],"status":"active","url":"https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency.atom","settings":{"relevance":"pv"}},
{"id":"health-canada-recalls-alerts","name":"Health Canada health product recalls and alerts","organization":"Health Canada","type":"rss","classification":"regulator","regions":["CA"],"topics":["recall","safety"],"status":"active","url":"https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls","settings":{"relevance":"all","category":"safety"}},
{"id":"tga-safety-alerts","name":"TGA safety alerts","organization":"Therapeutic Goods Administration (TGA)","type":"rss","classification":"regulator","regions":["AU"],"topics":["safety"],"status":"active","url":"https://www.tga.gov.au/feeds/alert/safety-alerts.xml","settings":{"relevance":"all","category":"safety"}},
{"id":"who-news","name":"WHO news","organization":"World Health Organization (WHO)","type":"rss","classification":"regulator","regions":["INT"],"topics":["policy","safety"],"status":"active","url":"https://www.who.int/rss-feeds/news-english.xml","settings":{"relevance":"pv"}},
{"id":"news-int-who","name":"WHO in the news","organization":"Google News search about World Health Organization","type":"news_search","classification":"news","regions":["INT"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22World%20Health%20Organization%22%20(medical%20product%20alert%20OR%20vaccine%20safety%20OR%20pharmacovigilance%20OR%20falsified%20medicine)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"World Health Organization\" (medical product alert OR vaccine safety OR pharmacovigilance OR falsified medicine)","relevance":"pv"}},
{"id":"news-int-umc","name":"UMC in the news","organization":"Google News search about Uppsala Monitoring Centre (WHO Programme for International Drug Monitoring)","type":"news_search","classification":"news","regions":["INT"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Uppsala%20Monitoring%20Centre%22%20OR%20VigiBase%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Uppsala Monitoring Centre\" OR VigiBase","relevance":"pv"}},
{"id":"news-int-ich","name":"ICH in the news","organization":"Google News search about International Council for Harmonisation","type":"news_search","classification":"news","regions":["INT"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22ICH%20guideline%22%20OR%20%22ICH%20E2%22%20OR%20%22International%20Council%20for%20Harmonisation%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"ICH guideline\" OR \"ICH E2\" OR \"International Council for Harmonisation\"","relevance":"pv"}},
{"id":"news-int-cioms","name":"CIOMS in the news","organization":"Google News search about Council for International Organizations of Medical Sciences","type":"news_search","classification":"news","regions":["INT"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=CIOMS%20(pharmacovigilance%20OR%20working%20group%20OR%20report)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"CIOMS (pharmacovigilance OR working group OR report)","relevance":"pv"}},
{"id":"news-int-icmra","name":"ICMRA in the news","organization":"Google News search about International Coalition of Medicines Regulatory Authorities","type":"news_search","classification":"news","regions":["INT"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=ICMRA%20medicines%20regulators%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"ICMRA medicines regulators","relevance":"pv"}},
{"id":"news-int-ama","name":"AMA in the news","organization":"Google News search about African Medicines Agency","type":"news_search","classification":"news","regions":["INT"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22African%20Medicines%20Agency%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"African Medicines Agency\"","relevance":"pv"}},
{"id":"news-br-anvisa","name":"ANVISA in the news","organization":"Google News search about Agência Nacional de Vigilância Sanitária","type":"news_search","classification":"news","regions":["BR"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=Anvisa%20(farmacovigil%C3%A2ncia%20OR%20pharmacovigilance%20OR%20recall%20OR%20alerta%20OR%20resolu%C3%A7%C3%A3o%20OR%20medicamento)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"Anvisa (farmacovigilância OR pharmacovigilance OR recall OR alerta OR resolução OR medicamento)","relevance":"pv"}},
{"id":"news-mx-cofepris","name":"COFEPRIS in the news","organization":"Google News search about Comisión Federal para la Protección contra Riesgos Sanitarios","type":"news_search","classification":"news","regions":["MX"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=COFEPRIS%20(farmacovigilancia%20OR%20alerta%20sanitaria%20OR%20medicamento%20OR%20NOM)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"COFEPRIS (farmacovigilancia OR alerta sanitaria OR medicamento OR NOM)","relevance":"pv"}},
{"id":"news-ar-anmat","name":"ANMAT in the news","organization":"Google News search about Administración Nacional de Medicamentos, Alimentos y Tecnología Médica","type":"news_search","classification":"news","regions":["AR"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=ANMAT%20(medicamento%20OR%20farmacovigilancia%20OR%20retiro%20OR%20alerta)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"ANMAT (medicamento OR farmacovigilancia OR retiro OR alerta)","relevance":"pv"}},
{"id":"news-co-invima","name":"INVIMA in the news","organization":"Google News search about Instituto Nacional de Vigilancia de Medicamentos y Alimentos","type":"news_search","classification":"news","regions":["CO"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=INVIMA%20(medicamento%20OR%20farmacovigilancia%20OR%20alerta)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"INVIMA (medicamento OR farmacovigilancia OR alerta)","relevance":"pv"}},
{"id":"news-cl-isp","name":"ISP in the news","organization":"Google News search about Instituto de Salud Pública de Chile","type":"news_search","classification":"news","regions":["CL"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Instituto%20de%20Salud%20P%C3%BAblica%22%20Chile%20(medicamento%20OR%20farmacovigilancia%20OR%20alerta)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Instituto de Salud Pública\" Chile (medicamento OR farmacovigilancia OR alerta)","relevance":"pv"}},
{"id":"news-pe-digemid","name":"DIGEMID in the news","organization":"Google News search about Dirección General de Medicamentos, Insumos y Drogas","type":"news_search","classification":"news","regions":["PE"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=DIGEMID%20(alerta%20OR%20medicamento%20OR%20farmacovigilancia)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"DIGEMID (alerta OR medicamento OR farmacovigilancia)","relevance":"pv"}},
{"id":"news-eu-ema","name":"EMA in the news","organization":"Google News search about European Medicines Agency","type":"news_search","classification":"news","regions":["EU"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=(%22European%20Medicines%20Agency%22%20OR%20PRAC%20OR%20EudraVigilance)%20(safety%20OR%20signal%20OR%20pharmacovigilance%20OR%20guideline%20OR%20referral)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"(\"European Medicines Agency\" OR PRAC OR EudraVigilance) (safety OR signal OR pharmacovigilance OR guideline OR referral)","relevance":"pv"}},
{"id":"news-de-bfarm","name":"BfArM in the news","organization":"Google News search about Federal Institute for Drugs and Medical Devices","type":"news_search","classification":"news","regions":["DE"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=(BfArM%20OR%20%22Paul-Ehrlich-Institut%22)%20(Arzneimittel%20OR%20Rote-Hand-Brief%20OR%20safety%20OR%20Pharmakovigilanz)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"(BfArM OR \"Paul-Ehrlich-Institut\") (Arzneimittel OR Rote-Hand-Brief OR safety OR Pharmakovigilanz)","relevance":"pv"}},
{"id":"news-fr-ansm","name":"ANSM in the news","organization":"Google News search about Agence nationale de sécurité du médicament et des produits de santé","type":"news_search","classification":"news","regions":["FR"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=ANSM%20(m%C3%A9dicament%20OR%20pharmacovigilance%20OR%20rappel%20OR%20s%C3%A9curit%C3%A9)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"ANSM (médicament OR pharmacovigilance OR rappel OR sécurité)","relevance":"pv"}},
{"id":"news-it-aifa","name":"AIFA in the news","organization":"Google News search about Agenzia Italiana del Farmaco","type":"news_search","classification":"news","regions":["IT"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=AIFA%20(farmacovigilanza%20OR%20farmaco%20OR%20nota%20informativa%20OR%20ritiro)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"AIFA (farmacovigilanza OR farmaco OR nota informativa OR ritiro)","relevance":"pv"}},
{"id":"news-es-aemps","name":"AEMPS in the news","organization":"Google News search about Agencia Española de Medicamentos y Productos Sanitarios","type":"news_search","classification":"news","regions":["ES"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=AEMPS%20(medicamento%20OR%20farmacovigilancia%20OR%20alerta%20OR%20retirada)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"AEMPS (medicamento OR farmacovigilancia OR alerta OR retirada)","relevance":"pv"}},
{"id":"news-nl-cbg-meb","name":"CBG-MEB in the news","organization":"Google News search about Medicines Evaluation Board / Lareb","type":"news_search","classification":"news","regions":["NL"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=(Lareb%20OR%20%22College%20ter%20Beoordeling%20van%20Geneesmiddelen%22%20OR%20CBG-MEB)%20(bijwerking%20OR%20geneesmiddel%20OR%20safety)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"(Lareb OR \"College ter Beoordeling van Geneesmiddelen\" OR CBG-MEB) (bijwerking OR geneesmiddel OR safety)","relevance":"pv"}},
{"id":"news-ie-hpra","name":"HPRA in the news","organization":"Google News search about Health Products Regulatory Authority","type":"news_search","classification":"news","regions":["IE"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Health%20Products%20Regulatory%20Authority%22%20OR%20HPRA%20medicines%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Health Products Regulatory Authority\" OR HPRA medicines","relevance":"pv"}},
{"id":"news-ch-swissmedic","name":"Swissmedic in the news","organization":"Google News search about Swissmedic","type":"news_search","classification":"news","regions":["CH"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=Swissmedic%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"Swissmedic","relevance":"pv"}},
{"id":"news-se-mpa","name":"MPA in the news","organization":"Google News search about Läkemedelsverket (Medical Products Agency)","type":"news_search","classification":"news","regions":["SE"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=L%C3%A4kemedelsverket%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"Läkemedelsverket","relevance":"pv"}},
{"id":"news-dk-dkma","name":"DKMA in the news","organization":"Google News search about Danish Medicines Agency","type":"news_search","classification":"news","regions":["DK"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=L%C3%A6gemiddelstyrelsen%20OR%20%22Danish%20Medicines%20Agency%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"Lægemiddelstyrelsen OR \"Danish Medicines Agency\"","relevance":"pv"}},
{"id":"news-no-dmp","name":"DMP in the news","organization":"Google News search about Norwegian Medical Products Agency","type":"news_search","classification":"news","regions":["NO"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Direktoratet%20for%20medisinske%20produkter%22%20OR%20%22Norwegian%20Medical%20Products%20Agency%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Direktoratet for medisinske produkter\" OR \"Norwegian Medical Products Agency\"","relevance":"pv"}},
{"id":"news-be-famhp","name":"FAMHP in the news","organization":"Google News search about Federal Agency for Medicines and Health Products","type":"news_search","classification":"news","regions":["BE"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=FAMHP%20OR%20AFMPS%20OR%20FAGG%20medicines%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"FAMHP OR AFMPS OR FAGG medicines","relevance":"pv"}},
{"id":"news-pl-urpl","name":"URPL in the news","organization":"Google News search about Office for Registration of Medicinal Products","type":"news_search","classification":"news","regions":["PL"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=URPL%20OR%20%22G%C5%82%C3%B3wny%20Inspektorat%20Farmaceutyczny%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"URPL OR \"Główny Inspektorat Farmaceutyczny\"","relevance":"pv"}},
{"id":"news-tr-titck","name":"TITCK in the news","organization":"Google News search about Turkish Medicines and Medical Devices Agency","type":"news_search","classification":"news","regions":["TR"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=T%C4%B0TCK%20OR%20TITCK%20ila%C3%A7%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"TİTCK OR TITCK ilaç","relevance":"pv"}},
{"id":"news-ru-roszdravnadzor","name":"Roszdravnadzor in the news","organization":"Google News search about Federal Service for Surveillance in Healthcare","type":"news_search","classification":"news","regions":["RU"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=Roszdravnadzor%20OR%20%D0%A0%D0%BE%D1%81%D0%B7%D0%B4%D1%80%D0%B0%D0%B2%D0%BD%D0%B0%D0%B4%D0%B7%D0%BE%D1%80%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"Roszdravnadzor OR Росздравнадзор","relevance":"pv"}},
{"id":"news-jp-pmda","name":"PMDA in the news","organization":"Google News search about Pharmaceuticals and Medical Devices Agency / MHLW","type":"news_search","classification":"news","regions":["JP"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=(PMDA%20OR%20MHLW%20OR%20%22Pharmaceuticals%20and%20Medical%20Devices%20Agency%22)%20(safety%20OR%20revision%20OR%20precautions%20OR%20guideline%20OR%20approval)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"(PMDA OR MHLW OR \"Pharmaceuticals and Medical Devices Agency\") (safety OR revision OR precautions OR guideline OR approval)","relevance":"pv"}},
{"id":"news-in-cdsco","name":"CDSCO in the news","organization":"Google News search about Central Drugs Standard Control Organisation / PvPI","type":"news_search","classification":"news","regions":["IN"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=(CDSCO%20OR%20DCGI%20OR%20PvPI%20OR%20%22Pharmacovigilance%20Programme%20of%20India%22)%20(drug%20OR%20alert%20OR%20notification%20OR%20guidance%20OR%20safety)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"(CDSCO OR DCGI OR PvPI OR \"Pharmacovigilance Programme of India\") (drug OR alert OR notification OR guidance OR safety)","relevance":"pv"}},
{"id":"news-cn-nmpa","name":"NMPA in the news","organization":"Google News search about National Medical Products Administration","type":"news_search","classification":"news","regions":["CN"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=NMPA%20(drug%20OR%20regulation%20OR%20pharmacovigilance%20OR%20guideline%20OR%20safety)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"NMPA (drug OR regulation OR pharmacovigilance OR guideline OR safety)","relevance":"pv"}},
{"id":"news-kr-mfds","name":"MFDS in the news","organization":"Google News search about Ministry of Food and Drug Safety","type":"news_search","classification":"news","regions":["KR"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=MFDS%20(drug%20OR%20safety%20OR%20regulation%20OR%20guideline)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"MFDS (drug OR safety OR regulation OR guideline)","relevance":"pv"}},
{"id":"news-nz-medsafe","name":"Medsafe in the news","organization":"Google News search about Medsafe (New Zealand Medicines and Medical Devices Safety Authority)","type":"news_search","classification":"news","regions":["NZ"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=Medsafe%20(medicine%20OR%20safety%20OR%20alert)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"Medsafe (medicine OR safety OR alert)","relevance":"pv"}},
{"id":"news-sg-hsa","name":"HSA in the news","organization":"Google News search about Health Sciences Authority","type":"news_search","classification":"news","regions":["SG"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Health%20Sciences%20Authority%22%20Singapore%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Health Sciences Authority\" Singapore","relevance":"pv"}},
{"id":"news-my-npra","name":"NPRA in the news","organization":"Google News search about National Pharmaceutical Regulatory Agency","type":"news_search","classification":"news","regions":["MY"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=NPRA%20Malaysia%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"NPRA Malaysia","relevance":"pv"}},
{"id":"news-th-thai-fda","name":"Thai FDA in the news","organization":"Google News search about Thai Food and Drug Administration","type":"news_search","classification":"news","regions":["TH"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Thai%20FDA%22%20drug%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Thai FDA\" drug","relevance":"pv"}},
{"id":"news-ph-fda-ph","name":"FDA PH in the news","organization":"Google News search about Food and Drug Administration Philippines","type":"news_search","classification":"news","regions":["PH"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22FDA%20Philippines%22%20OR%20%22Philippine%20FDA%22%20(drug%20OR%20advisory%20OR%20medicine)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"FDA Philippines\" OR \"Philippine FDA\" (drug OR advisory OR medicine)","relevance":"pv"}},
{"id":"news-id-bpom","name":"BPOM in the news","organization":"Google News search about Badan Pengawas Obat dan Makanan","type":"news_search","classification":"news","regions":["ID"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=BPOM%20(obat%20OR%20drug%20OR%20farmakovigilans)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"BPOM (obat OR drug OR farmakovigilans)","relevance":"pv"}},
{"id":"news-tw-tfda","name":"TFDA in the news","organization":"Google News search about Taiwan Food and Drug Administration","type":"news_search","classification":"news","regions":["TW"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Taiwan%20FDA%22%20OR%20TFDA%20drug%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Taiwan FDA\" OR TFDA drug","relevance":"pv"}},
{"id":"news-vn-dav","name":"DAV in the news","organization":"Google News search about Drug Administration of Vietnam","type":"news_search","classification":"news","regions":["VN"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Drug%20Administration%20of%20Vietnam%22%20OR%20%22C%E1%BB%A5c%20Qu%E1%BA%A3n%20l%C3%BD%20D%C6%B0%E1%BB%A3c%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Drug Administration of Vietnam\" OR \"Cục Quản lý Dược\"","relevance":"pv"}},
{"id":"news-pk-drap","name":"DRAP in the news","organization":"Google News search about Drug Regulatory Authority of Pakistan","type":"news_search","classification":"news","regions":["PK"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=DRAP%20(drug%20OR%20alert%20OR%20recall%20OR%20pharmacovigilance)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"DRAP (drug OR alert OR recall OR pharmacovigilance)","relevance":"pv"}},
{"id":"news-bd-dgda","name":"DGDA in the news","organization":"Google News search about Directorate General of Drug Administration","type":"news_search","classification":"news","regions":["BD"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=DGDA%20Bangladesh%20drug%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"DGDA Bangladesh drug","relevance":"pv"}},
{"id":"news-hk-dh-drug-office","name":"DH Drug Office in the news","organization":"Google News search about Department of Health Drug Office","type":"news_search","classification":"news","regions":["HK"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Hong%20Kong%22%20%22Department%20of%20Health%22%20(drug%20recall%20OR%20pharmaceutical%20OR%20medicine)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Hong Kong\" \"Department of Health\" (drug recall OR pharmaceutical OR medicine)","relevance":"pv"}},
{"id":"news-sa-sfda","name":"SFDA in the news","organization":"Google News search about Saudi Food and Drug Authority","type":"news_search","classification":"news","regions":["SA"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=SFDA%20(drug%20OR%20pharmacovigilance%20OR%20safety%20OR%20regulation)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"SFDA (drug OR pharmacovigilance OR safety OR regulation)","relevance":"pv"}},
{"id":"news-ae-ede","name":"EDE in the news","organization":"Google News search about Emirates Drug Establishment / MOHAP","type":"news_search","classification":"news","regions":["AE"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=(%22Emirates%20Drug%20Establishment%22%20OR%20MOHAP)%20(drug%20OR%20medicine%20OR%20recall)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"(\"Emirates Drug Establishment\" OR MOHAP) (drug OR medicine OR recall)","relevance":"pv"}},
{"id":"news-eg-eda","name":"EDA in the news","organization":"Google News search about Egyptian Drug Authority","type":"news_search","classification":"news","regions":["EG"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Egyptian%20Drug%20Authority%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Egyptian Drug Authority\"","relevance":"pv"}},
{"id":"news-il-moh-israel","name":"MoH Israel in the news","organization":"Google News search about Israel Ministry of Health, Pharmaceutical Division","type":"news_search","classification":"news","regions":["IL"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Israel%22%20%22Ministry%20of%20Health%22%20(drug%20safety%20OR%20medicine%20recall)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Israel\" \"Ministry of Health\" (drug safety OR medicine recall)","relevance":"pv"}},
{"id":"news-za-sahpra","name":"SAHPRA in the news","organization":"Google News search about South African Health Products Regulatory Authority","type":"news_search","classification":"news","regions":["ZA"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=SAHPRA%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"SAHPRA","relevance":"pv"}},
{"id":"news-ng-nafdac","name":"NAFDAC in the news","organization":"Google News search about National Agency for Food and Drug Administration and Control","type":"news_search","classification":"news","regions":["NG"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=NAFDAC%20(drug%20OR%20alert%20OR%20recall%20OR%20pharmacovigilance%20OR%20falsified)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"NAFDAC (drug OR alert OR recall OR pharmacovigilance OR falsified)","relevance":"pv"}},
{"id":"news-ke-ppb","name":"PPB in the news","organization":"Google News search about Pharmacy and Poisons Board","type":"news_search","classification":"news","regions":["KE"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Pharmacy%20and%20Poisons%20Board%22%20Kenya%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Pharmacy and Poisons Board\" Kenya","relevance":"pv"}},
{"id":"news-gh-fda-ghana","name":"FDA Ghana in the news","organization":"Google News search about Food and Drugs Authority Ghana","type":"news_search","classification":"news","regions":["GH"],"topics":["safety","regulation","news"],"status":"active","url":"https://news.google.com/rss/search?q=%22Food%20and%20Drugs%20Authority%22%20Ghana%20(drug%20OR%20medicine%20OR%20recall)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Food and Drugs Authority\" Ghana (drug OR medicine OR recall)","relevance":"pv"}},
{"id":"search-pharmacovigilance","name":"News search: pharmacovigilance","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["systems","safety"],"status":"active","url":"https://news.google.com/rss/search?q=pharmacovigilance%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"pharmacovigilance","relevance":"pv"}},
{"id":"search-drug-safety","name":"News search: \"drug safety\" (regulator OR agency OR signal)","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["safety"],"status":"active","url":"https://news.google.com/rss/search?q=%22drug%20safety%22%20(regulator%20OR%20agency%20OR%20signal)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"drug safety\" (regulator OR agency OR signal)","relevance":"pv"}},
{"id":"search-safety-signal","name":"News search: \"safety signal\" (drug OR vaccine OR medicine)","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["safety"],"status":"active","url":"https://news.google.com/rss/search?q=%22safety%20signal%22%20(drug%20OR%20vaccine%20OR%20medicine)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"safety signal\" (drug OR vaccine OR medicine)","relevance":"pv"}},
{"id":"search-boxed-warning","name":"News search: \"boxed warning\" OR \"black box warning\" FDA","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["label","safety"],"status":"active","url":"https://news.google.com/rss/search?q=%22boxed%20warning%22%20OR%20%22black%20box%20warning%22%20FDA%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"boxed warning\" OR \"black box warning\" FDA","relevance":"pv"}},
{"id":"search-drug-safety-communication","name":"News search: \"drug safety communication\"","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["safety","label"],"status":"active","url":"https://news.google.com/rss/search?q=%22drug%20safety%20communication%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"drug safety communication\"","relevance":"pv"}},
{"id":"search-rmp-rems","name":"News search: \"risk management plan\" OR REMS medicine","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["regulation","systems"],"status":"active","url":"https://news.google.com/rss/search?q=%22risk%20management%20plan%22%20OR%20REMS%20medicine%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"risk management plan\" OR REMS medicine","relevance":"pv"}},
{"id":"search-psur-pbrer","name":"News search: PSUR OR PBRER OR \"periodic safety update report\"","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["systems","regulation"],"status":"active","url":"https://news.google.com/rss/search?q=PSUR%20OR%20PBRER%20OR%20%22periodic%20safety%20update%20report%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"PSUR OR PBRER OR \"periodic safety update report\"","relevance":"pv"}},
{"id":"search-gvp","name":"News search: \"good pharmacovigilance practices\" OR \"GVP module\"","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["guideline","systems"],"status":"active","url":"https://news.google.com/rss/search?q=%22good%20pharmacovigilance%20practices%22%20OR%20%22GVP%20module%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"good pharmacovigilance practices\" OR \"GVP module\"","relevance":"pv"}},
{"id":"search-ae-reporting-rules","name":"News search: \"adverse event reporting\" (regulation OR guidance OR rule)","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["regulation","systems"],"status":"active","url":"https://news.google.com/rss/search?q=%22adverse%20event%20reporting%22%20(regulation%20OR%20guidance%20OR%20rule)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"adverse event reporting\" (regulation OR guidance OR rule)","relevance":"pv"}},
{"id":"search-dhpc","name":"News search: \"Dear Healthcare Professional\" OR DHPC","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["safety","label"],"status":"active","url":"https://news.google.com/rss/search?q=%22Dear%20Healthcare%20Professional%22%20OR%20DHPC%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"Dear Healthcare Professional\" OR DHPC","relevance":"pv"}},
{"id":"search-vaccine-safety","name":"News search: \"vaccine safety\" (regulator OR monitoring OR review)","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["safety"],"status":"active","url":"https://news.google.com/rss/search?q=%22vaccine%20safety%22%20(regulator%20OR%20monitoring%20OR%20review)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"vaccine safety\" (regulator OR monitoring OR review)","relevance":"pv"}},
{"id":"search-nitrosamine","name":"News search: nitrosamine (FDA OR EMA OR recall OR guidance)","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["recall","guideline"],"status":"active","url":"https://news.google.com/rss/search?q=nitrosamine%20(FDA%20OR%20EMA%20OR%20recall%20OR%20guidance)%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"nitrosamine (FDA OR EMA OR recall OR guidance)","relevance":"pv"}},
{"id":"search-falsified-medicines","name":"News search: \"falsified medicines\" OR \"substandard medicines\"","organization":"Google News search","type":"news_search","classification":"news","regions":[],"topics":["recall","policy"],"status":"active","url":"https://news.google.com/rss/search?q=%22falsified%20medicines%22%20OR%20%22substandard%20medicines%22%20when%3A30d&hl=en-US&gl=US&ceid=US:en","settings":{"provider":"google_news","query":"\"falsified medicines\" OR \"substandard medicines\"","relevance":"pv"}}
]$seed$::jsonb) as s(id text, name text, organization text, type text, classification text, regions jsonb, topics jsonb, status text, url text, settings jsonb)
  on conflict (id) do nothing;
  perform set_config('pv.source_action', '', true);
end $import$;
-- END SOURCE IMPORT

-- ── Safety data resources (Public Safety Data Resources directory) ──────────
--
-- A curated directory of public safety databases, registers and publication lists
-- (resources.html), maintained on Admin → Safety data resources (admin-resources.html).
--
--   safety_resources         one row per resource: official link, who maintains it, what it
--                            covers, access, downloads/API, reuse terms, limitations, when verified
--   safety_resource_events   history of every add, edit, verify, link flag, publish and
--                            retire, with who did it; written only by the database itself
--   resource_feedback        "Suggest a resource" and "Report incorrect information" from
--                            readers (no sign-in needed), answered by admins
--
-- A resource is a reference destination, not a collection source. Nothing here adds to or
-- changes data_sources, and no function below touches it: the build collects only from
-- active data_sources rows, which need their own passing test (see "Data sources").
-- source_id merely records that a resource is also an existing registry source.
-- Only admins can read these tables; the public page is built from them at each build,
-- without the verifiers' emails or the history.

create table if not exists public.safety_resources (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 60),
  name text not null check (length(trim(name)) between 2 and 160),
  organization text not null check (length(trim(organization)) between 1 and 200),
  categories text[] not null check (cardinality(categories) >= 1 and categories <@ array['adverse_events', 'safety_comms', 'labels', 'trials', 'literature', 'specialist']),
  specialties text[] not null default '{}' check (specialties <@ array['vaccines', 'pregnancy', 'med_errors', 'devices']),
  countries text[] not null check (cardinality(countries) >= 1 and array_to_string(countries, ',') ~ '^[A-Z]{2,3}(,[A-Z]{2,3})*$'),
  products text[] not null check (cardinality(products) >= 1 and products <@ array['medicine', 'vaccine', 'device']),
  purpose text not null check (length(trim(purpose)) between 1 and 400),
  coverage jsonb not null default '{}' check (jsonb_typeof(coverage) = 'object' and length(coverage::text) <= 2000),
  access jsonb not null check (jsonb_typeof(access) = 'object' and length(access::text) <= 1200
    and access ->> 'publicAccess' in ('open', 'registration', 'partial', 'restricted')
    and access ->> 'download' in ('yes', 'partial', 'no', 'unknown')
    and access ->> 'api' in ('open', 'key', 'no', 'unknown')
    and jsonb_typeof(access -> 'search') = 'boolean'),
  reuse jsonb not null check (jsonb_typeof(reuse) = 'object' and length(reuse::text) <= 800 and reuse ->> 'status' in ('open', 'conditions', 'permission', 'unknown')),
  limitations text not null check (length(trim(limitations)) between 1 and 800),
  url text not null check (url ~* '^https?://[^/?#@ ]+' and length(url) <= 2000),
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 6 and length(links::text) <= 4000),
  source_id text references public.data_sources on delete set null,
  keywords text[] not null default '{}' check (cardinality(keywords) <= 20),
  status text not null default 'draft' check (status in ('published', 'draft', 'retired')),
  link_status text not null default 'ok' check (link_status in ('ok', 'broken')),
  link_note text not null default '' check (length(link_note) <= 500),
  verified_on date,
  verified_method text check (verified_method in ('editor', 'automated')),
  verified_by text,
  verify_note text not null default '' check (length(verify_note) <= 1000),
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  -- Nothing is published before someone has checked it.
  constraint safety_resources_published_verified check (status <> 'published' or verified_on is not null)
);
alter table public.safety_resources enable row level security;
drop policy if exists "Admins read resources" on public.safety_resources;
create policy "Admins read resources" on public.safety_resources for select to authenticated using (public.is_app_admin());
-- No insert, update or delete grants: changes go through the functions below.
grant select on public.safety_resources to authenticated;

create table if not exists public.safety_resource_events (
  id bigint generated always as identity primary key,
  resource_id text not null,
  action text not null,
  note text,
  before jsonb,
  after jsonb,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists safety_resource_events_by_resource on public.safety_resource_events (resource_id, at desc);
alter table public.safety_resource_events enable row level security;
drop policy if exists "Admins read resource history" on public.safety_resource_events;
create policy "Admins read resource history" on public.safety_resource_events for select to authenticated using (public.is_app_admin());
grant select on public.safety_resource_events to authenticated;

create or replace function public.safety_resource_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.jwt() ->> 'email', 'import');
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', 'SQL editor');
  return new;
end $$;

-- The functions below say what kind of change it was (pv.resource_action) and why (pv.resource_note).
create or replace function public.safety_resource_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  act text := coalesce(nullif(current_setting('pv.resource_action', true), ''), case when tg_op = 'INSERT' then 'added' else 'edited' end);
  why text := nullif(current_setting('pv.resource_note', true), '');
  was jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'created_at' - 'created_by' - 'updated_at' - 'updated_by' end;
  now_ jsonb := to_jsonb(new) - 'created_at' - 'created_by' - 'updated_at' - 'updated_by';
begin
  if was is not null and was = now_ then return null; end if;
  insert into public.safety_resource_events (resource_id, action, note, before, after, by_email)
    values (new.id, act, why, was, now_, coalesce(auth.jwt() ->> 'email', case when act = 'imported' then 'initial import' else 'SQL editor' end));
  if act <> 'imported' then perform public.admin_log('resource ' || act, new.id, jsonb_build_object('note', why)); end if;
  return null;
end $$;

drop trigger if exists safety_resources_stamp on public.safety_resources;
create trigger safety_resources_stamp before insert or update on public.safety_resources for each row execute function public.safety_resource_stamp();
drop trigger if exists safety_resources_log on public.safety_resources;
create trigger safety_resources_log after insert or update on public.safety_resources for each row execute function public.safety_resource_log();

-- Adds a resource or saves an edit. `res` is the form (the shape of resources.json).
-- A new resource is saved as a draft; publishing needs a verification (admin_verify_resource
-- or admin_set_resource_status). An edit keeps the status and the last verification, so the
-- Admin page offers "Save and verify" when the admin has checked the details. `expected` is
-- the updated_at the admin started from, so two admins can't overwrite each other.
create or replace function public.admin_save_resource(res jsonb, creating boolean, why text default null, expected timestamptz default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  rid text := trim(res ->> 'id');
  cur public.safety_resources;
  sid text := nullif(trim(coalesce(res ->> 'sourceId', '')), '');
  out_at timestamptz;
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if rid is null or rid !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(rid) > 60 then raise exception 'The id must be lower-case letters, numbers and dashes'; end if;
  if (res ->> 'url') ~* '^https?://[^/?#]*@' then raise exception 'Do not put a user name or password in a link'; end if;
  if sid is not null and not exists (select 1 from public.data_sources where id = sid) then raise exception 'There is no data source %', sid; end if;
  select * into cur from public.safety_resources where id = rid for update;
  if creating and found then raise exception 'A resource with the id % already exists', rid; end if;
  if not creating and not found then raise exception 'That resource no longer exists'; end if;
  if found and expected is not null and date_trunc('milliseconds', cur.updated_at) <> date_trunc('milliseconds', expected) then
    raise exception 'Someone else changed this resource since you opened it. Reload the page and try again';
  end if;
  perform set_config('pv.resource_action', case when creating then 'added' else 'edited' end, true);
  perform set_config('pv.resource_note', coalesce(trim(why), ''), true);
  if creating then
    insert into public.safety_resources (id, name, organization, categories, specialties, countries, products, purpose, coverage, access, reuse, limitations, url, links, source_id, keywords, status)
    values (rid, trim(res ->> 'name'), trim(res ->> 'organization'),
      array(select jsonb_array_elements_text(coalesce(res -> 'categories', '[]'))), array(select jsonb_array_elements_text(coalesce(res -> 'specialties', '[]'))),
      array(select upper(jsonb_array_elements_text(coalesce(res -> 'countries', '[]')))), array(select jsonb_array_elements_text(coalesce(res -> 'products', '[]'))),
      trim(res ->> 'purpose'), coalesce(res -> 'coverage', '{}'), res -> 'access', res -> 'reuse', trim(res ->> 'limitations'), trim(res ->> 'url'),
      coalesce(res -> 'links', '[]'), sid, array(select jsonb_array_elements_text(coalesce(res -> 'keywords', '[]'))), 'draft')
    returning updated_at into out_at;
  else
    update public.safety_resources set
      name = trim(res ->> 'name'), organization = trim(res ->> 'organization'),
      categories = array(select jsonb_array_elements_text(coalesce(res -> 'categories', '[]'))), specialties = array(select jsonb_array_elements_text(coalesce(res -> 'specialties', '[]'))),
      countries = array(select upper(jsonb_array_elements_text(coalesce(res -> 'countries', '[]')))), products = array(select jsonb_array_elements_text(coalesce(res -> 'products', '[]'))),
      purpose = trim(res ->> 'purpose'), coverage = coalesce(res -> 'coverage', '{}'), access = res -> 'access', reuse = res -> 'reuse',
      limitations = trim(res ->> 'limitations'), url = trim(res ->> 'url'), links = coalesce(res -> 'links', '[]'), source_id = sid,
      keywords = array(select jsonb_array_elements_text(coalesce(res -> 'keywords', '[]'))),
      -- A new address has not been checked yet.
      link_status = case when url <> trim(res ->> 'url') then 'ok' else link_status end
    where id = rid returning updated_at into out_at;
  end if;
  perform set_config('pv.resource_action', '', true);
  perform set_config('pv.resource_note', '', true);
  return out_at;
end $$;

-- Records that an admin checked the link, access details, coverage and limitations today.
create or replace function public.admin_verify_resource(rid text, note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  perform set_config('pv.resource_action', 'verified', true);
  perform set_config('pv.resource_note', coalesce(trim(note), ''), true);
  update public.safety_resources set verified_on = current_date, verified_method = 'editor', verified_by = auth.jwt() ->> 'email',
    verify_note = coalesce(trim(note), ''), link_status = 'ok', link_note = ''
  where id = rid;
  if not found then raise exception 'That resource no longer exists'; end if;
  perform set_config('pv.resource_action', '', true);
  perform set_config('pv.resource_note', '', true);
end $$;

-- Flags the official link as broken (readers see a warning on the card) or clears the flag.
create or replace function public.admin_flag_resource_link(rid text, broken boolean, note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  perform set_config('pv.resource_action', case when broken then 'link flagged' else 'link cleared' end, true);
  perform set_config('pv.resource_note', coalesce(trim(note), ''), true);
  update public.safety_resources set link_status = case when broken then 'broken' else 'ok' end, link_note = coalesce(trim(note), '') where id = rid;
  if not found then raise exception 'That resource no longer exists'; end if;
  perform set_config('pv.resource_action', '', true);
  perform set_config('pv.resource_note', '', true);
end $$;

-- Publish, return to draft, retire (hidden from the directory, history kept) or restore.
create or replace function public.admin_set_resource_status(rid text, new_status text, why text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare cur public.safety_resources;
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if new_status not in ('published', 'draft', 'retired') then raise exception 'Status must be published, draft or retired'; end if;
  select * into cur from public.safety_resources where id = rid for update;
  if not found then raise exception 'That resource no longer exists'; end if;
  if new_status = 'published' and cur.verified_on is null then raise exception 'Verify the resource before publishing it'; end if;
  perform set_config('pv.resource_action', case new_status when 'published' then 'published' when 'retired' then 'retired' else 'unpublished' end, true);
  perform set_config('pv.resource_note', coalesce(trim(why), ''), true);
  update public.safety_resources set status = new_status where id = rid;
  perform set_config('pv.resource_action', '', true);
  perform set_config('pv.resource_note', '', true);
end $$;

grant execute on function public.admin_save_resource(jsonb, boolean, text, timestamptz), public.admin_verify_resource(text, text),
  public.admin_flag_resource_link(text, boolean, text), public.admin_set_resource_status(text, text, text) to authenticated;

-- Reader suggestions and corrections. Anyone may send one, signed in or not; only admins
-- read them. Sending goes through submit_resource_feedback, which limits how many come
-- from one address per hour (the address is stored only as a hash).
create table if not exists public.resource_feedback (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('suggest', 'report')),
  resource_id text references public.safety_resources on delete set null,
  name text not null default '' check (length(name) <= 200),
  url text not null default '' check (length(url) <= 2000),
  message text not null check (length(trim(message)) between 5 and 2000),
  contact text not null default '' check (length(contact) <= 200),
  sender uuid,
  sender_hash text,
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  reply text not null default '' check (length(reply) <= 1000),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text
);
create index if not exists resource_feedback_open on public.resource_feedback (status, created_at desc);
create index if not exists resource_feedback_sender on public.resource_feedback (sender_hash, created_at desc);
alter table public.resource_feedback enable row level security;
drop policy if exists "Admins read resource feedback" on public.resource_feedback;
create policy "Admins read resource feedback" on public.resource_feedback for select to authenticated using (public.is_app_admin());
grant select on public.resource_feedback to authenticated;

create or replace function public.submit_resource_feedback(kind text, resource_id text default null, name text default '', url text default '', message text default '', contact text default '') returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  ip text := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  h text := md5('pv-resource-feedback:' || coalesce(nullif(trim(ip), ''), 'unknown'));
begin
  if kind not in ('suggest', 'report') then raise exception 'Unknown kind of message'; end if;
  if kind = 'report' and (resource_id is null or not exists (select 1 from public.safety_resources r where r.id = resource_id and r.status = 'published')) then
    raise exception 'That resource is not in the directory';
  end if;
  if kind = 'suggest' and coalesce(trim(name), '') = '' then raise exception 'Enter the name of the resource'; end if;
  if coalesce(trim(url), '') <> '' and trim(url) !~* '^https?://[^/?#@ ]+' then raise exception 'The link must be a web address'; end if;
  if length(trim(coalesce(message, ''))) < 5 then raise exception 'Please say a little more'; end if;
  if (select count(*) from public.resource_feedback f where f.sender_hash = h and f.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Thank you; you have sent several messages already. Please try again in an hour';
  end if;
  if (select count(*) from public.resource_feedback f where f.created_at > now() - interval '1 day') >= 200 then
    raise exception 'We are receiving many messages right now. Please try again tomorrow';
  end if;
  insert into public.resource_feedback (kind, resource_id, name, url, message, contact, sender, sender_hash)
  values (kind, case when kind = 'report' then resource_id end, left(trim(coalesce(name, '')), 200), left(trim(coalesce(url, '')), 2000),
    left(trim(message), 2000), left(trim(coalesce(contact, '')), 200), auth.uid(), h);
end $$;
grant execute on function public.submit_resource_feedback(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_answer_feedback(fid bigint, new_status text, reply text default '') returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not public.is_app_admin() then raise exception 'Only an admin can do that'; end if;
  if new_status not in ('open', 'done', 'declined') then raise exception 'Status must be open, done or declined'; end if;
  update public.resource_feedback set status = new_status, reply = left(coalesce(trim(reply), ''), 1000),
    handled_at = case when new_status = 'open' then null else now() end,
    handled_by = case when new_status = 'open' then null else auth.jwt() ->> 'email' end
  where id = fid;
  if not found then raise exception 'That message no longer exists'; end if;
  perform public.admin_log('resource feedback ' || new_status, fid::text, jsonb_build_object('reply', reply));
end $$;
grant execute on function public.admin_answer_feedback(bigint, text, text) to authenticated;

-- The directory's first entries, from resources.json (npm run resources:sql). Each was
-- checked against its official page on its verified date by an automated page read, and
-- is marked so until an editor verifies it. Running the file again leaves admin changes alone.
-- BEGIN RESOURCE IMPORT
do $import$ begin
  perform set_config('pv.resource_action', 'imported', true);
  insert into public.safety_resources (id, name, organization, categories, specialties, countries, products, purpose, coverage, access, reuse, limitations, url, links, source_id, keywords, status, verified_on, verified_method, verified_by)
  select r.id, r.name, r.organization,
    array(select jsonb_array_elements_text(r.categories)), array(select jsonb_array_elements_text(r.specialties)),
    array(select jsonb_array_elements_text(r.countries)), array(select jsonb_array_elements_text(r.products)),
    r.purpose, r.coverage, r.access, r.reuse, r.limitations, r.url, r.links,
    -- Only a link to a source that exists; a resource never creates one.
    (select s.id from public.data_sources s where s.id = r."sourceId"),
    array(select jsonb_array_elements_text(r.keywords)), r.status, r."verifiedOn", r."verifiedMethod",
    case when r."verifiedOn" is not null then 'automated page check' end
  from jsonb_to_recordset($seed$[
{"id":"canada-vigilance","name":"Canada Vigilance Adverse Reaction Online Database","organization":"Health Canada (MedEffect Canada)","categories":["adverse_events"],"specialties":["vaccines"],"countries":["CA"],"products":["medicine","vaccine"],"purpose":"Which suspected adverse reactions to health products have been reported in Canada?","coverage":{"countries":"Canada","products":"Health products; vaccines since 1 January 2011; blood and blood components since 1 September 2015","reportTypes":"Voluntary reports from consumers and health professionals; mandatory reports from manufacturers and distributors","years":"1965 to date (data to 31 May 2026 at the check)"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Online search, plus the full data set as monthly compressed ASCII files (about 344 MB) for loading into your own database."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"Health Canada says the database should not be used on its own to evaluate a product's safety, as it does not provide conclusive information.","url":"https://www.canada.ca/en/health-canada/services/drugs-health-products/medeffect-canada/adverse-reaction-database.html","links":[{"label":"Data extract","url":"https://www.canada.ca/en/health-canada/services/drugs-health-products/medeffect-canada/adverse-reaction-database/canada-vigilance-online-database-data-extract.html"}],"sourceId":null,"keywords":["MedEffect","Canada Vigilance"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"eudravigilance-adrreports","name":"European database of suspected adverse drug reaction reports (adrreports.eu)","organization":"European Medicines Agency (EudraVigilance)","categories":["adverse_events"],"specialties":["vaccines"],"countries":["EU"],"products":["medicine","vaccine"],"purpose":"Which suspected side effects have been reported in the EEA for a medicine or active substance?","coverage":{"countries":"European Economic Area","products":"Authorised medicines and vaccines (centrally authorised by name or substance; others by substance only)","reportTypes":"Spontaneous suspected adverse reaction reports","years":"Not stated"},"access":{"publicAccess":"partial","search":true,"download":"partial","api":"no","note":"The public sees a restricted set of data elements after accepting a disclaimer. Marketing authorisation holders, regulators and academics get more under the EudraVigilance access policy, with registration."},"reuse":{"status":"open","note":"May be reproduced for non-commercial and commercial purposes, provided EMA is acknowledged as the source."},"limitations":"EMA says the data do not confirm a link between the medicine and the effect and should not be used to judge how likely a side effect is.","url":"https://www.adrreports.eu/en/index.html","links":[{"label":"Access policy","url":"https://www.ema.europa.eu/en/human-regulatory-overview/research-development/pharmacovigilance-research-development/eudravigilance/access-eudravigilance-data"},{"label":"Disclaimer","url":"https://www.adrreports.eu/en/disclaimer.html"},{"label":"Copyright","url":"https://www.adrreports.eu/en/copyright.html"}],"sourceId":null,"keywords":["EudraVigilance","EVDAS","ADR reports","line listing"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-faers","name":"FDA Adverse Event Reporting System (FAERS) Public Dashboard and quarterly data files","organization":"US Food and Drug Administration (CDER)","categories":["adverse_events"],"specialties":["med_errors"],"countries":["US"],"products":["medicine"],"purpose":"Which suspected adverse events, medication errors and quality complaints have been reported to FDA for a drug?","coverage":{"countries":"United States, plus reports FDA receives from other countries","products":"Drugs and therapeutic biologics","reportTypes":"Adverse event reports, medication error reports, product quality complaints resulting in adverse events","years":"Quarterly data files from 2004 Q1; the dashboard covers earlier years"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Public Dashboard for search; non-cumulative quarterly ASCII or XML zip files for analysis. The same data is in openFDA's API. FDA now also calls this the Adverse Event Monitoring System (AEMS)."},"reuse":{"status":"unknown","note":"Not stated on the pages checked; openFDA publishes FAERS data under CC0."},"limitations":"Spontaneous reports: a report does not show the drug caused the event, reports are duplicated and under-reported, and counts cannot give incidence. FDA notes the raw files need relational-database skills.","url":"https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html","links":[{"label":"About FAERS","url":"https://www.fda.gov/drugs/surveillance/fdas-adverse-event-reporting-system-faers"},{"label":"Quarterly data files","url":"https://www.fda.gov/drugs/fdas-adverse-event-reporting-system-faers/fda-adverse-event-reporting-system-faers-latest-quarterly-data-files"}],"sourceId":null,"keywords":["FAERS","AERS","AEMS","spontaneous reports","MedWatch"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"pmda-jader","name":"JADER: Japanese Adverse Drug Event Report database","organization":"Pharmaceuticals and Medical Devices Agency (Japan)","categories":["adverse_events"],"specialties":[],"countries":["JP"],"products":["medicine"],"purpose":"Which suspected adverse drug reactions have been reported in Japan, as data I can analyse?","coverage":{"countries":"Japan","products":"Drugs","reportTypes":"Line listings of suspected adverse reaction case reports, with CSV data","years":"Not stated on the terms page"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"Free CSV download after accepting the terms of use. Pages are in Japanese. PMDA supplies no analysis tools."},"reuse":{"status":"conditions","note":"Free to use under PMDA's terms: cite JADER in publications, credit PMDA in services built on it, pass the terms on to secondary users, and report health hazards found to PMDA."},"limitations":"PMDA asks users to understand ICH E2B before use and accepts no liability; use is at the user's own judgement. Spontaneous reports do not show causation.","url":"https://www.pmda.go.jp/safety/info-services/drugs/adr-info/suspected-adr/0003.html","links":[],"sourceId":null,"keywords":["JADER","Japan","副作用","PMDA adverse event"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-maude","name":"MAUDE: Manufacturer and User Facility Device Experience","organization":"US Food and Drug Administration (CDRH)","categories":["adverse_events","specialist"],"specialties":["devices"],"countries":["US"],"products":["device"],"purpose":"What device malfunctions, injuries and deaths have been reported to FDA for a medical device?","coverage":{"countries":"United States","products":"Medical devices","reportTypes":"Mandatory reports (manufacturers, importers, user facilities) and voluntary reports","years":"Search: last 10 years. Data files: voluntary reports since 1993, manufacturer reports since 1996"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Search is capped at 500 results; zipped data files updated monthly. Device events are also in openFDA. FDA plans to move MAUDE data into AEMS in 2026."},"reuse":{"status":"unknown","note":"Not stated on the pages checked."},"limitations":"FDA says an event report does not mean there is a problem with the device and the data cannot be used to work out event rates; trade secrets and reporter identities are removed.","url":"https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/search.cfm","links":[{"label":"MDR data files","url":"https://www.fda.gov/medical-devices/medical-device-reporting-mdr-how-report-medical-device-problems/mdr-data-files"}],"sourceId":null,"keywords":["MAUDE","MDR","device adverse event"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"medsafe-smars","name":"Medsafe Suspected Medicine Adverse Reaction Search (SMARS)","organization":"Medsafe, New Zealand Ministry of Health","categories":["adverse_events"],"specialties":[],"countries":["NZ"],"products":["medicine","vaccine"],"purpose":"Which suspected adverse reactions have been reported in New Zealand for a medicine?","coverage":{"countries":"New Zealand","products":"Medicines and vaccines","reportTypes":"Reports to the Centre for Adverse Reactions Monitoring","years":"Not yet checked"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Not yet checked."},"reuse":{"status":"unknown","note":"Not yet checked."},"limitations":"Not yet checked: the search page was found from Medsafe's reporting page but has not been read.","url":"https://www.medsafe.govt.nz/SMARS/","links":[],"sourceId":null,"keywords":["SMARS","CARM","New Zealand"],"status":"draft","verifiedOn":null,"verifiedMethod":null},
{"id":"mhra-yellow-card-idap","name":"MHRA Yellow Card interactive Drug Analysis Profiles (iDAPs)","organization":"Medicines and Healthcare products Regulatory Agency (UK)","categories":["adverse_events"],"specialties":["vaccines"],"countries":["GB"],"products":["medicine","vaccine"],"purpose":"Which suspected adverse reactions have been reported in the UK for an active substance or vaccine?","coverage":{"countries":"United Kingdom","products":"Medicines (by active substance) and vaccines","reportTypes":"All suspected adverse reactions reported through the Yellow Card scheme","years":"Not stated; about a one-month delay"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Interactive profile per substance. Device reports are collected but not published as profiles."},"reuse":{"status":"unknown","note":"Not stated on the pages checked."},"limitations":"MHRA asks readers to use the guidance at the bottom of each profile to avoid misinterpreting the data; reports do not prove causation.","url":"https://yellowcard.mhra.gov.uk/idaps","links":[],"sourceId":null,"keywords":["Yellow Card","iDAP","DAP"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"openfda","name":"openFDA APIs","organization":"US Food and Drug Administration","categories":["adverse_events","safety_comms","labels"],"specialties":["devices"],"countries":["US"],"products":["medicine","device"],"purpose":"How can I query FDA adverse event, recall and labeling data programmatically?","coverage":{"countries":"United States","products":"Drugs, devices and foods","reportTypes":"Adverse events, recall enforcement reports, drug labels and other FDA data sets","years":"Not stated"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"key","note":"Works without a key at lower limits (1,000 requests a day); a free key raises it to 120,000 a day."},"reuse":{"status":"open","note":"Public domain under CC0 1.0, except GMDN device terms, which need a licence from the GMDN Agency for commercial use."},"limitations":"openFDA says not all data has been validated for clinical or production use. Adverse event records carry the same cautions as FAERS and MAUDE.","url":"https://open.fda.gov/apis/","links":[{"label":"Licence","url":"https://open.fda.gov/license/"},{"label":"API keys","url":"https://open.fda.gov/apis/authentication/"}],"sourceId":null,"keywords":["API","FAERS API","openFDA"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"tga-daen","name":"TGA Database of Adverse Event Notifications (DAEN)","organization":"Therapeutic Goods Administration (Australia)","categories":["adverse_events"],"specialties":["devices","vaccines"],"countries":["AU"],"products":["medicine","vaccine","device"],"purpose":"Which adverse events have been reported in Australia for a medicine, vaccine or device?","coverage":{"countries":"Australia","products":"Medicines, vaccines and medical devices","reportTypes":"Adverse event notifications","years":"Not yet checked"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Not yet checked: the site's terms page now sits on aems.tga.gov.au."},"reuse":{"status":"unknown","note":"Not yet checked."},"limitations":"Not yet checked: TGA blocks automated reading of the DAEN pages, so an editor needs to verify this entry.","url":"https://www.tga.gov.au/safety/safety-monitoring-and-information/database-adverse-event-notifications-daen","links":[],"sourceId":null,"keywords":["DAEN","Australia adverse event"],"status":"draft","verifiedOn":null,"verifiedMethod":null},
{"id":"vaers","name":"Vaccine Adverse Event Reporting System (VAERS) data and CDC WONDER search","organization":"Centers for Disease Control and Prevention and US Food and Drug Administration","categories":["adverse_events","specialist"],"specialties":["vaccines"],"countries":["US"],"products":["vaccine"],"purpose":"Which adverse events after vaccination have been reported in the US for a vaccine?","coverage":{"countries":"United States (US-licensed vaccines, including some foreign reports)","products":"Vaccines","reportTypes":"Spontaneous reports from anyone; secondary reports added from May 2025","years":"1990 to date; de-identified data appear 4 to 6 weeks after receipt"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Raw CSV downloads at vaers.hhs.gov and the CDC WONDER query tool. Public data hold initial reports only, not follow-up."},"reuse":{"status":"conditions","note":"CDC WONDER data use restrictions: statistical reporting and analysis only, and no attempt to identify anyone."},"limitations":"CDC and FDA state that report numbers alone cannot show a vaccine caused an event; reports may be incomplete, coincidental or unverified, and VAERS is passive and under-reports.","url":"https://vaers.hhs.gov/data.html","links":[{"label":"CDC WONDER VAERS search","url":"https://wonder.cdc.gov/vaers.html"},{"label":"Data guide","url":"https://vaers.hhs.gov/data/dataguide.html"}],"sourceId":null,"keywords":["VAERS","AEFI","vaccine adverse event"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"vigiaccess","name":"VigiAccess (WHO global database VigiBase)","organization":"Uppsala Monitoring Centre for the WHO Programme for International Drug Monitoring","categories":["adverse_events"],"specialties":["vaccines"],"countries":["INT"],"products":["medicine","vaccine"],"purpose":"How many suspected adverse reactions have been reported worldwide for a medicine or vaccine, and of what kind?","coverage":{"countries":"WHO Programme members (over 180 countries)","products":"Medicines and vaccines","reportTypes":"Summarised individual case safety reports in VigiBase (over 40 million reports)","years":"Not stated"},"access":{"publicAccess":"partial","search":true,"download":"no","api":"unknown","note":"VigiAccess gives limited statistics openly. Full VigiBase data is free to WHO Programme members and available for a fee to companies, software providers and researchers. UMC lists a VigiAccess API for developers (not checked)."},"reuse":{"status":"unknown","note":"Not stated on the pages checked."},"limitations":"UMC says analysis and interpretation of VigiBase data requires specialised knowledge. Counts reflect reporting, not incidence or causality. Details checked on UMC's data access pages; the VigiAccess site itself needs JavaScript and was not read.","url":"https://www.vigiaccess.org/","links":[{"label":"About VigiBase","url":"https://who-umc.org/vigibase-data-access/about-vigibase/"},{"label":"VigiBase data access","url":"https://who-umc.org/vigibase-data-access/"}],"sourceId":null,"keywords":["VigiBase","UMC","WHO global"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"ema-dhpc","name":"EMA Direct healthcare professional communications (DHPCs)","organization":"European Medicines Agency","categories":["safety_comms"],"specialties":[],"countries":["EU"],"products":["medicine","vaccine"],"purpose":"Which important safety letters have been sent to EU healthcare professionals about a medicine?","coverage":{"countries":"EU and EEA, with links to each national register","products":"Human medicines","reportTypes":"DHPCs sent by marketing authorisation holders about important new safety information","years":"Not stated"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"EU-level DHPCs via EMA's medicine search and the DHPC table in Download medicine data; national registers are linked by country."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"EMA notes national authorities may adapt the EU text, so the letter a professional receives may differ; national registers may not be in English. Shortage letters are published separately.","url":"https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/direct-healthcare-professional-communications","links":[],"sourceId":null,"keywords":["DHPC","Dear Doctor letter"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"ema-prac","name":"EMA PRAC meeting highlights and safety signal recommendations","organization":"European Medicines Agency (Pharmacovigilance Risk Assessment Committee)","categories":["safety_comms"],"specialties":[],"countries":["EU"],"products":["medicine","vaccine"],"purpose":"What safety signals and risks has the EU safety committee assessed, and what product information changes did it recommend?","coverage":{"countries":"EU and EEA","products":"Human medicines, centrally and nationally authorised","reportTypes":"PRAC agendas, minutes, meeting highlights; monthly recommendations on safety signals with new product information wording","years":"Signal recommendations since September 2012; meeting documents in a paged archive"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"Documents are PDFs; new product information wording is given in English and other EU languages. RSS available."},"reuse":{"status":"unknown","note":"No reuse terms on the pages checked."},"limitations":"EMA notes that the presence of a safety signal does not mean the medicine caused the reported adverse event. Recommendations still need adoption before the label changes.","url":"https://www.ema.europa.eu/en/committees/pharmacovigilance-risk-assessment-committee-prac","links":[{"label":"PRAC recommendations on safety signals","url":"https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/signal-management/prac-recommendations-safety-signals"}],"sourceId":"ema-news","keywords":["PRAC","signal","EMA"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-drug-safety-communications","name":"FDA Drug Safety Communications","organization":"US Food and Drug Administration (CDER)","categories":["safety_comms"],"specialties":[],"countries":["US"],"products":["medicine"],"purpose":"What new safety issues has FDA communicated to patients and health professionals about a medicine?","coverage":{"countries":"United States","products":"Drugs (including biologics regulated by CDER)","reportTypes":"Drug Safety Communications","years":"2020 to date on the page; earlier communications in an archived copy linked from the page"},"access":{"publicAccess":"open","search":false,"download":"no","api":"no","note":"Dated web list; email alerts available."},"reuse":{"status":"unknown","note":"No reuse terms on the page checked."},"limitations":"Covers only the issues FDA chose to communicate this way; label changes and other actions may be published elsewhere (Drugs@FDA, DailyMed).","url":"https://www.fda.gov/drugs/drug-safety-and-availability/drug-safety-communications","links":[],"sourceId":"fda-medwatch","keywords":["DSC","FDA warning","boxed warning"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-recalls","name":"FDA Recalls, Market Withdrawals and Safety Alerts, and the Enforcement Report","organization":"US Food and Drug Administration","categories":["safety_comms"],"specialties":["devices"],"countries":["US"],"products":["medicine","vaccine","device"],"purpose":"Has a product been recalled or withdrawn in the US, why, and how serious is the recall?","coverage":{"countries":"United States","products":"Drugs, biologics, medical devices, and other FDA-regulated products","reportTypes":"Recall press releases and public notices; Enforcement Report recall records with recall class","years":"Recalls page: about the last three years, then archived. Enforcement Report: from 8 June 2012"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"open","note":"Recalls page has filters and an XLSX download. The Enforcement Report has search, CSV export and a documented API."},"reuse":{"status":"unknown","note":"No reuse terms on the pages checked."},"limitations":"FDA says not all recalls have press releases or appear on the recalls page; use the Enforcement Report for a more complete listing.","url":"https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts","links":[{"label":"Enforcement Report search","url":"https://www.accessdata.fda.gov/scripts/ires/index.cfm"},{"label":"Enforcement Report API","url":"https://www.accessdata.fda.gov/scripts/ires/apidocs/"}],"sourceId":"fda-recalls","keywords":["recall","withdrawal","enforcement report","recall class"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"health-canada-recalls","name":"Government of Canada Recalls and safety alerts","organization":"Health Canada (Government of Canada)","categories":["safety_comms"],"specialties":["devices"],"countries":["CA"],"products":["medicine","vaccine","device"],"purpose":"Has a health product been recalled in Canada, or has Health Canada issued a safety alert?","coverage":{"countries":"Canada","products":"Health products (drugs, devices, natural health products) plus food, consumer products and vehicles","reportTypes":"Recalls, safety alerts, advisories","years":"Active and archived records (about 34,000 at the check)"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Recall and alert data in CSV and JSON on the Open Government Portal, updated daily; RSS and email."},"reuse":{"status":"conditions","note":"The open data set is published on the Open Government Portal; check its licence. Website terms at canada.ca/en/transparency/terms."},"limitations":"The database mixes health products with food and consumer products; filter by category.","url":"https://recalls-rappels.canada.ca/en","links":[{"label":"Open data (CSV, JSON)","url":"https://open.canada.ca/data/en/dataset/d38de914-c94c-429b-8ab1-8776c31643e3"}],"sourceId":"health-canada-recalls-alerts","keywords":["recall","Health Canada advisory"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"mhra-alerts","name":"MHRA alerts, recalls and safety information: medicines and medical devices","organization":"Medicines and Healthcare products Regulatory Agency (UK)","categories":["safety_comms"],"specialties":["devices"],"countries":["GB"],"products":["medicine","vaccine","device"],"purpose":"Is there a UK recall, field safety notice or patient safety alert for a medicine or device?","coverage":{"countries":"United Kingdom","products":"Medicines and medical devices","reportTypes":"Medicines recalls and defect notifications (with class), field safety notices, national patient safety alerts, device safety information","years":"Searchable archive (about 1,460 messages at the check)"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Filters by message type, specialty and date; email alerts and an Atom feed."},"reuse":{"status":"open","note":"GOV.UK content is available under the Open Government Licence v3.0, except where otherwise stated."},"limitations":"Field safety notices are written by manufacturers; MHRA lists them but the content is the manufacturer's.","url":"https://www.gov.uk/drug-device-alerts","links":[],"sourceId":"mhra-alerts-recalls","keywords":["field safety notice","FSN","recall","NatPSA"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"mhra-drug-safety-update","name":"MHRA Drug Safety Update","organization":"Medicines and Healthcare products Regulatory Agency (UK)","categories":["safety_comms"],"specialties":[],"countries":["GB"],"products":["medicine","vaccine"],"purpose":"What safety advice has the UK regulator issued to health professionals about a medicine?","coverage":{"countries":"United Kingdom","products":"Medicines and vaccines","reportTypes":"Drug Safety Update articles; monthly summaries of letters and medicine recalls sent to health professionals","years":"Searchable archive (about 870 articles at the check)"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Search with therapeutic-area and date filters; email alerts and an Atom feed."},"reuse":{"status":"open","note":"GOV.UK content is available under the Open Government Licence v3.0, except where otherwise stated."},"limitations":"Advice reflects UK licensing and practice and may differ from other countries.","url":"https://www.gov.uk/drug-safety-update","links":[],"sourceId":"mhra-drug-safety-update","keywords":["DSU","MHRA"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"pmda-safety-information","name":"PMDA Safety Information Regarding Drugs (English) and Revisions of Precautions","organization":"Pharmaceuticals and Medical Devices Agency (Japan), with MHLW","categories":["safety_comms","labels"],"specialties":[],"countries":["JP"],"products":["medicine"],"purpose":"What safety measures and package-insert precaution revisions has Japan issued for a drug?","coverage":{"countries":"Japan","products":"Drugs","reportTypes":"Revisions of PRECAUTIONS (MHLW notices and PMDA summaries), Yellow and Blue Letters, PMDA Risk Communications, Alerts for Proper Use, RMPs","years":"Revisions of Precautions in English: FY2014 to date"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"Year-by-year pages with documents."},"reuse":{"status":"permission","note":"PMDA pages carry 'All Rights Reserved' with no reuse licence."},"limitations":"PMDA warns the English site may be inaccurate due to machine translation and attached files are not translated; the Japanese pages are authoritative.","url":"https://www.pmda.go.jp/english/safety/info-services/drugs/0001.html","links":[{"label":"Revisions of Precautions","url":"https://www.pmda.go.jp/english/safety/info-services/drugs/revision-of-precautions/0001.html"}],"sourceId":null,"keywords":["PMDA","MHLW","Japan","revision of precautions","yellow letter","blue letter"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"tga-alerts-recalls","name":"TGA safety alerts and Database of Recalls, Product Alerts and Product Corrections (DRAC)","organization":"Therapeutic Goods Administration (Australia)","categories":["safety_comms"],"specialties":["devices"],"countries":["AU"],"products":["medicine","vaccine","device"],"purpose":"Is there an Australian safety alert, recall or product correction for a medicine, biological or device?","coverage":{"countries":"Australia","products":"Medicines, biologicals and medical devices","reportTypes":"Safety alerts and advisories; recalls, product alerts, product corrections with hazard class","years":"DRAC: actions since 1 July 2012"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"DRAC search by product, ingredient, ARTG number, date and action type (needs JavaScript)."},"reuse":{"status":"conditions","note":"TGA states copyright restrictions apply to DRAC; see the TGA website copyright page."},"limitations":"TGA says an alert doesn't always mean the product is unsafe, and does not guarantee DRAC is complete or current. Actions appear two days after the decision.","url":"https://www.tga.gov.au/safety/safety-monitoring-and-information/safety-alerts","links":[{"label":"DRAC recall search","url":"https://apps.tga.gov.au/PROD/SARA/arn-report.aspx"}],"sourceId":"tga-safety-alerts","keywords":["recall","SARA","DRAC"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"who-medical-product-alerts","name":"WHO Medical Product Alerts","organization":"World Health Organization","categories":["safety_comms"],"specialties":["vaccines"],"countries":["INT"],"products":["medicine","vaccine","device"],"purpose":"Has WHO warned about a falsified or substandard medicine, vaccine or diagnostic?","coverage":{"countries":"Worldwide (alerts name the affected countries)","products":"Medicines, vaccines and in vitro diagnostics","reportTypes":"Medical Product Alerts on substandard and falsified products; information notices","years":"2013 to date"},"access":{"publicAccess":"open","search":false,"download":"no","api":"no","note":"Dated web list linking to each alert."},"reuse":{"status":"conditions","note":"WHO website terms of use apply (acknowledge WHO; no commercial use without permission)."},"limitations":"Covers alerts WHO received and confirmed; absence of an alert does not mean a product is genuine.","url":"https://www.who.int/teams/regulation-prequalification/incidents-and-SF/full-list-of-who-medical-product-alerts","links":[],"sourceId":null,"keywords":["falsified","counterfeit","substandard"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"tga-artg","name":"Australian Register of Therapeutic Goods (ARTG) search","organization":"Therapeutic Goods Administration (Australia)","categories":["labels"],"specialties":["devices"],"countries":["AU"],"products":["medicine","vaccine","device"],"purpose":"Can a medicine, biological or device be supplied in Australia, and what are its Product Information and Consumer Medicine Information?","coverage":{"countries":"Australia","products":"Medicines, medical devices and biologicals","reportTypes":"ARTG entries with sponsor and manufacturer, PI and CMI documents","years":"Entries published 1991 to date"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Search by name, ID or sponsor; a visualisation tool offers advanced search."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"TGA notes not all CMI and PI documents are available.","url":"https://www.tga.gov.au/resources/artg","links":[],"sourceId":null,"keywords":["ARTG","PI","CMI"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"dailymed","name":"DailyMed","organization":"US National Library of Medicine (NIH)","categories":["labels"],"specialties":[],"countries":["US"],"products":["medicine","vaccine","device"],"purpose":"What does the current US label (prescribing information, patient labeling, carton) say?","coverage":{"countries":"United States","products":"Prescription and biological drugs, nonprescription drugs, certain medical devices, medical gases, animal drugs","reportTypes":"Structured Product Labeling (SPL) as submitted to FDA","years":"Current labeling in use; daily, weekly and monthly update files"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"open","note":"Full and incremental SPL zip downloads; REST web services (JSON or XML), no registration stated."},"reuse":{"status":"unknown","note":"Not stated on the pages checked; see the NLM copyright page."},"limitations":"NLM says 'in use' labeling may not match the most recent FDA-approved labeling in Drugs@FDA, and NLM does not review SPL content before publication.","url":"https://dailymed.nlm.nih.gov/dailymed/","links":[{"label":"Download all labels","url":"https://dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm"},{"label":"Web services","url":"https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm"}],"sourceId":null,"keywords":["SPL","label","prescribing information","package insert"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"drugs-at-fda","name":"Drugs@FDA","organization":"US Food and Drug Administration (CDER)","categories":["labels"],"specialties":[],"countries":["US"],"products":["medicine"],"purpose":"When was a drug approved in the US, and what labeling and reviews did FDA approve?","coverage":{"countries":"United States","products":"Drugs and CDER-regulated biologics approved for human use (not CBER products such as vaccines and blood products)","reportTypes":"Approval history, approved labeling, FDA reviews, monthly approval reports","years":"Historical approvals; data file updated each weekday"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Drugs@FDA data file: zip of tab-delimited tables, updated Monday to Friday."},"reuse":{"status":"unknown","note":"Not stated on the pages checked."},"limitations":"Excludes CBER-regulated products (vaccines, blood products, cell and gene therapies).","url":"https://www.accessdata.fda.gov/scripts/cder/daf/","links":[{"label":"Data files","url":"https://www.fda.gov/drugs/drug-approvals-and-databases/drugsfda-data-files"}],"sourceId":null,"keywords":["approval","NDA","BLA","label"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"ema-medicines","name":"EMA medicines (EPARs and product information) and medicine data tables","organization":"European Medicines Agency","categories":["labels"],"specialties":[],"countries":["EU"],"products":["medicine","vaccine"],"purpose":"What is the current EU product information and assessment history for a centrally authorised medicine?","coverage":{"countries":"EU and EEA","products":"Centrally authorised human and veterinary medicines; herbal products","reportTypes":"EPARs, product information, post-authorisation procedures, referrals, PSUSAs, DHPCs, shortages","years":"Not stated"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Excel tables updated overnight, and JSON data files for the website."},"reuse":{"status":"unknown","note":"Not stated on the pages checked."},"limitations":"Only medicines evaluated by EMA; nationally authorised medicines are in national registers.","url":"https://www.ema.europa.eu/en/medicines","links":[{"label":"Download medicine data","url":"https://www.ema.europa.eu/en/medicines/download-medicine-data"}],"sourceId":null,"keywords":["EPAR","SmPC","product information","PSUSA"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"health-canada-dpd","name":"Health Canada Drug Product Database (DPD)","organization":"Health Canada","categories":["labels"],"specialties":[],"countries":["CA"],"products":["medicine","vaccine"],"purpose":"Is a drug approved or marketed in Canada, and what is its product monograph?","coverage":{"countries":"Canada","products":"Human pharmaceutical and biological drugs, veterinary drugs, radiopharmaceuticals, disinfectants (about 47,000 products)","reportTypes":"Product details, status, product monographs","years":"Approved, marketed, dormant and cancelled products"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"open","note":"Data extracts and a JSON/XML API; updated nightly."},"reuse":{"status":"conditions","note":"No licence stated on the pages checked; Canada.ca terms and conditions apply."},"limitations":"Health Canada does not provide medical advice through the database; some product types may appear with a delay.","url":"https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/drug-product-database.html","links":[{"label":"API guide","url":"https://health-products.canada.ca/api/documentation/dpd-documentation-en.html"},{"label":"Search","url":"https://health-products.canada.ca/dpd-bdpp/index-eng.jsp"}],"sourceId":null,"keywords":["DPD","product monograph","DIN"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"livertox","name":"LiverTox","organization":"National Institute of Diabetes and Digestive and Kidney Diseases (NIH), on NCBI Bookshelf","categories":["labels","literature"],"specialties":[],"countries":["INT"],"products":["medicine"],"purpose":"How often and how does a drug or supplement cause liver injury, and how is it managed?","coverage":{"countries":"Not country-specific","products":"Prescription and nonprescription drugs, selected herbal and dietary supplements","reportTypes":"Drug records on liver injury with references and case reports","years":"2012 to date, records updated individually"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Free on NCBI Bookshelf."},"reuse":{"status":"open","note":"LiverTox is copyright free; acknowledgement is requested when used in publications."},"limitations":"A clinical reference summarising literature, not a reporting database; check each record's update date.","url":"https://www.ncbi.nlm.nih.gov/books/NBK547852/","links":[],"sourceId":null,"keywords":["DILI","hepatotoxicity","liver injury"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"mhra-products","name":"MHRA Products (SPCs, leaflets and assessment reports)","organization":"Medicines and Healthcare products Regulatory Agency (UK)","categories":["labels"],"specialties":[],"countries":["GB"],"products":["medicine"],"purpose":"What do the UK SPC and patient leaflet for a medicine currently say?","coverage":{"countries":"United Kingdom","products":"Medicines","reportTypes":"Summaries of Product Characteristics, patient information leaflets, Public Assessment Reports","years":"PARs for authorisations granted after 30 October 2005"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Search by name or PL number; A to Z by substance."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"Documents follow each product's licence history; check the date on each document.","url":"https://products.mhra.gov.uk/","links":[],"sourceId":null,"keywords":["SPC","SmPC","PIL","PAR"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"pmda-package-inserts","name":"PMDA prescription drug package insert search","organization":"Pharmaceuticals and Medical Devices Agency (Japan)","categories":["labels"],"specialties":[],"countries":["JP"],"products":["medicine"],"purpose":"What does the current Japanese package insert, RMP or interview form say for a drug?","coverage":{"countries":"Japan","products":"Prescription drugs","reportTypes":"Package inserts, patient drug guides, interview forms, RMPs, review reports, safety bulletins, DSU","years":"Current documents"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Search by name, therapeutic class or any package-insert section, including adverse reactions."},"reuse":{"status":"permission","note":"Copyright PMDA, All Rights Reserved; no reuse licence stated."},"limitations":"In Japanese. Only products whose package inserts are published can be found.","url":"https://www.pmda.go.jp/PmdaSearch/iyakuSearch/","links":[],"sourceId":null,"keywords":["添付文書","package insert","Japan","RMP","interview form"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"union-register","name":"Union Register of medicinal products","organization":"European Commission (DG Health and Food Safety)","categories":["labels"],"specialties":[],"countries":["EU"],"products":["medicine","vaccine"],"purpose":"What is the legal EU marketing authorisation status of a centrally authorised medicine, including withdrawals and suspensions?","coverage":{"countries":"EU","products":"Centrally authorised human and veterinary medicines, orphan medicines, referrals","reportTypes":"Commission decisions and annexes; refused, withdrawn, suspended products","years":"Not stated; variations not affecting the decision not shown since 1 April 2011"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"Browse listings; medicinal products dataset in JSON; RSS. Marked BETA."},"reuse":{"status":"open","note":"Licence: Creative Commons Attribution 4.0 International."},"limitations":"Shows Commission decisions, not the latest product information text; some variations are no longer reflected.","url":"https://ec.europa.eu/health/documents/community-register/html/index_en.htm","links":[{"label":"Products dataset (JSON)","url":"https://ec.europa.eu/health/documents/community-register/ods/ods_products.json"}],"sourceId":null,"keywords":["Community Register","marketing authorisation"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"ctis","name":"Clinical Trials Information System (CTIS) public portal","organization":"European Medicines Agency with EU/EEA Member States and the European Commission","categories":["trials"],"specialties":[],"countries":["EU"],"products":["medicine","vaccine"],"purpose":"What EU trials are running under the Clinical Trials Regulation, and what has been published about them?","coverage":{"countries":"EU and EEA (up to 30 countries)","products":"Medicines","reportTypes":"Trial records under the Clinical Trials Regulation","years":"Trials from 31 January 2022"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Public search and trial map; sponsor workspaces need login."},"reuse":{"status":"unknown","note":"Not stated on the pages checked."},"limitations":"EMA says the site holds limited information that will grow over time; some details may be deferred to protect commercial interests or personal data.","url":"https://euclinicaltrials.eu/","links":[],"sourceId":null,"keywords":["CTR","EU trials"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"ctri","name":"Clinical Trials Registry - India (CTRI)","organization":"ICMR National Institute for Research in Digital Health (India)","categories":["trials"],"specialties":[],"countries":["IN"],"products":["medicine","vaccine","device"],"purpose":"What trials, BA/BE and post-marketing studies are registered in India?","coverage":{"countries":"India (and some countries without a primary registry)","products":"Any health intervention","reportTypes":"Trial registrations including post-marketing surveillance and BA/BE studies","years":"Since 20 July 2007; mandatory since 15 June 2009"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Trial and advanced search; sign-in only for registrants."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"Results and adverse events are not described on the registry page.","url":"https://ctri.nic.in/","links":[],"sourceId":null,"keywords":["CTRI","India trial"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"clinicaltrials-gov","name":"ClinicalTrials.gov","organization":"US National Library of Medicine (NIH)","categories":["trials"],"specialties":[],"countries":["US","INT"],"products":["medicine","vaccine","device"],"purpose":"What were the results and adverse events of a registered trial?","coverage":{"countries":"Worldwide","products":"Any intervention","reportTypes":"Registrations and results","years":"Not yet checked"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"open","note":"Not yet checked."},"reuse":{"status":"unknown","note":"Not yet checked."},"limitations":"Not yet checked: the site renders with JavaScript; only its API version endpoint was confirmed to answer without a key.","url":"https://clinicaltrials.gov/","links":[],"sourceId":null,"keywords":["CT.gov","NCT","trial results"],"status":"draft","verifiedOn":null,"verifiedMethod":null},
{"id":"eu-clinical-trials-register","name":"EU Clinical Trials Register (EudraCT)","organization":"European Medicines Agency with EU/EEA national competent authorities","categories":["trials"],"specialties":[],"countries":["EU"],"products":["medicine","vaccine"],"purpose":"What were the results and adverse events of an EU trial of a medicine started under the old Clinical Trials Directive?","coverage":{"countries":"EU and EEA, plus paediatric investigation plan trials outside the EU","products":"Medicines (interventional trials only; not device or surgical trials)","reportTypes":"Protocols and summary results, including adverse events","years":"Trials started after 1 May 2004; newer trials are in CTIS"},"access":{"publicAccess":"open","search":true,"download":"partial","api":"no","note":"Download up to 20 results per request as a text file."},"reuse":{"status":"conditions","note":"Attribute 'EU Clinical Trials Register' and show the date accessed; contact emails may not be used for marketing."},"limitations":"EMA says data entered between 2004 and March 2011 is historical and may be incomplete or inconsistent, and records may not show the current protocol status.","url":"https://www.clinicaltrialsregister.eu/","links":[{"label":"Legal notice","url":"https://www.clinicaltrialsregister.eu/disclaimer.html"}],"sourceId":null,"keywords":["EudraCT","trial results"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"isrctn","name":"ISRCTN registry","organization":"ISRCTN (operated by BioMed Central)","categories":["trials"],"specialties":[],"countries":["GB","INT"],"products":["medicine","vaccine","device"],"purpose":"What studies with UK participants are registered, and what results have they posted?","coverage":{"countries":"Studies involving UK participants, plus others","products":"Any health intervention","reportTypes":"Interventional and non-interventional study records, protocols, results, IPD sharing plans","years":"Since 2000"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"All records free to search; data can be downloaded for analysis."},"reuse":{"status":"conditions","note":"Some fields are CC BY and newer metadata CC0, but the terms also restrict copying into databases. Check the terms before bulk reuse."},"limitations":"Content is provided by trialists and sponsors and may be out of date.","url":"https://www.isrctn.com/","links":[{"label":"Terms","url":"https://www.isrctn.com/page/terms"}],"sourceId":null,"keywords":["trial registry","UK trials"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"jrct","name":"Japan Registry of Clinical Trials (jRCT)","organization":"Ministry of Health, Labour and Welfare (Japan)","categories":["trials"],"specialties":[],"countries":["JP"],"products":["medicine","device"],"purpose":"What clinical research and trials are registered in Japan?","coverage":{"countries":"Japan (some overseas sites)","products":"Specified clinical research, other clinical research, clinical trials (chiken), regenerative medicine","reportTypes":"Registered research plans published to WHO requirements","years":"Not stated"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Keyword and detailed search; English pages available. The address moved to jrct.mhlw.go.jp in March 2025."},"reuse":{"status":"conditions","note":"jRCT asks users not to collect data in bulk beyond personal use, including by automated means; see its terms of use."},"limitations":"Mostly in Japanese; results and adverse events are not described on the top page.","url":"https://jrct.mhlw.go.jp/","links":[],"sourceId":null,"keywords":["jRCT","Japan trial","chiken"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"who-ictrp","name":"WHO International Clinical Trials Registry Platform (ICTRP)","organization":"World Health Organization","categories":["trials"],"specialties":[],"countries":["INT"],"products":["medicine","vaccine","device"],"purpose":"Is a trial registered anywhere in the world, across national registries?","coverage":{"countries":"Worldwide (records from WHO primary registries)","products":"Any intervention","reportTypes":"Trial registrations using the WHO 24-item data set","years":"Not stated"},"access":{"publicAccess":"open","search":true,"download":"partial","api":"key","note":"Search portal at trialsearch.who.int; full downloads and the API web service need a request to WHO."},"reuse":{"status":"conditions","note":"WHO terms of use: acknowledge WHO; no sale or commercial use without permission."},"limitations":"ICTRP is not a registry itself; records come from primary registries and WHO does not warrant completeness.","url":"https://www.who.int/tools/clinical-trials-registry-platform","links":[{"label":"Search portal","url":"https://trialsearch.who.int/"}],"sourceId":null,"keywords":["ICTRP","trial search"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"cochrane-library","name":"Cochrane Library","organization":"Cochrane (published by Wiley)","categories":["literature"],"specialties":[],"countries":["INT"],"products":["medicine","vaccine","device"],"purpose":"What do systematic reviews conclude about the harms and benefits of an intervention?","coverage":{"countries":"Worldwide","products":"All healthcare interventions","reportTypes":"Cochrane systematic reviews (CDSR), CENTRAL trial records, Cochrane Clinical Answers","years":"Not stated"},"access":{"publicAccess":"partial","search":true,"download":"unknown","api":"unknown","note":"Full-text access terms could not be confirmed during the check."},"reuse":{"status":"permission","note":"Published by Wiley; reuse generally needs permission."},"limitations":"Reviews may be out of date; harms are often less fully reported than benefits in the trials reviewed.","url":"https://www.cochranelibrary.com/","links":[],"sourceId":null,"keywords":["systematic review","CENTRAL"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"europe-pmc","name":"Europe PMC","organization":"EMBL-EBI with funders of Europe PMC","categories":["literature"],"specialties":[],"countries":["INT"],"products":["medicine","vaccine","device"],"purpose":"Where can I search abstracts and open-access full text of safety literature, including preprints?","coverage":{"countries":"Worldwide literature","products":"All","reportTypes":"Abstracts, full-text open access articles, preprints","years":"Not yet checked"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"open","note":"Not yet checked."},"reuse":{"status":"unknown","note":"Not yet checked; depends on each article's licence."},"limitations":"Not yet checked: the website could not be read; only its REST API was confirmed to answer without a key.","url":"https://europepmc.org/","links":[{"label":"REST API","url":"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=pharmacovigilance&format=json"}],"sourceId":null,"keywords":["Europe PMC","full text","preprint"],"status":"draft","verifiedOn":null,"verifiedMethod":null},
{"id":"fda-sentinel","name":"FDA Sentinel Initiative","organization":"US Food and Drug Administration (Sentinel Coordinating Center)","categories":["literature"],"specialties":[],"countries":["US"],"products":["medicine","vaccine"],"purpose":"Has FDA studied a safety question in US healthcare data, and what did it find?","coverage":{"countries":"United States","products":"FDA-regulated medical products","reportTypes":"Analyses, assessments and publications from claims and electronic health record data","years":"Since 2008"},"access":{"publicAccess":"partial","search":true,"download":"no","api":"no","note":"Analyses and reports are public; the underlying data stays with data partners and is not publicly available."},"reuse":{"status":"unknown","note":"Not stated on the pages checked."},"limitations":"FDA says querying a product in Sentinel does not necessarily mean there is a safety issue.","url":"https://www.sentinelinitiative.org/","links":[],"sourceId":null,"keywords":["Sentinel","real-world data","claims"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"hma-ema-rwd-catalogues","name":"HMA-EMA Catalogues of real-world data sources and studies","organization":"Heads of Medicines Agencies and European Medicines Agency","categories":["literature"],"specialties":[],"countries":["EU","INT"],"products":["medicine","vaccine"],"purpose":"Which post-authorisation and real-world studies exist for a medicine, and which data sources could answer a safety question?","coverage":{"countries":"Worldwide, mostly Europe","products":"Medicines","reportTypes":"Study and data source metadata, protocols and study reports (replaced the EU PAS Register in 2024)","years":"Includes records migrated from the EU PAS Register"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Searchable; records can be exported."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"The completeness score measures metadata only, not the quality of the data source.","url":"https://catalogues.ema.europa.eu/","links":[],"sourceId":null,"keywords":["EU PAS Register","ENCePP","PASS","RWD"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"pubmed","name":"PubMed and NCBI E-utilities","organization":"National Center for Biotechnology Information, US National Library of Medicine","categories":["literature"],"specialties":[],"countries":["INT"],"products":["medicine","vaccine","device"],"purpose":"Which published studies and case reports exist on a safety question?","coverage":{"countries":"Worldwide literature","products":"All","reportTypes":"Over 40 million citations and abstracts (MEDLINE, PubMed Central, Bookshelf); not full text","years":"Online since 1996, with older citations"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"open","note":"Free search; E-utilities API for programmatic access."},"reuse":{"status":"conditions","note":"The E-utilities manual is public domain; abstracts may be copyrighted by publishers. Follow NCBI usage guidelines."},"limitations":"Citations and abstracts only; publication bias and indexing delays apply.","url":"https://pubmed.ncbi.nlm.nih.gov/","links":[{"label":"E-utilities API","url":"https://www.ncbi.nlm.nih.gov/books/NBK25501/"}],"sourceId":null,"keywords":["MEDLINE","literature search","case report"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"accessgudid","name":"AccessGUDID (Global Unique Device Identification Database)","organization":"US National Library of Medicine with FDA","categories":["specialist","labels"],"specialties":["devices"],"countries":["US"],"products":["device"],"purpose":"What device is behind a UDI, and what are its identification details?","coverage":{"countries":"Devices sold in the United States","products":"Medical devices with Unique Device Identifiers (about 5.2 million device identifiers)","reportTypes":"Device identification records","years":"Daily, weekly, monthly and full releases"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"open","note":"Full and update downloads, RSS and REST APIs."},"reuse":{"status":"unknown","note":"See the AccessGUDID terms of use (not checked)."},"limitations":"Identification data only, not safety reports; link to MAUDE or recalls by device identifier.","url":"https://accessgudid.nlm.nih.gov/","links":[{"label":"Downloads","url":"https://accessgudid.nlm.nih.gov/download"},{"label":"APIs","url":"https://accessgudid.nlm.nih.gov/resources/home"}],"sourceId":null,"keywords":["UDI","GUDID"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"brighton-collaboration","name":"Brighton Collaboration case definitions","organization":"Brighton Collaboration (a programme of The Task Force for Global Health)","categories":["specialist"],"specialties":["vaccines"],"countries":["INT"],"products":["vaccine"],"purpose":"How should an adverse event following immunisation be defined and classified for a case assessment or study?","coverage":{"countries":"Worldwide","products":"Vaccines","reportTypes":"AEFI case definitions with companion guides, benefit-risk templates","years":"Not stated"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"Case definitions and companion guides as PDFs."},"reuse":{"status":"permission","note":"Site states all rights reserved; check the disclaimer before reuse."},"limitations":"Some items are drafts open for comment; use the published version.","url":"https://brightoncollaboration.org/","links":[],"sourceId":null,"keywords":["case definition","AEFI","Brighton"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"lactmed","name":"Drugs and Lactation Database (LactMed)","organization":"US National Library of Medicine (NIH), on NCBI Bookshelf","categories":["specialist"],"specialties":["pregnancy"],"countries":["INT"],"products":["medicine"],"purpose":"Is a medicine compatible with breastfeeding, and what is known about levels in breast milk?","coverage":{"countries":"Not country-specific","products":"Drugs and other chemicals","reportTypes":"Referenced summaries of drug levels in milk and effects on infants","years":"Not yet checked"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Not yet checked."},"reuse":{"status":"unknown","note":"Not yet checked."},"limitations":"Not yet checked: the page could not be read during the automated check.","url":"https://www.ncbi.nlm.nih.gov/books/NBK501922/","links":[],"sourceId":null,"keywords":["lactation","breastfeeding"],"status":"draft","verifiedOn":null,"verifiedMethod":null},
{"id":"eudamed","name":"EUDAMED (European Database on Medical Devices)","organization":"European Commission (DG Health and Food Safety)","categories":["specialist","labels"],"specialties":["devices"],"countries":["EU"],"products":["device"],"purpose":"Which devices, manufacturers and certificates are registered in the EU?","coverage":{"countries":"European Union","products":"Medical devices and in vitro diagnostics under Regulations 2017/745 and 2017/746","reportTypes":"Actor registration, UDI and device registration, notified bodies and certificates, market surveillance (mandatory since 28 May 2026)","years":"Not stated"},"access":{"publicAccess":"partial","search":true,"download":"no","api":"no","note":"A public site and a restricted site; vigilance and clinical investigation modules are not yet available."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"Vigilance data (incidents, field safety corrective actions) is not yet public in EUDAMED.","url":"https://health.ec.europa.eu/medical-devices-eudamed/overview_en","links":[{"label":"EUDAMED public site","url":"https://ec.europa.eu/tools/eudamed"}],"sourceId":null,"keywords":["EUDAMED","MDR","IVDR","UDI"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-pregnancy-registries","name":"FDA list of pregnancy exposure registries","organization":"US Food and Drug Administration (Office of Women's Health)","categories":["specialist"],"specialties":["pregnancy"],"countries":["US"],"products":["medicine","vaccine"],"purpose":"Is there a pregnancy exposure registry for a medicine or vaccine, and whom do I contact?","coverage":{"countries":"Mostly United States and North America","products":"Medicines and vaccines","reportTypes":"Registry names, conditions, sponsors and contacts (no results)","years":"Current list"},"access":{"publicAccess":"open","search":false,"download":"no","api":"no","note":"Web list with contact details for each registry."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"FDA says the list may not be comprehensive, FDA does not run the registries and does not endorse them.","url":"https://www.fda.gov/science-research/womens-health-research/list-pregnancy-exposure-registries","links":[],"sourceId":null,"keywords":["pregnancy registry","teratogen"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-device-recalls","name":"FDA Medical Device Recalls database","organization":"US Food and Drug Administration (CDRH)","categories":["specialist","safety_comms"],"specialties":["devices"],"countries":["US"],"products":["device"],"purpose":"Has a medical device been recalled in the US, and what recall class was it given?","coverage":{"countries":"United States","products":"Medical devices, including in vitro diagnostics","reportTypes":"Classified recalls; firm-initiated corrections and removals since January 2017","years":"Recalls classified since November 2002"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Search by product, code, class, date, firm or reason. Device recalls are also in openFDA."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"FDA notes the posting date is when FDA classified the recall, which may be after the firm told customers.","url":"https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm","links":[],"sourceId":null,"keywords":["device recall","class I recall"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-medication-errors","name":"FDA medication errors related to CDER-regulated drugs","organization":"US Food and Drug Administration (CDER)","categories":["specialist"],"specialties":["med_errors"],"countries":["US"],"products":["medicine"],"purpose":"How does FDA handle medication errors, and what has it published to prevent them?","coverage":{"countries":"United States","products":"Prescription, OTC, generic and biosimilar drugs regulated by CDER","reportTypes":"Program description, Drug Safety Communications and articles on errors, guidance","years":"Not stated"},"access":{"publicAccess":"open","search":false,"download":"no","api":"no","note":"Information page; error reports themselves are in FAERS."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"Not a database. Reporting medication errors to FAERS is voluntary in the US.","url":"https://www.fda.gov/drugs/drug-safety-and-availability/medication-errors-related-cder-regulated-drug-products","links":[],"sourceId":null,"keywords":["medication error","DMEPA"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"fda-tplc","name":"FDA Total Product Life Cycle (TPLC) database","organization":"US Food and Drug Administration (CDRH)","categories":["specialist"],"specialties":["devices"],"countries":["US"],"products":["device"],"purpose":"What is the whole premarket and postmarket picture for a device type: clearances, adverse events and recalls?","coverage":{"countries":"United States","products":"Medical devices by product code","reportTypes":"Product codes, PMAs, 510(k)s, MAUDE reports and recalls combined","years":"2011 to date in the year filter"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Search by product code, regulation number and year."},"reuse":{"status":"unknown","note":"Not stated on the page checked."},"limitations":"Summaries by product code rather than individual devices; MAUDE cautions apply to the event counts.","url":"https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfTPLC/tplc.cfm","links":[],"sourceId":null,"keywords":["TPLC","510(k)","PMA"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"health-canada-mdall","name":"Health Canada Medical Devices Active Licence Listing (MDALL)","organization":"Health Canada (Medical Devices Bureau)","categories":["specialist","labels"],"specialties":["devices"],"countries":["CA"],"products":["device"],"purpose":"Is a Class II, III or IV medical device licensed for sale in Canada?","coverage":{"countries":"Canada","products":"Licensed Class II, III and IV medical devices (not Class I)","reportTypes":"Active licences","years":"Current"},"access":{"publicAccess":"open","search":true,"download":"no","api":"no","note":"Online query by company, licence, device name or identifier."},"reuse":{"status":"conditions","note":"Canada.ca terms and conditions apply."},"limitations":"Class I devices and devices under investigational testing or special access are not listed.","url":"https://www.canada.ca/en/health-canada/services/drugs-health-products/medical-devices/licences/medical-devices-active-licence-listing.html","links":[{"label":"Search","url":"https://health-products.canada.ca/devices-search"}],"sourceId":null,"keywords":["MDALL","device licence"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"ismp","name":"Institute for Safe Medication Practices (ISMP, part of ECRI)","organization":"ISMP, part of ECRI","categories":["specialist"],"specialties":["med_errors"],"countries":["US"],"products":["medicine"],"purpose":"What medication error alerts, lists and tools exist for safe medication practice?","coverage":{"countries":"United States","products":"Medicines","reportTypes":"Newsletters, alerts, error-prone lists and tools; error reporting","years":"Not stated"},"access":{"publicAccess":"partial","search":false,"download":"no","api":"no","note":"Newsletters and the resource library come with a paid membership; error reporting is open."},"reuse":{"status":"permission","note":"Copyright ECRI; see ECRI terms of service."},"limitations":"Much content is behind a subscription; it is not a regulator.","url":"https://home.ecri.org/pages/ismp","links":[],"sourceId":null,"keywords":["ISMP","medication error","ECRI"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"ismp-canada","name":"ISMP Canada safety bulletins","organization":"Institute for Safe Medication Practices Canada","categories":["specialist"],"specialties":["med_errors"],"countries":["CA"],"products":["medicine"],"purpose":"What medication incidents and lessons have been shared in Canada?","coverage":{"countries":"Canada","products":"Medicines","reportTypes":"Safety bulletins and newsletters; incident reporting programmes (part of CMIRPS)","years":"Bulletins through the 2026 volume"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"Free bulletins and newsletters with no account required."},"reuse":{"status":"permission","note":"Copyright ISMP Canada, all rights reserved."},"limitations":"Bulletins describe selected incidents for learning; they are not incidence data.","url":"https://ismpcanada.ca/","links":[{"label":"Safety bulletins","url":"https://ismpcanada.ca/safety-bulletins/"}],"sourceId":null,"keywords":["ISMP Canada","CMIRPS","medication incident"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"mothertobaby","name":"MotherToBaby fact sheets","organization":"Organization of Teratology Information Specialists (OTIS)","categories":["specialist"],"specialties":["pregnancy","vaccines"],"countries":["US","CA"],"products":["medicine","vaccine"],"purpose":"What is known about a medication or vaccine during pregnancy and breastfeeding, in plain language?","coverage":{"countries":"United States and Canada","products":"Medications, vaccines, substances and other exposures (275+)","reportTypes":"Fact sheets in English and Spanish","years":"Current"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Fact sheets as web pages and PDFs; free information service by phone, chat and email."},"reuse":{"status":"conditions","note":"Fact sheets may be copied for noncommercial use without changes and with the OTIS/MTB copyright notice."},"limitations":"General information, not a substitute for clinical advice; OTIS says content may not be peer reviewed.","url":"https://mothertobaby.org/fact-sheets/","links":[],"sourceId":null,"keywords":["pregnancy","breastfeeding","OTIS"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"uktis-bumps","name":"UK Teratology Information Service (UKTIS) and Bumps","organization":"UKTIS, commissioned by the UK Health Security Agency","categories":["specialist"],"specialties":["pregnancy","vaccines"],"countries":["GB"],"products":["medicine","vaccine"],"purpose":"What is known about the safety of a medicine or vaccine in pregnancy?","coverage":{"countries":"United Kingdom","products":"Medicines, vaccines, chemical and radiological exposures","reportTypes":"Evidence monographs for professionals; patient leaflets (Bumps)","years":"Current"},"access":{"publicAccess":"open","search":true,"download":"yes","api":"no","note":"Free leaflets and search; professional enquiry line."},"reuse":{"status":"conditions","note":"Free reproduction for education and not-for-profit use within the NHS with acknowledgement; commercial use needs written permission."},"limitations":"Evidence for many medicines is limited; summaries state where data are sparse.","url":"https://uktis.org/","links":[{"label":"Bumps (public site)","url":"https://www.medicinesinpregnancy.org/"}],"sourceId":null,"keywords":["pregnancy","teratology","Bumps"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"cdc-vaccine-safety-datalink","name":"Vaccine Safety Datalink (VSD)","organization":"Centers for Disease Control and Prevention, with US healthcare organisations","categories":["specialist","literature"],"specialties":["vaccines","pregnancy"],"countries":["US"],"products":["vaccine"],"purpose":"Has a vaccine safety question been studied in US electronic health records, and can researchers reanalyse the data?","coverage":{"countries":"United States (13 member sites)","products":"Vaccines, including in pregnancy","reportTypes":"Electronic health record data and published VSD studies","years":"Since 1990"},"access":{"publicAccess":"restricted","search":false,"download":"no","api":"no","note":"Data from published studies of the past 10 years through the NCHS Research Data Center, with a proposal, IRB review, signed agreements and fees."},"reuse":{"status":"conditions","note":"Publications must acknowledge CDC and include the required VSD disclaimer."},"limitations":"Not a public database; access is limited to approved research on final data sets.","url":"https://www.cdc.gov/vaccine-safety-systems/vsd/index.html","links":[{"label":"Data access","url":"https://www.cdc.gov/vaccine-safety-systems/vsd/access-use.html"}],"sourceId":null,"keywords":["VSD","vaccine safety","EHR"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"},
{"id":"who-gacvs","name":"WHO Global Advisory Committee on Vaccine Safety (GACVS)","organization":"World Health Organization","categories":["specialist","safety_comms"],"specialties":["vaccines"],"countries":["INT"],"products":["vaccine"],"purpose":"What has WHO's independent expert committee concluded about a vaccine safety question?","coverage":{"countries":"Worldwide","products":"Vaccines","reportTypes":"Committee statements and meeting reports","years":"Statements from November 2002 to date"},"access":{"publicAccess":"open","search":false,"download":"yes","api":"no","note":"Statements and reports as web pages and PDFs."},"reuse":{"status":"conditions","note":"WHO terms of use and permissions apply."},"limitations":"Expert opinion on selected topics, not a data set; check the date of each statement.","url":"https://www.who.int/groups/global-advisory-committee-on-vaccine-safety","links":[],"sourceId":null,"keywords":["GACVS","vaccine safety statement"],"status":"published","verifiedOn":"2026-10-31","verifiedMethod":"automated"}
]$seed$::jsonb) as r(id text, name text, organization text, categories jsonb, specialties jsonb, countries jsonb, products jsonb, purpose text,
    coverage jsonb, access jsonb, reuse jsonb, limitations text, url text, links jsonb, "sourceId" text, keywords jsonb, status text, "verifiedOn" date, "verifiedMethod" text)
  on conflict (id) do nothing;
  perform set_config('pv.resource_action', '', true);
end $import$;
-- END RESOURCE IMPORT
