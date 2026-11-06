create or replace function pv_content.validate(b jsonb,ready boolean) returns void language plpgsql security invoker set search_path='' as $$
declare x jsonb;k text;ids text[]:='{}';
begin
 if jsonb_typeof(b) is distinct from 'object' or pg_column_size(b)>180000 or b->>'schema' is distinct from '1' or b->>'engine' is distinct from 'pv-content-v1' then raise exception 'Invalid content draft';end if;
 perform public.company_case_text(b::text,'Organizational document content',180000);
 if b::text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then raise exception 'Remove contact details from document content';end if;
 perform public.company_case_text(b->>'title','Document title',200);
 if coalesce(b->'template'->>'id','')='' or coalesce(b->'template'->>'version','')='' or jsonb_typeof(b->'sections') is distinct from 'array' then raise exception 'Template and sections required';end if;
 if jsonb_array_length(b->'sections') not between 1 and 24 then raise exception 'Use 1 to 24 sections';end if;
 for x in select * from jsonb_array_elements(b->'sections') loop
  k:=x->>'id';if k is null or k!~'^[a-z0-9-]{1,60}$' or k=any(ids) then raise exception 'Invalid section identifier';end if;ids:=array_append(ids,k);
  perform public.company_case_text(x->>'title','Section title',160);
  if length(coalesce(x->>'text',''))>8000 or coalesce(x->>'basis','') not in ('source','company','suggested','placeholder') then raise exception 'Invalid section content';end if;
  if ready and (coalesce(trim(x->>'text'),'')='' or x->>'basis'='placeholder' or x->>'text' ~* '\[NEEDED|\[TODO') then raise exception 'Complete missing sections before review';end if;
 end loop;
 if coalesce(b->'source'->>'captureId','')<>'' then
  if not exists(select 1 from public.pv_document_versions c where c.id=(b->'source'->>'captureId')::uuid and c.document_id=b->'source'->>'documentId' and c.source_url=b->'source'->>'url' and c.content_hash=b->'source'->>'checksum') then raise exception 'Pinned source capture does not match';end if;
  if ready and exists(select 1 from public.pv_document_versions c join public.pv_document_versions old on old.id=(b->'source'->>'captureId')::uuid where c.document_id=old.document_id and c.revision>old.revision) then raise exception 'A newer source capture requires reassessment';end if;
  if ready and exists(select 1 from public.pv_documents d where d.id=b->'source'->>'documentId' and d.source_status in ('superseded','withdrawn')) then raise exception 'Source lifecycle requires reassessment';end if;
 end if;
 if ready then
  foreach k in array array['company','markets','audience','system','version'] loop perform public.company_case_text(b->'context'->>k,k,1000);end loop;
  if b->'source'->'verified' is distinct from 'true'::jsonb then raise exception 'Verify the selected source';end if;
  foreach k in array array['title','url','edition','location'] loop perform public.company_case_text(b->'source'->>k,k,3000);end loop;
  perform public.company_case_url(b->'source'->>'url');
 end if;
end$$;
