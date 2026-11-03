-- contract_draft_points_price.test.sql — proves 20261102_11 (Wave 1 safety,
-- Task 6 item G): contract drafting is priced in points, not «مشمول».
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). Same seed
-- extraction as retire_cancelled_prices.test.sql (the whole of 20260518
-- cannot run over stubs.sql). 20261102_10 runs first (its own before-prelude
-- proves the seed and adds a metadata key both migrations must keep); then
-- 20261102_11 runs TWICE and the second run must change nothing. From the
-- repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   F=$D/admin_pricing_catalog_20260518.sql
--   sed -n -e '/^create table if not exists public.admin_pricing_catalog/,/^);/p' \
--          -e '/^alter table public.admin_pricing_catalog enable/p' \
--          -e '/^create policy "public read enabled individual pricing"/,/;/p' \
--          -e '/^insert into public.admin_pricing_catalog/,/updated_at = now();/p' \
--          $M/20260518_client_workflow_backend_ready.sql > "$F"
--   bash $R/run.sh \
--     "$F" \
--     $R/prelude_retire_cancelled_prices_before.sql \
--     $M/20261102_10_retire_cancelled_prices.sql \
--     $M/20261102_11_contract_draft_points_price.sql \
--     $R/prelude_contract_draft_points_between_runs.sql \
--     $M/20261102_11_contract_draft_points_price.sql \
--     $R/contract_draft_points_price.test.sql
-- Each 20261102_11 run prints its final SELECT: one row, ok = t.
--
-- NEGATIVE CONTROLS (each must FAIL):
--   (a) the chain without both 20261102_11 files → "BETWEEN FAIL …";
--   (b) as (a) without the between-prelude too → "T0 FAIL …";
--   (c) 20261102_11 alone (no "$F") → "20261102_11:
--       public.admin_pricing_catalog is missing …".
-- All three checked 2026-11-02.
--
-- Every assertion RAISES on failure.

-- T0 the chain ran
do $$
begin
  if to_regclass('public._draft_points_snapshot') is null then
    raise exception 'T0 FAIL: public._draft_points_snapshot is missing (between-runs prelude not in the chain?)';
  end if;
end $$;

-- T1 contract-draft: points, the tool's price alone, no plan claim, every
-- other key and column kept
do $$
declare
  r record;
begin
  select * into r from public.admin_pricing_catalog where service_id = 'contract-draft';
  if r.price_mode is distinct from 'points' then raise exception 'T1 FAIL: contract-draft price_mode %', r.price_mode; end if;
  if r.metadata->>'priceNote' is distinct from '٥٠٠ نقطة للعقد' then
    raise exception 'T1 FAIL: contract-draft priceNote %', r.metadata->>'priceNote';
  end if;
  if r.metadata ? 'includedByPlan' then
    raise exception 'T1 FAIL: contract-draft still claims a plan: %', r.metadata->>'includedByPlan';
  end if;
  if r.metadata ? 'tag' then raise exception 'T1 FAIL: the tag came back'; end if;
  if r.metadata->>'route' is distinct from '/ai/contract-drafter'
     or r.metadata->>'aiPowered' is distinct from 'true'
     or r.metadata->>'description' is distinct from 'kept by the migration' then
    raise exception 'T1 FAIL: contract-draft lost a metadata key: %', r.metadata;
  end if;
  if r.base_price <> 0 or r.requires_payment or not r.enabled or r.audience <> 'individual' then
    raise exception 'T1 FAIL: contract-draft other columns changed: price % pay % enabled % audience %',
      r.base_price, r.requires_payment, r.enabled, r.audience;
  end if;
  raise notice 'T1 PASS: contract-draft points, «٥٠٠ نقطة للعقد», no includedByPlan, keys kept';
end $$;

-- T2 contract-review keeps what 20261102_10 wrote
do $$
begin
  if (select base_price from public.admin_pricing_catalog where service_id = 'contract-review') <> 600
     or (select price_mode from public.admin_pricing_catalog where service_id = 'contract-review') <> 'starting_from' then
    raise exception 'T2 FAIL: contract-review changed';
  end if;
  raise notice 'T2 PASS: contract-review untouched (600, starting_from)';
end $$;

-- T3 idempotence: the second run wrote no row
do $$
declare
  n int;
begin
  select count(*) into n
    from public._draft_points_snapshot s
    join public.admin_pricing_catalog c using (service_id)
   where c.xmin::text <> s.row_xmin or c.updated_at <> s.updated_at;
  if n <> 0 then raise exception 'T3 FAIL: the second run rewrote % row(s)', n; end if;
  if (select count(*) from public._draft_points_snapshot) <> (select count(*) from public.admin_pricing_catalog) then
    raise exception 'T3 FAIL: the row count changed between runs';
  end if;
  raise notice 'T3 PASS: the second run changed nothing (% rows unchanged)', (select count(*) from public.admin_pricing_catalog);
end $$;

-- T4 no other row was touched: the other «included» row keeps its seed
-- (they are reported to the owner, not changed here)
do $$
begin
  if (select price_mode from public.admin_pricing_catalog where service_id = 'contract-analyze') <> 'included'
     or (select metadata->>'includedByPlan' from public.admin_pricing_catalog where service_id = 'contract-analyze') is distinct from 'ai_individual' then
    raise exception 'T4 FAIL: a row outside contract-draft changed';
  end if;
  raise notice 'T4 PASS: the neighbouring rows are untouched';
end $$;

drop table public._draft_points_snapshot;
