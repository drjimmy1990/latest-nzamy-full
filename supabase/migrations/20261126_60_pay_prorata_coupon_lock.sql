-- =============================================================================
-- Migration: 20261126_60_pay_prorata_coupon_lock.sql
-- =============================================================================
-- PURPOSE (batch l6-pay, 18 Nov 2026 — owner TODO Q511 + the coupon lock)
--   A. The coupon lock. Until now coupons.used_count moved only when a paid
--      order was fulfilled (coupon_usage, 20261026_20), so a code limited to
--      N uses (max_uses) could be paid by more than N buyers who all started
--      checkout before the N-th payment landed.
--      1. public.coupon_reservations (order_id PK → payment_orders, coupon_id
--         → coupons, user_id, reserved_at, expires_at): one row per couponed
--         order of a LIMITED code. Server only: RLS on, no policy, nothing
--         granted to anon / authenticated.
--      2. public.coupon_reserve(p_coupon uuid, p_order uuid, p_user uuid)
--         returns text — called by checkout right after the order row is
--         written (src/lib/payments/checkoutCore.ts step 5c), before any
--         Moyasar intent. Under a row lock on the coupon (SELECT … FOR
--         UPDATE, so two checkouts of the same code queue) it answers:
--           'unlimited'  max_uses null or <= 0 — nothing is written;
--           'reserved'   used_count + the live reservations < max_uses: the
--                        reservation is written (or already existed for this
--                        order — a retry);
--           'exhausted'  no use left (or the coupon is gone) — checkout
--                        cancels the order and answers the generic 400.
--         It raises 22023 when p_order is not an OPEN order of p_user that
--         carries p_coupon (metadata.coupon.id).
--         A reservation is LIVE — and counted — while
--           * its order is still open (created / initiated) and the hold has
--             not expired (65 minutes, the intent's lifetime + margin —
--             checkoutRules.SUPERSEDE_WINDOW_MS), or a payment already
--             reached the order (3-D Secure page open) within 7 days (the
--             sweep's lookback); or
--           * its order is PAID (live, not «already entitled») but fulfilment
--             has not yet written its coupon_usage row (from then on
--             used_count counts it).
--         So a reservation is released BY ITSELF the moment its payment
--         fails, the order is cancelled / voided / superseded, or the hold
--         expires — no sweep is needed, and a test-mode payment (live =
--         false) never consumes a use.
--   B. Q511 — the pro-rata upgrade. Checkout stores the credit of the plans
--      it replaces in payment_orders.metadata.proration (key = the sorted
--      ids of the credited subscriptions). One unique index,
--      payment_orders_proration_once_key on (user_id, metadata->'proration'
--      ->>'key') over OPEN and PAID orders (not test-mode payments, not
--      «already entitled»), so two tabs cannot both spend the remaining days
--      of the same plan. A cancelled / failed / voided order leaves the set.
--      Checkout answers a violation 409 «لديك طلب ترقية آخر قيد الدفع».
--   Nothing else changes; no existing function is re-created.
--
-- HOW TO RUN (BEFORE the deploy of the l6-pay code — the new checkout calls
--   coupon_reserve for a limited code and answers 503 while it is missing;
--   the old code never reads the new objects, so running it early is safe):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261126_60_pay_prorata_coupon_lock.sql
--   Expect: NOTICE  20261126_60 verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261026_20 (coupons server only) and 20261022_10
--   (payment_orders); BEFORE the deploy.
--
-- ROLLBACK (the code then answers 503 to a LIMITED coupon at checkout; an
--   unlimited one, plans and top-ups are unaffected):
--   drop index if exists public.payment_orders_proration_once_key;
--   drop function if exists public.coupon_reserve(uuid, uuid, uuid);
--   drop table if exists public.coupon_reservations;
--   and remove the verify:l6_pay section from _verify.sql.
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.payment_orders') is null then
    raise exception '20261126_60: public.payment_orders does not exist — run 20261022_10_payments_core.sql first';
  end if;
  if to_regclass('public.coupons') is null or to_regclass('public.coupon_usage') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'coupons' and column_name = 'max_discount_pct') then
    raise exception '20261126_60: run 20261026_20_coupons_server_only.sql first';
  end if;
end
$pre$;

-- ── A1. the reservations ─────────────────────────────────────────────────────
create table if not exists public.coupon_reservations (
  order_id    uuid        primary key references public.payment_orders(id) on delete cascade,
  coupon_id   uuid        not null references public.coupons(id) on delete cascade,
  user_id     uuid        not null,
  reserved_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists coupon_reservations_coupon_idx on public.coupon_reservations (coupon_id);

alter table public.coupon_reservations enable row level security;
do $$
declare
  r record;
begin
  for r in select polname from pg_policy where polrelid = 'public.coupon_reservations'::regclass loop
    execute format('drop policy %I on public.coupon_reservations', r.polname);
  end loop;
end $$;
revoke all on table public.coupon_reservations from public, anon, authenticated;
grant all on table public.coupon_reservations to service_role;

comment on table public.coupon_reservations is
  '20261126_60: a LIMITED coupon''s use held for one open order (coupon_reserve). Live while the order is open and the hold runs, or paid and not yet recorded in coupon_usage. Server only.';

-- ── A2. coupon_reserve ───────────────────────────────────────────────────────
create or replace function public.coupon_reserve(p_coupon uuid, p_order uuid, p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coupon record;
  v_order  record;
  v_held   int;
begin
  if p_coupon is null or p_order is null or p_user is null then
    raise exception 'coupon_reserve: p_coupon, p_order and p_user are required' using errcode = '22023';
  end if;

  select o.id, o.user_id, o.status, o.metadata into v_order
    from public.payment_orders o where o.id = p_order;
  if v_order.id is null or v_order.user_id is distinct from p_user
     or v_order.status not in ('created', 'initiated')
     or (v_order.metadata -> 'coupon' ->> 'id') is distinct from p_coupon::text then
    raise exception 'coupon_reserve: % is not an open order of this user carrying this coupon', p_order
      using errcode = '22023';
  end if;

  -- two checkouts of one code queue here
  select k.id, k.max_uses, k.used_count into v_coupon
    from public.coupons k where k.id = p_coupon for update;
  if v_coupon.id is null then
    return 'exhausted';
  end if;
  if v_coupon.max_uses is null or v_coupon.max_uses <= 0 then
    return 'unlimited';
  end if;

  if exists (select 1 from public.coupon_reservations r where r.order_id = p_order) then
    return 'reserved';
  end if;

  select pg_catalog.count(*) into v_held
    from public.coupon_reservations r
    join public.payment_orders o on o.id = r.order_id
   where r.coupon_id = p_coupon
     and (
           (o.status in ('created', 'initiated')
             and (r.expires_at > pg_catalog.now()
                  or (o.moyasar_payment_id is not null and r.reserved_at > pg_catalog.now() - interval '7 days')))
        or (o.status = 'paid'
             and o.live is not false
             and coalesce(o.metadata ->> 'already_entitled', 'false') <> 'true'
             and not exists (select 1 from public.coupon_usage u where u.order_id = o.id::text))
         );

  if coalesce(v_coupon.used_count, 0) + v_held >= v_coupon.max_uses then
    return 'exhausted';
  end if;

  insert into public.coupon_reservations (order_id, coupon_id, user_id, reserved_at, expires_at)
  values (p_order, p_coupon, p_user, pg_catalog.now(), pg_catalog.now() + interval '65 minutes');
  return 'reserved';
end
$$;

comment on function public.coupon_reserve(uuid, uuid, uuid) is
  '20261126_60: holds one use of a LIMITED coupon for an open order (row lock on the coupon; used_count + live reservations < max_uses). Answers reserved | unlimited | exhausted. Service role only.';
revoke all on function public.coupon_reserve(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.coupon_reserve(uuid, uuid, uuid) to service_role;

-- ── B. one prorated order per (buyer, credited plans) ────────────────────────
create unique index if not exists payment_orders_proration_once_key
  on public.payment_orders (user_id, ((metadata -> 'proration' ->> 'key')))
  where status in ('created', 'initiated', 'paid')
    and (metadata -> 'proration' ->> 'key') is not null
    and live is not false
    and coalesce(metadata ->> 'already_entitled', 'false') <> 'true';
comment on index public.payment_orders_proration_once_key is
  '20261126_60: the remaining days of a plan are credited to ONE open / paid upgrade order (Q511) — checkout answers a violation 409.';

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  r text;
  p text;
begin
  if to_regclass('public.coupon_reservations') is null then
    missing := missing || ' coupon_reservations is missing;';
  else
    if not (select relrowsecurity from pg_class where oid = 'public.coupon_reservations'::regclass) then
      missing := missing || ' coupon_reservations has RLS off;';
    end if;
    if exists (select 1 from pg_policy where polrelid = 'public.coupon_reservations'::regclass) then
      missing := missing || ' coupon_reservations has a policy;';
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(r, 'public.coupon_reservations', p) then
          missing := missing || format(' %s holds %s on coupon_reservations;', r, p);
        end if;
      end loop;
    end loop;
  end if;
  if to_regprocedure('public.coupon_reserve(uuid, uuid, uuid)') is null then
    missing := missing || ' coupon_reserve(uuid, uuid, uuid) is missing;';
  else
    if not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
                      where oid = to_regprocedure('public.coupon_reserve(uuid, uuid, uuid)')), false) then
      missing := missing || ' coupon_reserve is not SECURITY DEFINER with search_path = '''';';
    end if;
    if has_function_privilege('anon', 'public.coupon_reserve(uuid, uuid, uuid)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.coupon_reserve(uuid, uuid, uuid)', 'EXECUTE') then
      missing := missing || ' coupon_reserve is callable by anon / authenticated;';
    end if;
    if position('for update' in lower(pg_get_functiondef(to_regprocedure('public.coupon_reserve(uuid, uuid, uuid)')))) = 0 then
      missing := missing || ' coupon_reserve lost its row lock;';
    end if;
  end if;
  if to_regclass('public.payment_orders_proration_once_key') is null
     or pg_get_indexdef('public.payment_orders_proration_once_key'::regclass)
        not like 'CREATE UNIQUE INDEX%(user_id, %''proration''%''key''%WHERE%''initiated''%''paid''%live IS NOT FALSE%already_entitled%' then
    missing := missing || ' payment_orders_proration_once_key is missing or changed;';
  end if;

  if missing <> '' then
    raise exception '20261126_60 verify:%', missing;
  end if;
  raise notice '20261126_60 verify: OK — coupon_reservations + coupon_reserve (row lock, service role only), payment_orders_proration_once_key';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261126_60 coupon lock (coupon_reserve) + one prorated upgrade order per plan set' as step,
       to_regclass('public.coupon_reservations') is not null
       and to_regprocedure('public.coupon_reserve(uuid, uuid, uuid)') is not null
       and not has_function_privilege('anon', 'public.coupon_reserve(uuid, uuid, uuid)', 'EXECUTE')
       and to_regclass('public.payment_orders_proration_once_key') is not null
       as ok;
