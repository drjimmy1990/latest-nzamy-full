-- l11_community_verified_firms.test.sql — proves 20261201_50 (batch l11,
-- N05-C2 / owner ٤٢: a «مكتب موثّق» takes part in lawyers-only content).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). It is the l7
-- chain plus 20261201_50 TWICE (it must be re-runnable). From the repo root,
-- in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_auth_sessions_live.sql $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql \
--     $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261108_20_library_device_limit.sql \
--     $R/prelude_platform_settings_min.sql $R/prelude_l7_community.sql \
--     $M/20261127_60_community_review_devices_freeze.sql \
--     $M/20261201_50_community_verified_firms.sql $M/20261201_50_community_verified_firms.sql \
--     $R/l11_community_verified_firms.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261201_50 files fails at
-- T1 (the verified firm cannot read the lawyers-only post).
--
-- Actors (prelude_community_live_schema): L1, L2 verified lawyers; P pending
-- lawyer; C client. Post LP = L1's lawyers-only post, answered by L2.
-- Added here:
--   FV  owns firm V: CR verified + member L1 (verified, licence valid)   → admitted
--   FU  owns firm U: CR NOT verified + member L2 (verified, valid)       → refused
--   FX  owns firm X: CR verified + member L3 (verified, licence EXPIRED) → refused
--   S   office_admin (not a lawyer) in firm V                            → refused
-- Every assertion RAISES on failure.

insert into auth.users (id) values
  ('f1000000-0000-0000-0000-0000000000f1'),
  ('f2000000-0000-0000-0000-0000000000f2'),
  ('f3000000-0000-0000-0000-0000000000f3'),
  ('a3000000-0000-0000-0000-000000000003'),
  ('5a000000-0000-0000-0000-00000000005a');
insert into public.profiles (id, user_type, display_name) values
  ('f1000000-0000-0000-0000-0000000000f1', 'firm', 'FV'),
  ('f2000000-0000-0000-0000-0000000000f2', 'firm', 'FU'),
  ('f3000000-0000-0000-0000-0000000000f3', 'firm', 'FX'),
  ('a3000000-0000-0000-0000-000000000003', 'lawyer', 'L3'),
  ('5a000000-0000-0000-0000-00000000005a', 'individual', 'S');
insert into public.lawyer_profiles (user_id, verification_status) values
  ('a3000000-0000-0000-0000-000000000003', 'verified');
update public.lawyer_profiles set license_expiry = current_date + 30
 where user_id in ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002');
update public.lawyer_profiles set license_expiry = current_date - 1
 where user_id = 'a3000000-0000-0000-0000-000000000003';

insert into public.firm_profiles (id, owner_user_id, name_ar, verification_status) values
  ('f1f1f1f1-0000-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-0000000000f1', 'مكتب موثّق', 'verified'),
  ('f2f2f2f2-0000-0000-0000-0000000000f2', 'f2000000-0000-0000-0000-0000000000f2', 'مكتب غير موثّق', 'pending'),
  ('f3f3f3f3-0000-0000-0000-0000000000f3', 'f3000000-0000-0000-0000-0000000000f3', 'مكتب رخصته منتهية', 'verified');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('f1f1f1f1-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-000000000001', 'lawyer', 'active'),
  ('f1f1f1f1-0000-0000-0000-0000000000f1', '5a000000-0000-0000-0000-00000000005a', 'office_admin', 'active'),
  ('f2f2f2f2-0000-0000-0000-0000000000f2', 'a2000000-0000-0000-0000-000000000002', 'lawyer', 'active'),
  ('f3f3f3f3-0000-0000-0000-0000000000f3', 'a3000000-0000-0000-0000-000000000003', 'lawyer', 'active');

-- Each firm owner has one public post of his own (stored by the superuser,
-- active), for the "move it to lawyers-only" checks.
insert into public.community_posts (id, author_id, title, body, visibility) values
  ('f1000000-aaaa-0000-0000-0000000000f1', 'f1000000-0000-0000-0000-0000000000f1', 'سؤال المكتب الموثّق', 'نص', 'public'),
  ('f2000000-aaaa-0000-0000-0000000000f2', 'f2000000-0000-0000-0000-0000000000f2', 'سؤال المكتب غير الموثّق', 'نص', 'public');

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

-- T1 the verified firm reads the lawyers-only post and its answer
set role authenticated;
select set_config('test.uid', 'f1000000-0000-0000-0000-0000000000f1', false);
select pg_temp.expect('T1 verified firm reads the lawyers-only post',
  (select count(*)::text from public.community_posts where id = '11111111-aaaa-0000-0000-000000000001'), '1');
select pg_temp.expect('T1 verified firm reads its answer',
  (select count(*)::text from public.community_answers where post_id = '11111111-aaaa-0000-0000-000000000001'), '1');
select pg_temp.expect('T1 lawyers-space for the verified firm', (select public.community_lawyers_space_ok()::text), 'true');
reset role;
do $$ begin raise notice 'T1 PASS: a verified firm reads lawyers-only posts and answers'; end $$;

-- T2 the unverified firm, the expired-licence firm and the non-lawyer staff member read nothing
set role authenticated;
select set_config('test.uid', 'f2000000-0000-0000-0000-0000000000f2', false);
select pg_temp.expect('T2 CR-unverified firm posts',
  (select count(*)::text from public.community_posts where visibility = 'lawyers_only'), '0');
select pg_temp.expect('T2 CR-unverified firm answers',
  (select count(*)::text from public.community_answers), '0');
select pg_temp.expect('T2 lawyers-space for the CR-unverified firm', (select public.community_lawyers_space_ok()::text), 'false');
select set_config('test.uid', 'f3000000-0000-0000-0000-0000000000f3', false);
select pg_temp.expect('T2 expired-licence firm posts',
  (select count(*)::text from public.community_posts where visibility = 'lawyers_only'), '0');
select set_config('test.uid', '5a000000-0000-0000-0000-00000000005a', false);
select pg_temp.expect('T2 non-lawyer member of the verified firm',
  (select count(*)::text from public.community_posts where visibility = 'lawyers_only'), '0');
reset role;
do $$ begin raise notice 'T2 PASS: CR not verified / licence expired / non-lawyer staff are refused'; end $$;

-- T3 posting into lawyers-only: the verified firm may, the others may not
set role authenticated;
select set_config('test.uid', 'f1000000-0000-0000-0000-0000000000f1', false);
insert into public.community_posts (author_id, title, body, visibility)
values ('f1000000-0000-0000-0000-0000000000f1', 'موضوع من مكتب موثّق', 'نص', 'lawyers_only');
do $$
declare uid text;
begin
  foreach uid in array array['f2000000-0000-0000-0000-0000000000f2', 'f3000000-0000-0000-0000-0000000000f3',
                             '5a000000-0000-0000-0000-00000000005a', 'c0000000-0000-0000-0000-00000000000c'] loop
    perform set_config('test.uid', uid, false);
    begin
      insert into public.community_posts (author_id, title, body, visibility)
      values (uid::uuid, 'محاولة', 'نص', 'lawyers_only');
      raise exception 'T3 FAIL: % posted into lawyers-only', uid;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;
select pg_temp.expect('T3 the verified firm''s post is stored (held for review)',
  (select status from public.community_posts where title = 'موضوع من مكتب موثّق'), 'pending_review');
do $$ begin raise notice 'T3 PASS: only the verified firm posts into lawyers-only'; end $$;

-- T4 moving an own post into lawyers-only (UPDATE WITH CHECK)
set role authenticated;
select set_config('test.uid', 'f1000000-0000-0000-0000-0000000000f1', false);
update public.community_posts set visibility = 'lawyers_only' where id = 'f1000000-aaaa-0000-0000-0000000000f1';
select set_config('test.uid', 'f2000000-0000-0000-0000-0000000000f2', false);
do $$
begin
  update public.community_posts set visibility = 'lawyers_only' where id = 'f2000000-aaaa-0000-0000-0000000000f2';
  raise exception 'T4 FAIL: the CR-unverified firm moved its post into lawyers-only';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.expect('T4 verified firm moved its post',
  (select visibility from public.community_posts where id = 'f1000000-aaaa-0000-0000-0000000000f1'), 'lawyers_only');
select pg_temp.expect('T4 unverified firm''s post unchanged',
  (select visibility from public.community_posts where id = 'f2000000-aaaa-0000-0000-0000000000f2'), 'public');
do $$ begin raise notice 'T4 PASS: only the verified firm moves a post into lawyers-only'; end $$;

-- T5 answering and voting on the lawyers-only post; the lawyer badge stays lawyers'
set role authenticated;
select set_config('test.uid', 'f1000000-0000-0000-0000-0000000000f1', false);
insert into public.community_answers (post_id, author_id, body, is_lawyer_verified)
values ('11111111-aaaa-0000-0000-000000000001', 'f1000000-0000-0000-0000-0000000000f1', 'رأي المكتب', false);
do $$
begin
  insert into public.community_answers (post_id, author_id, body, is_lawyer_verified)
  values ('11111111-aaaa-0000-0000-000000000001', 'f1000000-0000-0000-0000-0000000000f1', 'شارة مزيفة', true);
  raise exception 'T5 FAIL: a firm owner claimed the lawyer badge';
exception when insufficient_privilege then null;
end $$;
insert into public.community_votes (user_id, target_type, target_id, value)
values ('f1000000-0000-0000-0000-0000000000f1', 'post', '11111111-aaaa-0000-0000-000000000001', 1);
select set_config('test.uid', 'f2000000-0000-0000-0000-0000000000f2', false);
do $$
begin
  insert into public.community_answers (post_id, author_id, body)
  values ('11111111-aaaa-0000-0000-000000000001', 'f2000000-0000-0000-0000-0000000000f2', 'محاولة');
  raise exception 'T5 FAIL: the CR-unverified firm answered a lawyers-only post';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  insert into public.community_votes (user_id, target_type, target_id, value)
  values ('f2000000-0000-0000-0000-0000000000f2', 'post', '11111111-aaaa-0000-0000-000000000001', 1);
  raise exception 'T5 FAIL: the CR-unverified firm voted on a lawyers-only post';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.expect('T5 the firm answer carries no lawyer badge',
  (select is_lawyer_verified::text from public.community_answers where body = 'رأي المكتب'), 'false');
do $$ begin raise notice 'T5 PASS: the verified firm answers and votes, without the lawyer badge; the unverified firm cannot'; end $$;

-- T6 nothing else moved: verified lawyer in, pending lawyer / client / guest out,
--    the office check itself is not callable by members
set role authenticated;
select set_config('test.uid', 'a2000000-0000-0000-0000-000000000002', false);
select pg_temp.expect('T6 verified lawyer still reads',
  (select count(*)::text from public.community_posts where id = '11111111-aaaa-0000-0000-000000000001'), '1');
select set_config('test.uid', 'b0000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect('T6 pending lawyer still out',
  (select count(*)::text from public.community_posts where visibility = 'lawyers_only'), '0');
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect('T6 client still out',
  (select count(*)::text from public.community_posts where visibility = 'lawyers_only'), '0');
do $$
begin
  perform public.community_is_verified_office();
  raise exception 'T6 FAIL: authenticated called community_is_verified_office()';
exception when insufficient_privilege then null;
end $$;
reset role;
set role anon;
select set_config('test.uid', '', false);
select pg_temp.expect('T6 guest still out',
  (select count(*)::text from public.community_posts where visibility = 'lawyers_only'), '0');
select pg_temp.expect('T6 guest lawyers-space', (select public.community_lawyers_space_ok()::text), 'false');
select pg_temp.expect('T6 guest still reads the public post',
  (select count(*)::text from public.community_posts where id = '22222222-aaaa-0000-0000-000000000002'), '1');
reset role;
do $$ begin raise notice 'T6 PASS: lawyers, pending lawyers, clients and guests behave as before'; end $$;

-- T7 the status is live: the firm's CR loses its verification → the firm is out again
update public.firm_profiles set verification_status = 'pending' where id = 'f1f1f1f1-0000-0000-0000-0000000000f1';
set role authenticated;
select set_config('test.uid', 'f1000000-0000-0000-0000-0000000000f1', false);
select pg_temp.expect('T7 firm out after its CR lost verification (others'' posts)',
  (select count(*)::text from public.community_posts
    where visibility = 'lawyers_only' and author_id <> 'f1000000-0000-0000-0000-0000000000f1'), '0');
reset role;
update public.firm_profiles set verification_status = 'verified' where id = 'f1f1f1f1-0000-0000-0000-0000000000f1';
-- … and when the only lawyer leaves the firm
update public.firm_members set status = 'removed'
 where firm_id = 'f1f1f1f1-0000-0000-0000-0000000000f1' and user_id = 'a1000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('test.uid', 'f1000000-0000-0000-0000-0000000000f1', false);
select pg_temp.expect('T7 firm out after its only lawyer left',
  (select public.community_lawyers_space_ok()::text), 'false');
reset role;
do $$ begin raise notice 'T7 PASS: losing the CR verification or the licensed lawyer closes the lawyers-only space'; end $$;

do $$ begin raise notice 'l11_community_verified_firms: ALL PASS'; end $$;
