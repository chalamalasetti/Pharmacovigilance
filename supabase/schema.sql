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
