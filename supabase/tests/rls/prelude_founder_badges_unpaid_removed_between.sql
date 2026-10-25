-- Runs after the SECOND 20261026_02 run and before the THIRD in
-- founder_badges_unpaid_removed.test.sql. NOT a migration; it never ships.
--   1. proves the second run was a no-op (no badge, removals identical to the
--      snapshot, grants identical);
--   2. plays the world after P3: a minimal public.payment_orders (only the
--      columns 20261026_02 reads; live has it since 20261022_10) where f1 PAID
--      for the founder membership and got the badge back, and f4's badge came
--      back WITHOUT a payment (a restore, a manual edit). The third run must
--      keep f1's paid badge and clear f4's again, keeping f4's first
--      removed_at.
do $$
begin
  if exists (select 1 from public.lawyer_profiles where founder_badge) then
    raise exception 'SECOND-02 FAIL: a badge is held after the second run';
  end if;
  if exists ((select user_id, removed_at, reason from public.founder_badge_removals
              except select user_id, removed_at, reason from public._t_removals_first)
             union all
             (select user_id, removed_at, reason from public._t_removals_first
              except select user_id, removed_at, reason from public.founder_badge_removals)) then
    raise exception 'SECOND-02 FAIL: the second run changed founder_badge_removals';
  end if;
  if exists ((select * from public.library_access_grants except select * from public._t_grants_before)
             union all
             (select * from public._t_grants_before except select * from public.library_access_grants)) then
    raise exception 'SECOND-02 FAIL: library_access_grants changed';
  end if;
  raise notice 'SECOND-02: the re-run was a no-op (no badge, same removals, same grants)';
end $$;

create table public.payment_orders (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid,
  kind    text not null,
  item_id text not null,
  status  text not null
);
insert into public.payment_orders (user_id, kind, item_id, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'plan', 'lawyer-founder-2026', 'paid'),
  -- f4 started a founder checkout and never paid; b2 paid for something else
  ('00000000-0000-0000-0000-0000000000f4', 'plan', 'lawyer-founder-2026', 'failed'),
  ('00000000-0000-0000-0000-0000000000b2', 'plan', 'lawyer-pro', 'paid');

update public.lawyer_profiles set founder_badge = true
 where user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f4');
