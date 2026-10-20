-- prelude_points_lots_between_runs.sql — runs BETWEEN the two 20261022_20
-- runs in points_lots.test.sql's chain. Asserts the first run, then changes
-- what a re-run must not undo or act on:
--   * L1's migrated lot loses 50 points to a debit (a re-run must neither add
--     a second migrated lot nor restore the 250);
--   * an admin turns points_enforcement on (a re-run must not reset it);
--   * L0's credit_balance becomes 80 and N0's latest balance_after 55 — the
--     backfill is one-shot, so a re-run must mint no 12-month lot for either.
do $$
begin
  if (select count(*) from public.points_lots
       where user_id = '00000000-0000-0000-0000-00000000e001' and source = 'migrated'
         and points_total = 250 and points_left = 250) <> 1 then
    raise exception 'BETWEEN FAIL: the first run did not create one 250-point migrated lot for L1';
  end if;
  if (select string_agg(right(user_id::text, 4) || ':' || points_total, ',' order by user_id)
        from public.points_lots where source = 'migrated') is distinct from 'e001:250,e002:40,e004:25' then
    raise exception 'BETWEEN FAIL: the first run''s migrated lots are %',
      (select string_agg(right(user_id::text, 4) || ':' || points_total, ',' order by user_id)
         from public.points_lots where source = 'migrated');
  end if;
  if (select value from public.platform_settings where key = 'points_enforcement') is distinct from 'false'::jsonb then
    raise exception 'BETWEEN FAIL: the first run did not seed points_enforcement = false';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'points_lots_migrated_at') then
    raise exception 'BETWEEN FAIL: the first run did not record points_lots_migrated_at';
  end if;
  if public.debit_points('00000000-0000-0000-0000-00000000e001', 50, 'between_runs', 'prelude') <> 200 then
    raise exception 'BETWEEN FAIL: debiting 50 from L1 did not leave 200';
  end if;
  update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';
  update public.lawyer_profiles set credit_balance = 80 where user_id = '00000000-0000-0000-0000-00000000e000';
  insert into public.credit_transactions (user_id, amount, kind, balance_after)
    values ('00000000-0000-0000-0000-00000000e003', 55, 'promo', 55);
  raise notice 'BETWEEN: first run made migrated lots e001:250, e002:40, e004:25 and recorded points_lots_migrated_at; debited 50 from L1, set enforcement true, gave L0 credit_balance 80 and N0 balance_after 55';
end $$;
