-- Reference captures are public. Company mappings and their histories are account-private.
create schema pv_e2b;
revoke all on schema pv_e2b from public,anon;
grant usage on schema pv_e2b to authenticated;
create table public.e2b_catalogs(id text primary key,sources jsonb not null,references_json jsonb not null,coverage jsonb not null,content_hash text not null,created_at timestamptz not null default clock_timestamp());
create table public.e2b_fields(catalog_id text not null references public.e2b_catalogs(id),field_key text not null,field_hash text not null,body jsonb not null,primary key(catalog_id,field_key));
create table public.e2b_reviews(id bigint generated always as identity primary key,catalog_id text not null,field_key text not null,decision text not null check(decision in ('verified','needs_work')),reason text not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),foreign key(catalog_id,field_key) references public.e2b_fields(catalog_id,field_key));
create index e2b_reviews_field on public.e2b_reviews(catalog_id,field_key,id desc);
create table public.e2b_baselines(id bigint generated always as identity primary key,catalog_id text not null references public.e2b_catalogs(id),snapshot jsonb not null,reason text not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp());
create table public.e2b_mappings(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),catalog_id text not null,field_key text not null,field_hash text not null,revision integer not null default 1,body jsonb not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),foreign key(catalog_id,field_key) references public.e2b_fields(catalog_id,field_key));
create index e2b_mappings_owner on public.e2b_mappings(owner_id,updated_at desc);
create table public.e2b_mapping_history(mapping_id uuid not null references public.e2b_mappings(id),revision integer not null,catalog_id text not null,field_key text not null,field_hash text not null,body jsonb not null,reason text not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),primary key(mapping_id,revision));
alter table public.e2b_catalogs enable row level security;alter table public.e2b_fields enable row level security;alter table public.e2b_reviews enable row level security;alter table public.e2b_baselines enable row level security;alter table public.e2b_mappings enable row level security;alter table public.e2b_mapping_history enable row level security;
revoke all on public.e2b_catalogs,public.e2b_fields,public.e2b_reviews,public.e2b_baselines,public.e2b_mappings,public.e2b_mapping_history from public,anon,authenticated;
grant select on public.e2b_catalogs,public.e2b_fields,public.e2b_reviews,public.e2b_baselines to anon,authenticated;
grant select on public.e2b_mappings,public.e2b_mapping_history to authenticated;
create policy "Public E2B catalogs" on public.e2b_catalogs for select to anon,authenticated using(true);
create policy "Public E2B reference captures" on public.e2b_fields for select to anon,authenticated using(true);
create policy "Public E2B verification decisions" on public.e2b_reviews for select to anon,authenticated using(true);
create policy "Public E2B baseline snapshots" on public.e2b_baselines for select to anon,authenticated using(true);
create policy "Private E2B mappings" on public.e2b_mappings for select to authenticated using(owner_id=(select auth.uid()) and (select auth.jwt()->>'role')='authenticated');
create policy "Private E2B mapping history" on public.e2b_mapping_history for select to authenticated using(exists(select 1 from public.e2b_mappings m where m.id=mapping_id));
create function pv_e2b.review_field(p_catalog text,p_field text,p_hash text,p_decision text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' or not public.is_app_admin() then raise exception 'Baseline editor access required';end if;
 if not exists(select 1 from public.e2b_fields where catalog_id=p_catalog and field_key=p_field and field_hash=p_hash) then raise exception 'Source capture changed or unavailable';end if;
 if p_reason ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then raise exception 'Remove contact details from public review notes';end if;
 if p_decision not in ('verified','needs_work') then raise exception 'Choose a review decision';end if;
 insert into public.e2b_reviews(catalog_id,field_key,decision,reason,actor_id) values(p_catalog,p_field,p_decision,public.company_case_text(p_reason,'Public review reason',2000),auth.uid());
end$$;
create function public.review_e2b_field(p_catalog text,p_field text,p_hash text,p_decision text,p_reason text) returns void language sql security invoker set search_path='' as $$select pv_e2b.review_field(p_catalog,p_field,p_hash,p_decision,p_reason)$$;
create function pv_e2b.publish_baseline(p_catalog text,p_reason text) returns bigint language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;bid bigint;src public.e2b_catalogs;count_all integer;
begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' or not public.is_app_admin() then raise exception 'Baseline approver access required';end if;
 if p_reason ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then raise exception 'Remove contact details from public release notes';end if;
 perform pg_advisory_xact_lock(hashtextextended('e2b:'||p_catalog,0));
 select * into strict src from public.e2b_catalogs where id=p_catalog;
 select count(*) into count_all from public.e2b_fields where catalog_id=p_catalog;
 select jsonb_agg(f.body||jsonb_build_object('review',to_jsonb(r)) order by f.field_key) into snapshot from public.e2b_fields f join lateral(select * from public.e2b_reviews r where r.catalog_id=f.catalog_id and r.field_key=f.field_key order by r.id desc limit 1) r on r.decision='verified' where f.catalog_id=p_catalog;
 if snapshot is null then raise exception 'Review at least one field before publishing a reviewed subset';end if;
 snapshot:=jsonb_build_object('schema',1,'catalogId',p_catalog,'sources',src.sources,'references',src.references_json,'coverage',src.coverage,'totalCaptured',count_all,'publishedCount',jsonb_array_length(snapshot),'records',snapshot);
 insert into public.e2b_baselines(catalog_id,snapshot,reason,actor_id) values(p_catalog,snapshot,public.company_case_text(p_reason,'Public release reason',2000),auth.uid()) returning id into bid;return bid;
end$$;
create function public.publish_e2b_baseline(p_catalog text,p_reason text) returns bigint language sql security invoker set search_path='' as $$select pv_e2b.publish_baseline(p_catalog,p_reason)$$;
create function pv_e2b.save_mapping(p_id uuid,p_expected integer,p_catalog text,p_field text,p_body jsonb,p_reason text) returns public.e2b_mappings language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();m public.e2b_mappings;f public.e2b_fields;k text;reason text;
begin
 if actor is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'Approved sign-in required';end if;
 if p_body is null or jsonb_typeof(p_body)<>'object' or pg_column_size(p_body)>14000 then raise exception 'Invalid mapping';end if;
 perform public.company_case_text(p_body::text,'Organizational mapping',14000);
 if p_body::text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then raise exception 'Remove contacts and personal information';end if;
 if coalesce(p_body->>'system','') not in ('argus','veeva','arisg','other') or coalesce(p_body->>'decision','') not in ('draft','documented','needs_change','not_applicable') then raise exception 'Choose system and mapping decision';end if;
 foreach k in array array['version','environment','company','markets'] loop perform public.company_case_text(p_body->>k,k,500);end loop;
 if p_body->>'decision'<>'draft' then perform public.company_case_text(p_body->>'rationale','Mapping rationale',2000);end if;
 if p_body->>'decision'='documented' then
  perform public.company_case_text(p_body->>'systemField','System field / configuration',2000);perform public.company_case_text(p_body->>'currentControl','Current control',2000);
  if p_body->'checked' is distinct from 'true'::jsonb then raise exception 'Confirm the installed system mapping';end if;
 end if;
 select * into strict f from public.e2b_fields where catalog_id=p_catalog and field_key=p_field;
 reason:=public.company_case_text(p_reason,'Mapping revision reason',2000);
 if p_id is null then
  if p_expected is distinct from 0 then raise exception 'Create from revision zero';end if;
  insert into public.e2b_mappings(owner_id,catalog_id,field_key,field_hash,body) values(actor,p_catalog,p_field,f.field_hash,p_body) returning * into m;
 else
  select * into m from public.e2b_mappings where id=p_id and owner_id=actor for update;
  if not found then raise exception 'Mapping unavailable or access denied';end if;
  if m.revision is distinct from p_expected then raise exception 'Mapping changed. Reload and compare before saving';end if;
  if m.field_key<>p_field then raise exception 'Create another mapping for a different field';end if;
  update public.e2b_mappings set catalog_id=p_catalog,field_hash=f.field_hash,revision=revision+1,body=p_body,updated_at=clock_timestamp() where id=m.id returning * into m;
 end if;
 insert into public.e2b_mapping_history(mapping_id,revision,catalog_id,field_key,field_hash,body,reason,actor_id) values(m.id,m.revision,m.catalog_id,m.field_key,m.field_hash,m.body,reason,actor);return m;
end$$;
create function public.save_e2b_mapping(p_id uuid,p_expected integer,p_catalog text,p_field text,p_body jsonb,p_reason text) returns public.e2b_mappings language sql security invoker set search_path='' as $$select pv_e2b.save_mapping(p_id,p_expected,p_catalog,p_field,p_body,p_reason)$$;
revoke all on function pv_e2b.review_field(text,text,text,text,text),pv_e2b.publish_baseline(text,text),pv_e2b.save_mapping(uuid,integer,text,text,jsonb,text),public.review_e2b_field(text,text,text,text,text),public.publish_e2b_baseline(text,text),public.save_e2b_mapping(uuid,integer,text,text,jsonb,text) from public,anon;
grant execute on function pv_e2b.review_field(text,text,text,text,text),pv_e2b.publish_baseline(text,text),pv_e2b.save_mapping(uuid,integer,text,text,jsonb,text),public.review_e2b_field(text,text,text,text,text),public.publish_e2b_baseline(text,text),public.save_e2b_mapping(uuid,integer,text,text,jsonb,text) to authenticated;

create or replace function public.validate_site_navigation(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare g jsonb; i jsonb; gids text[]:='{}'; pages text[]:='{}'; known text[]:=array['index','briefing','company-briefing','action-center','team','events','company-inbox','changes','account-settings','research','companies','globe','resources','documents','requirements','agencies','archive','about','user-guide','substances','labels','safety-topics','leadership','config-workbench','e2b-studio'];
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
 if not (known <@ (pages || array['user-guide','substances','labels','safety-topics','leadership','config-workbench','e2b-studio'])) then raise exception 'Keep every page in a group; hide optional pages instead of removing them';end if;
end $$;
revoke all on function public.validate_site_navigation(jsonb) from public,anon,authenticated;
-- Register provenance metadata only. PDF capture remains with the existing document collector.
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,status) values
('e2b-ich-core','ICH E2B(R3) Implementation Guide — FDA edition','US','FDA','https://www.fda.gov/media/81904/download','October 2026, Revision 2','E2B data elements and message specification','Both','Guidance','ICH harmonized technical guidance, FDA edition; assess applicable mandates separately','Technical field definitions and message specifications; no company applicability inferred','uncertain','active'),
('e2b-fda-rules','FDA E2B(R3) Core and Regional Data Elements and Business Rules','US','FDA','https://www.fda.gov/media/175373/download?attachment=','Version 1.7, 2024-04-01','E2B regional data and business rules','Both','Technical instruction','FDA regional workbook; source version must be reconciled with newer guidance','Reference workbook; XLSX capture is handled by the E2B importer, not the PDF collector','uncertain','inactive'),
('e2b-fda-regional','FDA Regional Implementation Guide for E2B(R3)','US','FDA','https://www.fda.gov/media/180748/download','August 2024, version 3.1','E2B regional implementation','Both','Technical instruction','FDA technical specifications; later implementation policy may supersede individual statements','Review jurisdiction, product scope and subsequent FDA implementation policies','uncertain','active') on conflict(id) do nothing;
insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status,status) values('e2b-ich-alignment','ICH E2B(R3) alignment with E2D(R1) information paper','US','FDA','https://www.fda.gov/media/195119/download?attachment=','Adopted 16 December 2025','E2B report and study-type classification','Both','Technical instruction','ICH technical alignment paper hosted by FDA; verify regional adoption','C.1.3 and C.5.4 technical alignment; prospective use and regional implementation need review','uncertain','active') on conflict(id) do nothing;
