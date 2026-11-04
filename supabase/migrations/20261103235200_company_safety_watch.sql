-- Personal watch preferences; selected teams continue using existing membership checks for cases.
create table public.company_safety_watches(
 owner_id uuid not null default auth.uid() references auth.users(id),
 company_id text not null check(company_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
 topic_ids text[] not null default '{}' check(cardinality(topic_ids)<=12 and topic_ids <@ array['liver-injury','qt-prolongation','medication-errors','hypersensitivity','skin-reactions','pregnancy','renal-injury','thrombosis','bleeding','infection','suicidality','pancreatitis']),
 functions text[] not null default '{}' check(cardinality(functions)<=6 and functions <@ array['Labeling / regulatory','Safety science','Case operations','Quality / training','Safety systems / interfaces','Data / reporting']),
 revision integer not null default 1,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,company_id)
);
alter table public.company_safety_watches enable row level security;
revoke all on public.company_safety_watches from public,anon,authenticated,pv_pending;
grant select on public.company_safety_watches to authenticated;
grant insert(company_id,topic_ids,functions) on public.company_safety_watches to authenticated;
grant update(topic_ids,functions) on public.company_safety_watches to authenticated;
create policy "Read own safety watches" on public.company_safety_watches for select to authenticated using(owner_id=(select auth.uid()) and (select auth.jwt()->>'role')='authenticated');
create policy "Create own safety watches" on public.company_safety_watches for insert to authenticated with check(owner_id=(select auth.uid()) and (select auth.jwt()->>'role')='authenticated');
create policy "Edit own safety watches" on public.company_safety_watches for update to authenticated using(owner_id=(select auth.uid()) and (select auth.jwt()->>'role')='authenticated') with check(owner_id=(select auth.uid()) and (select auth.jwt()->>'role')='authenticated');
create function public.company_watch_revision() returns trigger language plpgsql security invoker set search_path='' as $$begin new.revision:=old.revision+1;new.updated_at:=clock_timestamp();return new;end$$;
revoke all on function public.company_watch_revision() from public,anon,authenticated,pv_pending;
create trigger company_watch_revision before update on public.company_safety_watches for each row execute function public.company_watch_revision();

create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','events','company-inbox','changes','account-settings','research','companies','globe','resources','documents','requirements','agencies','archive','about','user-guide','substances','labels','safety-topics','leadership'];
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or v->'version' is distinct from '1'::jsonb or jsonb_typeof(v->'groups') is distinct from 'array' then raise exception 'Invalid navigation layout';end if;
 if jsonb_array_length(v->'groups') not between 1 and 12 then raise exception 'Use between 1 and 12 menu groups';end if;
 for g in select * from jsonb_array_elements(v->'groups') loop
  if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'id') is distinct from 'string' or g->>'id' !~ '^[a-z0-9-]{1,40}$' or g->>'id'=any(gids) or jsonb_typeof(g->'label') is distinct from 'string' or length(trim(g->>'label')) not between 1 and 32 or jsonb_typeof(g->'items') is distinct from 'array' then raise exception 'Invalid group ID, name or item list';end if;
  gids:=array_append(gids,g->>'id');
  if jsonb_array_length(g->'items')>cardinality(known) then raise exception 'Too many items in a group';end if;
  for i in select * from jsonb_array_elements(g->'items') loop
   if jsonb_typeof(i) is distinct from 'object' or not coalesce(i->>'id'=any(known),false) or i->>'id'=any(pages) or jsonb_typeof(i->'label') is distinct from 'string' or length(trim(i->>'label')) not between 1 and 32 or jsonb_typeof(i->'hidden') is distinct from 'boolean' then raise exception 'Invalid, duplicate or unknown page';end if;
   if i->>'id'='index' and (i->>'hidden')::boolean then raise exception 'Updates must stay visible';end if;
   pages:=array_append(pages,i->>'id');
  end loop;
 end loop;
 if not (known <@ (pages || array['user-guide','substances','labels','safety-topics','leadership'])) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
end $$;
revoke all on function public.validate_site_navigation(jsonb) from public,anon,authenticated;
