-- prelude_l9_terms_between_runs.sql — between the two runs of 20261129_30
-- (l9_terms.test.sql): checks what the first run wrote, then an admin edits
-- the minimum (lawyer 999) and adds a type key the code does not know. The
-- second run must bring EVERY key back to 50 (register 14 item 7 overwrites
-- on purpose).
do $$ begin
  if (select value from public.platform_settings where key = 'min_topup_by_account_type')
     <> '{"lawyer": 50, "firm": 50, "corporate": 50, "micro": 50, "government": 50, "ngo": 50, "provider": 50, "individual": 50}'::jsonb then
    raise exception 'B1 FAIL: the first run did not set every account type to 50: %',
      (select value from public.platform_settings where key = 'min_topup_by_account_type');
  end if;
end $$;

update public.platform_settings
   set value = value || '{"lawyer": 999, "future_type": 700}'::jsonb
 where key = 'min_topup_by_account_type';
