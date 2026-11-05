-- Additive validation for optional company impact comparisons. Existing private storage and role rules remain unchanged.
create or replace function pv_config.validate_body(b jsonb,ready boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare v text;r jsonb;f text;keys text[]:='{}';control_keys text[]:='{}';p jsonb:=b->'profile';s jsonb:=b->'source';
begin
 if b is null or jsonb_typeof(b)<>'object' or pg_column_size(b)>240000 or b->>'schema' is distinct from '1' or b->>'engine' is distinct from 'config-draft-v1' then raise exception 'Invalid configuration specification';end if;
 if jsonb_typeof(p) is distinct from 'object' or coalesce(p->>'system','') not in ('argus','veeva','arisg','other') or coalesce(b->>'area','') not in ('reporting','transmission','privacy','periodic','process') then raise exception 'Choose system and area';end if;
 perform public.company_case_text(b->>'title','Workspace title',200);
 -- Conservative privacy guard; no system can reliably identify every personal name in prose.
 perform public.company_case_text(b::text,'Organizational configuration',240000);
 if b::text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' then raise exception 'Remove contact details';end if;
 if jsonb_typeof(b->'rules') is distinct from 'array' or jsonb_array_length(b->'rules')>200 or coalesce(b->>'baselineStatus','') not in ('incomplete','confirmed','new_scope') then raise exception 'Invalid baseline';end if;
 for r in select * from jsonb_array_elements(b->'rules') loop
  v:=public.company_case_text(r->>'key','Rule identifier',300);if v=any(keys) then raise exception 'Duplicate baseline rule';end if;keys:=array_append(keys,v);
  if coalesce(r->>'days','')<>'' and (r->>'days' !~ '^[1-9][0-9]{0,2}$') then raise exception 'Invalid reporting timeframe';end if;
 end loop;
 if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(b->'proposal') is distinct from 'object' or jsonb_typeof(b->'generated') is distinct from 'object' or b->'generated'->>'engine' is distinct from 'config-draft-v1' then raise exception 'Generate the specification before saving';end if;
 if coalesce(s->>'url','')<>'' then perform public.company_case_url(s->>'url');end if;
 if coalesce(s->>'effective','')<>'' then perform (s->>'effective')::date;end if;
 if coalesce(s->>'requirementId','')<>'' and not exists(select 1 from public.pv_requirement_versions where id=(s->>'requirementId')::uuid) then raise exception 'Pinned requirement version unavailable';end if;

 if b ? 'companyImpact' then
  if jsonb_typeof(b->'companyImpact') is distinct from 'object' or jsonb_typeof(b->'companyImpact'->'controls') is distinct from 'array' or jsonb_array_length(b->'companyImpact'->'controls')>30 or coalesce(b->'companyImpact'->>'decision','') not in ('more_information','change_required','no_change','not_applicable') then raise exception 'Invalid company impact assessment';end if;
  control_keys:='{}';
  for r in select * from jsonb_array_elements(b->'companyImpact'->'controls') loop
   v:=public.company_case_text(r->>'id','Control ID',100);if v=any(control_keys) then raise exception 'Duplicate company control';end if;control_keys:=array_append(control_keys,v);
   perform public.company_case_text(r->>'expectation','Source expectation',3000);perform public.company_case_url(r->>'sourceUrl');
   if coalesce(r->>'state','') not in ('unknown','supported','potential_gap','not_applicable') then raise exception 'Invalid control assessment';end if;
   if ready then
    if r->>'state'='unknown' then raise exception 'Resolve unknown company controls before approval';end if;
    perform public.company_case_text(r->>'reason','Control rationale',2000);
    if r->>'state' in ('supported','potential_gap') then perform public.company_case_text(r->>'current','Current control',2000);perform public.company_case_text(r->>'evidence','Control evidence',1000);end if;
    if r->>'state'='potential_gap' then perform public.company_case_text(r->>'action','Required action',2000);end if;
    if b->'companyImpact'->>'decision' in ('no_change','not_applicable') and r->>'state' not in ('supported','not_applicable') then raise exception 'No-change decision retains a potential gap';end if;
    if b->'companyImpact'->>'decision'='not_applicable' and r->>'state'<>'not_applicable' then raise exception 'Not-applicable decision needs not-applicable controls';end if;
   end if;
  end loop;
  if ready then
   if b->'companyImpact'->'scopeConfirmed' is distinct from 'true'::jsonb or jsonb_array_length(b->'companyImpact'->'controls')=0 then raise exception 'Confirm company scope and assess controls';end if;
   perform public.company_case_text(b->'companyImpact'->>'program','Program scope',1000);perform public.company_case_text(b->'companyImpact'->>'stage','Development stage',200);perform public.company_case_text(b->'companyImpact'->>'rationale','Company decision rationale',2000);
   if b->'companyImpact'->>'decision'='more_information' then raise exception 'A final company decision is required';end if;
   if b->'companyImpact'->>'decision'='change_required' and not exists(select 1 from jsonb_array_elements(b->'companyImpact'->'controls') x where x->>'state'='potential_gap') then raise exception 'Change-required decision needs a gap and action';end if;
  end if;
 end if;
 if ready then
  foreach f in array array['version','environment','company','markets'] loop perform public.company_case_text(p->>f,f,500);end loop;
  foreach f in array array['title','url','edition','location','excerpt'] loop perform public.company_case_text(s->>f,f,3000);end loop;
  if s->>'authority' is distinct from 'primary' or s->'verified' is distinct from 'true'::jsonb then raise exception 'Verify primary evidence and dates';end if;
  if b->>'applicability' is distinct from 'relevant' and not coalesce((b->'companyImpact'->>'decision'='not_applicable' and b->>'applicability'='not_relevant'),false) then raise exception 'Relevant applicability required';end if;
  perform public.company_case_text(b->>'rationale','Applicability rationale',2000);
  if b->>'baselineStatus'='incomplete' then raise exception 'Confirm baseline completeness or declare new scope';end if;
  perform public.company_case_text(b->'proposal'->>'change','Proposed change',3000);perform public.company_case_text(b->>'implementation','Implementation and rollback',3000);
  if b->>'area'='reporting' then
   if b->>'baselineStatus'='confirmed' and not coalesce(b->'proposal'->>'baselineKey'=any(keys),false) then raise exception 'Select a captured baseline rule';end if;
   foreach f in array array['key','country','license','destination','clockStart','days','dayType','format','condition','scheduling'] loop perform public.company_case_text(b->'proposal'->'rule'->>f,f,2000);end loop;
   if b->'proposal'->'rule'->>'days' !~ '^[1-9][0-9]{0,2}$' then raise exception 'Invalid proposed timeframe';end if;
  end if;
 end if;
end$$;
