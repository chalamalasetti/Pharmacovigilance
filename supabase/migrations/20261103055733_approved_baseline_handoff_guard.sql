-- A requirement-labeled case must point to a real approved interpretation and citation.
create function pv_changes.guard_baseline_handoff() returns trigger language plpgsql security definer set search_path='' as $$
declare item text:=new.snapshot->'companyContext'->>'sourceItem';q public.pv_requirement_versions;
begin
 if item like 'requirement:%' then
  if substring(item from 13) !~ '^[a-f0-9-]{36}$' then raise exception 'Use a real approved requirement version';end if;
  select * into q from public.pv_requirement_versions where id=substring(item from 13)::uuid;
  if not found or q.review_status<>'approved' or new.snapshot->>'link' is distinct from q.body->>'source_url' then raise exception 'Approve the exact baseline interpretation and preserve its source citation before company handoff';end if;
 end if;return new;
end $$;
revoke all on function pv_changes.guard_baseline_handoff() from public,anon,authenticated;
create trigger guard_approved_requirement_handoff before insert on public.company_cases for each row execute function pv_changes.guard_baseline_handoff();
