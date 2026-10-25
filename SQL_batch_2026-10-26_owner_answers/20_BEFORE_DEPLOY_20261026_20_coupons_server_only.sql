-- =============================================================================
-- Migration: 20261026_20_coupons_server_only.sql
-- =============================================================================
-- PURPOSE (owner answers of 25 Oct 2026, phase P7 — pricing doc §13أ; answer
-- ٢٧٩: no stacking)
--   Coupons are checked on the server only. Before this file:
--     * public.coupons had the policy «anyone can read active coupons»
--       (20260603_phase1_003:212-213): every visitor could list every live
--       code with its value, and /api/v1/wallet showed the whole list to every
--       signed-in client;
--     * public.coupon_usage let any signed-in user INSERT rows for himself
--       («users create own coupon usage», :221-223);
--     * nothing enforced the owner's rules: NZAMY50 needs a net order of
--       200 SAR, NEWCLIENT 300 SAR (and is for a first single-service order),
--       any coupon is capped at 25 % of the net, once per user, and never
--       applies to point top-ups, government fees or already-discounted items.
--   The code side (src/lib/payments/couponRules.ts, couponServer.ts) applies a
--   coupon INSIDE the checkout order (the stored net / VAT / total already
--   include it; VAT is 15 % of the discounted net) and records coupon_usage
--   only when the order is PAID (fulfilment). This file gives the database the
--   same rules and closes the tables to sessions.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. lock_timeout 5s. On "canceling statement due to lock timeout" nothing
--      changed — run it again a moment later.
--   2. Refuses to run unless coupons and coupon_usage (20260603_phase1_003)
--      and payment_orders (20261022_10) exist, and STOPS — naming them — when
--      coupon_usage already holds two rows for one (coupon, user) or for one
--      order, or one buyer already holds two counted orders (open, paid or
--      refunded) carrying the same coupon: the unique guards below could not
--      be built, and which row is the real one is a person's call. Nothing is
--      deleted.
--   3. Drops EVERY policy on coupons and coupon_usage (whatever it is called),
--      keeps RLS on, and revokes every privilege of anon and authenticated on
--      both tables and on the coupon_usage id sequence. Only the service role
--      (the server routes) reads or writes them.
--   4. coupons gains
--        max_discount_pct numeric(5,2) NOT NULL DEFAULT 25, CHECK 0 < x <= 25
--          — the owner's ceiling for any marketing coupon (§13أ.3);
--        excluded_kinds text[] NOT NULL DEFAULT '{topup}', CHECK it holds only
--          plan / library / topup / service and always holds topup
--          (no coupon on a point top-up, ever).
--      Government fees are never part of a platform order, so no coupon can
--      reach them; already-discounted items are refused in code
--      (couponRules.ts: an item with a launch / campaign price).
--   5. coupon_usage gains two unique guards: one row per (coupon, user)
--      (once per user) and one row per order (a fulfilment retry records the
--      same order once).
--   5b. payment_orders gains the backstop of the checkout's own refusal: ONE
--      counted order per (buyer, coupon) — payment_orders_coupon_once_key,
--      unique on (user_id, metadata->'coupon'->>'id') over orders that are
--      open (created / initiated), paid or refunded, that are not test-mode
--      payments (live is not false — an open order has live null until it is
--      paid) and that did not end «already entitled» (paid, nothing granted).
--      Two checkouts in two tabs with one code (different items) can no
--      longer both carry it. An abandoned order stops counting once it is
--      closed (cancelled): the checkout closes a buyer's couponed order once
--      its intent has expired and Moyasar lists no payment for it beyond a
--      failed one (one an abandoned 3-D Secure payment reached: after the
--      sweep's 7-day lookback), and every other close (superseded, refused
--      intent, failed payment, void) already leaves the set.
--   6. A trigger keeps coupons.used_count = the number of coupon_usage rows
--      added since, minus the rows removed (a void inside the 90-minute
--      window releases its row; never below 0). max_uses is checked against
--      it.
--   7. The two owner codes get his rules (§13أ.1–2) ONCE: NZAMY50 fixed 50
--      SAR, min net 200; NEWCLIENT fixed 75 SAR, min net 300, single services
--      only (excluded_kinds plan / library / topup — checkout sells no single
--      service today, so it cannot be used online yet). Both: 25 % cap, once
--      per user. A missing row is created with the old seed's dates; an
--      existing row keeps its active flag and dates (an admin may have
--      switched it off). The row is stamped metadata.owner_rules when the
--      rules are written, and a re-run never writes them again: a later edit
--      on the admin coupons page survives (the verify then NOTICEs the
--      difference, never raises). No other code is created.
--   7b. Every OTHER active code not created on the admin coupons page
--      (metadata.created_by_admin) is SWITCHED OFF, values kept, named in a
--      NOTICE and stamped metadata.switched_off: before P7 nothing redeemed a
--      code, after the deploy checkout honours every active row, and the old
--      seed's LAUNCH2026 (25 % off, 500 uses, no minimum, public until now)
--      is not one of the owner's two. An admin may switch it back on from the
--      coupons page; a re-run skips a stamped row, so it does not undo that.
--   7c. A NOTICE names every code still active besides the owner's two (an
--      admin created it on the coupons page, or switched it back on) with its
--      type, value, minimum and uses: checkout honours each of them from the
--      deploy on — the operator sends the line to the owner.
--   8. Every new column, index and the trigger carry the literal
--      "20261026_20" — the marker _verify.sql reads. Raising verify; then
--      `notify pgrst` after commit.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY OF THIS BATCH (file 20_BEFORE_DEPLOY_…).
--   The code works before AND after it: until max_discount_pct exists, the
--   checkout page hides the coupon field, and POST /api/v1/coupons/validate
--   and checkout both answer a coupon code 503 «أكواد الخصم غير متاحة
--   حالياً» rather than charging the full price. /api/v1/wallet no longer
--   reads the coupons at all. NOTHING GATES THE DEPLOY: deploy.sh does not run
--   _verify.sql; its section verify:coupons_server_only is a MANUAL check.
--   Until this file runs, the codes stay readable by anyone through the REST
--   API (the old policy) — run it before or with the deploy.
--
-- ROLLBACK (re-opens the codes to every visitor — only with the owner's yes)
--   drop trigger if exists trg_coupon_usage_count on public.coupon_usage;
--   drop function if exists public.coupon_usage_count();
--   drop index if exists public.coupon_usage_coupon_user_key, public.coupon_usage_order_key;
--   drop index if exists public.payment_orders_coupon_once_key;
--   alter table public.coupons drop column max_discount_pct, drop column excluded_kinds;
--   create policy "anyone can read active coupons" on public.coupons for select using (active = true);
--   grant select on public.coupons to anon, authenticated;
--   update public.coupons set active = true where metadata->>'switched_off' like '%20261026_20%';  -- only with the owner's yes
--   and remove the verify:coupons_server_only section from _verify.sql.
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisites, and no duplicate redemption ──────────────────────────
do $$
declare
  bad text;
begin
  if to_regclass('public.coupons') is null or to_regclass('public.coupon_usage') is null then
    raise exception '20261026_20: public.coupons / public.coupon_usage do not exist — run 20260603_phase1_003_subscriptions_billing.sql first';
  end if;
  if to_regclass('public.payment_orders') is null then
    raise exception '20261026_20: public.payment_orders does not exist — run 20261022_10_payments_core.sql first';
  end if;

  select string_agg(format('coupon %s / user %s (%s rows)', coupon_id, user_id, n), '; ') into bad
    from (select coupon_id, user_id, count(*) as n from public.coupon_usage
           group by coupon_id, user_id having count(*) > 1) d;
  if bad is not null then
    raise exception '20261026_20: coupon_usage holds more than one row for: % — nothing changed; look at those rows first (once per user)', bad;
  end if;

  select string_agg(format('order %s (%s rows)', order_id, n), '; ') into bad
    from (select order_id, count(*) as n from public.coupon_usage
           where order_id is not null group by order_id having count(*) > 1) d;
  if bad is not null then
    raise exception '20261026_20: coupon_usage holds more than one row for: % — nothing changed; look at those rows first', bad;
  end if;

  -- the set payment_orders_coupon_once_key (5b) counts — keep the two in step
  select string_agg(format('user %s / coupon %s (%s orders)', user_id, cid, n), '; ') into bad
    from (select user_id, metadata->'coupon'->>'id' as cid, count(*) as n
            from public.payment_orders
           where status in ('created', 'initiated', 'paid', 'refunded')
             and (metadata->'coupon'->>'id') is not null
             and live is not false
             and coalesce(metadata->>'already_entitled', 'false') <> 'true'
           group by 1, 2 having count(*) > 1) d;
  if bad is not null then
    raise exception '20261026_20: payment_orders holds more than one open / paid / refunded order of one buyer carrying one coupon: % — nothing changed; close or review those orders first (once per user)', bad;
  end if;
end $$;

-- ── 2. No session reads or writes either table ──────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select p.polname, p.polrelid::regclass as tbl
      from pg_policy p
     where p.polrelid in ('public.coupons'::regclass, 'public.coupon_usage'::regclass)
  loop
    execute format('drop policy %I on %s', r.polname, r.tbl);
  end loop;
end $$;

alter table public.coupons      enable row level security;
alter table public.coupon_usage enable row level security;

revoke all on table public.coupons, public.coupon_usage from public, anon, authenticated;
grant  all on table public.coupons, public.coupon_usage to service_role;

do $$
declare
  seq text := pg_get_serial_sequence('public.coupon_usage', 'id');
begin
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
    execute format('grant usage, select on sequence %s to service_role', seq);
  end if;
end $$;

comment on table public.coupons is
  '20261026_20: server only (service role). No policy, no anon / authenticated privilege: codes are never listed to sessions. Rules: src/lib/payments/couponRules.ts.';
comment on table public.coupon_usage is
  '20261026_20: server only (service role). One row per (coupon, user) and per order, written by fulfilment when the order is PAID.';

-- ── 3. The owner's ceiling and exclusions ───────────────────────────────────
alter table public.coupons
  add column if not exists max_discount_pct numeric(5,2) not null default 25,
  add column if not exists excluded_kinds   text[]       not null default '{topup}';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.coupons'::regclass and conname = 'coupons_max_discount_pct_check') then
    alter table public.coupons
      add constraint coupons_max_discount_pct_check check (max_discount_pct > 0 and max_discount_pct <= 25);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.coupons'::regclass and conname = 'coupons_excluded_kinds_check') then
    alter table public.coupons
      add constraint coupons_excluded_kinds_check
      check (excluded_kinds <@ array['plan', 'library', 'topup', 'service']::text[]
             and 'topup' = any (excluded_kinds));
  end if;
end $$;

comment on column public.coupons.max_discount_pct is
  '20261026_20 (pricing doc 25 Oct §13أ.3): the discount never exceeds this percentage of the order net before VAT; at most 25.';
comment on column public.coupons.excluded_kinds is
  '20261026_20 (§13أ.3): payment_orders.kind values the coupon never applies to; always includes topup (no coupon on a point top-up).';

-- ── 4. Once per user, once per order ────────────────────────────────────────
create unique index if not exists coupon_usage_coupon_user_key on public.coupon_usage (coupon_id, user_id);
create unique index if not exists coupon_usage_order_key on public.coupon_usage (order_id) where order_id is not null;
comment on index public.coupon_usage_coupon_user_key is '20261026_20: a coupon is redeemed once per user (owner, pricing doc §13أ.3).';
comment on index public.coupon_usage_order_key is '20261026_20: an order records its coupon once (a fulfilment retry inserts nothing new).';

-- ── 4b. One counted order per (buyer, coupon) ───────────────────────────────
-- The backstop of checkout's own refusal (couponServer.ts): two tabs with one
-- code cannot both open an order carrying it. Counted: open, paid and
-- refunded orders; not test-mode payments (live = false — an open order's
-- live is null until it is paid) and not an order that ended «already
-- entitled» (paid, nothing granted, refund review). An order leaves the set
-- when it is closed (cancelled / failed / voided).
create unique index if not exists payment_orders_coupon_once_key
  on public.payment_orders (user_id, ((metadata->'coupon'->>'id')))
  where status in ('created', 'initiated', 'paid', 'refunded')
    and (metadata->'coupon'->>'id') is not null
    and live is not false
    and coalesce(metadata->>'already_entitled', 'false') <> 'true';
comment on index public.payment_orders_coupon_once_key is
  '20261026_20: one open / paid / refunded order per (buyer, coupon) — checkout answers a violation «هذا الكود مستخدم في طلب آخر قيد الدفع».';

-- ── 5. used_count follows coupon_usage ──────────────────────────────────────
create or replace function public.coupon_usage_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- a void inside the 90-minute window releases the redemption
    update public.coupons set used_count = greatest(used_count - 1, 0), updated_at = now() where id = old.coupon_id;
    return old;
  end if;
  update public.coupons set used_count = used_count + 1, updated_at = now() where id = new.coupon_id;
  return new;
end;
$$;
comment on function public.coupon_usage_count() is '20261026_20: keeps coupons.used_count = coupon_usage rows added minus rows removed, never below 0 (max_uses is checked against it).';
revoke all on function public.coupon_usage_count() from public, anon, authenticated;

drop trigger if exists trg_coupon_usage_count on public.coupon_usage;
create trigger trg_coupon_usage_count
  after insert or delete on public.coupon_usage
  for each row execute function public.coupon_usage_count();
comment on trigger trg_coupon_usage_count on public.coupon_usage is '20261026_20: keeps coupons.used_count in step with coupon_usage (insert +1, delete −1).';

-- ── 6. The owner's two codes — his rules written ONCE ───────────────────────
-- A missing row is created; an existing row is given the rules only while it
-- carries no metadata.owner_rules stamp, and is stamped in the same update.
-- A re-run therefore never undoes an edit made later on the admin coupons
-- page (the verify below NOTICEs such a difference). Active flag and dates of
-- an existing row are never touched.
insert into public.coupons
  (code, discount_type, discount_value, min_order_amount, max_uses, max_uses_per_user,
   valid_until, active, max_discount_pct, excluded_kinds, metadata)
values
  ('NZAMY50',   'fixed', 50, 200, null, 1, '2027-12-31T23:59:59Z', true, 25, '{topup}', '{}'::jsonb),
  ('NEWCLIENT', 'fixed', 75, 300, null, 1, '2027-12-31T23:59:59Z', true, 25, '{plan,library,topup}', '{}'::jsonb)
on conflict (code) do nothing;

update public.coupons k
   set discount_type     = v.dtype,
       discount_value    = v.val,
       min_order_amount  = v.mn,
       max_uses_per_user = 1,
       max_discount_pct  = 25,
       excluded_kinds    = v.ex,
       metadata          = k.metadata || jsonb_build_object(
                             'rules', v.rules,
                             'owner_rules', '20261026_20 — the owner''s rules written once; later edits on the admin coupons page are kept'),
       updated_at        = now()
  from (values
          ('NZAMY50', 'fixed', 50::numeric, 200::numeric, '{topup}'::text[],
           '20261026_20 — pricing doc 25 Oct §13أ.1: 50 SAR off a net order of 200 SAR or more'),
          ('NEWCLIENT', 'fixed', 75::numeric, 300::numeric, '{plan,library,topup}'::text[],
           '20261026_20 — pricing doc 25 Oct §13أ.2: 75 SAR off a first single-service order of 300 SAR net or more')
       ) v(code, dtype, val, mn, ex, rules)
 where k.code = v.code
   and coalesce(k.metadata->>'owner_rules', '') not like '%20261026_20%';

-- ── 6b. Every other seeded code is switched off (values kept) ──────────────
-- Before P7 nothing could redeem a code; from the deploy on, checkout honours
-- every ACTIVE row. The owner approved two codes (§13أ). LAUNCH2026 (old seed:
-- 25 % off, 500 uses, no minimum — and readable by anyone until now) and any
-- other row put in by SQL would go live silently, so they are switched off
-- here: active = false, nothing else changed, the code named in a NOTICE and
-- stamped metadata.switched_off. Coupons an admin created on the coupons page
-- (metadata.created_by_admin) are his deliberate choice and are left alone.
-- An admin may switch any of these back on from the coupons page; a re-run
-- skips a row that carries the stamp, so it does not undo that.
do $$
declare
  off text;
begin
  with switched as (
    update public.coupons
       set active     = false,
           metadata   = metadata || jsonb_build_object('switched_off',
                          '20261026_20 — not one of the owner''s two codes (pricing doc 25 Oct §13أ); values kept; an admin may switch it back on'),
           updated_at = now()
     where active
       and code not in ('NZAMY50', 'NEWCLIENT')
       and not (metadata ? 'created_by_admin')
       and coalesce(metadata->>'switched_off', '') not like '%20261026_20%'
    returning code
  )
  select string_agg(code, ', ' order by code) into off from switched;
  raise notice '20261026_20: switched off (not the owner''s codes; values kept): %', coalesce(off, 'none');
end $$;

-- ── 6c. Every code still live besides the owner's two, for the owner ───────
-- Created on the admin coupons page, or switched back on there: checkout
-- honours each from the deploy on. Named with what it gives, so the operator
-- can send the line to the owner.
do $$
declare
  live_codes text;
begin
  select string_agg(format('%s (%s %s, min %s, uses %s/%s, until %s)',
                           code, discount_type, discount_value, min_order_amount, used_count,
                           coalesce(max_uses::text, 'unlimited'), coalesce(valid_until::date::text, 'no end')),
                    '; ' order by code)
    into live_codes
    from public.coupons
   where active and code not in ('NZAMY50', 'NEWCLIENT');
  raise notice '20261026_20: active codes besides NZAMY50 / NEWCLIENT (checkout honours them — send this line to the owner): %',
    coalesce(live_codes, 'none');
end $$;

-- ── 7. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  missing text := '';
  r       text;
  p       text;
  t       text;
  c       record;
begin
  foreach t in array array['public.coupons', 'public.coupon_usage'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      missing := missing || format(' %s has RLS off;', t);
    end if;
    if exists (select 1 from pg_policy where polrelid = t::regclass) then
      missing := missing || format(' %s still has a policy;', t);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(r, t, p) then
          missing := missing || format(' %s holds %s on %s;', r, p, t);
        end if;
      end loop;
    end loop;
  end loop;

  if coalesce(col_description('public.coupons'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.coupons'::regclass and attname = 'max_discount_pct')), '')
     not like '%20261026_20%' then
    missing := missing || ' coupons.max_discount_pct is missing or lacks its comment;';
  end if;
  if coalesce(col_description('public.coupons'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.coupons'::regclass and attname = 'excluded_kinds')), '')
     not like '%20261026_20%' then
    missing := missing || ' coupons.excluded_kinds is missing or lacks its comment;';
  end if;
  if exists (select 1 from public.coupons where max_discount_pct > 25 or not ('topup' = any (excluded_kinds))) then
    missing := missing || ' a coupon exceeds the 25 % cap or applies to top-ups;';
  end if;

  if to_regclass('public.coupon_usage_coupon_user_key') is null
     or pg_get_indexdef('public.coupon_usage_coupon_user_key'::regclass) not like 'CREATE UNIQUE INDEX%(coupon_id, user_id)%' then
    missing := missing || ' the unique (coupon_id, user_id) guard is missing;';
  end if;
  if to_regclass('public.coupon_usage_order_key') is null
     or pg_get_indexdef('public.coupon_usage_order_key'::regclass) not like 'CREATE UNIQUE INDEX%(order_id)%' then
    missing := missing || ' the unique order_id guard is missing;';
  end if;
  if to_regclass('public.payment_orders_coupon_once_key') is null
     or pg_get_indexdef('public.payment_orders_coupon_once_key'::regclass) not like 'CREATE UNIQUE INDEX%(user_id, %''coupon''%''id''%WHERE%''initiated''%''paid''%''refunded''%live IS NOT FALSE%already_entitled%' then
    missing := missing || ' the one-order-per-(buyer, coupon) guard on payment_orders is missing;';
  end if;
  -- tgtype bits: 1 row-level, 4 insert, 8 delete (AFTER = no 2 bit)
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.coupon_usage'::regclass and tgname = 'trg_coupon_usage_count' and not tgisinternal
                    and tgenabled <> 'D' and (tgtype & 1) = 1 and (tgtype & 2) = 0 and (tgtype & 4) = 4 and (tgtype & 8) = 8
                    and tgfoid = 'public.coupon_usage_count()'::regprocedure) then
    missing := missing || ' trg_coupon_usage_count (after insert or delete, per row) is missing or disabled;';
  end if;

  -- The owner's two codes: present and stamped (raises). Values that differ
  -- from his rules can only be a later admin edit (the rules were written in
  -- the stamping update) — named, never an error.
  for c in
    select * from (values ('NZAMY50', 50::numeric, 200::numeric, '{topup}'::text[]),
                          ('NEWCLIENT', 75::numeric, 300::numeric, '{plan,library,topup}'::text[])) v(code, val, mn, ex)
  loop
    if not exists (select 1 from public.coupons k
                    where k.code = c.code and coalesce(k.metadata->>'owner_rules', '') like '%20261026_20%') then
      missing := missing || format(' %s is missing or never received the owner''s rules;', c.code);
    elsif not exists (select 1 from public.coupons k
                       where k.code = c.code and k.discount_type = 'fixed' and k.discount_value = c.val
                         and k.min_order_amount = c.mn and k.max_uses_per_user = 1 and k.max_discount_pct = 25
                         and k.excluded_kinds @> c.ex and c.ex @> k.excluded_kinds) then
      raise notice '20261026_20 verify: % differs from the owner''s rules (fixed %, min %, cap 25, %) — changed on the admin coupons page after they were written; kept: %',
        c.code, c.val, c.mn, c.ex,
        (select row_to_json(x) from (select discount_type, discount_value, min_order_amount, max_uses_per_user, max_discount_pct, excluded_kinds
                                       from public.coupons where code = c.code) x);
    end if;
  end loop;

  if exists (select 1 from public.coupons
              where active and code not in ('NZAMY50', 'NEWCLIENT')
                and not (metadata ? 'created_by_admin')
                and coalesce(metadata->>'switched_off', '') not like '%20261026_20%') then
    missing := missing || ' a seeded code other than the owner''s two is still active;';
  end if;

  if missing <> '' then
    raise exception '20261026_20 verify:%', missing;
  end if;
  raise notice '20261026_20 verify: OK — coupons and coupon_usage are server only (no policy, no anon / authenticated privilege); 25 %% cap and top-up exclusion on every coupon; once per user and once per order guarded; one open / paid order per (buyer, coupon); used_count follows inserts and deletes; NZAMY50 and NEWCLIENT received the owner''s rules (stamped); other seeded codes switched off';
end $$;

commit;

notify pgrst, 'reload schema';
