-- Synthetic authorization, revision and audit checks. No fixtures survive this transaction.
begin;
do $$
declare a uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); b jsonb; r public.pv_requirement_versions; r2 public.pv_requirement_versions; n integer;
begin
 select body into b from public.pv_requirement_versions order by requirement_key limit 1;
 insert into auth.users(id,aud,role,email) values(a,'authenticated','authenticated','requirements-admin@example.invalid'),(outsider,'authenticated','authenticated','requirements-reader@example.invalid');
 insert into public.research_admins(email) values('requirements-admin@example.invalid') on conflict do nothing;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'email','requirements-reader@example.invalid','role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.admin_version_requirement('SYNTHETIC-REQ',b,null);raise exception 'Nonadmin mutation allowed';exception when others then if sqlerrm<>'Admin access required' then raise;end if;end;
 begin update public.pv_requirement_versions set review_status='approved';raise exception 'Direct write allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','requirements-admin@example.invalid','role','authenticated')::text,true);
 begin perform public.admin_version_requirement('SYNTHETIC-REQ',b||'{"source_url":"https://www.fda.gov.evil.invalid/x"}',null);raise exception 'Host accepted';exception when others then if sqlerrm not like 'Use an approved official%' then raise;end if;end;
 begin perform public.admin_version_requirement('SYNTHETIC-REQ',b||'{"statement":"Contact person@example.invalid"}',null);raise exception 'Contact accepted';exception when others then if sqlerrm not like 'Remove public%' then raise;end if;end;
 begin perform public.admin_version_requirement('SYNTHETIC-REQ',b||'{"valid_from":"2026-02-30"}',null);raise exception 'Date accepted';exception when datetime_field_overflow then null;end;
 begin perform public.admin_version_requirement('SYNTHETIC-REQ',b||'{"unknown":"extra data"}',null);raise exception 'Unknown field accepted';exception when others then if sqlerrm<>'Unknown requirement field' then raise;end if;end;
 r:=public.admin_version_requirement('SYNTHETIC-REQ',b,null);
 if r.revision<>1 or r.review_status<>'pending' or r.reviewed_at is not null then raise exception 'Initial state failed';end if;
 r:=public.admin_review_requirement(r.id,'approved','Source and interpretation checked using synthetic test');
 begin perform public.admin_review_requirement(r.id,'rejected','Attempt to overwrite review');raise exception 'Immutable review bypassed';exception when others then if sqlerrm not like 'Review already%' then raise;end if;end;
 begin perform public.admin_version_requirement('SYNTHETIC-REQ',b,null);raise exception 'Concurrent version accepted';exception when others then if sqlerrm not like 'Requirement changed%' then raise;end if;end;
 r2:=public.admin_version_requirement('SYNTHETIC-REQ',b||'{"change_kind":"Clarification","change_summary":"Synthetic clarification"}',r.id);
 if r2.supersedes<>r.id or r2.revision<>2 then raise exception 'Version link failed';end if;
 r:=public.admin_version_requirement('SYNTHETIC-REQ',b,r2.id);
 begin perform public.admin_review_requirement(r2.id,'approved','Old pending version');raise exception 'Stale review accepted';exception when others then if sqlerrm not like 'A newer version%' then raise;end if;end;
 select count(*) into n from public.pv_requirement_audit where version_id in (r.id,r2.id);if n<>2 then raise exception 'Editorial audit missing';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 execute 'set local role anon';
 select count(*) into n from public.pv_requirement_versions where requirement_key='SYNTHETIC-REQ';if n<>3 then raise exception 'Public projection missing history';end if;
 begin select count(*) into n from public.pv_requirement_audit;raise exception 'Audit identity leaked';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: public history; admin-only writes; contact, source and date validation; optimistic concurrency; immutable review; predecessor chain; private editorial identity; all fixtures rolled back' as result;
