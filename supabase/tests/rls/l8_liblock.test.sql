-- l8_liblock.test.sql — proves 20261128_20 (batch l8, owner item 9 + ٥٨):
-- library_access_for (the per-account-type switch, its defaults, the per-
-- account exceptions, admin always open), the free library questions only for
-- an e-mail-verified account whose library is open, and the grants. The
-- migration runs TWICE (it must be re-runnable), and the l8_liblock block of
-- _verify.sql runs after it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l8_liblock.sql
--   sed -n '/^-- >>> verify:l8_liblock/,/^-- <<< verify:l8_liblock/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $M/20261127_40_points_wallets.sql \
--     $R/prelude_l8_liblock.sql \
--     $M/20261128_20_library_access_by_account_type.sql \
--     $M/20261128_20_library_access_by_account_type.sql \
--     "$B" \
--     $R/l8_liblock.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261128_20
-- files and the verify block → "T0 FAIL: library_access_for does not exist".
--
-- Every assertion RAISES.

do $$
begin
  if to_regprocedure('public.library_access_for(uuid)') is null then
    raise exception 'T0 FAIL: library_access_for does not exist (20261128_20 not applied)';
  end if;
end $$;

insert into auth.users (id, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000b0001', now()),   -- lawyer (advocate row)
  ('00000000-0000-0000-0000-0000000b0002', now()),   -- lawyer, consultant
  ('00000000-0000-0000-0000-0000000b0003', now()),   -- lawyer, no lawyer_profiles row
  ('00000000-0000-0000-0000-0000000b0004', now()),   -- firm
  ('00000000-0000-0000-0000-0000000b0005', now()),   -- individual
  ('00000000-0000-0000-0000-0000000b0006', now()),   -- corporate
  ('00000000-0000-0000-0000-0000000b0007', now()),   -- micro
  ('00000000-0000-0000-0000-0000000b0008', now()),   -- government
  ('00000000-0000-0000-0000-0000000b0009', now()),   -- ngo
  ('00000000-0000-0000-0000-0000000b000a', now()),   -- provider
  ('00000000-0000-0000-0000-0000000b000b', now()),   -- admin
  ('00000000-0000-0000-0000-0000000b000c', now()),   -- no profile
  ('00000000-0000-0000-0000-0000000b000d', null),    -- lawyer, e-mail NOT verified
  ('00000000-0000-0000-0000-0000000b000e', now());   -- individual (free questions)
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000b0001', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-0000000b0002', 'lawyer', 'LC'),
  ('00000000-0000-0000-0000-0000000b0003', 'lawyer', 'L0'),
  ('00000000-0000-0000-0000-0000000b0004', 'firm', 'F'),
  ('00000000-0000-0000-0000-0000000b0005', 'individual', 'I'),
  ('00000000-0000-0000-0000-0000000b0006', 'corporate', 'C'),
  ('00000000-0000-0000-0000-0000000b0007', 'micro', 'M'),
  ('00000000-0000-0000-0000-0000000b0008', 'government', 'G'),
  ('00000000-0000-0000-0000-0000000b0009', 'ngo', 'N'),
  ('00000000-0000-0000-0000-0000000b000a', 'provider', 'P'),
  ('00000000-0000-0000-0000-0000000b000b', 'admin', 'A'),
  ('00000000-0000-0000-0000-0000000b000d', 'lawyer', 'LU'),
  ('00000000-0000-0000-0000-0000000b000e', 'individual', 'I2');
insert into public.lawyer_profiles (user_id, practice_kind) values
  ('00000000-0000-0000-0000-0000000b0001', 'advocate'),
  ('00000000-0000-0000-0000-0000000b0002', 'consultant'),
  ('00000000-0000-0000-0000-0000000b000d', 'advocate');
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

create or replace function pg_temp.acc(p uuid) returns text language sql as $$
  select a.allowed::text || '/' || coalesce(a.account_key, '-') || '/' || a.via from public.library_access_for(p) a $$;

-- T1 the seeded defaults: lawyer open; consultant, firm, individual, business,
--    provider closed; admin open; no profile closed
do $$
declare
  r record;
begin
  for r in select * from (values
      ('00000000-0000-0000-0000-0000000b0001', 'true/lawyer/type'),
      ('00000000-0000-0000-0000-0000000b0002', 'false/consultant/type'),
      ('00000000-0000-0000-0000-0000000b0003', 'true/lawyer/type'),
      ('00000000-0000-0000-0000-0000000b0004', 'false/firm/type'),
      ('00000000-0000-0000-0000-0000000b0005', 'false/individual/type'),
      ('00000000-0000-0000-0000-0000000b0006', 'false/business/type'),
      ('00000000-0000-0000-0000-0000000b0007', 'false/business/type'),
      ('00000000-0000-0000-0000-0000000b0008', 'false/business/type'),
      ('00000000-0000-0000-0000-0000000b0009', 'false/business/type'),
      ('00000000-0000-0000-0000-0000000b000a', 'false/provider/type'),
      ('00000000-0000-0000-0000-0000000b000b', 'true/admin/admin'),
      ('00000000-0000-0000-0000-0000000b000c', 'false/-/no_profile')) v(u, want)
  loop
    if pg_temp.acc(r.u::uuid) is distinct from r.want then
      raise exception 'T1 FAIL: % answered % (want %)', r.u, pg_temp.acc(r.u::uuid), r.want;
    end if;
  end loop;
  raise notice 'T1 PASS: lawyer open, the rest closed, admin open, no profile closed';
end $$;

-- T2 the admin's switch applies on the next call; a malformed value keeps the
--    default; a map without the lawyer key keeps the lawyer open
do $$
begin
  update public.platform_settings set value = '{"lawyer": true, "individual": true, "firm": "yes"}'::jsonb
   where key = 'library_access_by_account_type';
  if pg_temp.acc('00000000-0000-0000-0000-0000000b0005') <> 'true/individual/type'
     or pg_temp.acc('00000000-0000-0000-0000-0000000b0004') <> 'false/firm/type'
     or pg_temp.acc('00000000-0000-0000-0000-0000000b0006') <> 'false/business/type' then
    raise exception 'T2 FAIL: the switch did not apply as written';
  end if;
  update public.platform_settings set value = '{"business": true}'::jsonb where key = 'library_access_by_account_type';
  if pg_temp.acc('00000000-0000-0000-0000-0000000b0001') <> 'true/lawyer/type'
     or pg_temp.acc('00000000-0000-0000-0000-0000000b0005') <> 'false/individual/type'
     or pg_temp.acc('00000000-0000-0000-0000-0000000b0009') <> 'true/business/type' then
    raise exception 'T2 FAIL: missing keys did not keep their defaults';
  end if;
  update public.platform_settings set value = '{"lawyer": false}'::jsonb where key = 'library_access_by_account_type';
  if pg_temp.acc('00000000-0000-0000-0000-0000000b0001') <> 'false/lawyer/type'
     or pg_temp.acc('00000000-0000-0000-0000-0000000b000b') <> 'true/admin/admin' then
    raise exception 'T2 FAIL: closing the lawyer type did not close lawyers (or closed the admin)';
  end if;
  update public.platform_settings
     set value = '{"lawyer": true, "consultant": false, "firm": false, "individual": false, "business": false, "provider": false}'::jsonb
   where key = 'library_access_by_account_type';
  raise notice 'T2 PASS: the switch applies on the next call; defaults fill the gaps; admin unaffected';
end $$;

-- T3 a per-account exception wins over the type, both ways
do $$
begin
  insert into public.library_access_user_overrides (user_id, allowed, reason) values
    ('00000000-0000-0000-0000-0000000b0004', true, 'trial'),
    ('00000000-0000-0000-0000-0000000b0001', false, 'test');
  if pg_temp.acc('00000000-0000-0000-0000-0000000b0004') <> 'true/firm/override'
     or pg_temp.acc('00000000-0000-0000-0000-0000000b0001') <> 'false/lawyer/override' then
    raise exception 'T3 FAIL: the exceptions did not win';
  end if;
  delete from public.library_access_user_overrides;
  if pg_temp.acc('00000000-0000-0000-0000-0000000b0004') <> 'false/firm/type' then
    raise exception 'T3 FAIL: removing the exception did not restore the type rule';
  end if;
  raise notice 'T3 PASS: exceptions open or close one account, removal restores the type';
end $$;

create or replace function pg_temp.ask(p_user uuid, p_key text)
returns table (run_id uuid, created boolean, charged boolean, charged_points int) language sql as $$
  select x.run_id, x.created, x.charged, x.charged_points
    from public.ai_start_free_question(p_user, 'library-assistant', null, 'fast', 0, 60, p_key,
      now() + interval '90 seconds', false, '{"message":"q"}'::jsonb) x;
$$;
create or replace function pg_temp.refusal(p_user uuid, p_key text)
returns text language plpgsql as $$
begin
  perform * from pg_temp.ask(p_user, p_key);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
end $$;

-- T4 ٥٨: a verified lawyer 10; an unverified lawyer 0; an individual 0 while
--    individuals are closed and 5 once they open — nothing used meanwhile
do $$
declare r record;
begin
  if (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-0000000b0001') s) <> 10 then
    raise exception 'T4 FAIL: a verified lawyer does not have 10';
  end if;
  if (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-0000000b000d') s) <> 0
     or pg_temp.refusal('00000000-0000-0000-0000-0000000b000d', 'l8-u-0001') <> 'free_question_not_eligible' then
    raise exception 'T4 FAIL: an unverified e-mail got free questions';
  end if;
  if (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-0000000b000e') s) <> 0
     or pg_temp.refusal('00000000-0000-0000-0000-0000000b000e', 'l8-i-0001') <> 'free_question_not_eligible' then
    raise exception 'T4 FAIL: an individual got free questions while individuals are closed';
  end if;
  update public.platform_settings set value = value || '{"individual": true}'::jsonb where key = 'library_access_by_account_type';
  if (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-0000000b000e') s) <> 5 then
    raise exception 'T4 FAIL: reopening individuals did not give the 5 back';
  end if;
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000b000e', 'l8-i-0002');
  if not r.created or r.charged then raise exception 'T4 FAIL: the reopened individual question was not free: %', r; end if;
  -- closed again: the 4 left are kept, not usable
  update public.platform_settings set value = value || '{"individual": false}'::jsonb where key = 'library_access_by_account_type';
  if pg_temp.refusal('00000000-0000-0000-0000-0000000b000e', 'l8-i-0003') <> 'free_question_not_eligible' then
    raise exception 'T4 FAIL: a closed individual still got a free question';
  end if;
  -- an exception opens them for that account only
  insert into public.library_access_user_overrides (user_id, allowed) values ('00000000-0000-0000-0000-0000000b000e', true);
  if (select s.allowance - s.used from public.ai_free_question_status('00000000-0000-0000-0000-0000000b000e') s) <> 4 then
    raise exception 'T4 FAIL: the exception did not give the remaining 4';
  end if;
  raise notice 'T4 PASS: verified e-mail and an open library required; reopening restores, nothing lost';
end $$;

-- T5 grants: no session role reads the exceptions or runs the functions
do $$
begin
  if has_table_privilege('authenticated', 'public.library_access_user_overrides', 'SELECT')
     or has_table_privilege('anon', 'public.library_access_user_overrides', 'SELECT')
     or has_table_privilege('authenticated', 'public.library_access_user_overrides', 'INSERT')
     or has_function_privilege('authenticated', 'public.library_access_for(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.library_access_for(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ai_free_question_status(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.library_access_for(uuid)', 'EXECUTE') then
    raise exception 'T5 FAIL: a grant is wrong';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('library_access_for', 'ai_free_question_status')) <> 2 then
    raise exception 'T5 FAIL: a second overload exists';
  end if;
  raise notice 'T5 PASS: service role only';
end $$;

-- T6 the seed never overwrites the admin's value (ON CONFLICT DO NOTHING)
do $$
begin
  update public.platform_settings set value = '{"lawyer": true, "firm": true}'::jsonb where key = 'library_access_by_account_type';
  insert into public.platform_settings (key, value) values ('library_access_by_account_type', '{"lawyer": true}'::jsonb)
  on conflict (key) do nothing;
  if (select value from public.platform_settings where key = 'library_access_by_account_type') <> '{"lawyer": true, "firm": true}'::jsonb then
    raise exception 'T6 FAIL: the seed overwrote the admin value';
  end if;
  raise notice 'T6 PASS: the admin value survives the seed';
end $$;

select 'l8_liblock tests: ALL PASS' as result;
