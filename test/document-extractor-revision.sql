begin;
do $$
declare d public.pv_documents;v1 public.pv_document_versions;v2 public.pv_document_versions;v3 public.pv_document_versions;again public.pv_document_versions;cap jsonb;items jsonb;
begin
 insert into public.pv_documents(id,title,country,agency,url,edition,topic,lifecycle,norm,legal_basis,applicability,source_status)
 values('synthetic-parser','Synthetic parser evidence','US','FDA','https://www.fda.gov/synthetic-parser','Synthetic edition','PV quality','Both','Guidance','Synthetic basis','Synthetic scope','uncertain')returning * into d;
 cap:=jsonb_build_object('original_hash',repeat('a',64),'content_hash',repeat('b',64),'source_url',d.url,'content_kind','html','partial',false,'excluded',0,'archive_path',d.id||'/'||repeat('a',64)||'.html');
 v1:=public.capture_pv_document(d.id,d.updated_at,null,cap,'[]');
 if v1.parser_version<>'normative-rules-v1' or v1.capture_status<>'no_text' then raise exception 'Legacy method provenance lost';end if;
 items:=jsonb_build_array(jsonb_build_object('anchor','paragraph-1','statement','The sponsor must maintain written safety procedures.','context','Synthetic source scope.','fingerprint',repeat('c',64),'classification','baseline'));
 cap:=cap||'{"parser_version":"normative-rules-v2"}';
 v2:=public.capture_pv_document(d.id,d.updated_at,v1.id,cap,items);
 if v2.id=v1.id or v2.previous_id<>v1.id or v2.original_hash<>v1.original_hash or v2.archive_path<>v1.archive_path or v2.parser_version<>'normative-rules-v2' or v2.capture_status<>'captured' then raise exception 'Method upgrade lost evidence or re-used failed extraction';end if;
 again:=public.capture_pv_document(d.id,d.updated_at,v2.id,cap,'[]');if again.id<>v2.id then raise exception 'Same-method duplicate created';end if;
 cap:=cap||'{"parser_version":"normative-rules-v3"}';v3:=public.capture_pv_document(d.id,d.updated_at,v2.id,cap,items);if v3.previous_id<>v2.id or v3.original_hash<>v2.original_hash or v3.parser_version<>'normative-rules-v3' then raise exception 'Third extractor revision lost evidence';end if;
 begin perform public.capture_pv_document(d.id,d.updated_at,v3.id,cap||'{"parser_version":"unknown-model"}',items);raise exception 'Unknown extraction method accepted';exception when others then if sqlerrm<>'Invalid capture metadata' then raise;end if;end;
end $$;
rollback;
