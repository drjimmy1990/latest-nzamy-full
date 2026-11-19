-- l9_terms.test.sql — proves 20261129_30 (batch l9 terms: the minimum top-up
-- is 50 for every account type; the founder discount's descriptions say
-- «top-ups and any plan») and its _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The l7 state
-- (prelude_payref_l8_before) and 20261128_10 (l8: individual 100) come first,
-- as on production. The _verify block runs before 20261129_30 (it must answer
-- false without an error) and after the second run. From the repo root, in
-- Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l9_terms_block.sql
--   sed -n '/^-- >>> verify:l9_terms/,/^-- <<< verify:l9_terms/p' $M/_verify.sql | tr -d '\r' > "$B"
--   bash $R/run.sh \
--     $M/20260627_platform_settings.sql \
--     $R/prelude_payref_l8_before.sql \
--     $M/20261128_10_payref_settings.sql \
--     "$B" \
--     $M/20261129_30_l9_terms_pricing.sql \
--     $R/prelude_l9_terms_between_runs.sql \
--     $M/20261129_30_l9_terms_pricing.sql \
--     "$B" \
--     $R/l9_terms.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261129_30
-- files and the between-runs prelude → "T0 FAIL".

-- T0 every account type is 50 (the l8 state was 500 / individual 100)
do $$ begin
  if (select value ->> 'lawyer' from public.platform_settings where key = 'min_topup_by_account_type') is distinct from '50'
     or (select value ->> 'individual' from public.platform_settings where key = 'min_topup_by_account_type') is distinct from '50' then
    raise exception 'T0 FAIL: the minimum top-up is not 50 (20261129_30 not applied)';
  end if;
end $$;

-- T1 the re-run overwrote the admin's 999 and also set the unknown key to 50
do $$ begin
  if (select value from public.platform_settings where key = 'min_topup_by_account_type')
     <> '{"lawyer": 50, "firm": 50, "corporate": 50, "micro": 50, "government": 50, "ngo": 50, "provider": 50, "individual": 50, "future_type": 50}'::jsonb then
    raise exception 'T1 FAIL: the re-run left a value other than 50: %',
      (select value from public.platform_settings where key = 'min_topup_by_account_type');
  end if;
end $$;

-- T2 the founder settings: values untouched, descriptions say «any plan», never «الشحن وحده»
do $$ begin
  if (select value from public.platform_settings where key = 'founder_topup_discount_bps') <> '1500'::jsonb then
    raise exception 'T2 FAIL: the discount rate was changed';
  end if;
  if (select value from public.platform_settings where key = 'founder_topup_discount_expires') <> '{"months_after_activation": 12}'::jsonb then
    raise exception 'T2 FAIL: the discount window was changed';
  end if;
  if exists (select 1 from public.platform_settings
              where key like 'founder_topup_discount%' and strpos(coalesce(description, ''), 'الشحن وحده') > 0) then
    raise exception 'T2 FAIL: a founder discount description still says «top-ups only»';
  end if;
  if strpos((select description from public.platform_settings where key = 'founder_topup_discount_bps'), 'أي باقة') = 0 then
    raise exception 'T2 FAIL: the rate description does not name «any plan»';
  end if;
end $$;

select 'l9_terms: T0–T2 PASS' as result;
