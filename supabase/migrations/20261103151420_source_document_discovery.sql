-- Discovery proposes public source links; it never approves legal interpretations.
create schema pv_discovery;
revoke all on schema pv_discovery from public,anon,authenticated;
create table public.pv_discovery_connectors(
 id text primary key check(id ~ '^[a-z0-9-]{3,80}$'),agency text not null references public.pv_agencies(id),
 title text not null,url text not null,format text not null check(format in('html','rss','sitemap')),
 keywords text not null,active boolean not null default false,interval_minutes integer not null default 1440 check(interval_minutes between 60 and 43200),
 terms_note text not null,updated_at timestamptz not null default clock_timestamp(),checked_at timestamptz,last_status text,last_count integer
);
create table public.pv_discovery_items(
 id uuid primary key default gen_random_uuid(),connector_id text not null references public.pv_discovery_connectors(id),
 agency text not null references public.pv_agencies(id),url text not null,title text not null,
 state text not null default 'pending' check(state in('pending','deferred','rejected','registered')),
 document_id text references public.pv_documents(id),first_seen timestamptz not null default clock_timestamp(),last_seen timestamptz not null default clock_timestamp(),
 reviewed_by uuid references auth.users(id),reason text not null default '',updated_at timestamptz not null default clock_timestamp(),unique(agency,url)
);
create index pv_discovery_items_connector on public.pv_discovery_items(connector_id);
create index pv_discovery_items_document on public.pv_discovery_items(document_id);
create index pv_discovery_items_reviewer on public.pv_discovery_items(reviewed_by);
create table public.pv_discovery_runs(id bigint generated always as identity primary key,connector_id text not null references public.pv_discovery_connectors(id),at timestamptz not null default clock_timestamp(),status text not null,found integer not null default 0,excluded integer not null default 0,truncated boolean not null default false,index_hash text,resolved_url text);
create index pv_discovery_runs_connector on public.pv_discovery_runs(connector_id,at desc);
alter table public.pv_discovery_connectors enable row level security;
alter table public.pv_discovery_items enable row level security;
alter table public.pv_discovery_runs enable row level security;
create policy "Admin discovery connectors" on public.pv_discovery_connectors for select to authenticated using((select public.is_app_admin()));
create policy "Admin discovery candidates" on public.pv_discovery_items for select to authenticated using((select public.is_app_admin()));
create policy "Admin discovery runs" on public.pv_discovery_runs for select to authenticated using((select public.is_app_admin()));
revoke all on public.pv_discovery_connectors,public.pv_discovery_items,public.pv_discovery_runs from public,anon,authenticated;
grant select on public.pv_discovery_connectors,public.pv_discovery_items,public.pv_discovery_runs to authenticated;
grant all on public.pv_discovery_connectors,public.pv_discovery_items,public.pv_discovery_runs to service_role;
grant usage,select on sequence public.pv_discovery_runs_id_seq to service_role;
create function pv_discovery.save(p_data jsonb,p_expected timestamptz) returns public.pv_discovery_connectors language plpgsql security definer set search_path='' as $$
declare c public.pv_discovery_connectors;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin required';end if;
 perform public.pv_organizational_text(p_data->>'title','Connector title',240);
 perform public.pv_organizational_text(p_data->>'keywords','Scope keywords',500);
 perform public.pv_organizational_text(p_data->>'terms_note','Access and reuse review',1000);
 perform public.pv_official_document_url(p_data->>'url',p_data->>'agency');
 perform pg_advisory_xact_lock(hashtextextended('discovery:'||(p_data->>'id'),0));
 select * into c from public.pv_discovery_connectors where id=p_data->>'id' for update;
 if c.updated_at is distinct from p_expected then raise exception 'Connector changed; reload';end if;
 if c.id is not null and c.agency<>p_data->>'agency' then raise exception 'Register a new connector for a different agency';end if;
 insert into public.pv_discovery_connectors(id,agency,title,url,format,keywords,active,interval_minutes,terms_note)
 values(p_data->>'id',p_data->>'agency',p_data->>'title',p_data->>'url',p_data->>'format',p_data->>'keywords',(p_data->>'active')::boolean,(p_data->>'interval_minutes')::integer,p_data->>'terms_note')
 on conflict(id) do update set title=excluded.title,url=excluded.url,format=excluded.format,keywords=excluded.keywords,active=excluded.active,interval_minutes=excluded.interval_minutes,terms_note=excluded.terms_note,updated_at=clock_timestamp() returning * into c;
 perform public.admin_log('discovery connector saved',c.id,jsonb_build_object('config',p_data));return c;
end $$;
create function pv_discovery.record(p_id text,p_config timestamptz,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.pv_discovery_connectors;x jsonb;doc text;n integer:=0;canonical text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Server only';end if;
 select * into c from public.pv_discovery_connectors where id=p_id for update;
 if c.id is null or not c.active or c.updated_at is distinct from p_config then raise exception 'Connector changed or paused';end if;
 perform public.pv_official_document_url(c.url,c.agency);
 if pg_column_size(p_result)>150000 then raise exception 'Discovery result too large';end if;
 if coalesce((p_result->>'failed')::boolean,false) then
  update public.pv_discovery_connectors set checked_at=clock_timestamp(),last_status='failed' where id=c.id;
  insert into public.pv_discovery_runs(connector_id,status) values(c.id,'failed');return '{"failed":true}';
 end if;
 if jsonb_typeof(p_result->'items') is distinct from 'array' or jsonb_array_length(p_result->'items')>50 then raise exception 'Invalid bounded result';end if;
 perform public.pv_official_document_url(p_result->>'resolved_url',c.agency);
 if p_result->>'index_hash' is null or p_result->>'index_hash' !~ '^[a-f0-9]{64}$' then raise exception 'Index checksum required';end if;
 for x in select * from jsonb_array_elements(p_result->'items') loop
  canonical:=x->>'url';perform public.pv_official_document_url(canonical,c.agency);
  perform public.pv_organizational_text(x->>'title','Discovered title',240);
  select id into doc from public.pv_documents where agency=c.agency and split_part(url,'#',1)=canonical order by id limit 1;
  insert into public.pv_discovery_items(connector_id,agency,url,title,state,document_id)
  values(c.id,c.agency,canonical,x->>'title',case when doc is null then 'pending' else 'registered' end,doc)
  on conflict(agency,url) do update set last_seen=clock_timestamp();n:=n+1;
 end loop;
 update public.pv_discovery_connectors set checked_at=clock_timestamp(),last_status='success',last_count=n where id=c.id;
 insert into public.pv_discovery_runs(connector_id,status,found,excluded,truncated,index_hash,resolved_url)
 values(c.id,'success',coalesce((p_result->>'found')::integer,n),coalesce((p_result->>'excluded')::integer,0),coalesce((p_result->>'truncated')::boolean,false),p_result->>'index_hash',p_result->>'resolved_url');
 return jsonb_build_object('proposed',n,'truncated',p_result->'truncated');
end $$;
create function pv_discovery.review(p_id uuid,p_expected timestamptz,p_state text,p_reason text,p_document jsonb default null) returns public.pv_discovery_items language plpgsql security definer set search_path='' as $$
declare r public.pv_discovery_items;d public.pv_documents;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin required';end if;
 perform public.pv_organizational_text(p_reason,'Review reason',1000);
 select * into r from public.pv_discovery_items where id=p_id for update;
 if r.id is null or r.updated_at is distinct from p_expected or r.state='registered' then raise exception 'Candidate changed; reload';end if;
 if p_state not in('pending','deferred','rejected','registered') then raise exception 'Invalid decision';end if;
 if p_state='registered' then
  if p_document->>'agency' is distinct from r.agency or p_document->>'url' is distinct from r.url then raise exception 'Source must match discovered agency and URL';end if;
  perform pg_advisory_xact_lock(hashtextextended('discovery-url:'||r.agency||r.url,0));
  select * into d from public.pv_documents where agency=r.agency and split_part(url,'#',1)=r.url order by id limit 1;
  if d.id is null then
   if exists(select 1 from public.pv_documents where id=p_document->>'id') then raise exception 'Stable document ID already exists; link the appropriate existing record';end if;
   d:=public.admin_save_pv_document(p_document,null);
  end if;
 end if;
 update public.pv_discovery_items set state=p_state,document_id=case when p_state='registered' then d.id else document_id end,reason=p_reason,reviewed_by=auth.uid(),updated_at=clock_timestamp() where id=r.id returning * into r;
 perform public.admin_log('discovery candidate reviewed',r.id::text,jsonb_build_object('state',p_state,'reason',p_reason,'document_id',r.document_id));return r;
end $$;
revoke all on all functions in schema pv_discovery from public,anon,authenticated;
grant usage on schema pv_discovery to authenticated,service_role;
grant execute on function pv_discovery.save(jsonb,timestamptz),pv_discovery.review(uuid,timestamptz,text,text,jsonb) to authenticated;
grant execute on function pv_discovery.record(text,timestamptz,jsonb) to service_role;
create function public.admin_save_pv_discovery(p_data jsonb,p_expected timestamptz default null) returns public.pv_discovery_connectors language sql security invoker set search_path='' as $$select pv_discovery.save(p_data,p_expected)$$;
create function public.admin_review_pv_discovery(p_id uuid,p_expected timestamptz,p_state text,p_reason text,p_document jsonb default null) returns public.pv_discovery_items language sql security invoker set search_path='' as $$select pv_discovery.review(p_id,p_expected,p_state,p_reason,p_document)$$;
create function public.record_pv_discovery(p_id text,p_config timestamptz,p_result jsonb) returns jsonb language sql security invoker set search_path='' as $$select pv_discovery.record(p_id,p_config,p_result)$$;
revoke all on function public.admin_save_pv_discovery(jsonb,timestamptz),public.admin_review_pv_discovery(uuid,timestamptz,text,text,jsonb),public.record_pv_discovery(text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.admin_save_pv_discovery(jsonb,timestamptz),public.admin_review_pv_discovery(uuid,timestamptz,text,text,jsonb) to authenticated;
grant execute on function public.record_pv_discovery(text,timestamptz,jsonb) to service_role;

-- Official publication indexes checked 3 November 2026. Discover links only; no recursive crawl.
insert into public.pv_discovery_connectors(id,agency,title,url,format,keywords,active,interval_minutes,terms_note) values('ema-gvp-publications','EMA','EMA good pharmacovigilance practices publications','https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/good-pharmacovigilance-practices-gvp','html','good pharmacovigilance,gvp module,pharmacovigilance system,periodic safety,risk management,signal management',true,1440,'Public official publication index; link discovery only. Review current editions and archival/reuse conditions before registering captures.');
insert into public.pv_discovery_connectors(id,agency,title,url,format,keywords,active,interval_minutes,terms_note) values('fda-safety-guidances','FDA','FDA adverse events and safety reporting guidances','https://www.fda.gov/vaccines-blood-biologics/general-biologics-guidances/adverse-events-and-product-deviation-guidances','html','postmarketing,safety report,adverse event,adverse reaction,e2b',true,1440,'Public official publication index; link discovery only. Review current editions and archival/reuse conditions before registering captures.');
insert into public.pv_discovery_connectors(id,agency,title,url,format,keywords,active,interval_minutes,terms_note) values('mhra-gpvp-publications','GB_MHRA','MHRA good pharmacovigilance practice publications','https://www.gov.uk/guidance/good-pharmacovigilance-practice-gpvp','html','pharmacovigilance,psmf,signal,risk management',true,1440,'Public official publication index; link discovery only. Review current editions and archival/reuse conditions before registering captures.');
insert into public.pv_discovery_connectors(id,agency,title,url,format,keywords,active,interval_minutes,terms_note) values('hc-gvp-publications','CA_HC','Health Canada good pharmacovigilance practice chapters','https://www.canada.ca/en/health-canada/services/drugs-health-products/compliance-enforcement/good-manufacturing-practices/guidance-documents/pharmacovigilance-guidelines-0102.html','html','pharmacovigilance-guidelines-0102,pharmacovigilance system',true,1440,'Public official publication index; link discovery only. Review current editions and archival/reuse conditions before registering captures.');
insert into public.pv_discovery_connectors(id,agency,title,url,format,keywords,active,interval_minutes,terms_note) values('tga-pv-publications','AU_TGA','TGA pharmacovigilance responsibilities and related guidance','https://www.tga.gov.au/resources/guidance/pharmacovigilance-responsibilities-medicine-sponsors','html','pharmacovigilance,risk-management,periodic-safety,adverse-event,adverse-reaction',true,1440,'Public official publication index; link discovery only. Review current editions and archival/reuse conditions before registering captures.');
