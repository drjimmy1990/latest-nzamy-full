-- Runs BETWEEN the two 20261021_50 runs of founder_campaign.test.sql. NOT a
-- migration; it never ships.
-- It plays what happens on live after the first apply:
--   1. it asserts the first run seeded the owner's dates exactly
--      (٢٢٥: 25 Oct 2026 – 25 Jan 2027, 90 library days);
--   2. an admin then edits the setting in /admin/settings (here by hand) to a
--      sentinel value. The second run must keep that edit — the seed is
--      `on conflict (key) do nothing` — and the test's T2 checks it.
do $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = 'founder_campaign';
  if v is distinct from '{"starts_on": "2026-10-25", "ends_on": "2027-01-25", "library_days": 90}'::jsonb then
    raise exception 'BETWEEN-RUNS FAIL: the first run seeded founder_campaign = %, expected the owner''s dates 2026-10-25 → 2027-01-25, 90 days', v;
  end if;
  raise notice 'BETWEEN-RUNS: the first run seeded {"starts_on": "2026-10-25", "ends_on": "2027-01-25", "library_days": 90}';
end $$;

update public.platform_settings
   set value = '{"starts_on": "2026-11-01", "ends_on": "2027-02-01", "library_days": 60}'::jsonb
 where key = 'founder_campaign';
