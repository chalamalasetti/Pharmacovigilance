-- Source-only change intake and append-only human triage. Company work remains private.
create schema if not exists pv_changes;
revoke all on schema pv_changes from public,anon;
grant usage on schema pv_changes to authenticated;
create table public.pv_regulatory_changes (
 id uuid primary key default gen_random_uuid(),document_id text not null references public.pv_documents(id),
 before_version uuid references public.pv_document_versions(id),after_version uuid not null unique references public.pv_document_versions(id),
 comparison jsonb not null,method text not null default 'ordinal-section-v1',flags jsonb not null,
 before_hash text,after_hash text,created_at timestamptz not null default clock_timestamp()
);
create index regulatory_changes_document on public.pv_regulatory_changes(document_id,created_at desc);
create index regulatory_changes_before on public.pv_regulatory_changes(before_version);
create table public.pv_change_reviews (
 id uuid primary key default gen_random_uuid(),change_id uuid not null references public.pv_regulatory_changes(id),revision integer not null,
 decision text not null check(decision in ('more_information','informational','company_review')),
 change_kind text not null check(change_kind in ('initial_baseline','editorial','clarification','potential_obligation','effective_date','withdrawal','other')),
 summary text not null,rationale text not null,manual_comparison boolean not null default false,
 requirements_snapshot jsonb not null,actor uuid not null references auth.users(id),reviewed_at timestamptz not null default clock_timestamp(),
 unique(change_id,revision)
);
create index change_reviews_change on public.pv_change_reviews(change_id,revision desc);
create index change_reviews_actor on public.pv_change_reviews(actor);
create table public.pv_change_case_links (
 case_id uuid primary key references public.company_cases(id),review_id uuid not null references public.pv_change_reviews(id),linked_at timestamptz not null default clock_timestamp()
);
create index change_case_review on public.pv_change_case_links(review_id);
alter table public.pv_regulatory_changes enable row level security;
alter table public.pv_change_reviews enable row level security;
alter table public.pv_change_case_links enable row level security;
revoke all on public.pv_regulatory_changes,public.pv_change_reviews,public.pv_change_case_links from public,anon,authenticated;
grant select on public.pv_regulatory_changes,public.pv_change_reviews to anon,authenticated;
grant select on public.pv_change_case_links to authenticated;
create policy "Public change evidence" on public.pv_regulatory_changes for select to anon,authenticated using(true);
create policy "Public source triage" on public.pv_change_reviews for select to anon,authenticated using(true);
create policy "Private change case links" on public.pv_change_case_links for select to authenticated using(exists(select 1 from public.company_cases c where c.id=case_id and (c.owner_id=(select auth.uid()) or public.is_team_member(c.team_id))));
create function pv_changes.register_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare prev public.pv_document_versions; diff jsonb; flags jsonb;
begin
 if new.content_kind='metadata' then return new;end if;
 if new.previous_id is not null then select * into prev from public.pv_document_versions where id=new.previous_id;end if;
 select coalesce(jsonb_agg(jsonb_build_object('position',coalesce(b.i,a.i)-1,'status',case when b.i is null then 'added' when a.i is null then 'removed' when b.v->>'text' is distinct from a.v->>'text' then 'changed' else 'unchanged' end) order by coalesce(b.i,a.i)),'[]') into diff
 from jsonb_array_elements(coalesce(prev.sections,'[]')) with ordinality b(v,i) full join jsonb_array_elements(new.sections) with ordinality a(v,i) on b.i=a.i;
 flags:=jsonb_build_object('initial_capture',prev.id is null or prev.content_kind='metadata','same_original_bytes',prev.original_hash is not null and prev.original_hash=new.original_hash,'incomplete',new.capture_status<>'captured' or (prev.id is not null and prev.content_kind<>'metadata' and prev.capture_status<>'captured'),'structural_change',jsonb_array_length(coalesce(prev.sections,'[]'))<>jsonb_array_length(new.sections),'dates_unverified',true);
 insert into public.pv_regulatory_changes(document_id,before_version,after_version,comparison,flags,before_hash,after_hash) values(new.document_id,prev.id,new.id,diff,flags,prev.original_hash,new.original_hash) on conflict(after_version) do nothing;
 return new;
end $$;
revoke all on function pv_changes.register_capture() from public,anon,authenticated;
create trigger register_regulatory_change after insert on public.pv_document_versions for each row execute function pv_changes.register_capture();
-- Backfill intake only. Never invent a review or approve a real interpretation.
do $$ declare v public.pv_document_versions;begin
 for v in select * from public.pv_document_versions where content_kind<>'metadata' order by captured_at,id loop
  insert into public.pv_regulatory_changes(document_id,before_version,after_version,comparison,flags,before_hash,after_hash)
  select v.document_id,p.id,v.id,coalesce((select jsonb_agg(jsonb_build_object('position',coalesce(b.i,a.i)-1,'status',case when b.i is null then 'added' when a.i is null then 'removed' when b.v->>'text' is distinct from a.v->>'text' then 'changed' else 'unchanged' end) order by coalesce(b.i,a.i)) from jsonb_array_elements(coalesce(p.sections,'[]')) with ordinality b(v,i) full join jsonb_array_elements(v.sections) with ordinality a(v,i) on b.i=a.i),'[]'),jsonb_build_object('initial_capture',p.id is null or p.content_kind='metadata','same_original_bytes',p.original_hash is not null and p.original_hash=v.original_hash,'incomplete',v.capture_status<>'captured' or(p.id is not null and p.content_kind<>'metadata' and p.capture_status<>'captured'),'structural_change',jsonb_array_length(coalesce(p.sections,'[]'))<>jsonb_array_length(v.sections),'dates_unverified',true),p.original_hash,v.original_hash
  from (select 1) seed left join public.pv_document_versions p on p.id=v.previous_id on conflict(after_version) do nothing;
 end loop;
end $$;
create function pv_changes.review(p_change uuid,p_expected uuid,p_decision text,p_kind text,p_summary text,p_rationale text,p_requirements uuid[],p_manual boolean) returns public.pv_change_reviews language plpgsql security definer set search_path='' as $$
declare c public.pv_regulatory_changes;v public.pv_document_versions;prev public.pv_change_reviews;r public.pv_change_reviews;refs jsonb;agency text;verified text;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Regulatory editor access required' using errcode='42501';end if;
 select * into strict c from public.pv_regulatory_changes where id=p_change for update;
 select * into strict v from public.pv_document_versions where id=c.after_version;
 select * into prev from public.pv_change_reviews where change_id=c.id order by revision desc limit 1;
 if prev.id is distinct from p_expected then raise exception 'Triage changed. Reload before saving';end if;
 if p_decision not in ('more_information','informational','company_review') or p_kind not in ('initial_baseline','editorial','clarification','potential_obligation','effective_date','withdrawal','other') then raise exception 'Choose a triage decision and change type';end if;
 if (c.flags->>'same_original_bytes')::boolean and p_kind in ('potential_obligation','effective_date','withdrawal') then raise exception 'Identical source bytes do not establish a regulatory amendment; classify the extraction review separately';end if;
 perform public.pv_organizational_text(p_summary,'Change summary',3000);perform public.pv_organizational_text(p_rationale,'Triage rationale',3000);
 if cardinality(p_requirements)>30 then raise exception 'Link at most 30 requirement versions';end if;
 select d.agency into agency from public.pv_documents d where id=c.document_id;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.requirement_key,q.revision),'[]') into refs from public.pv_requirement_versions q where q.id=any(p_requirements) and q.review_status='approved' and q.body->>'agency'=agency;
 if jsonb_array_length(refs)<>(select count(distinct x) from unnest(p_requirements) x) then raise exception 'Link approved requirement versions from the same agency';end if;
 if p_decision='company_review' then
  select s.decision into verified from public.pv_source_reviews s where s.document_version_id=v.id order by s.reviewed_at desc,s.id desc limit 1;
  if verified is distinct from 'verified' then raise exception 'Verify this exact source capture before company handoff';end if;
  if v.capture_status not in ('captured','partial') or jsonb_array_length(v.sections)=0 then raise exception 'Source text is unavailable; request more information';end if;
  if ((c.flags->>'incomplete')::boolean or (c.flags->>'structural_change')::boolean) and not p_manual then raise exception 'Confirm manual comparison of the original documents for incomplete or structural changes';end if;
 end if;
 insert into public.pv_change_reviews(change_id,revision,decision,change_kind,summary,rationale,manual_comparison,requirements_snapshot,actor) values(c.id,coalesce(prev.revision,0)+1,p_decision,p_kind,trim(p_summary),trim(p_rationale),p_manual,refs,auth.uid()) returning * into r;
 perform public.admin_log('regulatory change triaged',c.id::text,jsonb_build_object('review_id',r.id,'decision',p_decision));return r;
end $$;
revoke all on function pv_changes.review(uuid,uuid,text,text,text,text,uuid[],boolean) from public,anon;
grant execute on function pv_changes.review(uuid,uuid,text,text,text,text,uuid[],boolean) to authenticated;
create function public.review_regulatory_change(p_change uuid,p_expected uuid,p_decision text,p_kind text,p_summary text,p_rationale text,p_requirements uuid[],p_manual boolean) returns public.pv_change_reviews language sql security invoker set search_path='' as $$select pv_changes.review(p_change,p_expected,p_decision,p_kind,p_summary,p_rationale,p_requirements,p_manual)$$;
revoke all on function public.review_regulatory_change(uuid,uuid,text,text,text,text,uuid[],boolean) from public,anon;
grant execute on function public.review_regulatory_change(uuid,uuid,text,text,text,text,uuid[],boolean) to authenticated;
-- Keep the existing case engine; direct candidate handoffs no longer create formal cases.
alter function public.open_company_case(text,jsonb,uuid) set schema pv_changes;
alter function pv_changes.open_company_case(text,jsonb,uuid) rename to open_existing_case;
revoke all on function pv_changes.open_existing_case(text,jsonb,uuid) from public,anon,authenticated;
create function pv_changes.open_guard(p_source_key text,p_snapshot jsonb,p_team_id uuid) returns public.company_cases language plpgsql security definer set search_path='' as $$
begin
 if p_source_key like 'candidate:%' or p_source_key like 'regchange:%' or p_snapshot->'companyContext'->>'sourceItem' like 'candidate:%' then raise exception 'Complete human triage in Regulatory Change Review before opening a formal change assessment';end if;
 return pv_changes.open_existing_case(p_source_key,p_snapshot,p_team_id);
end $$;
revoke all on function pv_changes.open_guard(text,jsonb,uuid) from public,anon;
grant execute on function pv_changes.open_guard(text,jsonb,uuid) to authenticated;
create function public.open_company_case(p_source_key text,p_snapshot jsonb,p_team_id uuid default null) returns public.company_cases language sql security invoker set search_path='' as $$select pv_changes.open_guard(p_source_key,p_snapshot,p_team_id)$$;
revoke all on function public.open_company_case(text,jsonb,uuid) from public,anon;
grant execute on function public.open_company_case(text,jsonb,uuid) to authenticated;
create function pv_changes.open_review(p_review uuid,p_context jsonb,p_team_id uuid) returns public.company_cases language plpgsql security definer set search_path='' as $$
declare r public.pv_change_reviews;ch public.pv_regulatory_changes;v public.pv_document_versions;d public.pv_documents;c public.company_cases;s jsonb;k text;ctx jsonb;verified text;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into strict r from public.pv_change_reviews where id=p_review;
 perform 1 from public.pv_regulatory_changes where id=r.change_id for update;
 if r.decision<>'company_review' or exists(select 1 from public.pv_change_reviews x where x.change_id=r.change_id and x.revision>r.revision) then raise exception 'Use the current human-triaged review for company assessment';end if;
 select * into strict ch from public.pv_regulatory_changes where id=r.change_id;
 select * into strict v from public.pv_document_versions where id=ch.after_version;
 select * into strict d from public.pv_documents where id=ch.document_id;
 select z.decision into verified from public.pv_source_reviews z where z.document_version_id=v.id order by z.reviewed_at desc,z.id desc limit 1;
 if verified is distinct from 'verified' then raise exception 'Source verification is no longer current. Request regulatory review before creating another assessment';end if;
 if p_context->>'companyId' !~ '^[a-z0-9][a-z0-9-]{1,79}$' or coalesce(p_context->>'portfolioConfirmedAt','')='' then raise exception 'Confirm a company portfolio first';end if;
 ctx:=p_context||jsonb_build_object('sourceItem','regchange:'||r.id::text,'evidenceKind','regulatory_change','scopeReason',left('Human triage: '||r.summary||' | '||r.rationale||' | Review '||r.id::text||'; source capture '||v.id::text||'. Company applicability is undecided. Baseline changes require separate approval.',1000));
 k:='regchange:'||r.id::text||':'||(ctx->>'companyId');
 s:=jsonb_build_object('id',k,'title',d.title||' · reviewed change v'||r.revision,'link',v.source_url,'source',d.agency||' regulatory change review','published',v.published_on,'country',d.country,'companyContext',ctx);
 if p_team_id is not null then
  if not public.is_team_member(p_team_id) then raise exception 'Team access denied';end if;
  insert into public.team_items(team_id,update_id,snapshot) values(p_team_id,k,s) on conflict(team_id,update_id) do update set snapshot=excluded.snapshot,updated_by=auth.uid(),updated_at=clock_timestamp();
 end if;
 c:=pv_changes.open_existing_case(k,s,p_team_id);
 insert into public.pv_change_case_links(case_id,review_id) values(c.id,r.id) on conflict do nothing;
 return c;
end $$;
revoke all on function pv_changes.open_review(uuid,jsonb,uuid) from public,anon;
grant execute on function pv_changes.open_review(uuid,jsonb,uuid) to authenticated;
create function public.open_regulatory_change_case(p_review uuid,p_context jsonb,p_team_id uuid default null) returns public.company_cases language sql security invoker set search_path='' as $$select pv_changes.open_review(p_review,p_context,p_team_id)$$;
revoke all on function public.open_regulatory_change_case(uuid,jsonb,uuid) from public,anon;
grant execute on function public.open_regulatory_change_case(uuid,jsonb,uuid) to authenticated;

-- The existing private requirement editor gains an explicit training workstream.
alter table public.pv_impact_requirements drop constraint pv_impact_requirements_kind_check;
alter table public.pv_impact_requirements add constraint pv_impact_requirements_kind_check check(kind in ('business','system','data','process','training'));
create or replace function public.save_pv_impact_requirement(p_case uuid,p_kind text,p_fields jsonb,p_expected uuid default null) returns public.pv_impact_requirements
language plpgsql security definer set search_path='' as $$
declare c public.company_cases;prev public.pv_impact_requirements;r public.pv_impact_requirements;k text;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into c from public.company_cases where id=p_case and (owner_id=auth.uid() or public.is_team_member(team_id)) for update;
 if not found then raise exception 'Case access denied';end if;
 if c.stage='closed' or c.decision->>'decision' is distinct from 'relevant' then raise exception 'Record a relevant applicability decision on an open case first';end if;
 if p_kind is null or p_kind not in ('business','system','data','process','training') then raise exception 'Invalid requirement type';end if;
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or (select count(*) from jsonb_object_keys(p_fields))<>4 then raise exception 'Use the four organizational draft fields';end if;
 foreach k in array array['statement','acceptance_criteria','rationale','system_scope'] loop
  if jsonb_typeof(p_fields->k) is distinct from 'string' then raise exception 'Invalid draft field';end if;
  if k<>'system_scope' or p_fields->>k<>'' then perform public.pv_organizational_text(p_fields->>k,k,3000);end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_case::text||':'||p_kind,0));
 select * into prev from public.pv_impact_requirements where case_id=p_case and kind=p_kind order by revision desc limit 1;
 if prev.id is distinct from p_expected then raise exception 'Draft changed. Reload before saving';end if;
 insert into public.pv_impact_requirements(case_id,kind,revision,previous_id,statement,acceptance_criteria,rationale,system_scope,author_email,applicability_snapshot)
 values(p_case,p_kind,coalesce(prev.revision,0)+1,prev.id,trim(p_fields->>'statement'),trim(p_fields->>'acceptance_criteria'),trim(p_fields->>'rationale'),trim(p_fields->>'system_scope'),public.company_case_email(auth.jwt()->>'email'),c.decision) returning * into r;
 return r;
end $$;
revoke all on function public.save_pv_impact_requirement(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.save_pv_impact_requirement(uuid,text,jsonb,uuid) to authenticated;

create function pv_changes.guard_closure() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if new.stage='closed' and old.stage<>'closed' and new.source_key like 'regchange:%' and new.decision->>'decision'='relevant' then
  select count(*) into n from (select distinct on(kind) kind,status,applicability_snapshot from public.pv_impact_requirements where case_id=new.id order by kind,revision desc) q where q.status='approved' and q.applicability_snapshot=new.decision;
  if n<>5 then raise exception 'Approve business, system, process, data and training requirements for this applicability decision before verifying closure. Record justified no-change outcomes where appropriate.';end if;
 end if;return new;
end $$;
revoke all on function pv_changes.guard_closure() from public,anon,authenticated;
create trigger guard_reviewed_change_closure before update on public.company_cases for each row execute function pv_changes.guard_closure();
-- Private immutable draft/export events for the new reviewed-change journey.
create table public.pv_change_case_events (
 id bigint generated always as identity primary key,case_id uuid not null references public.company_cases(id),actor uuid references auth.users(id),
 kind text not null,payload jsonb not null default '{}',at timestamptz not null default clock_timestamp()
);
create index change_case_events_case on public.pv_change_case_events(case_id,id);
create index change_case_events_actor on public.pv_change_case_events(actor);
alter table public.pv_change_case_events enable row level security;
revoke all on public.pv_change_case_events from public,anon,authenticated;
grant select on public.pv_change_case_events to authenticated;
create policy "Private regulatory assessment events" on public.pv_change_case_events for select to authenticated using(exists(select 1 from public.company_cases c where c.id=case_id and(c.owner_id=(select auth.uid()) or public.is_team_member(c.team_id))));
create function pv_changes.draft_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.company_cases where id=new.case_id and source_key like 'regchange:%') then
  insert into public.pv_change_case_events(case_id,actor,kind,payload) values(new.case_id,auth.uid(),case when tg_op='INSERT' then 'draft_created' else 'draft_reviewed' end,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 end if;return new;
end $$;
revoke all on function pv_changes.draft_event() from public,anon,authenticated;
create trigger audit_regulatory_impact_draft after insert or update on public.pv_impact_requirements for each row execute function pv_changes.draft_event();
create function pv_changes.export_case(p_case uuid,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.company_cases;r public.pv_change_reviews;ch public.pv_regulatory_changes;result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into c from public.company_cases where id=p_case and(owner_id=auth.uid() or public.is_team_member(team_id)) for share;
 if not found then raise exception 'Assessment access denied' using errcode='42501';end if;
 if c.version<>p_expected then raise exception 'Assessment changed. Reload before exporting';end if;
 select x.* into strict r from public.pv_change_case_links l join public.pv_change_reviews x on x.id=l.review_id where l.case_id=c.id;
 select * into strict ch from public.pv_regulatory_changes where id=r.change_id;
 insert into public.pv_change_case_events(case_id,actor,kind,payload) values(c.id,auth.uid(),'evidence_exported',jsonb_build_object('case_version',c.version,'review_id',r.id));
 result:=jsonb_build_object('format','pvinfo-regulatory-assessment-v1','exported_at',clock_timestamp(),'privacy','Private company assessment. Share only with authorized recipients.','assessment',to_jsonb(c),'triage_review',to_jsonb(r),'regulatory_change',to_jsonb(ch),'source_versions',(select jsonb_agg(to_jsonb(v) order by v.revision) from public.pv_document_versions v where v.id in(ch.before_version,ch.after_version)),'impact_requirements',(select coalesce(jsonb_agg(to_jsonb(q) order by q.kind,q.revision),'[]') from public.pv_impact_requirements q where q.case_id=c.id),'draft_and_export_events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.pv_change_case_events e where e.case_id=c.id),'scope','Pinned captured text, source links, checksums, human triage, interpretation snapshots, company decisions, requirement history, action evidence and verification. Archived binaries are not embedded.');
 return result;
end $$;
revoke all on function pv_changes.export_case(uuid,integer) from public,anon;
grant execute on function pv_changes.export_case(uuid,integer) to authenticated;
create function public.export_regulatory_change_case(p_case uuid,p_expected integer) returns jsonb language sql security invoker set search_path='' as $$select pv_changes.export_case(p_case,p_expected)$$;
revoke all on function public.export_regulatory_change_case(uuid,integer) from public,anon;
grant execute on function public.export_regulatory_change_case(uuid,integer) to authenticated;
