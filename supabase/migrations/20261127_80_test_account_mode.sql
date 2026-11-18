-- =============================================================================
-- Migration: 20261127_80_test_account_mode.sql
-- =============================================================================
-- PURPOSE (owner, 18 Nov 2026 — batch l7 decision 3; launch gap items 16–17)
--   ONE "test account" mode for the two flags that exist today:
--     * profiles.is_demo            (20261125_50 — the sandbox flag), and
--     * the public.test_accounts list (20261017_44 — the team's accounts that
--       pay in Moyasar TEST mode),
--   minus staff (profiles.user_type = 'admin'): test_accounts carries
--   admin@ from the 20261017_44 backfill, and staff are never sandboxed.
--
--   1. public.is_test_account(uuid) — the one predicate (security definer,
--      service role only). is_demo_user(uuid) is NOT widened: the founder
--      seat function (founder_reserve_seat, owned by the founder builder)
--      calls it, and widening it would refuse every test_accounts lawyer the
--      founder seat.
--   2. Money — test mode only. The payment_orders guard (trg_demo_guard, the
--      same trigger name as 20261125_50) now runs
--      public.test_account_payment_guard(): a test account's order is
--      accepted ONLY when the checkout stamped metadata.gateway_mode = 'test'
--      (src/lib/payments/checkoutCore.ts); otherwise
--      'demo_account:live_payment'. payment_orders.live is still null at
--      insert (claim_payment_order sets it later), so the stamp is the only
--      thing an insert trigger can read. An accepted order is tagged
--      metadata.test_account = true. Every other account is untouched.
--      (20261125_50 refused a demo order outright; a demo account can now pay
--      in TEST mode. NOTE: founder_reserve_seat still answers 'demo_account'
--      for profiles.is_demo — that function belongs to the founder builder.)
--   3. Sandbox, caps, open requests — public.demo_guard_sandbox_row()
--      re-created from its LATEST definition (20261125_50, the only one) with
--      is_test_account in place of is_demo_user, so a test_accounts account
--      gets what a demo account had:
--        * a row never links a test account with a real one
--          ('demo_account:sandbox');
--        * a test account's request never enters the open requests real
--          lawyers see (the marketplace_open_requests filter) — now its own
--          token 'demo_account:open_request' (was 'demo_account:readonly');
--        * caps over ALL its rows, any status: 5 cases, 5 consultations,
--          10 clients (demo_account_limits, unchanged).
--      NEW: every service_requests / consultations / lawyer_clients row that
--      touches a test account is tagged metadata.test_account = true (insert
--      and update; never removed), and the app shows «تجريبي» on it.
--   4. Tagging an account later — flagging is_demo, or adding a row to
--      test_accounts, tags that account's existing rows (best effort,
--      per table). A one-time backfill tags the rows of today's test
--      accounts.
--
--   NOT CHANGED: demo_guard_shared_write (community / reviews / marketplace
--   listings stay refused for profiles.is_demo only — test_accounts keep
--   writing there); the founder seat functions; the never-listed triggers
--   (both flags are never listed already).
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261127_80_test_account_mode.sql
--   Expect: NOTICE  20261127_80 verify: OK  and a row with `t`.
--
-- RUN ORDER: AFTER the l7 deploy. The new checkout stamps
--   metadata.gateway_mode on every order; the old one does not, so with this
--   file and the OLD code a test_accounts account could not pay even in test
--   mode (refused 'demo_account:live_payment', a clear 403). Every other
--   account is unaffected either way. Needs 20261125_50 and 20261017_44 —
--   the file refuses to run without them.
--   RE-RUN HAZARD: re-running 20261125_50 after this file puts back the
--   demo-only sandbox and the "demo never pays" guard — re-run this file
--   after it. This file itself is idempotent.
--
-- ROLLBACK (one transaction): re-run 20261125_50 (sandbox + payment guard as
--   they were); then
--   drop trigger if exists trg_profiles_test_account_stamp on public.profiles;
--   drop trigger if exists trg_test_accounts_stamp on public.test_accounts;
--   drop function if exists public.test_account_payment_guard(),
--     public.test_account_stamp_rows(uuid), public.test_account_flag_stamp(),
--     public.is_test_account(uuid);
--   The metadata.test_account tags are records — keep them.
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.is_demo_user(uuid)') is null
     or to_regprocedure('public.demo_guard_sandbox_row()') is null
     or to_regprocedure('public.demo_account_limits()') is null then
    raise exception '20261127_80: run 20261125_50_demo_accounts.sql first';
  end if;
  if to_regclass('public.test_accounts') is null then
    raise exception '20261127_80: run 20261017_44_test_accounts_never_listed.sql first';
  end if;
  if to_regclass('public.payment_orders') is null then
    raise exception '20261127_80: public.payment_orders is missing';
  end if;
end
$pre$;

-- ── 1. the predicate ─────────────────────────────────────────────────────────
create or replace function public.is_test_account(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if p_user is null then
    return false;
  end if;
  -- profiles.is_demo (20261125_50) is a test account, whoever set it
  if public.is_demo_user(p_user) then
    return true;
  end if;
  -- staff are never sandboxed, even when listed (admin@ is in the list)
  if exists (select 1 from public.profiles p where p.id = p_user and p.user_type = 'admin') then
    return false;
  end if;
  return exists (select 1 from public.test_accounts t where t.user_id = p_user);
end
$fn$;

comment on function public.is_test_account(uuid) is
  'l7 decision 3 (20261127_80): a test account = profiles.is_demo, or a row in public.test_accounts that is not staff (user_type admin). Test-mode payments only, sandboxed, capped, tagged «تجريبي». Service role only.';

-- ── 2. money: test mode only, tagged ─────────────────────────────────────────
create or replace function public.test_account_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.user_id is null or not public.is_test_account(new.user_id) then
    return new;
  end if;
  if coalesce(new.metadata ->> 'gateway_mode', '') <> 'test' then
    raise exception 'demo_account:live_payment' using errcode = 'P0001', detail = tg_table_name;
  end if;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('test_account', true);
  return new;
end
$fn$;

comment on function public.test_account_payment_guard() is
  'l7 decision 3 (20261127_80): BEFORE INSERT on payment_orders — a test account (is_test_account) may open an order only in Moyasar TEST mode (metadata.gateway_mode = ''test'', stamped by the checkout), else ''demo_account:live_payment''; an accepted order is tagged metadata.test_account = true.';

drop trigger if exists trg_demo_guard on public.payment_orders;
create trigger trg_demo_guard
  before insert on public.payment_orders
  for each row execute function public.test_account_payment_guard();

-- ── 3. sandbox, caps, open requests, tag: 20261125_50 + is_test_account ──────
-- tg_argv[0] = the owner side, tg_argv[1] = the other side, tg_argv[2] = cap kind
create or replace function public.demo_guard_sandbox_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_new    jsonb := pg_catalog.to_jsonb(new);
  v_old    jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) end;
  v_a      uuid  := nullif(v_new ->> tg_argv[0], '')::uuid;
  v_b      uuid  := nullif(v_new ->> tg_argv[1], '')::uuid;
  -- 20261127_80: one test-account mode (is_demo OR test_accounts, not staff)
  v_a_demo boolean := public.is_test_account(v_a);
  v_b_demo boolean := public.is_test_account(v_b);
  v_kind   text  := tg_argv[2];
  v_cap    int;
  v_n      int;
  v_u      uuid;
  v_new_open boolean;
  v_old_open boolean;
begin
  if not v_a_demo and not v_b_demo then
    return new;
  end if;

  -- a row never links a test account with a real one
  if v_a is not null and v_b is not null and v_a <> v_b and v_a_demo <> v_b_demo
     and (tg_op = 'INSERT'
          or v_a is distinct from nullif(v_old ->> tg_argv[0], '')::uuid
          or v_b is distinct from nullif(v_old ->> tg_argv[1], '')::uuid) then
    raise exception 'demo_account:sandbox' using errcode = 'P0001', detail = tg_table_name;
  end if;

  -- a test request never enters the open requests (marketplace_open_requests' filter)
  if tg_table_name = 'service_requests' and v_a_demo then
    v_new_open := (v_new ->> 'assigned_to') is null
                  and coalesce(v_new ->> 'status', '') in ('pending', 'pending_assignment')
                  and coalesce(v_new ->> 'receiver', '') <> 'ai_workspace';
    v_old_open := tg_op = 'UPDATE'
                  and (v_old ->> 'assigned_to') is null
                  and coalesce(v_old ->> 'status', '') in ('pending', 'pending_assignment')
                  and coalesce(v_old ->> 'receiver', '') <> 'ai_workspace';
    if v_new_open and not v_old_open then
      raise exception 'demo_account:open_request' using errcode = 'P0001', detail = tg_table_name;
    end if;
  end if;

  -- 20261127_80: the row is tagged «تجريبي» (never untagged)
  if v_new ? 'metadata'
     and coalesce(v_new -> 'metadata' ->> 'test_account', '') <> 'true' then
    new := pg_catalog.jsonb_populate_record(
      new,
      jsonb_build_object('metadata',
        coalesce(case when pg_catalog.jsonb_typeof(v_new -> 'metadata') = 'object' then v_new -> 'metadata' end,
                 '{}'::jsonb)
        || jsonb_build_object('test_account', true)));
  end if;

  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- R11: the caps, on insert only, per test account, under that user's lock
  foreach v_u in array array[v_a, v_b] loop
    continue when v_u is null or not public.is_test_account(v_u);
    if v_kind = 'cases' then
      -- only the requester's own case rows count, and only a case row is capped
      continue when v_u is distinct from v_a;
      continue when coalesce(v_new ->> 'receiver', '') = 'ai_workspace'
                 or coalesce(v_new -> 'metadata' ->> 'hearing', '') = 'true'
                 or coalesce(v_new -> 'metadata' ->> 'task', '') = 'true'
                 or coalesce(v_new -> 'metadata' ->> 'client', '') = 'true';
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('demo_cap:cases:' || v_u::text));
      select l.cases into v_cap from public.demo_account_limits() l;
      select count(*) into v_n
        from public.service_requests sr
       where sr.requester_user_id = v_u
         and sr.receiver <> 'ai_workspace'
         and coalesce(sr.metadata ->> 'hearing', '') <> 'true'
         and coalesce(sr.metadata ->> 'task', '') <> 'true'
         and coalesce(sr.metadata ->> 'client', '') <> 'true';
    elsif v_kind = 'consultations' then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('demo_cap:consultations:' || v_u::text));
      select l.consultations into v_cap from public.demo_account_limits() l;
      select count(*) into v_n
        from public.consultations c
       where c.requester_user_id = v_u or c.lawyer_user_id = v_u;
    elsif v_kind = 'clients' then
      continue when v_u is distinct from v_a;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('demo_cap:clients:' || v_u::text));
      select l.clients into v_cap from public.demo_account_limits() l;
      select count(*) into v_n
        from public.lawyer_clients lc
       where lc.owner_user_id = v_u;
    else
      continue;
    end if;
    if v_n >= v_cap then
      raise exception 'demo_account:limit:%', v_kind using errcode = 'P0001', detail = tg_table_name;
    end if;
  end loop;

  return new;
end
$fn$;

comment on function public.demo_guard_sandbox_row() is
  'S3/R11 (20261125_50) + l7 decision 3 (20261127_80): for a TEST ACCOUNT (is_test_account: is_demo or test_accounts, not staff) a row never links it with a real account; its request never enters the open requests (demo_account:open_request); it is capped (demo_account_limits); the row is tagged metadata.test_account = true. Keyed on row columns, so the service role is held too.';

-- (the triggers of 20261125_50 already call this function on service_requests,
--  consultations and lawyer_clients — re-attached here in case they are missing)
do $att$
declare
  r record;
  has_cols boolean;
begin
  for r in
    select * from (values
      ('service_requests', 'requester_user_id', 'assigned_to',     'cases'),
      ('consultations',    'requester_user_id', 'lawyer_user_id',  'consultations'),
      ('lawyer_clients',   'owner_user_id',     'client_user_id',  'clients')
    ) v(t, col_a, col_b, kind)
  loop
    select count(*) = 2 into has_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = r.t and column_name in (r.col_a, r.col_b);
    if to_regclass('public.' || r.t) is null or not has_cols then
      raise notice '20261127_80: public.% has no (%, %) here — skipped', r.t, r.col_a, r.col_b;
      continue;
    end if;
    execute pg_catalog.format('drop trigger if exists trg_demo_guard on public.%I', r.t);
    execute pg_catalog.format(
      'create trigger trg_demo_guard before insert or update on public.%I '
      'for each row execute function public.demo_guard_sandbox_row(%L, %L, %L)', r.t, r.col_a, r.col_b, r.kind);
  end loop;
end
$att$;

-- ── 4. tagging an account's existing rows ────────────────────────────────────
-- best effort, one table at a time: a table that refuses the update is
-- reported (NOTICE) and skipped, never the whole call. Returns the rows tagged.
create or replace function public.test_account_stamp_rows(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record;
  v_n int;
  v_total int := 0;
begin
  if p_user is null or not public.is_test_account(p_user) then
    return 0;
  end if;
  for r in
    select * from (values
      ('service_requests', 'requester_user_id', 'assigned_to'),
      ('consultations',    'requester_user_id', 'lawyer_user_id'),
      ('lawyer_clients',   'owner_user_id',     'client_user_id')
    ) v(t, col_a, col_b)
  loop
    continue when to_regclass('public.' || r.t) is null
              or (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = r.t
                     and column_name in (r.col_a, r.col_b, 'metadata')) <> 3;
    begin
      execute pg_catalog.format(
        'update public.%I set metadata = coalesce(metadata, ''{}''::jsonb) || ''{"test_account": true}''::jsonb
          where (%I = $1 or %I = $1)
            and coalesce(metadata ->> ''test_account'', '''') <> ''true''', r.t, r.col_a, r.col_b)
        using p_user;
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
    exception when others then
      raise notice '20261127_80: tagging public.% rows of % failed (%): skipped', r.t, p_user, sqlerrm;
    end;
  end loop;
  return v_total;
end
$fn$;

comment on function public.test_account_stamp_rows(uuid) is
  'l7 decision 3 (20261127_80): tags metadata.test_account = true on every service_requests / consultations / lawyer_clients row of a test account (either side). Best effort per table. Service role only.';

create or replace function public.test_account_flag_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_table_name = 'profiles' then
    if new.is_demo is true and (tg_op = 'INSERT' or old.is_demo is distinct from true) then
      perform public.test_account_stamp_rows(new.id);
    end if;
  else
    perform public.test_account_stamp_rows(new.user_id);
  end if;
  return null;
end
$fn$;

comment on function public.test_account_flag_stamp() is
  'l7 decision 3 (20261127_80): AFTER a profile is flagged is_demo or a row joins test_accounts, the account''s existing rows are tagged «تجريبي».';

drop trigger if exists trg_profiles_test_account_stamp on public.profiles;
create trigger trg_profiles_test_account_stamp
  after update of is_demo on public.profiles
  for each row execute function public.test_account_flag_stamp();

drop trigger if exists trg_test_accounts_stamp on public.test_accounts;
create trigger trg_test_accounts_stamp
  after insert on public.test_accounts
  for each row execute function public.test_account_flag_stamp();

-- the rows of today's test accounts
do $bf$
declare
  v_u uuid;
  v_n int := 0;
begin
  for v_u in
    select p.id from public.profiles p where p.is_demo
    union
    select t.user_id from public.test_accounts t
  loop
    v_n := v_n + public.test_account_stamp_rows(v_u);
  end loop;
  raise notice '20261127_80: % existing row(s) of test accounts tagged', v_n;
end
$bf$;

-- ── privileges ───────────────────────────────────────────────────────────────
do $gr$
declare
  fn text;
begin
  foreach fn in array array[
    'public.is_test_account(uuid)',
    'public.test_account_payment_guard()',
    'public.test_account_stamp_rows(uuid)',
    'public.test_account_flag_stamp()',
    'public.demo_guard_sandbox_row()'] loop
    execute pg_catalog.format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.is_test_account(uuid) to service_role;
    grant execute on function public.test_account_stamp_rows(uuid) to service_role;
  end if;
end
$gr$;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  v_sandbox text := pg_catalog.pg_get_functiondef('public.demo_guard_sandbox_row()'::regprocedure);
  v_pay     text := pg_catalog.pg_get_functiondef('public.test_account_payment_guard()'::regprocedure);
begin
  if pg_catalog.strpos(v_sandbox, 'is_test_account') = 0
     or pg_catalog.strpos(v_sandbox, 'demo_account:open_request') = 0
     or pg_catalog.strpos(v_sandbox, 'demo_account:sandbox') = 0
     or pg_catalog.strpos(v_sandbox, 'demo_account_limits') = 0
     or pg_catalog.strpos(v_sandbox, 'test_account') = 0 then
    raise exception '20261127_80 verify: demo_guard_sandbox_row lost the test-account predicate, the sandbox, the cap or the tag';
  end if;
  if pg_catalog.strpos(v_pay, 'gateway_mode') = 0 or pg_catalog.strpos(v_pay, 'demo_account:live_payment') = 0 then
    raise exception '20261127_80 verify: test_account_payment_guard lost the test-mode rule';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
                  where t.tgrelid = 'public.payment_orders'::regclass and t.tgname = 'trg_demo_guard'
                    and not t.tgisinternal
                    and t.tgfoid = 'public.test_account_payment_guard()'::regprocedure) then
    raise exception '20261127_80 verify: payment_orders.trg_demo_guard does not run test_account_payment_guard';
  end if;
  if (select count(*) from pg_catalog.pg_trigger t
       where t.tgname = 'trg_demo_guard' and not t.tgisinternal
         and t.tgfoid = 'public.demo_guard_sandbox_row()'::regprocedure
         and t.tgrelid in (to_regclass('public.service_requests'), to_regclass('public.consultations'),
                           to_regclass('public.lawyer_clients'))) <>
     (select count(*) from (values ('service_requests'), ('consultations'), ('lawyer_clients')) v(t)
       where to_regclass('public.' || v.t) is not null) then
    raise exception '20261127_80 verify: a sandbox table has no trg_demo_guard';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.test_accounts'::regclass and tgname = 'trg_test_accounts_stamp' and not tgisinternal)
     or not exists (select 1 from pg_catalog.pg_trigger
                     where tgrelid = 'public.profiles'::regclass and tgname = 'trg_profiles_test_account_stamp' and not tgisinternal) then
    raise exception '20261127_80 verify: the flag-stamp triggers are missing';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'is_test_account') <> 1 then
    raise exception '20261127_80 verify: a second overload of is_test_account';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.is_test_account(uuid)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.test_account_stamp_rows(uuid)', 'EXECUTE')) then
    raise exception '20261127_80 verify: a session may execute a server-only test-account helper';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and (has_function_privilege('anon', 'public.is_test_account(uuid)', 'EXECUTE')
          or has_function_privilege('anon', 'public.test_account_stamp_rows(uuid)', 'EXECUTE')) then
    raise exception '20261127_80 verify: a guest may execute a server-only test-account helper';
  end if;
  raise notice '20261127_80 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261127_80 test account mode (is_demo + test_accounts: test-mode payments only, sandbox, caps 5/5, «تجريبي» tag)' as step,
       (to_regprocedure('public.is_test_account(uuid)') is not null
        and pg_catalog.pg_get_functiondef('public.demo_guard_sandbox_row()'::regprocedure) like '%is_test_account%'
        and exists (select 1 from pg_catalog.pg_trigger t
                     where t.tgrelid = 'public.payment_orders'::regclass and t.tgname = 'trg_demo_guard'
                       and t.tgfoid = 'public.test_account_payment_guard()'::regprocedure)
        and exists (select 1 from pg_catalog.pg_trigger
                     where tgrelid = 'public.test_accounts'::regclass and tgname = 'trg_test_accounts_stamp')) as ok;
