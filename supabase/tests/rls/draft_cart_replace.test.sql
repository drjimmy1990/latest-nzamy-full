-- draft_cart_replace.test.sql — the SQL PUT /api/v1/drafts/cart now issues
-- (PostgREST upsert = INSERT … ON CONFLICT DO UPDATE … RETURNING), run as the
-- signed-in role against public.law_draft_carts exactly as production has it
-- (schema dump 2026-10-10: columns, UNIQUE (user_id, law_slug, article_number),
-- the four own-row policies, GRANT ALL). Chain:
-- (stubs.sql gives auth.uid(), profiles, roles; run.sh needs one file before the test):
--   bash supabase/tests/rls/run.sh supabase/tests/rls/prelude_extensions_schema.sql supabase/tests/rls/draft_cart_replace.test.sql
create table public.law_draft_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  law_slug text not null,
  article_number text not null,
  article_text text not null default '',
  is_exec_reg_added boolean not null default false,
  exec_reg_text text not null default '',
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  payload jsonb,
  unique (user_id, law_slug, article_number)
);
alter table public.law_draft_carts enable row level security;
create policy "users create their own draft carts" on public.law_draft_carts for insert with check (user_id = auth.uid());
create policy "users delete their own draft carts" on public.law_draft_carts for delete using (user_id = auth.uid());
create policy "users read their own draft carts" on public.law_draft_carts for select using (user_id = auth.uid());
create policy "users update their own draft carts" on public.law_draft_carts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant all on public.law_draft_carts to anon, authenticated, service_role;

set role authenticated;
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare
  kept uuid[];
  n int;
  p jsonb;
begin
  -- first save: [5]
  with up as (
    insert into public.law_draft_carts (user_id, law_slug, article_number, position, payload)
      values ('11111111-0000-0000-0000-000000000001', 'labor', '5', 0, '{"v":1}')
      on conflict (user_id, law_slug, article_number) do update
        set position = excluded.position, payload = excluded.payload
      returning id)
  select array_agg(id) into kept from up;
  delete from public.law_draft_carts where user_id = auth.uid() and not (id = any (kept));

  -- second save: [5, 7] — the old insert-first route failed here with 23505
  with up as (
    insert into public.law_draft_carts (user_id, law_slug, article_number, position, payload)
      values ('11111111-0000-0000-0000-000000000001', 'labor', '5', 0, '{"v":2}'),
             ('11111111-0000-0000-0000-000000000001', 'labor', '7', 1, '{"v":1}')
      on conflict (user_id, law_slug, article_number) do update
        set position = excluded.position, payload = excluded.payload
      returning id)
  select array_agg(id) into kept from up;
  delete from public.law_draft_carts where user_id = auth.uid() and not (id = any (kept));
  select count(*) into n from public.law_draft_carts;
  select payload into p from public.law_draft_carts where article_number = '5';
  if n <> 2 or p->>'v' <> '2' then
    raise exception 'T1 FAIL: after [5,7] the cart has % rows, article 5 payload %', n, p;
  end if;

  -- third save: [7] — 5 is dropped, 7 kept
  with up as (
    insert into public.law_draft_carts (user_id, law_slug, article_number, position, payload)
      values ('11111111-0000-0000-0000-000000000001', 'labor', '7', 0, '{"v":3}')
      on conflict (user_id, law_slug, article_number) do update
        set position = excluded.position, payload = excluded.payload
      returning id)
  select array_agg(id) into kept from up;
  delete from public.law_draft_carts where user_id = auth.uid() and not (id = any (kept));
  select count(*) into n from public.law_draft_carts;
  if n <> 1 or not exists (select 1 from public.law_draft_carts where article_number = '7' and position = 0) then
    raise exception 'T1 FAIL: after [7] the cart has % rows', n;
  end if;
  raise notice 'T1 PASS: [5] → [5,7] → [7] with the live unique key and policies: upsert then delete keeps exactly the new cart';
end $$;

-- another user's row with the same article is untouched
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare kept uuid[];
begin
  with up as (
    insert into public.law_draft_carts (user_id, law_slug, article_number, position)
      values ('22222222-0000-0000-0000-000000000002', 'labor', '7', 0)
      on conflict (user_id, law_slug, article_number) do update set position = excluded.position
      returning id)
  select array_agg(id) into kept from up;
  delete from public.law_draft_carts where user_id = auth.uid() and not (id = any (kept));
end $$;
reset role;
do $$
begin
  if (select count(*) from public.law_draft_carts) <> 2 then
    raise exception 'T2 FAIL: one user''s save touched the other''s cart';
  end if;
  raise notice 'T2 PASS: each user''s replace touches only their own rows';
end $$;
