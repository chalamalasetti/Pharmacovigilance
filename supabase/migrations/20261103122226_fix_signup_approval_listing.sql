-- Qualify support-list columns: identifier is also a self_manage local variable.
-- Replace only this query; preserve all authentication, approval and grant rules.
do $migration$
declare
 definition text := pg_get_functiondef('pv_accounts.self_manage(text,jsonb)'::regprocedure);
 old_query text := 'select id,identifier,created_at,status from pv_accounts.reset_support where status=''open'' order by created_at limit 100';
 new_query text := 'select rs.id,rs.identifier,rs.created_at,rs.status from pv_accounts.reset_support rs where rs.status=''open'' order by rs.created_at limit 100';
begin
 if position(old_query in definition) = 0 then
  raise exception 'Expected account support-list query not found; review before applying';
 end if;
 execute replace(definition,old_query,new_query);
end
$migration$;
