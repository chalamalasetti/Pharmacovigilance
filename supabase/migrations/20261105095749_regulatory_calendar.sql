-- Regulatory dates are source-versioned evidence, not company obligations.
create table public.pv_regulatory_dates (
 id uuid primary key default gen_random_uuid(),document_version_id uuid not null references public.pv_document_versions(id),
 document_id text not null references public.pv_documents(id),slot text not null,revision integer not null default 1,title text not null,agency text not null,country text not null,
 source_url text not null,source_hash text,source_date date,event_date date,kind text not null default 'effective',
 scope text not null default 'Applicability requires review',anchor text not null default 'Source metadata; exact clause requires review',
 timing_note text not null default '',state text not null default 'pending' check(state in ('pending','verified','rejected','withdrawn','source_changed')),
 reviewed_at timestamptz,published_at timestamptz,unique(document_version_id,slot),
 check(kind in ('effective','compliance','data_lock','submission','consultation'))
);
create index pv_regulatory_dates_version on public.pv_regulatory_dates(document_version_id);
create index pv_regulatory_dates_day on public.pv_regulatory_dates(event_date,id);
alter table public.pv_regulatory_dates enable row level security;
create policy "Published dates or editorial queue" on public.pv_regulatory_dates for select to anon,authenticated using(published_at is not null or (select public.is_app_admin()));
revoke all on public.pv_regulatory_dates from public,anon,authenticated;
grant select on public.pv_regulatory_dates to anon,authenticated;
create table public.pv_regulatory_date_history (
 id bigint generated always as identity primary key,event_id uuid not null references public.pv_regulatory_dates(id),
 actor uuid references auth.users(id),at timestamptz not null default clock_timestamp(),reason text not null,before_value jsonb,after_value jsonb not null
);
create index pv_regulatory_date_history_event on public.pv_regulatory_date_history(event_id,id);
create index pv_regulatory_date_history_actor on public.pv_regulatory_date_history(actor);
alter table public.pv_regulatory_date_history enable row level security;
create policy "Date history editorial access" on public.pv_regulatory_date_history for select to authenticated using((select public.is_app_admin()));
revoke all on public.pv_regulatory_date_history from public,anon,authenticated;
grant select on public.pv_regulatory_date_history to authenticated;

create function pv_governance.prepare_calendar_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare old_event public.pv_regulatory_dates;
begin
 -- Re-extracting identical bytes does not invent a regulatory change or duplicate events.
 if new.original_hash is null or new.archive_path is null then return new;end if;
 if exists(select 1 from public.pv_document_versions v join public.pv_regulatory_dates e on e.document_version_id=v.id where v.document_id=new.document_id and v.original_hash=new.original_hash and v.id<>new.id) then return new;end if;
 for old_event in select e.* from public.pv_regulatory_dates e join public.pv_document_versions v on v.id=e.document_version_id where v.document_id=new.document_id and v.id<>new.id and e.state='verified' for update of e loop
 update public.pv_regulatory_dates set state='source_changed',revision=revision+1 where id=old_event.id;
 insert into public.pv_regulatory_date_history(event_id,reason,before_value,after_value) values(old_event.id,'New source bytes captured; previous date needs reconfirmation',to_jsonb(old_event),to_jsonb(old_event)||jsonb_build_object('state','source_changed','revision',old_event.revision+1));
 end loop;
 if new.effective_on is not null then
 insert into public.pv_regulatory_dates(document_version_id,document_id,slot,title,agency,country,source_url,source_hash,source_date,event_date,scope)
 values(new.id,new.document_id,'effective',new.metadata->>'title',coalesce(new.metadata->>'agency','Unknown'),coalesce(new.metadata->>'country','INT'),new.source_url,new.original_hash,new.published_on,new.effective_on,coalesce(new.metadata->>'applicability','Applicability requires review')) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function pv_governance.prepare_calendar_capture() from public,anon,authenticated;
create trigger prepare_regulatory_calendar after insert on public.pv_document_versions for each row execute function pv_governance.prepare_calendar_capture();
-- Seed latest distinct captured editions only, without asserting editorial verification.
insert into public.pv_regulatory_dates(document_version_id,document_id,slot,title,agency,country,source_url,source_hash,source_date,event_date,scope)
select v.id,v.document_id,'effective',v.metadata->>'title',coalesce(v.metadata->>'agency','Unknown'),coalesce(v.metadata->>'country','INT'),v.source_url,v.original_hash,v.published_on,v.effective_on,coalesce(v.metadata->>'applicability','Applicability requires review')
from public.pv_document_versions v where v.effective_on is not null and v.original_hash is not null and v.archive_path is not null
and not exists(select 1 from public.pv_document_versions newer where newer.document_id=v.document_id and newer.revision>v.revision)
on conflict do nothing;

create function pv_governance.review_calendar(p_id uuid,p_revision integer,p_state text,p_date date,p_kind text,p_scope text,p_anchor text,p_timing text,p_reason text) returns public.pv_regulatory_dates
language plpgsql security definer set search_path='' as $$
declare e public.pv_regulatory_dates; prior public.pv_regulatory_dates;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 select * into prior from public.pv_regulatory_dates where id=p_id for update;
 if not found or prior.revision<>p_revision then raise exception 'Date changed; reload before reviewing';end if;
 if p_state is null or p_state not in ('verified','rejected','withdrawn') then raise exception 'Choose a review decision';end if;
 perform public.pv_organizational_text(p_reason,'Decision reason',1000);
 perform public.pv_organizational_text(p_scope,'Product and reporting scope',2000);
 perform public.pv_organizational_text(p_anchor,'Exact source location',1000);
 if p_date is null or p_kind is null or p_kind not in ('effective','compliance','data_lock','submission','consultation') or length(coalesce(p_timing,''))>2000 then raise exception 'Date, kind and bounded timing note required';end if;
 if p_state='verified' and exists(select 1 from public.pv_document_versions v join public.pv_document_versions n on n.document_id=v.document_id and n.revision>v.revision and n.original_hash is distinct from v.original_hash where v.id=prior.document_version_id) then raise exception 'Newer source bytes exist; review the latest capture';end if;
 update public.pv_regulatory_dates set event_date=p_date,kind=p_kind,scope=trim(p_scope),anchor=trim(p_anchor),timing_note=trim(coalesce(p_timing,'')),state=p_state,reviewed_at=clock_timestamp(),published_at=case when p_state='verified' then coalesce(published_at,clock_timestamp()) else published_at end,revision=revision+1 where id=p_id returning * into e;
 insert into public.pv_regulatory_date_history(event_id,actor,reason,before_value,after_value) values(e.id,auth.uid(),trim(p_reason),to_jsonb(prior),to_jsonb(e));return e;
end $$;
revoke all on function pv_governance.review_calendar(uuid,integer,text,date,text,text,text,text,text) from public,anon;
grant execute on function pv_governance.review_calendar(uuid,integer,text,date,text,text,text,text,text) to authenticated;
create function public.review_pv_calendar(p_id uuid,p_revision integer,p_state text,p_date date,p_kind text,p_scope text,p_anchor text,p_timing text,p_reason text) returns public.pv_regulatory_dates language sql security invoker set search_path='' as $$ select pv_governance.review_calendar(p_id,p_revision,p_state,p_date,p_kind,p_scope,p_anchor,p_timing,p_reason) $$;
revoke all on function public.review_pv_calendar(uuid,integer,text,date,text,text,text,text,text) from public,anon;
grant execute on function public.review_pv_calendar(uuid,integer,text,date,text,text,text,text,text) to authenticated;
