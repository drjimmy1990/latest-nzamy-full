-- retire_cancelled_prices.test.sql — proves 20261102_10 (Wave 1 safety,
-- Task 5; owner package of 1 Nov 2026, q327).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- migration runs TWICE; the second run must change nothing. The whole of
-- 20260518 cannot run over stubs.sql (it re-creates service_requests'
-- policies), so its admin_pricing_catalog part — the table, RLS, the public
-- policy and the 27-row seed, verbatim — is cut out with sed, like the
-- _verify blocks of billing_cycles.test.sql. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   F=$D/admin_pricing_catalog_20260518.sql; P=$D/retire_ok_probe.sql
--   sed -n -e '/^create table if not exists public.admin_pricing_catalog/,/^);/p' \
--          -e '/^alter table public.admin_pricing_catalog enable/p' \
--          -e '/^create policy "public read enabled individual pricing"/,/;/p' \
--          -e '/^insert into public.admin_pricing_catalog/,/updated_at = now();/p' \
--          $M/20260518_client_workflow_backend_ready.sql > "$F"
--   { echo "begin;"
--     echo "update public.admin_pricing_catalog set metadata = metadata - 'priceNote' where service_id = 'contract-review';"
--     echo "select (s.ok is null) as probe_ok_null, coalesce(s.ok::text, 'null') as probe_ok from ("
--     sed -n '/^select e.service_id/,/order by e.service_id/p' $M/20261102_10_retire_cancelled_prices.sql | sed '/order by e.service_id/d'
--     echo ") s where s.service_id = 'contract-review' \\gset"
--     echo "rollback;"
--     echo "create table public._retire_ok_probe as select :'probe_ok_null'::boolean as ok_null, :'probe_ok'::text as ok;"
--   } > "$P"
--   bash $R/run.sh \
--     "$F" \
--     $R/prelude_retire_cancelled_prices_before.sql \
--     $M/20261102_10_retire_cancelled_prices.sql \
--     $R/prelude_retire_cancelled_prices_between_runs.sql \
--     $M/20261102_10_retire_cancelled_prices.sql \
--     "$P" \
--     $R/retire_cancelled_prices.test.sql
-- Why each link: "$F" creates admin_pricing_catalog and seeds the rows
-- (99 + «الأكثر طلبا» / 800); the before-prelude proves that gap and adds a
-- metadata key the migration must keep; the between-prelude snapshots every
-- row's xmin and updated_at. Each migration run prints its final SELECT:
-- both rows ok = t.
--
-- NEGATIVE CONTROLS (each must FAIL; all three checked 2026-11-02):
--   (a) the chain without both 20261102_10 files and the between-prelude
--       → "T0 FAIL: … _retire_prices_snapshot is missing …";
--   (b) as (a) but with the between-prelude kept → "BETWEEN FAIL: the first
--       run did not write the new prices";
--   (c) the chain without "$F" and the before-prelude → the migration
--       raises "20261102_10: public.admin_pricing_catalog is missing …".
-- The migration's final SELECT run alone on the unmigrated seed shows both
-- rows ok = f (99 + tag, 800).
--   (d) "$P" cut from 6d4c5021's migration (before the null-safe ok) → T5 FAIL
--       "… reads ok = null (null: t) …".
--
-- Every assertion RAISES on failure.

-- T0 the chain ran
do $$
begin
  if to_regclass('public._retire_prices_snapshot') is null then
    raise exception 'T0 FAIL: public._retire_prices_snapshot is missing (between-runs prelude not in the chain?)';
  end if;
end $$;

-- T1 contract-draft: no riyal amount, the tool's points, no popularity tag,
-- every other key and column kept
do $$
declare
  r record;
begin
  select * into r from public.admin_pricing_catalog where service_id = 'contract-draft';
  if r.base_price <> 0 then raise exception 'T1 FAIL: contract-draft base_price %', r.base_price; end if;
  if r.metadata->>'priceNote' is distinct from 'أو ٥٠٠ نقطة للعقد' then
    raise exception 'T1 FAIL: contract-draft priceNote %', r.metadata->>'priceNote';
  end if;
  if r.metadata ? 'tag' then raise exception 'T1 FAIL: contract-draft still carries tag %', r.metadata->>'tag'; end if;
  if r.metadata->>'route' is distinct from '/ai/contract-drafter'
     or r.metadata->>'includedByPlan' is distinct from 'ai_individual'
     or r.metadata->>'description' is distinct from 'kept by the migration' then
    raise exception 'T1 FAIL: contract-draft lost a metadata key: %', r.metadata;
  end if;
  if r.price_mode <> 'included' or r.requires_payment or not r.enabled or r.audience <> 'individual' then
    raise exception 'T1 FAIL: contract-draft other columns changed: mode % pay % enabled % audience %',
      r.price_mode, r.requires_payment, r.enabled, r.audience;
  end if;
  raise notice 'T1 PASS: contract-draft 0, «أو ٥٠٠ نقطة للعقد», no tag, keys kept';
end $$;

-- T2 contract-review: 600 for individuals, the new note, every other key kept
do $$
declare
  r record;
begin
  select * into r from public.admin_pricing_catalog where service_id = 'contract-review';
  if r.base_price <> 600 then raise exception 'T2 FAIL: contract-review base_price %', r.base_price; end if;
  if r.metadata->>'priceNote' is distinct from 'سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد' then
    raise exception 'T2 FAIL: contract-review priceNote %', r.metadata->>'priceNote';
  end if;
  if r.metadata->>'route' is distinct from '/dashboard/client/requests/new?type=contract-review'
     or r.metadata->>'humanService' is distinct from 'true'
     or r.metadata->>'description' is distinct from 'kept by the migration' then
    raise exception 'T2 FAIL: contract-review lost a metadata key: %', r.metadata;
  end if;
  if r.price_mode <> 'starting_from' or not r.requires_payment or not r.enabled then
    raise exception 'T2 FAIL: contract-review other columns changed';
  end if;
  raise notice 'T2 PASS: contract-review 600, the individuals note, keys kept';
end $$;

-- T3 idempotence: the second run wrote no row (xmin and updated_at unchanged
-- for EVERY row of the table, the two contract rows included)
do $$
declare
  n int;
begin
  select count(*) into n
    from public._retire_prices_snapshot s
    join public.admin_pricing_catalog c using (service_id)
   where c.xmin::text <> s.row_xmin or c.updated_at <> s.updated_at;
  if n <> 0 then raise exception 'T3 FAIL: the second run rewrote % row(s)', n; end if;
  if (select count(*) from public._retire_prices_snapshot) <> (select count(*) from public.admin_pricing_catalog) then
    raise exception 'T3 FAIL: the row count changed between runs';
  end if;
  raise notice 'T3 PASS: the second run changed nothing (% rows unchanged)', (select count(*) from public.admin_pricing_catalog);
end $$;

-- T4 no other row was touched: the neighbouring seeded rows keep their
-- 20260518 values
do $$
begin
  if (select base_price from public.admin_pricing_catalog where service_id = 'contract-analyze') <> 79
     or (select metadata->>'priceNote' from public.admin_pricing_catalog where service_id = 'contract-analyze') is distinct from 'أو 79 ر.س للتحليل المفصل'
     or (select base_price from public.admin_pricing_catalog where service_id = 'legal-research') <> 800
     or (select base_price from public.admin_pricing_catalog where service_id = 'second-opinion') <> 600 then
    raise exception 'T4 FAIL: a row outside the two contract rows changed';
  end if;
  raise notice 'T4 PASS: the neighbouring rows are untouched';
end $$;

-- T5 the migration's final SELECT never answers ok = NULL: "$P" ran it (cut
-- from the migration file) with contract-review's priceNote removed inside a
-- rolled-back transaction, so T3's xmin check above is unaffected.
do $$
declare
  r record;
begin
  if to_regclass('public._retire_ok_probe') is null then
    raise exception 'T5 FAIL: public._retire_ok_probe is missing ("$P" not in the chain?)';
  end if;
  select * into r from public._retire_ok_probe;
  if r.ok_null or r.ok is distinct from 'false' then
    raise exception 'T5 FAIL: a row with no priceNote reads ok = % (null: %), expected false', r.ok, r.ok_null;
  end if;
  raise notice 'T5 PASS: a row with no priceNote reads ok = false, not NULL';
end $$;

drop table public._retire_prices_snapshot;
drop table public._retire_ok_probe;
