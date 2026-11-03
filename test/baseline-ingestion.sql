-- Synthetic fixtures only; the full transaction rolls back.
begin;
do $$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();doc public.pv_documents;v public.pv_document_versions;c public.pv_document_candidates;d public.pv_baseline_drafts;saved public.pv_baseline_drafts;body jsonb;n integer;before_count integer;
begin
 insert into auth.users(id,aud,role,email) values(a,'authenticated','authenticated','baseline-admin@example.invalid'),(u,'authenticated','authenticated','baseline-outsider@example.invalid');
 insert into public.research_admins(email) values('baseline-admin@example.invalid');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','baseline-admin@example.invalid','role','authenticated')::text,true);
 doc:=public.admin_save_pv_document('{"id":"synthetic-auto-baseline","title":"Synthetic source","country":"US","agency":"FDA","url":"https://www.fda.gov/synthetic","edition":"Synthetic one","topic":"Safety controls","lifecycle":"Both","norm":"Guidance","legal_basis":"Synthetic guidance basis","applicability":"Assess regulated product scope","source_status":"current","published_on":"","effective_on":"","status":"active","capture_note":"Synthetic test"}',null);
 v:=public.capture_pv_document(doc.id,doc.updated_at,null,jsonb_build_object('original_hash',repeat('a',64),'content_hash',repeat('b',64),'source_url',doc.url,'content_kind','html','partial',true,'excluded',1,'archive_path',doc.id||'/'||repeat('a',64)||'.html','parser_version','normative-rules-v3'),jsonb_build_array(jsonb_build_object('anchor','paragraph-1','statement','The sponsor should retain documented procedures.','context','Only for products in the regulated scope.','fingerprint',repeat('c',64),'classification','baseline')));
 select * into c from public.pv_document_candidates where document_version_id=v.id;
 select * into d from public.pv_baseline_drafts where candidate_id=c.id;
 if d.id is null or d.state<>'draft' or d.body->>'exceptions'<>c.context or d.document_version_id<>v.id then raise exception 'Automatic draft lost evidence';end if;
 select count(*) into before_count from public.pv_requirement_versions;
 if d.requirement_version_id is not null then raise exception 'Automatic publication occurred';end if;
 execute 'set local role authenticated';
 perform public.admin_prepare_baseline_capture(v.id);perform public.admin_prepare_baseline_capture(v.id);
 select count(*) into n from public.pv_baseline_drafts where document_version_id=v.id;if n<>1 then raise exception 'Duplicate draft';end if;
 begin perform public.admin_advance_baseline_draft(d.id,1,'publish',null,'Attempt','SYNTHETIC-AUTO',null,true);raise exception 'Draft skipped review';exception when others then if sqlerrm<>'Submit for review before publishing' then raise;end if;end;
 begin perform public.admin_advance_baseline_draft(d.id,1,'save',d.body||'{"source_edition":"Wrong edition"}');raise exception 'Pinned source changed';exception when others then if sqlerrm<>'Keep captured source identity pinned' then raise;end if;end;
 body:=d.body||'{"statement":"The sponsor should retain documented, controlled procedures."}';
 d:=public.admin_advance_baseline_draft(d.id,1,'save',body);
 begin perform public.admin_advance_baseline_draft(d.id,1,'submit');raise exception 'Stale revision accepted';exception when others then if sqlerrm<>'Draft changed. Reload before saving' then raise;end if;end;
 d:=public.admin_advance_baseline_draft(d.id,d.revision,'submit');
 begin perform public.admin_advance_baseline_draft(d.id,d.revision,'save',body);raise exception 'Review body changed';exception when others then if sqlerrm<>'Return to draft before editing' then raise;end if;end;
 begin perform public.admin_advance_baseline_draft(d.id,d.revision,'publish',null,'Source checked','SYNTHETIC-AUTO');raise exception 'Missing confirmation accepted';exception when others then if sqlerrm<>'Confirm source, scope, exceptions and extraction coverage' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','baseline-outsider@example.invalid','role','authenticated')::text,true);
 select count(*) into n from public.pv_baseline_drafts where id=d.id;if n<>0 then raise exception 'Draft leaked to nonadmin';end if;
 begin perform public.admin_advance_baseline_draft(d.id,d.revision,'publish',null,'Attempt','SYNTHETIC-AUTO',null,true);raise exception 'Nonadmin published';exception when others then if sqlerrm<>'Admin access required' then raise;end if;end;
 begin perform public.admin_prepare_baseline_capture(v.id);raise exception 'Nonadmin prepared';exception when others then if sqlerrm<>'Admin access required' then raise;end if;end;
 begin perform public.pv_prepare_baseline_draft(c.id);raise exception 'Private helper callable';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','baseline-admin@example.invalid','role','authenticated')::text,true);
 d:=public.admin_advance_baseline_draft(d.id,d.revision,'publish',null,'Synthetic original, scope, conditions and authority checked.','SYNTHETIC-AUTO',null,true);
 if d.state<>'published' or not exists(select 1 from public.pv_requirement_versions req where req.id=d.requirement_version_id and req.review_status='approved' and req.document_version_id=v.id and req.body=d.body) then raise exception 'Published baseline not pinned';end if;
 begin perform public.admin_advance_baseline_draft(d.id,d.revision,'return');raise exception 'Published draft changed';exception when others then if sqlerrm not like 'Decision finalized%' then raise;end if;end;
 select count(*) into n from public.pv_requirement_versions;if n<>before_count+1 then raise exception 'Unexpected baseline changes';end if;
 select count(*) into n from public.pv_baseline_draft_events where draft_id=d.id;if n<>4 then raise exception 'Incomplete audit';end if;
 begin delete from public.pv_baseline_draft_events where draft_id=d.id;raise exception 'Audit deleted';exception when insufficient_privilege then null;end;
 execute 'reset role';
 -- Omission candidates cannot become automatic withdrawal drafts.
 insert into public.pv_document_candidates(document_version_id,ordinal,anchor,statement,context,fingerprint,classification) values(v.id,2,'paragraph-2','Previously present safety wording.','Possible extraction omission.',repeat('d',64),'possible_removal');
 if exists(select 1 from public.pv_baseline_drafts x join public.pv_document_candidates y on x.candidate_id=y.id where y.document_version_id=v.id and y.ordinal=2) then raise exception 'Automatic withdrawal draft';end if;
end $$;
rollback;
