-- Chain step (NOT a migration) for document_shares_path_ownership.test.sql.
--
-- public.document_shares in its LIVE shape, copied verbatim instead of
-- loading 20260706_content_and_ops.sql (which needs tables the harness does
-- not stub) and 20261016_09 (sixteen tables):
--   * the table and its first three policies — 20260706_content_and_ops.sql:137-158;
--   * token_hash / passcode_hash / document_path, token nullable, the unique
--     index — 20260909_document_shares_hashes.sql:25-41;
--   * document_shares_admin_all re-made on public.is_admin() —
--     20261016_09_admin_policies_is_admin.sql:154-158.
-- Plus one stray INSERT policy (a hand-made "anyone signed in may insert"),
-- so the test proves 20261026_66 drops INSERT policies by catalogue scan,
-- not only by name.
create table if not exists public.document_shares (
  id          uuid primary key default gen_random_uuid(),
  token       text unique not null,
  owner_id    uuid references auth.users(id) on delete cascade,
  document_id text,
  title       text,
  passcode    text,
  expires_at  timestamptz,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists document_shares_token_idx on public.document_shares (token);
alter table public.document_shares enable row level security;
drop policy if exists "document_shares_select_own" on public.document_shares;
create policy "document_shares_select_own" on public.document_shares
  for select using (owner_id = auth.uid());
drop policy if exists "document_shares_owner_write" on public.document_shares;
create policy "document_shares_owner_write" on public.document_shares
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table public.document_shares
  add column if not exists token_hash    text,
  add column if not exists passcode_hash text,
  add column if not exists document_path text;
alter table public.document_shares alter column token drop not null;
create unique index if not exists document_shares_token_hash_key on public.document_shares (token_hash);

drop policy if exists document_shares_admin_all on public.document_shares;
create policy document_shares_admin_all on public.document_shares
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "stray signed-in insert" on public.document_shares;
create policy "stray signed-in insert" on public.document_shares
  for insert to authenticated with check (true);

grant all on public.document_shares to app_user, anon, authenticated, service_role;

-- A live share left behind by a forgery before 66 (no such attachment): 66's
-- verify must WARN about it (counted, not rewritten).
insert into public.document_shares (owner_id, document_id, document_path, token_hash, expires_at)
values (null, '999', '70000000-0000-0000-0000-00000000007a/forged.pdf', 'forged-before-66', null)
on conflict do nothing;
