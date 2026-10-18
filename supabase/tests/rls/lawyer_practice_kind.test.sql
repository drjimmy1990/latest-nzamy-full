-- lawyer_practice_kind.test.sql — proves 20261019_20 (owner answers ١٧٣ / ٢١٩:
-- the independent consultant is a lawyer account with practice_kind
-- 'consultant'; the licence number typed at signup is kept).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $T/lawyer_practice_kind.test.sql
-- Why each link:
--   prelude_lawyer_profiles_live.sql  the live lawyer_profiles columns, the
--       20260922_03 + 20261016_05 column UPDATE list, the live policies and
--       rows b1 (verified + listed) / b2 (pending) / c1 (client).
--   prelude_signup_metadata_live.sql  the auth.users / profiles columns and
--       user_settings that the real handle_new_user needs (see its header).
--   20260921_04   the latest handle_new_user body (the lawyer branch inserts
--       `lawyer_profiles (user_id, is_accepting_clients)`); this file wires it
--       to auth.users exactly as live does (on_auth_user_created).
--   20261016_10   the SELECT column lock, live since 2026-10-16. Without it
--       anon still holds table-level SELECT and 20261019_20 refuses to run.
--
-- NEGATIVE CONTROL (must FAIL; recorded 2026-10-18) — the chain without the
-- two 20261019_20 files:
--   bash $T/run.sh $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql $T/lawyer_practice_kind.test.sql
--   → "T0 FAIL: lawyer_profiles.practice_kind does not exist (20261019_20 not applied)".
-- BUILT-IN CONTROL: T6 signs a consultant up with the trigger DISABLED and
-- expects advocate + no licence number — so T2's result comes from the
-- trigger, not from handle_new_user or a default.
--
-- WHY app_user's DIRECT grants are revoked (T7): stubs.sql gives app_user
-- `grant all` on every public table, and no migration in this chain revokes it
-- from app_user. On live a signed-in PostgREST request holds privileges only
-- through `authenticated`; after the REVOKE app_user's set is that one, so a
-- 42501 below is the live column grant answering, not an accident.
--
-- Actors (all created through auth.users → handle_new_user unless noted):
--   d1 consultant + MOJ-1 · d2 practice_kind 'admin' · d3 'Consultant' (case)
--   + blank licence · d4 no practice_kind, licence '  MOJ-4  ' · d5 NULL
--   metadata · d6 scalar metadata · d7 individual whose lawyer row the service
--   role inserts with its own licence · d8 consultant signed up with the
--   trigger disabled · d9 numeric licence · da object licence · db signed up
--   while the function's owner cannot read auth.users.
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP on

-- T0 precondition (the negative control stops here)
do $$
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.lawyer_profiles'::regclass
                    and attname = 'practice_kind' and not attisdropped) then
    raise exception 'T0 FAIL: lawyer_profiles.practice_kind does not exist (20261019_20 not applied)';
  end if;
  raise notice 'T0 PASS: lawyer_profiles.practice_kind exists';
end $$;

-- T1 catalog: column shape, CHECK, grants, trigger, function
do $$
declare
  r   text;
  dfl text;
  cfg text[];
begin
  select pg_get_expr(d.adbin, d.adrelid) into dfl
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.lawyer_profiles'::regclass and a.attname = 'practice_kind';
  if dfl is distinct from '''advocate''::text' then
    raise exception 'T1 FAIL: practice_kind default is %, expected ''advocate''', dfl;
  end if;
  if not (select attnotnull from pg_attribute
           where attrelid = 'public.lawyer_profiles'::regclass and attname = 'practice_kind') then
    raise exception 'T1 FAIL: practice_kind is nullable';
  end if;
  if (select attnotnull from pg_attribute
       where attrelid = 'public.lawyer_profiles'::regclass and attname = 'licence_image_path' and not attisdropped) is distinct from false then
    raise exception 'T1 FAIL: licence_image_path is missing or NOT NULL';
  end if;
  begin
    update public.lawyer_profiles set practice_kind = 'admin' where user_id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'T1 FAIL: the CHECK accepted practice_kind = ''admin''';
  exception when check_violation then null;
  end;

  foreach r in array array['anon', 'authenticated'] loop
    if not has_column_privilege(r, 'public.lawyer_profiles', 'practice_kind', 'SELECT') then
      raise exception 'T1 FAIL: % cannot SELECT practice_kind', r;
    end if;
    if has_column_privilege(r, 'public.lawyer_profiles', 'practice_kind', 'UPDATE')
       or has_column_privilege(r, 'public.lawyer_profiles', 'practice_kind', 'INSERT') then
      raise exception 'T1 FAIL: % can write practice_kind', r;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_column_privilege(r, 'public.lawyer_profiles', 'licence_image_path', 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'T1 FAIL: % holds a privilege on licence_image_path', r;
    end if;
  end loop;

  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.lawyer_profiles'::regclass
                    and t.tgname = 'trg_lawyer_profiles_from_signup'
                    and not t.tgisinternal and t.tgenabled <> 'D'
                    and (t.tgtype & 7) = 7            -- ROW | BEFORE | INSERT
                    and t.tgfoid = 'public.lawyer_profile_from_signup()'::regprocedure) then
    raise exception 'T1 FAIL: trg_lawyer_profiles_from_signup is missing, disabled, or not BEFORE INSERT FOR EACH ROW';
  end if;
  select p.proconfig into cfg from pg_proc p where p.oid = 'public.lawyer_profile_from_signup()'::regprocedure;
  if not (select prosecdef from pg_proc where oid = 'public.lawyer_profile_from_signup()'::regprocedure)
     or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception 'T1 FAIL: lawyer_profile_from_signup is not SECURITY DEFINER with search_path '''' (proconfig %)', cfg;
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.lawyer_profile_from_signup()', 'EXECUTE') then
      raise exception 'T1 FAIL: % can EXECUTE lawyer_profile_from_signup', r;
    end if;
  end loop;
  raise notice 'T1 PASS: practice_kind NOT NULL default advocate + CHECK; licence_image_path nullable; API roles read practice_kind only, nothing on licence_image_path; trigger BEFORE INSERT, definer, search_path '''', no API EXECUTE';
end $$;

-- ── fixtures as postgres: wire handle_new_user to auth.users as on live ─────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- T2 the signup case of the brief: consultant + MOJ-1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.test',
   '{"user_type":"lawyer","full_name":"مستشار قانوني","practice_kind":"consultant","license_number":"MOJ-1"}'::jsonb);
do $$
declare rec record;
begin
  select practice_kind, license_number into rec from public.lawyer_profiles
   where user_id = '00000000-0000-0000-0000-0000000000d1';
  if rec is null then raise exception 'T2 FAIL: handle_new_user built no lawyer row for d1'; end if;
  if rec.practice_kind <> 'consultant' or rec.license_number is distinct from 'MOJ-1' then
    raise exception 'T2 FAIL: d1 is (%, %), expected (consultant, MOJ-1)', rec.practice_kind, rec.license_number;
  end if;
  raise notice 'T2 PASS: a consultant signup is stored as consultant with licence MOJ-1';
end $$;

-- T3 anything but exactly 'consultant' stays advocate; the licence is trimmed
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d2', 'd2@example.test', '{"user_type":"lawyer","practice_kind":"admin"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@example.test', '{"user_type":"lawyer","practice_kind":"Consultant","license_number":""}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d4', 'd4@example.test', '{"user_type":"lawyer","license_number":"  MOJ-4  "}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d9', 'd9@example.test', '{"user_type":"lawyer","license_number":12345}'::jsonb),
  ('00000000-0000-0000-0000-0000000000da', 'da@example.test', '{"user_type":"lawyer","license_number":{"no":1}}'::jsonb);
do $$
declare rec record;
begin
  for rec in
    select v.uid, v.kind, v.lic, lp.practice_kind, lp.license_number
      from (values ('00000000-0000-0000-0000-0000000000d2'::uuid, 'advocate', null::text),
                   ('00000000-0000-0000-0000-0000000000d3'::uuid, 'advocate', null),
                   ('00000000-0000-0000-0000-0000000000d4'::uuid, 'advocate', 'MOJ-4'),
                   ('00000000-0000-0000-0000-0000000000d9'::uuid, 'advocate', '12345'),
                   ('00000000-0000-0000-0000-0000000000da'::uuid, 'advocate', null)) v(uid, kind, lic)
      left join public.lawyer_profiles lp on lp.user_id = v.uid
  loop
    if rec.practice_kind is distinct from rec.kind or rec.license_number is distinct from rec.lic then
      raise exception 'T3 FAIL: % is (%, %), expected (%, %)', rec.uid, rec.practice_kind, rec.license_number, rec.kind, rec.lic;
    end if;
  end loop;
  raise notice 'T3 PASS: practice_kind admin / Consultant / absent → advocate; licence trimmed, blank and object → NULL, number kept as text';
end $$;

-- T4 rows that existed before the migration are advocates, licence untouched
do $$
declare n int;
begin
  select count(*) into n from public.lawyer_profiles
   where (user_id = '00000000-0000-0000-0000-0000000000b1' and practice_kind = 'advocate' and license_number = '1448-LAW-001')
      or (user_id = '00000000-0000-0000-0000-0000000000b2' and practice_kind = 'advocate' and license_number = '1448-LAW-002');
  if n <> 2 then raise exception 'T4 FAIL: % of the 2 pre-existing rows are (advocate, own licence)', n; end if;
  raise notice 'T4 PASS: the pre-existing lawyers b1 / b2 read advocate and keep their licence';
end $$;

-- T5 never raises: NULL metadata, scalar metadata, no auth.users row
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d5', 'd5@example.test', null),
  ('00000000-0000-0000-0000-0000000000d6', 'd6@example.test', '"consultant"'::jsonb);
do $$
declare rec record;
begin
  -- handle_new_user made both individuals; the lawyer row is inserted directly
  insert into public.lawyer_profiles (user_id, is_accepting_clients)
  values ('00000000-0000-0000-0000-0000000000d5', true), ('00000000-0000-0000-0000-0000000000d6', true);
  for rec in select user_id, practice_kind, license_number from public.lawyer_profiles
              where user_id in ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000d6') loop
    if rec.practice_kind <> 'advocate' or rec.license_number is not null then
      raise exception 'T5 FAIL: % is (%, %), expected (advocate, NULL)', rec.user_id, rec.practice_kind, rec.license_number;
    end if;
  end loop;

  -- no auth.users row: the same function on a scratch table without the FK
  create table public.t5_scratch (user_id uuid, practice_kind text not null default 'advocate', license_number text);
  create trigger t5_scratch_from_signup before insert on public.t5_scratch
    for each row execute function public.lawyer_profile_from_signup();
  insert into public.t5_scratch (user_id) values ('00000000-0000-0000-0000-00000000ffff');
  select practice_kind, license_number into rec from public.t5_scratch;
  if rec.practice_kind <> 'advocate' or rec.license_number is not null then
    raise exception 'T5 FAIL: a row with no auth.users user became (%, %)', rec.practice_kind, rec.license_number;
  end if;
  drop table public.t5_scratch;
  raise notice 'T5 PASS: NULL metadata, scalar metadata and a missing auth.users row leave the row as inserted, without an error';
end $$;

-- T6 built-in control: with the trigger disabled the same signup is an
-- advocate with no licence (so T2 is the trigger's doing)
alter table public.lawyer_profiles disable trigger trg_lawyer_profiles_from_signup;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d8', 'd8@example.test',
   '{"user_type":"lawyer","practice_kind":"consultant","license_number":"MOJ-8"}'::jsonb);
alter table public.lawyer_profiles enable trigger trg_lawyer_profiles_from_signup;
do $$
declare rec record;
begin
  select practice_kind, license_number into rec from public.lawyer_profiles
   where user_id = '00000000-0000-0000-0000-0000000000d8';
  if rec.practice_kind <> 'advocate' or rec.license_number is not null then
    raise exception 'T6 FAIL: without the trigger d8 became (%, %) — something else fills these columns', rec.practice_kind, rec.license_number;
  end if;
  raise notice 'T6 PASS: control — without the trigger a consultant signup is (advocate, NULL)';
end $$;

-- T7 an explicit licence wins; the fill runs as the definer (the service role
-- cannot read auth.users in this harness)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d7', 'd7@example.test',
   '{"user_type":"individual","practice_kind":"consultant","license_number":"META-7"}'::jsonb);
do $$
declare rec record;
begin
  if has_table_privilege('service_role', 'auth.users', 'SELECT') then
    raise exception 'T7 SETUP: service_role can read auth.users here — the definer half of this test would prove nothing';
  end if;
  execute 'set local role service_role';
  insert into public.lawyer_profiles (user_id, license_number) values ('00000000-0000-0000-0000-0000000000d7', 'EXPLICIT-7');
  reset role;
  select practice_kind, license_number into rec from public.lawyer_profiles
   where user_id = '00000000-0000-0000-0000-0000000000d7';
  if rec.practice_kind <> 'consultant' or rec.license_number <> 'EXPLICIT-7' then
    raise exception 'T7 FAIL: d7 is (%, %), expected (consultant, EXPLICIT-7)', rec.practice_kind, rec.license_number;
  end if;
  raise notice 'T7 PASS: a service-role insert is filled through the definer; an explicit licence is not overwritten';
end $$;

-- T8 the session: reads practice_kind, cannot write either new column, cannot
-- read licence_image_path, still saves what it could before
revoke all on public.lawyer_profiles from app_user;
do $$
declare
  k   text;
  uid uuid;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000d1', true);
  execute 'set local role app_user';

  select practice_kind into k from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
  if k is distinct from 'consultant' then raise exception 'T8 FAIL: d1 reads own practice_kind as %', k; end if;

  begin
    update public.lawyer_profiles set practice_kind = 'advocate' where user_id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'T8 FAIL: app_user updated its own practice_kind';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.lawyer_profiles set licence_image_path = 'x' where user_id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'T8 FAIL: app_user updated its own licence_image_path';
  exception when insufficient_privilege then null;
  end;
  begin
    perform licence_image_path from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'T8 FAIL: app_user read licence_image_path';
  exception when insufficient_privilege then null;
  end;

  -- the PATCH /api/v1/profile shape still works
  update public.lawyer_profiles
     set bio_ar = 'نبذة', license_number = 'MOJ-1-B', show_hourly_rate = true, display_mode = 'light'
   where user_id = '00000000-0000-0000-0000-0000000000d1'
  returning user_id into uid;
  if uid is null then raise exception 'T8 FAIL: the profile save updated no row'; end if;
  reset role;

  perform set_config('test.uid', '', true);
  execute 'set local role anon';
  select practice_kind into k from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
  if k is distinct from 'advocate' then raise exception 'T8 FAIL: a guest reads the listed lawyer''s practice_kind as %', k; end if;
  begin
    perform licence_image_path from public.lawyer_profiles;
    raise exception 'T8 FAIL: a guest read licence_image_path';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'T8 PASS: the session reads practice_kind, gets 42501 writing practice_kind / licence_image_path and reading licence_image_path, and still saves bio / licence / display_mode; a guest reads practice_kind only';
end $$;

-- T9 the service role owns licence_image_path
do $$
declare p text;
begin
  execute 'set local role service_role';
  update public.lawyer_profiles set licence_image_path = 'licences/00000000-0000-0000-0000-0000000000d1/licence.jpg'
   where user_id = '00000000-0000-0000-0000-0000000000d1';
  select licence_image_path into p from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
  reset role;
  if p is distinct from 'licences/00000000-0000-0000-0000-0000000000d1/licence.jpg' then
    raise exception 'T9 FAIL: the service role read back %', p;
  end if;
  raise notice 'T9 PASS: the service role writes and reads licence_image_path';
end $$;

-- T10 never blocks a signup: with a definer that cannot read auth.users
-- (owner moved to app_user for this block only) the signup still succeeds,
-- the row is left as inserted and a WARNING is logged
alter function public.lawyer_profile_from_signup() owner to app_user;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000db', 'db@example.test',
   '{"user_type":"lawyer","practice_kind":"consultant","license_number":"MOJ-B"}'::jsonb);
alter function public.lawyer_profile_from_signup() owner to postgres;
do $$
declare rec record;
begin
  select practice_kind, license_number into rec from public.lawyer_profiles
   where user_id = '00000000-0000-0000-0000-0000000000db';
  if rec is null then raise exception 'T10 FAIL: the signup lost its lawyer row'; end if;
  if rec.practice_kind <> 'advocate' or rec.license_number is not null then
    raise exception 'T10 FAIL: an unreadable auth.users still filled (%, %)', rec.practice_kind, rec.license_number;
  end if;
  raise notice 'T10 PASS: a definer that cannot read auth.users logs a WARNING and the signup goes through as (advocate, NULL)';
end $$;
