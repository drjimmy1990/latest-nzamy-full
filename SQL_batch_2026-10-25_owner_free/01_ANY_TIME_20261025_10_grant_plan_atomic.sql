-- =============================================================================
-- Migration: 20261025_10_grant_plan_atomic.sql
-- =============================================================================
-- PURPOSE (owner-free phases, P2 / N4.1 — a paid plan is granted atomically)
--   grantPlan (src/lib/payments/grantPurchase.ts) used to cancel the user's
--   active subscriptions and insert the paid one as TWO PostgREST requests.
--   A transient error between them (network, timeout, a failed insert) left
--   the user with no plan at all: the previous plan cancelled, its remaining
--   days lost, the new one never written. This function does the cancel and
--   the insert in ONE transaction, after re-checking — under a per-user lock —
--   that what the caller computed the new window from is still what the user
--   holds.
--
--   The decision itself stays in TypeScript, unchanged: planWindow and
--   planGrantDecision (src/lib/payments/fulfillDecision.ts,
--   src/lib/entitlementGrantRules.ts) still pick the window (same rank →
--   starts at the running row's end, so the remaining days carry over; a
--   higher rank → starts now) and still refuse to replace a higher-ranked or
--   open-ended same-rank plan (the refund-review path, alreadyEntitled). The
--   month arithmetic (addMonthsUtc) and the tier ranking (TIER_RANK) are NOT
--   re-implemented here; the caller passes the window in.
--
-- WHAT IT CREATES (idempotent — create or replace; safe to run any number of
-- times)
--   public.grant_plan_subscription(
--     p_order uuid, p_user uuid, p_plan_id text, p_tier text, p_billing text,
--     p_period_start timestamptz, p_period_end timestamptz,
--     p_payment_method text, p_now timestamptz, p_running jsonb)
--   RETURNS jsonb  { inserted, subscription_id, current_period_end }
--
--   1. pg_advisory_xact_lock on the user: two grants for the same user (two
--      orders, or the callback + webhook + sweep on one order) run one after
--      the other. Row locks alone cannot do this — a user with no active row
--      has nothing to lock.
--   2. The order already has its subscription row (any status) → return it,
--      inserted = false, and touch nothing (a retry; never re-activated — a
--      refunded or replaced row stays as it is).
--   3. The rows still running at p_now (status 'active', period end NULL or
--      after p_now) must be exactly p_running — the [{id, tier,
--      current_period_end}] the caller computed the window from (ends compared
--      to the millisecond, JavaScript's precision). Anything else → raises
--      SQLSTATE 40001 'grant_plan_stale': nothing is written, the caller
--      reports a failure and the sweep retries with a fresh read.
--   4. Cancels ALL the user's active rows (lapsed ones included, as before):
--      status 'cancelled', cancelled_at = p_now, updated_at = p_now.
--   5. Inserts the paid row: plan_id, tier, billing_cycle = p_billing,
--      status 'active', started_at = p_now, the window, auto_renew false,
--      payment_method_id, metadata {order_id, method: 'moyasar',
--      replaced_ids: the running ids}.
--   Any error (a FK, a CHECK, the order_id UNIQUE index) aborts the whole
--   call: the cancel in step 4 is rolled back with it, so the previous plan
--   stays active. There is deliberately no exception handler in the body.
--
--   The refund restore of 20261022_32 (finish_payment_refund) depends on two
--   recorded fields and both are kept exactly: metadata.replaced_ids lists the
--   rows to restore, and a row is restored only when its cancelled_at equals
--   the refunded row's started_at — both are p_now here, one parameter.
--
-- WHO CAN DO WHAT
--   SECURITY DEFINER, search_path = '' like the other payments functions
--   (20261022_30/_32): every name in the body is schema-qualified, and
--   pg_catalog is always searched first. EXECUTE for service_role only (revoked
--   from PUBLIC, anon, authenticated): only the server grants a paid plan.
--   A raising verify at the end checks the function, its settings, its body's
--   load-bearing pieces and the effective EXECUTE privileges.
--
-- PREREQUISITES (the file raises without them)
--   20260603_phase1_003 (public.subscriptions), 20261022_30
--   (subscriptions_order_id_key, the one-row-per-order UNIQUE index).
--
-- DEPLOY ORDER — BEFORE THE DEPLOY
--   The new grantPurchase.ts calls this function. Without it the call answers
--   PGRST202 / 42883 and the grant reports missing: the order stays paid but
--   unfulfilled and the sweep retries — no plan is lost, but no plan purchase
--   completes until this file has run. The retries are bounded: after
--   SWEEP_MAX_ATTEMPTS (20 runs, ~3h20m) the sweep marks the order
--   sweep_gave_up for an admin. Run it first, then _verify.sql.
--
-- ROLLBACK
--   drop function if exists public.grant_plan_subscription(uuid, uuid, text,
--     text, text, timestamptz, timestamptz, text, timestamptz, jsonb);
--   (only together with a rollback of the code: the old code does not call it)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.subscriptions') is null then
    raise exception '20261025_10: public.subscriptions does not exist — run 20260603_phase1_003 first';
  end if;
  if not exists (select 1 from pg_class c join pg_index i on i.indexrelid = c.oid
                  where c.relname = 'subscriptions_order_id_key'
                    and i.indrelid = 'public.subscriptions'::regclass and i.indisunique) then
    raise exception '20261025_10: subscriptions_order_id_key does not exist — run 20261022_30 first';
  end if;
end $$;

create or replace function public.grant_plan_subscription(
  p_order          uuid,
  p_user           uuid,
  p_plan_id        text,
  p_tier           text,
  p_billing        text,
  p_period_start   timestamptz,
  p_period_end     timestamptz,
  p_payment_method text,
  p_now            timestamptz,
  p_running        jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing     record;
  stale        boolean;
  running_ids  jsonb;
  new_id       uuid;
begin
  if p_order is null or p_user is null or p_now is null or p_period_start is null or p_period_end is null
     or p_plan_id is null or p_tier is null or p_billing is null then
    raise exception 'grant_plan_invalid_arguments' using errcode = '22023';
  end if;
  if p_running is null or jsonb_typeof(p_running) <> 'array' then
    raise exception 'grant_plan_invalid_running' using errcode = '22023';
  end if;

  -- 1. one grant per user at a time
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('grant_plan_subscription:' || p_user::text, 0));

  -- 2. this order's row already exists → a retry; return it untouched
  select s.id, s.current_period_end into existing
    from public.subscriptions s
   where s.user_id = p_user and s.metadata ->> 'order_id' = p_order::text
   limit 1;
  if found then
    return pg_catalog.jsonb_build_object('inserted', false, 'subscription_id', existing.id,
                                         'current_period_end', existing.current_period_end);
  end if;

  -- 3. what the window was computed from must still be what the user holds
  with now_running as (
    select s.id, s.tier, pg_catalog.date_trunc('milliseconds', s.current_period_end) as ends
      from public.subscriptions s
     where s.user_id = p_user and s.status = 'active'
       and (s.current_period_end is null or s.current_period_end > p_now)
  ), expected as (
    select x.id, x.tier, pg_catalog.date_trunc('milliseconds', x.current_period_end) as ends
      from pg_catalog.jsonb_to_recordset(p_running) as x(id uuid, tier text, current_period_end timestamptz)
  )
  select (select count(*) from now_running) <> (select count(*) from expected)
      or exists (select 1 from now_running n
                  where not exists (select 1 from expected e
                                     where e.id = n.id and e.tier is not distinct from n.tier
                                       and e.ends is not distinct from n.ends))
    into stale;
  if stale then
    raise exception 'grant_plan_stale: the user''s running plans changed since the window was computed'
      using errcode = '40001';
  end if;
  -- replaced_ids in the canonical (lowercase) uuid text the refund restore
  -- compares against s.id::text, in the caller's order
  select coalesce(pg_catalog.jsonb_agg(((e.elem ->> 'id')::uuid)::text order by e.ord), '[]'::jsonb) into running_ids
    from pg_catalog.jsonb_array_elements(p_running) with ordinality as e(elem, ord);

  -- 4. cancel every active row (lapsed ones included)
  update public.subscriptions s
     set status = 'cancelled', cancelled_at = p_now, updated_at = p_now
   where s.user_id = p_user and s.status = 'active';

  -- 5. the paid row; any error here rolls the cancel back with it
  insert into public.subscriptions
    (user_id, plan_id, tier, billing_cycle, status, started_at, current_period_start, current_period_end,
     auto_renew, payment_method_id, metadata)
  values
    (p_user, p_plan_id, p_tier, p_billing, 'active', p_now, p_period_start, p_period_end,
     false, p_payment_method,
     pg_catalog.jsonb_build_object('order_id', p_order::text, 'method', 'moyasar', 'replaced_ids', running_ids))
  returning id into new_id;

  return pg_catalog.jsonb_build_object('inserted', true, 'subscription_id', new_id,
                                       'current_period_end', p_period_end);
end $$;

comment on function public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb) is
  'Grants a paid plan atomically: per-user lock, order row check, stale check of the running rows, cancel of the active rows and insert of the order''s row in one transaction (20261025_10, owner-free P2 N4.1). Service role only.';

revoke all on function public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb)
  to service_role;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  fn      constant text := 'public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb)';
  r       text;
  cfg     text[];
  definer boolean;
  ret     text;
  src     text;
  missing text := '';
begin
  if to_regprocedure(fn) is null then
    raise exception '20261025_10 verify: % is missing', fn;
  end if;
  select proconfig, prosecdef, pg_get_function_result(oid), prosrc into cfg, definer, ret, src
    from pg_proc where oid = to_regprocedure(fn);
  if not coalesce(definer, false) or cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || ' the grant is not SECURITY DEFINER with search_path = '''';';
  end if;
  if ret is distinct from 'jsonb' then
    missing := missing || format(' the grant returns %s (expected jsonb);', ret);
  end if;
  if src !~* 'pg_advisory_xact_lock'
     or src !~* 'cancelled_at\s*=\s*p_now'
     or src !~* '''active'',\s*p_now'
     or src !~* '''replaced_ids''' then
    missing := missing || ' the grant body lost the per-user lock, cancelled_at = p_now, started_at = p_now or replaced_ids (refund restore depends on them);';
  end if;
  if src ~* 'exception\s+when' then
    missing := missing || ' the grant body catches an exception — a failed insert could keep the cancel;';
  end if;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      missing := missing || format(' %s can EXECUTE the grant;', r);
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    missing := missing || ' service_role cannot EXECUTE the grant;';
  end if;
  if missing <> '' then
    raise exception '20261025_10 verify:%', missing;
  end if;
  raise notice '20261025_10 verify: OK — grant_plan_subscription: per-user lock, stale check, cancel + insert in one transaction; SECURITY DEFINER, search_path = '''', service role only';
end $$;

commit;

notify pgrst, 'reload schema';
