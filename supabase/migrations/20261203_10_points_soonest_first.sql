-- =============================================================================
-- Migration: 20261203_10_points_soonest_first.sql
-- =============================================================================
-- PURPOSE (owner decision ١٦٥ (ب), replies of 22 Nov 2026; batch l13 points)
--
--   1. public.debit_points — SAME signature (uuid, int, text, text), re-created
--      from its latest definition, 20261127_40 (20261022_20 before it). The
--      spend order is now the soonest-expiring eligible lot first, whatever
--      its type:
--        expires_at, created_at, id
--      — the very order the lots are locked in. The 20261127_40 preferences
--      (the library assistant's wallet first; then plan → purchased →
--      bonus/gift) are gone. The wallet rule is KEPT unchanged: a lot is
--      eligible when
--        wallet_scope = 'general'                                   (any tool)
--        or wallet_scope = 'library_agent' and p_tool = 'library-assistant'
--      so a library-assistant lot is still spent by the library assistant
--      only. The lock statement is unchanged (same total order as
--      admin_debit_points and adjust_admin_points: no deadlock).
--      admin_debit_points (an admin deduction, any wallet, nearest expiry
--      first) is NOT changed.
--
--   2. public.points_available_for_tool(p_user uuid, p_tool text) → int — the
--      points one tool can actually spend now: the unexpired lots with points
--      that pass the SAME wallet rule as debit_points. Shown as «المتاح لهذه
--      العملية» beside the price before a paid AI run (GET
--      /api/v1/ai/points-standing). Same access rule as points_balance
--      (20261022_20): authenticated reads its own only (another user → 42501),
--      service_role anyone, the database owner in the SQL editor. STABLE,
--      read-only.
--
-- WHO CAN DO WHAT
--   debit_points keeps its grants (service role only).
--   points_available_for_tool: EXECUTE for authenticated (own only, checked
--   inside) and service_role; never anon. Both SECURITY DEFINER with
--   search_path ''.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261203_10_points_soonest_first.sql
--   Expect: NOTICE  l13_points verify: OK …  and a row with `t`.
--
-- RUN ORDER: any time — before or after the deploy; best BEFORE it, since the
--   new points screens state the soonest-first rule.
--   Old code + this file: every run is charged soonest-expiring first (the
--   owner's rule); nothing else changes.
--   New code before this file: the «المتاح لهذه العملية» line falls back to
--   the whole balance (points_balance) while points_available_for_tool is
--   missing, and the runs keep the old spend order until this file runs.
--   RE-RUN HAZARD: re-running 20261127_40 (or 20261022_20) re-creates
--   debit_points with the old order. Re-run THIS file after either. This file
--   itself is safe to run any number of times.
--
-- ROLLBACK (in one transaction):
--   1. re-run section 2 («debit_points») of 20261127_40_points_wallets.sql;
--   2. drop function if exists public.points_available_for_tool(uuid, text);
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.points_lots') is null or to_regclass('public.points_ledger') is null
     or to_regprocedure('public.debit_points(uuid, int, text, text)') is null then
    raise exception '20261203_10: run 20261022_20_points_lots.sql first';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.points_lots'::regclass and attname = 'wallet_scope' and not attisdropped) then
    raise exception '20261203_10: run 20261127_40_points_wallets.sql first (points_lots.wallet_scope is missing)';
  end if;
end
$pre$;

-- ── 1. debit_points: soonest-expiring eligible lot first ─────────────────────
create or replace function public.debit_points(p_user uuid, p_points int, p_tool text, p_ref text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avail bigint;
  v_need  int;
  v_take  int;
  v_lot   record;
  -- 20261127_40: the tool's wallet. Only the library assistant may spend
  -- library_agent lots; every other tool spends general lots only.
  v_lib   boolean := coalesce(p_tool = 'library-assistant', false);
begin
  if p_user is null or p_points is null or p_points <= 0 then
    raise exception 'debit_points: p_user and a positive p_points are required' using errcode = '22023';
  end if;

  -- Lock the user's spendable unexpired lots, nearest expiry first. Every debit
  -- locks in this one order, so two concurrent debits queue instead of
  -- deadlocking, and the second one sees what the first left (READ COMMITTED
  -- re-checks a row it waited for, points_left > 0 included).
  select coalesce(sum(l.points_left), 0) into v_avail
    from (select pl.points_left
            from public.points_lots pl
           where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
             and (pl.wallet_scope = 'general' or (v_lib and pl.wallet_scope = 'library_agent'))
           order by pl.expires_at, pl.created_at, pl.id
             for update) l;

  if v_avail < p_points then
    raise exception 'insufficient_points' using errcode = 'P0001',
      detail = format('available %s, requested %s', v_avail, p_points);
  end if;

  -- 20261203_10 (owner ١٦٥ ب): the soonest-expiring eligible lot first,
  -- whatever its type or wallet — the same order as the lock above.
  v_need := p_points;
  for v_lot in
    select pl.id, pl.points_left
      from public.points_lots pl
     where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
       and (pl.wallet_scope = 'general' or (v_lib and pl.wallet_scope = 'library_agent'))
     order by pl.expires_at, pl.created_at, pl.id
       for update
  loop
    exit when v_need = 0;
    v_take := least(v_lot.points_left, v_need);
    update public.points_lots set points_left = points_left - v_take where id = v_lot.id;
    insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref)
      values (p_user, v_lot.id, -v_take, 'usage', p_tool, p_ref);
    v_need := v_need - v_take;
  end loop;

  -- cannot happen while the lots stay locked; if it ever does, roll back
  -- rather than return a debit that was only partly taken
  if v_need > 0 then
    raise exception 'debit_points_invariant' using errcode = 'P0001',
      detail = format('%s of %s points not found after the lock', v_need, p_points);
  end if;

  return coalesce((select sum(l.points_left) from public.points_lots l
                    where l.user_id = p_user and l.expires_at > now()), 0)::int;
end;
$$;

comment on function public.debit_points(uuid, int, text, text) is
  'Debits points across lots, one usage ledger row per lot; returns the balance after; raises P0001 insufficient_points and changes nothing when short (20261022_20, B1). 20261127_40: only p_tool library-assistant may spend library_agent lots. 20261203_10 (owner ١٦٥ ب): the soonest-expiring eligible lot first, whatever its type. Service role only.';

revoke all on function public.debit_points(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.debit_points(uuid, int, text, text) to service_role;

-- ── 2. points_available_for_tool ─────────────────────────────────────────────
create or replace function public.points_available_for_tool(p_user uuid, p_tool text)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  -- the outer SET ROLE survives SECURITY DEFINER (current_user does not)
  v_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
  -- the wallet rule of debit_points (20261127_40), word for word
  v_lib  boolean := coalesce(p_tool = 'library-assistant', false);
begin
  if p_user is null then
    raise exception 'points_available_for_tool: p_user is required' using errcode = '22023';
  end if;
  -- points_balance's access rule (20261022_20): own balance, the service role,
  -- or the database owner in the SQL editor
  if not ((v_uid is not null and v_uid = p_user)
          or v_role = 'service_role'
          or (v_role = 'none'
              and (pg_has_role(session_user, 'postgres', 'MEMBER')
                   or coalesce((select r.rolsuper from pg_catalog.pg_roles r where r.rolname = session_user), false)))) then
    raise exception 'points_available_for_tool: a user may read only their own points' using errcode = '42501';
  end if;
  return coalesce((select sum(pl.points_left) from public.points_lots pl
                    where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
                      and (pl.wallet_scope = 'general' or (v_lib and pl.wallet_scope = 'library_agent'))), 0)::int;
end;
$$;

comment on function public.points_available_for_tool(uuid, text) is
  'The points p_tool can spend now (20261203_10, owner ١٦٥): unexpired lots with points under debit_points'' wallet rule (library_agent lots for library-assistant only). «المتاح لهذه العملية». authenticated: own only (42501 otherwise); service_role: anyone.';

revoke all on function public.points_available_for_tool(uuid, text) from public, anon, authenticated;
grant execute on function public.points_available_for_tool(uuid, text) to authenticated, service_role;

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v_debit text := pg_catalog.pg_get_functiondef('public.debit_points(uuid, int, text, text)'::regprocedure);
  v_avail text := coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.points_available_for_tool(uuid, text)')), '');
  fn      text;
begin
  if v_debit !~* 'order\s+by\s+pl\.expires_at\s*,\s*pl\.created_at\s*,\s*pl\.id\s+for\s+update' then
    raise exception 'l13_points verify: debit_points lost the canonical lock order';
  end if;
  if v_debit ~* 'case\s+when\s+pl\.(wallet_scope|source)' or pg_catalog.strpos(v_debit, 'plan_monthly') > 0 then
    raise exception 'l13_points verify: debit_points still prefers a wallet or a points type (re-run 20261203_10)';
  end if;
  if pg_catalog.strpos(v_debit, '(pl.wallet_scope = ''general'' or (v_lib and pl.wallet_scope = ''library_agent''))') = 0
     or pg_catalog.strpos(v_debit, '''library-assistant''') = 0 then
    raise exception 'l13_points verify: debit_points lost the wallet rule (library lots for the library assistant only)';
  end if;
  if pg_catalog.strpos(v_avail, '(pl.wallet_scope = ''general'' or (v_lib and pl.wallet_scope = ''library_agent''))') = 0
     or pg_catalog.strpos(v_avail, '''library-assistant''') = 0 then
    raise exception 'l13_points verify: points_available_for_tool is missing or does not use debit_points'' wallet rule';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('debit_points', 'points_available_for_tool')) <> 2 then
    raise exception 'l13_points verify: a second overload of debit_points / points_available_for_tool (PGRST203)';
  end if;
  foreach fn in array array['public.debit_points(uuid,integer,text,text)', 'public.points_available_for_tool(uuid,text)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l13_points verify: % is not SECURITY DEFINER with search_path ''''', fn;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    if has_function_privilege('anon', 'public.debit_points(uuid,integer,text,text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.debit_points(uuid,integer,text,text)', 'EXECUTE') then
      raise exception 'l13_points verify: a session role can EXECUTE debit_points';
    end if;
    if has_function_privilege('anon', 'public.points_available_for_tool(uuid,text)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.points_available_for_tool(uuid,text)', 'EXECUTE') then
      raise exception 'l13_points verify: points_available_for_tool grants are wrong (authenticated yes, anon no)';
    end if;
  end if;
  raise notice 'l13_points verify: OK — debit_points spends the soonest-expiring eligible lot first (wallet rule kept), points_available_for_tool';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261203_10 points: soonest-expiring first, available per tool' as migration,
       (pg_catalog.pg_get_functiondef('public.debit_points(uuid, int, text, text)'::regprocedure) !~* 'case\s+when\s+pl\.(wallet_scope|source)'
        and to_regprocedure('public.points_available_for_tool(uuid,text)') is not null) as ok;
