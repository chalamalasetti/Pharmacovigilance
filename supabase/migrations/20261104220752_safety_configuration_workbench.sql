-- Private configuration specifications; no vendor credentials or patient records.
create schema pv_config;
revoke all on schema pv_config from public,anon;
grant usage on schema pv_config to authenticated;
create table public.pv_config_packages(
 id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),team_id uuid references public.teams(id),
 created_by uuid not null references auth.users(id),last_author uuid not null references auth.users(id),
 revision integer not null default 1,state text not null default 'draft' check(state in ('draft','in_review','approved')),
 body jsonb not null check(jsonb_typeof(body)='object' and pg_column_size(body)<250000),
 case_id uuid references public.company_cases(id),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((owner_id is not null and team_id is null) or (owner_id is null and team_id is not null))
);
create index pv_config_owner_recent on public.pv_config_packages(owner_id,updated_at desc);
create index pv_config_team_recent on public.pv_config_packages(team_id,updated_at desc);
create table public.pv_config_revisions(
 package_id uuid not null references public.pv_config_packages(id),revision integer not null,state text not null,body jsonb not null,
 actor_id uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default clock_timestamp(),primary key(package_id,revision)
);
alter table public.pv_config_packages enable row level security;
alter table public.pv_config_revisions enable row level security;
revoke all on public.pv_config_packages,public.pv_config_revisions from public,anon,authenticated;
grant select on public.pv_config_packages,public.pv_config_revisions to authenticated;
create policy "Configuration scope" on public.pv_config_packages for select to authenticated using((select auth.jwt()->>'role')='authenticated' and (owner_id=(select auth.uid()) or (team_id is not null and public.is_team_member(team_id))));
create policy "Configuration revision scope" on public.pv_config_revisions for select to authenticated using(exists(select 1 from public.pv_config_packages p where p.id=package_id));
create function pv_config.validate_body(b jsonb,ready boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare v text;r jsonb;f text;keys text[]:='{}';p jsonb:=b->'profile';s jsonb:=b->'source';
begin
 if b is null or jsonb_typeof(b)<>'object' or pg_column_size(b)>240000 or b->>'schema' is distinct from '1' or b->>'engine' is distinct from 'config-draft-v1' then raise exception 'Invalid configuration specification';end if;
 if jsonb_typeof(p) is distinct from 'object' or coalesce(p->>'system','') not in ('argus','veeva','arisg','other') or coalesce(b->>'area','') not in ('reporting','transmission','privacy','periodic','process') then raise exception 'Choose system and area';end if;
 perform public.company_case_text(b->>'title','Workspace title',200);
 -- Conservative privacy guard; no system can reliably identify every personal name in prose.
 perform public.company_case_text(b::text,'Organizational configuration',240000);
 if b::text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then raise exception 'Remove contact details';end if;
 if jsonb_typeof(b->'rules') is distinct from 'array' or jsonb_array_length(b->'rules')>200 or coalesce(b->>'baselineStatus','') not in ('incomplete','confirmed','new_scope') then raise exception 'Invalid baseline';end if;
 for r in select * from jsonb_array_elements(b->'rules') loop
  v:=public.company_case_text(r->>'key','Rule identifier',300);if v=any(keys) then raise exception 'Duplicate baseline rule';end if;keys:=array_append(keys,v);
  if coalesce(r->>'days','')<>'' and (r->>'days' !~ '^[1-9][0-9]{0,2}$') then raise exception 'Invalid reporting timeframe';end if;
 end loop;
 if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(b->'proposal') is distinct from 'object' or jsonb_typeof(b->'generated') is distinct from 'object' or b->'generated'->>'engine' is distinct from 'config-draft-v1' then raise exception 'Generate the specification before saving';end if;
 if coalesce(s->>'url','')<>'' then perform public.company_case_url(s->>'url');end if;
 if coalesce(s->>'effective','')<>'' then perform (s->>'effective')::date;end if;
 if coalesce(s->>'requirementId','')<>'' and not exists(select 1 from public.pv_requirement_versions where id=(s->>'requirementId')::uuid) then raise exception 'Pinned requirement version unavailable';end if;
 if ready then
  foreach f in array array['version','environment','company','markets'] loop perform public.company_case_text(p->>f,f,500);end loop;
  foreach f in array array['title','url','edition','location','excerpt'] loop perform public.company_case_text(s->>f,f,3000);end loop;
  if s->>'authority' is distinct from 'primary' or s->'verified' is distinct from 'true'::jsonb then raise exception 'Verify primary evidence and dates';end if;
  if b->>'applicability' is distinct from 'relevant' then raise exception 'Relevant applicability required';end if;
  perform public.company_case_text(b->>'rationale','Applicability rationale',2000);
  if b->>'baselineStatus'='incomplete' then raise exception 'Confirm baseline completeness or declare new scope';end if;
  perform public.company_case_text(b->'proposal'->>'change','Proposed change',3000);perform public.company_case_text(b->>'implementation','Implementation and rollback',3000);
  if b->>'area'='reporting' then
   if b->>'baselineStatus'='confirmed' and not coalesce(b->'proposal'->>'baselineKey'=any(keys),false) then raise exception 'Select a captured baseline rule';end if;
   foreach f in array array['key','country','license','destination','clockStart','days','dayType','format','condition','scheduling'] loop perform public.company_case_text(b->'proposal'->'rule'->>f,f,2000);end loop;
   if b->'proposal'->'rule'->>'days' !~ '^[1-9][0-9]{0,2}$' then raise exception 'Invalid proposed timeframe';end if;
  end if;
 end if;
end$$;
revoke all on function pv_config.validate_body(jsonb,boolean) from public,anon,authenticated;
create function pv_config.save(p_id uuid,p_expected integer,p_team uuid,p_command text,p_body jsonb,p_reason text) returns public.pv_config_packages language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();c public.pv_config_packages;reason text;ctx jsonb;snap jsonb;sk text;cid uuid;market text;markets jsonb;
begin
 if actor is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'Approved sign-in required';end if;
 reason:=public.company_case_text(coalesce(nullif(trim(p_reason),''),case when p_command='save' then 'Saved configuration draft' else null end),'Decision reason',2000);
 if p_id is null then
  if p_command<>'save' or p_expected<>0 then raise exception 'Save a draft first';end if;
  if p_team is not null and not public.is_team_member(p_team) then raise exception 'Team access denied';end if;
  perform pv_config.validate_body(p_body,false);
  insert into public.pv_config_packages(owner_id,team_id,created_by,last_author,body) values(case when p_team is null then actor end,p_team,actor,actor,p_body) returning * into c;
 else
  select * into c from public.pv_config_packages where id=p_id and (owner_id=actor or (team_id is not null and public.is_team_member(team_id))) for update;
  if not found then raise exception 'Configuration unavailable or access denied';end if;
  if c.revision is distinct from p_expected then raise exception 'This package changed. Reload and compare before saving';end if;
  if c.team_id is distinct from p_team then raise exception 'Scope cannot change on an existing package';end if;
  if p_command='save' then
   if c.state<>'draft' then raise exception 'Return to draft before editing';end if;
   perform pv_config.validate_body(p_body,false);c.body:=p_body;c.last_author:=actor;c.case_id:=null;
  elsif p_command='submit' then
   if c.state<>'draft' then raise exception 'Only drafts can be submitted';end if;
   perform pv_config.validate_body(c.body,true);c.state:='in_review';
  elsif p_command='approve' then
   if c.state<>'in_review' or c.team_id is null or not public.is_team_owner(c.team_id) or actor=c.last_author or actor=c.created_by then raise exception 'A different team owner must approve the submitted package';end if;
   perform pv_config.validate_body(c.body,true);c.state:='approved';
  elsif p_command='rework' then c.state:='draft';
  elsif p_command='handoff' then
   if c.case_id is not null then return c;end if;
   if coalesce(c.body->'profile'->>'company','')='' or coalesce(c.body->'profile'->>'markets','')='' then raise exception 'Company and markets required for Action Center';end if;
   perform public.company_case_url(c.body->'source'->>'url');
   select jsonb_agg(trim(x)) into markets from regexp_split_to_table(c.body->'profile'->>'markets',',') x where trim(x)<>'';
   if jsonb_array_length(markets) not between 1 and 10 then raise exception 'Use 1 to 10 comma-separated markets';end if;
   sk:='config:'||c.id::text||':'||c.revision::text;
   ctx:=jsonb_build_object('companyId',coalesce(nullif(c.body->'profile'->>'companyId',''),'config-'||c.id::text),'companyName',c.body->'profile'->>'company','markets',markets,'products','[]'::jsonb,'reason','Configuration specification for human applicability and implementation review','scopeReason',c.body->>'rationale','sourceItem',sk,'evidenceKind','configuration');
   snap:=jsonb_build_object('id',sk,'title',c.body->>'title'||' — configuration v'||c.revision::text,'link',c.body->'source'->>'url','source',c.body->'source'->>'title','companyContext',ctx);
   insert into public.company_cases(owner_id,team_id,source_key,snapshot,history) values(c.owner_id,c.team_id,sk,snap,jsonb_build_array(jsonb_build_object('command','created','by',actor::text,'at',clock_timestamp(),'version',1))) returning id into cid;c.case_id:=cid;
  else raise exception 'Unknown configuration action';end if;
  c.revision:=c.revision+1;c.updated_at:=clock_timestamp();
  update public.pv_config_packages set body=c.body,state=c.state,last_author=c.last_author,revision=c.revision,case_id=c.case_id,updated_at=c.updated_at where id=c.id;
 end if;
 insert into public.pv_config_revisions(package_id,revision,state,body,actor_id,reason) values(c.id,c.revision,c.state,c.body,actor,reason);
 return c;
end$$;
revoke all on function pv_config.save(uuid,integer,uuid,text,jsonb,text) from public,anon;
grant execute on function pv_config.save(uuid,integer,uuid,text,jsonb,text) to authenticated;
create function public.save_pv_config_package(p_id uuid,p_expected integer,p_team uuid,p_command text,p_body jsonb,p_reason text) returns public.pv_config_packages language sql security invoker set search_path='' as $$select pv_config.save(p_id,p_expected,p_team,p_command,p_body,p_reason)$$;
revoke all on function public.save_pv_config_package(uuid,integer,uuid,text,jsonb,text) from public,anon;
grant execute on function public.save_pv_config_package(uuid,integer,uuid,text,jsonb,text) to authenticated;

create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','events','company-inbox','changes','account-settings','research','companies','globe','resources','documents','requirements','agencies','archive','about','user-guide','substances','labels','safety-topics','leadership','config-workbench'];
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or v->'version' is distinct from '1'::jsonb or jsonb_typeof(v->'groups') is distinct from 'array' then raise exception 'Invalid navigation layout';end if;
 if jsonb_array_length(v->'groups') not between 1 and 12 then raise exception 'Use between 1 and 12 menu groups';end if;
 for g in select * from jsonb_array_elements(v->'groups') loop
  if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'id') is distinct from 'string' or g->>'id' !~ '^[a-z0-9-]{1,40}$' or g->>'id'=any(gids) or jsonb_typeof(g->'label') is distinct from 'string' or length(trim(g->>'label')) not between 1 and 32 or jsonb_typeof(g->'items') is distinct from 'array' then raise exception 'Invalid group ID, name or item list';end if;
  gids:=array_append(gids,g->>'id');
  if jsonb_array_length(g->'items')>cardinality(known) then raise exception 'Too many items in a group';end if;
  for i in select * from jsonb_array_elements(g->'items') loop
   if jsonb_typeof(i) is distinct from 'object' or not coalesce(i->>'id'=any(known),false) or i->>'id'=any(pages) or jsonb_typeof(i->'label') is distinct from 'string' or length(trim(i->>'label')) not between 1 and 32 or jsonb_typeof(i->'hidden') is distinct from 'boolean' then raise exception 'Invalid, duplicate or unknown page';end if;
   if i->>'id'='index' and (i->>'hidden')::boolean then raise exception 'Updates must stay visible';end if;
   pages:=array_append(pages,i->>'id');
  end loop;
 end loop;
 if not (known <@ (pages || array['user-guide','substances','labels','safety-topics','leadership','config-workbench'])) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
end $$;
revoke all on function public.validate_site_navigation(jsonb) from public,anon,authenticated;
