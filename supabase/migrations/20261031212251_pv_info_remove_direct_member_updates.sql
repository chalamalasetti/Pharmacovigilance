set local lock_timeout='5s';
revoke update on public.team_members from public, anon, authenticated;
revoke update (name) on public.team_members from public, anon, authenticated;
