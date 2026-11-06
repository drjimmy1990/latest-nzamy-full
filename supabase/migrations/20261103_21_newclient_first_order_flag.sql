-- =============================================================================
-- Migration: 20261103_21_newclient_first_order_flag.sql
-- =============================================================================
-- PURPOSE (owner-free wave, S6-T9; owner ٣٠٥; slice A §6.2.3)
--   NEWCLIENT is for the buyer's FIRST paid order on the platform. Until now
--   the code applied that rule to NEWCLIENT by its name
--   (couponRules.isFirstOrderCoupon: `code === "NEWCLIENT" || flag`). From the
--   deploy of S6-T10 on, the rule comes from the coupon ROW only:
--   metadata.first_paid_order_only = true. This file re-asserts the flag on
--   NEWCLIENT and stamps metadata.first_order_rule = '20261103_21', so the
--   admin coupons page (S6-T12) owns the flag from then on: an admin who
--   un-ticks «للطلب المدفوع الأول فقط» is never re-stamped by a re-run of
--   this file.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. Refuses to run unless public.coupons exists with its metadata column
--      (20260603_phase1_003). Nothing changes when it refuses.
--   2. NEWCLIENT (any case) without the marker: metadata gets
--      first_paid_order_only = true and first_order_rule = '20261103_21'.
--      Every other metadata key (owner_rules, rules, status …) is kept.
--      A row that already carries the marker is not touched (no updated_at
--      bump), whatever its flag says now. No other coupon is touched. Value,
--      minimum, cap, kinds, dates and active stay as they are.
--   3. The SELECT at the very end shows the result (the SQL editor hides
--      NOTICEs); ok is never NULL. No NEWCLIENT row at all is ok = t.
--
-- RUN ORDER — BEFORE the deploy of S6-T10 (the code that stops reading the
--   name). Why the other order changes no charge: 20261030_16 already stamped
--   NEWCLIENT first_paid_order_only = true on prod (run 2026-10-31), so the
--   new code reads the same rule; NEWCLIENT also excludes plan / library /
--   topup (and the membership in code), and single services are not sold
--   online, so NEWCLIENT discounts nothing that checkout sells today.
--   Safe with the OLD code live: it only adds metadata keys the old code
--   already reads (the flag) or ignores (the marker).
--
-- NOTE — do not re-run 20261030_16_pricing_owner_package.sql after an admin
--   has un-ticked the flag: its §3 re-stamps first_paid_order_only = true on
--   any NEWCLIENT whose flag is not 'true' (it predates the marker). Its
--   _verify block (verify:pricing_owner_package) accepts the un-ticked state
--   once this file's marker is present.
--
-- ROLLBACK (leaves the flag as it is; only the marker goes)
--   update public.coupons set metadata = metadata - 'first_order_rule'
--    where upper(code) = 'NEWCLIENT' and metadata->>'first_order_rule' = '20261103_21';
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisites ──────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.coupons') is null then
    raise exception '20261103_21: public.coupons does not exist — run 20260603_phase1_003_subscriptions_billing.sql first; nothing changed';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'metadata') then
    raise exception '20261103_21: public.coupons has no metadata column — run 20260603_phase1_003_subscriptions_billing.sql first; nothing changed';
  end if;
end $$;

-- ── 2. NEWCLIENT: the first-order rule lives in its row (٣٠٥) ────────────────
update public.coupons
   set metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('first_paid_order_only', true, 'first_order_rule', '20261103_21'),
       updated_at = now()
 where upper(code) = 'NEWCLIENT'
   and coalesce(metadata->>'first_order_rule', '') <> '20261103_21';

commit;

-- ── 3. The check you can see in the SQL editor ───────────────────────────────
-- Expect one row: NEWCLIENT, its flag (true unless an admin un-ticked it
-- after this file ran), the marker, ok = t. No NEWCLIENT row: code null, ok = t.
select v.code as expected_code,
       k.code,
       k.metadata->>'first_paid_order_only' as first_paid_order_only,
       k.metadata->>'first_order_rule'      as first_order_rule,
       coalesce(k.code is null or k.metadata->>'first_order_rule' = '20261103_21', false) as ok
  from (values ('NEWCLIENT')) as v(code)
  left join public.coupons k on upper(k.code) = v.code;
