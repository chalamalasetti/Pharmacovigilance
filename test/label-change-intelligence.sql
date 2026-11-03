-- Run after the approved migration. Synthetic data only; every mutation rolls back.
begin;
do $$
declare uid uuid:=gen_random_uuid();r jsonb;ctx jsonb;c public.company_cases;again public.company_cases;
begin
 r:=jsonb_build_object('id','lc-'||repeat('a',24),'hash',repeat('b',64),'agency','FDA','market','US','kind','approved_change','title','Synthetic label source','url','https://www.accessdata.fda.gov/synthetic','published','2026-10-01','ingredients',jsonb_build_array('synthetic'),'sections','[]'::jsonb);
 execute 'set local role service_role';perform public.archive_label_versions(jsonb_build_array(r));perform public.archive_label_versions(jsonb_build_array(r));execute 'reset role';
 begin update public.pv_label_versions set record=r||'{"title":"Changed"}' where id=r->>'id' and hash=r->>'hash';raise exception 'Evidence could be overwritten';exception when others then if sqlerrm<>'Captured label evidence is immutable; publish another version' then raise;end if;end;
 execute 'set local role anon';if not exists(select 1 from public.pv_label_versions where id=r->>'id') then raise exception 'Public evidence unreadable';end if;
 begin perform public.archive_label_versions(jsonb_build_array(r));raise exception 'Anonymous ingestion allowed';exception when insufficient_privilege then null;end;
 begin perform public.open_label_change_case(r->>'id',r->>'hash','{}',null,true);raise exception 'Anonymous handoff allowed';exception when insufficient_privilege then null;end;execute 'reset role';
 insert into auth.users(id,role,aud,raw_app_meta_data) values(uid,'authenticated','authenticated','{}');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);execute 'set local role authenticated';
 ctx:=jsonb_build_object('companyId','synthetic','companyName','Synthetic company','markets',jsonb_build_array('US'),'products',jsonb_build_array(jsonb_build_object('key','fda|US|1','brand','Synthetic','market','US','authId','NDA 1')),'portfolioConfirmedAt','2026-10-01T00:00:00Z','reason','Assess this source for the confirmed synthetic product.');
 begin perform public.open_label_change_case(r->>'id',r->>'hash',ctx,null,false);raise exception 'Unconfirmed source review allowed';exception when others then if sqlerrm<>'Confirm review of the official source and its limitations' then raise;end if;end;
 c:=public.open_label_change_case(r->>'id',r->>'hash',ctx,null,true);again:=public.open_label_change_case(r->>'id',r->>'hash',ctx,null,true);
 if c.id<>again.id or c.owner_id<>uid or c.snapshot->'companyContext'->>'sourceItem'<>('label:'||(r->>'id')||':'||(r->>'hash')) then raise exception 'Pinned or idempotent handoff failed';end if;
 begin perform public.open_company_case('label:forged',jsonb_build_object('companyContext',ctx),null);raise exception 'Unpinned label case accepted';exception when others then if sqlerrm<>'Review pinned evidence in Label Change Intelligence before opening a label assessment' then raise;end if;end;
 execute 'reset role';execute 'set local role pv_pending';begin perform public.open_label_change_case(r->>'id',r->>'hash',ctx,null,true);raise exception 'Pending user handoff allowed';exception when insufficient_privilege then null;end;execute 'reset role';
end$$;
rollback;
