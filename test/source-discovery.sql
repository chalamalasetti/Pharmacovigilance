-- Isolated synthetic database fixtures; no Auth login or production account changes.
begin;
insert into auth.users(id,email,role) values('d15c0000-0000-0000-0000-000000000001','discovery-admin@example.invalid','authenticated');
insert into public.research_admins(email) values('discovery-admin@example.invalid');
set local request.jwt.claims='{"sub":"d15c0000-0000-0000-0000-000000000001","email":"discovery-admin@example.invalid","role":"authenticated"}';
set local role authenticated;
select public.admin_save_pv_discovery('{"id":"test-discovery","agency":"FDA","title":"Synthetic safety guidance index","url":"https://www.fda.gov/synthetic-discovery","format":"html","keywords":"safety","active":true,"interval_minutes":60,"terms_note":"Synthetic transaction only"}',null) is not null as connector_saved;
set local role service_role;
select public.record_pv_discovery('test-discovery',(select updated_at from public.pv_discovery_connectors where id='test-discovery'),'{"items":[{"url":"https://www.fda.gov/synthetic-discovery-guidance.pdf","title":"Synthetic safety reporting guidance"}],"found":1,"excluded":0,"truncated":false,"resolved_url":"https://www.fda.gov/synthetic-discovery","index_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
select public.record_pv_discovery('test-discovery',(select updated_at from public.pv_discovery_connectors where id='test-discovery'),'{"items":[{"url":"https://www.fda.gov/synthetic-discovery-guidance.pdf","title":"Synthetic safety reporting guidance"}],"found":1,"excluded":0,"truncated":false,"resolved_url":"https://www.fda.gov/synthetic-discovery","index_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}');
do $$begin if (select count(*) from public.pv_discovery_items where connector_id='test-discovery')<>1 then raise exception 'Duplicate discovery';end if;end $$;
set local role authenticated;
do $$declare r public.pv_discovery_items;begin
 select * into r from public.pv_discovery_items where connector_id='test-discovery';
 perform public.admin_review_pv_discovery(r.id,r.updated_at,'deferred','Synthetic scope needs review');
 begin
  perform public.admin_review_pv_discovery(r.id,r.updated_at,'rejected','Stale review attempt');raise exception 'Stale review accepted';
 exception when others then if sqlerrm<>'Candidate changed; reload' then raise;end if;end;
 select * into r from public.pv_discovery_items where id=r.id;
 perform public.admin_review_pv_discovery(r.id,r.updated_at,'registered','Synthetic source registration only',jsonb_build_object('id','test-discovery-document','title',r.title,'country','US','agency','FDA','url',r.url,'edition','Not stated','topic','Pharmacovigilance','lifecycle','Both','norm','Guidance','legal_basis','Requires review','applicability','Synthetic scope','source_status','uncertain','published_on','','effective_on','','status','active','capture_note','Synthetic registration'));
 if not exists(select 1 from public.pv_documents where id='test-discovery-document' and published_on is null) then raise exception 'Registration failed';end if;
 if exists(select 1 from public.pv_requirement_versions where body->>'source_family'='test-discovery-document') then raise exception 'Discovery approved requirements';end if;
end $$;
set local request.jwt.claims='{"sub":"d15c0000-0000-0000-0000-000000000002","email":"discovery-reader@example.invalid","role":"authenticated"}';
do $$begin
 if exists(select 1 from public.pv_discovery_items) then raise exception 'Nonadmin saw inbox';end if;
 begin
  perform public.admin_review_pv_discovery(gen_random_uuid(),now(),'pending','Unauthorized review');raise exception 'Nonadmin review accepted';
 exception when others then if sqlerrm<>'Admin required' then raise;end if;end;
 if has_function_privilege('anon','public.record_pv_discovery(text,timestamptz,jsonb)','execute') or has_function_privilege('authenticated','public.record_pv_discovery(text,timestamptz,jsonb)','execute') or has_table_privilege('pv_pending','public.pv_discovery_items','select') then raise exception 'Discovery privilege leak';end if;
end $$;
rollback;
