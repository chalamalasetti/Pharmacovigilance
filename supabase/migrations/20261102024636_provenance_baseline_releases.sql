-- Public evidence governance. Company controls and proposed changes remain private.
create schema if not exists pv_governance;
revoke all on schema pv_governance from public;
grant usage on schema pv_governance to authenticated;
create table public.pv_source_reviews (
 id uuid primary key default gen_random_uuid(), document_version_id uuid not null references public.pv_document_versions(id),
 decision text not null check(decision in ('verified','more_information','rejected')),
 document_type text not null, language text not null, product_scope text not null, revised_on date,
 reason text not null, actor uuid not null references auth.users(id), reviewed_at timestamptz not null default clock_timestamp()
);
create index pv_source_reviews_version on public.pv_source_reviews(document_version_id,reviewed_at desc,id);
create index pv_source_reviews_actor on public.pv_source_reviews(actor);
alter table public.pv_source_reviews enable row level security;
create policy "Public source verification" on public.pv_source_reviews for select to anon,authenticated using(true);
revoke all on public.pv_source_reviews from public,anon,authenticated;
grant select on public.pv_source_reviews to anon,authenticated;
create table public.pv_baseline_releases (
 id uuid primary key default gen_random_uuid(), release_number bigint generated always as identity unique,
 title text not null, rationale text not null, effective_on date not null,
 previous_release_id uuid references public.pv_baseline_releases(id),
 state text not null default 'draft' check(state in ('draft','in_review','approved','published','rejected','withdrawn')),
 manifest jsonb not null, manifest_checksum text not null,
 author uuid not null references auth.users(id), reviewer uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),reviewed_at timestamptz,published_at timestamptz
);
create index pv_baseline_releases_previous on public.pv_baseline_releases(previous_release_id);
create index pv_baseline_releases_author on public.pv_baseline_releases(author);
create index pv_baseline_releases_reviewer on public.pv_baseline_releases(reviewer);
alter table public.pv_baseline_releases enable row level security;
create policy "Published baseline history or editorial desk" on public.pv_baseline_releases for select to anon,authenticated using(published_at is not null or (select public.is_app_admin()));
revoke all on public.pv_baseline_releases from public,anon,authenticated;
grant select on public.pv_baseline_releases to anon,authenticated;
create table public.pv_baseline_events (
 id bigint generated always as identity primary key,release_id uuid not null references public.pv_baseline_releases(id),
 actor uuid not null references auth.users(id),state text not null,reason text not null,at timestamptz not null default clock_timestamp()
);
create index pv_baseline_events_release on public.pv_baseline_events(release_id,id);
create index pv_baseline_events_actor on public.pv_baseline_events(actor);
alter table public.pv_baseline_events enable row level security;
create policy "Published release decisions or editorial desk" on public.pv_baseline_events for select to anon,authenticated using(exists(select 1 from public.pv_baseline_releases r where r.id=release_id));
revoke all on public.pv_baseline_events from public,anon,authenticated;
grant select on public.pv_baseline_events to anon,authenticated;

create function pv_governance.review_source(p_version uuid,p_decision text,p_type text,p_language text,p_scope text,p_revised date,p_reason text) returns public.pv_source_reviews
language plpgsql security definer set search_path='' as $$
declare r public.pv_source_reviews;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 if p_decision is null or p_decision not in ('verified','more_information','rejected') then raise exception 'Choose a verification decision';end if;
 perform public.pv_organizational_text(p_type,'Document type',100);perform public.pv_organizational_text(p_language,'Language',80);
 perform public.pv_organizational_text(p_scope,'Product scope',1000);perform public.pv_organizational_text(p_reason,'Verification rationale',1000);
 insert into public.pv_source_reviews(document_version_id,decision,document_type,language,product_scope,revised_on,reason,actor)
 values(p_version,p_decision,trim(p_type),trim(p_language),trim(p_scope),p_revised,trim(p_reason),auth.uid()) returning * into r;
 return r;
end $$;
revoke all on function pv_governance.review_source(uuid,text,text,text,text,date,text) from public,anon;
grant execute on function pv_governance.review_source(uuid,text,text,text,text,date,text) to authenticated;
create function public.review_pv_source(p_version uuid,p_decision text,p_type text,p_language text,p_scope text,p_revised date,p_reason text) returns public.pv_source_reviews
language sql security invoker set search_path='' as $$select pv_governance.review_source(p_version,p_decision,p_type,p_language,p_scope,p_revised,p_reason)$$;
revoke all on function public.review_pv_source(uuid,text,text,text,text,date,text) from public,anon;
grant execute on function public.review_pv_source(uuid,text,text,text,text,date,text) to authenticated;

create function pv_governance.create_baseline(p_title text,p_reason text,p_effective date,p_previous uuid,p_items jsonb) returns public.pv_baseline_releases
language plpgsql security definer set search_path='' as $$
declare x jsonb;r public.pv_requirement_versions;v public.pv_document_versions;s public.pv_source_reviews;
 items jsonb:='[]';seen text[]:='{}';m jsonb;outrow public.pv_baseline_releases;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 perform public.pv_organizational_text(p_title,'Release title',160);perform public.pv_organizational_text(p_reason,'Change rationale',1000);
 if p_effective is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Select 1 to 500 reviewed requirements and a release date';end if;
 if p_previous is not null and not exists(select 1 from public.pv_baseline_releases where id=p_previous and published_at is not null) then raise exception 'Predecessor must be a published release';end if;
 for x in select * from jsonb_array_elements(p_items) loop
  select * into r from public.pv_requirement_versions where id=(x->>'version_id')::uuid;
  if not found or r.review_status<>'approved' or r.reviewed_at is null or r.document_version_id is null then raise exception 'Every release item needs an approved interpretation and a pinned source version';end if;
  if r.requirement_key=any(seen) then raise exception 'Include only one revision of each stable requirement ID';end if;seen:=array_append(seen,r.requirement_key);
  if r.body->>'agency' not in ('FDA','EMA','GB_MHRA','CA_HC','JP_PMDA','JP_MHLW') then raise exception 'This release supports the five agency annexes only';end if;
  if coalesce(x->>'control','') not in ('intake','processing','reporting','signals','benefit-risk','risk-controls','quality','oversight') then raise exception 'Choose a master checklist control';end if;
  perform public.pv_organizational_text(x->>'trigger_clock','Trigger and clock',1000);perform public.pv_organizational_text(x->>'submission_method','Submission method',1000);
  select * into v from public.pv_document_versions where id=r.document_version_id;
  select * into s from public.pv_source_reviews where document_version_id=v.id order by reviewed_at desc,id desc limit 1;
  if s.id is null or s.decision<>'verified' then raise exception 'The exact source version must have a current verified review';end if;
  if r.body->>'source_family' is distinct from v.document_id or r.body->>'source_url' is distinct from v.source_url or r.body->>'source_edition' is distinct from v.edition or r.body->>'agency' is distinct from v.metadata->>'agency' then raise exception 'Requirement and source provenance disagree';end if;
  if coalesce(trim(r.body->>'clause'),'')='' or coalesce(trim(r.body->>'legal_basis'),'')='' or coalesce(trim(r.body->>'applicability'),'')='' or coalesce(r.body->>'valid_from','')='' or r.body->>'source_status' not in ('current','superseded','withdrawn') then raise exception 'Verify citation, applicability, legal basis, status and effective date before release';end if;
  items:=items||jsonb_build_array(jsonb_build_object('requirement',to_jsonb(r),'source',to_jsonb(v),'verification',to_jsonb(s),'interpretation_approvals',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.pv_requirement_audit a where a.version_id=r.id),'control',x->>'control','trigger_clock',trim(x->>'trigger_clock'),'submission_method',trim(x->>'submission_method')));
 end loop;
 m:=jsonb_build_object('schema_version',1,'coverage','Partial scoped baseline; no claim of regulatory completeness','master_checklist',jsonb_build_array('intake','processing','reporting','signals','benefit-risk','risk-controls','quality','oversight'),'items',items);
 insert into public.pv_baseline_releases(title,rationale,effective_on,previous_release_id,manifest,manifest_checksum,author)
 values(trim(p_title),trim(p_reason),p_effective,p_previous,m,encode(sha256(convert_to(m::text,'UTF8')),'hex'),auth.uid()) returning * into outrow;
 insert into public.pv_baseline_events(release_id,actor,state,reason) values(outrow.id,auth.uid(),'draft',trim(p_reason));return outrow;
end $$;
revoke all on function pv_governance.create_baseline(text,text,date,uuid,jsonb) from public,anon;
grant execute on function pv_governance.create_baseline(text,text,date,uuid,jsonb) to authenticated;
create function public.create_pv_baseline(p_title text,p_reason text,p_effective date,p_previous uuid,p_items jsonb) returns public.pv_baseline_releases
language sql security invoker set search_path='' as $$select pv_governance.create_baseline(p_title,p_reason,p_effective,p_previous,p_items)$$;
revoke all on function public.create_pv_baseline(text,text,date,uuid,jsonb) from public,anon;
grant execute on function public.create_pv_baseline(text,text,date,uuid,jsonb) to authenticated;

create function pv_governance.transition_baseline(p_id uuid,p_expected text,p_state text,p_reason text) returns public.pv_baseline_releases
language plpgsql security definer set search_path='' as $$
declare r public.pv_baseline_releases;x jsonb;s public.pv_source_reviews;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 perform public.pv_organizational_text(p_reason,'Release decision',1000);
 select * into r from public.pv_baseline_releases where id=p_id for update;
 if not found or r.state is distinct from p_expected then raise exception 'Release changed. Reload before deciding';end if;
 if p_state is null or not ((r.state='draft' and p_state='in_review') or (r.state='in_review' and p_state in ('approved','rejected')) or (r.state='approved' and p_state='published') or (r.state='published' and p_state='withdrawn')) then raise exception 'Invalid release transition';end if;
 if p_state='approved' and r.author=auth.uid() then raise exception 'A different human must approve the baseline release';end if;
 if p_state in ('approved','published') then
  for x in select * from jsonb_array_elements(r.manifest->'items') loop
   select * into s from public.pv_source_reviews where document_version_id=(x->'source'->>'id')::uuid order by reviewed_at desc,id desc limit 1;
   if s.id is distinct from (x->'verification'->>'id')::uuid or s.decision<>'verified' then raise exception 'Source review changed. Create a new release snapshot';end if;
  end loop;
 end if;
 update public.pv_baseline_releases set state=p_state,reviewer=case when p_state='approved' then auth.uid() else reviewer end,reviewed_at=case when p_state='approved' then clock_timestamp() else reviewed_at end,published_at=case when p_state='published' then clock_timestamp() else published_at end where id=p_id returning * into r;
 insert into public.pv_baseline_events(release_id,actor,state,reason) values(r.id,auth.uid(),p_state,trim(p_reason));return r;
end $$;
revoke all on function pv_governance.transition_baseline(uuid,text,text,text) from public,anon;
grant execute on function pv_governance.transition_baseline(uuid,text,text,text) to authenticated;
create function public.transition_pv_baseline(p_id uuid,p_expected text,p_state text,p_reason text) returns public.pv_baseline_releases
language sql security invoker set search_path='' as $$select pv_governance.transition_baseline(p_id,p_expected,p_state,p_reason)$$;
revoke all on function public.transition_pv_baseline(uuid,text,text,text) from public,anon;
grant execute on function public.transition_pv_baseline(uuid,text,text,text) to authenticated;

-- Published bodies and source review records are immutable, including for ordinary admin RPCs.
create function pv_governance.immutable_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Evidence history cannot be deleted';end if;
 if tg_table_name<>'pv_baseline_releases' or (to_jsonb(new)-array['state','reviewer','reviewed_at','published_at']) is distinct from (to_jsonb(old)-array['state','reviewer','reviewed_at','published_at']) then raise exception 'Evidence snapshots cannot be overwritten';end if;
 return new;
end $$;
revoke all on function pv_governance.immutable_evidence() from public,anon,authenticated;
create trigger immutable_source_reviews before update or delete on public.pv_source_reviews for each row execute function pv_governance.immutable_evidence();
create trigger immutable_release_manifest before update or delete on public.pv_baseline_releases for each row execute function pv_governance.immutable_evidence();
create trigger immutable_release_events before update or delete on public.pv_baseline_events for each row execute function pv_governance.immutable_evidence();
