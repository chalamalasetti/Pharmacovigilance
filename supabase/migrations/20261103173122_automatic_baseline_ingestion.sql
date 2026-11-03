-- Automatic drafting is separate from immutable, human-approved requirement versions.
create table public.pv_baseline_drafts (
 id uuid primary key default gen_random_uuid(),
 candidate_id uuid not null unique references public.pv_document_candidates(id),
 document_version_id uuid not null references public.pv_document_versions(id),
 body jsonb not null,
 state text not null default 'draft' check(state in ('draft','in_review','published','rejected')),
 revision integer not null default 1 check(revision>0),
 requirement_version_id uuid references public.pv_requirement_versions(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((state='published')=(requirement_version_id is not null))
);
create index pv_baseline_drafts_capture on public.pv_baseline_drafts(document_version_id,state);
create index pv_baseline_drafts_requirement on public.pv_baseline_drafts(requirement_version_id);
alter table public.pv_baseline_drafts enable row level security;
revoke all on public.pv_baseline_drafts from public,anon,authenticated;
grant select on public.pv_baseline_drafts to authenticated;
create policy "Admins read baseline drafts" on public.pv_baseline_drafts for select to authenticated using((select public.is_app_admin()));
create table public.pv_baseline_draft_events (
 id bigint generated always as identity primary key,
 draft_id uuid not null references public.pv_baseline_drafts(id),
 actor uuid references auth.users(id),command text not null,
 revision integer not null,body jsonb not null,note text not null default '',
 at timestamptz not null default clock_timestamp()
);
create index pv_baseline_draft_events_draft on public.pv_baseline_draft_events(draft_id);
create index pv_baseline_draft_events_actor on public.pv_baseline_draft_events(actor);
alter table public.pv_baseline_draft_events enable row level security;
revoke all on public.pv_baseline_draft_events from public,anon,authenticated;
grant select on public.pv_baseline_draft_events to authenticated;
create policy "Admins read draft history" on public.pv_baseline_draft_events for select to authenticated using((select public.is_app_admin()));

-- Invoker-only trigger/helper: never callable by the public API. Ingestion already
-- runs through service-only capture_pv_document; no new service key or cron needed.
create function public.pv_prepare_baseline_draft(p_candidate uuid) returns uuid
language plpgsql set search_path='' as $$
declare c public.pv_document_candidates;v public.pv_document_versions;b jsonb;result uuid;
begin
 select * into c from public.pv_document_candidates where id=p_candidate;
 if not found or c.classification='possible_removal' or c.review_status in ('accepted','rejected') or c.requirement_version_id is not null then return null;end if;
 select * into v from public.pv_document_versions where id=c.document_version_id;
 if v.archive_path is null or v.content_kind='metadata' then return null;end if;
 b:=jsonb_build_object('title',left(v.metadata->>'title',110)||' · '||left(c.anchor,45),
 'statement',c.statement,'agency',v.metadata->>'agency','topic',v.metadata->>'topic',
 'lifecycle',v.metadata->>'lifecycle','norm',v.metadata->>'norm','source_title',v.metadata->>'title',
 'source_family',v.document_id,'source_edition',v.edition,'source_url',v.source_url,'clause',c.anchor,
 'legal_basis',v.metadata->>'legal_basis','applicability',v.metadata->>'applicability',
 'exceptions',case when c.context<>'' then c.context else 'Review the complete source, definitions, conditions and regional exceptions before publishing.' end,
 'systems','Assess actual system versions, configurations, customizations and interfaces; no vendor-specific impact is inferred.',
 'processes',v.metadata->>'topic','valid_from',coalesce(v.effective_on::text,''),'valid_to','',
 'published_on',coalesce(v.published_on::text,''),'source_status',v.source_status,
 'change_kind',case when c.classification='baseline' then 'Baseline capture' else 'Unclassified' end,
 'change_summary','Automatically extracted draft. Verify wording, legal force, dates, scope and exceptions against the archived source.',
 'predecessor_note','Text matching is unverified. Confirm the stable requirement identity before publishing; an omitted clause is not a withdrawal.');
 perform public.validate_requirement_body(b);
 insert into public.pv_baseline_drafts(candidate_id,document_version_id,body) values(c.id,v.id,b)
 on conflict(candidate_id) do nothing returning id into result;
 if result is not null then
  insert into public.pv_baseline_draft_events(draft_id,command,revision,body) values(result,'automatic draft',1,b);
 else select id into result from public.pv_baseline_drafts where candidate_id=c.id;end if;
 return result;
end $$;
revoke all on function public.pv_prepare_baseline_draft(uuid) from public,anon,authenticated;
create function public.pv_auto_baseline_after_ingestion() returns trigger
language plpgsql set search_path='' as $$ begin
 perform public.pv_prepare_baseline_draft(new.id);return new;
end $$;
revoke all on function public.pv_auto_baseline_after_ingestion() from public,anon,authenticated;
create trigger pv_auto_baseline_after_ingestion after insert on public.pv_document_candidates
for each row execute function public.pv_auto_baseline_after_ingestion();

-- Lazy, idempotent preparation for captures that predate this release.
create function public.admin_prepare_baseline_capture(p_version uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare c record;n integer:=0;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('baseline-capture:'||p_version::text,0));
 for c in select id from public.pv_document_candidates where document_version_id=p_version order by ordinal limit 600 loop
  if public.pv_prepare_baseline_draft(c.id) is not null then n:=n+1;end if;
 end loop;
 return n;
end $$;
revoke all on function public.admin_prepare_baseline_capture(uuid) from public,anon;
grant execute on function public.admin_prepare_baseline_capture(uuid) to authenticated;

create function public.admin_advance_baseline_draft(p_id uuid,p_revision integer,p_command text,p_body jsonb default null,p_note text default '',p_key text default null,p_expected uuid default null,p_confirm_source boolean default false) returns public.pv_baseline_drafts
language plpgsql security definer set search_path='' as $$
declare d public.pv_baseline_drafts;v public.pv_document_versions;c public.pv_document_candidates;r public.pv_requirement_versions;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 select * into d from public.pv_baseline_drafts where id=p_id for update;
 if not found then raise exception 'Draft not found';end if;
 if d.revision<>p_revision then raise exception 'Draft changed. Reload before saving';end if;
 if d.state in ('published','rejected') then raise exception 'Decision finalized; append a new requirement version for corrections';end if;
 select * into v from public.pv_document_versions where id=d.document_version_id;
 select * into c from public.pv_document_candidates where id=d.candidate_id for update;
 if c.review_status in ('accepted','rejected') then raise exception 'Source candidate already reviewed; reload the source history';end if;
 if p_command='save' then
  if d.state<>'draft' then raise exception 'Return to draft before editing';end if;
  perform public.validate_requirement_body(p_body);
  if p_body->>'source_family' is distinct from v.document_id or p_body->>'source_url' is distinct from v.source_url or p_body->>'agency' is distinct from v.metadata->>'agency' or p_body->>'source_edition' is distinct from v.edition or p_body->>'source_title' is distinct from v.metadata->>'title' then raise exception 'Keep captured source identity pinned';end if;
  d.body:=p_body;
 elsif p_command='submit' then
  if d.state<>'draft' then raise exception 'Only drafts can be submitted';end if;
  d.state:='in_review';
 elsif p_command='return' then
  if d.state<>'in_review' then raise exception 'Only review items can return to draft';end if;
  d.state:='draft';
 elsif p_command='reject' then
  perform public.pv_organizational_text(p_note,'Decision rationale',1000);
  d.state:='rejected';
  update public.pv_document_candidates set review_status='rejected',review_note=trim(p_note),reviewed_at=clock_timestamp() where id=c.id;
 elsif p_command='publish' then
  if d.state<>'in_review' then raise exception 'Submit for review before publishing';end if;
  if p_confirm_source is distinct from true then raise exception 'Confirm source, scope, exceptions and extraction coverage';end if;
  perform public.pv_organizational_text(p_note,'Publication rationale',1000);
  perform public.validate_requirement_body(d.body);
  r:=public.admin_version_requirement(p_key,d.body,p_expected);
  update public.pv_requirement_versions set document_version_id=v.id where id=r.id;
  r:=public.admin_review_requirement(r.id,'approved',p_note);
  d.requirement_version_id:=r.id;d.state:='published';
  update public.pv_document_candidates set review_status='accepted',review_note=trim(p_note),reviewed_at=clock_timestamp(),requirement_version_id=r.id where id=c.id;
 else raise exception 'Unknown draft action';end if;
 update public.pv_baseline_drafts set body=d.body,state=d.state,requirement_version_id=d.requirement_version_id,revision=revision+1,updated_at=clock_timestamp() where id=d.id returning * into d;
 insert into public.pv_baseline_draft_events(draft_id,actor,command,revision,body,note) values(d.id,auth.uid(),p_command,d.revision,d.body,left(p_note,1000));
 perform public.admin_log('baseline draft '||p_command,d.id::text,jsonb_build_object('capture',v.id,'revision',d.revision));
 return d;
end $$;
revoke all on function public.admin_advance_baseline_draft(uuid,integer,text,jsonb,text,text,uuid,boolean) from public,anon;
grant execute on function public.admin_advance_baseline_draft(uuid,integer,text,jsonb,text,text,uuid,boolean) to authenticated;
