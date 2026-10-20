-- prelude_points_lots_between_runs.sql — runs BETWEEN the two 20261022_20
-- runs in points_lots.test.sql's chain. Asserts the first run, then changes
-- what a re-run must not undo:
--   * L1's migrated lot loses 50 points to a debit (a re-run must neither add
--     a second migrated lot nor restore the 250);
--   * an admin turns points_enforcement on (a re-run must not reset it).
do $$
begin
  if (select count(*) from public.points_lots
       where user_id = '00000000-0000-0000-0000-00000000e001' and source = 'migrated'
         and points_total = 250 and points_left = 250) <> 1 then
    raise exception 'BETWEEN FAIL: the first run did not create one 250-point migrated lot for L1';
  end if;
  if (select value from public.platform_settings where key = 'points_enforcement') is distinct from 'false'::jsonb then
    raise exception 'BETWEEN FAIL: the first run did not seed points_enforcement = false';
  end if;
  if public.debit_points('00000000-0000-0000-0000-00000000e001', 50, 'between_runs', 'prelude') <> 200 then
    raise exception 'BETWEEN FAIL: debiting 50 from L1 did not leave 200';
  end if;
  update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';
  raise notice 'BETWEEN: first run made one 250-point migrated lot for L1 and seeded points_enforcement = false; debited 50 and set enforcement true';
end $$;
