-- l7_community.test.sql — proves 20261127_60 (batch l7, owner ٢٥ / ٤٠ / ٤٢).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261127_60
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_auth_sessions_live.sql $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql \
--     $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261108_20_library_device_limit.sql \
--     $R/prelude_platform_settings_min.sql $R/prelude_l7_community.sql \
--     $M/20261127_60_community_review_devices_freeze.sql $M/20261127_60_community_review_devices_freeze.sql \
--     $R/l7_community.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261127_60 files fails at T0.
--
-- Actors (prelude_community_live_schema): L1, L2 verified lawyers; P pending
-- lawyer; C client. Added here: M admin, F firm owner, D device user.
-- Every assertion RAISES on failure.

do $$
begin
  if to_regprocedure('public.library_device_gate(uuid,text,text,uuid,boolean)') is null
     or to_regprocedure('public.account_freeze_lift(uuid,uuid)') is null then
    raise exception 'T0 FAIL: 20261127_60 is not applied';
  end if;
end $$;

revoke all on public.user_devices from app_user;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000ad'),
  ('00000000-0000-0000-0000-0000000000ff'),
  ('00000000-0000-0000-0000-0000000000dd');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000ad', 'admin', 'M'),
  ('00000000-0000-0000-0000-0000000000ff', 'firm', 'F'),
  ('00000000-0000-0000-0000-0000000000dd', 'individual', 'D');

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

-- ═════ A. community ══════════════════════════════════════════════════════════
-- T1 the setting row exists, ON
select pg_temp.expect('T1 setting', (select value::text from public.platform_settings where key = 'community_prepublish_review'), 'true');

-- T2 a member's new post is pending; only he reads it
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
insert into public.community_posts (author_id, title, body, visibility)
values ('c0000000-0000-0000-0000-00000000000c', 'سؤال جديد', 'نص', 'public');
reset role;
update public.community_posts set id = '77777777-aaaa-0000-0000-000000000007' where title = 'سؤال جديد';
set role authenticated;
select pg_temp.expect('T2 author reads own pending',
  (select status from public.community_posts where id = '77777777-aaaa-0000-0000-000000000007'), 'pending_review');
-- the author cannot answer his own pending post (community_post_readable stays closed)
do $$
begin
  insert into public.community_answers (post_id, author_id, body)
  values ('77777777-aaaa-0000-0000-000000000007', 'c0000000-0000-0000-0000-00000000000c', 'رد');
  raise exception 'T2 FAIL: an answer on a pending post was accepted';
exception when insufficient_privilege then null;
end $$;
select set_config('test.uid', 'a1000000-0000-0000-0000-000000000001', false);
select pg_temp.expect('T2 another member', (select count(*)::text from public.community_posts where id = '77777777-aaaa-0000-0000-000000000007'), '0');
reset role;
set role anon;
select set_config('test.uid', '', false);
select pg_temp.expect('T2 guest', (select count(*)::text from public.community_posts where id = '77777777-aaaa-0000-0000-000000000007'), '0');
reset role;

-- T3 a lawyer's answer on the public post is pending; the guest does not see it, the author does
set role authenticated;
select set_config('test.uid', 'a1000000-0000-0000-0000-000000000001', false);
insert into public.community_answers (post_id, author_id, body, is_lawyer_verified)
values ('22222222-aaaa-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'جواب', true);
reset role;
update public.community_answers set id = '88888888-aaaa-0000-0000-000000000008' where body = 'جواب';
set role authenticated;
select pg_temp.expect('T3 author reads own pending answer',
  (select status from public.community_answers where id = '88888888-aaaa-0000-0000-000000000008'), 'pending_review');
reset role;
set role anon;
select set_config('test.uid', '', false);
select pg_temp.expect('T3 guest', (select count(*)::text from public.community_answers where id = '88888888-aaaa-0000-0000-000000000008'), '0');
reset role;
select pg_temp.expect('T3 answer_count ignores pending',
  (select answer_count::text from public.community_posts where id = '22222222-aaaa-0000-0000-000000000002'), '0');

-- T4 the reviewer (service role) approves: public, counted
set role service_role;
update public.community_posts set status = 'active', reviewed_at = now() where id = '77777777-aaaa-0000-0000-000000000007';
update public.community_answers set status = 'active', reviewed_at = now() where id = '88888888-aaaa-0000-0000-000000000008';
reset role;
set role anon;
select set_config('test.uid', '', false);
select pg_temp.expect('T4 guest reads approved post', (select count(*)::text from public.community_posts where id = '77777777-aaaa-0000-0000-000000000007'), '1');
select pg_temp.expect('T4 guest reads approved answer', (select count(*)::text from public.community_answers where id = '88888888-aaaa-0000-0000-000000000008'), '1');
reset role;
select pg_temp.expect('T4 answer counted',
  (select answer_count::text from public.community_posts where id = '22222222-aaaa-0000-0000-000000000002'), '1');

-- T5 an edit of an approved post / answer goes back to review
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
update public.community_posts set body = 'نص معدّل' where id = '77777777-aaaa-0000-0000-000000000007';
select pg_temp.expect('T5 edited post', (select status from public.community_posts where id = '77777777-aaaa-0000-0000-000000000007'), 'pending_review');
select set_config('test.uid', 'a1000000-0000-0000-0000-000000000001', false);
update public.community_answers set body = 'جواب معدّل' where id = '88888888-aaaa-0000-0000-000000000008';
select pg_temp.expect('T5 edited answer', (select status from public.community_answers where id = '88888888-aaaa-0000-0000-000000000008'), 'pending_review');
reset role;

-- T6 a rejection with a reason: the author reads it, nobody else
update public.community_posts set status = 'rejected', review_note = 'خارج موضوع المجتمع', reviewed_at = now()
 where id = '77777777-aaaa-0000-0000-000000000007';
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect('T6 author reads the reason',
  (select review_note from public.community_posts where id = '77777777-aaaa-0000-0000-000000000007'), 'خارج موضوع المجتمع');
select set_config('test.uid', 'a2000000-0000-0000-0000-000000000002', false);
select pg_temp.expect('T6 other member', (select count(*)::text from public.community_posts where id = '77777777-aaaa-0000-0000-000000000007'), '0');
-- a member cannot set the status himself
do $$
begin
  update public.community_posts set status = 'active' where id = '22222222-aaaa-0000-0000-000000000002';
  raise exception 'T6 FAIL: a member wrote status';
exception when insufficient_privilege then null;
end $$;
reset role;

-- T7 staff and the service role publish at once; the setting off publishes at once
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
insert into public.community_posts (author_id, title, body) values
  ('00000000-0000-0000-0000-0000000000ad', 'إعلان', 'نص');
reset role;
update public.community_posts set id = '99999999-aaaa-0000-0000-000000000009' where title = 'إعلان';
select pg_temp.expect('T7 staff post', (select status from public.community_posts where id = '99999999-aaaa-0000-0000-000000000009'), 'active');
update public.platform_settings set value = 'false'::jsonb where key = 'community_prepublish_review';
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
insert into public.community_posts (author_id, title, body) values
  ('c0000000-0000-0000-0000-00000000000c', 'بلا مراجعة', 'نص');
reset role;
update public.community_posts set id = 'aaaaaaaa-aaaa-0000-0000-00000000000a' where title = 'بلا مراجعة';
select pg_temp.expect('T7 setting off', (select status from public.community_posts where id = 'aaaaaaaa-aaaa-0000-0000-00000000000a'), 'active');
update public.platform_settings set value = 'true'::jsonb where key = 'community_prepublish_review';

-- T8 «مكتب موثّق»: verified CR + a verified lawyer member with a valid licence
insert into public.firm_profiles (id, owner_user_id, name_ar, verification_status) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000ff', 'مكتب', 'verified');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-000000000001', 'lawyer', 'active');
update public.lawyer_profiles set license_expiry = current_date + 30 where user_id = 'a1000000-0000-0000-0000-000000000001';
set role service_role;
select pg_temp.expect('T8 verified office',
  (select string_agg(x::text, ',') from public.community_verified_office_users(array[
     '00000000-0000-0000-0000-0000000000ff', 'c0000000-0000-0000-0000-00000000000c']::uuid[]) x),
  '00000000-0000-0000-0000-0000000000ff');
reset role;
update public.lawyer_profiles set license_expiry = current_date - 1 where user_id = 'a1000000-0000-0000-0000-000000000001';
set role service_role;
select pg_temp.expect('T8 expired licence',
  (select count(*)::text from public.community_verified_office_users(array['00000000-0000-0000-0000-0000000000ff']::uuid[])), '0');
reset role;
update public.lawyer_profiles set license_expiry = current_date + 30 where user_id = 'a1000000-0000-0000-0000-000000000001';
update public.firm_profiles set verification_status = 'pending' where id = 'ffffffff-0000-0000-0000-0000000000f1';
set role service_role;
select pg_temp.expect('T8 CR not verified',
  (select count(*)::text from public.community_verified_office_users(array['00000000-0000-0000-0000-0000000000ff']::uuid[])), '0');
reset role;
set role authenticated;
do $$
begin
  perform public.community_verified_office_users(array['00000000-0000-0000-0000-0000000000ff']::uuid[]);
  raise exception 'T8 FAIL: authenticated called the office function';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ═════ B. freeze ═════════════════════════════════════════════════════════════
insert into public.subscriptions (id, user_id, status, current_period_end) values
  ('5b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 'active', '2027-01-01T00:00:00Z'),
  ('5b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', 'cancelled', '2027-01-01T00:00:00Z');
insert into public.library_access_grants (id, user_id, ends_at, revoked_at) values
  ('6b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', '2027-02-01T00:00:00Z', null),
  ('6b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', '2027-02-01T00:00:00Z', null);
insert into public.founder_seats (id, user_id, status, ends_at) values
  ('7b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 'active', '2027-03-01T00:00:00Z');
insert into public.membership_credits (id, user_id, remaining, ends_at) values
  ('8b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 6, '2027-03-01T00:00:00Z');
insert into public.points_lots (id, user_id, points_left, expires_at) values
  ('9b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 50, '2027-04-01T00:00:00Z'),
  ('9b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', 0, '2027-04-01T00:00:00Z');

-- T9 user roles cannot touch the freeze
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000dd', false);
do $$
begin
  perform public.account_freeze_lift('00000000-0000-0000-0000-0000000000dd', null);
  raise exception 'T9 FAIL: authenticated lifted a freeze';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform 1 from public.account_suspension_freezes;
  raise exception 'T9 FAIL: authenticated read the freezes';
exception when insufficient_privilege then null;
end $$;
reset role;

-- T10 open → snapshot (cancelled sub and empty lot left out); a second open is the same freeze
set role service_role;
select pg_temp.expect('T10 open',
  (select (public.account_freeze_open('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000ad', 'admin')
           -> 'counts')::text),
  '{"points_lots": 1, "founder_seats": 1, "subscriptions": 1, "membership_credits": 1, "library_access_grants": 2}');
select pg_temp.expect('T10 second open',
  (select public.account_freeze_open('00000000-0000-0000-0000-0000000000dd', null, 'device_limit') ->> 'state'), 'already_frozen');
reset role;
select pg_temp.expect('T10 nothing cancelled',
  (select status from public.subscriptions where id = '5b000000-0000-0000-0000-000000000001'), 'active');

-- T11 ten days later: lift adds ten days to exactly the live snapshot rows
update public.account_suspension_freezes set frozen_at = now() - interval '10 days'
 where user_id = '00000000-0000-0000-0000-0000000000dd' and lifted_at is null;
-- one grant was revoked during the freeze: it is not extended
update public.library_access_grants set revoked_at = now() where id = '6b000000-0000-0000-0000-000000000002';
set role service_role;
select pg_temp.expect('T11 lift',
  (select (public.account_freeze_lift('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000ad')
           -> 'extended')::text),
  '{"points_lots": 1, "founder_seats": 1, "subscriptions": 1, "membership_credits": 1, "library_access_grants": 1}');
select pg_temp.expect('T11 second lift',
  (select public.account_freeze_lift('00000000-0000-0000-0000-0000000000dd', null) ->> 'state'), 'not_frozen');
reset role;
select pg_temp.expect('T11 sub end',
  (select (current_period_end > '2027-01-10T23:59:00Z' and current_period_end < '2027-01-11T00:01:00Z')::text
     from public.subscriptions where id = '5b000000-0000-0000-0000-000000000001'), 'true');
select pg_temp.expect('T11 cancelled sub untouched',
  (select current_period_end::text = '2027-01-01 00:00:00+00' from public.subscriptions where id = '5b000000-0000-0000-0000-000000000002')::text, 'true');
select pg_temp.expect('T11 revoked grant untouched',
  (select (ends_at = '2027-02-01T00:00:00Z')::text from public.library_access_grants where id = '6b000000-0000-0000-0000-000000000002'), 'true');
select pg_temp.expect('T11 seat extended',
  (select (ends_at > '2027-03-10T23:59:00Z')::text from public.founder_seats where id = '7b000000-0000-0000-0000-000000000001'), 'true');
select pg_temp.expect('T11 empty lot untouched',
  (select (expires_at = '2027-04-01T00:00:00Z')::text from public.points_lots where id = '9b000000-0000-0000-0000-000000000002'), 'true');

-- ═════ C. devices ════════════════════════════════════════════════════════════
create or replace function pg_temp.h(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;
create or replace function pg_temp.gate(d text, s uuid, code boolean default true) returns text language sql as $$
  select status from public.library_device_gate('00000000-0000-0000-0000-0000000000dd'::uuid, pg_temp.h(d), 'جهاز', s, code)
$$;

-- T12 grandfathered: the device registered before this file is verified
select pg_temp.expect('T12 grandfathered',
  (select (verified_at = first_seen)::text from public.user_devices where user_id = '00000000-0000-0000-0000-00000000e00f'), 'true');

-- T13 off → disabled, nothing written
select pg_temp.expect('T13 off', pg_temp.gate('dev-1', null), 'disabled');
update public.library_monitor_settings set device_limit_enabled = true where id;

insert into auth.sessions (id, user_id) values
  ('5e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd'),
  ('5e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd'),
  ('5e000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000dd'),
  ('5e000000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001');

-- T14 a new device needs a code; the pending row does not count
select pg_temp.expect('T14 new device', pg_temp.gate('dev-1', '5e000000-0000-0000-0000-000000000001'), 'needs_code');
select pg_temp.expect('T14 pending', (select (verified_at is null)::text from public.user_devices where device_hash = pg_temp.h('dev-1')), 'true');
select pg_temp.expect('T14 issue',
  public.library_device_code_issue('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-1'), pg_temp.h('code-111111')) ->> 'state', 'issued');
select pg_temp.expect('T14 cooldown',
  public.library_device_code_issue('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-1'), pg_temp.h('code-222222')) ->> 'state', 'cooldown');
select pg_temp.expect('T14 wrong code',
  public.library_device_code_verify('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-1'), pg_temp.h('code-999999'),
                                    '5e000000-0000-0000-0000-000000000001') ->> 'state', 'wrong');
select pg_temp.expect('T14 right code',
  public.library_device_code_verify('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-1'), pg_temp.h('code-111111'),
                                    '5e000000-0000-0000-0000-000000000001') ->> 'sessions_ended', '2');
select pg_temp.expect('T14 only this session left',
  (select string_agg(id::text, ',') from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000dd'),
  '5e000000-0000-0000-0000-000000000001');
select pg_temp.expect('T14 other users untouched',
  (select count(*)::text from auth.sessions where user_id = 'a1000000-0000-0000-0000-000000000001'), '1');
select pg_temp.expect('T14 known device', pg_temp.gate('dev-1', '5e000000-0000-0000-0000-000000000001'), 'ok');

-- T15 the second device (a phone) after its code; then the computer opens again → the phone's session ends
insert into auth.sessions (id, user_id) values ('5e000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000dd');
select pg_temp.expect('T15 phone', pg_temp.gate('dev-2', '5e000000-0000-0000-0000-000000000004'), 'needs_code');
select public.library_device_code_issue('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-2'), pg_temp.h('code-333333'));
select pg_temp.expect('T15 phone verified',
  public.library_device_code_verify('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-2'), pg_temp.h('code-333333'),
                                    '5e000000-0000-0000-0000-000000000004') ->> 'state', 'verified');
select pg_temp.expect('T15 computer signed out',
  (select string_agg(id::text, ',') from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000dd'),
  '5e000000-0000-0000-0000-000000000004');
insert into auth.sessions (id, user_id) values ('5e000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000dd');
select pg_temp.expect('T15 computer back', pg_temp.gate('dev-1', '5e000000-0000-0000-0000-000000000005'), 'ok');
select pg_temp.expect('T15 phone signed out',
  (select string_agg(id::text, ',') from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000dd'),
  '5e000000-0000-0000-0000-000000000005');

-- T16 a third, never-verified device → suspend; a known signed-out device → refused
select pg_temp.expect('T16 third device', pg_temp.gate('dev-3', '5e000000-0000-0000-0000-000000000005'), 'suspend');
select pg_temp.expect('T16 no row for it', (select count(*)::text from public.user_devices where device_hash = pg_temp.h('dev-3')), '0');
select public.library_device_revoke('00000000-0000-0000-0000-0000000000dd', null, pg_temp.h('dev-2'), 'sign_out', null);
select pg_temp.expect('T16 room again: a fresh device needs a code', pg_temp.gate('dev-3', '5e000000-0000-0000-0000-000000000005'), 'needs_code');
select pg_temp.expect('T16 the signed-out phone comes back without a code', pg_temp.gate('dev-2', null), 'ok');

-- T17 no e-mail possible → registered at once (never a lock-out)
select public.library_device_revoke('00000000-0000-0000-0000-0000000000dd', null, pg_temp.h('dev-2'), 'self', null);
select pg_temp.expect('T17 registered', pg_temp.gate('dev-4', null, false), 'registered');

-- T18 attempts run out
select public.library_device_revoke('00000000-0000-0000-0000-0000000000dd', null, pg_temp.h('dev-4'), 'self', null);
select pg_temp.gate('dev-5', null);
select public.library_device_code_issue('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-5'), pg_temp.h('code-555555'));
select public.library_device_code_verify('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-5'), pg_temp.h('x' || n), null)
  from generate_series(1, 5) n;
select pg_temp.expect('T18 too many',
  public.library_device_code_verify('00000000-0000-0000-0000-0000000000dd', pg_temp.h('dev-5'), pg_temp.h('code-555555'), null) ->> 'state',
  'too_many');

-- T19 the hash, the code hash and the session id stay unreadable to the user
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000dd', false);
do $$
begin
  perform code_hash from public.user_devices;
  raise exception 'T19 FAIL: the user read code_hash';
exception when insufficient_privilege then null;
end $$;
select pg_temp.expect('T19 own rows readable', (select (count(*) > 0)::text from public.user_devices), 'true');
do $$
begin
  perform public.library_device_gate('00000000-0000-0000-0000-0000000000dd', repeat('a', 64), 'x', null, true);
  raise exception 'T19 FAIL: authenticated called the gate';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'l7_community: ALL PASS' as result;
