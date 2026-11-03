-- Synthetic accounts only. No email delivery, approvals or persistent records.
begin;
do $$
declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();n integer;result jsonb;
begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data) values(u,'authenticated','authenticated','inbox-synthetic@example.invalid','{"login_alias":"synthetic.pv-id","professional_role":"Safety systems / IT"}'),(v,'authenticated','authenticated','inbox-outsider@example.invalid','{}');
 if (select login_alias from public.account_profiles where user_id=u)<>'synthetic.pv-id' then raise exception 'Alias not initialized';end if;
 begin insert into auth.users(id,aud,role,email,raw_user_meta_data) values(gen_random_uuid(),'authenticated','authenticated','duplicate@example.invalid','{"login_alias":"SYNTHETIC.PV-ID"}');raise exception 'Duplicate alias accepted';exception when unique_violation then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);execute 'set local role authenticated';
 if (select count(*) from public.account_profiles)<>1 then raise exception 'Profile privacy failed';end if;
 update public.account_profiles set professional_role='Quality assurance' where user_id=u;
 if public.is_app_admin() then raise exception 'Professional role granted admin';end if;
 begin perform public.resolve_login_alias('synthetic.pv-id');raise exception 'Email resolver exposed';exception when insufficient_privilege then null;end;
 insert into public.company_inbox_seen(user_id,company_id,item_key,content_hash) values(u,'synthetic','item-one',repeat('a',64));
 begin insert into public.company_inbox_seen(user_id,company_id,item_key,content_hash) values(v,'synthetic','forged',repeat('b',64));raise exception 'Forged owner accepted';exception when insufficient_privilege then null;end;
 begin update public.account_profiles set user_id=v where user_id=u;raise exception 'Profile ownership transfer allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated')::text,true);
 if exists(select 1 from public.company_inbox_seen) then raise exception 'Outsider saw reading markers';end if;
 update public.company_inbox_seen set content_hash=repeat('c',64) where user_id=u;get diagnostics n=row_count;if n<>0 then raise exception 'Outsider edited marker';end if;
 execute 'reset role';execute 'set local role service_role';
 result:=public.resolve_login_alias('synthetic.pv-id');if result->>'email'<>'inbox-synthetic@example.invalid' then raise exception 'Server alias resolution failed';end if;
 for n in 2..11 loop result:=public.resolve_login_alias('synthetic.pv-id');end loop;if (result->>'allowed')::boolean then raise exception 'Alias throttle missing';end if;
 execute 'reset role';execute 'set local role anon';
 begin perform * from public.account_profiles;raise exception 'Anonymous profile access';exception when insufficient_privilege then null;end;
 begin perform public.resolve_login_alias('synthetic.pv-id');raise exception 'Anonymous resolver access';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
