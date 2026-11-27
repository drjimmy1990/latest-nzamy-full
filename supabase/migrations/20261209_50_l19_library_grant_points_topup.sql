-- =============================================================================
-- Migration: 20261209_50_l19_library_grant_points_topup.sql
-- =============================================================================
-- PURPOSE (owner package 27 Nov 2026, LIVE-10; batch l19 «library»)
--
--   An admin library grant — the direct grant (/dashboard/admin/entitlements,
--   POST /api/v1/admin/entitlements/grant, source 'admin') and an approved
--   library request (PATCH /api/v1/admin/entitlements/requests/[id], source
--   'request') — gave the library with 0 points. Every library grant is gated
--   by the 50-point minimum (owner ٩٣, src/lib/library/pointsGate.ts), so the
--   grantee stayed locked out of the full text. The owner: «إكمال الرصيد
--   تلقائياً لـ 50 نقطة عند منح المكتبة إدارياً».
--
--   1. public.library_grant_points_topups — one row per grant whose top-up was
--      decided (PRIMARY KEY grant_id): the grant's idempotency key, as
--      UNIQUE (order_id, source) is a paid pass's. Server only.
--
--   2. public.library_grant_points_topup(p_grant uuid) → jsonb — tops the
--      grantee's balance up to library_min_points_to_browse (50 by default)
--      when it is below, with ONE lot through public.credit_wallet_points
--      (20261127_40) — the same call a paid pass uses for its points: source
--      'grant', wallet 'library_agent', expiring with the grant, ledger ref
--      'library_grant:<id>'. The balance is the gate's own
--      (src/lib/library/pointsGateServer.ts readLibraryPointsBalance): every
--      unexpired lot of any wallet (points_balance) + the founder's library
--      credits (membership_credits 'library_question', not ended, × 5).
--      Answers {status, points, balance_before, min_points, lot_id}:
--        credited      points > 0 were added (one lot, one ledger row);
--        not_needed    the balance was already at the minimum (row kept: the
--                      decision is made once per grant);
--        already       this grant was decided before (nothing written);
--        gate_off      library_min_points_to_browse is 0 (nothing written);
--        not_gated     the grantee is a platform admin (nothing written);
--        ended         the grant is over (nothing written);
--        not_admin_grant  the grant's source is not 'admin' / 'request'
--                      (a paid pass brings its own points; nothing written).
--      Locks: the grant row (FOR UPDATE), then one advisory lock per user,
--      then the user's spendable lots in debit_points' own order (expires_at,
--      created_at, id) — a question spending points at the same moment waits,
--      so the balance read is the balance credited against. SECURITY DEFINER,
--      search_path '', service role only.
--
-- NOTHING TO BACKFILL ON PURPOSE: crediting points (1 point = 1 SAR) to the
-- holders of older admin grants is the owner's decision, not this file's. The
-- operator may run the function for one grant by hand (the report says how).
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261209_50_l19_library_grant_points_topup.sql
--   Expect: NOTICE  l19_grant_topup verify: OK …  and a row with `t`.
--   Rows changed: none (a new table and a new function).
--
-- RUN ORDER: BEFORE OR AFTER THE DEPLOY. The new code calls the function after
-- the grant and treats a missing function (PGRST202 / 42883) as «not run yet»:
-- the grant itself succeeds as today, with no points. The old code never calls
-- it. Safe to run any number of times.
--
-- ROLLBACK:
--   drop function if exists public.library_grant_points_topup(uuid);
--   drop table if exists public.library_grant_points_topups;
--   notify pgrst, 'reload schema';
--   (lots already credited stay: they are ordinary 'grant' lots that expire
--   with their grant.)
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261209_50: run 20261019_10_library_access_grants.sql first';
  end if;
  if to_regclass('public.points_lots') is null
     or to_regprocedure('public.credit_wallet_points(uuid, integer, text, timestamp with time zone, uuid, text, text)') is null then
    raise exception '20261209_50: run 20261022_20_points_lots.sql and 20261127_40_points_wallets.sql first';
  end if;
  if to_regclass('public.platform_settings') is null or to_regclass('public.profiles') is null then
    raise exception '20261209_50: public.platform_settings / public.profiles are missing';
  end if;
end
$pre$;

-- ── 1. the per-grant marker ──────────────────────────────────────────────────
create table if not exists public.library_grant_points_topups (
  grant_id       uuid primary key references public.library_access_grants(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  lot_id         uuid null references public.points_lots(id) on delete set null,
  points         int  not null constraint library_grant_points_topups_points_check check (points >= 0),
  balance_before int  not null,
  min_points     int  not null,
  created_at     timestamptz not null default now()
);

comment on table public.library_grant_points_topups is
  'LIVE-10 (20261209_50, owner 27 Nov): one row per admin / request library grant whose points top-up was decided — points 0 when the balance was already at the minimum. Written only by library_grant_points_topup. Server only.';

alter table public.library_grant_points_topups enable row level security;
revoke all on public.library_grant_points_topups from anon, authenticated, public;
grant all on public.library_grant_points_topups to service_role;

-- ── 2. the top-up ────────────────────────────────────────────────────────────
create or replace function public.library_grant_points_topup(p_grant uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grant   record;
  v_set     jsonb;
  v_raw     numeric;
  v_min     int := 50;
  v_bal     bigint := 0;
  v_credits bigint := 0;
  v_need    int;
  v_lot     uuid;
  v_done    record;
begin
  if p_grant is null then
    raise exception 'library_grant_points_topup: p_grant is required' using errcode = '22023';
  end if;

  select g.id, g.user_id, g.source, g.ends_at
    into v_grant
    from public.library_access_grants g
   where g.id = p_grant
     for update;
  if not found then
    raise exception 'library_grant_points_topup: no such grant' using errcode = '22023';
  end if;

  select t.points, t.balance_before, t.min_points, t.lot_id into v_done
    from public.library_grant_points_topups t where t.grant_id = p_grant;
  if found then
    return jsonb_build_object('status', 'already', 'points', v_done.points,
      'balance_before', v_done.balance_before, 'min_points', v_done.min_points, 'lot_id', v_done.lot_id);
  end if;

  if v_grant.source not in ('admin', 'request') then
    return jsonb_build_object('status', 'not_admin_grant', 'points', 0);
  end if;
  if v_grant.ends_at <= now() then
    return jsonb_build_object('status', 'ended', 'points', 0);
  end if;
  -- a platform admin is outside the gate (pointsGate.ts libraryPointsGateDecision)
  if exists (select 1 from public.profiles p where p.id = v_grant.user_id and p.user_type = 'admin') then
    return jsonb_build_object('status', 'not_gated', 'points', 0);
  end if;

  -- the gate's minimum: {"points": n}, an integer 0..100000; anything else → 50
  -- (pointsGate.ts parseLibraryMinPoints)
  select ps.value into v_set from public.platform_settings ps where ps.key = 'library_min_points_to_browse';
  if v_set is not null and jsonb_typeof(v_set) = 'object' and jsonb_typeof(v_set -> 'points') = 'number' then
    v_raw := (v_set ->> 'points')::numeric;
    if v_raw = trunc(v_raw) and v_raw between 0 and 100000 then
      v_min := v_raw::int;
    end if;
  end if;
  if v_min <= 0 then
    return jsonb_build_object('status', 'gate_off', 'points', 0, 'min_points', 0);
  end if;

  -- one top-up at a time per user (two grants at once), then the user's
  -- spendable lots in debit_points' lock order, so a concurrent question waits
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_grant_points_topup:' || v_grant.user_id::text, 0));
  perform 1
     from public.points_lots pl
    where pl.user_id = v_grant.user_id and pl.expires_at > now() and pl.points_left > 0
    order by pl.expires_at, pl.created_at, pl.id
      for update;

  select coalesce(sum(pl.points_left), 0) into v_bal
    from public.points_lots pl
   where pl.user_id = v_grant.user_id and pl.expires_at > now();
  if to_regclass('public.membership_credits') is not null then
    select coalesce(sum(mc.remaining), 0) * 5 into v_credits
      from public.membership_credits mc
     where mc.user_id = v_grant.user_id and mc.kind = 'library_question'
       and mc.remaining > 0 and mc.ends_at > now();
  end if;
  v_bal := v_bal + coalesce(v_credits, 0);

  v_need := greatest(0, v_min - v_bal)::int;
  if v_need > 0 then
    v_lot := public.credit_wallet_points(v_grant.user_id, v_need, 'grant', v_grant.ends_at, null,
                                         'library_grant:' || p_grant::text, 'library_agent');
  end if;

  insert into public.library_grant_points_topups (grant_id, user_id, lot_id, points, balance_before, min_points)
    values (p_grant, v_grant.user_id, v_lot, v_need, least(v_bal, 2147483647)::int, v_min);

  return jsonb_build_object('status', case when v_need > 0 then 'credited' else 'not_needed' end,
    'points', v_need, 'balance_before', v_bal, 'min_points', v_min, 'lot_id', v_lot);
end;
$$;

comment on function public.library_grant_points_topup(uuid) is
  'LIVE-10 (20261209_50, owner 27 Nov): tops an admin / request library grantee up to library_min_points_to_browse (50) with one library_agent ''grant'' lot expiring with the grant (credit_wallet_points), once per grant (library_grant_points_topups). Answers {status, points, balance_before, min_points, lot_id}. Service role only.';

revoke all on function public.library_grant_points_topup(uuid) from public, anon, authenticated;
grant execute on function public.library_grant_points_topup(uuid) to service_role;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  fn constant text := 'public.library_grant_points_topup(uuid)';
begin
  if to_regclass('public.library_grant_points_topups') is null then
    missing := missing || ' table library_grant_points_topups is missing;';
  else
    if not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.library_grant_points_topups')), false) then
      missing := missing || ' library_grant_points_topups has RLS off;';
    end if;
    if has_table_privilege('anon', 'public.library_grant_points_topups', 'SELECT')
       or has_table_privilege('authenticated', 'public.library_grant_points_topups', 'SELECT') then
      missing := missing || ' library_grant_points_topups is readable by anon / authenticated;';
    end if;
  end if;
  if to_regprocedure(fn) is null then
    missing := missing || format(' %s is missing;', fn);
  else
    if not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
                      where oid = to_regprocedure(fn)), false) then
      missing := missing || format(' %s is not SECURITY DEFINER with search_path = '''';', fn);
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      missing := missing || format(' %s is callable by anon / authenticated;', fn);
    end if;
    if position('for update' in lower(pg_get_functiondef(to_regprocedure(fn)))) = 0
       or position('credit_wallet_points' in pg_get_functiondef(to_regprocedure(fn))) = 0
       or position('library_grant_points_topups' in pg_get_functiondef(to_regprocedure(fn))) = 0 then
      missing := missing || ' library_grant_points_topup lost its row lock, its credit call or its once-per-grant marker;';
    end if;
  end if;
  if missing <> '' then
    raise exception 'l19_grant_topup verify:%', missing;
  end if;
  raise notice 'l19_grant_topup verify: OK — library_grant_points_topups (RLS, server only) + library_grant_points_topup (definer, service role only, row lock, credit_wallet_points, once per grant)';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261209_50 l19 library grant points top-up (LIVE-10)' as migration,
       to_regprocedure('public.library_grant_points_topup(uuid)') is not null
       and to_regclass('public.library_grant_points_topups') is not null
       and not has_function_privilege('anon', 'public.library_grant_points_topup(uuid)', 'EXECUTE')
       as ok, true;
