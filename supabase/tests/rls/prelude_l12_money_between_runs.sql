-- prelude_l12_money_between_runs.sql — between the two runs of 20261202_10
-- (l12_money.test.sql): checks what the first run wrote, then an admin edits
-- the settings. The second run must keep every admin value (lawyer 999, a
-- bonus of 5 %, mode "both", a claim price of 250) and rewrite only a key
-- still at the l9 value 50 (the unknown future_type).
do $$ begin
  if (select value from public.platform_settings where key = 'min_topup_by_account_type')
     <> '{"lawyer": 500, "firm": 500, "corporate": 500, "micro": 500, "government": 500, "ngo": 500, "provider": 500, "individual": 100}'::jsonb then
    raise exception 'B1 FAIL: the first run did not write individual 100 / others 500: %',
      (select value from public.platform_settings where key = 'min_topup_by_account_type');
  end if;
  if (select value ->> 'claim' from public.platform_settings where key = 'ai_draft_prices') is distinct from '200' then
    raise exception 'B1 FAIL: the claim price is not 200';
  end if;
end $$;

update public.platform_settings
   set value = value || '{"lawyer": 999, "future_type": 50}'::jsonb
 where key = 'min_topup_by_account_type';
update public.platform_settings set value = value || '{"topup-500": 5}'::jsonb where key = 'topup_bonus_pct';
update public.platform_settings set value = '{"mode": "both"}'::jsonb where key = 'founder_bonus_rule';
update public.platform_settings set value = value || '{"claim": 250}'::jsonb where key = 'ai_draft_prices';
