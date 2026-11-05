begin;
do $$
declare a uuid:=gen_random_uuid();reader uuid:=gen_random_uuid();v public.pv_document_versions;e public.pv_regulatory_dates;nextv public.pv_document_versions;n integer;
begin
 insert into auth.users(id,aud,role,email) values(a,'authenticated','authenticated','calendar-admin@example.invalid'),(reader,'authenticated','authenticated','calendar-reader@example.invalid');
 insert into public.research_admins(email) values('calendar-admin@example.invalid');
 select * into v from public.pv_document_versions where document_id='ema-gvp-vi-addendum-ii' order by revision desc limit 1;
 v.id:=gen_random_uuid();v.revision:=100000;v.previous_id:=null;v.original_hash:=repeat('0',64);v.effective_on:='2027-01-01';
 insert into public.pv_document_versions select (jsonb_populate_record(null::public.pv_document_versions,to_jsonb(v))).*;
 select * into e from public.pv_regulatory_dates where document_version_id=v.id;
 if e.state<>'pending' or e.event_date<>'2027-01-01' then raise exception 'Automatic intake failed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'email','calendar-reader@example.invalid','role','authenticated')::text,true);execute 'set local role authenticated';
 select count(*) into n from public.pv_regulatory_dates where id=e.id;if n<>0 then raise exception 'Pending date leaked';end if;
 begin perform public.review_pv_calendar(e.id,e.revision,'verified',e.event_date,'effective','Synthetic scope','Page 3','Synthetic qualification','Synthetic decision');raise exception 'Reader review allowed';exception when others then if sqlerrm<>'Admin access required' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','calendar-admin@example.invalid','role','authenticated')::text,true);
 e:=public.review_pv_calendar(e.id,e.revision,'verified',e.event_date,'effective','Synthetic scope','Page 3','Synthetic qualification','Synthetic decision');
 begin perform public.review_pv_calendar(e.id,1,'verified',e.event_date,'effective','Synthetic scope','Page 3','','Stale decision');raise exception 'Stale revision accepted';exception when others then if sqlerrm<>'Date changed; reload before reviewing' then raise;end if;end;
 begin update public.pv_regulatory_dates set state='verified' where id=e.id;raise exception 'Direct update allowed';exception when insufficient_privilege then null;end;
 execute 'reset role';perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';select count(*) into n from public.pv_regulatory_dates where id=e.id;if n<>1 then raise exception 'Verified date not public';end if;
 begin select count(*) into n from public.pv_regulatory_date_history;raise exception 'Private audit accessible';exception when insufficient_privilege then null;end;
 execute 'reset role';
 nextv:=v;nextv.id:=gen_random_uuid();nextv.revision:=100001;nextv.previous_id:=v.id;nextv.parser_version:='normative-rules-v4-tables';insert into public.pv_document_versions select (jsonb_populate_record(null::public.pv_document_versions,to_jsonb(nextv))).*;
 select count(*) into n from public.pv_regulatory_dates where document_version_id=nextv.id;if n<>0 then raise exception 'Identical bytes duplicated date';end if;
 nextv.id:=gen_random_uuid();nextv.revision:=100002;nextv.original_hash:=repeat('1',64);insert into public.pv_document_versions select (jsonb_populate_record(null::public.pv_document_versions,to_jsonb(nextv))).*;
 select * into e from public.pv_regulatory_dates where id=e.id;if e.state<>'source_changed' then raise exception 'Changed source not flagged';end if;
 select count(*) into n from public.pv_regulatory_date_history where event_id=e.id;if n<>2 then raise exception 'History incomplete';end if;
end $$;
rollback;
