-- coupon_business_role.test.sql — proves 20261103_22 (owner-free wave,
-- S6-T11) and its _verify block (verify:s6_coupon_business_role).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The coupons
-- chain of newclient_first_order_flag.test.sql, then 20261103_22 TWICE. From
-- the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   V=$D/verify_s6_coupon_business_role.sql
--   sed -n '/^-- >>> verify:s6_coupon_business_role/,/^-- <<< verify:s6_coupon_business_role/p' $M/_verify.sql > "$V"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261026_10_billing_cycles.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     $M/20261030_16_pricing_owner_package.sql \
--     $R/prelude_coupon_business_role_before.sql \
--     $M/20261103_22_coupon_business_role.sql \
--     $R/prelude_coupon_business_role_between.sql \
--     $M/20261103_22_coupon_business_role.sql \
--     "$V" \
--     $R/coupon_business_role.test.sql
-- The before-prelude inserts three coupons as the old page saved them
-- ({business,lawyer}, {business,corporate}, {individual}) and snapshots every
-- row; the between-prelude snapshots again after the first run. Each run
-- prints left_business = 0, ok = t.
--
-- NEGATIVE CONTROLS (each must FAIL; checked 2026-11-03):
--   (1) without either 20261103_22 run: "$V" raises "_verify: 20261103_22 —
--       coupon(s) T22BIZLAW, T22BOTH still target the user type 'business' …";
--   (2) control (1)'s chain — no 20261103_22 run at all — with "$V" left out
--       too, so the test itself runs → "T1 FAIL: T22BIZLAW targets
--       {business,lawyer} …";
--   (3) the xmin checks can fail: the full chain, but with both 20261103_22
--       runs replaced by a copy whose UPDATE has no WHERE (every row
--       rewritten, a no-op array_replace on rows without 'business'):
--         sed "s/^ where 'business' = any (eligible_user_types);/;/" \
--           $M/20261103_22_coupon_business_role.sql > $D/22_nowhere.sql
--       → "T2 FAIL: T22INDIV was rewritten (xmin … → …)". (T3 would fail the
--       same way; T2 stops the script first.)
--
-- Every assertion RAISES on failure.

-- T1 {business, lawyer} → {corporate, lawyer}; {business, corporate} → {corporate}
do $$
declare a text[]; b text[];
begin
  select eligible_user_types into a from public.coupons where code = 'T22BIZLAW';
  select eligible_user_types into b from public.coupons where code = 'T22BOTH';
  if a is distinct from array['corporate', 'lawyer']::text[] then
    raise exception 'T1 FAIL: T22BIZLAW targets %, expected {corporate,lawyer}', a;
  end if;
  if b is distinct from array['corporate']::text[] then
    raise exception 'T1 FAIL: T22BOTH targets %, expected {corporate} (no duplicate)', b;
  end if;
  if exists (select 1 from public.coupons where 'business' = any (eligible_user_types)) then
    raise exception 'T1 FAIL: a coupon still targets business';
  end if;
  raise notice 'T1 PASS: business → corporate, order kept, no duplicate';
end $$;

-- T2 a row without 'business' is untouched by either run
do $$
declare before_r record; now_r record;
begin
  select * into before_r from public._t22_before where code = 'T22INDIV';
  select code, xmin::text as x, eligible_user_types, updated_at into now_r from public.coupons where code = 'T22INDIV';
  if now_r.x is distinct from before_r.x or now_r.updated_at is distinct from before_r.updated_at
     or now_r.eligible_user_types is distinct from before_r.eligible_user_types then
    raise exception 'T2 FAIL: T22INDIV was rewritten (xmin % → %)', before_r.x, now_r.x;
  end if;
  -- the owner's two codes (eligible_user_types {}) too
  if exists (select 1 from public._t22_before b join public.coupons k using (code)
              where k.code in ('NZAMY50', 'NEWCLIENT') and b.x is distinct from k.xmin::text) then
    raise exception 'T2 FAIL: NZAMY50 / NEWCLIENT were rewritten';
  end if;
  raise notice 'T2 PASS: rows without business untouched (same xmin and updated_at)';
end $$;

-- T3 the second run changed nothing (same xmin on every row)
do $$
declare n int;
begin
  select count(*) into n
    from public._t22_between b join public.coupons k using (code)
   where b.x is distinct from k.xmin::text;
  if n > 0 then
    raise exception 'T3 FAIL: the second run rewrote % row(s)', n;
  end if;
  raise notice 'T3 PASS: a second run is a no-op (same xmin on every row)';
end $$;

-- T4 the file's final SELECT says ok = t (its exact expression)
do $$
declare ok boolean;
begin
  select (count(*) filter (where 'business' = any (eligible_user_types)) = 0) into ok from public.coupons;
  if ok is distinct from true then raise exception 'T4 FAIL: ok = %', ok; end if;
  raise notice 'T4 PASS: left_business = 0, ok = t';
end $$;

drop table if exists public._t22_before;
drop table if exists public._t22_between;
