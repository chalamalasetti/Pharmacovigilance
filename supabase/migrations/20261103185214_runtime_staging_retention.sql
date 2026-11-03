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
  if item.key !~ '^(feed\.xml|data/(updates|research|site|status|coverage|resources)\.json|data/sources/registry\.json|data/companies/[a-z0-9][a-z0-9-]{0,79}\.json|data/clinical/[a-z0-9][a-z0-9-]{0,79}\.json)$' or coalesce(item.value->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce((item.value->>'bytes')::bigint,0) not between 1 and 16777216 or coalesce((item.value->>'rawBytes')::bigint,0) not between 1 and 67108864 or coalesce((item.value->>'parts')::integer,0) not between 1 and 32 then raise exception 'Invalid runtime file';end if;
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
