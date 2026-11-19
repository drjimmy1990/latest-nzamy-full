-- test_infra.test.sql — proves 20261129_90 (batch l9-testinfra, owner file 19
-- §1ج, his tests T32–T37): is_test + test_batch tags computed on the server
-- and immutable, the batch of an account over time, the mail sink, and
-- «مسح دفعة الاختبار» (dry-run = the same numbers, blockers, real rows never
-- touched, files per batch, append-only audit, one batch never touches
-- another).
--
-- CHAIN (run.sh, postgres:16) — the chain of test_account_mode.test.sql
-- without its test (20261127_80 once), the storage stub, this file's
-- prelude, then 20261129_90 TWICE (idempotent). From the repo root, in Git
-- Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql \
--     $T/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql \
--     $T/prelude_founder_membership_between_runs.sql \
--     $M/20261101_10_founder_membership.sql \
--     $M/20261107_60_founder_rejoinder_410.sql \
--     $M/20261122_10_founder_campaign_nov18.sql \
--     $T/prelude_founder_l2_before.sql \
--     $M/20261124_10_founder_hold_15min_and_library_points.sql \
--     $T/prelude_demo_accounts_tables.sql \
--     $M/20261125_50_demo_accounts.sql \
--     $M/20261017_44_test_accounts_never_listed.sql \
--     $M/20261127_80_test_account_mode.sql \
--     $T/prelude_storage_objects_stub.sql \
--     $T/prelude_test_infra_before.sql \
--     $M/20261129_90_test_infra.sql \
--     $M/20261129_90_test_infra.sql \
--     $T/test_infra.test.sql
--
-- NEGATIVE CONTROLS (must FAIL):
--   1. the same chain without the two 20261129_90 files → "T0 FAIL: …";
--   2. the same chain with $T/sabotage_test_infra_no_tag_trigger.sql after the
--      second 20261129_90 (test_tag_row keeps what the client sent) → "T32 FAIL:
--      a client-sent tag was kept".
\set ON_ERROR_STOP on

create function pg_temp.expect(p_sql text, p_token text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_token or sqlerrm like p_token then
      return;
    end if;
    raise exception '% FAIL: expected %, got % (%)', p_label, p_token, sqlerrm, sqlstate;
  end;
  raise exception '% FAIL: expected %, the statement succeeded', p_label, p_token;
end $$;

-- a snapshot of every row of the tables the purge may touch (to prove "nothing deleted")
create function pg_temp.row_total() returns bigint language plpgsql as $$
declare r record; n bigint; t bigint := 0;
begin
  for r in select table_name from public.test_tag_tables where to_regclass('public.' || quote_ident(table_name)) is not null loop
    execute format('select count(*) from public.%I', r.table_name) into n;
    t := t + n;
  end loop;
  return t;
end $$;

-- T0 applied, and what is NOT tagged
do $$
declare t text;
begin
  if to_regprocedure('public.test_batch_purge(text, boolean, uuid, text)') is null
     or to_regprocedure('public.test_mail_sink_check(text, uuid[], text, text, text)') is null
     or to_regclass('public.test_batch_purge_audit') is null then
    raise exception 'T0 FAIL: 20261129_90 is not applied';
  end if;
  foreach t in array array['service_requests', 'payments', 'notifications', 'research_sessions', 'research_items',
                           'community_posts', 'community_answers', 'reviews', 'consultations', 'lawyer_clients',
                           'attachments', 'payment_orders', 'test_mail_sink'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'is_test')
       or not exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass and tgname = 'trg_test_tag') then
      raise exception 'T0 FAIL: public.% is not tagged', t;
    end if;
  end loop;
  foreach t in array array['profiles', 'lawyer_profiles', 'test_accounts', 'admin_audit_events', 'firm_members',
                           'test_account_batches', 'test_batch_purge_audit'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'is_test') then
      raise exception 'T0 FAIL: public.% must never carry a test tag (account / audit table)', t;
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgname = 'trg_test_tag' and tgrelid = 'public.service_requests'::regclass) <> 1 then
    raise exception 'T0 FAIL: a re-run left two tag triggers';
  end if;
  if has_function_privilege('authenticated', 'public.test_batch_purge(text, boolean, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.test_mail_sink_check(text, uuid[], text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.test_account_set_batch(uuid, text, uuid)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.test_batch_purge_audit', 'SELECT')
     or has_table_privilege('authenticated', 'public.test_mail_sink', 'SELECT')
     or not has_function_privilege('service_role', 'public.test_batch_purge(text, boolean, uuid, text)', 'EXECUTE') then
    raise exception 'T0 FAIL: privileges';
  end if;
  raise notice 'T0 PASS: tags on the listed tables (one trigger after a re-run), none on account / audit tables, service role only';
end $$;

-- T1 the one-time tagging of today's rows → batch 'legacy'
do $$
begin
  if (select string_agg(test_batch, ',' order by user_id) from public.test_account_batches where until is null)
     is distinct from 'legacy,legacy,legacy' then
    raise exception 'T1 FAIL: L, C, D must be in legacy and nobody else (got %)',
      (select string_agg(user_id::text || '=' || test_batch, ',') from public.test_account_batches);
  end if;
  if not (select is_test and test_batch = 'legacy' from public.service_requests where id = 'c-old')
     or not (select is_test and test_batch = 'legacy' from public.payments where id = 'pay-c-old') then
    raise exception 'T1 FAIL: a test account''s old request (or its payment, by its parent) is not tagged legacy';
  end if;
  if (select is_test from public.service_requests where id = 'r-old')
     or (select is_test from public.payments where id = 'pay-r-old')
     or exists (select 1 from public.notifications where is_test and user_id in
                ('00000000-0000-0000-0000-00000000a005', '00000000-0000-0000-0000-00000000a001')) then
    raise exception 'T1 FAIL: a real or staff row was tagged';
  end if;
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000a003' and is_test and test_batch = 'legacy') then
    raise exception 'T1 FAIL: the test client''s old notification is not tagged';
  end if;
  raise notice 'T1 PASS: today''s test rows → legacy (parents and children); real and staff rows untouched';
end $$;

-- batches: C → qa-b1, L → qa-b2; refusals
do $$
begin
  if public.test_account_set_batch('00000000-0000-0000-0000-00000000a003', 'qa-b1', '00000000-0000-0000-0000-00000000a001') <> 'set'
     or public.test_account_set_batch('00000000-0000-0000-0000-00000000a003', 'qa-b1', null) <> 'unchanged'
     or public.test_account_set_batch('00000000-0000-0000-0000-00000000a002', 'qa-b2', null) <> 'set' then
    raise exception 'T32 FAIL: test_account_set_batch';
  end if;
  if (select count(*) from public.test_account_batches where user_id = '00000000-0000-0000-0000-00000000a003') <> 2
     or (select until from public.test_account_batches
          where user_id = '00000000-0000-0000-0000-00000000a003' and test_batch = 'legacy') is null then
    raise exception 'T32 FAIL: the old batch of C was not closed';
  end if;
end $$;
select pg_temp.expect($$select public.test_account_set_batch('00000000-0000-0000-0000-00000000a005', 'qa-b1', null)$$,
                      'test_batch:not_test_account', 'T32 (a real account)');
select pg_temp.expect($$select public.test_account_set_batch('00000000-0000-0000-0000-00000000a001', 'qa-b1', null)$$,
                      'test_batch:not_test_account', 'T32 (a listed admin)');
select pg_temp.expect($$select public.test_account_set_batch('00000000-0000-0000-0000-00000000a003', 'QA b1', null)$$,
                      'test_batch:invalid', 'T32 (a malformed id)');

-- a new test account gets a dated batch on its own
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a007', 'qa.new@team.example.sa');
insert into public.profiles (id, user_type, display_name) values ('00000000-0000-0000-0000-00000000a007', 'client', 'جديد');
insert into public.test_accounts (user_id) values ('00000000-0000-0000-0000-00000000a007');
do $$
begin
  if (select test_batch from public.test_account_batches where user_id = '00000000-0000-0000-0000-00000000a007' and until is null)
     !~ '^qa-\d{4}-\d{2}-\d{2}$' then
    raise exception 'T32 FAIL: a new test account has no dated batch';
  end if;
end $$;

create temp table _acc as
  select (select count(*) from public.profiles) as p, (select count(*) from auth.users) as u,
         (select count(*) from public.test_accounts) as t;

-- rows written now, as the service role (the API routes) and as a signed-in user
set role service_role;
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  values ('c-new', '00000000-0000-0000-0000-00000000a003', 'قضية جديدة', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer');
insert into public.payments (id, request_id, amount) values ('pay-c-new', 'c-new', 50);
insert into public.notifications (user_id, title) values
  ('00000000-0000-0000-0000-00000000a003', 'إشعار جديد'),
  ('00000000-0000-0000-0000-00000000a001', 'إشعار المسؤول ٢'),
  ('00000000-0000-0000-0000-00000000a004', 'إشعار تجريبي');
-- a real row with a forged tag (the API body) — must be stored untagged
insert into public.notifications (user_id, title, is_test, test_batch)
  values ('00000000-0000-0000-0000-00000000a006', 'إشعار حقيقي مزوّر', true, 'qa-b1');
insert into public.research_sessions (id, user_id, title)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000a003', 'بحث');
insert into public.research_items (session_id, content)
  values ('00000000-0000-0000-0000-0000000000e1', 'ملاحظة');
insert into public.community_posts (id, author_id, title)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a003', 'سؤال اختبار');
insert into public.lawyer_clients (owner_user_id, client_user_id, name)
  values ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a003', 'موكل اختبار');
-- a test row that names a REAL account (C reviews the real lawyer R): tagged, never purged
insert into public.reviews (reviewer_id, reviewee_id, rating, title)
  values ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a005', 4, 'تقييم اختبار');
reset role;

set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a005', false);
insert into public.community_posts (id, author_id, title, is_test, test_batch)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000a005', 'سؤال حقيقي', true, 'qa-b1');
reset role;

-- T32 tags
do $$
begin
  if (select community_posts.is_test from public.community_posts where id = '00000000-0000-0000-0000-0000000000f2')
     or (select test_batch from public.community_posts where id = '00000000-0000-0000-0000-0000000000f2') is not null
     or exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000a006' and is_test) then
    raise exception 'T32 FAIL: a client-sent tag was kept on a real row';
  end if;
  if not (select is_test and test_batch = 'qa-b1' from public.service_requests where id = 'c-new')
     or not (select is_test and test_batch = 'qa-b1' from public.payments where id = 'pay-c-new')
     or not (select is_test and test_batch = 'qa-b1' from public.research_items limit 1)
     or not (select is_test and test_batch = 'qa-b1' from public.community_posts where id = '00000000-0000-0000-0000-0000000000f1')
     or not (select is_test and test_batch = 'qa-b1' from public.reviews limit 1)
     or not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000a003'
                     and title = 'إشعار جديد' and is_test and test_batch = 'qa-b1') then
    raise exception 'T32 FAIL: a row of the test client is not tagged qa-b1';
  end if;
  if not (select is_test and test_batch = 'qa-b2' from public.lawyer_clients limit 1) then
    raise exception 'T32 FAIL: the test lawyer''s client row is not tagged qa-b2';
  end if;
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000a004' and is_test and test_batch = 'legacy') then
    raise exception 'T32 FAIL: a demo account''s row is not tagged with its batch';
  end if;
  if exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000a001' and is_test) then
    raise exception 'T32 FAIL: a staff row was tagged';
  end if;
end $$;

-- nobody can clear or set a tag
set role service_role;
update public.service_requests set is_test = false, test_batch = null where id = 'c-new';
update public.service_requests set is_test = true, test_batch = 'qa-b1' where id = 'r-old';
update public.service_requests set title = 'قضية جديدة (معدّلة)' where id = 'c-new';
reset role;
do $$
begin
  if not (select is_test and test_batch = 'qa-b1' from public.service_requests where id = 'c-new')
     or (select is_test from public.service_requests where id = 'r-old')
     or (select test_batch from public.service_requests where id = 'r-old') is not null then
    raise exception 'T32 FAIL: an UPDATE changed a tag';
  end if;
  raise notice 'T32 PASS: tags computed on the server (owners, parents), batches per account, forged tags ignored, immutable, staff never tagged';
end $$;

-- T33 the mail sink
set role service_role;
do $$
declare j jsonb;
begin
  j := public.test_mail_sink_check('QA.Client@Team.Example.SA', null, 'رمز التحقق', 'الرمز 123456', 'library_device_code');
  if not (j ->> 'sink')::boolean or j ->> 'reason' <> 'test_recipient' or j ->> 'test_batch' <> 'qa-b1' then
    raise exception 'T33 FAIL: mail to a test account was not sunk (%)', j;
  end if;
  j := public.test_mail_sink_check('real.client@mail.example.sa', array['00000000-0000-0000-0000-00000000a003']::uuid[], 'فاتورة', 'نص', 'invoice');
  if not (j ->> 'sink')::boolean or j ->> 'reason' <> 'test_account' or j ->> 'test_batch' <> 'qa-b1' then
    raise exception 'T33 FAIL: mail caused by a test account reached a real address (%)', j;
  end if;
  j := public.test_mail_sink_check('anyone@persona.test', null, 'x', 'y', null);
  if not (j ->> 'sink')::boolean or j ->> 'reason' <> 'reserved_domain' then
    raise exception 'T33 FAIL: a reserved test domain was not sunk (%)', j;
  end if;
  j := public.test_mail_sink_check('real.client@mail.example.sa', array['00000000-0000-0000-0000-00000000a006']::uuid[], 'تذكير', 'نص', 'reminder');
  if (j ->> 'sink')::boolean then
    raise exception 'T33 FAIL: a real user''s own mail was sunk';
  end if;
  j := public.test_mail_sink_check('admin@nezamy.example.sa', array['00000000-0000-0000-0000-00000000a001']::uuid[], 'تنبيه دخول', 'نص', 'admin');
  if (j ->> 'sink')::boolean then
    raise exception 'T33 FAIL: the admin''s mail was sunk (staff is never a test account)';
  end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.test_mail_sink) <> 3
     or exists (select 1 from public.test_mail_sink where to_masked like '%real.client%' or to_masked like '%qa.client%') then
    raise exception 'T33 FAIL: the sink must hold 3 masked rows';
  end if;
  if (select count(*) from public.test_mail_sink where is_test and test_batch = 'qa-b1') <> 2 then
    raise exception 'T33 FAIL: the sunk mails of the test client are not tagged qa-b1';
  end if;
  raise notice 'T33 PASS: mail to / caused by a test account or to a reserved domain is sunk (masked, tagged); real and staff mail goes out';
end $$;

-- files: C's new file (qa-b1), C's old file (legacy), L's file (qa-b2), R's file
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('documents', '00000000-0000-0000-0000-00000000a003/new-doc.pdf', null, now()),
  ('documents', '00000000-0000-0000-0000-00000000a003/old-doc.pdf', null, '2020-01-01'),
  ('lawyer-licences', 'licences/00000000-0000-0000-0000-00000000a002/licence.png', null, now()),
  ('documents', '00000000-0000-0000-0000-00000000a005/real.pdf', '00000000-0000-0000-0000-00000000a005', now());

-- a REAL user answers the test client's post: deleting the post would cascade into it
insert into public.community_answers (post_id, author_id, body)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000a005', 'جواب محامٍ حقيقي');

-- T34 dry-run (with a blocker), then the real purge is refused (T35a)
create temp table _before as select pg_temp.row_total() as n;
set role service_role;
create temp table _dry1 as select public.test_batch_purge('qa-b1', true, '00000000-0000-0000-0000-00000000a001', '203.0.113.7') as res;
create temp table _blocked as select public.test_batch_purge('qa-b1', false, '00000000-0000-0000-0000-00000000a001', '203.0.113.7') as res;
reset role;
do $$
declare j jsonb := (select res from _dry1); b jsonb := (select res from _blocked);
begin
  if j ->> 'status' <> 'dry_run' or (j ->> 'would_purge')::boolean
     or j -> 'blockers' -> 0 ->> 'table' <> 'community_answers' or (j -> 'blockers' -> 0 ->> 'rows')::int <> 1 then
    raise exception 'T34 FAIL: the dry-run did not report the real answer as a blocker (%)', j -> 'blockers';
  end if;
  if b ->> 'status' <> 'blocked' or jsonb_array_length(b -> 'file_list') <> 0 then
    raise exception 'T35 FAIL: the purge was not refused (%)', b ->> 'status';
  end if;
  if pg_temp.row_total() <> (select n from _before) then
    raise exception 'T34 FAIL: a dry-run or a refused purge deleted rows';
  end if;
  raise notice 'T35a PASS: a real row hanging off a test row blocks the purge; nothing deleted';
end $$;

-- the moderator removes the real answer; dry-run again
delete from public.community_answers where author_id = '00000000-0000-0000-0000-00000000a005';
drop table _before;
create temp table _before as select pg_temp.row_total() as n;
set role service_role;
create temp table _dry2 as select public.test_batch_purge('qa-b1', true, '00000000-0000-0000-0000-00000000a001', '203.0.113.7') as res;
reset role;
do $$
declare j jsonb := (select res from _dry2); t jsonb;
begin
  t := j -> 'tables';
  if j ->> 'status' <> 'dry_run' or not (j ->> 'would_purge')::boolean or jsonb_array_length(j -> 'blockers') <> 0 then
    raise exception 'T34 FAIL: dry-run status % / would_purge % / blockers %', j ->> 'status', j ->> 'would_purge', j -> 'blockers';
  end if;
  if (t -> 'service_requests' ->> 'delete')::int <> 1 or (t -> 'payments' ->> 'delete')::int <> 1
     or (t -> 'notifications' ->> 'delete')::int <> 1 or (t -> 'research_sessions' ->> 'delete')::int <> 1
     or (t -> 'research_items' ->> 'delete')::int <> 1 or (t -> 'community_posts' ->> 'delete')::int <> 1
     or (t -> 'test_mail_sink' ->> 'delete')::int <> 2
     or (t -> 'reviews' ->> 'tagged')::int <> 1 or (t -> 'reviews' ->> 'delete')::int <> 0
     or (t -> 'reviews' ->> 'kept_real_link')::int <> 1
     or t ? 'lawyer_clients' then
    raise exception 'T34 FAIL: dry-run counts %', t;
  end if;
  if (j -> 'after' ->> 'reviews')::int <> 1 or (j -> 'after' ->> 'service_requests')::int <> 0 then
    raise exception 'T34 FAIL: dry-run "after" %', j -> 'after';
  end if;
  if (j -> 'files' ->> 'count')::int <> 1 or (j -> 'files' -> 'by_type' ->> 'documents · pdf')::int <> 1 then
    raise exception 'T34 FAIL: dry-run files %', j -> 'files';
  end if;
  if (j ->> 'accounts')::int <> 1 or jsonb_array_length(j -> 'file_list') <> 0 then
    raise exception 'T34 FAIL: accounts % / a dry-run returned files to remove', j ->> 'accounts';
  end if;
  if pg_temp.row_total() <> (select n from _before) then
    raise exception 'T34 FAIL: the dry-run deleted rows';
  end if;
  raise notice 'T34 PASS: dry-run = per-table counts (kept rows named), files per bucket/type, nothing deleted';
end $$;

-- T35 the purge
set role service_role;
create temp table _purge as select public.test_batch_purge('qa-b1', false, '00000000-0000-0000-0000-00000000a001', '203.0.113.7') as res;
reset role;
do $$
declare j jsonb := (select res from _purge); d jsonb := (select res from _dry2);
begin
  if j ->> 'status' <> 'purged' then
    raise exception 'T35 FAIL: status % (%)', j ->> 'status', j ->> 'error';
  end if;
  if j -> 'tables' <> d -> 'tables' or j -> 'after' <> d -> 'after' then
    raise exception 'T34/T35 FAIL: the dry-run numbers differ from the purge''s';
  end if;
  if jsonb_array_length(j -> 'file_list') <> 1
     or j -> 'file_list' -> 0 ->> 'name' <> '00000000-0000-0000-0000-00000000a003/new-doc.pdf' then
    raise exception 'T35 FAIL: file list %', j -> 'file_list';
  end if;
  if exists (select 1 from public.service_requests where id = 'c-new')
     or exists (select 1 from public.payments where id = 'pay-c-new')
     or exists (select 1 from public.research_sessions) or exists (select 1 from public.research_items)
     or exists (select 1 from public.community_posts where id = '00000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from public.test_mail_sink where test_batch = 'qa-b1')
     or exists (select 1 from public.notifications where title = 'إشعار جديد') then
    raise exception 'T35 FAIL: a qa-b1 row survived';
  end if;
  if not exists (select 1 from public.service_requests where id = 'r-old')
     or not exists (select 1 from public.payments where id = 'pay-r-old')
     or not exists (select 1 from public.community_posts where id = '00000000-0000-0000-0000-0000000000f2')
     or not exists (select 1 from public.notifications where title = 'إشعار حقيقي مزوّر')
     or not exists (select 1 from public.notifications where title = 'إشعار محامٍ حقيقي')
     or not exists (select 1 from public.reviews)
     or not exists (select 1 from public.service_requests where id = 'c-old')
     or not exists (select 1 from public.lawyer_clients)
     or not exists (select 1 from public.test_mail_sink where reason = 'reserved_domain') then
    raise exception 'T35 FAIL: a real row, a kept row, or another batch''s row was deleted';
  end if;
  if (select count(*) from public.profiles) <> (select p from _acc) or (select count(*) from auth.users) <> (select u from _acc)
     or (select count(*) from public.test_accounts) <> (select t from _acc) then
    raise exception 'T35 FAIL: an account was deleted';
  end if;
  raise notice 'T35 PASS: only qa-b1 rows without a real party deleted; real rows, the kept review, legacy and qa-b2 untouched; no account deleted';
end $$;

-- T36 the audit trail
set role service_role;
select public.test_batch_purge_files_done((select (res ->> 'purge_id')::uuid from _purge), 'qa-b1',
       '00000000-0000-0000-0000-00000000a001', '203.0.113.7', 1, '[]'::jsonb);
reset role;
do $$
begin
  if (select string_agg(kind || ':' || status, ',' order by id) from public.test_batch_purge_audit where test_batch = 'qa-b1')
     <> 'dry_run:dry_run,purge:blocked,dry_run:dry_run,purge:purged,files:removed' then
    raise exception 'T36 FAIL: audit rows %',
      (select string_agg(kind || ':' || status, ',' order by id) from public.test_batch_purge_audit);
  end if;
  if not exists (select 1 from public.test_batch_purge_audit
                  where kind = 'purge' and status = 'purged' and actor_id = '00000000-0000-0000-0000-00000000a001'
                    and actor_email = 'admin@nezamy.example.sa' and ip = '203.0.113.7'
                    and (counts_before -> 'service_requests' ->> 'delete')::int = 1
                    and (counts_after ->> 'reviews')::int = 1 and (files ->> 'count')::int = 1)
     or not exists (select 1 from public.test_batch_purge_audit where status = 'blocked' and jsonb_array_length(blockers) = 1) then
    raise exception 'T36 FAIL: the audit row lacks who / batch / before / after / files / IP / blockers';
  end if;
end $$;
select pg_temp.expect($$update public.test_batch_purge_audit set status = 'x'$$, '%append-only%', 'T36 (update)');
select pg_temp.expect($$delete from public.test_batch_purge_audit$$, '%append-only%', 'T36 (delete)');
select pg_temp.expect($$truncate public.test_batch_purge_audit$$, '%append-only%', 'T36 (truncate)');
set role service_role;
select pg_temp.expect($$delete from public.test_batch_purge_audit$$, '%append-only%', 'T36 (service role delete)');
reset role;
set role authenticated;
select pg_temp.expect($$select count(*) from public.test_batch_purge_audit$$, 'permission denied for table test_batch_purge_audit', 'T36 (a session reads the audit)');
select pg_temp.expect($$select public.test_batch_purge('qa-b2', true, null, null)$$, 'permission denied for function test_batch_purge', 'T36 (a session runs the purge)');
reset role;
do $$ begin raise notice 'T36 PASS: dry-run / blocked / purged / files rows with who, batch, before, after, blockers, IP; append-only for everybody (postgres too); no session access'; end $$;

-- T37 a second batch: qa-b2 untouched by qa-b1, then purged alone; legacy last
set role service_role;
create temp table _b2 as select public.test_batch_purge('qa-b2', false, '00000000-0000-0000-0000-00000000a001', '198.51.100.2') as res;
create temp table _legacy as select public.test_batch_purge('legacy', false, '00000000-0000-0000-0000-00000000a001', '198.51.100.2') as res;
reset role;
do $$
declare b jsonb := (select res from _b2); l jsonb := (select res from _legacy);
begin
  if b ->> 'status' <> 'purged' or (b -> 'tables' -> 'lawyer_clients' ->> 'delete')::int <> 1
     or jsonb_array_length(b -> 'file_list') <> 1
     or b -> 'file_list' -> 0 ->> 'name' <> 'licences/00000000-0000-0000-0000-00000000a002/licence.png'
     or exists (select 1 from public.lawyer_clients) then
    raise exception 'T37 FAIL: qa-b2 %', b;
  end if;
  if l ->> 'status' <> 'purged'
     or exists (select 1 from public.service_requests where id = 'c-old')
     or exists (select 1 from public.payments where id = 'pay-c-old')
     or jsonb_array_length(l -> 'file_list') <> 1
     or l -> 'file_list' -> 0 ->> 'name' <> '00000000-0000-0000-0000-00000000a003/old-doc.pdf' then
    raise exception 'T37 FAIL: legacy %', l;
  end if;
  if not exists (select 1 from public.service_requests where id = 'r-old')
     or not exists (select 1 from public.reviews)
     or (select count(*) from public.notifications where is_test) <> 0
     or (select count(*) from public.notifications) <> 4 then
    raise exception 'T37 FAIL: real rows after every purge';
  end if;
  raise notice 'T37 PASS: each batch purges only itself (rows and files by the account''s batch interval); real rows remain';
end $$;

-- the admin page's overview
set role service_role;
do $$
declare o jsonb := public.test_batch_overview();
begin
  if (o ->> 'tables')::int < 20 or jsonb_array_length(o -> 'accounts') <> 4
     or (o -> 'rows_by_batch' ->> 'qa-b1')::int <> 1 then
    raise exception 'OVERVIEW FAIL: %', o;
  end if;
  raise notice 'OVERVIEW PASS: accounts with their batches, tagged rows per batch';
end $$;
reset role;
