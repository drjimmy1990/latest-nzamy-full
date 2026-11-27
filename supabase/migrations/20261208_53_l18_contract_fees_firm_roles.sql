-- =============================================================================
-- Migration: 20261208_53_l18_contract_fees_firm_roles.sql
--            (batch l18-answers, verify id: l18_contract_fees_firm_roles)
-- =============================================================================
-- PURPOSE (owner answer ٢٢٩, 27 Nov 2026)
--   «جداول أتعاب العقود في حساب المكتب: تُقصر رؤيتها وتعديلها على (صاحب المكتب +
--   الشريك المدير + المدير المالي) فقط».
--
--   public.contract_payments (20260905 phase 3) is a contract's fee schedule.
--   Until now every colleague who could open a firm contract (can_access_contract
--   / can_manage_contract → can_access_case_row) read and wrote its schedule.
--
--   1. public.contract_fees_visible(contract id) → boolean:
--        * a contract with NO firm (contracts.firm_id is null — a solo lawyer's,
--          firm_id is stamped from the creator's active membership at create):
--          true — the existing policies decide, as before (his own);
--        * a FIRM contract: the caller owns the firm, or is its ACTIVE
--          managing_partner / finance_manager — the same set as
--          public.firm_fee_statement_reader (20261201_40, O23) and
--          FIRM_FEE_STATEMENT_ROLES in the app. A member lawyer who created the
--          contract does NOT see its fee schedule (the owner's words: only
--          those three).
--   2. A RESTRICTIVE policy «firm fee schedule: owner, managing partner,
--      finance» on public.contract_payments, FOR ALL TO authenticated, USING
--      and WITH CHECK contract_fees_visible(contract_id). Restrictive: it is
--      ANDed with the existing select / write policies, so it only narrows.
--      Unaffected: the service role (the payment-reminder cron) and the
--      client's own view (client_contract_detail, SECURITY DEFINER).
--   3. Verify block — RAISES unless (1) and (2) hold.
--
-- ORDER: any time; BEFORE the deploy of batch l18 is best. The app applies the
--   same rule on its own (routes refuse, the contract page hides the schedule),
--   so the order is not load-bearing. Needs 20260905 (contracts,
--   contract_payments), firm_profiles and firm_members.
-- DATA: none. 0 rows changed.
-- SAFE TO RE-RUN: yes (create or replace / drop policy if exists).
-- RUN: docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--        < supabase/migrations/20261208_53_l18_contract_fees_firm_roles.sql
--   Expect: NOTICE  l18_contract_fees_firm_roles verify: OK …  and a row with `t`.
-- ROLLBACK:
--   drop policy if exists "firm fee schedule: owner, managing partner, finance" on public.contract_payments;
--   drop function if exists public.contract_fees_visible(text);
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.contracts') is null or to_regclass('public.contract_payments') is null
     or to_regclass('public.firm_profiles') is null or to_regclass('public.firm_members') is null then
    raise exception '20261208_53: contracts / contract_payments / firm_profiles / firm_members are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'contracts' and column_name = 'firm_id') then
    raise exception '20261208_53: public.contracts.firm_id is missing';
  end if;
end
$pre$;

-- ── 1. who sees a contract's fee schedule ───────────────────────────────────
create or replace function public.contract_fees_visible(p_contract text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((
    select c.firm_id is null
        or (auth.uid() is not null
            and (exists (select 1 from public.firm_profiles f
                          where f.id = c.firm_id and f.owner_user_id = auth.uid())
                 or exists (select 1 from public.firm_members m
                             where m.firm_id = c.firm_id
                               and m.user_id = auth.uid()
                               and m.status = 'active'
                               and m.role in ('managing_partner', 'finance_manager'))))
      from public.contracts c
     where c.id = p_contract
  ), false);
$fn$;

comment on function public.contract_fees_visible(text) is
  '20261208_53 (owner ٢٢٩): a contract''s fee schedule (contract_payments) — a contract with no firm: true (its own policies decide); a firm contract: only the firm owner or an ACTIVE managing_partner / finance_manager (the set of firm_fee_statement_reader, 20261201_40).';

revoke all on function public.contract_fees_visible(text) from public;
do $g$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke all on function public.contract_fees_visible(text) from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    grant execute on function public.contract_fees_visible(text) to authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.contract_fees_visible(text) to service_role;
  end if;
end
$g$;

-- ── 2. the restrictive policy ───────────────────────────────────────────────
drop policy if exists "firm fee schedule: owner, managing partner, finance" on public.contract_payments;
create policy "firm fee schedule: owner, managing partner, finance" on public.contract_payments
  as restrictive
  for all
  to authenticated
  using (public.contract_fees_visible(contract_id))
  with check (public.contract_fees_visible(contract_id));

-- ── 3. verify ───────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  f constant text := 'public.contract_fees_visible(text)';
begin
  if to_regprocedure(f) is null then
    missing := missing || ' contract_fees_visible is missing;';
  else
    if not exists (select 1 from pg_catalog.pg_proc where oid = to_regprocedure(f) and prosecdef and proconfig @> array['search_path=""']) then
      missing := missing || ' contract_fees_visible is not SECURITY DEFINER with an empty search_path;';
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') and has_function_privilege('anon', f, 'EXECUTE') then
      missing := missing || ' anon may execute contract_fees_visible;';
    end if;
    if position('finance_manager' in pg_catalog.pg_get_functiondef(to_regprocedure(f))) = 0
       or position('managing_partner' in pg_catalog.pg_get_functiondef(to_regprocedure(f))) = 0 then
      missing := missing || ' contract_fees_visible does not name the two firm roles;';
    end if;
  end if;
  if not exists (select 1 from pg_catalog.pg_policy p
                  where p.polrelid = 'public.contract_payments'::regclass
                    and p.polname = 'firm fee schedule: owner, managing partner, finance'
                    and not p.polpermissive and p.polcmd = '*'
                    and pg_catalog.pg_get_expr(p.polqual, p.polrelid) like '%contract_fees_visible(contract_id)%'
                    and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) like '%contract_fees_visible(contract_id)%') then
    missing := missing || ' contract_payments has no restrictive fee-schedule policy;';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.contract_payments'::regclass) then
    missing := missing || ' RLS is off on contract_payments;';
  end if;
  if missing <> '' then
    raise exception 'l18_contract_fees_firm_roles verify FAILED:%', missing;
  end if;
  raise notice 'l18_contract_fees_firm_roles verify: OK — a firm contract''s fee schedule is read and written only by the firm owner, an active managing partner or finance manager (restrictive policy on contract_payments); a solo lawyer''s stays his own';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261208_53 l18 contract fees firm roles' as migration, true as ok;
