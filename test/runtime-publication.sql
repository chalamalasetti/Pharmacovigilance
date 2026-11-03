-- Synthetic assertions only. All rows, leases and public pointer changes roll back.
begin;
do $$
declare c jsonb;s uuid;prior uuid;cur uuid;m jsonb:='{"schema": 1, "files": {"feed.xml": {"sha256": "73a1b438b0221511fb3dde18e019f5ab045811b2248d25d424e40980c683a9dc", "bytes": 22, "rawBytes": 2, "parts": 1}, "data/site.json": {"sha256": "73a1b438b0221511fb3dde18e019f5ab045811b2248d25d424e40980c683a9dc", "bytes": 22, "rawBytes": 2, "parts": 1}, "data/status.json": {"sha256": "73a1b438b0221511fb3dde18e019f5ab045811b2248d25d424e40980c683a9dc", "bytes": 22, "rawBytes": 2, "parts": 1}, "data/updates.json": {"sha256": "73a1b438b0221511fb3dde18e019f5ab045811b2248d25d424e40980c683a9dc", "bytes": 22, "rawBytes": 2, "parts": 1}}}';p text;i integer;bad jsonb;retained integer;
begin
 select snapshot_id into prior from public.pv_runtime_current where key='site';
 -- A synthetic current worker lease is confined to this transaction.
 update pv_refresh.pipelines set lease=null,lease_until=null,github_run=null where id='updates';
 execute 'set local role service_role';
 c:=public.refresh_worker_claim('updates','999999999991',true);
 if not (c->>'run')::boolean then raise exception 'Test lease not acquired';end if;
 bad:=jsonb_set(m,'{files,data/site.json}', '{}'::jsonb);
 begin perform public.refresh_runtime_begin('999999999991',(c->>'lease')::uuid,bad);raise exception 'Missing metadata allowed';exception when others then if sqlerrm<>'Invalid runtime file' then raise;end if;end;
 begin perform public.refresh_runtime_begin('different-run',(c->>'lease')::uuid,m);raise exception 'Stale run allowed';exception when others then if sqlerrm<>'Run lease is no longer current' then raise;end if;end;
 s:=public.refresh_runtime_begin('999999999991',(c->>'lease')::uuid,m);
 execute 'reset role';execute 'set local role anon';
 if exists(select 1 from public.pv_runtime_snapshots where id=s) then raise exception 'Pending metadata exposed';end if;
 if exists(select 1 from public.pv_runtime_files where snapshot_id=s) then raise exception 'Pending files exposed';end if;
 begin perform public.refresh_runtime_begin('999999999991',(c->>'lease')::uuid,m);raise exception 'Anonymous worker allowed';exception when insufficient_privilege then null;end;
 begin insert into public.pv_runtime_current values('site',s,m);raise exception 'Anonymous publish allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';execute 'set local role service_role';
 perform public.refresh_runtime_stage('999999999991',(c->>'lease')::uuid,s,'feed.xml',0,1,'H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==');
 begin perform public.refresh_runtime_commit('999999999991',(c->>'lease')::uuid,s);raise exception 'Incomplete publication allowed';exception when others then if sqlerrm<>'Runtime publication incomplete' then raise;end if;end;
 execute 'reset role';select snapshot_id into cur from public.pv_runtime_current where key='site';if cur is distinct from prior then raise exception 'Failure replaced current snapshot';end if;
 execute 'set local role service_role';
 foreach p in array array['data/site.json','data/status.json','data/updates.json'] loop perform public.refresh_runtime_stage('999999999991',(c->>'lease')::uuid,s,p,0,1,'H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==');end loop;
 perform public.refresh_runtime_commit('999999999991',(c->>'lease')::uuid,s);
 execute 'reset role';execute 'set local role anon';
 if not exists(select 1 from public.pv_runtime_current where key='site' and snapshot_id=s) then raise exception 'Publication not visible';end if;
 if (select count(*) from public.pv_runtime_files where snapshot_id=s)<>4 then raise exception 'Incomplete public snapshot';end if;
 execute 'reset role';execute 'set local role service_role';
 perform public.refresh_worker_finish('updates','999999999991',(c->>'lease')::uuid,'success','{}','published');
 -- Four additional publications must keep exactly three completed generated caches.
 for i in 1..4 loop
  c:=public.refresh_worker_claim('updates',(999999999991+i)::text,true);
  s:=public.refresh_runtime_begin((999999999991+i)::text,(c->>'lease')::uuid,m);
  foreach p in array array['feed.xml','data/site.json','data/status.json','data/updates.json'] loop perform public.refresh_runtime_stage((999999999991+i)::text,(c->>'lease')::uuid,s,p,0,1,'H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==');end loop;
  if i=1 then
   execute 'reset role';update pv_refresh.runtime_chunks set content='Y29ycnVwdA==' where snapshot_id=s and path='feed.xml';execute 'set local role service_role';
   begin perform public.refresh_runtime_commit((999999999991+i)::text,(c->>'lease')::uuid,s);raise exception 'Invalid checksum published';exception when others then if sqlerrm<>'Runtime file integrity mismatch' then raise;end if;end;
   execute 'reset role';update pv_refresh.runtime_chunks set content='H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==' where snapshot_id=s and path='feed.xml';execute 'set local role service_role';
  end if;
  perform public.refresh_runtime_commit((999999999991+i)::text,(c->>'lease')::uuid,s);
  perform public.refresh_worker_finish('updates',(999999999991+i)::text,(c->>'lease')::uuid,'success','{}','published');
 end loop;
 execute 'reset role';select count(*) into retained from public.pv_runtime_snapshots where published_at is not null;if retained<>3 then raise exception 'Runtime retention failed: %',retained;end if;
 if exists(select 1 from pv_refresh.runtime_chunks where snapshot_id=s) then raise exception 'Staging chunks retained';end if;
 execute 'set local role service_role';
 c:=public.refresh_worker_claim('updates','999999999998',true);s:=public.refresh_runtime_begin('999999999998',(c->>'lease')::uuid,m);
 perform public.refresh_worker_finish('updates','999999999998',(c->>'lease')::uuid,'failed','{}','failed');
 c:=public.refresh_worker_claim('updates','999999999999',true);cur:=public.refresh_runtime_begin('999999999999',(c->>'lease')::uuid,m);

 execute 'reset role';if exists(select 1 from public.pv_runtime_snapshots where id=s) then raise exception 'Abandoned staging retained';end if;if not exists(select 1 from public.pv_runtime_snapshots where id=cur and published_at is null) then raise exception 'Current staging removed';end if;
end $$;
rollback;
