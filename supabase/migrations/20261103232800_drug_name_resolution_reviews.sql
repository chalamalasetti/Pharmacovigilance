-- Private, append-only reviewer decisions. No shared terminology or portfolio mutations.
create table public.drug_name_reviews (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 request_key uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 status text not null check(status in ('confirmed_ingredient','confirmed_product','rejected','unresolved')),
 reason text not null check(length(trim(reason)) between 15 and 1000 and reason !~* '[@<>]|https?:|\m(patient|dob|email|phone|fax)\M'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<32768 and coalesce(snapshot->>'schema'='1' and length(snapshot->>'input') between 2 and 120 and length(snapshot->>'version') between 1 and 40,false)),
 unique(owner_id,request_key),
 check(status <> 'confirmed_product' or coalesce((jsonb_typeof(snapshot->'evidence'->'ingredients')='array' and jsonb_array_length(snapshot->'evidence'->'ingredients')>0 and jsonb_typeof(snapshot->'evidence'->'forms')='array' and jsonb_array_length(snapshot->'evidence'->'forms')>0 and length(snapshot->'evidence'->>'strength')>0 and snapshot->'evidence'->>'incomplete'='false' and snapshot->'evidence'->'candidate'->>'rxcui'=snapshot->'candidate'->>'rxcui'),false)),
 check(status not like 'confirmed_%' or coalesce((snapshot->'candidate'->>'rxcui' ~ '^[0-9]{1,12}$' and snapshot->'candidate'->>'level'=case status when 'confirmed_product' then 'product' else 'ingredient' end),false))
);
alter table public.drug_name_reviews enable row level security;
revoke all on public.drug_name_reviews from public,anon,authenticated,pv_pending;
grant select on public.drug_name_reviews to authenticated;
grant insert(request_key,status,reason,snapshot) on public.drug_name_reviews to authenticated;
create policy "Read own medicine review decisions" on public.drug_name_reviews for select to authenticated using(owner_id=(select auth.uid()) and (select auth.jwt()->>'role')='authenticated');
create policy "Append own medicine review decisions" on public.drug_name_reviews for insert to authenticated with check(owner_id=(select auth.uid()) and (select auth.jwt()->>'role')='authenticated');
create index drug_name_reviews_owner_created on public.drug_name_reviews(owner_id,created_at desc);
comment on table public.drug_name_reviews is 'Private reviewer-recorded medicine identity decisions with browser-observed source snapshots. Not validated coding, not independent approval, and not a shared synonym registry.';
