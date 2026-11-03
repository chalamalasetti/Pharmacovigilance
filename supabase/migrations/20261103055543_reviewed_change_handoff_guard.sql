-- Check the effective team snapshot as well as the requested key before legacy handoff.
create or replace function pv_changes.open_guard(p_source_key text,p_snapshot jsonb,p_team_id uuid) returns public.company_cases language plpgsql security definer set search_path='' as $$
declare effective jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 if p_team_id is not null then
  if not public.is_team_member(p_team_id) then raise exception 'Team access denied';end if;
  select snapshot into effective from public.team_items where team_id=p_team_id and update_id=p_source_key;
 else effective:=p_snapshot;end if;
 if p_source_key like 'candidate:%' or p_source_key like 'regchange:%' or effective->'companyContext'->>'sourceItem' ~ '^(candidate|regchange):' then raise exception 'Complete human triage in Regulatory Change Review before opening a formal change assessment';end if;
 return pv_changes.open_existing_case(p_source_key,p_snapshot,p_team_id);
end $$;
