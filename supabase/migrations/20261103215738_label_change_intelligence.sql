-- Public regulatory evidence is append-only; private case permissions remain unchanged.
create schema if not exists pv_labels;
revoke all on schema pv_labels from public,anon,authenticated;
grant usage on schema pv_labels to authenticated;
create table public.pv_label_versions(
 id text not null check(id ~ '^lc-[a-f0-9]{24}$'),
 hash text not null check(hash ~ '^[a-f0-9]{64}$'),
 record jsonb not null check(jsonb_typeof(record)='object' and pg_column_size(record)<100000),
 archived_at timestamptz not null default clock_timestamp(),
 primary key(id,hash)
);
alter table public.pv_label_versions enable row level security;
revoke all on public.pv_label_versions from public,anon,authenticated;
grant select on public.pv_label_versions to anon,authenticated;
grant select,insert on public.pv_label_versions to service_role;
create policy "Public source label evidence" on public.pv_label_versions for select to anon,authenticated using(true);
create function pv_labels.prevent_revision() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Captured label evidence is immutable; publish another version';end$$;
create trigger label_versions_immutable before update or delete on public.pv_label_versions for each row execute function pv_labels.prevent_revision();
revoke all on function pv_labels.prevent_revision() from public,anon,authenticated;
create function public.archive_label_versions(p_records jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare r jsonb;n integer:=0;
begin
 if current_user<>'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>20 then raise exception 'Invalid evidence batch';end if;
 for r in select * from jsonb_array_elements(p_records) loop
  if r->>'id' !~ '^lc-[a-f0-9]{24}$' or r->>'hash' !~ '^[a-f0-9]{64}$' or coalesce(r->>'agency','') not in ('FDA','EMA') or coalesce(r->>'market','') not in ('US','EU') or jsonb_typeof(r->'sections') is distinct from 'array' or jsonb_typeof(r->'ingredients') is distinct from 'array' or coalesce(r->>'url','') !~ '^https://www\.(accessdata\.fda\.gov|ema\.europa\.eu)/' or pg_column_size(r)>95000 then raise exception 'Invalid label source evidence';end if;
  if exists(select 1 from public.pv_label_versions v where v.id=r->>'id' and v.hash=r->>'hash' and v.record<>r) then raise exception 'Evidence fingerprint conflict';end if;
  insert into public.pv_label_versions(id,hash,record) values(r->>'id',r->>'hash',r) on conflict do nothing;n:=n+1;
 end loop;return n;
end$$;
revoke all on function public.archive_label_versions(jsonb) from public,anon,authenticated;
grant execute on function public.archive_label_versions(jsonb) to service_role;
create function pv_labels.open_case(p_id text,p_hash text,p_context jsonb,p_team_id uuid,p_confirm_source boolean) returns public.company_cases language plpgsql security definer set search_path='' as $$
declare r jsonb;ctx jsonb;s jsonb;k text;c public.company_cases;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'role','')<>'authenticated' then raise exception 'Approved sign-in required' using errcode='42501';end if;
 if p_confirm_source is distinct from true then raise exception 'Confirm review of the official source and its limitations';end if;
 select record into r from public.pv_label_versions where id=p_id and hash=p_hash;
 if r is null then raise exception 'Pinned label evidence is awaiting durable publication; retry after the data refresh';end if;
 if coalesce(p_context->>'companyId','') !~ '^[a-z0-9][a-z0-9-]{1,79}$' or coalesce(p_context->>'portfolioConfirmedAt','')='' or jsonb_typeof(p_context->'products') is distinct from 'array' or jsonb_array_length(p_context->'products') not between 1 and 100 or length(trim(coalesce(p_context->>'reason',''))) not between 15 and 1500 then raise exception 'Confirmed company products and assessment rationale required';end if;
 ctx:=p_context||jsonb_build_object('sourceItem','label:'||p_id||':'||p_hash,'evidenceKind','label_change');
 k:='label:'||p_id||':'||p_hash||':'||(ctx->>'companyId');
 s:=jsonb_build_object('id',k,'title',r->>'title','link',r->>'url','source',(r->>'agency')||' label change evidence','published',r->>'published','country',r->>'market','companyContext',ctx);
 if p_team_id is not null then
  if not public.is_team_member(p_team_id) then raise exception 'Team access denied' using errcode='42501';end if;
  -- Do not overwrite a previous team snapshot when reopening the same pinned version.
  insert into public.team_items(team_id,update_id,snapshot) values(p_team_id,k,s) on conflict(team_id,update_id) do nothing;
 end if;
 c:=pv_changes.open_existing_case(k,s,p_team_id);return c;
end$$;
revoke all on function pv_labels.open_case(text,text,jsonb,uuid,boolean) from public,anon;
grant execute on function pv_labels.open_case(text,text,jsonb,uuid,boolean) to authenticated;
create function public.open_label_change_case(p_id text,p_hash text,p_context jsonb,p_team_id uuid default null,p_confirm_source boolean default false) returns public.company_cases language sql security invoker set search_path='' as $$select pv_labels.open_case(p_id,p_hash,p_context,p_team_id,p_confirm_source)$$;
revoke all on function public.open_label_change_case(text,text,jsonb,uuid,boolean) from public,anon;
grant execute on function public.open_label_change_case(text,text,jsonb,uuid,boolean) to authenticated;
-- Use the specialized handoff so caller-supplied snapshots cannot impersonate pinned evidence.
create or replace function pv_changes.open_guard(p_source_key text,p_snapshot jsonb,p_team_id uuid) returns public.company_cases language plpgsql security definer set search_path='' as $$
declare effective jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 if p_team_id is not null then
  if not public.is_team_member(p_team_id) then raise exception 'Team access denied';end if;
  select snapshot into effective from public.team_items where team_id=p_team_id and update_id=p_source_key;
 else effective:=p_snapshot;end if;
 if p_source_key like 'label:%' or effective->'companyContext'->>'sourceItem' like 'label:%' then raise exception 'Review pinned evidence in Label Change Intelligence before opening a label assessment';end if;
 if p_source_key like 'candidate:%' or p_source_key like 'regchange:%' or effective->'companyContext'->>'sourceItem' ~ '^(candidate|regchange):' then raise exception 'Complete human triage in Regulatory Change Review before opening a formal change assessment';end if;
 return pv_changes.open_existing_case(p_source_key,p_snapshot,p_team_id);
end$$;
notify pgrst,'reload schema';

create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','events','company-inbox','changes','account-settings','research','companies','globe','resources','documents','requirements','agencies','archive','about','user-guide','substances','labels'];
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
 if not (known <@ (pages || array['user-guide','substances','labels'])) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
end $$;
revoke all on function public.validate_site_navigation(jsonb) from public,anon,authenticated;




notify pgrst,'reload schema';


-- Bound abandoned generated-cache uploads before allocating the next snapshot.
create or replace function pv_refresh.runtime_begin(p_run text,p_lease uuid,p_manifest jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare item record;bytes bigint:=0;s uuid;old_manifest jsonb;
begin
 perform pv_refresh.runtime_assert(p_run,p_lease);
 if jsonb_typeof(p_manifest) is distinct from 'object' or p_manifest->>'schema' is distinct from '1' or jsonb_typeof(p_manifest->'files') is distinct from 'object' or pg_column_size(p_manifest)>200000 then raise exception 'Invalid runtime manifest';end if;
 if (select count(*) from jsonb_object_keys(p_manifest->'files')) not between 4 and 600 then raise exception 'Invalid runtime file count';end if;
 foreach old_manifest in array array['"data/updates.json"'::jsonb,'"data/status.json"'::jsonb,'"data/site.json"'::jsonb,'"feed.xml"'::jsonb] loop
  if not (p_manifest->'files') ? (old_manifest#>>'{}') then raise exception 'Required runtime file missing';end if;
 end loop;
 for item in select * from jsonb_each(p_manifest->'files') loop
  if item.key !~ '^(feed\.xml|data/(updates|research|site|status|coverage|resources|labels)\.json|data/sources/registry\.json|data/companies/[a-z0-9][a-z0-9-]{0,79}\.json|data/clinical/[a-z0-9][a-z0-9-]{0,79}\.json|data/substances/(index|shard-[0-3][0-9a-f])\.json)$' or coalesce(item.value->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((item.value->>'bytes')::bigint,0) not between 1 and 16777216 or coalesce((item.value->>'rawBytes')::bigint,0) not between 1 and 67108864 or coalesce((item.value->>'parts')::integer,0) not between 1 and 32 then raise exception 'Invalid runtime file';end if;
  bytes:=bytes+(item.value->>'bytes')::bigint;
 end loop;
 if bytes>67108864 then raise exception 'Runtime snapshot exceeds cache budget';end if;
 select j.snapshot_id,ss.manifest into s,old_manifest from pv_refresh.runtime_jobs j join public.pv_runtime_snapshots ss on ss.id=j.snapshot_id where j.run_id=p_run and j.lease=p_lease;
 if s is not null then if old_manifest<>p_manifest then raise exception 'Publication manifest changed';end if;return s;end if;
 -- A previous lease cannot resume. Bound failed staging to the current run only.
 -- Published evidence and the current public pointer are never removed here.
 delete from public.pv_runtime_snapshots ss where ss.published_at is null and not exists(select 1 from pv_refresh.runtime_jobs j where j.snapshot_id=ss.id and j.run_id=p_run and j.lease=p_lease);
 insert into public.pv_runtime_snapshots(manifest) values(p_manifest) returning id into s;
 insert into pv_refresh.runtime_jobs(snapshot_id,run_id,lease) values(s,p_run,p_lease);return s;
end $$;
