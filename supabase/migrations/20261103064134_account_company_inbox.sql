-- Account aliases are private preferences, never authorization roles.
create schema if not exists pv_accounts;
revoke all on schema pv_accounts from public,anon,authenticated;
create table public.account_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 login_alias text unique check(login_alias is null or login_alias ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
 professional_role text check(professional_role is null or professional_role in ('Safety operations','Regulatory affairs','Safety science','Quality assurance','Safety systems / IT','Clinical development','Research','Other')),
 updated_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public,anon,authenticated;
grant select,insert,update on public.account_profiles to authenticated;
create policy own_profile_read on public.account_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy own_profile_insert on public.account_profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_profile_update on public.account_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create function pv_accounts.initialize_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare alias text:=lower(trim(new.raw_user_meta_data->>'login_alias')); professional text:=new.raw_user_meta_data->>'professional_role';
begin
 if alias is not null and alias !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then raise exception 'Choose a valid user ID'; end if;
 if professional not in ('Safety operations','Regulatory affairs','Safety science','Quality assurance','Safety systems / IT','Clinical development','Research','Other') then professional:=null; end if;
 insert into public.account_profiles(user_id,login_alias,professional_role) values(new.id,alias,professional);
 return new;
end $$;
revoke all on function pv_accounts.initialize_profile() from public,anon,authenticated;
create trigger pv_account_profile_created after insert on auth.users for each row execute function pv_accounts.initialize_profile();
insert into public.account_profiles(user_id) select id from auth.users on conflict do nothing;
-- Bounded, short-lived hashed alias buckets. No IP addresses or passwords stored.
create table pv_accounts.login_limits(bucket text primary key,window_start timestamptz not null,attempts integer not null);
revoke all on pv_accounts.login_limits from public,anon,authenticated;
create function pv_accounts.resolve_alias(p_alias text) returns jsonb language plpgsql security definer set search_path='' as $$
declare key text; n integer; allowed boolean:=true; address text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server only'; end if;
 if p_alias is null or p_alias !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then return jsonb_build_object('allowed',true,'email',null); end if;
 delete from pv_accounts.login_limits where window_start < now()-interval '16 minutes';
 foreach key in array array['global',md5(p_alias)] loop
 insert into pv_accounts.login_limits as l values(key,now(),1) on conflict(bucket) do update set
 attempts=case when l.window_start < now()-case when key='global' then interval '1 minute' else interval '15 minutes' end then 1 else l.attempts+1 end,
 window_start=case when l.window_start < now()-case when key='global' then interval '1 minute' else interval '15 minutes' end then now() else l.window_start end returning attempts into n;
 if n>(case when key='global' then 120 else 10 end) then allowed:=false;end if;
 end loop;
 if allowed then select u.email into address from public.account_profiles p join auth.users u on u.id=p.user_id where p.login_alias=p_alias;end if;
 return jsonb_build_object('allowed',allowed,'email',address);
end $$;
revoke all on function pv_accounts.resolve_alias(text) from public,anon,authenticated;
grant usage on schema pv_accounts to service_role;
grant execute on function pv_accounts.resolve_alias(text) to service_role;
create function public.resolve_login_alias(p_alias text) returns jsonb language sql security invoker set search_path='' as $$ select pv_accounts.resolve_alias(p_alias) $$;
revoke all on function public.resolve_login_alias(text) from public,anon,authenticated;
grant execute on function public.resolve_login_alias(text) to service_role;
-- Reading markers never act as applicability, triage or approval decisions.
create table public.company_inbox_seen (
 user_id uuid not null references auth.users(id) on delete cascade,
 company_id text not null check(company_id ~ '^[a-z0-9-]{1,100}$'),
 item_key text not null check(length(item_key) between 1 and 350),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 seen_at timestamptz not null default now(),
 primary key(user_id,company_id,item_key)
);
alter table public.company_inbox_seen enable row level security;
revoke all on public.company_inbox_seen from public,anon,authenticated;
grant select,insert,update,delete on public.company_inbox_seen to authenticated;
create policy own_seen on public.company_inbox_seen for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','events','company-inbox','changes','account-settings','research','companies','globe','resources','documents','requirements','agencies','archive','about'];
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or v->'version' is distinct from '1'::jsonb or jsonb_typeof(v->'groups') is distinct from 'array' then raise exception 'Invalid navigation layout';end if;
 if jsonb_array_length(v->'groups') not between 1 and 12 then raise exception 'Use between 1 and 12 menu groups';end if;
 for g in select * from jsonb_array_elements(v->'groups') loop
  if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'id') is distinct from 'string' or g->>'id' !~ '^[a-z0-9-]{1,40}$' or g->>'id'=any(gids) or jsonb_typeof(g->'label') is distinct from 'string' or length(trim(g->>'label')) not between 1 and 32 or jsonb_typeof(g->'items') is distinct from 'array' then raise exception 'Invalid group ID, name or item list';end if;
  gids:=array_append(gids,g->>'id');
  if jsonb_array_length(g->'items')>18 then raise exception 'Too many items in a group';end if;
  for i in select * from jsonb_array_elements(g->'items') loop
   if jsonb_typeof(i) is distinct from 'object' or not coalesce(i->>'id'=any(known),false) or i->>'id'=any(pages) or jsonb_typeof(i->'label') is distinct from 'string' or length(trim(i->>'label')) not between 1 and 32 or jsonb_typeof(i->'hidden') is distinct from 'boolean' then raise exception 'Invalid, duplicate or unknown page';end if;
   if i->>'id'='index' and (i->>'hidden')::boolean then raise exception 'Updates must stay visible';end if;
   pages:=array_append(pages,i->>'id');
  end loop;
 end loop;
 if cardinality(pages)<>cardinality(known) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
end $$;
revoke all on function public.validate_site_navigation(jsonb) from public,anon,authenticated;




notify pgrst,'reload schema';
