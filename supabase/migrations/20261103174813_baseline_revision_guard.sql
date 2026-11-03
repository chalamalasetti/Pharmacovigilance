-- Require an explicit expected revision, including for callers outside the UI.
create or replace function public.admin_advance_baseline_draft(p_id uuid,p_revision integer,p_command text,p_body jsonb default null,p_note text default '',p_key text default null,p_expected uuid default null,p_confirm_source boolean default false) returns public.pv_baseline_drafts
language plpgsql security definer set search_path='' as $$
declare d public.pv_baseline_drafts;v public.pv_document_versions;c public.pv_document_candidates;r public.pv_requirement_versions;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Admin access required';end if;
 select * into d from public.pv_baseline_drafts where id=p_id for update;
 if not found then raise exception 'Draft not found';end if;
 if d.revision is distinct from p_revision then raise exception 'Draft changed. Reload before saving';end if;
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
