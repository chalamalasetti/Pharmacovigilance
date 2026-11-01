-- Re-extract unchanged originals when the method improves; retain each method and interpretation history.
create or replace function public.capture_pv_document(p_id text,p_config timestamptz,p_previous uuid,p_capture jsonb,p_candidates jsonb) returns public.pv_document_versions
language plpgsql security definer set search_path='' as $$
declare d public.pv_documents;prev public.pv_document_versions;v public.pv_document_versions;c jsonb;counter integer:=0;sections jsonb:='[]';prior_doc text;method text:=coalesce(p_capture->>'parser_version','normative-rules-v1');
begin
 perform pg_advisory_xact_lock(hashtextextended('document:'||p_id,0));
 select * into d from public.pv_documents where id=p_id and status='active' for update;
 if not found or d.updated_at is distinct from p_config then raise exception 'Source configuration changed or was deactivated';end if;
 select * into prev from public.pv_document_versions where document_id=p_id order by revision desc limit 1;
 if prev.id is distinct from p_previous then raise exception 'Document changed during collection; retry next check';end if;
 if p_capture is null or coalesce(p_capture->>'original_hash','') !~ '^[a-f0-9]{64}$' or coalesce(p_capture->>'content_hash','') !~ '^[a-f0-9]{64}$' or coalesce(p_capture->>'content_kind','') not in ('html','pdf') or method not in ('normative-rules-v1','normative-rules-v2') then raise exception 'Invalid capture metadata';end if;
 perform public.pv_official_document_url(p_capture->>'source_url',d.agency);
 if p_capture->>'archive_path' is distinct from d.id||'/'||(p_capture->>'original_hash')||'.'||(p_capture->>'content_kind') then raise exception 'Invalid immutable archive path';end if;
 if p_capture->>'original_hash'=prev.original_hash and prev.parser_version=method and (prev.metadata->>'updated_at')::timestamptz is not distinct from d.updated_at then
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
 values(d.id,coalesce(prev.revision,0)+1,prev.id,d.edition,p_capture->>'source_url',d.source_status,d.published_on,d.effective_on,to_jsonb(d),p_capture->>'original_hash',p_capture->>'content_hash',p_capture->>'content_kind',case when (p_capture->>'partial')::boolean then 'partial' when jsonb_array_length(sections)=0 then 'no_text' else 'captured' end,p_capture->>'archive_path',method,greatest(0,least(100000,coalesce((p_capture->>'excluded')::integer,0))),sections) returning * into v;
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

notify pgrst,'reload schema';
