-- Rebuild-independent public-data cache. Regulatory evidence and private work are untouched.
create table public.pv_runtime_snapshots(id uuid primary key default gen_random_uuid(),manifest jsonb not null,created_at timestamptz not null default now(),published_at timestamptz);
create table public.pv_runtime_current(key text primary key check(key='site'),snapshot_id uuid not null references public.pv_runtime_snapshots(id),manifest jsonb not null);
create table public.pv_runtime_files(snapshot_id uuid not null references public.pv_runtime_snapshots(id) on delete cascade,path text not null,content text not null,primary key(snapshot_id,path));
create table pv_refresh.runtime_jobs(snapshot_id uuid primary key references public.pv_runtime_snapshots(id) on delete cascade,run_id text not null,lease uuid not null,unique(run_id,lease));
create table pv_refresh.runtime_chunks(snapshot_id uuid not null references public.pv_runtime_snapshots(id) on delete cascade,path text not null,part integer not null,parts integer not null,content text not null,primary key(snapshot_id,path,part));
alter table public.pv_runtime_snapshots enable row level security;
alter table public.pv_runtime_current enable row level security;
alter table public.pv_runtime_files enable row level security;
alter table pv_refresh.runtime_jobs enable row level security;
alter table pv_refresh.runtime_chunks enable row level security;
revoke all on public.pv_runtime_snapshots,public.pv_runtime_current,public.pv_runtime_files from public,anon,authenticated;
revoke all on pv_refresh.runtime_jobs,pv_refresh.runtime_chunks from public,anon,authenticated,service_role;
grant select on public.pv_runtime_snapshots,public.pv_runtime_current,public.pv_runtime_files to anon,authenticated;
create policy "Published runtime metadata" on public.pv_runtime_snapshots for select to anon,authenticated using(published_at is not null);
create policy "Public runtime pointer" on public.pv_runtime_current for select to anon,authenticated using(true);
create policy "Published public files only" on public.pv_runtime_files for select to anon,authenticated using(exists(select 1 from public.pv_runtime_snapshots s where s.id=snapshot_id and s.published_at is not null));
create function pv_refresh.runtime_assert(p_run text,p_lease uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 perform 1 from pv_refresh.pipelines where id='updates' and github_run=p_run and lease=p_lease and lease_until>now() for update;
 if not found then raise exception 'Run lease is no longer current';end if;
end $$;
create function pv_refresh.runtime_begin(p_run text,p_lease uuid,p_manifest jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 insert into public.pv_runtime_snapshots(manifest) values(p_manifest) returning id into s;
 insert into pv_refresh.runtime_jobs(snapshot_id,run_id,lease) values(s,p_run,p_lease);return s;
end $$;
create function pv_refresh.runtime_stage(p_run text,p_lease uuid,p_id uuid,p_path text,p_part integer,p_parts integer,p_content text) returns void language plpgsql security definer set search_path='' as $$
declare m jsonb;old text;
begin
 perform pv_refresh.runtime_assert(p_run,p_lease);
 select s.manifest into m from public.pv_runtime_snapshots s join pv_refresh.runtime_jobs j on j.snapshot_id=s.id where s.id=p_id and j.run_id=p_run and j.lease=p_lease and s.published_at is null for update of s;
 if m is null then raise exception 'Publication unavailable or already published';end if;
 if p_path is null or p_parts is null or not (m->'files') ? p_path or p_parts is distinct from (m->'files'->p_path->>'parts')::integer or p_part is null or p_part<0 or p_part>=p_parts or p_content is null or length(p_content) not between 1 and 1000000 or p_content !~ '^[A-Za-z0-9+/]*={0,2}$' then raise exception 'Invalid runtime chunk';end if;
 select content into old from pv_refresh.runtime_chunks where snapshot_id=p_id and path=p_path and part=p_part;
 if old is not null then if old<>p_content then raise exception 'Chunk changed';end if;return;end if;
 insert into pv_refresh.runtime_chunks values(p_id,p_path,p_part,p_parts,p_content);
end $$;
create function pv_refresh.runtime_commit(p_run text,p_lease uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb;item record;body text;data bytea;n integer;
begin
 perform pv_refresh.runtime_assert(p_run,p_lease);
 select s.manifest into m from public.pv_runtime_snapshots s join pv_refresh.runtime_jobs j on j.snapshot_id=s.id where s.id=p_id and j.run_id=p_run and j.lease=p_lease and s.published_at is null for update of s;
 if m is null then raise exception 'Publication unavailable or already published';end if;
 for item in select * from jsonb_each(m->'files') loop
  select count(*),string_agg(content,'' order by part) into n,body from pv_refresh.runtime_chunks where snapshot_id=p_id and path=item.key;
  if n<>(item.value->>'parts')::integer then raise exception 'Runtime publication incomplete';end if;
  data:=decode(body,'base64');
  if octet_length(data)<>(item.value->>'bytes')::integer or encode(extensions.digest(data,'sha256'),'hex')<>item.value->>'sha256' then raise exception 'Runtime file integrity mismatch';end if;
  insert into public.pv_runtime_files values(p_id,item.key,body);
 end loop;
 update public.pv_runtime_snapshots set published_at=clock_timestamp() where id=p_id;
 insert into public.pv_runtime_current values('site',p_id,m) on conflict(key) do update set snapshot_id=excluded.snapshot_id,manifest=excluded.manifest;
 delete from pv_refresh.runtime_chunks where snapshot_id=p_id;
 -- Generated caches only: keep three completed snapshots and current pending work.
 delete from public.pv_runtime_snapshots where id<>p_id and ((published_at is not null and id not in (select id from public.pv_runtime_snapshots where published_at is not null order by published_at desc limit 3)) or (published_at is null and created_at<now()-interval '3 hours'));
 return jsonb_build_object('snapshot_id',p_id,'files',(select count(*) from jsonb_object_keys(m->'files')));
end $$;
create function public.refresh_runtime_assert(p_run text,p_lease uuid) returns void language sql security invoker set search_path='' as $$select pv_refresh.runtime_assert(p_run,p_lease)$$;
create function public.refresh_runtime_begin(p_run text,p_lease uuid,p_manifest jsonb) returns uuid language sql security invoker set search_path='' as $$select pv_refresh.runtime_begin(p_run,p_lease,p_manifest)$$;
create function public.refresh_runtime_stage(p_run text,p_lease uuid,p_id uuid,p_path text,p_part integer,p_parts integer,p_content text) returns void language sql security invoker set search_path='' as $$select pv_refresh.runtime_stage(p_run,p_lease,p_id,p_path,p_part,p_parts,p_content)$$;
create function public.refresh_runtime_commit(p_run text,p_lease uuid,p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select pv_refresh.runtime_commit(p_run,p_lease,p_id)$$;
revoke all on function pv_refresh.runtime_assert(text,uuid),pv_refresh.runtime_begin(text,uuid,jsonb),pv_refresh.runtime_stage(text,uuid,uuid,text,integer,integer,text),pv_refresh.runtime_commit(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function pv_refresh.runtime_assert(text,uuid),pv_refresh.runtime_begin(text,uuid,jsonb),pv_refresh.runtime_stage(text,uuid,uuid,text,integer,integer,text),pv_refresh.runtime_commit(text,uuid,uuid) to service_role;
revoke all on function public.refresh_runtime_assert(text,uuid),public.refresh_runtime_begin(text,uuid,jsonb),public.refresh_runtime_stage(text,uuid,uuid,text,integer,integer,text),public.refresh_runtime_commit(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.refresh_runtime_assert(text,uuid),public.refresh_runtime_begin(text,uuid,jsonb),public.refresh_runtime_stage(text,uuid,uuid,text,integer,integer,text),public.refresh_runtime_commit(text,uuid,uuid) to service_role;
-- Preserve the existing admin button API, replacing its deploy-hook side effect.
create or replace function public.admin_publish() returns timestamptz language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Only an admin can do that';end if;
 perform pv_refresh.admin_queue('updates','fresh');perform public.admin_log('data publication requested',null);return now();
end $$;
create or replace function public.admin_publish_status() returns jsonb language sql stable security definer set search_path='' as $$select case when auth.uid() is not null and public.is_app_admin() then jsonb_build_object('hook',true,'mode','runtime-data','lastPublish',(select max(at) from public.admin_events where action='data publication requested')) end$$;
revoke all on function public.admin_publish(),public.admin_publish_status() from public,anon;
grant execute on function public.admin_publish(),public.admin_publish_status() to authenticated;

create or replace function pv_refresh.worker_finish(pipeline text,run_number text,token uuid,result text,counts jsonb,published text) returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 if result not in ('success','partial','failed') or published not in ('requested','not-requested','failed','automatic','staged','published') or jsonb_typeof(counts)<>'object' or octet_length(counts::text)>4000 then raise exception 'Invalid result';end if;
 perform 1 from pv_refresh.pipelines where id=pipeline and lease=token and github_run=run_number and lease_until>now() for update;
 if not found then raise exception 'Run lease is no longer current';end if;
 update pv_refresh.runs set state=result,stats=counts,publication=published,finished_at=now() where id=token and state='running';
 update pv_refresh.pipelines set last_success=case when result='success' then now() else last_success end,lease=null,lease_until=null,github_run=null,next_due=case when result<>'success' and frequency>0 then least(next_due,now()+interval '60 minutes') else next_due end where id=pipeline;
 if pipeline in ('products','clinical') and result in ('success','partial') and published='staged' then
  update pv_refresh.pipelines set queued_at=coalesce(queued_at,now()),mode='fresh' where id='updates' and frequency>0;
 end if;
end $$;
