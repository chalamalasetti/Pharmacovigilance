-- Synthetic validation only. Every record, review, baseline and account rolls back.
begin;
do $test$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();cat text;key text;h text;m public.e2b_mappings;bid bigint;n integer;captured jsonb;body jsonb:=jsonb_build_object('system','argus','version','Synthetic release','environment','Validation','company','Synthetic Pharma','markets','US','systemField','Synthetic field','currentControl','Synthetic control','decision','documented','rationale','Synthetic scope review','checked',true);
begin
 insert into auth.users(id) values(a),(b);
 insert into public.research_admins(email) values('e2b-test-admin@example.invalid');
 select catalog_id,field_key,field_hash into strict cat,key,h from public.e2b_fields order by catalog_id,field_key limit 1;
 execute 'set local role authenticated';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','email','e2b-test-admin@example.invalid')::text,true);
 m:=public.save_e2b_mapping(null,0,cat,key,body,'Synthetic initial mapping');
 begin perform public.save_e2b_mapping(m.id,0,cat,key,body,'Stale edit');raise exception 'Stale accepted';exception when raise_exception then if sqlerrm='Stale accepted' then raise;end if;end;
 begin update public.e2b_mapping_history set reason='Overwrite' where mapping_id=m.id;raise exception 'History mutable';exception when insufficient_privilege then null;end;
 perform public.review_e2b_field(cat,key,h,'verified','Synthetic source check');bid:=public.publish_e2b_baseline(cat,'Synthetic reviewed subset');
 select snapshot into strict captured from public.e2b_baselines where id=bid;
 if jsonb_array_length(captured->'records')<1 then raise exception 'Baseline empty';end if;
 perform public.review_e2b_field(cat,key,h,'needs_work','Synthetic later reassessment');
 if (select snapshot from public.e2b_baselines where id=bid) is distinct from captured then raise exception 'Published baseline changed';end if;
 begin update public.e2b_baselines set reason='Overwrite' where id=bid;raise exception 'Baseline mutable';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','email','e2b-test-reader@example.invalid')::text,true);
 select count(*) into n from public.e2b_mappings where id=m.id;if n<>0 then raise exception 'Mapping leak';end if;
 select count(*) into n from public.e2b_mapping_history where mapping_id=m.id;if n<>0 then raise exception 'History leak';end if;
 begin perform public.save_e2b_mapping(m.id,1,cat,key,body,'Unauthorized edit');raise exception 'Unauthorized accepted';exception when raise_exception then if sqlerrm='Unauthorized accepted' then raise;end if;end;
 begin perform public.review_e2b_field(cat,key,h,'verified','Non-admin check');raise exception 'Non-admin review accepted';exception when raise_exception then if sqlerrm='Non-admin review accepted' then raise;end if;end;
 begin perform public.publish_e2b_baseline(cat,'Non-admin publish');raise exception 'Non-admin publish accepted';exception when raise_exception then if sqlerrm='Non-admin publish accepted' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','pv_pending')::text,true);
 begin perform public.save_e2b_mapping(null,0,cat,key,body,'Pending write');raise exception 'Pending accepted';exception when raise_exception then if sqlerrm='Pending accepted' then raise;end if;end;
 execute 'set local role anon';
 select count(*) into n from public.e2b_fields where catalog_id=cat and field_key=key;if n<>1 then raise exception 'Public reference missing';end if;
 begin perform * from public.e2b_mappings;raise exception 'Anonymous private read accepted';exception when insufficient_privilege then null;end;
 raise notice 'E2B database checks passed';
end $test$;
rollback;
