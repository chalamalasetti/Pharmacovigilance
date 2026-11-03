-- Passwords stay in native Auth. New self-signup identities remain banned until
-- an authorized admin approves; recovery secrets are high-entropy, hashed, one-use.
create table pv_accounts.self_accounts(id uuid not null unique default gen_random_uuid(),user_id uuid primary key references auth.users(id),status text not null default 'pending' check(status in ('pending','approving','approved','declined')),created_at timestamptz not null default now(),reviewed_by uuid,reviewed_at timestamptz,lease uuid,lease_until timestamptz);
create table pv_accounts.recovery_codes(user_id uuid not null references auth.users(id),code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),created_at timestamptz not null default now(),used_at timestamptz,primary key(user_id,code_hash));
create table pv_accounts.reset_support(id uuid primary key default gen_random_uuid(),identifier text not null,status text not null default 'open' check(status in ('open','reviewed')),created_at timestamptz not null default now(),reviewed_by uuid,reviewed_at timestamptz,outcome text);
alter table pv_accounts.self_accounts enable row level security;
alter table pv_accounts.recovery_codes enable row level security;
alter table pv_accounts.reset_support enable row level security;
revoke all on pv_accounts.self_accounts,pv_accounts.recovery_codes,pv_accounts.reset_support from public,anon,authenticated;
create function pv_accounts.self_manage(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if not exists(select 1 from auth.users u where u.id=uid and u.raw_app_meta_data->>'pv_self_signup'='true' and u.banned_until>now()) then raise exception 'Pending native account required';end if;
 insert into pv_accounts.self_accounts(user_id) values(uid) returning * into r;
 codes:=p_data->'hashes';if jsonb_typeof(codes) is distinct from 'array' or jsonb_array_length(codes)<>8 or (select count(distinct value) from jsonb_array_elements_text(codes))<>8 then raise exception 'Eight unique recovery hashes required';end if;
 for hash in select jsonb_array_elements_text(codes) loop insert into pv_accounts.recovery_codes(user_id,code_hash) values(uid,hash);end loop;
 insert into pv_accounts.account_events(user_id,action) values(uid,'signup_pending_approval');return jsonb_build_object('reference',r.id);
 elsif p_action='list' then
 return jsonb_build_object('registrations',coalesce((select jsonb_agg(to_jsonb(x)) from(select u.id as user_id,p.login_alias,p.professional_role,coalesce(s.status,'setup-incomplete') as status,coalesce(s.created_at,u.created_at) as created_at from auth.users u join public.account_profiles p on p.user_id=u.id left join pv_accounts.self_accounts s on s.user_id=u.id where u.raw_app_meta_data->>'pv_self_signup'='true' and coalesce(s.status,'pending') in ('pending','approving') order by coalesce(s.created_at,u.created_at) limit 100)x),'[]'::jsonb),'support',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,identifier,created_at,status from pv_accounts.reset_support where status='open' order by created_at limit 100)x),'[]'::jsonb));
 elsif p_action='approval-claim' then
 uid:=(p_data->>'user')::uuid;
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'pv_self_signup'='true') then raise exception 'Not a self-signup account';end if;
 insert into pv_accounts.self_accounts(user_id) values(uid) on conflict do nothing;
 select * into r from pv_accounts.self_accounts where user_id=uid for update;
 if r.status not in ('pending','approving') or r.status='approving' and r.lease_until>now() then raise exception 'Approval changed; reload';end if;
 token:=gen_random_uuid();update pv_accounts.self_accounts set status='approving',lease=token,lease_until=now()+interval '2 minutes',reviewed_by=actor where user_id=uid;
 return jsonb_build_object('user',uid,'lease',token);
 elsif p_action='approval-finish' then
 uid:=(p_data->>'user')::uuid;token:=(p_data->>'lease')::uuid;
 if not exists(select 1 from auth.users where id=uid and (banned_until is null or banned_until<=now())) then raise exception 'Native account still blocked';end if;
 update pv_accounts.self_accounts set status='approved',reviewed_by=actor,reviewed_at=now(),lease=null,lease_until=null where user_id=uid and status='approving' and lease=token and reviewed_by=actor;
 if not found then raise exception 'Approval changed; reload';end if;
 insert into pv_accounts.account_events(actor,user_id,action) values(actor,uid,'signup_approved');return '{"ok":true}';
 elsif p_action='decline' then
 uid:=(p_data->>'user')::uuid;
 if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'pv_self_signup'='true' and banned_until>now()) then raise exception 'Pending native account required';end if;
 insert into pv_accounts.self_accounts(user_id) values(uid) on conflict do nothing;
 update pv_accounts.self_accounts set status='declined',reviewed_by=actor,reviewed_at=now() where user_id=uid and status='pending';if not found then raise exception 'Approval changed; reload';end if;
 insert into pv_accounts.account_events(actor,user_id,action) values(actor,uid,'signup_declined');return '{"ok":true}';
 elsif p_action='codes' then
 uid:=(p_data->>'user')::uuid;
 if not exists(select 1 from auth.users u where u.id=uid and (u.banned_until is null or u.banned_until<=now())) or exists(select 1 from pv_accounts.self_accounts where user_id=uid and status<>'approved') or exists(select 1 from pv_accounts.managed_accounts where user_id=uid and status<>'active') then raise exception 'Active account required';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if exists(select 1 from pv_accounts.recovery_codes where user_id=uid and created_at>now()-interval '1 minute') then raise exception 'Wait one minute before replacing recovery codes';end if;
 codes:=p_data->'hashes';if jsonb_typeof(codes) is distinct from 'array' or jsonb_array_length(codes)<>8 or (select count(distinct value) from jsonb_array_elements_text(codes))<>8 then raise exception 'Eight unique recovery hashes required';end if;
 delete from pv_accounts.recovery_codes where user_id=uid;
 for hash in select jsonb_array_elements_text(codes) loop insert into pv_accounts.recovery_codes(user_id,code_hash) values(uid,hash);end loop;
 insert into pv_accounts.account_events(actor,user_id,action) values(uid,uid,'recovery_codes_replaced');return '{"ok":true}';
 elsif p_action='recovery-claim' then
 hash:=p_data->>'hash';if hash is null or hash !~ '^[a-f0-9]{64}$' then return '{"valid":false}';end if;
 select u.id into uid from auth.users u left join public.account_profiles p on p.user_id=u.id where (p.login_alias=identifier or lower(u.email)=identifier) and (u.banned_until is null or u.banned_until<=now()) and not exists(select 1 from pv_accounts.self_accounts s where s.user_id=u.id and s.status<>'approved') and not exists(select 1 from pv_accounts.managed_accounts m where m.user_id=u.id and m.status<>'active') limit 1;
 if uid is null then return '{"valid":false}';end if;
 update pv_accounts.recovery_codes set used_at=now() where user_id=uid and code_hash=hash and used_at is null;
 if not found then return '{"valid":false}';end if;
 insert into pv_accounts.account_events(user_id,action) values(uid,'recovery_code_consumed');return jsonb_build_object('valid',true,'user',uid);
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
revoke all on function pv_accounts.self_manage(text,jsonb) from public,anon,authenticated;
grant execute on function pv_accounts.self_manage(text,jsonb) to service_role;
create function public.self_accounts_worker(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select pv_accounts.self_manage(p_action,p_data)$$;
revoke all on function public.self_accounts_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.self_accounts_worker(text,jsonb) to service_role;

create or replace function pv_accounts.resolve_alias(p_alias text) returns jsonb language plpgsql security definer set search_path='' as $$
declare key text;n integer;allowed boolean:=true;address text;pending boolean:=false;approval boolean:=false;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server only';end if;
 if p_alias is null or p_alias !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then return jsonb_build_object('allowed',true,'email',null);end if;
 delete from pv_accounts.login_limits where window_start<now()-interval '16 minutes';
 foreach key in array array['global',md5(p_alias)] loop
 insert into pv_accounts.login_limits as l values(key,now(),1) on conflict(bucket) do update set attempts=case when l.window_start<now()-case when key='global' then interval '1 minute' else interval '15 minutes' end then 1 else l.attempts+1 end,window_start=case when l.window_start<now()-case when key='global' then interval '1 minute' else interval '15 minutes' end then now() else l.window_start end returning attempts into n;
 if n>(case when key='global' then 120 else 10 end) then allowed:=false;end if;
 end loop;
 if allowed then select u.email,coalesce(m.status<>'active',false),coalesce(u.raw_app_meta_data->>'pv_self_signup'='true',false) and coalesce(s.status,'pending')<>'approved' into address,pending,approval from public.account_profiles p join auth.users u on u.id=p.user_id left join pv_accounts.managed_accounts m on m.user_id=u.id left join pv_accounts.self_accounts s on s.user_id=u.id where p.login_alias=p_alias;end if;
 return jsonb_build_object('allowed',allowed,'email',address,'pending',coalesce(pending,false),'approvalPending',coalesce(approval,false));
end $$;
notify pgrst,'reload schema';
