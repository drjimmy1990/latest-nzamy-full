-- l12_money.test.sql — proves 20261202_10 (batch l12 money: minimum top-up
-- individual 100 / others 500; topup_bonus_pct; founder_bonus_rule;
-- ai_draft_prices) and its _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- production history comes first: l7 (prelude_payref_l8_before), l8
-- (20261128_10), l9 (20261129_30: 50 for everyone). The _verify block runs
-- before 20261202_10 (it must answer f without an error) and after the
-- second run. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l12_money_block.sql
--   sed -n '/^-- >>> verify:l12_money/,/^-- <<< verify:l12_money/p' $M/_verify.sql | tr -d '\r' > "$B"
--   bash $R/run.sh \
--     $M/20260627_platform_settings.sql \
--     $R/prelude_payref_l8_before.sql \
--     $M/20261128_10_payref_settings.sql \
--     $M/20261129_30_l9_terms_pricing.sql \
--     "$B" \
--     $M/20261202_10_l12_money.sql \
--     $R/prelude_l12_money_between_runs.sql \
--     $M/20261202_10_l12_money.sql \
--     "$B" \
--     $R/l12_money.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261202_10
-- files and the between-runs prelude → "T0 FAIL".

-- T0 the l9 50 is gone: individual 100, others 500 (lawyer kept at the admin's 999)
do $$ begin
  if (select value ->> 'individual' from public.platform_settings where key = 'min_topup_by_account_type') is distinct from '100'
     or (select value ->> 'firm' from public.platform_settings where key = 'min_topup_by_account_type') is distinct from '500' then
    raise exception 'T0 FAIL: the minimum top-up is not individual 100 / firm 500 (20261202_10 not applied)';
  end if;
end $$;

-- T1 the re-run kept the admin's lawyer 999 and rewrote only the key left at 50
do $$ begin
  if (select value from public.platform_settings where key = 'min_topup_by_account_type')
     <> '{"lawyer": 999, "firm": 500, "corporate": 500, "micro": 500, "government": 500, "ngo": 500, "provider": 500, "individual": 100, "future_type": 500}'::jsonb then
    raise exception 'T1 FAIL: the re-run changed an admin value or left a 50: %',
      (select value from public.platform_settings where key = 'min_topup_by_account_type');
  end if;
end $$;

-- T2 the three new keys are insert-only: the admin's values survive the re-run
do $$ begin
  if (select value ->> 'topup-500' from public.platform_settings where key = 'topup_bonus_pct') is distinct from '5'
     or (select value ->> 'topup-1000' from public.platform_settings where key = 'topup_bonus_pct') is distinct from '0' then
    raise exception 'T2 FAIL: topup_bonus_pct was overwritten or not seeded';
  end if;
  if (select value ->> 'mode' from public.platform_settings where key = 'founder_bonus_rule') is distinct from 'both' then
    raise exception 'T2 FAIL: founder_bonus_rule was overwritten';
  end if;
  if (select value from public.platform_settings where key = 'ai_draft_prices')
     <> '{"claim": 250, "reply": 500, "rejoinder": 500, "supplementary": 500, "closing": 500, "appeal": 800, "cassation": 1500, "petition": 1500}'::jsonb then
    raise exception 'T2 FAIL: ai_draft_prices was overwritten or mis-seeded: %',
      (select value from public.platform_settings where key = 'ai_draft_prices');
  end if;
end $$;

-- T3 nothing else moved: the founder discount values are untouched
do $$ begin
  if (select value from public.platform_settings where key = 'founder_topup_discount_bps') <> '1500'::jsonb then
    raise exception 'T3 FAIL: the founder discount rate was changed';
  end if;
end $$;

select 'l12_money: T0–T3 PASS' as result;
