-- Live Postgres verification; all synthetic organizational fixtures roll back.
begin;
do $$
declare admin_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();a public.pv_agencies;d public.pv_documents;p jsonb;b jsonb;
begin
 insert into auth.users(id,aud,role,email)values(admin_id,'authenticated','authenticated','global-library-admin@example.invalid'),(other_id,'authenticated','authenticated','global-library-other@example.invalid');
 insert into public.research_admins(email)values('global-library-admin@example.invalid');
 if has_table_privilege('anon','public.pv_agencies','INSERT') or has_table_privilege('authenticated','public.pv_agencies','UPDATE') then raise exception 'Directory direct mutation allowed';end if;
 if exists(select 1 from public.pv_agencies where status='directory_reference' and cardinality(domains)>0) then raise exception 'Unverified source enabled';end if;
 select to_jsonb(x)-'updated_at' into p from public.pv_agencies x where id='AU_TGA';
 p:=p||'{"status":"verified","official_url":"https://www.tga.gov.au/","domains":["www.tga.gov.au"],"verification_note":"Synthetic exact-host verification for a rolled-back test"}';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'email','global-library-other@example.invalid','role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.admin_save_pv_agency(p,(select updated_at from public.pv_agencies where id='AU_TGA'));raise exception 'Non-admin changed directory';exception when others then if sqlerrm<>'Admin access required' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'email','global-library-admin@example.invalid','role','authenticated')::text,true);
 a:=public.admin_save_pv_agency(p,(select updated_at from public.pv_agencies where id='AU_TGA'));
 begin perform public.admin_save_pv_agency(p,a.updated_at-interval '1 second');raise exception 'Concurrent edit accepted';exception when others then if sqlerrm not like 'Agency directory changed%' then raise;end if;end;
 begin perform public.admin_save_pv_agency(p||'{"domains":["*.tga.gov.au"]}',a.updated_at);raise exception 'Wildcard accepted';exception when others then if sqlerrm not like 'Use exact public%' then raise;end if;end;
 d:=public.admin_save_pv_document('{"id":"global-synthetic-tga","title":"Synthetic global guidance","country":"AU","agency":"AU_TGA","url":"https://www.tga.gov.au/synthetic","edition":"Synthetic edition","topic":"PV quality","lifecycle":"Both","norm":"Guidance","legal_basis":"Synthetic source authority","applicability":"Synthetic organization scope","source_status":"uncertain","published_on":"","effective_on":"","status":"active","capture_note":"Synthetic test only"}',null);
 if d.country<>'AU' or not exists(select 1 from public.pv_document_schedule where id=d.id) then raise exception 'Global source missing from queue';end if;
 select body into b from public.pv_requirement_versions limit 1;
 b:=b||jsonb_build_object('agency','AU_TGA','source_family',d.id,'source_url',d.url);
 -- Validators are private; test through the admin RPC.
 perform public.admin_version_requirement('GLOBAL-SYNTHETIC',b,null);
 begin perform public.admin_version_requirement('GLOBAL-CROSS-AGENCY',b||'{"source_url":"https://www.fda.gov/synthetic"}',null);raise exception 'Cross-agency URL accepted';exception when others then if sqlerrm not like 'Use an approved official%' then raise;end if;end;
 p:=p||'{"status":"inactive"}';a:=public.admin_save_pv_agency(p,a.updated_at);
 if exists(select 1 from public.pv_document_schedule where id=d.id) then raise exception 'Inactive agency still scheduled';end if;
 if not exists(select 1 from public.pv_documents where id=d.id) then raise exception 'Deactivation lost evidence';end if;
 execute 'reset role';
end $$;
rollback;
