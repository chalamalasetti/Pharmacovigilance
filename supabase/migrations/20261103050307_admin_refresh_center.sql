create schema if not exists pv_refresh;
revoke all on schema pv_refresh from public,anon;
grant usage on schema pv_refresh to authenticated,service_role;
create table pv_refresh.pipelines (
 id text primary key check(id in ('updates','products','clinical')),
 frequency integer not null check(frequency in (0,60,1440,10080)),revision integer not null default 1,
 next_due timestamptz,queued_at timestamptz,mode text not null default 'fresh' check(mode in ('fresh','resume')),
 last_poll timestamptz,last_attempt timestamptz,last_success timestamptz,
 lease uuid,lease_until timestamptz,github_run text
);
create table pv_refresh.runs (
 id uuid primary key,pipeline text not null references pv_refresh.pipelines(id),github_run text not null,
 started_at timestamptz not null default now(),finished_at timestamptz,
 state text not null check(state in ('running','success','partial','failed','interrupted')),
 stats jsonb not null default '{}',publication text not null default 'not-requested'
);
create index refresh_runs_pipeline_time on pv_refresh.runs(pipeline,started_at desc);
alter table pv_refresh.pipelines enable row level security;
alter table pv_refresh.runs enable row level security;
revoke all on pv_refresh.pipelines,pv_refresh.runs from public,anon,authenticated;
insert into pv_refresh.pipelines(id,frequency,next_due) values ('updates',60,now()),('products',10080,now()),('clinical',1440,now());
create function pv_refresh.admin_status() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 return jsonb_build_object('pipelines',(select jsonb_agg(to_jsonb(p)-'lease') from pv_refresh.pipelines p),'runs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select * from pv_refresh.runs order by started_at desc limit 60) r));
end $$;
create function pv_refresh.admin_save(pipeline text,minutes integer,expected integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if minutes not in (0,60,1440,10080) or (pipeline<>'updates' and minutes=60) then raise exception 'Choose an available frequency';end if;
 update pv_refresh.pipelines set frequency=minutes,revision=revision+1,next_due=case when minutes=0 then null else now() end,queued_at=case when minutes=0 then null else queued_at end where id=pipeline and revision=expected;
 if not found then raise exception 'Schedule changed elsewhere. Reload before saving.';end if;
 perform public.admin_log('refresh schedule changed',pipeline,jsonb_build_object('minutes',minutes));
end $$;
create function pv_refresh.admin_queue(pipeline text,requested_mode text) returns void language plpgsql security definer set search_path='' as $$
declare p pv_refresh.pipelines;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if requested_mode not in ('fresh','resume') then raise exception 'Invalid run mode';end if;
 select * into strict p from pv_refresh.pipelines where id=pipeline for update;
 if p.lease_until>now() then raise exception 'This pipeline is already running';end if;
 if p.queued_at is not null then return;end if;
 update pv_refresh.pipelines set queued_at=now(),mode=requested_mode where id=pipeline;
 perform public.admin_log('refresh queued',pipeline,jsonb_build_object('mode',requested_mode));
end $$;
create function pv_refresh.worker_claim(pipeline text,run_number text,forced boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare p pv_refresh.pipelines; token uuid;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 if run_number !~ '^[0-9]{1,30}$' then raise exception 'Invalid run';end if;
 select * into strict p from pv_refresh.pipelines where id=pipeline for update;
 update pv_refresh.pipelines set last_poll=now() where id=pipeline;
 if p.lease_until>now() then return jsonb_build_object('run',false,'reason','already running');end if;
 if p.lease is not null then update pv_refresh.runs set state='interrupted',finished_at=now() where id=p.lease and state='running';end if;
 if not forced and p.queued_at is null and (p.frequency=0 or p.next_due>now()) then return jsonb_build_object('run',false,'reason','not due');end if;
 token:=gen_random_uuid();
 insert into pv_refresh.runs(id,pipeline,github_run,state) values(token,pipeline,run_number,'running');
 update pv_refresh.pipelines set lease=token,lease_until=now()+interval '90 minutes',github_run=run_number,last_attempt=now(),queued_at=null,next_due=case when frequency=0 then null else now()+make_interval(mins=>frequency) end where id=pipeline;
 return jsonb_build_object('run',true,'lease',token,'mode',case when p.queued_at is not null then p.mode else 'fresh' end);
end $$;
create function pv_refresh.worker_finish(pipeline text,run_number text,token uuid,result text,counts jsonb,published text) returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Worker access required' using errcode='42501';end if;
 if result not in ('success','partial','failed') or published not in ('requested','not-requested','failed','automatic') or jsonb_typeof(counts)<>'object' or octet_length(counts::text)>4000 then raise exception 'Invalid result';end if;
 perform 1 from pv_refresh.pipelines where id=pipeline and lease=token and github_run=run_number and lease_until>now() for update;
 if not found then raise exception 'Run lease is no longer current';end if;
 update pv_refresh.runs set state=result,stats=counts,publication=published,finished_at=now() where id=token and state='running';
 update pv_refresh.pipelines set last_success=case when result='success' then now() else last_success end,lease=null,lease_until=null,github_run=null,next_due=case when result<>'success' and frequency>0 then least(next_due,now()+interval '60 minutes') else next_due end where id=pipeline;
end $$;
-- Public RPC wrappers are invokers; privileged bodies live in an unexposed schema.
create function public.admin_refresh_status() returns jsonb language sql security invoker set search_path='' as $$select pv_refresh.admin_status()$$;
create function public.admin_refresh_save(pipeline text,minutes integer,expected integer) returns void language sql security invoker set search_path='' as $$select pv_refresh.admin_save(pipeline,minutes,expected)$$;
create function public.admin_refresh_queue(pipeline text,requested_mode text) returns void language sql security invoker set search_path='' as $$select pv_refresh.admin_queue(pipeline,requested_mode)$$;
create function public.refresh_worker_claim(pipeline text,run_number text,forced boolean default false) returns jsonb language sql security invoker set search_path='' as $$select pv_refresh.worker_claim(pipeline,run_number,forced)$$;
create function public.refresh_worker_finish(pipeline text,run_number text,token uuid,result text,counts jsonb,published text) returns void language sql security invoker set search_path='' as $$select pv_refresh.worker_finish(pipeline,run_number,token,result,counts,published)$$;
revoke all on all functions in schema pv_refresh from public,anon,authenticated,service_role;
grant execute on function pv_refresh.admin_status(),pv_refresh.admin_save(text,integer,integer),pv_refresh.admin_queue(text,text) to authenticated;
grant execute on function pv_refresh.worker_claim(text,text,boolean),pv_refresh.worker_finish(text,text,uuid,text,jsonb,text) to service_role;
revoke all on function public.admin_refresh_status(),public.admin_refresh_save(text,integer,integer),public.admin_refresh_queue(text,text),public.refresh_worker_claim(text,text,boolean),public.refresh_worker_finish(text,text,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_refresh_status(),public.admin_refresh_save(text,integer,integer),public.admin_refresh_queue(text,text) to authenticated;
grant execute on function public.refresh_worker_claim(text,text,boolean),public.refresh_worker_finish(text,text,uuid,text,jsonb,text) to service_role;
