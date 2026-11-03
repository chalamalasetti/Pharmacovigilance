-- Temporary onboarding secrets never become native Auth passwords. Until the
-- first permanent password is set, Auth has a separate unshared random password.
create table pv_accounts.managed_accounts(
 user_id uuid primary key references auth.users(id),temporary_hash text,
 status text not null check(status in ('pending','changing','active')),
 expires_at timestamptz not null,lease uuid,lease_until timestamptz,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),activated_at timestamptz
);
create table pv_accounts.access_requests(
 id uuid primary key default gen_random_uuid(),login_alias text not null,
 contact_email text,professional_role text,
 status text not null default 'pending' check(status in ('pending','provisioned','declined')),
 created_at timestamptz not null default now(),reviewed_by uuid,reviewed_at timestamptz,user_id uuid
);
create table pv_accounts.account_events(id bigint generated always as identity primary key,actor uuid,user_id uuid,request_id uuid,action text not null,at timestamptz not null default now());
create table pv_accounts.request_limits(bucket text primary key,window_start timestamptz not null,attempts integer not null);
alter table pv_accounts.managed_accounts enable row level security;
alter table pv_accounts.access_requests enable row level security;
alter table pv_accounts.account_events enable row level security;
alter table pv_accounts.request_limits enable row level security;
revoke all on pv_accounts.managed_accounts,pv_accounts.access_requests,pv_accounts.account_events,pv_accounts.request_limits from public,anon,authenticated;
create function pv_accounts.manage(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;uid uuid;alias text;address text;r pv_accounts.managed_accounts;request uuid;k text;n integer;allowed boolean:=true;temp text;token uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server only';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>5000 then raise exception 'Invalid request';end if;
 alias:=p_data->>'alias';
 if p_action in ('request','register','temporary','claim') and (alias is null or alias !~ '^[a-z0-9][a-z0-9._-]{2,31}$') then raise exception 'Invalid user ID';end if;
 if p_action in ('list','register','decline') then
 actor:=(p_data->>'actor')::uuid;
 if not exists(select 1 from auth.users u join public.research_admins a on lower(a.email)=lower(u.email) where u.id=actor and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Admin required';end if;
 end if;
 if p_action='request' then
 address:=nullif(lower(trim(p_data->>'email')),'');
 if address is not null and (length(address)>254 or address !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$') then raise exception 'Invalid contact email';end if;
 if p_data->>'role' is not null and p_data->>'role' not in ('Safety operations','Regulatory affairs','Safety science','Quality assurance','Safety systems / IT','Clinical development','Research','Other') then raise exception 'Invalid professional role';end if;
 delete from pv_accounts.request_limits where window_start<now()-interval '2 hours';
 foreach k in array array['global',md5(alias)] loop
 insert into pv_accounts.request_limits as l values(k,now(),1) on conflict(bucket) do update set attempts=case when l.window_start<now()-interval '1 hour' then 1 else l.attempts+1 end,window_start=case when l.window_start<now()-interval '1 hour' then now() else l.window_start end returning attempts into n;
 if n>(case when k='global' then 30 else 2 end) then allowed:=false;end if;
 end loop;
 if not allowed then return jsonb_build_object('limited',true);end if;
 insert into pv_accounts.access_requests(login_alias,contact_email,professional_role) values(alias,address,p_data->>'role') returning id into request;
 return jsonb_build_object('reference',request);
 elsif p_action='list' then
 return jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,login_alias,contact_email,professional_role,status,created_at from pv_accounts.access_requests where status='pending' order by created_at limit 100)x),'[]'::jsonb),'accounts',coalesce((select jsonb_agg(to_jsonb(x)) from(select p.login_alias,m.status,m.expires_at,m.created_at,m.activated_at from pv_accounts.managed_accounts m join public.account_profiles p on p.user_id=m.user_id order by m.created_at desc limit 100)x),'[]'::jsonb));
 elsif p_action='decline' then
 request:=(p_data->>'request')::uuid;update pv_accounts.access_requests set status='declined',reviewed_by=actor,reviewed_at=now() where id=request and status='pending';
 if not found then raise exception 'Request changed; reload';end if;
 insert into pv_accounts.account_events(actor,request_id,action) values(actor,request,'declined');return '{"ok":true}';
 elsif p_action='register' then
 uid:=(p_data->>'user')::uuid;temp:=p_data->>'temporary';
 if temp is null or length(temp) not between 24 and 64 then raise exception 'Invalid temporary secret';end if;
 if not exists(select 1 from auth.users u join public.account_profiles p on p.user_id=u.id where u.id=uid and p.login_alias=alias and u.raw_app_meta_data->>'pv_managed'='true') then raise exception 'Not a managed account';end if;
 insert into pv_accounts.managed_accounts as m(user_id,temporary_hash,status,expires_at,created_by) values(uid,extensions.crypt(temp,extensions.gen_salt('bf',10)),'pending',now()+interval '72 hours',actor)
 on conflict(user_id) do update set temporary_hash=excluded.temporary_hash,status='pending',expires_at=excluded.expires_at,lease=null,lease_until=null where m.status='pending' or m.status='changing' and m.lease_until<now() returning * into r;
 if not found then raise exception 'Account already activated or being activated';end if;
 request:=nullif(p_data->>'request','')::uuid;
 if request is not null then update pv_accounts.access_requests set status='provisioned',user_id=uid,reviewed_by=actor,reviewed_at=now() where id=request and status='pending' and login_alias=alias; if not found then raise exception 'Request changed; reload';end if;end if;
 insert into pv_accounts.account_events(actor,user_id,request_id,action) values(actor,uid,request,'temporary_issued');
 return jsonb_build_object('expires',r.expires_at);
 elsif p_action in ('temporary','claim') then
 select m.* into r from pv_accounts.managed_accounts m join public.account_profiles p on p.user_id=m.user_id where p.login_alias=alias for update of m;
 temp:=p_data->>'password';
 if r.user_id is null or r.status='active' or r.expires_at<now() or length(coalesce(temp,'')) not between 1 and 64 or r.status='changing' and r.lease_until>now() then return '{"valid":false}';end if;
 if extensions.crypt(temp,r.temporary_hash) is distinct from r.temporary_hash then return '{"valid":false}';end if;
 if p_action='temporary' then return '{"valid":true}';end if;
 token:=gen_random_uuid();update pv_accounts.managed_accounts set status='changing',lease=token,lease_until=now()+interval '2 minutes' where user_id=r.user_id;
 select email into address from auth.users where id=r.user_id;
 return jsonb_build_object('valid',true,'user',r.user_id,'lease',token,'email',address);
 elsif p_action='finish' then
 uid:=(p_data->>'user')::uuid;token:=(p_data->>'lease')::uuid;
 update pv_accounts.managed_accounts set status='active',temporary_hash=null,lease=null,lease_until=null,activated_at=now() where user_id=uid and status='changing' and lease=token;
 if not found then raise exception 'Activation changed; retry sign-in';end if;
 insert into pv_accounts.account_events(user_id,action) values(uid,'permanent_password_set');return '{"ok":true}';
 else raise exception 'Unknown action';end if;
end $$;
revoke all on function pv_accounts.manage(text,jsonb) from public,anon,authenticated;
grant execute on function pv_accounts.manage(text,jsonb) to service_role;
create function public.managed_accounts_worker(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select pv_accounts.manage(p_action,p_data)$$;
revoke all on function public.managed_accounts_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.managed_accounts_worker(text,jsonb) to service_role;
-- Alias lookup stays server-only; pending accounts never enter the native token flow.
create or replace function pv_accounts.resolve_alias(p_alias text) returns jsonb language plpgsql security definer set search_path='' as $$
declare key text;n integer;allowed boolean:=true;address text;pending boolean:=false;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server only';end if;
 if p_alias is null or p_alias !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then return jsonb_build_object('allowed',true,'email',null);end if;
 delete from pv_accounts.login_limits where window_start<now()-interval '16 minutes';
 foreach key in array array['global',md5(p_alias)] loop
 insert into pv_accounts.login_limits as l values(key,now(),1) on conflict(bucket) do update set attempts=case when l.window_start<now()-case when key='global' then interval '1 minute' else interval '15 minutes' end then 1 else l.attempts+1 end,window_start=case when l.window_start<now()-case when key='global' then interval '1 minute' else interval '15 minutes' end then now() else l.window_start end returning attempts into n;
 if n>(case when key='global' then 120 else 10 end) then allowed:=false;end if;
 end loop;
 if allowed then select u.email,coalesce(m.status<>'active',false) into address,pending from public.account_profiles p join auth.users u on u.id=p.user_id left join pv_accounts.managed_accounts m on m.user_id=u.id where p.login_alias=p_alias;end if;
 return jsonb_build_object('allowed',allowed,'email',address,'pending',coalesce(pending,false));
end $$;
notify pgrst,'reload schema';
