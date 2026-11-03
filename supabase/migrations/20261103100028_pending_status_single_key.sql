-- Restricted native sessions have no database or workspace RPC privileges.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='pv_pending') then create role pv_pending nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;end if;
end $$;
grant pv_pending to authenticator;
grant usage on schema public to pv_pending;
revoke create on schema public from public;
-- Preserve existing anon/authenticated/service behavior while removing their
-- accidental PUBLIC inheritance from the new restricted role.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') loop
 execute format('revoke execute on function %s from public',f.signature);
 execute format('grant execute on function %s to anon,authenticated,service_role',f.signature);
 end loop;
end $$;
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter table pv_accounts.self_accounts add column transition_kind text;
alter table pv_accounts.recovery_codes add column reset_token uuid;
create table pv_accounts.account_messages(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),actor uuid references auth.users(id),body text not null check(length(body) between 1 and 2000),created_at timestamptz not null default now());
create index account_messages_user_time on pv_accounts.account_messages(user_id,created_at);
alter table pv_accounts.account_messages enable row level security;
revoke all on pv_accounts.account_messages from public,anon,authenticated,pv_pending;
create function pv_accounts.account_status(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;actor uuid;alias text;r pv_accounts.self_accounts;u auth.users;token uuid;hash text;body text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server only';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>6000 then raise exception 'Invalid status request';end if;
 if p_action='scope-claim' then
 alias:=lower(trim(p_data->>'identifier'));select a.* into u from auth.users a join public.account_profiles p on p.user_id=a.id where (p.login_alias=alias or lower(a.email)=alias or a.id::text=p_data->>'user') and a.raw_app_meta_data->>'pv_self_signup'='true' limit 1;
 if u.id is null then return '{"ready":true}';end if;
 insert into pv_accounts.self_accounts(user_id) values(u.id) on conflict do nothing;
 select * into r from pv_accounts.self_accounts where user_id=u.id for update;
 if r.status='approved' then return '{"ready":true}';end if;
 if r.lease_until>now() then return '{"wait":true}';end if;
 if u.role='pv_pending' then return jsonb_build_object('ready',u.banned_until is null or u.banned_until<=now());end if;
 token:=gen_random_uuid();update pv_accounts.self_accounts set lease=token,lease_until=now()+interval '2 minutes',transition_kind='scope' where user_id=u.id;
 return jsonb_build_object('user',u.id,'lease',token);
 elsif p_action='scope-finish' then
 uid:=(p_data->>'user')::uuid;token:=(p_data->>'lease')::uuid;
 if not exists(select 1 from auth.users where id=uid and role='pv_pending' and (banned_until is null or banned_until<=now())) then raise exception 'Restricted native role not ready';end if;
 update pv_accounts.self_accounts set lease=null,lease_until=null,transition_kind=null where user_id=uid and lease=token and transition_kind='scope' and status<>'approved';if not found then raise exception 'Login transition changed';end if;
 insert into pv_accounts.account_events(user_id,action) values(uid,'restricted_login_enabled');return '{"ready":true}';
 elsif p_action='status' then
 uid:=(p_data->>'user')::uuid;
 select * into u from auth.users where id=uid and (banned_until is null or banned_until<=now());if not found then raise exception 'Account unavailable';end if;
 return jsonb_build_object('status',coalesce((select status from pv_accounts.self_accounts where user_id=uid),'approved'),'role',u.role,'alias',(select login_alias from public.account_profiles where user_id=uid),'messages',coalesce((select jsonb_agg(to_jsonb(x)) from(select m.id,m.body,m.created_at from pv_accounts.account_messages m where m.user_id=uid order by m.created_at desc limit 100)x),'[]'::jsonb));
 elsif p_action='reconsider' then
 uid:=(p_data->>'user')::uuid;
 update pv_accounts.self_accounts set status='pending',reviewed_by=null,reviewed_at=null where user_id=uid and status='declined' and (lease_until is null or lease_until<=now());if not found then raise exception 'Account is not eligible for reconsideration';end if;
 insert into pv_accounts.account_events(user_id,action) values(uid,'reconsideration_requested');return '{"ok":true}';
 elsif p_action='message' then
 actor:=(p_data->>'actor')::uuid;uid:=(p_data->>'user')::uuid;body:=trim(p_data->>'body');
 if not exists(select 1 from auth.users a join public.research_admins b on lower(a.email)=lower(b.email) where a.id=actor and (a.banned_until is null or a.banned_until<=now())) then raise exception 'Admin required';end if;
 if body is null or length(body) not between 1 and 2000 then raise exception 'Enter an administrator message';end if;
 insert into pv_accounts.account_messages(user_id,actor,body) values(uid,actor,body);
 insert into pv_accounts.account_events(actor,user_id,action) values(actor,uid,'administrator_message_sent');return '{"ok":true}';
 elsif p_action='recovery-key' then
 uid:=(p_data->>'user')::uuid;token:=(p_data->>'token')::uuid;hash:=p_data->>'hash';
 if hash is null or hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid recovery key hash';end if;
 perform 1 from pv_accounts.recovery_codes where user_id=uid and reset_token=token and used_at is not null for update;
 if not found then raise exception 'Recovery transition changed';end if;
 delete from pv_accounts.recovery_codes where user_id=uid;
 insert into pv_accounts.recovery_codes(user_id,code_hash) values(uid,hash);
 insert into pv_accounts.account_events(user_id,action) values(uid,'replacement_recovery_key_issued');return '{"ok":true}';
 else raise exception 'Unknown status operation';end if;
end $$;
revoke all on function pv_accounts.account_status(text,jsonb) from public,anon,authenticated,pv_pending;
grant execute on function pv_accounts.account_status(text,jsonb) to service_role;
create function public.account_status_worker(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select pv_accounts.account_status(p_action,p_data)$$;
revoke all on function public.account_status_worker(text,jsonb) from public,anon,authenticated,pv_pending;
grant execute on function public.account_status_worker(text,jsonb) to service_role;

create or replace function pv_accounts.self_manage(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;uid uuid;identifier text;r pv_accounts.self_accounts;k text;n integer;allowed boolean:=true;hash text;ref uuid;codes jsonb;mode text;token uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server only';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>6000 then raise exception 'Invalid account request';end if;
 identifier:=lower(trim(p_data->>'identifier'));
 if p_action in ('list','approval-claim','approval-finish','decline','support-review') then
 actor:=(p_data->>'actor')::uuid;
 if not exists(select 1 from auth.users u join public.research_admins a on lower(a.email)=lower(u.email) where u.id=actor and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Admin required';end if;
 end if;
 if p_action='budget' then
 mode:=p_data->>'mode';if mode not in ('signup','recovery','support') or identifier is null or length(identifier) not between 3 and 254 then raise exception 'Invalid request';end if;
 delete from pv_accounts.request_limits where window_start<now()-interval '2 hours';
 foreach k in array array[mode||'-global',mode||'-'||md5(identifier)] loop
 insert into pv_accounts.request_limits as l values(k,now(),1) on conflict(bucket) do update set attempts=case when l.window_start<now()-interval '1 hour' then 1 else l.attempts+1 end,window_start=case when l.window_start<now()-interval '1 hour' then now() else l.window_start end returning attempts into n;
 if n>(case when k=mode||'-global' then case when mode='recovery' then 60 else 10 end else case when mode='recovery' then 10 else 2 end end) then allowed:=false;end if;
 end loop;return jsonb_build_object('allowed',allowed);
 elsif p_action='register' then
 uid:=(p_data->>'user')::uuid;
 if not exists(select 1 from auth.users u where u.id=uid and u.raw_app_meta_data->>'pv_self_signup'='true' and (u.role='pv_pending' or u.banned_until>now())) then raise exception 'Pending native account required';end if;
 insert into pv_accounts.self_accounts(user_id) values(uid) returning * into r;
 codes:=p_data->'hashes';if jsonb_typeof(codes) is distinct from 'array' or jsonb_array_length(codes) not in (1,8) or (select count(distinct value) from jsonb_array_elements_text(codes))<>jsonb_array_length(codes) then raise exception 'One unique recovery key hash required';end if;
 for hash in select jsonb_array_elements_text(codes) loop insert into pv_accounts.recovery_codes(user_id,code_hash) values(uid,hash);end loop;
 insert into pv_accounts.account_events(user_id,action) values(uid,'signup_pending_approval');return jsonb_build_object('reference',r.id);
 elsif p_action='list' then
 return jsonb_build_object('registrations',coalesce((select jsonb_agg(to_jsonb(x)) from(select u.id as user_id,p.login_alias,p.professional_role,coalesce(s.status,'setup-incomplete') as status,coalesce(s.created_at,u.created_at) as created_at from auth.users u join public.account_profiles p on p.user_id=u.id left join pv_accounts.self_accounts s on s.user_id=u.id where u.raw_app_meta_data->>'pv_self_signup'='true'  order by coalesce(s.created_at,u.created_at) limit 100)x),'[]'::jsonb),'support',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,identifier,created_at,status from pv_accounts.reset_support where status='open' order by created_at limit 100)x),'[]'::jsonb));
 elsif p_action='approval-claim' then
 uid:=(p_data->>'user')::uuid;
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'pv_self_signup'='true') then raise exception 'Not a self-signup account';end if;
 insert into pv_accounts.self_accounts(user_id) values(uid) on conflict do nothing;
 select * into r from pv_accounts.self_accounts where user_id=uid for update;
 if r.status not in ('pending','approving') or r.lease_until>now() then raise exception 'Approval changed; reload';end if;
 token:=gen_random_uuid();update pv_accounts.self_accounts set status='approving',lease=token,lease_until=now()+interval '2 minutes',transition_kind='approval',reviewed_by=actor where user_id=uid;
 return jsonb_build_object('user',uid,'lease',token);
 elsif p_action='approval-finish' then
 uid:=(p_data->>'user')::uuid;token:=(p_data->>'lease')::uuid;
 if not exists(select 1 from auth.users where id=uid and role='authenticated' and (banned_until is null or banned_until<=now())) then raise exception 'Native account still blocked';end if;
 update pv_accounts.self_accounts set status='approved',reviewed_by=actor,reviewed_at=now(),lease=null,lease_until=null,transition_kind=null where user_id=uid and status='approving' and lease=token and reviewed_by=actor;
 if not found then raise exception 'Approval changed; reload';end if;
 insert into pv_accounts.account_events(actor,user_id,action) values(actor,uid,'signup_approved');insert into pv_accounts.account_messages(user_id,actor,body) values(uid,actor,'Your account is approved. You can now enter the PV Info workspace.');return '{"ok":true}';
 elsif p_action='decline' then
 uid:=(p_data->>'user')::uuid;
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'pv_self_signup'='true' and (role='pv_pending' or banned_until>now())) then raise exception 'Pending native account required';end if;
 insert into pv_accounts.self_accounts(user_id) values(uid) on conflict do nothing;
 update pv_accounts.self_accounts set status='declined',reviewed_by=actor,reviewed_at=now() where user_id=uid and status in ('pending','declined') and (lease_until is null or lease_until<=now());if not found then raise exception 'Approval changed; reload';end if;
 insert into pv_accounts.account_events(actor,user_id,action) values(actor,uid,'signup_declined');insert into pv_accounts.account_messages(user_id,actor,body) values(uid,actor,'Your account has not been approved. Read the administrator messages for details. You can request reconsideration here.');return '{"ok":true}';
 elsif p_action='codes' then
 uid:=(p_data->>'user')::uuid;
 if not exists(select 1 from auth.users u where u.id=uid and (u.banned_until is null or u.banned_until<=now())) or exists(select 1 from pv_accounts.managed_accounts where user_id=uid and status<>'active') then raise exception 'Active account required';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if exists(select 1 from pv_accounts.recovery_codes where user_id=uid and created_at>now()-interval '1 minute') then raise exception 'Wait one minute before replacing recovery codes';end if;
 codes:=p_data->'hashes';if jsonb_typeof(codes) is distinct from 'array' or jsonb_array_length(codes) not in (1,8) or (select count(distinct value) from jsonb_array_elements_text(codes))<>jsonb_array_length(codes) then raise exception 'One unique recovery key hash required';end if;
 delete from pv_accounts.recovery_codes where user_id=uid;
 for hash in select jsonb_array_elements_text(codes) loop insert into pv_accounts.recovery_codes(user_id,code_hash) values(uid,hash);end loop;
 insert into pv_accounts.account_events(actor,user_id,action) values(uid,uid,'recovery_codes_replaced');return '{"ok":true}';
 elsif p_action='recovery-claim' then
 hash:=p_data->>'hash';if hash is null or hash !~ '^[a-f0-9]{64}$' then return '{"valid":false}';end if;
 select u.id into uid from auth.users u left join public.account_profiles p on p.user_id=u.id where (p.login_alias=identifier or lower(u.email)=identifier) and (u.banned_until is null or u.banned_until<=now()) and not exists(select 1 from pv_accounts.managed_accounts m where m.user_id=u.id and m.status<>'active') limit 1;
 if uid is null then return '{"valid":false}';end if;
 update pv_accounts.recovery_codes set used_at=now(),reset_token=gen_random_uuid() where user_id=uid and code_hash=hash and used_at is null returning reset_token into token;
 if not found then return '{"valid":false}';end if;
 insert into pv_accounts.account_events(user_id,action) values(uid,'recovery_code_consumed');return jsonb_build_object('valid',true,'user',uid,'token',token);
 elsif p_action='support' then
 if identifier is null or length(identifier) not between 3 and 254 then raise exception 'Enter your user ID';end if;
 insert into pv_accounts.reset_support(identifier) values(identifier) returning id into ref;return jsonb_build_object('reference',ref);
 elsif p_action='support-review' then
 ref:=(p_data->>'reference')::uuid;
 if p_data->>'outcome' is null or p_data->>'outcome' not in ('Identity verification needed','User recovered with a code','Duplicate / no action') then raise exception 'Choose a review outcome';end if;
 update pv_accounts.reset_support set status='reviewed',reviewed_by=actor,reviewed_at=now(),outcome=p_data->>'outcome' where id=ref and status='open';if not found then raise exception 'Request changed; reload';end if;
 insert into pv_accounts.account_events(actor,request_id,action) values(actor,ref,'recovery_assistance_reviewed');return '{"ok":true}';
 else raise exception 'Unknown operation';end if;
end $$;

notify pgrst,'reload schema';
