-- Extend site settings without replacing any existing menu or other settings.
alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check check(key in ('hidden_nav','nav_order','status_strip','navigation'));

create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','research','companies','globe','resources','agencies','archive','about'];
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or v->'version' is distinct from '1'::jsonb or jsonb_typeof(v->'groups') is distinct from 'array' then raise exception 'Invalid navigation layout';end if;
 if jsonb_array_length(v->'groups') not between 1 and 12 then raise exception 'Use between 1 and 12 menu groups';end if;
 for g in select * from jsonb_array_elements(v->'groups') loop
  if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'id') is distinct from 'string' or g->>'id' !~ '^[a-z0-9-]{1,40}$' or g->>'id'=any(gids) or jsonb_typeof(g->'label') is distinct from 'string' or length(trim(g->>'label')) not between 1 and 32 or jsonb_typeof(g->'items') is distinct from 'array' then raise exception 'Invalid group ID, name or item list';end if;
  gids:=array_append(gids,g->>'id');
  if jsonb_array_length(g->'items')>12 then raise exception 'Too many items in a group';end if;
  for i in select * from jsonb_array_elements(g->'items') loop
   if jsonb_typeof(i) is distinct from 'object' or not coalesce(i->>'id'=any(known),false) or i->>'id'=any(pages) or jsonb_typeof(i->'label') is distinct from 'string' or length(trim(i->>'label')) not between 1 and 32 or jsonb_typeof(i->'hidden') is distinct from 'boolean' then raise exception 'Invalid, duplicate or unknown page';end if;
   if i->>'id'='index' and (i->>'hidden')::boolean then raise exception 'Updates must stay visible';end if;
   pages:=array_append(pages,i->>'id');
  end loop;
 end loop;
 if cardinality(pages)<>cardinality(known) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
end $$;
revoke all on function public.validate_site_navigation(jsonb) from public,anon,authenticated;

create or replace function public.admin_save_navigation(v jsonb,expected timestamptz default null) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare previous timestamptz; saved timestamptz;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Only an admin can do that';end if;
 perform public.validate_site_navigation(v);
 perform pg_advisory_xact_lock(hashtextextended('pv-info-navigation',0));
 select updated_at into previous from public.site_settings where key='navigation' for update;
 if previous is distinct from expected then raise exception 'The menu changed in another session. Discard your draft and reload before saving';end if;
 insert into public.site_settings(key,value,by_email,updated_at) values('navigation',v,auth.jwt()->>'email',clock_timestamp())
 on conflict(key) do update set value=excluded.value,by_email=excluded.by_email,updated_at=excluded.updated_at returning updated_at into saved;
 perform public.admin_log('navigation layout changed','navigation',jsonb_build_object('groupCount',jsonb_array_length(v->'groups')));
 return saved;
end $$;
revoke all on function public.admin_save_navigation(jsonb,timestamptz) from public,anon;
grant execute on function public.admin_save_navigation(jsonb,timestamptz) to authenticated;
notify pgrst,'reload schema';
