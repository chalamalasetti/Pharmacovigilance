-- All synthetic changes are rolled back; no live menu is replaced.
begin;
do $$
declare v jsonb; original timestamptz; saved timestamptz; a uuid:=gen_random_uuid(); bad jsonb;
begin
 insert into public.research_admins(email) values('menu-test-admin@example.invalid');
 v:=jsonb_build_object('version',1,'groups',jsonb_build_array(jsonb_build_object('id','all-pages','label','Synthetic group','items',(
 select jsonb_agg(jsonb_build_object('id',p,'label',p,'hidden',false)) from unnest(array['index','briefing','company-briefing','action-center','team','research','companies','globe','resources','agencies','archive','about']) p))));
 select updated_at into original from public.site_settings where key='navigation';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','non-admin@example.invalid','role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin perform public.admin_save_navigation(v,original);raise exception 'Expected admin denial';exception when others then if sqlerrm not like 'Only an admin%' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email','menu-test-admin@example.invalid','role','authenticated')::text,true);
 saved:=public.admin_save_navigation(v,original);
 begin perform public.admin_save_navigation(v,original);raise exception 'Expected conflict';exception when others then if sqlerrm not like 'The menu changed%' then raise;end if;end;
 bad:=jsonb_set(v,'{groups,0,items,0,hidden}','true');
 begin perform public.admin_save_navigation(bad,saved);raise exception 'Expected protected Updates';exception when others then if sqlerrm not like 'Updates must%' then raise;end if;end;
 bad:=jsonb_set(v,'{groups,0,items,0,id}','"javascript"');
 begin perform public.admin_save_navigation(bad,saved);raise exception 'Expected unknown page denial';exception when others then if sqlerrm not like 'Invalid, duplicate%' then raise;end if;end;
 bad:=jsonb_set(v,'{groups,0,items,1,id}','"index"');
 begin perform public.admin_save_navigation(bad,saved);raise exception 'Expected duplicate denial';exception when others then if sqlerrm not like 'Invalid, duplicate%' then raise;end if;end;
 bad:=jsonb_set(v,'{groups,0,items}',(v#>'{groups,0,items}')-0);
 begin perform public.admin_save_navigation(bad,saved);raise exception 'Expected missing page denial';exception when others then if sqlerrm not like 'Keep every page%' then raise;end if;end;
 execute 'set local role anon';
 begin perform public.admin_save_navigation(v,saved);raise exception 'Expected anonymous denial';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
select 'PASS: admin-only atomic save, concurrent-edit rejection, required Updates, fixed page allowlist, uniqueness, completeness and anonymous denial; all fixtures rolled back' as result;
