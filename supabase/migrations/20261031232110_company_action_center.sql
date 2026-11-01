-- Private company cases. Clients can read authorized rows; only workflow RPCs write.
create table public.company_cases (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid references auth.users on delete cascade,
 team_id uuid references public.teams on delete cascade,
 source_key text not null check(length(source_key) between 1 and 400),
 snapshot jsonb not null,
 stage text not null default 'assessment' check(stage in ('assessment','action','verification','closed')),
 decision jsonb, action jsonb, completion jsonb, approval jsonb,
 version integer not null default 1,
 history jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((team_id is null and owner_id is not null) or (team_id is not null and owner_id is null))
);
create unique index company_cases_personal_source on public.company_cases(owner_id,source_key) where team_id is null;
create unique index company_cases_team_source on public.company_cases(team_id,source_key) where team_id is not null;
create index company_cases_owner_recent on public.company_cases(owner_id,updated_at desc);
create index company_cases_team_recent on public.company_cases(team_id,updated_at desc);
alter table public.company_cases enable row level security;
create policy "Private company cases" on public.company_cases for select to authenticated
 using ((team_id is null and owner_id=(select auth.uid())) or (team_id is not null and public.is_team_member(team_id)));
revoke all on public.company_cases from public,anon,authenticated;
grant select on public.company_cases to authenticated;

-- Private helpers are never callable by API roles. Reject common personal identifiers;
-- this is a guard, not a claim to detect all personal information in prose.
create or replace function public.company_case_text(v text, label text, lim integer default 2000) returns text
language plpgsql immutable set search_path='' as $$
begin
 v:=trim(coalesce(v,''));
 if length(v)=0 or length(v)>lim then raise exception '% is required (maximum % characters)',label,lim; end if;
 if v ~* '(patient[[:space:]]*(name|id|identifier)|reporter[[:space:]]*(name|address)|date of birth|dob|phone|fax|social security|passport number|medical record number)[[:space:]]*[:=]' or v ~* '\+[0-9][0-9 ().-]{7,}[0-9]' or v ~* '\([0-9]{3}\)[[:space:]]*[0-9]{3}[- .][0-9]{4}' or v ~* '[0-9]{1,6}[[:space:]]+[[:alpha:][:digit:] .''-]+[[:space:]]+(street|avenue|road|lane|drive|boulevard)\y' then
 raise exception 'Remove personal or patient details; use organizational information only'; end if;
 return v;
end $$;
create or replace function public.company_case_email(v text) returns text
language plpgsql immutable set search_path='' as $$
begin
 v:=lower(trim(coalesce(v,'')));
 if length(v)>254 or v !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then raise exception 'Use an email address without a name'; end if;
 return v;
end $$;
create or replace function public.company_case_url(v text) returns text
language plpgsql immutable set search_path='' as $$
begin
 if coalesce(v,'') !~ '^https://[^/[:space:]]+(/[^[:space:]]*)?$' or v ~* '(@|%40|patient[-_]?id|token=|signature=)' or length(v)>2000 then raise exception 'Use an HTTPS evidence link without identifiers, credentials or access tokens'; end if;
 return v;
end $$;
revoke all on function public.company_case_text(text,text,integer),public.company_case_email(text),public.company_case_url(text) from public,anon,authenticated;

create or replace function public.open_company_case(p_source_key text,p_snapshot jsonb,p_team_id uuid default null) returns public.company_cases
language plpgsql security definer set search_path='' as $$
declare c public.company_cases; s jsonb; ctx jsonb; products jsonb; actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'Sign in first'; end if;
 if p_source_key is null or length(p_source_key) not between 1 and 400 then raise exception 'Invalid source key'; end if;
 if p_team_id is not null and not public.is_team_member(p_team_id) then raise exception 'Team access denied'; end if;
 -- Serialize creation of the same source/scope; repeated sends return the same case.
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_team_id,actor)::text||':'||p_source_key,0));
 select * into c from public.company_cases where source_key=p_source_key and
 ((p_team_id is null and team_id is null and owner_id=actor) or team_id=p_team_id);
 if found then return c; end if;
 if p_team_id is not null then
  select snapshot into s from public.team_items where team_id=p_team_id and update_id=p_source_key;
  if s is null then raise exception 'Send this item to the selected team queue first'; end if;
 else s:=p_snapshot; end if;
 if s is null or pg_column_size(s)>100000 then raise exception 'Evidence snapshot is missing or too large'; end if;
 ctx:=s->'companyContext';
 if coalesce(ctx->>'companyId','')='' or coalesce(ctx->>'companyName','')='' or jsonb_typeof(ctx->'markets') is distinct from 'array' or jsonb_array_length(ctx->'markets') not between 1 and 10 then raise exception 'Company and market context required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',p->>'key','brand',p->>'brand','market',p->>'market','authId',p->>'authId','url',p->>'url')),'[]') into products from jsonb_array_elements(coalesce(ctx->'products','[]')) p;
 ctx:=jsonb_build_object('companyId',ctx->>'companyId','companyName',ctx->>'companyName','markets',ctx->'markets','products',products,'reason',ctx->>'reason','scopeReason',ctx->>'scopeReason','lane',ctx->>'lane','evidenceKind',ctx->>'evidenceKind','paperId',ctx->>'paperId','sourceItem',ctx->>'sourceItem','portfolioRevision',ctx->'portfolioRevision','portfolioConfirmedAt',ctx->>'portfolioConfirmedAt','fingerprint',ctx->>'fingerprint');
 perform public.company_case_text(ctx::text,'Company context',80000);
 s:=jsonb_build_object('id',p_source_key,'title',public.company_case_text(s->>'title','Evidence title',1000),'link',public.company_case_url(s->>'link'),'source',s->>'source','published',s->>'published','country',s->>'country','companyContext',ctx);
 insert into public.company_cases(owner_id,team_id,source_key,snapshot,history)
 values(case when p_team_id is null then actor else null end,p_team_id,p_source_key,s,jsonb_build_array(jsonb_build_object('command','created','by',auth.jwt()->>'email','at',now(),'version',1))) returning * into c;
 return c;
end $$;

create or replace function public.advance_company_case(p_id uuid,p_version integer,p_command text,p_payload jsonb) returns public.company_cases
language plpgsql security definer set search_path='' as $$
declare c public.company_cases; p jsonb; note text; who text:=lower(auth.jwt()->>'email'); actor uuid:=auth.uid(); due_date date; ev jsonb; reviewer text;
begin
 if actor is null then raise exception 'Sign in first'; end if;
 who:=public.company_case_email(who);
 select * into c from public.company_cases where id=p_id and
 ((team_id is null and owner_id=actor) or (team_id is not null and public.is_team_member(team_id))) for update;
 if not found then raise exception 'Case unavailable or access denied'; end if;
 if p_version is distinct from c.version then raise exception 'This case changed. Refresh and review the latest version before saving'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>15000 then raise exception 'Invalid workflow input'; end if;
 if c.stage='closed' and p_command<>'reopen' then raise exception 'Reopen the case before changing it'; end if;
 if p_command='decide' then
  if c.stage='verification' then raise exception 'Return this case for rework before changing applicability'; end if;
  if coalesce(p_payload->>'decision','') not in ('relevant','not_relevant','more_information') then raise exception 'Choose applicability'; end if;
  p:=jsonb_build_object('decision',p_payload->>'decision','reason',public.company_case_text(p_payload->>'reason','Reason'));
  c.decision:=p;c.action:=null;c.completion:=null;c.approval:=null;c.stage:='assessment';
 elsif p_command='assign' then
  if c.stage not in ('assessment','action') or (c.decision->>'decision') is distinct from 'relevant' then raise exception 'Decide relevant before assigning an action'; end if;
  if coalesce(p_payload->>'type','') not in ('Label / product information','Signal evaluation','Risk management','Regulatory submission','Safety system / process','Literature follow-up','Other') then raise exception 'Choose action type'; end if;
  if coalesce(p_payload->>'due','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Choose due date'; end if;
  due_date:=(p_payload->>'due')::date;
  p:=jsonb_build_object('type',p_payload->>'type','owner',public.company_case_email(p_payload->>'owner'),'due',due_date,'instruction',public.company_case_text(p_payload->>'instruction','Action instructions'));
  if c.team_id is not null and not exists(select 1 from public.team_members where team_id=c.team_id and lower(email)=p->>'owner') then raise exception 'Action owner must be a current member of this team'; end if;
  c.action:=p;c.stage:='action';
 elsif p_command='complete' then
  if not coalesce(((c.stage='action' and c.action is not null) or (c.stage='assessment' and c.decision->>'decision'='not_relevant')),false) then raise exception 'Assign action or decide not relevant first'; end if;
  if c.team_id is not null and c.action is not null and who is distinct from c.action->>'owner' then raise exception 'Only the assigned action owner can submit completion'; end if;
  if jsonb_typeof(p_payload->'evidence') is distinct from 'array' or jsonb_array_length(p_payload->'evidence') not between 1 and 10 then raise exception 'Attach supporting evidence'; end if;
  select jsonb_agg(jsonb_build_object('label',public.company_case_text(e->>'label','Evidence label',200),'url',public.company_case_url(e->>'url'))) into ev from jsonb_array_elements(p_payload->'evidence') e;
  reviewer:=case when c.team_id is null then who else public.company_case_email(p_payload->>'reviewer') end;
  if c.team_id is not null and (reviewer=who or not exists(select 1 from public.team_members where team_id=c.team_id and lower(email)=reviewer)) then raise exception 'Choose a different current team member to verify closure'; end if;
  p:=jsonb_build_object('changed',public.company_case_text(p_payload->>'changed','What changed'),'evidence',ev,'reviewer',reviewer);
  c.completion:=p||jsonb_build_object('by',who,'at',now());c.stage:='verification';
 elsif p_command in ('approve','return') then
  if c.stage<>'verification' then raise exception 'Submit evidence for verification first'; end if;
  if c.team_id is not null and (who is distinct from c.completion->>'reviewer' or who=c.completion->>'by') then raise exception 'Only the designated independent reviewer can verify or return this case'; end if;
  p:=jsonb_build_object('reason',public.company_case_text(p_payload->>'reason','Reviewer reason'));
  if p_command='approve' then c.approval:=p||jsonb_build_object('by',who,'at',now(),'selfReview',c.team_id is null);c.stage:='closed';
  else c.completion:=null;c.stage:=case when c.action is null then 'assessment' else 'action' end;end if;
 elsif p_command='reopen' then
  if c.stage<>'closed' then raise exception 'Only closed cases can be reopened'; end if;
  p:=jsonb_build_object('reason',public.company_case_text(p_payload->>'reason','Reopen reason'));
  c.stage:='assessment';c.decision:=null;c.action:=null;c.completion:=null;c.approval:=null;
 else raise exception 'Unknown workflow command';end if;
 c.version:=c.version+1;c.updated_at:=now();
 c.history:=c.history||jsonb_build_array(jsonb_build_object('command',p_command,'detail',p,'by',who,'at',now(),'version',c.version));
 update public.company_cases set stage=c.stage,decision=c.decision,action=c.action,completion=c.completion,approval=c.approval,version=c.version,history=c.history,updated_at=c.updated_at where id=c.id;
 return c;
end $$;
revoke all on function public.open_company_case(text,jsonb,uuid),public.advance_company_case(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.open_company_case(text,jsonb,uuid),public.advance_company_case(uuid,integer,text,jsonb) to authenticated;
notify pgrst,'reload schema';
