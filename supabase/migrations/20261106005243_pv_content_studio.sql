create schema pv_content;
revoke all on schema pv_content from public,anon;
grant usage on schema pv_content to authenticated;
create table public.pv_content_documents(
 id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),team_id uuid references public.teams(id),
 created_by uuid not null references auth.users(id),authors uuid[] not null,last_author uuid not null references auth.users(id),
 kind text not null check(kind in ('document','template')),revision integer not null default 1,state text not null default 'draft' check(state in ('draft','in_review','approved')),
 body jsonb not null, reviews jsonb not null default '{}',findings jsonb not null default '[]',
 approved_by uuid references auth.users(id),approved_at timestamptz,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((owner_id is not null and team_id is null) or (owner_id is null and team_id is not null))
);
create index pv_content_owner_recent on public.pv_content_documents(owner_id,updated_at desc);
create index pv_content_team_recent on public.pv_content_documents(team_id,updated_at desc);
create table public.pv_content_history(
 document_id uuid not null references public.pv_content_documents(id),revision integer not null,state text not null,body jsonb not null,reviews jsonb not null,findings jsonb not null,
 actor_id uuid not null references auth.users(id),command text not null,reason text not null,approved_by uuid,approved_at timestamptz,at timestamptz not null default clock_timestamp(),primary key(document_id,revision)
);
alter table public.pv_content_documents enable row level security;
alter table public.pv_content_history enable row level security;
revoke all on public.pv_content_documents,public.pv_content_history from public,anon,authenticated;
grant select on public.pv_content_documents,public.pv_content_history to authenticated;
create policy "Private content scope" on public.pv_content_documents for select to authenticated using((select auth.jwt()->>'role')='authenticated' and (owner_id=(select auth.uid()) or (team_id is not null and public.is_team_member(team_id))));
create policy "Private content history" on public.pv_content_history for select to authenticated using(exists(select 1 from public.pv_content_documents d where d.id=document_id));
create function pv_content.validate(b jsonb,ready boolean) returns void language plpgsql security invoker set search_path='' as $$
declare x jsonb;k text;ids text[]:='{}';
begin
 if jsonb_typeof(b) is distinct from 'object' or pg_column_size(b)>180000 or b->>'schema' is distinct from '1' or b->>'engine' is distinct from 'pv-content-v1' then raise exception 'Invalid content draft';end if;
 perform public.company_case_text(b::text,'Organizational document content',180000);
 if b::text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then raise exception 'Remove contact details from document content';end if;
 perform public.company_case_text(b->>'title','Document title',200);
 if coalesce(b->'template'->>'id','')='' or coalesce(b->'template'->>'version','')='' or jsonb_typeof(b->'sections') is distinct from 'array' then raise exception 'Template and sections required';end if;
 if jsonb_array_length(b->'sections') not between 1 and 24 then raise exception 'Use 1 to 24 sections';end if;
 for x in select * from jsonb_array_elements(b->'sections') loop
  k:=x->>'id';if k is null or k!~'^[a-z0-9-]{1,60}$' or k=any(ids) then raise exception 'Invalid section identifier';end if;ids:=array_append(ids,k);
  perform public.company_case_text(x->>'title','Section title',160);
  if length(coalesce(x->>'text',''))>8000 or coalesce(x->>'basis','') not in ('source','company','suggested','placeholder') then raise exception 'Invalid section content';end if;
  if ready and (coalesce(trim(x->>'text'),'')='' or x->>'basis'='placeholder' or x->>'text' ~* '\[NEEDED|\[TODO') then raise exception 'Complete missing sections before review';end if;
 end loop;
 if ready then
  foreach k in array array['company','markets','audience','system','version'] loop perform public.company_case_text(b->'context'->>k,k,1000);end loop;
  if b->'source'->'verified' is distinct from 'true'::jsonb then raise exception 'Verify the selected source';end if;
  foreach k in array array['title','url','edition','location'] loop perform public.company_case_text(b->'source'->>k,k,3000);end loop;
  perform public.company_case_url(b->'source'->>'url');
 end if;
end$$;
create function pv_content.save(p_id uuid,p_expected integer,p_team uuid,p_kind text,p_command text,p_body jsonb,p_reason text,p_section text default null) returns public.pv_content_documents language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d public.pv_content_documents;v jsonb;r jsonb;src public.pv_config_packages;why text;
begin
 if actor is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'Approved sign-in required';end if;
 why:=public.company_case_text(p_reason,'Change or decision reason',2000);
 if p_id is null then
  if p_command<>'save' or p_expected is distinct from 0 or p_kind not in ('document','template') then raise exception 'Save a draft first';end if;
  if p_team is not null and not public.is_team_member(p_team) then raise exception 'Team access denied';end if;
  perform pv_content.validate(p_body,false);
  insert into public.pv_content_documents(owner_id,team_id,created_by,authors,last_author,kind,body) values(case when p_team is null then actor end,p_team,actor,array[actor],actor,p_kind,p_body) returning * into d;
 else
  select * into d from public.pv_content_documents where id=p_id and (owner_id=actor or (team_id is not null and public.is_team_member(team_id))) for update;
  if not found then raise exception 'Document unavailable or access denied';end if;
  if d.revision is distinct from p_expected then raise exception 'Document changed. Reload before continuing';end if;
  if d.team_id is distinct from p_team or d.kind is distinct from p_kind then raise exception 'Document scope and kind cannot change';end if;
  if p_command='save' then
   if d.state<>'draft' then raise exception 'Create a draft revision before editing';end if;
   perform pv_content.validate(p_body,false);d.body:=p_body;d.last_author:=actor;if not actor=any(d.authors) then d.authors:=array_append(d.authors,actor);end if;d.reviews:='{}';
  elsif p_command='submit' then
   if d.state<>'draft' or d.kind<>'document' then raise exception 'Only document drafts can enter review';end if;
   perform pv_content.validate(d.body,true);d.state:='in_review';
  elsif p_command='review' then
   if d.state<>'in_review' or d.team_id is null or actor=any(d.authors) then raise exception 'A separate team reviewer must review sections';end if;
   if not exists(select 1 from jsonb_array_elements(d.body->'sections') x where x->>'id'=p_section) then raise exception 'Unknown section';end if;
   d.reviews:=jsonb_set(d.reviews,array[p_section],jsonb_build_object('actor',actor,'at',clock_timestamp(),'reason',why));
  elsif p_command='comment' then
   if d.state='approved' then raise exception 'Revise approved content before adding findings';end if;
   if jsonb_array_length(d.findings)>=100 then raise exception 'Resolve or consolidate findings';end if;
   d.findings:=d.findings||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'section',p_section,'text',why,'actor',actor,'at',clock_timestamp(),'resolved',false));
  elsif p_command='resolve' then
   if d.state='approved' or not exists(select 1 from jsonb_array_elements(d.findings) x where x->>'id'=p_section and x->'resolved'='false'::jsonb) then raise exception 'Open finding required';end if;
   select jsonb_agg(case when x->>'id'=p_section then x||jsonb_build_object('resolved',true,'resolved_by',actor,'resolved_at',clock_timestamp(),'resolution',why) else x end) into d.findings from jsonb_array_elements(d.findings) x;
  elsif p_command='approve' then
   if d.state<>'in_review' or d.team_id is null or not public.is_team_owner(d.team_id) or actor=any(d.authors) then raise exception 'A separate team owner must approve';end if;
   perform pv_content.validate(d.body,true);
   if exists(select 1 from jsonb_array_elements(d.body->'sections') x where not d.reviews ? (x->>'id')) or exists(select 1 from jsonb_array_elements(d.findings) x where x->'resolved' is distinct from 'true'::jsonb) then raise exception 'Review every section and resolve findings';end if;
   d.state:='approved';d.approved_by:=actor;d.approved_at:=clock_timestamp();
  elsif p_command='revise' then
   d.state:='draft';d.reviews:='{}';d.approved_by:=null;d.approved_at:=null;
  else raise exception 'Unknown document action';end if;
  d.revision:=d.revision+1;
 end if;
 -- A pinned configuration revision is read under the document's own scope, never copied across teams.
 if coalesce(d.body->'binding'->>'packageId','')<>'' then
  select * into src from public.pv_config_packages where id=(d.body->'binding'->>'packageId')::uuid and (owner_id=actor or (team_id is not null and public.is_team_member(team_id)));
  if not found or src.team_id is distinct from d.team_id or src.owner_id is distinct from d.owner_id then raise exception 'Assessment scope must match document scope';end if;
  if not exists(select 1 from public.pv_config_revisions where package_id=src.id and revision=(d.body->'binding'->>'revision')::integer) then raise exception 'Pinned assessment revision unavailable';end if;
  if p_command in ('submit','approve') and (src.revision<>(d.body->'binding'->>'revision')::integer or src.state<>'approved') then raise exception 'Assessment changed or is not approved. Reassess and create an updated draft';end if;
 end if;
 d.updated_at:=clock_timestamp();
 update public.pv_content_documents set body=d.body,authors=d.authors,last_author=d.last_author,revision=d.revision,state=d.state,reviews=d.reviews,findings=d.findings,approved_by=d.approved_by,approved_at=d.approved_at,updated_at=d.updated_at where id=d.id;
 insert into public.pv_content_history(document_id,revision,state,body,reviews,findings,actor_id,command,reason,approved_by,approved_at) values(d.id,d.revision,d.state,d.body,d.reviews,d.findings,actor,p_command,why,d.approved_by,d.approved_at);
 return d;
end$$;
revoke all on function pv_content.validate(jsonb,boolean),pv_content.save(uuid,integer,uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function pv_content.save(uuid,integer,uuid,text,text,jsonb,text,text) to authenticated;
create function public.save_pv_content(p_id uuid,p_expected integer,p_team uuid,p_kind text,p_command text,p_body jsonb,p_reason text,p_section text default null) returns public.pv_content_documents language sql security invoker set search_path='' as $$select pv_content.save(p_id,p_expected,p_team,p_kind,p_command,p_body,p_reason,p_section)$$;
revoke all on function public.save_pv_content(uuid,integer,uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.save_pv_content(uuid,integer,uuid,text,text,jsonb,text,text) to authenticated;
