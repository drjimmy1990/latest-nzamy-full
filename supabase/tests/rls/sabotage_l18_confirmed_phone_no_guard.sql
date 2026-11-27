-- sabotage_l18_confirmed_phone_no_guard.sql — NEGATIVE CONTROL for
-- l18_confirmed_phone_unique.test.sql: removes the guard and the index of
-- 20261208_50, so a second confirmation of the same number goes through.
-- The test must then FAIL at C2.
drop trigger if exists trg_phone_verified_unique on public.profiles;
drop index if exists public.profiles_confirmed_phone_unique;
