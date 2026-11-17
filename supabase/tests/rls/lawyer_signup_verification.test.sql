-- lawyer_signup_verification.test.sql — proves 20261124_70 (batch l3, owner
-- decisions ٢٠–٢١): the signup verification tables, the four service-role
-- functions, the private bucket and its own-folder insert policy.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261124_70
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh $R/prelude_lawyer_registry_base.sql \
--     $R/prelude_storage_objects_stub.sql $R/prelude_storage_buckets_stub.sql \
--     $M/20261122_40_lawyer_registry.sql \
--     $M/20261124_70_lawyer_signup_verification.sql $M/20261124_70_lawyer_signup_verification.sql \
--     $R/lawyer_signup_verification.test.sql
--
-- NEGATIVE CONTROL (must FAIL at T0):
--   bash $R/run.sh $R/prelude_lawyer_registry_base.sql $R/prelude_storage_objects_stub.sql \
--     $R/prelude_storage_buckets_stub.sql $M/20261122_40_lawyer_registry.sql $R/lawyer_signup_verification.test.sql
--
-- Every row is SYNTHETIC (invented names, 99… licences, 0500000… mobiles).
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regprocedure('public.lawyer_otp_verify(uuid,text,text)') is null then
    raise exception 'T0 FAIL: public.lawyer_otp_verify does not exist (20261124_70 not applied)';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

-- stubs.sql hands app_user every new table directly; on a real project the
-- signed-in role is authenticated. Make app_user hold exactly what
-- authenticated holds.
revoke all on public.lawyer_signup_verifications, public.lawyer_otp_challenges,
              public.lawyer_licence_images, public.lawyer_registry from app_user;
alter table storage.objects enable row level security;

-- ── fixtures (postgres) ─────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000b001'),
  ('00000000-0000-0000-0000-00000000b002'),
  ('00000000-0000-0000-0000-00000000b003'),
  ('00000000-0000-0000-0000-00000000b004');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000b001', 'lawyer', 'سالم الاختباري'),
  ('00000000-0000-0000-0000-00000000b002', 'lawyer', 'منتحل'),
  ('00000000-0000-0000-0000-00000000b003', 'lawyer', 'منتهي'),
  ('00000000-0000-0000-0000-00000000b004', 'lawyer', 'موثق سابق');
insert into public.lawyer_profiles (user_id, license_number, verification_status) values
  ('00000000-0000-0000-0000-00000000b001', '٩٩٠٠١', 'pending'),
  ('00000000-0000-0000-0000-00000000b002', '99404', 'pending'),
  ('00000000-0000-0000-0000-00000000b003', '99005', 'pending'),
  ('00000000-0000-0000-0000-00000000b004', '99008', 'verified');
insert into public.lawyer_registry (licence_raw, full_name, mobile, expiry_date, registry_note) values
  ('99001', 'سَالِم أحمد إبراهيم محمد الاختباري', '0500000011', '2099-01-01', null),
  ('99005', 'منتهي الرخصة صالح الاختباري',        '0500000055', '2000-01-01', null),
  ('99006', 'مؤرشف الرخصة سعد الاختباري',         '0500000066', '2099-01-01', 'محفوظ من القاعدة السابقة (غير ظاهر)'),
  ('99008', 'موثق سابق علي الاختباري',            '0500000088', '2099-01-01', null);

-- T1 sessions hold nothing on the server-only tables and functions
select set_config('test.uid', '00000000-0000-0000-0000-00000000b001', false);
set role app_user;
do $$
begin
  begin
    perform 1 from public.lawyer_otp_challenges;
    raise exception 'T1 FAIL: a session read lawyer_otp_challenges';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.lawyer_licence_images;
    raise exception 'T1 FAIL: a session read lawyer_licence_images';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lawyer_signup_registry_mobile('00000000-0000-0000-0000-00000000b001');
    raise exception 'T1 FAIL: a session executed lawyer_signup_registry_mobile';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b001', 'identity', repeat('a', 64));
    raise exception 'T1 FAIL: a session executed lawyer_otp_verify';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b001', 'x');
    raise exception 'T1 FAIL: a session executed lawyer_signup_registry_check';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lawyer_signup_verifications (user_id, decision)
    values ('00000000-0000-0000-0000-00000000b001', 'approved');
    raise exception 'T1 FAIL: a session wrote its own verification row';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T2 registry check (service_role): valid + subset name, mobile hint only
set role service_role;
select pg_temp.expect('T2 valid',
  public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b001', 'سالم أحمد إبراهيم الاختباري') ->> 'status', 'valid');
select pg_temp.expect('T2 subset name',
  (select name_match from public.lawyer_signup_verifications where user_id = '00000000-0000-0000-0000-00000000b001'), 'subset');
select pg_temp.expect('T2 exact name',
  public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b001', 'سالم احمد ابراهيم محمد الاختباري') ->> 'name_match', 'exact');
select pg_temp.expect('T2 three words is different',
  public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b001', 'سالم أحمد الاختباري') ->> 'name_match', 'different');
select pg_temp.expect('T2 hint', (select mobile_hint from public.lawyer_signup_verifications where user_id = '00000000-0000-0000-0000-00000000b001'), '11');
select pg_temp.expect('T2 licence normalised', (select licence_no from public.lawyer_signup_verifications where user_id = '00000000-0000-0000-0000-00000000b001'), '99001');
do $$
declare j jsonb := public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b001', 'سالم أحمد إبراهيم الاختباري');
begin
  if j::text like '%0500000011%' or j::text like '%500000011%' then
    raise exception 'T2 FAIL: the registry check returned the mobile: %', j;
  end if;
end $$;
select pg_temp.expect('T2 not found', public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b002', 'منتحل اسم كامل رباعي') ->> 'status', 'not_found');
select pg_temp.expect('T2 not found has no mobile', public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b002', null) ->> 'has_mobile', 'false');
select pg_temp.expect('T2 expired', public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b003', null) ->> 'status', 'expired');
select pg_temp.expect('T2 expired has no hint', public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b003', null) ->> 'mobile_hint', null);
select pg_temp.expect('T2 no profile', public.lawyer_signup_registry_check('00000000-0000-0000-0000-0000000000ff', null) ->> 'status', 'no_profile');

-- T3 the registry mobile: own valid licence only
select pg_temp.expect('T3 mobile', public.lawyer_signup_registry_mobile('00000000-0000-0000-0000-00000000b001'), '0500000011');
select pg_temp.expect('T3 expired → none', public.lawyer_signup_registry_mobile('00000000-0000-0000-0000-00000000b003'), null);
select pg_temp.expect('T3 not found → none', public.lawyer_signup_registry_mobile('00000000-0000-0000-0000-00000000b002'), null);
reset role;

-- T4 other verified claims
update public.lawyer_profiles set license_number = '99008' where user_id = '00000000-0000-0000-0000-00000000b002';
set role service_role;
select pg_temp.expect('T4 claim counted',
  public.lawyer_signup_registry_check('00000000-0000-0000-0000-00000000b002', null) ->> 'other_verified_claims', '1');
reset role;

-- T5 issue: cooldown, per-user limit, per-target limit
set role service_role;
select pg_temp.expect('T5 first issue',
  public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b001', 'identity', 'whatsapp', '99001',
                          repeat('1', 64), '11', repeat('c', 64)) ->> 'ok', 'true');
select pg_temp.expect('T5 cooldown on the same channel',
  public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b001', 'identity', 'whatsapp', '99001',
                          repeat('1', 64), '11', repeat('c', 64)) ->> 'reason', 'cooldown');
select pg_temp.expect('T5 another channel may send at once',
  public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b001', 'identity', 'sms', '99001',
                          repeat('1', 64), '11', repeat('d', 64)) ->> 'ok', 'true');
reset role;
-- three more in the last hour (backdated past the cooldown) → the 6th is refused
insert into public.lawyer_otp_challenges (user_id, purpose, channel, licence_no, target_hash, code_hash, created_at, consumed_at)
select '00000000-0000-0000-0000-00000000b001', 'identity', 'whatsapp', '99001', repeat('2', 64), repeat('e', 64),
       now() - interval '10 minutes', now()
  from generate_series(1, 3);
update public.lawyer_otp_challenges set created_at = now() - interval '5 minutes'
 where user_id = '00000000-0000-0000-0000-00000000b001' and channel = 'whatsapp' and target_hash = repeat('1', 64);
set role service_role;
select pg_temp.expect('T5 per-user limit (5 per hour)',
  public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b001', 'identity', 'whatsapp', '99001',
                          repeat('1', 64), '11', repeat('c', 64)) ->> 'reason', 'user_limit');
reset role;
insert into public.lawyer_otp_challenges (user_id, purpose, channel, target_hash, code_hash, created_at, expires_at)
select '00000000-0000-0000-0000-00000000b004', 'email', 'email', repeat('9', 64), repeat('e', 64), now() - interval '2 hours', now() - interval '110 minutes'
  from generate_series(1, 10);
set role service_role;
select pg_temp.expect('T5 per-target limit across accounts (10 per 24 h)',
  public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b003', 'email', 'email', null,
                          repeat('9', 64), 'x•••@example.test', repeat('c', 64)) ->> 'reason', 'target_limit');
do $$
begin
  begin
    perform public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b003', 'identity', 'email', null,
                                    repeat('8', 64), null, repeat('c', 64));
    raise exception 'T5 FAIL: an identity code by e-mail was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b003', 'email', 'email', null,
                                    repeat('8', 64), null, '123456');
    raise exception 'T5 FAIL: a plaintext code was accepted';
  exception when check_violation then null;
  end;
end $$;

-- T6 verify: wrong → attempts, right → consumed + stamped with the licence
select pg_temp.expect('T6 wrong',
  public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b001', 'identity', repeat('f', 64)) ->> 'reason', 'wrong');
select pg_temp.expect('T6 attempts left', public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b001', 'identity', repeat('f', 64)) ->> 'attempts_left', '3');
select pg_temp.expect('T6 an e-mail code never passes the identity check',
  public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b001', 'email', repeat('c', 64)) ->> 'ok', 'false');
select pg_temp.expect('T6 right (the sms code)',
  public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b001', 'identity', repeat('d', 64)) ->> 'ok', 'true');
select pg_temp.expect('T6 stamped licence',
  (select identity_otp_licence_no from public.lawyer_signup_verifications where user_id = '00000000-0000-0000-0000-00000000b001'), '99001');
select pg_temp.expect('T6 stamped channel',
  (select identity_otp_channel from public.lawyer_signup_verifications where user_id = '00000000-0000-0000-0000-00000000b001'), 'sms');
select pg_temp.expect('T6 every open code consumed',
  (select count(*)::text from public.lawyer_otp_challenges
    where user_id = '00000000-0000-0000-0000-00000000b001' and purpose = 'identity' and consumed_at is null), '0');
select pg_temp.expect('T6 reuse refused',
  public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b001', 'identity', repeat('d', 64)) ->> 'reason', 'expired');
reset role;

-- T7 five wrong attempts lock the code; an expired code is refused
insert into public.lawyer_otp_challenges (user_id, purpose, channel, target_hash, target_hint, code_hash)
values ('00000000-0000-0000-0000-00000000b003', 'email', 'email', repeat('7', 64), 'x•••@example.test', repeat('a', 64));
set role service_role;
select public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b003', 'email', repeat('b', 64)) from generate_series(1, 5);
select pg_temp.expect('T7 locked after 5',
  public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b003', 'email', repeat('a', 64)) ->> 'reason', 'locked');
reset role;
insert into public.lawyer_otp_challenges (user_id, purpose, channel, target_hash, code_hash, expires_at, created_at)
values ('00000000-0000-0000-0000-00000000b004', 'email', 'email', repeat('6', 64), repeat('a', 64), now() - interval '1 minute', now() - interval '11 minutes');
set role service_role;
select pg_temp.expect('T7 expired',
  public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b004', 'email', repeat('a', 64)) ->> 'reason', 'expired');
select pg_temp.expect('T7 e-mail ok stamps the e-mail',
  (public.lawyer_otp_issue('00000000-0000-0000-0000-00000000b004', 'email', 'email', null, repeat('5', 64), 'm•••@example.test', repeat('a', 64)) ->> 'ok')
  || (public.lawyer_otp_verify('00000000-0000-0000-0000-00000000b004', 'email', repeat('a', 64)) ->> 'ok'), 'truetrue');
select pg_temp.expect('T7 e-mail hint stamped',
  (select email_otp_hint from public.lawyer_signup_verifications where user_id = '00000000-0000-0000-0000-00000000b004'), 'm•••@example.test');
reset role;

-- T8 the lawyer reads his own row, safe columns only; never another's
update public.lawyer_signup_verifications set decision = 'review', decision_reasons = '{registry_not_found}'
 where user_id = '00000000-0000-0000-0000-00000000b002';
select set_config('test.uid', '00000000-0000-0000-0000-00000000b001', false);
set role app_user;
select pg_temp.expect('T8 own row', (select registry_status from public.lawyer_signup_verifications), 'valid');
select pg_temp.expect('T8 one row only', (select count(*)::text from public.lawyer_signup_verifications), '1');
do $$
begin
  begin
    perform licence_no from public.lawyer_signup_verifications;
    raise exception 'T8 FAIL: a session read licence_no';
  exception when insufficient_privilege then null;
  end;
  begin
    perform mobile_change_new_mobile from public.lawyer_signup_verifications;
    raise exception 'T8 FAIL: a session read mobile_change_new_mobile';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.lawyer_signup_verifications set decision = 'approved';
    raise exception 'T8 FAIL: a session updated its decision';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T9 licence images: own folder only
do $$
begin
  begin
    insert into public.lawyer_licence_images (user_id, storage_path, mime, size_bytes)
    values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b002/x.jpg', 'image/jpeg', 10);
    raise exception 'T9 FAIL: a path in another user''s folder was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.lawyer_licence_images (user_id, storage_path, mime, size_bytes)
    values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b001/x.gif', 'image/gif', 10);
    raise exception 'T9 FAIL: a gif was accepted';
  exception when check_violation then null;
  end;
end $$;
insert into public.lawyer_licence_images (user_id, storage_path, mime, size_bytes, ai_status, provider_copy)
values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b001/1-licence.jpg', 'image/jpeg', 10, 'skipped', 'none');

-- T10 the bucket is private; a session inserts into its own folder only and reads nothing
select pg_temp.expect('T10 private bucket', (select public::text from storage.buckets where id = 'lawyer-licences'), 'false');
select pg_temp.expect('T10 5 MB', (select file_size_limit::text from storage.buckets where id = 'lawyer-licences'), '5242880');
insert into storage.objects (bucket_id, name, owner)
values ('lawyer-licences', '00000000-0000-0000-0000-00000000b002/secret.jpg', '00000000-0000-0000-0000-00000000b002');
select set_config('test.uid', '00000000-0000-0000-0000-00000000b001', false);
set role app_user;
insert into storage.objects (bucket_id, name, owner)
values ('lawyer-licences', '00000000-0000-0000-0000-00000000b001/own.jpg', '00000000-0000-0000-0000-00000000b001');
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('lawyer-licences', '00000000-0000-0000-0000-00000000b002/evil.jpg');
    raise exception 'T10 FAIL: a session wrote into another user''s folder';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('lawyer-licences', 'loose.jpg');
    raise exception 'T10 FAIL: a session wrote outside any folder';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.expect('T10 no read, not even its own', (select count(*)::text from storage.objects where bucket_id = 'lawyer-licences'), '0');
update storage.objects set name = '00000000-0000-0000-0000-00000000b001/swap.jpg' where bucket_id = 'lawyer-licences';
delete from storage.objects where bucket_id = 'lawyer-licences';
reset role;
select pg_temp.expect('T10 update/delete touched nothing',
  (select string_agg(name, ',' order by name) from storage.objects where bucket_id = 'lawyer-licences'),
  '00000000-0000-0000-0000-00000000b001/own.jpg,00000000-0000-0000-0000-00000000b002/secret.jpg');

-- T11 anon holds nothing
set role anon;
do $$
begin
  begin
    perform 1 from public.lawyer_signup_verifications;
    raise exception 'T11 FAIL: anon read lawyer_signup_verifications';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'lawyer_signup_verification: ALL PASS' as result;
