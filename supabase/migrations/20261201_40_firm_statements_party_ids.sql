-- =============================================================================
-- Migration: 20261201_40_firm_statements_party_ids.sql   (verify id: l11_firm)
-- =============================================================================
-- PURPOSE (batch l11, owner-free)
--
--   A. O23 — firm-wide fee statements.
--      A fee statement is a `payments` row written by create_lawyer_invoice_v2/v3
--      (metadata.invoice = true). Those functions stamp payments.firm_id with the
--      issuer's ACTIVE firm (20261124_40 / 20261126_30). Until now only the
--      issuer read his own statements ("invoice owner reads own invoices").
--      New, additive SELECT policy: the firm OWNER, and an ACTIVE member whose
--      role is managing_partner or finance_manager, read every statement that
--      carries his firm's id. Nothing is written, no figure is computed here.
--        public.firm_fee_statement_reader(p_firm uuid) → boolean
--          SECURITY DEFINER (it reads firm_members / firm_profiles, whose own
--          RLS would otherwise recurse), stable, empty search_path. EXECUTE for
--          authenticated (the policy runs it) and service_role, never anon.
--        policy "firm finance reads firm statements" on public.payments
--          for select to authenticated
--          using (firm_id is not null and metadata->>'invoice' = 'true'
--                 and public.firm_fee_statement_reader(firm_id))
--      The list of roles is held equal to FIRM_FEE_STATEMENT_ROLES in
--      src/lib/finance/firmFeeStatements.ts.
--
--   B. N01-5 (owner ٢٤) — the other party's national ID on a contract.
--      Kept encrypted, readable by the contract's author only, every access
--      logged. The cipher is applied by the APP (AES-256-GCM, key in the env
--      var CONTRACT_PARTY_ID_KEY; src/lib/services/contractPartyIdCrypto.ts):
--      the key never reaches the database. Without the key the app stores the
--      SHA-256 only (today's rule for national IDs) — never the plain number.
--        public.contract_party_national_ids   one row per contract
--          contract_id (PK, → contracts, cascade), author_user_id, id_hash
--          (sha-256 hex, for equality), ciphertext ('v1:<iv>:<tag>:<data>',
--          base64; NULL when stored without a key), timestamps.
--        public.contract_party_id_access_log  append-only
--          contract_id (no FK: the log outlives the contract), actor_user_id,
--          action set | clear | read, outcome ok | no_key | refused, created_at.
--      Both tables: RLS enabled AND forced, no policy, no privilege for
--      public / anon / authenticated. service_role reads and writes the first,
--      and only reads / inserts the log (no update, no delete).
--
-- RUN ORDER
--   * AFTER 20261124_40 (payments.firm_id) and 20260905_phase3 (contracts with
--     owner_user_id). The file stops with an error without them.
--   * Before or after the deploy: the new routes answer «غير متاح بعد» (503)
--     while the tables / policy are missing, and nothing else reads them.
--   * Safe to re-run.
--
-- RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261201_40_firm_statements_party_ids.sql
--   → NOTICE  l11_firm verify: OK   and a final row with ok = t.
--   Then supabase/migrations/_verify.sql section verify:l11_firm.
--
-- ROLLBACK
--   begin;
--     drop policy if exists "firm finance reads firm statements" on public.payments;
--     drop function if exists public.firm_fee_statement_reader(uuid);
--     drop table if exists public.contract_party_id_access_log;
--     drop table if exists public.contract_party_national_ids;   -- loses the stored IDs
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. what this file builds on must be in force
do $$
begin
  if to_regclass('public.payments') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.payments'::regclass and attname = 'firm_id' and not attisdropped) then
    raise exception '20261201_40: public.payments.firm_id is missing — run 20261124_40 first';
  end if;
  if to_regclass('public.contracts') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.contracts'::regclass and attname = 'owner_user_id' and not attisdropped) then
    raise exception '20261201_40: public.contracts.owner_user_id is missing — run 20260905_phase3 first';
  end if;
  if to_regclass('public.firm_members') is null or to_regclass('public.firm_profiles') is null then
    raise exception '20261201_40: public.firm_members / public.firm_profiles are missing';
  end if;
end
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- A. firm-wide fee statements (O23)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.firm_fee_statement_reader(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_firm is not null
     and auth.uid() is not null
     and (
       exists (select 1 from public.firm_profiles f
                where f.id = p_firm and f.owner_user_id = auth.uid())
       or exists (select 1 from public.firm_members m
                   where m.firm_id = p_firm
                     and m.user_id = auth.uid()
                     and m.status = 'active'
                     and m.role in ('managing_partner', 'finance_manager'))
     );
$$;

comment on function public.firm_fee_statement_reader(uuid) is
  'True when the caller owns the firm or is its ACTIVE managing_partner / finance_manager — who reads the fee statements every member issued (O23, 20261201_40). Mirrors FIRM_FEE_STATEMENT_ROLES in src/lib/finance/firmFeeStatements.ts.';

revoke all on function public.firm_fee_statement_reader(uuid) from public;
revoke all on function public.firm_fee_statement_reader(uuid) from anon;
grant execute on function public.firm_fee_statement_reader(uuid) to authenticated, service_role;

drop policy if exists "firm finance reads firm statements" on public.payments;
create policy "firm finance reads firm statements" on public.payments
  for select
  to authenticated
  using (
    firm_id is not null
    and (metadata ->> 'invoice') = 'true'
    and public.firm_fee_statement_reader(firm_id)
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- B. the other party's national ID, encrypted by the app (N01-5, owner ٢٤)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.contract_party_national_ids (
  contract_id     text primary key references public.contracts(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  id_hash         text not null check (id_hash ~ '^[0-9a-f]{64}$'),
  ciphertext      text check (ciphertext is null
                              or ciphertext ~ '^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.contract_party_national_ids is
  'N01-5 / owner ٢٤ (20261201_40): the other party''s national ID per contract. ciphertext = AES-256-GCM by the app (key CONTRACT_PARTY_ID_KEY, never in the database); NULL when stored without a key (hash only). Service role only.';

create table if not exists public.contract_party_id_access_log (
  id             bigint generated always as identity primary key,
  contract_id    text not null,
  actor_user_id  uuid,
  action         text not null check (action in ('set', 'clear', 'read')),
  outcome        text not null default 'ok' check (outcome in ('ok', 'no_key', 'refused')),
  created_at     timestamptz not null default now()
);

create index if not exists idx_contract_party_id_access_log_contract
  on public.contract_party_id_access_log (contract_id, created_at desc);

comment on table public.contract_party_id_access_log is
  'N01-5 / owner ٢٤ (20261201_40): every set / clear / read of a contract party''s national ID, append-only. Service role reads and inserts; nobody updates or deletes.';

alter table public.contract_party_national_ids enable row level security;
alter table public.contract_party_national_ids force row level security;
alter table public.contract_party_id_access_log enable row level security;
alter table public.contract_party_id_access_log force row level security;

revoke all on table public.contract_party_national_ids from public, anon, authenticated;
revoke all on table public.contract_party_id_access_log from public, anon, authenticated;
grant select, insert, update, delete on table public.contract_party_national_ids to service_role;
revoke update, delete, truncate on table public.contract_party_id_access_log from service_role;
grant select, insert on table public.contract_party_id_access_log to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- verify
-- ═════════════════════════════════════════════════════════════════════════════
do $verify$
declare
  t text;
  r text;
begin
  if to_regprocedure('public.firm_fee_statement_reader(uuid)') is null then
    raise exception 'l11_firm verify: firm_fee_statement_reader missing';
  end if;
  if not (select p.prosecdef and p.proconfig @> array['search_path=""']
            from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.firm_fee_statement_reader(uuid)')) then
    raise exception 'l11_firm verify: firm_fee_statement_reader is not security definer with an empty search_path';
  end if;
  if has_function_privilege('anon', 'public.firm_fee_statement_reader(uuid)', 'EXECUTE') then
    raise exception 'l11_firm verify: anon can EXECUTE firm_fee_statement_reader';
  end if;
  if not has_function_privilege('authenticated', 'public.firm_fee_statement_reader(uuid)', 'EXECUTE') then
    raise exception 'l11_firm verify: authenticated cannot EXECUTE firm_fee_statement_reader (the policy needs it)';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies
                  where schemaname = 'public' and tablename = 'payments'
                    and policyname = 'firm finance reads firm statements' and cmd = 'SELECT') then
    raise exception 'l11_firm verify: policy "firm finance reads firm statements" missing';
  end if;

  foreach t in array array['public.contract_party_national_ids', 'public.contract_party_id_access_log'] loop
    if to_regclass(t) is null then
      raise exception 'l11_firm verify: % missing', t;
    end if;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = t::regclass) then
      raise exception 'l11_firm verify: RLS is not enabled and forced on %', t;
    end if;
    if exists (select 1 from pg_catalog.pg_policy where polrelid = t::regclass) then
      raise exception 'l11_firm verify: % carries a policy (it must be service-role only)', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT')
         or has_table_privilege(r, t, 'UPDATE') or has_table_privilege(r, t, 'DELETE') then
        raise exception 'l11_firm verify: % holds a privilege on %', r, t;
      end if;
    end loop;
    if not has_table_privilege('service_role', t, 'SELECT') or not has_table_privilege('service_role', t, 'INSERT') then
      raise exception 'l11_firm verify: service_role cannot read / insert %', t;
    end if;
  end loop;
  if has_table_privilege('service_role', 'public.contract_party_id_access_log', 'UPDATE')
     or has_table_privilege('service_role', 'public.contract_party_id_access_log', 'DELETE') then
    raise exception 'l11_firm verify: the access log is not append-only for service_role';
  end if;
  raise notice 'l11_firm verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261201_40 firm-wide fee statements (payments policy + firm_fee_statement_reader) and the encrypted contract party national ID (contract_party_national_ids + access log, service_role only)' as migration,
       to_regprocedure('public.firm_fee_statement_reader(uuid)') is not null
       and not has_function_privilege('anon', 'public.firm_fee_statement_reader(uuid)', 'EXECUTE')
       and exists (select 1 from pg_catalog.pg_policies
                    where schemaname = 'public' and tablename = 'payments'
                      and policyname = 'firm finance reads firm statements')
       and to_regclass('public.contract_party_national_ids') is not null
       and to_regclass('public.contract_party_id_access_log') is not null
       and not has_table_privilege('authenticated', 'public.contract_party_national_ids', 'SELECT')
       and not has_table_privilege('anon', 'public.contract_party_national_ids', 'SELECT')
       as ok;
