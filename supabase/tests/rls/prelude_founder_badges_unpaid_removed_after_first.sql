-- Runs after the FIRST 20261026_02 run in founder_badges_unpaid_removed.test.sql.
-- NOT a migration. It checks the first run cleared both unpaid badges and
-- snapshots founder_badge_removals, so the next prelude can prove the second
-- run was a no-op.
do $$
begin
  if exists (select 1 from public.lawyer_profiles where founder_badge) then
    raise exception 'FIRST-02 FAIL: % badge(s) still held after the first run',
      (select count(*) from public.lawyer_profiles where founder_badge);
  end if;
  if (select array_agg(user_id order by user_id) from public.founder_badge_removals)
     is distinct from array['00000000-0000-0000-0000-0000000000f1',
                            '00000000-0000-0000-0000-0000000000f4']::uuid[] then
    raise exception 'FIRST-02 FAIL: founder_badge_removals holds %, expected f1 and f4',
      (select array_agg(user_id order by user_id) from public.founder_badge_removals);
  end if;
  raise notice 'FIRST-02: both unpaid badges cleared; f1 and f4 recorded in founder_badge_removals';
end $$;

create table public._t_removals_first as select * from public.founder_badge_removals;
