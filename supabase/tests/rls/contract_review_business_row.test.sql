-- contract_review_business_row.test.sql — proves 20261103_20 (owner-free
-- wave, S6-T1; owner package of 1 Nov 2026 §6.2.1d, q327).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- admin_pricing_catalog part of 20260518 — the table, RLS, the public policy
-- and the 27-row seed, verbatim — is cut out with sed exactly like the header
-- of retire_cancelled_prices.test.sql. The migration runs THREE times: the
-- second run must change nothing, the third must keep an admin's edit.
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   F=$D/admin_pricing_catalog_20260518.sql
--   sed -n -e '/^create table if not exists public.admin_pricing_catalog/,/^);/p' \
--          -e '/^alter table public.admin_pricing_catalog enable/p' \
--          -e '/^create policy "public read enabled individual pricing"/,/;/p' \
--          -e '/^insert into public.admin_pricing_catalog/,/updated_at = now();/p' \
--          $M/20260518_client_workflow_backend_ready.sql > "$F"
--   bash $R/run.sh \
--     "$F" \
--     $M/20261102_10_retire_cancelled_prices.sql \
--     $M/20261102_11_contract_draft_points_price.sql \
--     $M/20261103_20_contract_review_business_row.sql \
--     $R/prelude_contract_review_business_between_runs.sql \
--     $M/20261103_20_contract_review_business_row.sql \
--     $R/prelude_contract_review_business_admin_edit.sql \
--     $M/20261103_20_contract_review_business_row.sql \
--     $R/contract_review_business_row.test.sql
-- Why each link: the between-runs prelude asserts the first run wrote the
-- row (a, at 800) and snapshots every row's xmin and updated_at; the
-- admin-edit prelude asserts the second run wrote NOTHING (c), then plays an
-- admin who sets the business price to 850 before the third run (d). Each
-- migration run prints its final SELECT: ok = t.
-- The grants anon needs come from stubs.sql's default privileges (Supabase's
-- defaults), so (e) measures RLS, not a missing grant — and T5's positive
-- control proves anon does read an enabled individual row.
--
-- NEGATIVE CONTROLS (each must FAIL):
--   (1) the chain without the three 20261103_20 runs and both preludes
--       ("$F" _10 _11 this-file) → "T1 FAIL (a): … 0 row(s) …";
--   (2) the chain without "$F" → the migration raises
--       "20261103_20: public.admin_pricing_catalog is missing …";
--   (3) the idempotence guard bites: the full chain with each 20261103_20 run
--       replaced by a copy whose ON CONFLICT DO NOTHING is DO UPDATE —
--         U=$D/upd.sql
--         sed 's/on conflict (service_id) do nothing;/on conflict (service_id) do update set base_price = excluded.base_price, updated_at = now();/' \
--           $M/20261103_20_contract_review_business_row.sql > "$U"
--       → "T3 FAIL (c): the second run rewrote 1 row(s)".
--   All three checked 2026-11-03.
--
-- Every assertion RAISES on failure.

-- T1 (a) the business row, its identity and its note (price checked as 850
-- here — the admin edit of T4; the 800 of the first run is asserted by the
-- between-runs prelude)
do $$
declare
  n int;
  r record;
begin
  select count(*) into n from public.admin_pricing_catalog where service_id = 'contract-review-business';
  if n <> 1 then raise exception 'T1 FAIL (a): % row(s) contract-review-business, expected 1', n; end if;
  select * into r from public.admin_pricing_catalog where service_id = 'contract-review-business';
  if r.audience is distinct from 'corporate'
     or r.metadata->>'variantOf' is distinct from 'contract-review'
     or r.metadata->>'priceNote' is distinct from 'سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد' then
    raise exception 'T1 FAIL (a): audience % variantOf % note %', r.audience, r.metadata->>'variantOf', r.metadata->>'priceNote';
  end if;
  if r.category_id <> 'contracts' or r.label_ar <> 'مراجعة من محام متخصص' or r.price_mode <> 'starting_from'
     or r.receiver_type <> 'lawyer' or r.beta_visibility <> 'public' or not r.requires_payment or not r.enabled
     or r.metadata->>'route' is distinct from '/dashboard/client/requests/new?type=contract-review'
     or r.metadata->>'requestType' is distinct from 'service'
     or (r.metadata->>'humanService')::boolean is distinct from true
     or r.metadata->>'addedBy' is distinct from '20261103_20' then
    raise exception 'T1 FAIL (a): other columns: %', row_to_json(r);
  end if;
  raise notice 'T1 PASS: one corporate contract-review-business row, variantOf contract-review';
end $$;

-- T0 the chain ran (after T1, so the bare failing run fails on (a))
do $$
begin
  if to_regclass('public._crb_snapshot') is null or to_regclass('public._crb_second_run') is null then
    raise exception 'T0 FAIL: the between-runs / admin-edit preludes are not in the chain';
  end if;
end $$;

-- T2 (b) the individuals' row is untouched
do $$
declare r record;
begin
  select * into r from public.admin_pricing_catalog where service_id = 'contract-review';
  if r.audience is distinct from 'individual' or r.base_price is distinct from 600::numeric
     or r.metadata->>'priceNote' is distinct from 'سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد' then
    raise exception 'T2 FAIL (b): contract-review audience % price % note %', r.audience, r.base_price, r.metadata->>'priceNote';
  end if;
  raise notice 'T2 PASS: contract-review stays individual at 600';
end $$;

-- T3 (c) the second run changed nothing (recorded by the admin-edit prelude)
do $$
begin
  if (select changed from public._crb_second_run) <> 0 then
    raise exception 'T3 FAIL (c): the second run rewrote % row(s)', (select changed from public._crb_second_run);
  end if;
  raise notice 'T3 PASS: the second run wrote nothing';
end $$;

-- T4 (d) an admin's edit survives a re-run
do $$
declare p numeric;
begin
  select base_price into p from public.admin_pricing_catalog where service_id = 'contract-review-business';
  if p is distinct from 850::numeric then
    raise exception 'T4 FAIL (d): the third run put % back over the admin''s 850', p;
  end if;
  raise notice 'T4 PASS: the admin''s 850 survived the third run';
end $$;

-- T5 (e) anon cannot read the row; the public policy is unchanged.
-- Positive control first: anon does read an enabled individual row.
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.admin_pricing_catalog where service_id = 'contract-review';
  if n <> 1 then raise exception 'T5 FAIL (control): anon reads % contract-review row(s), expected 1', n; end if;
  select count(*) into n from public.admin_pricing_catalog where service_id = 'contract-review-business';
  if n <> 0 then raise exception 'T5 FAIL (e): anon reads % contract-review-business row(s), expected 0', n; end if;
  raise notice 'T5 PASS: anon reads the individual row and not the corporate one';
end $$;
reset role;

do $$
declare n int;
begin
  select count(*) into n from pg_policies where tablename = 'admin_pricing_catalog';
  if n <> 1 or not exists (select 1 from pg_policies where tablename = 'admin_pricing_catalog'
                                                      and policyname = 'public read enabled individual pricing') then
    raise exception 'T5 FAIL (e): admin_pricing_catalog has % policies; expected only the 20260518 public one', n;
  end if;
end $$;

-- T6 (f) 27 seed rows + 1
do $$
declare n int;
begin
  select count(*) into n from public.admin_pricing_catalog;
  if n <> 28 then raise exception 'T6 FAIL (f): % rows, expected 28 (27 seed + 1)', n; end if;
  raise notice 'T6 PASS: 28 rows';
end $$;
