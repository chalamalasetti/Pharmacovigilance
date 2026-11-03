-- Real permission checks and synthetic actors; rolled back in full.
begin;
do $$
declare a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();r jsonb;lease uuid;hash text:=encode(extensions.digest('synthetic-key','sha256'),'hex');token uuid;
begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data,banned_until) values(a,'authenticated','authenticated','status-editor@example.invalid','{}','{}',null),(u,'authenticated','pv_pending','status-pending@example.invalid','{"login_alias":"synthetic-status"}','{"pv_self_signup":true}',null),(v,'authenticated','authenticated','status-legacy@example.invalid','{"login_alias":"synthetic-old"}','{"pv_self_signup":true}',now()+interval '100 years');
 insert into public.research_admins(email) values('status-editor@example.invalid');
 execute 'set local role service_role';perform public.self_accounts_worker('register',jsonb_build_object('user',u,'hashes',jsonb_build_array(hash)));
 perform public.account_status_worker('message',jsonb_build_object('actor',a,'user',u,'body','Synthetic approval review message'));
 r:=public.account_status_worker('status',jsonb_build_object('user',u));if r->>'status'<>'pending' or jsonb_array_length(r->'messages')<>1 then raise exception 'Own status or message unavailable';end if;
 begin perform public.account_status_worker('message',jsonb_build_object('actor',u,'user',a,'body','Forged message'));raise exception 'Nonadmin message allowed';exception when others then if sqlerrm<>'Admin required' then raise;end if;end;
 r:=public.account_status_worker('scope-claim','{"identifier":"synthetic-old"}');lease:=(r->>'lease')::uuid;
 begin perform public.self_accounts_worker('approval-claim',jsonb_build_object('actor',a,'user',v));raise exception 'Concurrent role migration and approval allowed';exception when others then if sqlerrm<>'Approval changed; reload' then raise;end if;end;
 execute 'reset role';update auth.users set role='pv_pending',banned_until=null where id=v;execute 'set local role service_role';perform public.account_status_worker('scope-finish',jsonb_build_object('user',v,'lease',lease));
 r:=public.self_accounts_worker('approval-claim',jsonb_build_object('actor',a,'user',u));lease:=(r->>'lease')::uuid;
 begin perform public.self_accounts_worker('approval-finish',jsonb_build_object('actor',a,'user',u,'lease',lease));raise exception 'Restricted native role approved prematurely';exception when others then if sqlerrm<>'Native account still blocked' then raise;end if;end;
 execute 'reset role';update auth.users set role='authenticated' where id=u;execute 'set local role service_role';perform public.self_accounts_worker('approval-finish',jsonb_build_object('actor',a,'user',u,'lease',lease));
 r:=public.account_status_worker('status',jsonb_build_object('user',u));if r->>'status'<>'approved' or jsonb_array_length(r->'messages')<>2 then raise exception 'Approval message missing';end if;
 r:=public.self_accounts_worker('recovery-claim',jsonb_build_object('identifier','synthetic-status','hash',hash));token:=(r->>'token')::uuid;if token is null then raise exception 'Missing reset rotation proof';end if;
 perform public.account_status_worker('recovery-key',jsonb_build_object('user',u,'token',token,'hash',repeat('a',64)));
 begin perform public.account_status_worker('recovery-key',jsonb_build_object('user',u,'token',token,'hash',repeat('b',64)));raise exception 'Reset rotation replay accepted';exception when others then if sqlerrm<>'Recovery transition changed' then raise;end if;end;
 r:=public.self_accounts_worker('recovery-claim',jsonb_build_object('identifier','synthetic-status','hash',hash));if (r->>'valid')::boolean then raise exception 'Old key remained valid';end if;
 perform public.self_accounts_worker('decline',jsonb_build_object('actor',a,'user',v));r:=public.account_status_worker('status',jsonb_build_object('user',v));if r->>'status'<>'declined' then raise exception 'Declined status missing';end if;
 perform public.account_status_worker('reconsider',jsonb_build_object('user',v));r:=public.account_status_worker('status',jsonb_build_object('user',v));if r->>'status'<>'pending' then raise exception 'Reconsideration failed';end if;
 execute 'reset role';
 if (select count(*) from pv_accounts.recovery_codes where user_id=u)<>1 then raise exception 'More than one replacement key';end if;
 -- Even a JWT subject who is an admin cannot use workspace privileges when its
 -- signed role is restricted. The role cannot inherit authenticated/anon grants.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','status-editor@example.invalid','role','pv_pending')::text,true);
 execute 'set local role pv_pending';
 begin perform * from public.workspaces;raise exception 'Restricted workspace read allowed';exception when insufficient_privilege then null;end;
 begin perform public.open_company_case('forged','{}',null);raise exception 'Restricted workspace action allowed';exception when insufficient_privilege then null;end;
 begin perform public.is_app_admin();raise exception 'Restricted admin RPC allowed';exception when insufficient_privilege then null;end;
 begin perform public.account_status_worker('status',jsonb_build_object('user',u));raise exception 'Restricted service worker allowed';exception when insufficient_privilege then null;end;
 if pg_has_role(current_user,'authenticated','USAGE') or pg_has_role(current_user,'anon','USAGE') then raise exception 'Restricted role inherits app privileges';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','status-editor@example.invalid','role','authenticated')::text,true);execute 'set local role authenticated';if not public.is_app_admin() then raise exception 'Existing admin access broken';end if;execute 'reset role';
end $$;
rollback;
