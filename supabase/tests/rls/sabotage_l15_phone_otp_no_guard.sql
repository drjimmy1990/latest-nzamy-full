-- NEGATIVE CONTROL for l15_phone_otp.test.sql (never a migration): removes the
-- profiles guard 20261205_10 installs, so the test must FAIL at P7.
drop trigger if exists trg_phone_verified_guard on public.profiles;
