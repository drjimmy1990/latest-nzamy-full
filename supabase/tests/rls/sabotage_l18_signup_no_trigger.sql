-- sabotage_l18_signup_no_trigger.sql — NEGATIVE CONTROL for l18_signup.test.sql.
-- NOT a migration. Drops the trigger 20261208_10 adds, so a form sign-up
-- starts with onboarding_completed = false again: T1 must FAIL.
drop trigger if exists trg_profiles_form_signup_onboarded on public.profiles;
