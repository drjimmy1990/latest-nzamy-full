-- =============================================================================
-- Migration: 20261103_22_coupon_business_role.sql
-- =============================================================================
-- PURPOSE (owner-free wave, S6-T11; slice A §6.2.3)
--   The admin coupons page stored its audience «الشركات» as the user type
--   'business' in coupons.eligible_user_types. No profile has that type —
--   companies are profiles.user_type = 'corporate' (the value
--   subscription_plans.audience uses too) — so a coupon meant for companies
--   never matched one (couponRules.evaluateCoupon compares the buyer's
--   user_type with the list). From the deploy of S6-T11 the API stores
--   'corporate' (couponAdminRules.couponRoleToUserType). This file renames
--   the rows saved before that.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. Refuses to run unless public.coupons has eligible_user_types
--      (20260603_phase1_003). Nothing changes when it refuses.
--   2. Every row holding 'business': 'business' becomes 'corporate' (or is
--      dropped when the row already holds 'corporate', so no duplicate).
--      Rows without 'business' are not touched (no updated_at bump); nothing
--      else of any coupon changes.
--   3. Two SELECTs at the very end (the SQL editor hides NOTICEs): the count
--      still holding 'business' with ok (never NULL), then the codes that now
--      target 'corporate'.
--
-- RUN ORDER — AFTER the deploy of S6-T11 / S6-T12. Before the deploy the old
--   coupons page maps 'corporate' to no role and then to ["client"], so an
--   admin edit there would narrow such a coupon to individuals. Once the new
--   page is live the rename is safe at any time. Until it runs, the new code
--   keeps working: the page still shows a leftover 'business' row as
--   «الشركات» and a save that does not touch the audience leaves it as it is;
--   such a row matches no company — exactly as today.
--
-- ROLLBACK — none needed: 'business' matched no profile, so the old value
--   granted nothing. (To restore it anyway: array_replace(eligible_user_types,
--   'corporate', 'business') on the codes the second SELECT listed.)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisites ──────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.coupons') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'coupons' and column_name = 'eligible_user_types') then
    raise exception '20261103_22: public.coupons.eligible_user_types does not exist — run 20260603_phase1_003_subscriptions_billing.sql first; nothing changed';
  end if;
end $$;

-- ── 2. «الشركات» targets the companies' user type ────────────────────────────
update public.coupons
   set eligible_user_types = case
         when 'corporate' = any (eligible_user_types) then array_remove(eligible_user_types, 'business')
         else array_replace(eligible_user_types, 'business', 'corporate')
       end,
       updated_at = now()
 where 'business' = any (eligible_user_types);

commit;

-- ── 3. The check you can see in the SQL editor ───────────────────────────────
-- First the codes now holding 'corporate'. The last result, the one the editor
-- shows, is one row: left_business = 0, ok = t.
select code, eligible_user_types, active
  from public.coupons
 where 'corporate' = any (eligible_user_types)
 order by code;

select count(*) filter (where 'business' = any (eligible_user_types)) as left_business,
       (count(*) filter (where 'business' = any (eligible_user_types)) = 0) as ok
  from public.coupons;
