-- Synthetic onboarding only; every actor, secret hash and request is rolled back.
begin;
do $$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();x jsonb;request uuid;token uuid;payload jsonb;
begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) values(a,'authenticated','authenticated','managed-editor@example.invalid','{}','{}'),(u,'authenticated','authenticated','managed-internal@example.invalid','{"login_alias":"synthetic-onboard"}','{"pv_managed":true}'),(v,'authenticated','authenticated','managed-outsider@example.invalid','{}','{}');
 insert into public.research_admins(email) values('managed-editor@example.invalid');
 execute 'set local role service_role';
 x:=public.managed_accounts_worker('request','{"alias":"synthetic-onboard","email":"contact@example.invalid","role":"Safety operations"}');request:=(x->>'reference')::uuid;
 begin perform public.managed_accounts_worker('list',jsonb_build_object('actor',v));raise exception 'Nonadmin list allowed';exception when others then if sqlerrm<>'Admin required' then raise;end if;end;
 payload:=jsonb_build_object('actor',a,'user',u,'alias','synthetic-onboard','temporary','Synthetic-Temporary-Secret-1','request',request);
 x:=public.managed_accounts_worker('register',payload);
 x:=public.resolve_login_alias('synthetic-onboard');if not (x->>'pending')::boolean then raise exception 'Pending flag missing';end if;
 x:=public.managed_accounts_worker('temporary','{"alias":"synthetic-onboard","password":"wrong"}');if (x->>'valid')::boolean then raise exception 'Wrong temporary password accepted';end if;
 x:=public.managed_accounts_worker('temporary','{"alias":"synthetic-onboard","password":"Synthetic-Temporary-Secret-1"}');if not (x->>'valid')::boolean or x ? 'access_token' or x ? 'email' then raise exception 'Temporary verification leaked session or identity';end if;
 x:=public.managed_accounts_worker('claim','{"alias":"synthetic-onboard","password":"Synthetic-Temporary-Secret-1"}');token:=(x->>'lease')::uuid;
 x:=public.managed_accounts_worker('claim','{"alias":"synthetic-onboard","password":"Synthetic-Temporary-Secret-1"}');if (x->>'valid')::boolean then raise exception 'Concurrent activation allowed';end if;
 begin perform public.managed_accounts_worker('finish',jsonb_build_object('user',u,'lease',gen_random_uuid()));raise exception 'Wrong lease accepted';exception when others then if sqlerrm<>'Activation changed; retry sign-in' then raise;end if;end;
 perform public.managed_accounts_worker('finish',jsonb_build_object('user',u,'lease',token));
 x:=public.resolve_login_alias('synthetic-onboard');if (x->>'pending')::boolean then raise exception 'Activated account still pending';end if;
 x:=public.managed_accounts_worker('temporary','{"alias":"synthetic-onboard","password":"Synthetic-Temporary-Secret-1"}');if (x->>'valid')::boolean then raise exception 'Temporary password replay accepted';end if;
 begin perform public.managed_accounts_worker('register',payload);raise exception 'Activated account reissued';exception when others then if sqlerrm<>'Account already activated or being activated' then raise;end if;end;
 execute 'reset role';
 if exists(select 1 from pv_accounts.managed_accounts where user_id=u and temporary_hash is not null) then raise exception 'Temporary hash retained after activation';end if;
 if (select count(*) from pv_accounts.account_events where user_id=u)<>2 then raise exception 'Audit history incomplete';end if;
 execute 'set local role authenticated';
 begin perform public.managed_accounts_worker('list',jsonb_build_object('actor',a));raise exception 'Client worker access';exception when insufficient_privilege then null;end;
 begin perform * from pv_accounts.access_requests;raise exception 'Private contact access';exception when insufficient_privilege then null;end;
 execute 'reset role';execute 'set local role anon';
 begin perform public.managed_accounts_worker('request','{"alias":"forged"}');raise exception 'Anonymous worker access';exception when insufficient_privilege then null;end;
 execute 'reset role';
 -- Expiry and pending reissue are checked without changing any native password.
 update pv_accounts.managed_accounts set status='pending',expires_at=now()-interval '1 minute',temporary_hash=extensions.crypt('Synthetic-Temporary-Secret-1',extensions.gen_salt('bf',10)) where user_id=u;
 execute 'set local role service_role';x:=public.managed_accounts_worker('temporary','{"alias":"synthetic-onboard","password":"Synthetic-Temporary-Secret-1"}');if (x->>'valid')::boolean then raise exception 'Expired temporary password accepted';end if;
 payload:=payload-'request';perform public.managed_accounts_worker('register',payload);x:=public.managed_accounts_worker('temporary','{"alias":"synthetic-onboard","password":"Synthetic-Temporary-Secret-1"}');if not (x->>'valid')::boolean then raise exception 'Pending reissue failed';end if;
 execute 'reset role';
end $$;
rollback;
