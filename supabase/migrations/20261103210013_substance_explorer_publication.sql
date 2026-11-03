-- Source-linked substance browser: bounded public files and backward-compatible navigation.
-- Add configurable User Guide navigation, preserving older saved layouts and clients.
create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','events','company-inbox','changes','account-settings','research','companies','globe','resources','documents','requirements','agencies','archive','about','user-guide','substances'];
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
 if not (known <@ (pages || array['user-guide','substances'])) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
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
  if item.key !~ '^(feed\.xml|data/(updates|research|site|status|coverage|resources)\.json|data/sources/registry\.json|data/companies/[a-z0-9][a-z0-9-]{0,79}\.json|data/clinical/[a-z0-9][a-z0-9-]{0,79}\.json|data/substances/(index|shard-[0-3][0-9a-f])\.json)$' or coalesce(item.value->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((item.value->>'bytes')::bigint,0) not between 1 and 16777216 or coalesce((item.value->>'rawBytes')::bigint,0) not between 1 and 67108864 or coalesce((item.value->>'parts')::integer,0) not between 1 and 32 then raise exception 'Invalid runtime file';end if;
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
