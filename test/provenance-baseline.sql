-- Synthetic actors and data are rolled back. Exercises the real RLS and publication RPCs.
begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();
 req public.pv_requirement_versions;v public.pv_document_versions;sr public.pv_source_reviews;r public.pv_baseline_releases;r2 public.pv_baseline_releases;req_body jsonb;items jsonb;n integer;snapshot jsonb;
begin
 insert into auth.users(id,aud,role,email) values(a,'authenticated','authenticated','baseline-author@example.invalid'),(b,'authenticated','authenticated','baseline-approver@example.invalid'),(reader,'authenticated','authenticated','baseline-reader@example.invalid');
 insert into public.research_admins(email) values('baseline-author@example.invalid'),('baseline-approver@example.invalid') on conflict do nothing;
 select * into v from public.pv_document_versions where document_id='fda-31480' order by revision limit 1;
 select q.body into req_body from public.pv_requirement_versions q where document_version_id=v.id limit 1;
 req_body:=req_body||jsonb_build_object('source_url',v.source_url,'source_edition',v.edition,'valid_from','2026-01-01','change_kind','Clarification','change_summary','Synthetic clarification');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'email','baseline-reader@example.invalid','role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.review_pv_source(v.id,'verified','Regulation','English','Synthetic scope',null,'Synthetic review');raise exception 'Reader review allowed';exception when others then if sqlerrm<>'Admin access required' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','baseline-author@example.invalid','role','authenticated')::text,true);
 req:=public.admin_version_requirement('SYNTHETIC-BASELINE',req_body,null);
 execute 'reset role';update public.pv_requirement_versions set document_version_id=v.id where id=req.id;execute 'set local role authenticated';
 items:=jsonb_build_array(jsonb_build_object('version_id',req.id,'control','reporting','trigger_clock','Synthetic receipt trigger and clock','submission_method','Synthetic approved route'));
 begin perform public.create_pv_baseline('Synthetic release','Synthetic rationale','2026-01-01',null,items);raise exception 'Pending requirement published';exception when others then if sqlerrm not like 'Every release item%' then raise;end if;end;
 req:=public.admin_review_requirement(req.id,'approved','Synthetic verified interpretation');
 begin perform public.create_pv_baseline('Synthetic release','Synthetic rationale','2026-01-01',null,items);raise exception 'Unverified source accepted';exception when others then if sqlerrm not like 'The exact source%' then raise;end if;end;
 sr:=public.review_pv_source(v.id,'verified','Regulation','English','Synthetic applicant scope',null,'Synthetic source identity and qualifications checked');
 r:=public.create_pv_baseline('Synthetic release','Synthetic rationale','2026-01-01',null,items);snapshot:=r.manifest;
 begin update public.pv_baseline_releases set state='published' where id=r.id;raise exception 'Direct write permitted';exception when insufficient_privilege then null;end;
 begin perform public.transition_pv_baseline(r.id,'draft','published','Skip approval');raise exception 'Approval skipped';exception when others then if sqlerrm<>'Invalid release transition' then raise;end if;end;
 r:=public.transition_pv_baseline(r.id,'draft','in_review','Ready for independent review');
 begin perform public.transition_pv_baseline(r.id,'in_review','approved','Author tries approval');raise exception 'Self approval allowed';exception when others then if sqlerrm not like 'A different human%' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'email','baseline-reader@example.invalid','role','authenticated')::text,true);
 select count(*) into n from public.pv_baseline_releases where id=r.id;if n<>0 then raise exception 'Draft release leaked';end if;
 select count(*) into n from public.pv_baseline_events where release_id=r.id;if n<>0 then raise exception 'Draft events leaked';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'email','baseline-approver@example.invalid','role','authenticated')::text,true);
 r:=public.transition_pv_baseline(r.id,'in_review','approved','Synthetic independent source and interpretation review');
 r:=public.transition_pv_baseline(r.id,'approved','published','Publish synthetic scoped snapshot');
 if r.manifest is distinct from snapshot or r.reviewer<>b or r.published_at is null then raise exception 'Snapshot or approval altered';end if;
 -- New source reviews cannot silently change a published manifest.
 sr:=public.review_pv_source(v.id,'more_information','Regulation','English','Synthetic applicant scope',null,'Synthetic later source uncertainty');
 select * into r2 from public.pv_baseline_releases where id=r.id;if r2.manifest is distinct from snapshot then raise exception 'Historic source replaced';end if;
 execute 'reset role';
 begin update public.pv_baseline_releases set manifest='{}' where id=r.id;raise exception 'Manifest overwrite allowed';exception when others then if sqlerrm<>'Evidence snapshots cannot be overwritten' then raise;end if;end;
 perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
 select count(*) into n from public.pv_baseline_releases where id=r.id;if n<>1 then raise exception 'Published release not public';end if;
 select count(*) into n from public.pv_baseline_events where release_id=r.id;if n<>4 then raise exception 'Approval chain missing';end if;
 begin perform public.transition_pv_baseline(r.id,'published','withdrawn','Unauthorized withdrawal');raise exception 'Anon mutation allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: reader denied, pending/unverified blocked, draft RLS, no direct writes, independent approval, immutable source snapshot, public published history; fixtures rolled back' as result;
