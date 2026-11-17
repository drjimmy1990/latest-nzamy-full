-- lawyer_registry.test.sql — proves 20261122_40 (launch batch R2/R3/R5/R6):
-- the server-only lawyers' registry, its two normalisers, the guest lookup,
-- the admin queue hint and the verified-licence unique index.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261122_40
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh $R/prelude_lawyer_registry_base.sql \
--     $M/20261122_40_lawyer_registry.sql $M/20261122_40_lawyer_registry.sql \
--     $R/lawyer_registry.test.sql
-- R6 skip path: lawyer_registry_r6_skip.test.sql.
--
-- NEGATIVE CONTROL (must FAIL at T0):
--   bash $R/run.sh $R/prelude_lawyer_registry_base.sql $R/lawyer_registry.test.sql
--
-- Every row below is SYNTHETIC (invented names, 99/… licences, 0500000…
-- mobiles). Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.lawyer_registry_lookup(text,text)') is null then
    raise exception 'T0 FAIL: public.lawyer_registry_lookup does not exist (20261122_40 not applied)';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

-- stubs.sql's default privileges hand app_user every new table directly; on
-- a real project app_user does not exist and the signed-in role is
-- authenticated. Drop the stub's direct grant so app_user holds exactly what
-- authenticated holds.
revoke all on public.lawyer_registry from app_user;

-- ── fixtures (postgres) ─────────────────────────────────────────────────────
insert into public.lawyer_registry (licence_raw, full_name, mobile, city, registry_status, expiry_date, registry_note) values
  ('99001',   'سَالِم أحمد إبراهيم الاختباري',   '0500000011', 'مدينة اختبار', 'رخصة سارية', '2099-01-01', 'موثق بالكامل'),
  ('99/0002', 'ناصر عبد الله يحيى التجريبي',     '0500000022', '(غير محدد)',   'رخصة سارية', '2099-01-01', 'موثق بالكامل'),
  ('99003',   'خالد محمد علي المكرر',            '0500000033', null,           'رخصة سارية', '2099-01-01', null),
  ('99004',   'خالد محمد علي المكرر',            '0500000044', null,           'رخصة سارية', '2099-01-01', null),
  ('99005',   'منتهي الرخصة صالح الاختباري',     '0500000055', null,           'رخصة سارية', '2000-01-01', null),
  ('99006',   'مؤرشف الرخصة سعد الاختباري',      '0500000066', null,           'رخصة سارية', '2099-01-01', 'محفوظ من القاعدة السابقة (غير ظاهر بالقائمة النشطة اليوم)'),
  ('99007',   'بلا تاريخ فهد الاختباري',          '0500000077', null,           'ساري',       null,         null);

-- T1 generated columns
select pg_temp.expect('T1 licence key with slash', (select licence_no from public.lawyer_registry where full_name like 'ناصر%'), '99/0002');
select pg_temp.expect('T1 name key strips tashkeel and spaces',
  (select name_key from public.lawyer_registry where licence_no = '99001'), 'سالماحمدابراهيمالاختباري');
select pg_temp.expect('T1 archived from the note', (select archived::text from public.lawyer_registry where licence_no = '99006'), 'true');
select pg_temp.expect('T1 not archived', (select archived::text from public.lawyer_registry where licence_no = '99001'), 'false');

-- T2 the licence key is unique
do $$
begin
  begin
    insert into public.lawyer_registry (licence_raw, full_name) values ('٩٩٠٠١', 'آخر');
    raise exception 'T2 FAIL: a second row with the same normalised licence was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- T3 anon / authenticated: no table, no function
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'app_user'] loop
    execute format('set local role %I', r);
    begin
      perform 1 from public.lawyer_registry limit 1;
      raise exception 'T3 FAIL: % could read lawyer_registry', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.lawyer_registry_lookup('99001', null);
      raise exception 'T3 FAIL: % could execute lawyer_registry_lookup', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.lawyer_registry_admin_matches(array['00000000-0000-0000-0000-00000000a001'::uuid]);
      raise exception 'T3 FAIL: % could execute lawyer_registry_admin_matches', r;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.lawyer_registry (licence_raw, full_name) values ('99999', 'دخيل');
      raise exception 'T3 FAIL: % could write lawyer_registry', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
end $$;

-- T4 service_role lookups
set role service_role;

select pg_temp.expect('T4 licence valid status', public.lawyer_registry_lookup('99001', null) ->> 'status', 'valid');
select pg_temp.expect('T4 licence valid name', public.lawyer_registry_lookup('99001', null) ->> 'name', 'سَالِم أحمد إبراهيم الاختباري');
select pg_temp.expect('T4 licence valid expiry', public.lawyer_registry_lookup('99001', null) ->> 'expiry', '2099-01-01');
select pg_temp.expect('T4 mobile hint = last two digits', public.lawyer_registry_lookup('99001', null) ->> 'mobile_hint', '11');
select pg_temp.expect('T4 the answer has exactly the safe keys',
  (select string_agg(k, ',' order by k) from jsonb_object_keys(public.lawyer_registry_lookup('99001', null)) k),
  'city,expiry,licence,mobile_hint,name,status');
select pg_temp.expect('T4 the full mobile never appears',
  (public.lawyer_registry_lookup('99001', null)::text like '%0500000011%')::text, 'false');
select pg_temp.expect('T4 Arabic-Indic digits + spaces', public.lawyer_registry_lookup(' ٩٩ / ٠٠٠٢ ', null) ->> 'licence', '99/0002');
select pg_temp.expect('T4 dash separator', public.lawyer_registry_lookup('99-0002', null) ->> 'status', 'valid');
select pg_temp.expect('T4 «(غير محدد)» city is dropped', public.lawyer_registry_lookup('99/0002', null) ->> 'city', null);
select pg_temp.expect('T4 licence wins over a wrong name', public.lawyer_registry_lookup('99001', 'اسم آخر تماما') ->> 'status', 'valid');
select pg_temp.expect('T4 unknown licence', public.lawyer_registry_lookup('12345', null)::text, '{"status": "not_found"}');
select pg_temp.expect('T4 expired carries no data', public.lawyer_registry_lookup('99005', null)::text, '{"status": "expired"}');
select pg_temp.expect('T4 archived carries no data', public.lawyer_registry_lookup('99006', null)::text, '{"status": "unverifiable"}');
select pg_temp.expect('T4 no expiry carries no data', public.lawyer_registry_lookup('99007', null)::text, '{"status": "unverifiable"}');

-- by name
select pg_temp.expect('T4 name without tashkeel, alef variant', public.lawyer_registry_lookup(null, 'سالم احمد ابراهيم الاختباري') ->> 'licence', '99001');
select pg_temp.expect('T4 name «عبدالله» joined', public.lawyer_registry_lookup('', 'ناصر عبدالله يحيى  التجريبي') ->> 'licence', '99/0002');
select pg_temp.expect('T4 name with ى for ي', public.lawyer_registry_lookup(null, 'ناصر عبد الله يحيي التجريبى') ->> 'status', 'valid');
select pg_temp.expect('T4 ambiguous name carries no data', public.lawyer_registry_lookup(null, 'خالد محمد علي المكرر')::text, '{"status": "ambiguous"}');
select pg_temp.expect('T4 partial name is not a match', public.lawyer_registry_lookup(null, 'سالم احمد')::text, '{"status": "not_found"}');
select pg_temp.expect('T4 too-short name', public.lawyer_registry_lookup(null, 'سالم')::text, '{"status": "not_found"}');
select pg_temp.expect('T4 nothing given', public.lawyer_registry_lookup(null, null)::text, '{"status": "not_found"}');

reset role;

-- T5 admin queue hint
insert into auth.users values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002'),
  ('00000000-0000-0000-0000-00000000a003'),
  ('00000000-0000-0000-0000-00000000a004');
insert into public.profiles (id, user_type, display_name, phone) values
  ('00000000-0000-0000-0000-00000000a001', 'lawyer', 'سالم الاختباري',               '+966500000011'),
  ('00000000-0000-0000-0000-00000000a002', 'lawyer', 'منتحل مختلف',                  '+966500000099'),
  ('00000000-0000-0000-0000-00000000a003', 'lawyer', 'ناصر عبدالله يحيى التجريبي',   null),
  ('00000000-0000-0000-0000-00000000a004', 'lawyer', 'بلا ترخيص',                     null);
insert into public.lawyer_profiles (user_id, license_number, verification_status) values
  ('00000000-0000-0000-0000-00000000a001', '99001',   'pending'),
  ('00000000-0000-0000-0000-00000000a002', '٩٩٠٠١',   'pending'),
  ('00000000-0000-0000-0000-00000000a003', '99/0002', 'pending'),
  ('00000000-0000-0000-0000-00000000a004', null,      'pending');

set role service_role;
create temp table m as
  select user_id, registry_match from public.lawyer_registry_admin_matches(array[
    '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a002',
    '00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a004']::uuid[]);
reset role;

select pg_temp.expect('T5 four rows', (select count(*)::text from m), '4');
select pg_temp.expect('T5 a001 valid', (select registry_match ->> 'status' from m where user_id = '00000000-0000-0000-0000-00000000a001'), 'valid');
select pg_temp.expect('T5 a001 partial name', (select registry_match ->> 'name_match' from m where user_id = '00000000-0000-0000-0000-00000000a001'), 'partial');
select pg_temp.expect('T5 a001 mobile matches', (select registry_match ->> 'mobile_match' from m where user_id = '00000000-0000-0000-0000-00000000a001'), 'true');
select pg_temp.expect('T5 a001 one other claim', (select registry_match ->> 'other_claims' from m where user_id = '00000000-0000-0000-0000-00000000a001'), '1');
select pg_temp.expect('T5 a002 different name', (select registry_match ->> 'name_match' from m where user_id = '00000000-0000-0000-0000-00000000a002'), 'different');
select pg_temp.expect('T5 a002 mobile differs', (select registry_match ->> 'mobile_match' from m where user_id = '00000000-0000-0000-0000-00000000a002'), 'false');
select pg_temp.expect('T5 a003 exact name', (select registry_match ->> 'name_match' from m where user_id = '00000000-0000-0000-0000-00000000a003'), 'exact');
select pg_temp.expect('T5 a003 no phone = unknown', (select registry_match ->> 'mobile_match' from m where user_id = '00000000-0000-0000-0000-00000000a003'), null);
select pg_temp.expect('T5 a004 no licence', (select registry_match ->> 'status' from m where user_id = '00000000-0000-0000-0000-00000000a004'), 'no_licence');
select pg_temp.expect('T5 the registry mobile never appears',
  (select bool_or(registry_match::text like '%0500000011%' or registry_match::text like '%mobile"%') from m)::text, 'false');

-- T6 R6: two pending accounts may share a licence; a second VERIFIED may not
select pg_temp.expect('T6 index exists', (to_regclass('public.lawyer_profiles_verified_licence_uniq') is not null)::text, 'true');
update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-00000000a001';
do $$
begin
  begin
    update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-00000000a002';
    raise exception 'T6 FAIL: a second verified account on the same (normalised) licence was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- T7 a signed-in lawyer can still save his licence number (the index
-- expression calls the normaliser while authenticated writes the row)
grant update (license_number) on public.lawyer_profiles to authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a001', false);
set role app_user;
update public.lawyer_profiles set license_number = '99/0001' where user_id = '00000000-0000-0000-0000-00000000a001';
reset role;
select pg_temp.expect('T7 saved', (select license_number from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000a001'), '99/0001');

do $$ begin raise notice 'lawyer_registry: all assertions passed'; end $$;
