-- Twice-daily public updates, with existing owner/admin access and lease protection.
-- Collection publishes data snapshots; this does not trigger an app deployment.
alter table pv_refresh.pipelines drop constraint pipelines_frequency_check;
alter table pv_refresh.pipelines add constraint pipelines_frequency_check check(frequency in (0,60,720,1440,10080));
create or replace function pv_refresh.admin_save(pipeline text,minutes integer,expected integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Administrator access required' using errcode='42501';end if;
 if minutes not in (0,60,720,1440,10080) or (pipeline<>'updates' and minutes in (60,720)) then raise exception 'Choose an available frequency';end if;
 update pv_refresh.pipelines set frequency=minutes,revision=revision+1,next_due=case when minutes=0 then null else now() end,queued_at=case when minutes=0 then null else queued_at end where id=pipeline and revision=expected;
 if not found then raise exception 'Schedule changed elsewhere. Reload before saving.';end if;
 perform public.admin_log('refresh schedule changed',pipeline,jsonb_build_object('minutes',minutes));
end $$;
create or replace function pv_refresh.worker_claim(pipeline text,run_number text,forced boolean) returns jsonb language plpgsql security definer set search_path='' as $$
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
 return jsonb_build_object('run',true,'lease',token,'frequency',p.frequency,'mode',case when p.queued_at is not null then p.mode else 'fresh' end);
end $$;
-- Requested operational setting: queue one initial refresh, then wait 12 hours.
update pv_refresh.pipelines set frequency=720,revision=revision+1,next_due=now(),queued_at=coalesce(queued_at,now()) where id='updates';
