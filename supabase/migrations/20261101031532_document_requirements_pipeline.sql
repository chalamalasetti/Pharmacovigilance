-- Source families, archived official public documents and immutable extracted normative text. No private uploads.
create table public.pv_documents (
 id text primary key check(id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
 title text not null, country text not null check(country in ('US','EU')), agency text not null check(agency in ('FDA','EMA')),
 url text not null, edition text not null, topic text not null, lifecycle text not null, norm text not null,
 legal_basis text not null, applicability text not null,
 source_status text not null check(source_status in ('current','draft','superseded','withdrawn','uncertain')),
 published_on date,effective_on date,status text not null default 'active' check(status in ('active','inactive')),
 updated_at timestamptz not null default clock_timestamp(), check((agency='FDA' and country='US')or(agency='EMA' and country='EU'))
);
create table public.pv_document_versions (
 id uuid primary key default gen_random_uuid(),document_id text not null references public.pv_documents(id),revision integer not null,
 previous_id uuid references public.pv_document_versions(id),edition text not null,source_url text not null,
 source_status text not null,published_on date,effective_on date,metadata jsonb not null,
 original_hash text,content_hash text,content_kind text not null check(content_kind in ('metadata','html','pdf')),
 capture_status text not null check(capture_status in ('metadata_only','captured','partial','no_text')),
 archive_path text,parser_version text,excluded integer not null default 0,sections jsonb not null default '[]',captured_at timestamptz not null default clock_timestamp(),
 unique(document_id,revision)
);
create index pv_document_versions_previous on public.pv_document_versions(previous_id);
create table public.pv_document_candidates (
 id uuid primary key default gen_random_uuid(),document_version_id uuid not null references public.pv_document_versions(id),
 ordinal integer not null,anchor text not null,statement text not null,context text not null,fingerprint text not null,
 classification text not null check(classification in ('baseline','new','changed','unchanged','possible_removal')),
 previous_candidate_id uuid references public.pv_document_candidates(id),previous_requirement_id uuid references public.pv_requirement_versions(id),
 match_score numeric,review_status text not null default 'pending' check(review_status in ('pending','accepted','rejected','more_information')),
 review_note text not null default '',reviewed_at timestamptz,requirement_version_id uuid references public.pv_requirement_versions(id),
 unique(document_version_id,ordinal)
);
create index pv_document_candidates_prior on public.pv_document_candidates(previous_candidate_id);
create index pv_document_candidates_requirement on public.pv_document_candidates(previous_requirement_id);
create index pv_document_candidates_accepted on public.pv_document_candidates(requirement_version_id);
create table public.pv_document_checks (
 document_id text primary key references public.pv_documents(id),checked_at timestamptz not null default clock_timestamp(),
 status text not null check(status in ('captured','unchanged','failed')),note text not null
);
alter table public.pv_requirement_versions add column document_version_id uuid references public.pv_document_versions(id);
create index pv_requirement_versions_document on public.pv_requirement_versions(document_version_id);
alter table public.pv_documents enable row level security;
create policy "Public regulatory evidence" on public.pv_documents for select to anon,authenticated using(true);
revoke all on public.pv_documents from anon,authenticated;
grant select on public.pv_documents to anon,authenticated;
alter table public.pv_document_versions enable row level security;
create policy "Public regulatory evidence" on public.pv_document_versions for select to anon,authenticated using(true);
revoke all on public.pv_document_versions from anon,authenticated;
grant select on public.pv_document_versions to anon,authenticated;
alter table public.pv_document_candidates enable row level security;
create policy "Public regulatory evidence" on public.pv_document_candidates for select to anon,authenticated using(true);
revoke all on public.pv_document_candidates from anon,authenticated;
grant select on public.pv_document_candidates to anon,authenticated;
alter table public.pv_document_checks enable row level security;
create policy "Public regulatory evidence" on public.pv_document_checks for select to anon,authenticated using(true);
revoke all on public.pv_document_checks from anon,authenticated;
grant select on public.pv_document_checks to anon,authenticated;

create or replace function public.pv_organizational_text(v text,label text,maxlen integer) returns text
language plpgsql immutable set search_path='' as $$
begin
 perform public.company_case_text(v,label,maxlen);
 if v ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\m(contact|telephone|fax|author|prepared by|signed by|date of birth|patient name|reporter name)\s*[:=]' then raise exception 'Remove individual and contact details';end if;
 return trim(v);
end $$;
revoke all on function public.pv_organizational_text(text,text,integer) from public,anon,authenticated;
create or replace function public.pv_official_document_url(v text,agency text) returns void
language plpgsql immutable set search_path='' as $$
begin
 perform public.company_case_url(v);
 if not ((agency='FDA' and v ~ '^https://(www\.fda\.gov|www\.ecfr\.gov)/')or(agency='EMA' and v ~ '^https://(www\.ema\.europa\.eu|eur-lex\.europa\.eu)/')) then raise exception 'Use an official source for this agency';end if;
end $$;
revoke all on function public.pv_official_document_url(text,text) from public,anon,authenticated;
create or replace function public.admin_save_pv_document(p_data jsonb,p_expected timestamptz default null) returns public.pv_documents
language plpgsql security definer set search_path='' as $$
declare d public.pv_documents;k text;limit_n integer;old_at timestamptz;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or (select count(*) from jsonb_object_keys(p_data))<>16 then raise exception 'Use the documented source fields';end if;
 foreach k in array array['id','title','country','agency','url','edition','topic','lifecycle','norm','legal_basis','applicability','source_status','published_on','effective_on','status','capture_note'] loop
  if jsonb_typeof(p_data->k) is distinct from 'string' then raise exception 'Invalid source field: %',k;end if;
 end loop;
 if p_data->>'id' !~ '^[a-z0-9][a-z0-9-]{2,79}$' then raise exception 'Invalid stable document ID';end if;
 if not ((p_data->>'agency'='FDA' and p_data->>'country'='US')or(p_data->>'agency'='EMA' and p_data->>'country'='EU')) then raise exception 'Unsupported country and agency pair';end if;
 if p_data->>'lifecycle' not in ('Clinical','Marketed','Both') or p_data->>'norm' not in ('Regulation','Guidance','Technical instruction') or p_data->>'source_status' not in ('current','draft','superseded','withdrawn','uncertain') or p_data->>'status' not in ('active','inactive') then raise exception 'Invalid document classification';end if;
 foreach k in array array['title','edition','topic','legal_basis','applicability','capture_note'] loop
  limit_n:=case k when 'title' then 240 when 'edition' then 100 when 'topic' then 80 when 'legal_basis' then 600 else 1000 end;
  perform public.pv_organizational_text(p_data->>k,k,limit_n);
 end loop;
 perform public.pv_official_document_url(p_data->>'url',p_data->>'agency');
 foreach k in array array['published_on','effective_on'] loop
  if p_data->>k<>'' and (p_data->>k !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_data->>k)::date,'YYYY-MM-DD')<>p_data->>k) then raise exception 'Invalid source date';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('document:'||(p_data->>'id'),0));
 select updated_at into old_at from public.pv_documents where id=p_data->>'id' for update;
 if old_at is distinct from p_expected then raise exception 'Document configuration changed. Reload before saving';end if;
 -- Country/agency identity is stable. Register a separate family for a different authority.
 if exists(select 1 from public.pv_documents where id=p_data->>'id' and (country<>p_data->>'country' or agency<>p_data->>'agency')) then raise exception 'Do not change an existing document authority';end if;
 insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on,status)
 values(p_data->>'id',p_data->>'title',p_data->>'country',p_data->>'agency',p_data->>'url',p_data->>'edition',p_data->>'topic',p_data->>'lifecycle',p_data->>'norm',p_data->>'legal_basis',p_data->>'applicability',p_data->>'source_status',nullif(p_data->>'published_on','')::date,nullif(p_data->>'effective_on','')::date,p_data->>'status')
 on conflict(id) do update set title=excluded.title,url=excluded.url,edition=excluded.edition,topic=excluded.topic,lifecycle=excluded.lifecycle,norm=excluded.norm,legal_basis=excluded.legal_basis,applicability=excluded.applicability,source_status=excluded.source_status,published_on=excluded.published_on,effective_on=excluded.effective_on,status=excluded.status,updated_at=clock_timestamp() returning * into d;
 perform public.admin_log('document source configured',d.id,jsonb_build_object('note',p_data->>'capture_note','status',d.status));return d;
end $$;
revoke all on function public.admin_save_pv_document(jsonb,timestamptz) from public,anon;
grant execute on function public.admin_save_pv_document(jsonb,timestamptz) to authenticated;

-- Called only by the trusted collector. No raw document, author or contact metadata enters this API.
create or replace function public.capture_pv_document(p_id text,p_config timestamptz,p_previous uuid,p_capture jsonb,p_candidates jsonb) returns public.pv_document_versions
language plpgsql security definer set search_path='' as $$
declare d public.pv_documents;prev public.pv_document_versions;v public.pv_document_versions;c jsonb;counter integer:=0;sections jsonb:='[]';prior_doc text;
begin
 perform pg_advisory_xact_lock(hashtextextended('document:'||p_id,0));
 select * into d from public.pv_documents where id=p_id and status='active' for update;
 if not found or d.updated_at is distinct from p_config then raise exception 'Source configuration changed or was deactivated';end if;
 select * into prev from public.pv_document_versions where document_id=p_id order by revision desc limit 1;
 if prev.id is distinct from p_previous then raise exception 'Document changed during collection; retry next check';end if;
 if p_capture is null or coalesce(p_capture->>'original_hash','') !~ '^[a-f0-9]{64}$' or coalesce(p_capture->>'content_hash','') !~ '^[a-f0-9]{64}$' or coalesce(p_capture->>'content_kind','') not in ('html','pdf') then raise exception 'Invalid capture metadata';end if;
 perform public.pv_official_document_url(p_capture->>'source_url',d.agency);
 if p_capture->>'archive_path' is distinct from d.id||'/'||(p_capture->>'original_hash')||'.'||(p_capture->>'content_kind') then raise exception 'Invalid immutable archive path';end if;
 if p_capture->>'original_hash'=prev.original_hash then
  insert into public.pv_document_checks(document_id,status,note) values(p_id,'unchanged','Original bytes unchanged; no duplicate version created') on conflict(document_id) do update set checked_at=clock_timestamp(),status=excluded.status,note=excluded.note;
  return prev;
 end if;
 if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>600 or pg_column_size(p_candidates)>2000000 then raise exception 'Capture exceeds supported scope';end if;
 for c in select * from jsonb_array_elements(p_candidates) loop
  perform public.pv_organizational_text(c->>'statement','Extracted clause',1800);
  perform public.pv_organizational_text(c->>'anchor','Source anchor',200);
  if coalesce(c->>'context','')<>'' then perform public.pv_organizational_text(c->>'context','Source context',1000);end if;
  if coalesce(c->>'fingerprint','') !~ '^[a-f0-9]{64}$' or coalesce(c->>'classification','') not in ('baseline','new','changed','unchanged','possible_removal') then raise exception 'Invalid extraction candidate';end if;
  if nullif(c->>'previous_candidate_id','') is not null and not exists(select 1 from public.pv_document_candidates x join public.pv_document_versions y on y.id=x.document_version_id where x.id=(c->>'previous_candidate_id')::uuid and y.id=prev.id) then raise exception 'Candidate predecessor belongs to a different capture';end if;
  if nullif(c->>'previous_requirement_id','') is not null and not exists(select 1 from public.pv_requirement_versions x where x.id=(c->>'previous_requirement_id')::uuid and x.body->>'source_family'=p_id) then raise exception 'Requirement predecessor belongs to a different document';end if;
  if c->>'classification'<>'possible_removal' then sections:=sections||jsonb_build_array(jsonb_build_object('anchor',c->>'anchor','text',c->>'statement','context',coalesce(c->>'context','')));end if;
 end loop;
 insert into public.pv_document_versions(document_id,revision,previous_id,edition,source_url,source_status,published_on,effective_on,metadata,original_hash,content_hash,content_kind,capture_status,archive_path,parser_version,excluded,sections)
 values(d.id,coalesce(prev.revision,0)+1,prev.id,d.edition,p_capture->>'source_url',d.source_status,d.published_on,d.effective_on,to_jsonb(d),p_capture->>'original_hash',p_capture->>'content_hash',p_capture->>'content_kind',case when (p_capture->>'partial')::boolean then 'partial' when jsonb_array_length(sections)=0 then 'no_text' else 'captured' end,p_capture->>'archive_path','normative-rules-v1',greatest(0,least(100000,coalesce((p_capture->>'excluded')::integer,0))),sections) returning * into v;
 for c in select * from jsonb_array_elements(p_candidates) loop
  counter:=counter+1;
  insert into public.pv_document_candidates(document_version_id,ordinal,anchor,statement,context,fingerprint,classification,previous_candidate_id,previous_requirement_id,match_score)
  values(v.id,counter,c->>'anchor',c->>'statement',coalesce(c->>'context',''),c->>'fingerprint',c->>'classification',nullif(c->>'previous_candidate_id','')::uuid,nullif(c->>'previous_requirement_id','')::uuid,nullif(c->>'match_score','')::numeric);
 end loop;
 insert into public.pv_document_checks(document_id,status,note) values(p_id,'captured',case when v.capture_status='partial' then 'Partial extraction: review source coverage before inferring changes' when v.capture_status='no_text' then 'No normative text extracted; scanned, unsupported or changed layout requires manual review' else 'Captured normative text; candidates await human review' end) on conflict(document_id) do update set checked_at=clock_timestamp(),status=excluded.status,note=excluded.note;
 return v;
end $$;
revoke all on function public.capture_pv_document(text,timestamptz,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.capture_pv_document(text,timestamptz,uuid,jsonb,jsonb) to service_role;
create or replace function public.record_pv_document_failure(p_id text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_note not in ('Source unavailable; previous capture preserved','Unsupported or oversized document; manual capture required','Collection deferred; retry next check') then raise exception 'Use a public failure code';end if;
 insert into public.pv_document_checks(document_id,status,note) values(p_id,'failed',p_note) on conflict(document_id) do update set checked_at=clock_timestamp(),status=excluded.status,note=excluded.note;
end $$;
revoke all on function public.record_pv_document_failure(text,text) from public,anon,authenticated;
grant execute on function public.record_pv_document_failure(text,text) to service_role;

create or replace function public.admin_review_pv_candidate(p_id uuid,p_decision text,p_reason text,p_key text default null,p_expected uuid default null,p_body jsonb default null) returns public.pv_document_candidates
language plpgsql security definer set search_path='' as $$
declare c public.pv_document_candidates;v public.pv_document_versions;r public.pv_requirement_versions;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 if p_decision is null or p_decision not in ('accepted','rejected','more_information') then raise exception 'Invalid extraction decision';end if;
 perform public.pv_organizational_text(p_reason,'Public extraction rationale',1000);
 select * into c from public.pv_document_candidates where id=p_id for update;
 if not found then raise exception 'Candidate not found';end if;
 if c.review_status in ('accepted','rejected') then raise exception 'Extraction decision finalized; use a new requirement version for corrections';end if;
 select * into v from public.pv_document_versions where id=c.document_version_id;
 if p_decision='accepted' then
  if p_body->>'source_family' is distinct from v.document_id or p_body->>'source_url' is distinct from v.source_url or p_body->>'agency' is distinct from v.metadata->>'agency' or p_body->>'source_edition' is distinct from v.edition then raise exception 'Keep the captured document citation pinned';end if;
  if c.classification='possible_removal' and (p_body->>'source_status' not in ('withdrawn','superseded') or coalesce(p_body->>'valid_from','')='') then raise exception 'Possible omission is not withdrawal. Verify authority and an effective date before drafting a removal';end if;
  r:=public.admin_version_requirement(p_key,p_body,p_expected);
  update public.pv_requirement_versions set document_version_id=v.id where id=r.id;
 end if;
 update public.pv_document_candidates set review_status=p_decision,review_note=trim(p_reason),reviewed_at=clock_timestamp(),requirement_version_id=r.id where id=c.id returning * into c;
 perform public.admin_log('extraction reviewed',c.id::text,jsonb_build_object('decision',p_decision));return c;
end $$;
revoke all on function public.admin_review_pv_candidate(uuid,text,text,text,uuid,jsonb) from public,anon;
grant execute on function public.admin_review_pv_candidate(uuid,text,text,text,uuid,jsonb) to authenticated;
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on) values('fda-31480','21 CFR 314.80','US','FDA','https://www.ecfr.gov/current/title-21/section-314.80','eCFR snapshot 2026-10-29','Postmarketing reporting','Marketed','Regulation','21 CFR 314.80. eCFR is authoritative but unofficial; consult the official legal sources.','Applicants within the scope of 21 CFR 314.80; assess product authorization and reporting arrangements.','current',null,null);
insert into public.pv_document_versions(id,document_id,revision,edition,source_url,source_status,published_on,effective_on,metadata,content_kind,capture_status) select 'aa6b1f94-700d-59ed-afaa-a70b6c742219',id,1,edition,'https://www.ecfr.gov/on/2026-10-29/title-21/section-314.80',source_status,published_on,effective_on,to_jsonb(d),'metadata','metadata_only' from public.pv_documents d where id='fda-31480';
update public.pv_requirement_versions set document_version_id='aa6b1f94-700d-59ed-afaa-a70b6c742219' where body->>'source_family'='fda-31480';
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on) values('fda-31232','21 CFR 312.32','US','FDA','https://www.ecfr.gov/current/title-21/section-312.32','eCFR snapshot 2026-10-29','Clinical safety reporting','Clinical','Regulation','21 CFR 312.32. Consult the official legal sources and any pending amendments.','IND sponsors; determine whether information meets the specific reportability criteria.','current',null,null);
insert into public.pv_document_versions(id,document_id,revision,edition,source_url,source_status,published_on,effective_on,metadata,content_kind,capture_status) select 'ca413577-e19f-595c-932f-bcb061e33b18',id,1,edition,'https://www.ecfr.gov/on/2026-10-29/title-21/section-312.32',source_status,published_on,effective_on,to_jsonb(d),'metadata','metadata_only' from public.pv_documents d where id='fda-31232';
update public.pv_requirement_versions set document_version_id='ca413577-e19f-595c-932f-bcb061e33b18' where body->>'source_family'='fda-31232';
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on) values('fda-aems-esg','AEMS electronic submissions','US','FDA','https://www.fda.gov/drugs/fda-adverse-event-monitoring-system-aems/fda-adverse-event-monitoring-system-aems-electronic-submissions','Notice announced April 6, 2026','Electronic reporting','Marketed','Technical instruction','FDA electronic submission requirements and referenced Federal Register notice.','Human drugs, biologics and drug- or biologic-led combination products using ESG NextGen.','current','2026-04-06','2026-10-01');
insert into public.pv_document_versions(id,document_id,revision,edition,source_url,source_status,published_on,effective_on,metadata,content_kind,capture_status) select 'f73124af-2655-53ce-a371-2dc37d951111',id,1,edition,'https://www.fda.gov/drugs/fda-adverse-event-monitoring-system-aems/fda-adverse-event-monitoring-system-aems-electronic-submissions',source_status,published_on,effective_on,to_jsonb(d),'metadata','metadata_only' from public.pv_documents d where id='fda-aems-esg';
update public.pv_requirement_versions set document_version_id='f73124af-2655-53ce-a371-2dc37d951111' where body->>'source_family'='fda-aems-esg';
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on) values('fda-e2d','E2D(R1) Post-Approval Safety Data','US','FDA','https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e2dr1-post-approval-safety-data-definitions-and-standards-management-and-reporting-individual-case','Final March 2026','Postmarketing reporting','Marketed','Guidance','Guidance recommendations; underlying binding regulations remain separately applicable.','Post-approval safety data management and reporting; confirm US-specific implementation.','current','2026-03-03',null);
insert into public.pv_document_versions(id,document_id,revision,edition,source_url,source_status,published_on,effective_on,metadata,content_kind,capture_status) select '344605eb-9b02-51b3-a3e1-2ae949eb75d9',id,1,edition,'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e2dr1-post-approval-safety-data-definitions-and-standards-management-and-reporting-individual-case',source_status,published_on,effective_on,to_jsonb(d),'metadata','metadata_only' from public.pv_documents d where id='fda-e2d';
update public.pv_requirement_versions set document_version_id='344605eb-9b02-51b3-a3e1-2ae949eb75d9' where body->>'source_family'='fda-e2d';
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on) values('ema-gvp-i','GVP Module I — PV systems and quality systems','EU','EMA','https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/good-pharmacovigilance-practices-gvp','2012 module','PV quality and outsourcing','Marketed','Guidance','GVP explains EU PV legislation including Regulation (EU) No 520/2012; confirm the current consolidated legal provisions.','EU marketing authorisation holders and their PV quality systems; confirm role and arrangements.','current','2012-06-25','2012-07-02');
insert into public.pv_document_versions(id,document_id,revision,edition,source_url,source_status,published_on,effective_on,metadata,content_kind,capture_status) select '17543340-3c46-5200-9357-30865feb5efe',id,1,edition,'https://www.ema.europa.eu/en/documents/scientific-guideline/guideline-good-pharmacovigilance-practices-module-i-pharmacovigilance-systems-and-their-quality-systems_en.pdf',source_status,published_on,effective_on,to_jsonb(d),'metadata','metadata_only' from public.pv_documents d where id='ema-gvp-i';
update public.pv_requirement_versions set document_version_id='17543340-3c46-5200-9357-30865feb5efe' where body->>'source_family'='ema-gvp-i';
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,published_on,effective_on) values('eu-520-2012','Commission Implementing Regulation (EU) No 520/2012','EU','EMA','https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02012R0520-20260212','Consolidated 2026-02-12','PV quality and outsourcing','Marketed','Regulation','Regulation (EU) No 520/2012, as amended; consolidation is a documentation aid.','EU marketing authorisation holders within the Article 1 scope.','current',null,null);
insert into public.pv_document_versions(id,document_id,revision,edition,source_url,source_status,published_on,effective_on,metadata,content_kind,capture_status) select '514bf73e-772f-5776-a604-d8c36aa46037',id,1,edition,'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02012R0520-20260212',source_status,published_on,effective_on,to_jsonb(d),'metadata','metadata_only' from public.pv_documents d where id='eu-520-2012';
update public.pv_requirement_versions set document_version_id='514bf73e-772f-5776-a604-d8c36aa46037' where body->>'source_family'='eu-520-2012';

-- Private business/system/data/process drafts trace back to an immutable source snapshot and company case.
create table public.pv_impact_requirements (
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.company_cases(id),
 kind text not null check(kind in ('business','system','data','process')),revision integer not null,previous_id uuid references public.pv_impact_requirements(id),
 applicability_snapshot jsonb not null,statement text not null,acceptance_criteria text not null,rationale text not null,system_scope text not null default '',
 status text not null default 'draft' check(status in ('draft','in_review','approved','changes_requested')),
 author_email text not null,reviewer_email text,review_note text,reviewed_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 unique(case_id,kind,revision)
);
create index pv_impact_requirements_previous on public.pv_impact_requirements(previous_id);
alter table public.pv_impact_requirements enable row level security;
create policy "Case participants read impact requirements" on public.pv_impact_requirements for select to authenticated using(exists(select 1 from public.company_cases c where c.id=case_id and (c.owner_id=(select auth.uid()) or public.is_team_member(c.team_id))));
revoke all on public.pv_impact_requirements from anon,authenticated;
grant select on public.pv_impact_requirements to authenticated;
create or replace function public.save_pv_impact_requirement(p_case uuid,p_kind text,p_fields jsonb,p_expected uuid default null) returns public.pv_impact_requirements
language plpgsql security definer set search_path='' as $$
declare c public.company_cases;prev public.pv_impact_requirements;r public.pv_impact_requirements;k text;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into c from public.company_cases where id=p_case and (owner_id=auth.uid() or public.is_team_member(team_id)) for update;
 if not found then raise exception 'Case access denied';end if;
 if c.stage='closed' or c.decision->>'decision' is distinct from 'relevant' then raise exception 'Record a relevant applicability decision on an open case first';end if;
 if p_kind is null or p_kind not in ('business','system','data','process') then raise exception 'Invalid requirement type';end if;
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
create or replace function public.review_pv_impact_requirement(p_id uuid,p_command text,p_note text,p_reviewer text default null) returns public.pv_impact_requirements
language plpgsql security definer set search_path='' as $$
declare r public.pv_impact_requirements;c public.company_cases;who text:=lower(auth.jwt()->>'email');reviewer text;cid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select case_id into cid from public.pv_impact_requirements where id=p_id;
 select * into c from public.company_cases where id=cid and (owner_id=auth.uid() or public.is_team_member(team_id)) for update;
 if not found then raise exception 'Case access denied';end if;
 select * into r from public.pv_impact_requirements where id=p_id for update;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||':'||r.kind,0));
 if r.revision<>(select max(revision) from public.pv_impact_requirements where case_id=cid and kind=r.kind) then raise exception 'A newer draft exists';end if;
 if c.stage='closed' or c.decision->>'decision' is distinct from 'relevant' then raise exception 'Case is closed or applicability changed';end if;
 perform public.pv_organizational_text(p_note,'Draft review note',1000);
 if p_command='submit' and r.status='draft' then
  reviewer:=case when c.team_id is null then who else public.company_case_email(p_reviewer) end;
  if c.team_id is not null and (reviewer=r.author_email or not exists(select 1 from public.team_members where team_id=c.team_id and lower(email)=reviewer)) then raise exception 'Choose a different current team member to review this draft';end if;
  update public.pv_impact_requirements set status='in_review',reviewer_email=reviewer,review_note=trim(p_note) where id=p_id returning * into r;
 elsif p_command in ('approve','return') and r.status='in_review' then
  if who is distinct from r.reviewer_email or (c.team_id is not null and who=r.author_email) then raise exception 'Only the designated independent reviewer can review';end if;
  update public.pv_impact_requirements set status=case when p_command='approve' then 'approved' else 'changes_requested' end,review_note=trim(p_note),reviewed_at=clock_timestamp() where id=p_id returning * into r;
 else raise exception 'Invalid draft review transition; append a new revision for changes';end if;
 return r;
end $$;
revoke all on function public.review_pv_impact_requirement(uuid,text,text,text) from public,anon;
grant execute on function public.review_pv_impact_requirement(uuid,text,text,text) to authenticated;

create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','research','companies','globe','resources','documents','requirements','agencies','archive','about'];
begin
 if v is null or jsonb_typeof(v) is distinct from 'object' or v->'version' is distinct from '1'::jsonb or jsonb_typeof(v->'groups') is distinct from 'array' then raise exception 'Invalid navigation layout';end if;
 if jsonb_array_length(v->'groups') not between 1 and 12 then raise exception 'Use between 1 and 12 menu groups';end if;
 for g in select * from jsonb_array_elements(v->'groups') loop
  if jsonb_typeof(g) is distinct from 'object' or jsonb_typeof(g->'id') is distinct from 'string' or g->>'id' !~ '^[a-z0-9-]{1,40}$' or g->>'id'=any(gids) or jsonb_typeof(g->'label') is distinct from 'string' or length(trim(g->>'label')) not between 1 and 32 or jsonb_typeof(g->'items') is distinct from 'array' then raise exception 'Invalid group ID, name or item list';end if;
  gids:=array_append(gids,g->>'id');
  if jsonb_array_length(g->'items')>14 then raise exception 'Too many items in a group';end if;
  for i in select * from jsonb_array_elements(g->'items') loop
   if jsonb_typeof(i) is distinct from 'object' or not coalesce(i->>'id'=any(known),false) or i->>'id'=any(pages) or jsonb_typeof(i->'label') is distinct from 'string' or length(trim(i->>'label')) not between 1 and 32 or jsonb_typeof(i->'hidden') is distinct from 'boolean' then raise exception 'Invalid, duplicate or unknown page';end if;
   if i->>'id'='index' and (i->>'hidden')::boolean then raise exception 'Updates must stay visible';end if;
   pages:=array_append(pages,i->>'id');
  end loop;
 end loop;
 if cardinality(pages)<>cardinality(known) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
end $$;
revoke all on function public.validate_site_navigation(jsonb) from public,anon,authenticated;



notify pgrst,'reload schema';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pv-regulatory-documents','pv-regulatory-documents',true,8388608,array['application/pdf','application/octet-stream']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Regulatory archive blocks client insert" on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'pv-regulatory-documents');
create policy "Regulatory archive blocks client update" on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'pv-regulatory-documents') with check(bucket_id<>'pv-regulatory-documents');
create policy "Regulatory archive blocks client delete" on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'pv-regulatory-documents');

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
 if p_command='approve' and c.decision->>'decision'='relevant' and exists(select 1 from (select distinct on (kind) status,applicability_snapshot from public.pv_impact_requirements where case_id=c.id order by kind,revision desc) r where r.status<>'approved' or r.applicability_snapshot is distinct from c.decision) then raise exception 'Approve the latest impact requirement drafts for the current applicability decision before closing this case';end if;
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

notify pgrst,'reload schema';
