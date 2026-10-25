-- Runs AFTER 20261021_50 and BEFORE 20261026_01 in
-- founder_no_signup_grant.test.sql. NOT a migration; it never ships.
-- It plays what live looks like on 25 Oct 2026, before the fix:
--   1. handle_new_user wired to auth.users (as on live);
--   2. the campaign window set around the real Riyadh today, so
--      founder_campaign_active() is true for the rest of the chain;
--   3. one lawyer (…f1) signs up and — POSITIVE CONTROL — gets the badge and
--      one lib-founder grant from the trigger. He is the "already given" row
--      20261026_01 must keep untouched (owner question ٢٧٨).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

update public.platform_settings
   set value = jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'library_days', 90)
 where key = 'founder_campaign';

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@example.test', '{"user_type":"lawyer","full_name":"محامٍ ١"}'::jsonb);

do $$
begin
  if not public.founder_campaign_active() then
    raise exception 'BEFORE FAIL: the campaign reads inactive inside today − 1 … today + 1';
  end if;
  if (select founder_badge from public.lawyer_profiles
       where user_id = '00000000-0000-0000-0000-0000000000f1') is distinct from true then
    raise exception 'BEFORE FAIL: before 20261026_01 a lawyer signing up during the campaign did not get the badge (the positive control is broken)';
  end if;
  if (select count(*) from public.library_access_grants
       where user_id = '00000000-0000-0000-0000-0000000000f1' and plan_ref = 'lib-founder') <> 1 then
    raise exception 'BEFORE FAIL: before 20261026_01 f1 does not hold exactly one lib-founder grant';
  end if;
  raise notice 'BEFORE: with the 20261021_50 trigger, f1 signed up during the campaign and got the badge + one lib-founder grant (positive control)';
end $$;
