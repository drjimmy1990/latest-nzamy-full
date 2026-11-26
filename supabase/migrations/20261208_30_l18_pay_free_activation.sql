-- =============================================================================
-- Migration: 20261208_30_l18_pay_free_activation.sql   (verify id: l18_pay)
-- =============================================================================
-- PURPOSE (batch l18 — owner's urgent package of 26 Nov, decision ق٢٦-١١ which
-- settles question ٢٢٤; live faults LIVE-11 / LIVE-13)
--
--   A discount code that brings the price to 0 (100 %, or a fixed amount at
--   least the price) is activated at once with a 0 SAR free-activation
--   receipt — no card, no Moyasar, never a payment_orders row (its total
--   stays > 0; every receipt, refund, sweep and revenue figure there assumes
--   money moved). The record is the l16 one (20261206_30,
--   coupon_redemptions): full price → 100 % discount → net 0. And a free-plan
--   code may now grant a LIBRARY pass or the office + library BUNDLE.
--
--   1. coupon_redemptions.library_grant_id (uuid, null) — the library pass a
--      redemption granted (a library pass, or the bundle's library part).
--      kind stays 'plan' | 'points': 'plan' means "an item of the price book"
--      (a plan, a library pass or the bundle); item_id says which.
--   2. public.coupon_redeem_full_open(p_user, p_coupon, p_kind, p_item,
--      p_billing, p_list_net, p_now) → jsonb, SECURITY DEFINER, search_path
--      '', service role only. Under a row lock on the coupon: a DISCOUNT code
--      (fixed / percentage), active, inside its dates, the account type in
--      eligible_user_types, p_kind ('plan' | 'library') not in its
--      excluded_kinds, the list price at its minimum, uses left (used_count +
--      the live checkout reservations of 20261126_60, when that table
--      exists), once per user (a redemption or a coupon_usage row), and the
--      code really leaves less than 1 SAR of p_list_net (the same arithmetic
--      as couponRules.evaluateCoupon: value, capped at max_discount_pct).
--      Then the redemption row (list = discount = p_list_net, net 0, VAT 0)
--      and its coupon_usage row (order_id 'redemption:<id>', so used_count
--      moves by its trigger and checkout's once-per-user check sees it).
--      Answers {status}: invalid | not_discount | not_for_item | not_full |
--      already_used | exhausted | opened | resume (+ id, item_id, billing,
--      receipt_number). The server then grants the item and closes the row
--      with coupon_redeem_finish (20261206_30) — granted, or void (the use
--      comes back).
--   3. public.coupon_redeem_grant_library(p_redemption, p_plan_ref, p_days,
--      p_points, p_now) → jsonb, SECURITY DEFINER, search_path '', service
--      role only. Exactly once per redemption (row lock; library_grant_id is
--      read first): the pass through library_grant_access (20261030_65 —
--      the per-user lock and the window from the end of the latest grant),
--      source 'admin' with the reason «تفعيل مجاني بكود منحة <code>» and no
--      order (library_access_grants.order_id is a payment_orders FK), then
--      the plan's library-assistant points (p_points, as a paid pass brings
--      them: credit_wallet_points, source 'plan', scope library_agent,
--      expiring with the pass; none when p_points is 0). Answers {status:
--      granted | done, grant_id, ends_at}; a redemption that is not opened
--      and holds no pass → raises (22023).
--   Every new object carries "20261208_30" in its comment (the verify marker).
--
-- PRIVILEGES: nothing to anon / authenticated; both functions EXECUTE for
--   service_role only; the new column is not granted to authenticated.
-- PREREQUISITES (the file stops with a clear message without them):
--   20261206_30 (coupon_redemptions, coupon_redeem_finish), 20261030_65
--   (library_grant_access), 20261127_40 (credit_wallet_points).
--   20261126_60 (coupon_reservations) is optional: without it no
--   reservation is counted.
-- ORDER: BEFORE the deploy of batch l18-pay. Before it, a code that covers the
--   whole price answers 503 «تفعيل الأكواد غير متاح حالياً» at checkout and
--   writes nothing; a free library / bundle code answers the same.
-- BACKFILL: none.
-- SAFE TO RE-RUN: yes (add column if not exists / create or replace).
-- ROLLBACK (only with the owner's yes):
--   drop function if exists public.coupon_redeem_grant_library(uuid, text, integer, integer, timestamptz);
--   drop function if exists public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamptz);
--   alter table public.coupon_redemptions drop column if exists library_grant_id;
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.coupon_redemptions') is null
     or to_regprocedure('public.coupon_redeem_finish(uuid, boolean, uuid)') is null then
    raise exception '20261208_30: coupon_redemptions / coupon_redeem_finish are missing (run 20261206_30_pay_coupon_redemptions.sql first)';
  end if;
  if to_regprocedure('public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)') is null then
    raise exception '20261208_30: public.library_grant_access is missing (run 20261030_65_library_grant_admin.sql first)';
  end if;
  if to_regprocedure('public.credit_wallet_points(uuid, integer, text, timestamp with time zone, uuid, text, text)') is null then
    raise exception '20261208_30: public.credit_wallet_points is missing (run 20261127_40_points_wallets.sql first)';
  end if;
end
$pre$;

-- ── 1. the library pass of a redemption ─────────────────────────────────────
alter table public.coupon_redemptions add column if not exists library_grant_id uuid null;
comment on column public.coupon_redemptions.library_grant_id is
  '20261208_30 (l18, ق٢٦-١١): the library_access_grants row this redemption granted (a library pass or the bundle''s library part); set once, by coupon_redeem_grant_library.';

-- ── 2. coupon_redeem_full_open ──────────────────────────────────────────────
create or replace function public.coupon_redeem_full_open(
  p_user     uuid,
  p_coupon   uuid,
  p_kind     text,
  p_item     text,
  p_billing  text,
  p_list_net int,
  p_now      timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coupon   record;
  v_existing record;
  v_held     int := 0;
  v_value    numeric;
  v_raw      bigint;
  v_cap      bigint;
  v_pct      numeric;
  v_disc     bigint;
  v_id       uuid;
  v_receipt  text;
begin
  if p_user is null or p_coupon is null or p_now is null or p_item is null or p_billing is null then
    raise exception 'coupon_redeem_full_open: p_user, p_coupon, p_item, p_billing and p_now are required' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('plan', 'library') then
    raise exception 'coupon_redeem_full_open: p_kind must be plan or library' using errcode = '22023';
  end if;
  if p_list_net is null or p_list_net <= 0 then
    raise exception 'coupon_redeem_full_open: p_list_net must be the listed price (> 0)' using errcode = '22023';
  end if;

  -- two activations of one code queue here (the lock coupon_reserve takes too)
  select k.* into v_coupon from public.coupons k where k.id = p_coupon for update;
  if v_coupon.id is null then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if v_coupon.discount_type not in ('fixed', 'percentage') then
    return pg_catalog.jsonb_build_object('status', 'not_discount');
  end if;

  -- this user's earlier redemption: granted → used; opened → resume (a grant that stopped half-way)
  select r.id, r.status, r.item_id, r.billing, r.receipt_number into v_existing
    from public.coupon_redemptions r
   where r.coupon_id = p_coupon and r.user_id = p_user and r.status <> 'void'
   limit 1;
  if v_existing.id is not null then
    if v_existing.status = 'opened' then
      return pg_catalog.jsonb_build_object('status', 'resume', 'id', v_existing.id, 'item_id', v_existing.item_id,
        'billing', v_existing.billing, 'receipt_number', v_existing.receipt_number);
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
  -- never a service of a lawyer or an office, never a top-up (س٢١٣ ب)
  if p_kind = any (coalesce(v_coupon.excluded_kinds, '{}'::text[]))
     or (pg_catalog.round(coalesce(v_coupon.min_order_amount, 0) * 100))::bigint > p_list_net then
    return pg_catalog.jsonb_build_object('status', 'not_for_item');
  end if;

  -- uses left: the uses, plus the live checkout reservations (20261126_60) when that table exists
  if v_coupon.max_uses is not null and v_coupon.max_uses > 0 then
    if to_regclass('public.coupon_reservations') is not null then
      execute $q$
        select pg_catalog.count(*)::int
          from public.coupon_reservations r
          join public.payment_orders o on o.id = r.order_id
         where r.coupon_id = $1
           and ((o.status in ('created', 'initiated')
                  and (r.expires_at > pg_catalog.now()
                       or (o.moyasar_payment_id is not null and r.reserved_at > pg_catalog.now() - interval '7 days')))
             or (o.status = 'paid'
                  and o.live is not false
                  and coalesce(o.metadata ->> 'already_entitled', 'false') <> 'true'
                  and not exists (select 1 from public.coupon_usage u where u.order_id = o.id::text)))
      $q$ into v_held using p_coupon;
    end if;
    if coalesce(v_coupon.used_count, 0) + coalesce(v_held, 0) >= v_coupon.max_uses then
      return pg_catalog.jsonb_build_object('status', 'exhausted');
    end if;
  end if;

  -- the code must really cover the price (less than 1 SAR left) — couponRules.evaluateCoupon's arithmetic
  v_value := coalesce(v_coupon.discount_value, 0);
  if v_value <= 0 then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;
  if v_coupon.discount_type = 'fixed' then
    v_raw := (pg_catalog.round(v_value * 100))::bigint;
  else
    v_raw := pg_catalog.floor(p_list_net * least(v_value, 100) / 100)::bigint;
  end if;
  v_pct := coalesce(v_coupon.max_discount_pct, 25);
  if v_pct <= 0 then v_pct := 25; end if;
  v_cap := pg_catalog.floor(p_list_net * least(v_pct, 100) / 100)::bigint;
  v_disc := least(v_raw, v_cap);
  if p_list_net - v_disc >= 100 then
    return pg_catalog.jsonb_build_object('status', 'not_full');
  end if;

  v_receipt := public.next_receipt_number();
  insert into public.coupon_redemptions
    (coupon_id, coupon_code, user_id, kind, item_id, billing, points,
     list_net_halalas, discount_halalas, net_halalas, vat_halalas, status, receipt_number)
  values
    (p_coupon, v_coupon.code, p_user, 'plan', p_item, p_billing, null,
     p_list_net, p_list_net, 0, 0, 'opened', v_receipt)
  returning id into v_id;

  -- the use (coupons.used_count moves by trg_coupon_usage_count)
  insert into public.coupon_usage (coupon_id, user_id, order_id, discount_applied)
  values (p_coupon, p_user, 'redemption:' || v_id::text, p_list_net / 100.0);

  return pg_catalog.jsonb_build_object('status', 'opened', 'id', v_id, 'item_id', p_item,
    'billing', p_billing, 'receipt_number', v_receipt);
end
$$;

comment on function public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamptz) is
  '20261208_30 (l18, owner ق٢٦-١١ / س٢٢٤): opens a 0 SAR activation of a discount code that covers the whole price — once per user, uses left (with live reservations), under a row lock on the coupon; the server grants the item and closes it with coupon_redeem_finish. Service role only.';
revoke all on function public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamptz) to service_role;

-- ── 3. coupon_redeem_grant_library ──────────────────────────────────────────
create or replace function public.coupon_redeem_grant_library(
  p_redemption uuid,
  p_plan_ref   text,
  p_days       integer,
  p_points     integer,
  p_now        timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row   record;
  v_grant jsonb;
  v_gid   uuid;
  v_ends  timestamptz;
begin
  if p_redemption is null or p_plan_ref is null or p_days is null or p_now is null then
    raise exception 'coupon_redeem_grant_library: p_redemption, p_plan_ref, p_days and p_now are required' using errcode = '22023';
  end if;
  select r.id, r.user_id, r.status, r.coupon_code, r.library_grant_id into v_row
    from public.coupon_redemptions r where r.id = p_redemption for update;
  if v_row.id is null then
    raise exception 'coupon_redeem_grant_library: no such redemption' using errcode = '22023';
  end if;
  -- exactly once: a retry finds the pass already there
  if v_row.library_grant_id is not null then
    select g.ends_at into v_ends from public.library_access_grants g where g.id = v_row.library_grant_id;
    return pg_catalog.jsonb_build_object('status', 'done', 'grant_id', v_row.library_grant_id, 'ends_at', v_ends);
  end if;
  if v_row.status <> 'opened' or v_row.user_id is null then
    raise exception 'coupon_redeem_grant_library: the redemption is not open' using errcode = '22023';
  end if;

  v_grant := public.library_grant_access(v_row.user_id, p_plan_ref, 'admin', p_days, null, null,
                                         'تفعيل مجاني بكود منحة ' || v_row.coupon_code,
                                         'coupon_redemption:' || v_row.id::text);
  v_gid := (v_grant ->> 'id')::uuid;
  v_ends := (v_grant ->> 'ends_at')::timestamptz;

  -- the pass's library-assistant points, as a paid pass brings them (none for 0)
  if coalesce(p_points, 0) > 0 and v_ends > p_now then
    perform public.credit_wallet_points(v_row.user_id, p_points, 'plan', v_ends, null,
                                        'coupon:' || v_row.id::text, 'library_agent');
  end if;

  update public.coupon_redemptions
     set library_grant_id = v_gid, updated_at = p_now
   where id = v_row.id;
  return pg_catalog.jsonb_build_object('status', 'granted', 'grant_id', v_gid, 'ends_at', v_ends);
end
$$;

comment on function public.coupon_redeem_grant_library(uuid, text, integer, integer, timestamptz) is
  '20261208_30 (l18, owner ق٢٦-١١): grants the library pass of an opened redemption exactly once (library_grant_access, source admin with the code as reason, no order) plus its library-assistant points. Service role only.';
revoke all on function public.coupon_redeem_grant_library(uuid, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.coupon_redeem_grant_library(uuid, text, integer, integer, timestamptz) to service_role;

-- ── verify ─────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  fn text;
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.coupon_redemptions'::regclass and attname = 'library_grant_id' and not attisdropped) then
    missing := missing || ' coupon_redemptions.library_grant_id is missing;';
  end if;
  if has_column_privilege('authenticated', 'public.coupon_redemptions', 'library_grant_id', 'SELECT')
     or has_table_privilege('authenticated', 'public.coupon_redemptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.coupon_redemptions', 'UPDATE') then
    missing := missing || ' authenticated gained a privilege on coupon_redemptions;';
  end if;
  foreach fn in array array['public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamp with time zone)',
                            'public.coupon_redeem_grant_library(uuid, text, integer, integer, timestamp with time zone)'] loop
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
      if strpos(coalesce(obj_description(to_regprocedure(fn), 'pg_proc'), ''), '20261208_30') = 0 then
        missing := missing || format(' %s lost its 20261208_30 comment;', fn);
      end if;
    end if;
  end loop;
  if to_regprocedure('public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamp with time zone)') is not null
     and (position('for update' in lower(pg_get_functiondef(to_regprocedure('public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamp with time zone)')))) = 0
          or position('not_full' in pg_get_functiondef(to_regprocedure('public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamp with time zone)'))) = 0) then
    missing := missing || ' coupon_redeem_full_open lost its row lock or its full-discount guard;';
  end if;

  if missing <> '' then
    raise exception 'l18_pay verify:%', missing;
  end if;
  raise notice 'l18_pay verify: OK — coupon_redemptions.library_grant_id + coupon_redeem_full_open (row lock, full-discount guard) / coupon_redeem_grant_library (exactly once), definer, service role only';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261208_30 l18 free activation (0 SAR discount codes, library / bundle grants)' as migration,
       to_regprocedure('public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamp with time zone)') is not null
       and to_regprocedure('public.coupon_redeem_grant_library(uuid, text, integer, integer, timestamp with time zone)') is not null
       and not has_function_privilege('anon', 'public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamp with time zone)', 'EXECUTE')
       as ok, true;
