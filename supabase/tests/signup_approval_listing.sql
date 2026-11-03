-- Run through an authorized database connection. Read-only and rolled back;
-- returns no account identifiers, profile fields or recovery material.
begin read only;
do $$
begin
 if has_function_privilege('anon','public.self_accounts_worker(text,jsonb)','execute')
 or has_function_privilege('authenticated','public.self_accounts_worker(text,jsonb)','execute')
 or has_function_privilege('pv_pending','public.self_accounts_worker(text,jsonb)','execute') then
  raise exception 'Account worker must remain server-only';
 end if;
 perform set_config('pv.test_admin',(select u.id::text from auth.users u
 join public.research_admins a on lower(a.email)=lower(u.email)
 where u.banned_until is null or u.banned_until<=now() limit 1),true);
 if nullif(current_setting('pv.test_admin',true),'') is null then
  raise exception 'An existing site administrator is required for this read-only regression check';
 end if;
end $$;
set local role service_role;
do $$
declare result jsonb;
begin
 -- Exercise the real SQL, including the support subquery even when it is empty.
 result := public.self_accounts_worker('list',jsonb_build_object('actor',current_setting('pv.test_admin')));
 if jsonb_typeof(result->'registrations') is distinct from 'array'
 or jsonb_typeof(result->'support') is distinct from 'array' then
  raise exception 'Invalid admin-list response';
 end if;
 begin
  perform public.self_accounts_worker('list',jsonb_build_object('actor','00000000-0000-0000-0000-000000000000'));
  raise exception 'Nonadmin list unexpectedly succeeded';
 exception when others then
  if sqlerrm <> 'Admin required' then raise; end if;
 end;
end $$;
rollback;
