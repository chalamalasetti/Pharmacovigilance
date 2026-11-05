-- Real authorization and lease behavior; every synthetic change rolls back.
begin;
do $$
declare a uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid(); c jsonb; d jsonb; rev integer;
begin
 insert into auth.users(id,aud,role,email) values(a,'authenticated','authenticated','refresh-admin@example.invalid'),(reader,'authenticated','authenticated','refresh-reader@example.invalid');
 insert into public.research_admins(email) values('refresh-admin@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'email','refresh-reader@example.invalid','role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.admin_refresh_status();raise exception 'Reader accessed status';exception when insufficient_privilege then null;end;
 begin perform public.refresh_worker_claim('updates','123',true);raise exception 'Reader claimed a run';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','refresh-admin@example.invalid','role','authenticated')::text,true);
 d:=public.admin_refresh_status();if jsonb_array_length(d->'pipelines')<>3 then raise exception 'Missing pipelines';end if;
 select (x->>'revision')::integer into rev from jsonb_array_elements(d->'pipelines') x where x->>'id'='updates';
 perform public.admin_refresh_save('updates',720,rev);
 select (x->>'revision')::integer into rev from jsonb_array_elements(d->'pipelines') x where x->>'id'='clinical';
 perform public.admin_refresh_save('clinical',0,rev);
 begin perform public.admin_refresh_save('clinical',1440,rev);raise exception 'Stale revision allowed';exception when others then if sqlerrm<>'Schedule changed elsewhere. Reload before saving.' then raise;end if;end;
 perform public.admin_refresh_queue('clinical','resume');
 execute 'reset role';execute 'set local role service_role';
 c:=public.refresh_worker_claim('clinical','123',false);if (c->>'frequency')::integer<>0 then raise exception 'Claim cadence missing';end if;
 if c->>'mode'<>'resume' or not (c->>'run')::boolean then raise exception 'Queue not claimed while paused';end if;
 d:=public.refresh_worker_claim('clinical','124',true);if (d->>'run')::boolean then raise exception 'Overlap permitted';end if;
 begin perform public.refresh_worker_finish('clinical','124',(c->>'lease')::uuid,'success','{}','requested');raise exception 'Other run completed lease';exception when others then if sqlerrm<>'Run lease is no longer current' then raise;end if;end;
 perform public.refresh_worker_finish('clinical','123',(c->>'lease')::uuid,'partial','{"companies":124,"partial":1}','requested');
 d:=public.refresh_worker_claim('clinical','125',false);if (d->>'run')::boolean then raise exception 'Paused schedule ran';end if;
 execute 'reset role';perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
 begin perform public.admin_refresh_status();raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
 begin perform public.refresh_worker_claim('updates','126',true);raise exception 'Anonymous worker allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
