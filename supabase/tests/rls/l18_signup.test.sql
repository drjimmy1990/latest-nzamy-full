-- l18_signup.test.sql — proves 20261208_10 (batch l18, LIVE-01 part B: a form
-- sign-up is not sent through the onboarding wizard again).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261208_10
-- runs TWICE (the second backfill must report 0 rows). From the repo root, in
-- Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $R/prelude_l18_signup.sql \
--     $M/20261208_10_signup_onboarding_completed.sql $M/20261208_10_signup_onboarding_completed.sql \
--     $R/l18_signup.test.sql
--   Expect: «20261208_10 backfill: 1 profile(s) …» then «… 0 profile(s) …»,
--   «l18_signup verify: OK …» twice, and every T* PASS.
-- NEGATIVE CONTROL (must FAIL): add $R/sabotage_l18_signup_no_trigger.sql
--   after the two migration lines → «T1 … FAIL: got false, want true».
-- Synthetic fixtures only. Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;

create or replace function pg_temp.done(p_id uuid) returns text language sql as $$
  select coalesce((select onboarding_completed::text from public.profiles where id = p_id), 'no-row')
$$;

-- ── the trigger: new sign-ups ───────────────────────────────────────────────
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  -- T1 the client form: e-mail, a user_type, onboarding_completed true
  ('a1000000-0000-4000-8000-000000000001', 't1@example.test', '{"provider":"email","providers":["email"]}',
   '{"user_type":"individual","full_name":"T1","phone":"0500000011","onboarding_completed":true}'),
  -- T2 Google: no user_type, no flag
  ('a1000000-0000-4000-8000-000000000002', 't2@example.test', '{"provider":"google","providers":["google"]}',
   '{"full_name":"T2","avatar_url":"x"}'),
  -- T3 Google whose metadata claims the form's keys: still the wizard
  ('a1000000-0000-4000-8000-000000000003', 't3@example.test', '{"provider":"google"}',
   '{"user_type":"individual","onboarding_completed":true}'),
  -- T4 an older provider form (onboarding_completed false)
  ('a1000000-0000-4000-8000-000000000004', 't4@example.test', '{"provider":"email"}',
   '{"user_type":"provider","sub_role":"notary","onboarding_completed":false}'),
  -- T5 e-mail, the flag, but no user_type (not a form)
  ('a1000000-0000-4000-8000-000000000005', 't5@example.test', '{"provider":"email"}',
   '{"onboarding_completed":true}'),
  -- T6 no app metadata at all
  ('a1000000-0000-4000-8000-000000000006', 't6@example.test', null,
   '{"user_type":"individual","onboarding_completed":true}'),
  -- T7 the provider form now (notary): e-mail, user_type provider, flag true
  ('a1000000-0000-4000-8000-000000000007', 't7@example.test', '{"provider":"email"}',
   '{"user_type":"provider","sub_role":"notary","onboarding_completed":true}');

select pg_temp.expect('T1 a client-form sign-up starts completed', pg_temp.done('a1000000-0000-4000-8000-000000000001'), 'true');
select pg_temp.expect('T2 a Google sign-up keeps the wizard', pg_temp.done('a1000000-0000-4000-8000-000000000002'), 'false');
select pg_temp.expect('T3 Google metadata claiming the form keys keeps the wizard', pg_temp.done('a1000000-0000-4000-8000-000000000003'), 'false');
select pg_temp.expect('T4 onboarding_completed false in the metadata stays false', pg_temp.done('a1000000-0000-4000-8000-000000000004'), 'false');
select pg_temp.expect('T5 no user_type in the metadata stays false', pg_temp.done('a1000000-0000-4000-8000-000000000005'), 'false');
select pg_temp.expect('T6 no app metadata stays false', pg_temp.done('a1000000-0000-4000-8000-000000000006'), 'false');
select pg_temp.expect('T7 a provider-form sign-up starts completed', pg_temp.done('a1000000-0000-4000-8000-000000000007'), 'true');
-- The rest of the sign-up is untouched (handle_new_user still did its job).
select pg_temp.expect('T8 handle_new_user still files the type and the phone',
  (select user_type || '|' || coalesce(phone, '-') from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'),
  'individual|+966500000011');

-- ── the backfill (fixtures b1–b6 from the prelude, before the migration) ──
select pg_temp.expect('B1 a confirmed form sign-up is marked completed', pg_temp.done('b1000000-0000-4000-8000-000000000001'), 'true');
select pg_temp.expect('B2 a Google account is untouched', pg_temp.done('b1000000-0000-4000-8000-000000000002'), 'false');
select pg_temp.expect('B3 an e-mail account with a linked Google identity is untouched', pg_temp.done('b1000000-0000-4000-8000-000000000003'), 'false');
select pg_temp.expect('B4 an unconfirmed mobile is untouched', pg_temp.done('b1000000-0000-4000-8000-000000000004'), 'false');
select pg_temp.expect('B5 an admin is untouched', pg_temp.done('b1000000-0000-4000-8000-000000000005'), 'false');
select pg_temp.expect('B6 no user_type in the sign-up metadata is untouched', pg_temp.done('b1000000-0000-4000-8000-000000000006'), 'false');
select pg_temp.expect('B7 nothing is left for a re-run of the backfill',
  (select count(*)::text from public.profiles p
    where p.onboarding_completed = false and p.phone_verified_at is not null and p.user_type <> 'admin'
      and exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'email')
      and not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'google')
      and exists (select 1 from auth.users u where u.id = p.id
                   and nullif(btrim(u.raw_user_meta_data->>'user_type'), '') is not null)),
  '0');

-- ── privileges ─────────────────────────────────────────────────────────────
select pg_temp.expect('P1 no session may call the trigger function',
  (has_function_privilege('anon', 'public.profiles_form_signup_onboarded()', 'EXECUTE')
   or has_function_privilege('authenticated', 'public.profiles_form_signup_onboarded()', 'EXECUTE'))::text,
  'false');
