-- Freeze the exact source verification supporting each human triage decision.
alter table public.pv_change_reviews add column source_verification jsonb not null default '{}';
create or replace function pv_changes.review(p_change uuid,p_expected uuid,p_decision text,p_kind text,p_summary text,p_rationale text,p_requirements uuid[],p_manual boolean) returns public.pv_change_reviews language plpgsql security definer set search_path='' as $$
declare c public.pv_regulatory_changes;v public.pv_document_versions;prev public.pv_change_reviews;r public.pv_change_reviews;refs jsonb;agency text;verified jsonb;
begin
 if auth.uid() is null or not public.is_app_admin() then raise exception 'Regulatory editor access required' using errcode='42501';end if;
 select * into strict c from public.pv_regulatory_changes where id=p_change for update;
 select * into strict v from public.pv_document_versions where id=c.after_version;
 select * into prev from public.pv_change_reviews where change_id=c.id order by revision desc limit 1;
 if prev.id is distinct from p_expected then raise exception 'Triage changed. Reload before saving';end if;
 if p_decision not in ('more_information','informational','company_review') or p_kind not in ('initial_baseline','editorial','clarification','potential_obligation','effective_date','withdrawal','other') then raise exception 'Choose a triage decision and change type';end if;
 if (c.flags->>'same_original_bytes')::boolean and p_kind in ('potential_obligation','effective_date','withdrawal') then raise exception 'Identical source bytes do not establish a regulatory amendment; classify the extraction review separately';end if;
 perform public.pv_organizational_text(p_summary,'Change summary',3000);perform public.pv_organizational_text(p_rationale,'Triage rationale',3000);
 if cardinality(p_requirements)>30 then raise exception 'Link at most 30 requirement versions';end if;
 select d.agency into agency from public.pv_documents d where id=c.document_id;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.requirement_key,q.revision),'[]') into refs from public.pv_requirement_versions q where q.id=any(p_requirements) and q.review_status='approved' and q.body->>'agency'=agency;
 if jsonb_array_length(refs)<>(select count(distinct x) from unnest(p_requirements) x) then raise exception 'Link approved requirement versions from the same agency';end if;
 if p_decision='company_review' then
  select to_jsonb(s) into verified from public.pv_source_reviews s where s.document_version_id=v.id order by s.reviewed_at desc,s.id desc limit 1;
  if verified->>'decision' is distinct from 'verified' then raise exception 'Verify this exact source capture before company handoff';end if;
  if v.capture_status not in ('captured','partial') or jsonb_array_length(v.sections)=0 then raise exception 'Source text is unavailable; request more information';end if;
  if ((c.flags->>'incomplete')::boolean or (c.flags->>'structural_change')::boolean) and not p_manual then raise exception 'Confirm manual comparison of the original documents for incomplete or structural changes';end if;
 end if;
 insert into public.pv_change_reviews(change_id,revision,decision,change_kind,summary,rationale,manual_comparison,requirements_snapshot,actor,source_verification) values(c.id,coalesce(prev.revision,0)+1,p_decision,p_kind,trim(p_summary),trim(p_rationale),p_manual,refs,auth.uid(),coalesce(verified,'{}'::jsonb)) returning * into r;
 perform public.admin_log('regulatory change triaged',c.id::text,jsonb_build_object('review_id',r.id,'decision',p_decision));return r;
end $$;
