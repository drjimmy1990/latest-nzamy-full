-- =============================================================================
-- Migration: 20261206_30_pay_coupon_redemptions.sql   (verify id: l16_pay)
-- =============================================================================
-- PURPOSE (batch l16 — owner's final test package of 25 Nov, §1.2 / §7.7.3 and
-- decision س٢١٣; gap rows A-08, A-59, E-12)
--
--   A free-plan code (coupons.discount_type 'plan_upgrade') and a points code
--   ('points_grant') could be created on the admin coupons page, but nothing
--   ever redeemed one: plan_granted / points_granted were written and read
--   nowhere. This file adds the redemption, recorded the way the owner
--   decided (س٢١٣ ب): full price → 100 % discount → net 0, with a free
--   activation receipt — and never through payment_orders (every receipt,
--   refund, sweep, revenue figure and analytics event there assumes money
--   moved; its total stays > 0).
--
--   1. public.coupon_redemptions — one row per redemption:
--        coupon_id (SET NULL if the code is deleted; coupon_code keeps the
--        text), user_id (SET NULL if the account is deleted), kind 'plan' |
--        'points', item_id + billing (plan) or points (points), the three
--        amounts (list_net_halalas > 0, discount_halalas = list_net_halalas,
--        net_halalas = 0, vat_halalas = 0 — CHECKs), status 'opened' |
--        'granted' | 'void', receipt_number (next_receipt_number(), the same
--        «NZ-<year>-<n>» sequence as paid orders), subscription_id,
--        points_lot_id, created_at / granted_at / updated_at.
--        Once per user per code: a partial UNIQUE index (coupon_id, user_id)
--        over rows that are not void — and coupon_usage's own
--        (coupon_id, user_id) key (20261026_20) backs it.
--        RLS on; no write for anon / authenticated; a signed-in user SELECTs
--        his own rows (policy "own coupon redemptions" + column grants) —
--        the billing page lists them and prints the receipt.
--   2. public.coupon_redeem_open(p_user, p_coupon, p_list_net, p_points_expires, p_now)
--        → jsonb, SECURITY DEFINER, search_path '', service role only. Under
--        a row lock on the coupon: active, inside its dates, uses left
--        (used_count < max_uses), the account type in eligible_user_types,
--        not already redeemed (a 'granted' row or a coupon_usage row →
--        already_used; an 'opened' row of this user → resume). Then the
--        redemption row and its coupon_usage row (order_id
--        'redemption:<id>', so used_count moves by its trigger). A POINTS
--        code is granted in the same transaction (credit_wallet_points,
--        source 'gift', general wallet, the expiry the caller read from
--        gift_valid_days) and answers 'granted'. A PLAN code answers
--        'opened': the server grants the plan (grant_plan_subscription keyed
--        on the redemption id, so a retry never grants twice) and closes it
--        with coupon_redeem_finish.
--        Answers {status}: invalid | not_grant | already_used | exhausted |
--        granted | opened | resume (+ id, kind, item_id, billing, points,
--        receipt_number).
--   3. public.coupon_redeem_finish(p_redemption, p_ok, p_subscription) → text,
--        SECURITY DEFINER, service role only: p_ok → 'granted' (+ the
--        subscription id); not ok → 'void' and the coupon_usage row removed,
--        so the use comes back (the plan could not be granted: a higher plan
--        runs, or the grant failed).
--   Every new object carries the literal "20261206_30" in its comment — the
--   marker the verify block reads.
--
-- PRIVILEGES: nothing is granted to anon; authenticated gets SELECT on its own
--   coupon_redemptions rows only. Both functions: EXECUTE for service_role
--   only. coupons / coupon_usage stay server-only (20261026_20).
--
-- PREREQUISITES (the file stops with a clear message without them):
--   20260603_phase1_003 (coupons, coupon_usage), 20261022_10 (next_receipt_number),
--   20261026_20 (coupon_usage keys + used_count trigger), 20261127_40
--   (credit_wallet_points).
-- ORDER: BEFORE the deploy of batch l16-pay (POST /api/v1/coupons/redeem calls
--   the functions; before this file it answers 503 «تفعيل الأكواد غير متاح
--   حالياً» and writes nothing). Order-free against the other l16 files.
-- SAFE TO RE-RUN: yes (if not exists / create or replace / drop policy if exists).
-- ROLLBACK (only with the owner's yes — it deletes the free-activation records):
--   drop function if exists public.coupon_redeem_finish(uuid, boolean, uuid);
--   drop function if exists public.coupon_redeem_open(uuid, uuid, int, timestamptz, timestamptz);
--   drop table if exists public.coupon_redemptions;
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.coupons') is null or to_regclass('public.coupon_usage') is null then
    raise exception '20261206_30: public.coupons / public.coupon_usage are missing (run 20260603_phase1_003_subscriptions_billing.sql first)';
  end if;
  if to_regprocedure('public.next_receipt_number()') is null then
    raise exception '20261206_30: public.next_receipt_number() is missing (run 20261022_10_payments_core.sql first)';
  end if;
  if to_regclass('public.coupon_usage_coupon_user_key') is null then
    raise exception '20261206_30: coupon_usage_coupon_user_key is missing (run 20261026_20_coupons_server_only.sql first)';
  end if;
  if to_regprocedure('public.credit_wallet_points(uuid, integer, text, timestamp with time zone, uuid, text, text)') is null then
    raise exception '20261206_30: public.credit_wallet_points is missing (run 20261127_40_points_wallets.sql first)';
  end if;
end
$pre$;

-- ── 1. coupon_redemptions ──────────────────────────────────────────────────
create table if not exists public.coupon_redemptions (
  id                uuid primary key default gen_random_uuid(),
  coupon_id         uuid null references public.coupons(id) on delete set null,
  coupon_code       text not null,
  user_id           uuid null references auth.users(id) on delete set null,
  kind              text not null constraint coupon_redemptions_kind_check check (kind in ('plan', 'points')),
  item_id           text null,
  billing           text null,
  points            int  null,
  list_net_halalas  int  not null constraint coupon_redemptions_list_check check (list_net_halalas > 0),
  discount_halalas  int  not null,
  net_halalas       int  not null default 0,
  vat_halalas       int  not null default 0,
  status            text not null default 'opened'
                      constraint coupon_redemptions_status_check check (status in ('opened', 'granted', 'void')),
  receipt_number    text not null constraint coupon_redemptions_receipt_number_key unique,
  subscription_id   uuid null,
  points_lot_id     uuid null,
  created_at        timestamptz not null default now(),
  granted_at        timestamptz null,
  updated_at        timestamptz not null default now(),
  constraint coupon_redemptions_full_discount_check
    check (discount_halalas = list_net_halalas and net_halalas = 0 and vat_halalas = 0),
  constraint coupon_redemptions_shape_check
    check ((kind = 'plan' and item_id is not null and billing is not null and points is null)
        or (kind = 'points' and points is not null and points > 0 and item_id is null))
);

comment on table public.coupon_redemptions is
  '20261206_30 (l16, owner س٢١٣): free-plan / points code redemptions — full price, 100 % discount, net 0 — with their free-activation receipt number. A user reads own rows; only the server writes.';

create unique index if not exists coupon_redemptions_once_key
  on public.coupon_redemptions (coupon_id, user_id) where status <> 'void';
comment on index public.coupon_redemptions_once_key is
  '20261206_30: a code is redeemed once per user (a void redemption gives the use back).';
create index if not exists coupon_redemptions_user_created_idx
  on public.coupon_redemptions (user_id, created_at desc);

alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from public, anon, authenticated;
grant all on public.coupon_redemptions to service_role;
drop policy if exists "own coupon redemptions" on public.coupon_redemptions;
create policy "own coupon redemptions" on public.coupon_redemptions
  for select to authenticated using (user_id = (select auth.uid()));
grant select (id, coupon_code, kind, item_id, billing, points, list_net_halalas, discount_halalas,
              net_halalas, vat_halalas, status, receipt_number, created_at, granted_at)
  on public.coupon_redemptions to authenticated;

-- ── 2. coupon_redeem_open ──────────────────────────────────────────────────
create or replace function public.coupon_redeem_open(
  p_user           uuid,
  p_coupon         uuid,
  p_list_net       int,
  p_points_expires timestamptz,
  p_now            timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coupon   record;
  v_type     text;
  v_existing record;
  v_id       uuid;
  v_receipt  text;
  v_kind     text;
  v_billing  text;
  v_points   int;
  v_list     int;
  v_lot      uuid;
begin
  if p_user is null or p_coupon is null or p_now is null then
    raise exception 'coupon_redeem_open: p_user, p_coupon and p_now are required' using errcode = '22023';
  end if;

  -- two redemptions of one code queue here
  select k.* into v_coupon from public.coupons k where k.id = p_coupon for update;
  if v_coupon.id is null then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if v_coupon.discount_type not in ('plan_upgrade', 'points_grant') then
    return pg_catalog.jsonb_build_object('status', 'not_grant');
  end if;

  -- this user's earlier redemption: granted → used; opened → resume (a plan grant that stopped half-way)
  select r.id, r.status, r.kind, r.item_id, r.billing, r.points, r.receipt_number into v_existing
    from public.coupon_redemptions r
   where r.coupon_id = p_coupon and r.user_id = p_user and r.status <> 'void'
   limit 1;
  if v_existing.id is not null then
    if v_existing.status = 'opened' then
      return pg_catalog.jsonb_build_object('status', 'resume', 'id', v_existing.id, 'kind', v_existing.kind,
        'item_id', v_existing.item_id, 'billing', v_existing.billing, 'receipt_number', v_existing.receipt_number);
    end if;
    return pg_catalog.jsonb_build_object('status', 'already_used');
  end if;
  if exists (select 1 from public.coupon_usage u where u.coupon_id = p_coupon and u.user_id = p_user) then
    return pg_catalog.jsonb_build_object('status', 'already_used');
  end if;

  if not v_coupon.active
     or (v_coupon.valid_from is not null and v_coupon.valid_from > p_now)
     or (v_coupon.valid_until is not null and v_coupon.valid_until < p_now) then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if coalesce(pg_catalog.array_length(v_coupon.eligible_user_types, 1), 0) > 0
     and not exists (select 1 from public.profiles pr
                      where pr.id = p_user and pr.user_type = any (v_coupon.eligible_user_types)) then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if v_coupon.max_uses is not null and v_coupon.max_uses > 0
     and coalesce(v_coupon.used_count, 0) >= v_coupon.max_uses then
    return pg_catalog.jsonb_build_object('status', 'exhausted');
  end if;

  if v_coupon.discount_type = 'points_grant' then
    v_kind := 'points';
    v_points := v_coupon.points_granted;
    if v_points is null or v_points <= 0 then
      return pg_catalog.jsonb_build_object('status', 'invalid');
    end if;
    if p_points_expires is null or p_points_expires <= p_now then
      raise exception 'coupon_redeem_open: a points code needs a future p_points_expires' using errcode = '22023';
    end if;
    v_list := v_points * 100; -- 1 point = 1 SAR before VAT (owner Q87)
  else
    v_kind := 'plan';
    v_billing := v_coupon.metadata ->> 'grant_billing';
    if v_coupon.plan_granted is null or v_billing is null then
      return pg_catalog.jsonb_build_object('status', 'invalid');
    end if;
    if p_list_net is null or p_list_net <= 0 then
      raise exception 'coupon_redeem_open: a plan code needs its listed price (p_list_net > 0)' using errcode = '22023';
    end if;
    v_list := p_list_net;
  end if;

  v_receipt := public.next_receipt_number();
  insert into public.coupon_redemptions
    (coupon_id, coupon_code, user_id, kind, item_id, billing, points,
     list_net_halalas, discount_halalas, net_halalas, vat_halalas, status, receipt_number)
  values
    (p_coupon, v_coupon.code, p_user, v_kind,
     case when v_kind = 'plan' then v_coupon.plan_granted end,
     case when v_kind = 'plan' then v_billing end,
     case when v_kind = 'points' then v_points end,
     v_list, v_list, 0, 0, 'opened', v_receipt)
  returning id into v_id;

  -- the use (coupons.used_count moves by trg_coupon_usage_count)
  insert into public.coupon_usage (coupon_id, user_id, order_id, discount_applied)
  values (p_coupon, p_user, 'redemption:' || v_id::text, v_list / 100.0);

  if v_kind = 'points' then
    v_lot := public.credit_wallet_points(p_user, v_points, 'gift', p_points_expires, null,
                                         'coupon:' || v_id::text, 'general');
    update public.coupon_redemptions
       set status = 'granted', granted_at = p_now, points_lot_id = v_lot, updated_at = p_now
     where id = v_id;
    return pg_catalog.jsonb_build_object('status', 'granted', 'id', v_id, 'kind', 'points',
      'points', v_points, 'receipt_number', v_receipt);
  end if;

  return pg_catalog.jsonb_build_object('status', 'opened', 'id', v_id, 'kind', 'plan',
    'item_id', v_coupon.plan_granted, 'billing', v_billing, 'receipt_number', v_receipt);
end
$$;

comment on function public.coupon_redeem_open(uuid, uuid, int, timestamptz, timestamptz) is
  '20261206_30 (l16, owner س٢١٣): redeems a free-plan / points code once per user under a row lock on the coupon; points are granted here, a plan is opened for the server to grant. Service role only.';
revoke all on function public.coupon_redeem_open(uuid, uuid, int, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.coupon_redeem_open(uuid, uuid, int, timestamptz, timestamptz) to service_role;

-- ── 3. coupon_redeem_finish ────────────────────────────────────────────────
create or replace function public.coupon_redeem_finish(p_redemption uuid, p_ok boolean, p_subscription uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if p_redemption is null or p_ok is null then
    raise exception 'coupon_redeem_finish: p_redemption and p_ok are required' using errcode = '22023';
  end if;
  select r.id, r.status, r.kind into v_row from public.coupon_redemptions r where r.id = p_redemption for update;
  if v_row.id is null then
    return 'missing';
  end if;
  if v_row.status <> 'opened' then
    return v_row.status; -- already closed (a retry)
  end if;
  if p_ok then
    update public.coupon_redemptions
       set status = 'granted', granted_at = pg_catalog.now(), subscription_id = p_subscription, updated_at = pg_catalog.now()
     where id = p_redemption;
    return 'granted';
  end if;
  update public.coupon_redemptions set status = 'void', updated_at = pg_catalog.now() where id = p_redemption;
  delete from public.coupon_usage where order_id = 'redemption:' || p_redemption::text;
  return 'void';
end
$$;

comment on function public.coupon_redeem_finish(uuid, boolean, uuid) is
  '20261206_30 (l16): closes an opened plan redemption — granted (with its subscription), or void with the coupon use given back. Service role only.';
revoke all on function public.coupon_redeem_finish(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.coupon_redeem_finish(uuid, boolean, uuid) to service_role;

-- ── 4. the operator's list: active management codes the new admin rule would refuse ──
do $list$
declare
  r record;
  n int := 0;
begin
  for r in
    select k.code, k.discount_type, k.max_discount_pct, k.valid_until, k.max_uses
      from public.coupons k
     where k.active
       and (k.discount_type in ('plan_upgrade', 'points_grant') or coalesce(k.max_discount_pct, 25) > 25)
       and (k.valid_until is null or k.max_uses is null or k.max_uses <= 0)
  loop
    n := n + 1;
    raise notice '20261206_30: active management code % (%, cap %, ends %, uses %) lacks an end date or a use limit — the admin page asks for them on its next edit',
      r.code, r.discount_type, coalesce(r.max_discount_pct::text, '—'), coalesce(r.valid_until::text, '—'), coalesce(r.max_uses::text, '—');
  end loop;
  if n = 0 then
    raise notice '20261206_30: no active management code lacks an end date or a use limit';
  end if;
end
$list$;

-- ── verify ─────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  r text;
  p text;
  fn text;
begin
  if to_regclass('public.coupon_redemptions') is null then
    missing := missing || ' coupon_redemptions is missing;';
  else
    if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.coupon_redemptions'::regclass) then
      missing := missing || ' coupon_redemptions has RLS off;';
    end if;
    if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.coupon_redemptions'::regclass
                    and conname = 'coupon_redemptions_full_discount_check') then
      missing := missing || ' the full-discount CHECK is missing;';
    end if;
    if to_regclass('public.coupon_redemptions_once_key') is null then
      missing := missing || ' coupon_redemptions_once_key is missing;';
    end if;
    foreach p in array array['INSERT', 'UPDATE', 'DELETE'] loop
      foreach r in array array['anon', 'authenticated'] loop
        if has_table_privilege(r, 'public.coupon_redemptions', p) then
          missing := missing || format(' %s holds %s on coupon_redemptions;', r, p);
        end if;
      end loop;
    end loop;
    if has_table_privilege('anon', 'public.coupon_redemptions', 'SELECT')
       or has_column_privilege('anon', 'public.coupon_redemptions', 'receipt_number', 'SELECT') then
      missing := missing || ' anon can read coupon_redemptions;';
    end if;
    if has_column_privilege('authenticated', 'public.coupon_redemptions', 'user_id', 'SELECT')
       or has_column_privilege('authenticated', 'public.coupon_redemptions', 'coupon_id', 'SELECT') then
      missing := missing || ' authenticated reads user_id / coupon_id;';
    end if;
  end if;
  foreach fn in array array['public.coupon_redeem_open(uuid, uuid, integer, timestamp with time zone, timestamp with time zone)',
                            'public.coupon_redeem_finish(uuid, boolean, uuid)'] loop
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
      if strpos(coalesce(obj_description(to_regprocedure(fn), 'pg_proc'), ''), '20261206_30') = 0 then
        missing := missing || format(' %s lost its 20261206_30 comment;', fn);
      end if;
    end if;
  end loop;
  if to_regprocedure('public.coupon_redeem_open(uuid, uuid, integer, timestamp with time zone, timestamp with time zone)') is not null
     and position('for update' in lower(pg_get_functiondef(to_regprocedure('public.coupon_redeem_open(uuid, uuid, integer, timestamp with time zone, timestamp with time zone)')))) = 0 then
    missing := missing || ' coupon_redeem_open lost its row lock;';
  end if;

  if missing <> '' then
    raise exception 'l16_pay verify:%', missing;
  end if;
  raise notice 'l16_pay verify: OK — coupon_redemptions (RLS, own rows, full-discount CHECK, once per user) + coupon_redeem_open / coupon_redeem_finish (definer, row lock, service role only)';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261206_30 coupon redemptions (free plan / points codes, 3-line free activation)' as migration,
       to_regclass('public.coupon_redemptions') is not null
       and to_regprocedure('public.coupon_redeem_open(uuid, uuid, integer, timestamp with time zone, timestamp with time zone)') is not null
       and to_regprocedure('public.coupon_redeem_finish(uuid, boolean, uuid)') is not null
       and not has_function_privilege('anon', 'public.coupon_redeem_open(uuid, uuid, integer, timestamp with time zone, timestamp with time zone)', 'EXECUTE')
       as ok, true;
