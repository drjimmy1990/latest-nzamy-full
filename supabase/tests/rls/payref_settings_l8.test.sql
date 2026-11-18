-- payref_settings_l8.test.sql — proves 20261128_10 (batch l8 payref: the
-- founder top-up discount runs for the membership year, the extra firm seat
-- price is stored only, the individual top-up minimum is 100) and its
-- _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- migration runs TWICE with an admin's edits between the runs (the
-- between-runs prelude also checks what the first run seeded); the _verify
-- block runs before the migration (it must answer false without an error)
-- and after the second run. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l8_payref_block.sql
--   sed -n '/^-- >>> verify:l8_payref/,/^-- <<< verify:l8_payref/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260627_platform_settings.sql \
--     $R/prelude_payref_l8_before.sql \
--     "$B" \
--     $M/20261128_10_payref_settings.sql \
--     $R/prelude_payref_l8_between_runs.sql \
--     $M/20261128_10_payref_settings.sql \
--     "$B" \
--     $R/payref_settings_l8.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261128_10
-- files and the between-runs prelude → "T0 FAIL".

do $$ begin
  if not exists (select 1 from public.platform_settings where key = 'founder_topup_discount_expires') then
    raise exception 'T0 FAIL: founder_topup_discount_expires missing (20261128_10 not applied)';
  end if;
end $$;

-- T1 an admin's edits between the runs survive the re-run
do $$ begin
  if (select value from public.platform_settings where key = 'founder_topup_discount_expires') <> '{"until": "2027-12-31"}'::jsonb then
    raise exception 'T1 FAIL: the re-run overwrote the admin''s discount length';
  end if;
  if (select value ->> 'individual' from public.platform_settings where key = 'min_topup_by_account_type') <> '150' then
    raise exception 'T1 FAIL: the re-run overwrote the admin''s individual minimum';
  end if;
  if (select value from public.platform_settings where key = 'firm_extra_seat_price_sar') <> '{"sar": 450}'::jsonb then
    raise exception 'T1 FAIL: the re-run overwrote the extra-seat price';
  end if;
  raise notice 'payref_settings_l8: T0-T1 PASS';
end $$;

-- T2 the l7 professional minimums are kept; the rate is untouched; no «lifetime» description
do $$ declare v jsonb; begin
  select value into v from public.platform_settings where key = 'min_topup_by_account_type';
  if v ->> 'lawyer' <> '500' or v ->> 'firm' <> '500' or v ->> 'corporate' <> '500' or v ->> 'provider' <> '500' then
    raise exception 'T2 FAIL: the professional minimums changed: %', v;
  end if;
  if (select value from public.platform_settings where key = 'founder_topup_discount_bps') <> '1500'::jsonb then
    raise exception 'T2 FAIL: the discount rate was touched';
  end if;
  if exists (select 1 from public.platform_settings where strpos(coalesce(description, ''), 'مدى الحياة') > 0) then
    raise exception 'T2 FAIL: a description still says the discount is lifetime';
  end if;
  raise notice 'payref_settings_l8: T2 PASS';
end $$;
