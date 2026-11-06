-- newclient_first_order_flag.test.sql — proves 20261103_21 (owner-free wave,
-- S6-T9; owner ٣٠٥), its _verify block (verify:s6_newclient_flag) and the
-- carve-out it needs in verify:pricing_owner_package.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The coupons
-- chain of pricing_owner_package.test.sql, then 20261030_16 (the prod state:
-- NEWCLIENT stamped, no marker), then 20261103_21 THREE times with preludes
-- between. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   P=$D/verify_pricing_owner_package.sql; N=$D/verify_s6_newclient_flag.sql
--   sed -n '/^-- >>> verify:pricing_owner_package/,/^-- <<< verify:pricing_owner_package/p' $M/_verify.sql > "$P"
--   sed -n '/^-- >>> verify:s6_newclient_flag/,/^-- <<< verify:s6_newclient_flag/p' $M/_verify.sql > "$N"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261026_10_billing_cycles.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     $M/20261030_16_pricing_owner_package.sql \
--     $R/prelude_newclient_flag_before.sql \
--     $M/20261103_21_newclient_first_order_flag.sql \
--     $R/prelude_newclient_flag_untick.sql \
--     $M/20261103_21_newclient_first_order_flag.sql \
--     "$P" "$N" \
--     $R/prelude_newclient_flag_absent.sql \
--     $M/20261103_21_newclient_first_order_flag.sql \
--     "$N" \
--     $R/newclient_first_order_flag.test.sql
-- What each prelude asserts:
--   before — the starting state (stamped by 20261030_16, no marker; owner_rules
--            and rules present), adds metadata.status, snapshots NZAMY50;
--   untick — (a) flag true + marker, (b) owner_rules / rules / status kept;
--            then an admin un-ticks the flag (S6-T12);
--   absent — (c) the second run kept the un-tick (same xmin / updated_at),
--            (d) NZAMY50 untouched; then NEWCLIENT is deleted.
-- Between them, "$P" and "$N" run over the UN-TICKED row and must pass: the
-- un-tick is a legitimate state once the marker is there. The third run and
-- "$N" run with no NEWCLIENT row (e). Each 20261103_21 run prints ok = t.
--
-- NEGATIVE CONTROLS (each must FAIL; all checked 2026-11-03):
--   (1) without 20261103_21: the chain up to prelude_newclient_flag_before,
--       then "$N" → "_verify: 20261103_21 — NEWCLIENT has no first_order_rule
--       marker … Run 20261103_21 …"; and the chain with every 20261103_21 run
--       removed → "T1 FAIL (a)" in prelude_newclient_flag_untick.
--   (2) the marker guard bites: each 20261103_21 run replaced by a copy
--       without the marker condition —
--         U=$D/nomarker.sql
--         sed "/and coalesce(metadata->>'first_order_rule', '') <> '20261103_21';/d; s/^ where upper(code) = 'NEWCLIENT'\$/ where upper(code) = 'NEWCLIENT';/" \
--           $M/20261103_21_newclient_first_order_flag.sql > "$U"
--       → "T3 FAIL (c): the second run re-stamped the admin's un-tick".
--   (3) the carve-out is needed: "$P" cut from the _verify.sql of db4a1472
--       (git show db4a1472:supabase/migrations/_verify.sql) in place of "$P"
--       → "_verify: 20261030_16 — NEWCLIENT is not stamped first_paid_order_only".
--
-- Every assertion RAISES on failure.

-- T5 (e) the third run, with no NEWCLIENT row, created none and its final
-- SELECT's expression is ok = t (the exact expression of the file)
do $$
declare ok boolean;
begin
  if exists (select 1 from public.coupons where upper(code) = 'NEWCLIENT') then
    raise exception 'T5 FAIL (e): a run with no NEWCLIENT row created one';
  end if;
  select coalesce(k.code is null or k.metadata->>'first_order_rule' = '20261103_21', false) into ok
    from (values ('NEWCLIENT')) as v(code)
    left join public.coupons k on upper(k.code) = v.code;
  if ok is distinct from true then
    raise exception 'T5 FAIL (e): the final SELECT says ok = % with no NEWCLIENT row', ok;
  end if;
  raise notice 'T5 PASS (e): no NEWCLIENT row → nothing created, ok = t';
end $$;

-- T6 no coupon other than NEWCLIENT ever got the marker
do $$
declare n int;
begin
  select count(*) into n from public.coupons where metadata ? 'first_order_rule';
  if n > 0 then
    raise exception 'T6 FAIL: % other coupon(s) carry first_order_rule', n;
  end if;
  raise notice 'T6 PASS: no other coupon carries the marker';
end $$;

drop table if exists public._t_nz50_before;
drop table if exists public._t_nc_unticked;
