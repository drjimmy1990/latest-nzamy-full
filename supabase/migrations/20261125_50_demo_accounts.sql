-- =============================================================================
-- Migration: 20261125_50_demo_accounts.sql
-- =============================================================================
-- PURPOSE (owner security tickets S3 and R11, package of 17 Nov 2026)
--   S3 «is_demo»: a demo account writes only into its own sandbox, cannot buy
--   the founder plan or reserve a seat, and is never counted in seats or
--   revenue. R11: demo accounts are LIMITED, not deleted.
--
--   1. public.profiles.is_demo boolean NOT NULL DEFAULT false — the one server
--      truth. NOT public.test_accounts: that table opens Moyasar TEST mode to
--      the team (src/lib/payments/testModeAccess.ts) and holds the staff test
--      accounts that must keep paying in test mode; a demo account must not
--      pay at all. A BEFORE trigger refuses any change of is_demo by the API
--      roles (anon / authenticated): only the service role (the admin route
--      PATCH /api/v1/admin/users/[id]/demo) or the SQL editor sets it.
--      public.is_demo_user(uuid) reads it (security definer, service role).
--   2. Shared / public tables — a demo account never writes them, whoever
--      sends the write (session or service role: BEFORE INSERT triggers keyed
--      on the row's owner column, not on auth.uid()):
--        community_posts.author_id, community_answers.author_id,
--        community_votes.user_id, community_reports.reporter_user_id,
--        reviews.reviewer_id, library_issue_reports.user_id,
--        marketplace_listings.owner_id, marketplace_offers.offeror_id
--      → 'demo_account:readonly'.
--   3. Money — payment_orders.user_id of a demo account is refused
--      ('demo_account:no_payment'), so a demo account never reaches the
--      gateway, never appears in revenue (every revenue reader reads
--      payment_orders), and never holds a founder seat. founder_reserve_seat
--      also answers 'demo_account' (defence in depth): re-created from its
--      LATEST definition (20261124_10) with ONE added check after the order
--      check — the 15-minute hold and the advocate rule are unchanged.
--   4. Sandbox rows — service_requests (requester_user_id ↔ assigned_to),
--      consultations (requester_user_id ↔ lawyer_user_id), lawyer_clients
--      (owner_user_id ↔ client_user_id): a row may not link a demo account
--      with a real one ('demo_account:sandbox'), and a demo account's request
--      never enters the marketplace — the exact open filter of
--      marketplace_open_requests (20261124_30): assigned_to is null, status
--      pending / pending_assignment, receiver <> 'ai_workspace'
--      ('demo_account:readonly'). A lawyer's own self-assigned case stays allowed.
--   5. R11 limits — counted over ALL of the demo account's rows, whatever
--      their status (cancel-and-recreate does not reset them), under a
--      per-user advisory lock (parallel inserts cannot slip past):
--        cases          5  (service_requests it requested, receiver <>
--                           'ai_workspace', not a legacy hearing/task/client
--                           flag row)
--        consultations  5  (either side)
--        clients       10  (lawyer_clients it owns)
--      → 'demo_account:limit:cases' | ':consultations' | ':clients'.
--      public.demo_account_limits() returns the three numbers.
--   6. A demo lawyer / provider is never marketplace-visible
--      (lawyer_profiles / provider_profiles, the 20261017_44 technique), and
--      flagging an account demo un-lists it at once.
--
--   The app maps every token to a fixed Arabic sentence (403) in
--   src/lib/api/dbErrorCore.ts (demoRefusal) — routes answering through
--   dbErrorJson show it; the checkout maps it in checkoutCore.ts.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261125_50_demo_accounts.sql
--   Expect: NOTICE  20261125_50 verify: OK  and a row with `t`.
--
-- RUN ORDER: ANY TIME, before or after the deploy (no account is demo until
--   an admin flags one; the old code never sets is_demo and answers a refusal
--   with its generic error). Needs 20261124_10 (founder_reserve_seat with the
--   15-minute hold) — the file refuses to run without it.
--   RE-RUN HAZARD: re-running 20261124_10 (or 20261122_10 / 20261101_10)
--   after this file drops the demo check from founder_reserve_seat — re-run
--   this file after it. (payment_orders still refuses a demo order, so no
--   demo seat can be reserved through the checkout even then.)
--   This file itself is safe to run any number of times.
--
-- ROLLBACK (in one transaction):
--   1. re-run 20261124_10 (founder_reserve_seat without the demo check);
--   2. drop trigger trg_demo_guard on each table of sections 4–6 and
--      trg_profiles_is_demo_guard / trg_profiles_is_demo_unlist on profiles;
--   3. drop function public.demo_guard_shared_write(), demo_guard_sandbox_row(),
--      demo_never_listed(), profiles_is_demo_guard(), profiles_is_demo_unlist(),
--      demo_account_limits(), is_demo_user(uuid);
--   4. alter table public.profiles drop column is_demo;
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.profiles') is null then
    raise exception '20261125_50: public.profiles is missing';
  end if;
  if to_regprocedure('public.founder_reserve_seat(uuid, uuid)') is null then
    raise exception '20261125_50: run 20261101_10_founder_membership.sql first';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure), '15 minutes') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure), 'not_advocate') = 0 then
    raise exception '20261125_50: run 20261124_10_founder_hold_15min_and_library_points.sql first (15-minute hold + advocate rule)';
  end if;
end
$pre$;

-- ── 1. the flag ──────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_demo boolean not null default false;

comment on column public.profiles.is_demo is
  'S3/R11 (20261125_50): a demo account — sandbox writes only, no payment, no founder seat, capped (5 cases, 5 consultations, 10 clients). Set by the service role only.';

create index if not exists profiles_is_demo_idx on public.profiles (id) where is_demo;

create or replace function public.is_demo_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((select p.is_demo from public.profiles p where p.id = p_user), false);
$fn$;

comment on function public.is_demo_user(uuid) is
  'S3 (20261125_50): true when profiles.is_demo is set for this user; false for null / unknown. Service role only.';

create or replace function public.demo_account_limits()
returns table (cases int, consultations int, clients int)
language sql
immutable
set search_path = ''
as $fn$
  select 5, 5, 10;
$fn$;

comment on function public.demo_account_limits() is
  'R11 (20261125_50): the caps of a demo account — 5 cases, 5 consultations, 10 clients (all rows, any status).';

-- only the service role (or a SQL editor) changes is_demo
create or replace function public.profiles_is_demo_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if current_user in ('anon', 'authenticated')
     and ((tg_op = 'INSERT' and new.is_demo is true)
          or (tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo)) then
    raise exception 'demo_account:flag_locked' using errcode = '42501';
  end if;
  return new;
end
$fn$;

comment on function public.profiles_is_demo_guard() is
  'S3 (20261125_50): anon / authenticated may never set or clear profiles.is_demo (SECURITY INVOKER on purpose: it reads current_user).';

drop trigger if exists trg_profiles_is_demo_guard on public.profiles;
create trigger trg_profiles_is_demo_guard
  before insert or update of is_demo on public.profiles
  for each row execute function public.profiles_is_demo_guard();

-- ── 2 + 3. shared / public tables and payment orders: refused outright ───────
-- tg_argv[0] = the owner column, tg_argv[1] = the refusal token
create or replace function public.demo_guard_shared_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := nullif(pg_catalog.to_jsonb(new) ->> tg_argv[0], '')::uuid;
begin
  if v_uid is not null and public.is_demo_user(v_uid) then
    raise exception '%', coalesce(tg_argv[1], 'demo_account:readonly')
      using errcode = 'P0001', detail = tg_table_name;
  end if;
  return new;
end
$fn$;

comment on function public.demo_guard_shared_write() is
  'S3 (20261125_50): BEFORE INSERT on a shared table — a demo owner (column tg_argv[0]) is refused with tg_argv[1].';

-- ── 4 + 5. sandbox rows and the R11 caps ─────────────────────────────────────
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
  v_a_demo boolean := public.is_demo_user(v_a);
  v_b_demo boolean := public.is_demo_user(v_b);
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

  -- a row never links a demo account with a real one
  if v_a is not null and v_b is not null and v_a <> v_b and v_a_demo <> v_b_demo
     and (tg_op = 'INSERT'
          or v_a is distinct from nullif(v_old ->> tg_argv[0], '')::uuid
          or v_b is distinct from nullif(v_old ->> tg_argv[1], '')::uuid) then
    raise exception 'demo_account:sandbox' using errcode = 'P0001', detail = tg_table_name;
  end if;

  -- a demo request never enters the marketplace (marketplace_open_requests' filter)
  if tg_table_name = 'service_requests' and v_a_demo then
    v_new_open := (v_new ->> 'assigned_to') is null
                  and coalesce(v_new ->> 'status', '') in ('pending', 'pending_assignment')
                  and coalesce(v_new ->> 'receiver', '') <> 'ai_workspace';
    v_old_open := tg_op = 'UPDATE'
                  and (v_old ->> 'assigned_to') is null
                  and coalesce(v_old ->> 'status', '') in ('pending', 'pending_assignment')
                  and coalesce(v_old ->> 'receiver', '') <> 'ai_workspace';
    if v_new_open and not v_old_open then
      raise exception 'demo_account:readonly' using errcode = 'P0001', detail = tg_table_name;
    end if;
  end if;

  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- R11: the caps, on insert only, per demo user, under that user's lock
  foreach v_u in array array[v_a, v_b] loop
    continue when v_u is null or not public.is_demo_user(v_u);
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
  'S3/R11 (20261125_50): a row never links a demo account with a real one; a demo request never enters the marketplace; a demo account is capped (demo_account_limits). Keyed on row columns, so the service role is held too.';

-- ── 6. a demo lawyer / provider is never listed ──────────────────────────────
create or replace function public.demo_never_listed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.marketplace_visible is true and public.is_demo_user(new.user_id) then
    new.marketplace_visible := false;
  end if;
  return new;
end
$fn$;

comment on function public.demo_never_listed() is
  'S3 (20261125_50): a demo account (profiles.is_demo) is never marketplace-visible, whoever writes the row.';

create or replace function public.profiles_is_demo_unlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.is_demo is true and (tg_op = 'INSERT' or old.is_demo is distinct from true) then
    if to_regclass('public.lawyer_profiles') is not null then
      update public.lawyer_profiles set marketplace_visible = false
       where user_id = new.id and marketplace_visible is true;
    end if;
    if to_regclass('public.provider_profiles') is not null then
      update public.provider_profiles set marketplace_visible = false
       where user_id = new.id and marketplace_visible is true;
    end if;
  end if;
  return null;
end
$fn$;

drop trigger if exists trg_profiles_is_demo_unlist on public.profiles;
create trigger trg_profiles_is_demo_unlist
  after insert or update of is_demo on public.profiles
  for each row execute function public.profiles_is_demo_unlist();

-- ── attach the triggers (each only where its table and columns exist) ───────
do $att$
declare
  r record;
  t text;
  has_cols boolean;
begin
  -- shared tables + payment orders: (table, owner column, token)
  for r in
    select * from (values
      ('community_posts',       'author_id',        'demo_account:readonly'),
      ('community_answers',     'author_id',        'demo_account:readonly'),
      ('community_votes',       'user_id',          'demo_account:readonly'),
      ('community_reports',     'reporter_user_id', 'demo_account:readonly'),
      ('reviews',               'reviewer_id',      'demo_account:readonly'),
      ('library_issue_reports', 'user_id',          'demo_account:readonly'),
      ('marketplace_listings',  'owner_id',         'demo_account:readonly'),
      ('marketplace_offers',    'offeror_id',       'demo_account:readonly'),
      ('payment_orders',        'user_id',          'demo_account:no_payment')
    ) v(t, col, token)
  loop
    if to_regclass('public.' || r.t) is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = r.t and column_name = r.col) then
      raise notice '20261125_50: public.% has no column % here — skipped', r.t, r.col;
      continue;
    end if;
    execute pg_catalog.format('drop trigger if exists trg_demo_guard on public.%I', r.t);
    execute pg_catalog.format(
      'create trigger trg_demo_guard before insert on public.%I '
      'for each row execute function public.demo_guard_shared_write(%L, %L)', r.t, r.col, r.token);
  end loop;

  -- sandbox rows: (table, owner column, other column, cap kind)
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
      raise notice '20261125_50: public.% has no (%, %) here — skipped', r.t, r.col_a, r.col_b;
      continue;
    end if;
    execute pg_catalog.format('drop trigger if exists trg_demo_guard on public.%I', r.t);
    execute pg_catalog.format(
      'create trigger trg_demo_guard before insert or update on public.%I '
      'for each row execute function public.demo_guard_sandbox_row(%L, %L, %L)', r.t, r.col_a, r.col_b, r.kind);
  end loop;

  -- never listed
  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'marketplace_visible')
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      raise notice '20261125_50: public.% has no (user_id, marketplace_visible) here — skipped', t;
      continue;
    end if;
    execute pg_catalog.format('drop trigger if exists trg_demo_never_listed on public.%I', t);
    execute pg_catalog.format(
      'create trigger trg_demo_never_listed before insert or update on public.%I '
      'for each row execute function public.demo_never_listed()', t);
    execute pg_catalog.format(
      'update public.%I p set marketplace_visible = false
        where p.marketplace_visible is true
          and exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.is_demo)', t);
  end loop;
end
$att$;

-- ── 3b. founder_reserve_seat: 20261124_10 + the demo check ──────────────────
create or replace function public.founder_reserve_seat(p_user uuid, p_order uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c_campaign constant text := 'founder-2026';
  v_order  record;
  v_cur    record;   -- the user's reserved or active seat
  v_own    record;   -- the seat that already carries p_order
  v_lim    record;
  v_taken  int;
begin
  if p_user is null or p_order is null then
    raise exception 'founder_reserve_seat: p_user and p_order are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'));

  select o.id, o.user_id, o.kind into v_order from public.payment_orders o where o.id = p_order;
  if v_order.id is null or v_order.user_id is distinct from p_user or v_order.kind <> 'membership' then
    raise exception 'founder_reserve_seat: % is not a membership order of this user', p_order
      using errcode = '22023';
  end if;

  -- 20261125_50 (S3): a demo account never reserves a seat, so it is never
  -- counted in the seats
  if public.is_demo_user(p_user) then
    return 'demo_account';
  end if;

  select s.id, s.status, s.reserved_until, po.status as order_status into v_cur
    from public.founder_seats s
    left join public.payment_orders po on po.id = s.order_id
   where s.campaign_id = c_campaign and s.user_id = p_user and s.status in ('reserved', 'active');

  if v_cur.id is not null and (v_cur.status = 'active' or v_cur.order_status = 'paid') then
    return 'already_member';
  end if;

  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = p_user and lp.verification_status = 'verified') then
    return 'not_verified';
  end if;

  -- 20261122_10 (owner, 17 Nov): the founder plan is for a licensed advocate
  -- only; a consultant (م١٨) is refused before any payment.
  if exists (select 1 from public.lawyer_profiles lp
              where lp.user_id = p_user and lp.practice_kind is distinct from 'advocate') then
    return 'not_advocate';
  end if;

  if not public.founder_campaign_active(now()) then
    return 'closed';
  end if;

  select * into v_lim from public.founder_campaign_limits();
  if v_lim.sale_paused then
    return 'paused';
  end if;

  select s.id, s.status into v_own from public.founder_seats s where s.order_id = p_order;
  if v_own.id is not null and v_own.id is distinct from v_cur.id and v_own.status <> 'released' then
    raise exception 'founder_reserve_seat: order % already holds a % seat', p_order, v_own.status
      using errcode = '22023';
  end if;

  -- a live reservation is already counted; anything else needs a free seat
  if not coalesce(v_cur.reserved_until > now(), false) then
    select count(*) into v_taken
      from public.founder_seats s
     where s.campaign_id = c_campaign
       and s.id is distinct from v_cur.id
       and (s.status = 'active' or (s.status = 'reserved' and s.reserved_until > now()));
    if v_taken >= v_lim.capacity then
      return 'full';
    end if;
  end if;

  if v_own.id is not null and v_own.id is distinct from v_cur.id then
    -- p_order sits on a seat released earlier (order_id is UNIQUE): bring that
    -- row back; the user's other reservation, if any, is released first
    if v_cur.id is not null then
      update public.founder_seats set status = 'released' where id = v_cur.id;
    end if;
    update public.founder_seats
       set status = 'reserved', reserved_until = now() + interval '15 minutes'
     where id = v_own.id;
  elsif v_cur.id is not null then
    -- a declined card, a retry: the SAME seat moves to the new order
    update public.founder_seats
       set order_id = p_order, reserved_until = now() + interval '15 minutes'
     where id = v_cur.id;
  else
    insert into public.founder_seats (campaign_id, user_id, order_id, status, reserved_until)
    values (c_campaign, p_user, p_order, 'reserved', now() + interval '15 minutes');
  end if;

  return 'reserved';
end $$;

comment on function public.founder_reserve_seat(uuid, uuid) is
  'Reserves a founder seat for 15 minutes under the seats lock (20261101_10; advocate only since 20261122_10; 15 minutes since 20261124_10, owner ٣; demo accounts refused since 20261125_50, S3): reserved | already_member | full | closed | paused | not_verified | not_advocate | demo_account. An unpaid reservation of the same user is moved to the new order (a retry). Service role only.';

-- ── privileges ───────────────────────────────────────────────────────────────
do $gr$
declare
  fn text;
begin
  foreach fn in array array[
    'public.is_demo_user(uuid)',
    'public.founder_reserve_seat(uuid, uuid)',
    'public.demo_guard_shared_write()',
    'public.demo_guard_sandbox_row()',
    'public.demo_never_listed()',
    'public.profiles_is_demo_unlist()',
    'public.profiles_is_demo_guard()'] loop
    execute pg_catalog.format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.is_demo_user(uuid) to service_role;
    grant execute on function public.founder_reserve_seat(uuid, uuid) to service_role;
    grant execute on function public.demo_account_limits() to service_role;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    grant execute on function public.demo_account_limits() to authenticated;
  end if;
end
$gr$;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  v_reserve text := pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure);
  v_missing text := '';
  r record;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles'
                    and column_name = 'is_demo' and is_nullable = 'NO' and column_default = 'false') then
    raise exception '20261125_50 verify: profiles.is_demo is missing or not NOT NULL DEFAULT false';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.profiles'::regclass and tgname = 'trg_profiles_is_demo_guard' and not tgisinternal) then
    raise exception '20261125_50 verify: the is_demo guard trigger is missing on profiles';
  end if;
  if pg_catalog.strpos(v_reserve, 'demo_account') = 0
     or pg_catalog.strpos(v_reserve, '15 minutes') = 0
     or pg_catalog.strpos(v_reserve, 'not_advocate') = 0
     or pg_catalog.strpos(v_reserve, '2 hours') > 0 then
    raise exception '20261125_50 verify: founder_reserve_seat lost the demo check, the 15-minute hold or the advocate rule';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'founder_reserve_seat') <> 1 then
    raise exception '20261125_50 verify: a second overload of founder_reserve_seat';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.is_demo_user(uuid)', 'EXECUTE')) then
    raise exception '20261125_50 verify: founder_reserve_seat / is_demo_user callable by authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and (has_function_privilege('anon', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
          or has_function_privilege('anon', 'public.is_demo_user(uuid)', 'EXECUTE')) then
    raise exception '20261125_50 verify: founder_reserve_seat / is_demo_user callable by anon';
  end if;
  for r in
    select * from (values ('community_posts'), ('community_answers'), ('community_votes'), ('community_reports'),
                          ('reviews'), ('library_issue_reports'), ('marketplace_listings'), ('marketplace_offers'),
                          ('payment_orders'), ('service_requests'), ('consultations'), ('lawyer_clients')) v(t)
  loop
    if to_regclass('public.' || r.t) is not null
       and not exists (select 1 from pg_catalog.pg_trigger
                        where tgrelid = to_regclass('public.' || r.t) and tgname = 'trg_demo_guard' and not tgisinternal) then
      v_missing := v_missing || ' ' || r.t;
    end if;
  end loop;
  if v_missing <> '' then
    -- a table without its owner column here is reported, not fatal (NOTICE above)
    raise notice '20261125_50 verify: no trg_demo_guard on:% (see the skipped NOTICEs)', v_missing;
  end if;
  if to_regclass('public.payment_orders') is not null
     and not exists (select 1 from pg_catalog.pg_trigger
                      where tgrelid = 'public.payment_orders'::regclass and tgname = 'trg_demo_guard' and not tgisinternal) then
    raise exception '20261125_50 verify: payment_orders has no demo guard (a demo account could pay)';
  end if;
  raise notice '20261125_50 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261125_50 demo accounts (is_demo, sandbox guards, caps 5/5/10, no founder seat)' as step,
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_demo')
        and pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure) like '%demo_account%'
        and pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure) like '%15 minutes%'
        and exists (select 1 from pg_catalog.pg_trigger
                     where tgrelid = to_regclass('public.payment_orders') and tgname = 'trg_demo_guard')) as ok;
