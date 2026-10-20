-- wipe_subscriptions.test.sql — proves the one-time file
-- supabase/one-time/2026-10-19_wipe_subscriptions_and_trials.sql (owner answers
-- ٢٠٤ and ٢٢٤ — test accounts are spared).
-- Chain (run.sh, postgres:16; stubs.sql — auth.users, public.profiles,
-- public.lawyer_profiles, public.service_requests, the API roles — loads first
-- by itself):
--   the real subscriptions shape (20260603_phase1_003, which also seeds the plans
--   the rows point at) → the library grants table (20261019_10) → the real test
--   accounts registry (20261017_44; its e-mail backfill is skipped here, stubs'
--   auth.users has no email yet) → the fixture (entitlement_requests in its live
--   shape; accounts, rows, requests, two registered test accounts, a library
--   grant, a credit row; copies of each table; both settings armed at the
--   database level) → the one-time file, run AS WRITTEN (all 3 blocks, as the
--   user pastes it) → this file.
-- Run from the repo root:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql $M/20261019_10_library_access_grants.sql \
--     $M/20261017_44_test_accounts_never_listed.sql \
--     $R/prelude_wipe_subscriptions_fixture.sql \
--     supabase/one-time/2026-10-19_wipe_subscriptions_and_trials.sql \
--     $R/wipe_subscriptions.test.sql
-- The one-time file is the 5th file of the chain, so it is /tmp/mig5.sql in the
-- container; T4–T7 run it again from there with \i.
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the one-time file →
--   bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261019_10_library_access_grants.sql $M/20261017_44_test_accounts_never_listed.sql \
--     $R/prelude_wipe_subscriptions_fixture.sql $R/wipe_subscriptions.test.sql
--   → "T1 FAIL: subscription …51a1 (active before) is still active".
-- The run WITHOUT public.test_accounts is T7: it drops the table at the end of
-- this chain, runs the whole file again with a fresh target armed, and proves
-- block 2 raises and changes nothing.
--
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T0 the test-account list (owner ٢٢٤) is written twice in the one-time file
-- (blocks 1 and 2 cannot share it): the two copies are identical, and their
-- e-mail patterns are exactly 20261017_44's backfill (/tmp/mig3.sql),
-- whitespace aside. In the negative control (no one-time file in the chain)
-- there is no /tmp/mig5.sql: T0 is skipped there and the chain fails at T1
-- (T4 runs /tmp/mig5.sql, so the full chain cannot pass without it).
do $$
declare
  f      text := pg_read_file('/tmp/mig5.sql', 0, 10000000, true);
  mig    text := regexp_replace(pg_read_file('/tmp/mig3.sql'), '\s+', ' ', 'g');
  copies text[];
  emails text;
begin
  if f is null then
    raise notice 'T0 SKIP: no /tmp/mig5.sql in this chain (the negative control)';
    return;
  end if;
  select array_agg(m[1]) into copies
    from regexp_matches(f, 'TEST ACCOUNTS \(owner ٢٢٤\) — begin(.*?)TEST ACCOUNTS — end', 'g') as m;
  if coalesce(array_length(copies, 1), 0) <> 2 then
    raise exception 'T0 FAIL: % copies of the test-account list (expect 2: block 1 and block 2)', coalesce(array_length(copies, 1), 0);
  end if;
  if copies[1] <> copies[2] then
    raise exception 'T0 FAIL: the two copies of the test-account list differ';
  end if;
  emails := regexp_replace(substring(copies[1] from '(where lower\(u\.email\) like .*''ngo-director@nezamy\.sa''\))'), '\s+', ' ', 'g');
  if emails is null or position(emails in mig) = 0 then
    raise exception 'T0 FAIL: the e-mail patterns are not 20261017_44''s backfill: %', emails;
  end if;
  raise notice 'T0 PASS: the two copies of the test-account list are identical and match 20261017_44''s e-mail patterns';
end $$;

-- The live rows the wipe must cancel: A active, B trialing, D past_due, admin
-- E active, M (its plan request was approved BEFORE the cutoff), N (its only
-- post-cutoff requests are a library approval, a rejection and a pending one),
-- T (lawyer11@nezamy.sa — close to, but NOT, a test-account e-mail).
-- Every other row — C and D's rows created after the cutoff, J and K (a plan /
-- media request approved after it), L (row changed after it), the test
-- accounts P (registered), R and S (unregistered, matched by e-mail), the
-- cancelled and expired rows — must stay exactly as it was.
create temp table expect_cancelled (id uuid primary key);
insert into expect_cancelled values
  ('00000000-0000-4000-8000-0000000051a1'), ('00000000-0000-4000-8000-0000000051b2'),
  ('00000000-0000-4000-8000-0000000051d4'), ('00000000-0000-4000-8000-0000000051e5'),
  ('00000000-0000-4000-8000-0000000054a4'), ('00000000-0000-4000-8000-0000000054a5'),
  ('00000000-0000-4000-8000-0000000055a5');

-- T1 the seven targeted rows are cancelled exactly as the brief says.
do $$
declare
  t0 timestamptz := (select t0 from public.wipe204_t0);
  r  record;
  n  int := 0;
begin
  for r in
    select s.*, b.status as old_status, b.current_period_end as old_cpe,
           b.metadata as old_meta, b.tier as old_tier
      from public.subscriptions s
      join public.wipe204_subs_before b using (id)
      join expect_cancelled e using (id)
     order by s.id
  loop
    n := n + 1;
    if r.status <> 'cancelled' then
      raise exception 'T1 FAIL: subscription …% (% before) is still %',
        right(r.id::text, 4), r.old_status, r.status;
    end if;
    if r.cancelled_at is null or r.cancelled_at < t0 or r.cancelled_at > now() then
      raise exception 'T1 FAIL: % cancelled_at is % (expected the time of the wipe)', r.id, r.cancelled_at;
    end if;
    if r.auto_renew then
      raise exception 'T1 FAIL: % still renews', r.id;
    end if;
    if r.current_period_end is distinct from least(coalesce(r.old_cpe, r.cancelled_at), r.cancelled_at) then
      raise exception 'T1 FAIL: % period end % (before %; expected the earlier of it and the wipe time)',
        r.id, r.current_period_end, r.old_cpe;
    end if;
    if r.metadata->>'wipe' is distinct from 'owner-204'
       or (r.metadata->>'wiped_at')::timestamptz is distinct from r.cancelled_at then
      raise exception 'T1 FAIL: % metadata lacks the wipe stamp: %', r.id, r.metadata;
    end if;
    if (r.metadata - 'wipe' - 'wiped_at') is distinct from r.old_meta then
      raise exception 'T1 FAIL: % lost metadata keys it had: % → %', r.id, r.old_meta, r.metadata;
    end if;
    if r.tier is distinct from r.old_tier then
      raise exception 'T1 FAIL: % tier changed % → %', r.id, r.old_tier, r.tier;
    end if;
  end loop;
  if n <> 7 then raise exception 'T1 FAIL: found % of the 7 targeted rows', n; end if;
  -- D's period had already ended in July: the wipe must not move it forward.
  if (select current_period_end from public.subscriptions
       where id = '00000000-0000-4000-8000-0000000051d4') <> '2026-07-31 10:00+03' then
    raise exception 'T1 FAIL: D''s past period end moved';
  end if;
  raise notice 'T1 PASS: 7 targeted rows cancelled (active, trialing, past_due, admin, request approved before the cutoff, library/rejected/pending requests only, lawyer11 — not a test e-mail), period ends clipped, metadata stamped';
end $$;

-- T2 everything else is exactly as before: the rows created after the cutoff,
-- the SPARED rows (J, K, L, test accounts P, R, S), the rows already cancelled / expired, the library
-- grant, the credits and the requests.
do $$
declare
  diff int;
begin
  if (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000055a1') <> 'active' then
    raise exception 'T2 FAIL: test account P''s old live row was cancelled (owner ٢٢٤: test accounts are spared)';
  end if;
  if (select count(*) from public.subscriptions
       where status = 'active'
         and id in ('00000000-0000-4000-8000-0000000055a3', '00000000-0000-4000-8000-0000000055a4')) <> 2 then
    raise exception 'T2 FAIL: an unregistered test account''s old live row was cancelled (R …@nzamy.test / S corp-owner@nezamy.sa — owner ٢٢٤)';
  end if;
  select count(*) into diff from (
    (select * from public.subscriptions where id not in (select id from expect_cancelled)
     except select * from public.wipe204_subs_before)
    union all
    (select * from public.wipe204_subs_before where id not in (select id from expect_cancelled)
     except select * from public.subscriptions)
  ) d;
  if diff <> 0 then raise exception 'T2 FAIL: % other subscription row(s) changed', diff; end if;
  if (select count(*) from public.subscriptions) <> (select count(*) from public.wipe204_subs_before) then
    raise exception 'T2 FAIL: the number of subscription rows changed';
  end if;
  if (select count(*) from public.subscriptions
       where status = 'active'
         and id in ('00000000-0000-4000-8000-0000000051c3', '00000000-0000-4000-8000-0000000052d4')) <> 2 then
    raise exception 'T2 FAIL: a row created after the cutoff is no longer active';
  end if;
  if (select count(*) from public.subscriptions
       where status = 'active'
         and id in ('00000000-0000-4000-8000-0000000054a1', '00000000-0000-4000-8000-0000000054a2',
                    '00000000-0000-4000-8000-0000000054a3')) <> 3 then
    raise exception 'T2 FAIL: a spared row (J plan request / K media request / L changed after the cutoff) is no longer active';
  end if;
  select count(*) into diff from (
    (select * from public.test_accounts except select * from public.wipe204_tests_before)
    union all
    (select * from public.wipe204_tests_before except select * from public.test_accounts)
  ) d;
  if diff <> 0 then raise exception 'T2 FAIL: public.test_accounts changed'; end if;

  select count(*) into diff from (
    (select * from public.library_access_grants except select * from public.wipe204_grants_before)
    union all
    (select * from public.wipe204_grants_before except select * from public.library_access_grants)
  ) d;
  if diff <> 0 or (select count(*) from public.library_access_grants) <> 1 then
    raise exception 'T2 FAIL: library_access_grants changed';
  end if;

  select count(*) into diff from (
    (select * from public.credit_transactions except select * from public.wipe204_credits_before)
    union all
    (select * from public.wipe204_credits_before except select * from public.credit_transactions)
  ) d;
  if diff <> 0 then raise exception 'T2 FAIL: credit_transactions changed'; end if;

  select count(*) into diff from (
    (select * from public.entitlement_requests except select * from public.wipe204_requests_before)
    union all
    (select * from public.wipe204_requests_before except select * from public.entitlement_requests)
  ) d;
  if diff <> 0 then raise exception 'T2 FAIL: entitlement_requests changed'; end if;
  raise notice 'T2 PASS: rows after the cutoff and spared rows (J, K, L, test accounts P, R, S) still active; cancelled/expired rows, the library grant, the credits, the requests and the test-account registry untouched';
end $$;

-- T3 metadata: free only for the non-admin, non-spared accounts left with
-- nothing (A, B, F, M, N, T); A's other keys kept; test accounts P, Q, R, S keep pro; C and D (a row after the
-- cutoff) and J, K, L (spared) keep pro; admin E keeps max; G (no tier key)
-- and H (NULL) unchanged.
do $$
declare
  m jsonb;
  diff int;
begin
  select raw_user_meta_data into m from auth.users where id = '00000000-0000-4000-8000-00000000d0a1';
  if m is distinct from '{"tier":"free","full_name":"أحمد"}'::jsonb then
    raise exception 'T3 FAIL: A metadata is %', m;
  end if;
  if (select count(*) from auth.users
       where raw_user_meta_data = '{"tier":"pro"}'::jsonb
         and id in ('00000000-0000-4000-8000-00000000d2a3', '00000000-0000-4000-8000-00000000d2a4')) <> 2 then
    raise exception 'T3 FAIL: an unregistered test account (R …@nzamy.test / S corp-owner@nezamy.sa) lost its tier (owner ٢٢٤)';
  end if;
  select count(*) into diff from auth.users
   where id in ('00000000-0000-4000-8000-00000000d0b2', '00000000-0000-4000-8000-00000000d0f6',
                '00000000-0000-4000-8000-00000000d1a4', '00000000-0000-4000-8000-00000000d1a5',
                '00000000-0000-4000-8000-00000000d2a5')
     and raw_user_meta_data is distinct from '{"tier":"free"}'::jsonb;
  if diff <> 0 then raise exception 'T3 FAIL: % of B, F, M, N, T not reset to free', diff; end if;

  select count(*) into diff
    from auth.users u join public.wipe204_users_before b using (id)
   where u.id not in ('00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-00000000d0b2',
                      '00000000-0000-4000-8000-00000000d0f6', '00000000-0000-4000-8000-00000000d1a4',
                      '00000000-0000-4000-8000-00000000d1a5', '00000000-0000-4000-8000-00000000d2a5')
     and u.raw_user_meta_data is distinct from b.raw_user_meta_data;
  if diff <> 0 then
    raise exception 'T3 FAIL: % account(s) outside A/B/F/M/N/T had their metadata changed (C, D, J, K, L keep pro; admin E keeps max; G, H as they were)', diff;
  end if;
  if (select count(*) from auth.users
       where raw_user_meta_data->>'tier' = 'pro'
         and id in ('00000000-0000-4000-8000-00000000d1a1', '00000000-0000-4000-8000-00000000d1a2',
                    '00000000-0000-4000-8000-00000000d1a3')) <> 3 then
    raise exception 'T3 FAIL: a spared account (J, K, L) lost its tier';
  end if;
  if (select raw_user_meta_data->>'tier' from auth.users where id = '00000000-0000-4000-8000-00000000d0e5') <> 'max' then
    raise exception 'T3 FAIL: the admin''s metadata changed';
  end if;
  if (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-00000000d2a1')
     is distinct from '{"tier":"pro"}'::jsonb then
    raise exception 'T3 FAIL: test account P''s tier was reset (owner ٢٢٤)';
  end if;
  if (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-00000000d2a2')
     is distinct from '{"tier":"pro","full_name":"اختبار"}'::jsonb then
    raise exception 'T3 FAIL: test account Q (no live row) had its tier reset (owner ٢٢٤)';
  end if;
  raise notice 'T3 PASS: metadata reset to free for A, B, F, M, N, T only; C, D, spared J, K, L, test accounts P, Q (registered) and R, S (by e-mail), admin E, G, H untouched';
end $$;

-- T4 a second run (the whole file again, still confirmed) is a no-op.
create temp table s1 as select * from public.subscriptions;
create temp table u1 as select id, raw_user_meta_data from auth.users;
create temp table g1 as select * from public.library_access_grants;
\o /dev/null
\i /tmp/mig5.sql
\o
do $$
declare
  diff int;
begin
  select count(*) into diff from (
    (select * from public.subscriptions except select * from s1)
    union all (select * from s1 except select * from public.subscriptions)
  ) d;
  if diff <> 0 then raise exception 'T4 FAIL: the second run changed % row(s)', diff; end if;
  select count(*) into diff from (
    (select id, raw_user_meta_data from auth.users except select * from u1)
    union all (select * from u1 except select id, raw_user_meta_data from auth.users)
  ) d;
  if diff <> 0 then raise exception 'T4 FAIL: the second run changed % account(s)', diff; end if;
  select count(*) into diff from (
    (select * from public.library_access_grants except select * from g1)
    union all (select * from g1 except select * from public.library_access_grants)
  ) d;
  if diff <> 0 then raise exception 'T4 FAIL: the second run changed the library grants'; end if;
  raise notice 'T4 PASS: a second run changes nothing (subscriptions, metadata, library grants)';
end $$;

-- T5 the guards. Re-arm first, so "nothing changed" means something: a fresh
-- live row created before the cutoff for B, and B's metadata back to pro.
-- Then, for each missing / bad setting, the whole file is run again: block 2
-- must raise (its message is psql's LAST_ERROR_MESSAGE — block 2 is one DO
-- block, so the commit after it turns into ROLLBACK without an error of its
-- own, and block 3 raises nothing) and nothing may change.
insert into public.subscriptions
  (id, user_id, plan_id, tier, billing_cycle, status, auto_renew, current_period_end, created_at, updated_at, metadata)
values ('00000000-0000-4000-8000-0000000053b2', '00000000-0000-4000-8000-00000000d0b2', 'lawyer-pro', 'pro',
        'custom', 'active', false, '2099-01-01 00:00+03', '2026-08-20 10:00+03', '2026-08-20 10:00+03',
        '{"method":"admin_grant"}');
update auth.users set raw_user_meta_data = '{"tier":"pro"}' where id = '00000000-0000-4000-8000-00000000d0b2';
create temp table s2 as select * from public.subscriptions;
create temp table u2 as select id, raw_user_meta_data from auth.users;

create function pg_temp.wipe204_unchanged(label text, expected_error text) returns void
language plpgsql as $$
declare
  err  text := current_setting('test.err', true);
  diff int;
begin
  if coalesce(err, '') not like expected_error then
    raise exception '% FAIL: block 2 did not raise "%" — last error: %', label, expected_error, coalesce(err, '(none)');
  end if;
  select count(*) into diff from (
    (select * from public.subscriptions except select * from s2)
    union all (select * from s2 except select * from public.subscriptions)
  ) d;
  if diff <> 0 then raise exception '% FAIL: % subscription row(s) changed', label, diff; end if;
  select count(*) into diff from (
    (select id, raw_user_meta_data from auth.users except select * from u2)
    union all (select * from u2 except select id, raw_user_meta_data from auth.users)
  ) d;
  if diff <> 0 then raise exception '% FAIL: % account(s) changed', label, diff; end if;
  raise notice '% PASS: block 2 raised, nothing changed', label;
end $$;

-- T5a no confirmation
set nzamy.confirm_wipe = '';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.confirm_wipe;
select pg_temp.wipe204_unchanged('T5a (no confirmation)', '%NOT confirmed%') \g /dev/null

-- T5b no cutoff
set nzamy.wipe_cutoff = '';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5b (no cutoff)', '%cutoff is not set%') \g /dev/null

-- T5c neither setting
set nzamy.confirm_wipe = '';
set nzamy.wipe_cutoff = '';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.confirm_wipe;
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5c (neither setting)', '%NOT confirmed%') \g /dev/null

-- T5d the placeholder left as it is
set nzamy.wipe_cutoff = '<DEPLOY-TIME-WITH-OFFSET>';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5d (placeholder)', '%does not end in a UTC offset%') \g /dev/null

-- T5e a time WITHOUT an offset (the editor runs in UTC: it would be read 3 hours late)
set nzamy.wipe_cutoff = '2026-09-01 00:00:00';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5e (no offset)', '%does not end in a UTC offset%') \g /dev/null

-- T5f a date alone ('-01' at its end is not an offset)
set nzamy.wipe_cutoff = '2026-09-01';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5f (date alone)', '%does not end in a UTC offset%') \g /dev/null

-- T5g ends in an offset but is not a time
set nzamy.wipe_cutoff = '2026-13-45 21:30:00+03';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5g (not a time)', '%is not a time%') \g /dev/null

-- T5h a cutoff in the future (it would cancel subscriptions granted after the deploy)
set nzamy.wipe_cutoff = '2999-01-01 00:00:00+03';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5h (cutoff in the future)', '%in the future%') \g /dev/null

-- T5i (reviewer probe F) — on ONE session, block 1 with its cutoff line
-- enabled, then block 2 with ONLY its confirm line: block 2 must raise
-- «cutoff is not set» (the cutoff typed in block 1 ends with block 1).
-- The session starts with neither setting; the file's own lines are enabled
-- by sed on a copy, so the lines under test are the file's real lines.
-- Run twice: (a) statement by statement (\i, as psql sends a file), and
-- (b) as ONE query string, as the SQL Editor's Run sends it — there a BEGIN
-- turns the statements before it into the same transaction, so only block 1's
-- own `begin transaction read only` … `rollback` pair ends its cutoff.
set nzamy.confirm_wipe = '';
set nzamy.wipe_cutoff = '';
\! sed -e "s|^-- select set_config('nzamy.wipe_cutoff', '<DEPLOY-TIME-WITH-OFFSET>', true);|select set_config('nzamy.wipe_cutoff', '2026-09-01 00:00:00+03', true);|" -e "s|^-- set local nzamy.confirm_wipe = 'WIPE-2026-10-19';|set local nzamy.confirm_wipe = 'WIPE-2026-10-19';|" /tmp/mig5.sql > /tmp/probe_f.sql
do $$
declare
  f  text := pg_read_file('/tmp/probe_f.sql');
begin
  if (length(f) - length(replace(f, E'\nselect set_config(''nzamy.wipe_cutoff'', ''2026-09-01 00:00:00+03'', true);', '')))
     / length(E'\nselect set_config(''nzamy.wipe_cutoff'', ''2026-09-01 00:00:00+03'', true);') <> 1
     or (length(f) - length(replace(f, E'\nset local nzamy.confirm_wipe = ''WIPE-2026-10-19'';', '')))
     / length(E'\nset local nzamy.confirm_wipe = ''WIPE-2026-10-19'';') <> 1
     or position(E'\n-- set local nzamy.wipe_cutoff' in f) = 0
     or position(E'\nset local nzamy.wipe_cutoff' in f) > 0 then
    raise exception 'T5i SETUP FAIL: the copy does not enable exactly block 1''s cutoff line and block 2''s confirm line';
  end if;
end $$;
-- (a) statement by statement, on this session
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/probe_f.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.confirm_wipe;
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5i-a (block 1 cutoff, block 2 confirm only, statement by statement)', '%cutoff is not set%') \g /dev/null

-- (b) the same copy as ONE query string on a fresh session that starts with
-- neither setting (PGOPTIONS overrides the database-level values the fixture
-- armed). Its output is CSV: block 1 (0)'s row must show the typed cutoff
-- (block 1 read it) and block 2 must raise «cutoff is not set».
\! PGOPTIONS='-c nzamy.confirm_wipe= -c nzamy.wipe_cutoff=' psql -X -q -U postgres --csv -c "$(cat /tmp/probe_f.sql)" > /tmp/probe_f_onequery.out 2>&1
do $$
declare
  o     text := pg_read_file('/tmp/probe_f_onequery.out');
  row0  text := substring(o from E'(?:^|\n)cutoff_typed,cutoff_in_riyadh_time,block_2_accepts_it\n([^\n]*)');
  typed text := replace(split_part(row0, ',', 1), '"', '');
begin
  if row0 is null then
    raise exception 'T5i-b FAIL: block 1 (0) printed no row in one-query mode — output: %', left(o, 2000);
  end if;
  if typed <> '2026-09-01 00:00:00+03' or replace(split_part(row0, ',', 3), '"', '') <> 't' then
    raise exception 'T5i-b FAIL: block 1 (0) cutoff_typed = "%", block_2_accepts_it = "%" (expected the typed cutoff, t)',
      typed, split_part(row0, ',', 3);
  end if;
  perform set_config('test.err', coalesce(substring(o from 'ERROR:  ([^\n]*)'), ''), false);
end $$;
select pg_temp.wipe204_unchanged('T5i-b (the same copy as ONE query, like the SQL Editor''s Run)', '%cutoff is not set%') \g /dev/null

-- T6 with both settings back (the cutoff now written with Z, the same instant),
-- the re-armed row IS a target: the run cancels it and B is back to free (so
-- T5's "nothing changed" was not vacuous); C and the spared J, K, L stay.
set nzamy.wipe_cutoff = '2026-08-31T21:00:00Z';
\o /dev/null
\i /tmp/mig5.sql
\o
reset nzamy.wipe_cutoff;
do $$
begin
  if (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000053b2') <> 'cancelled' then
    raise exception 'T6 FAIL: the re-armed old row was not cancelled by a confirmed run';
  end if;
  if (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-00000000d0b2')
     is distinct from '{"tier":"free"}'::jsonb then
    raise exception 'T6 FAIL: B''s metadata was not reset by a confirmed run';
  end if;
  if (select count(*) from public.subscriptions
       where status = 'active'
         and id in ('00000000-0000-4000-8000-0000000051c3', '00000000-0000-4000-8000-0000000054a1',
                    '00000000-0000-4000-8000-0000000054a2', '00000000-0000-4000-8000-0000000054a3')) <> 4 then
    raise exception 'T6 FAIL: C''s row or a spared row (J, K, L) was cancelled';
  end if;
  if (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000055a1') <> 'active'
     or (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-00000000d2a1')
        is distinct from '{"tier":"pro"}'::jsonb
     or (select raw_user_meta_data->>'tier' from auth.users where id = '00000000-0000-4000-8000-00000000d2a2') <> 'pro' then
    raise exception 'T6 FAIL: a registered test account (P''s row or metadata, Q''s tier) was wiped';
  end if;
  if (select count(*) from public.subscriptions
       where status = 'active'
         and id in ('00000000-0000-4000-8000-0000000055a3', '00000000-0000-4000-8000-0000000055a4')) <> 2
     or (select count(*) from auth.users
          where raw_user_meta_data = '{"tier":"pro"}'::jsonb
            and id in ('00000000-0000-4000-8000-00000000d2a3', '00000000-0000-4000-8000-00000000d2a4')) <> 2 then
    raise exception 'T6 FAIL: an unregistered test account (R or S) was wiped';
  end if;
  raise notice 'T6 PASS: confirmed again (cutoff written with Z), the re-armed row is cancelled and B reset; C, J, K, L and test accounts P, Q, R, S kept';
end $$;

-- T7 public.test_accounts missing (an old restore without 20261017_44): block 2
-- must raise BEFORE any change, never wipe the test accounts silently. Re-arm
-- first (a fresh old live row for B, B back to pro), so "nothing changed"
-- means something; then drop the registry and run the whole file again.
insert into public.subscriptions
  (id, user_id, plan_id, tier, billing_cycle, status, auto_renew, current_period_end, created_at, updated_at, metadata)
values ('00000000-0000-4000-8000-0000000053b3', '00000000-0000-4000-8000-00000000d0b2', 'lawyer-pro', 'pro',
        'custom', 'active', false, '2099-01-01 00:00+03', '2026-08-21 10:00+03', '2026-08-21 10:00+03',
        '{"method":"admin_grant"}');
update auth.users set raw_user_meta_data = '{"tier":"pro"}' where id = '00000000-0000-4000-8000-00000000d0b2';
truncate s2;
insert into s2 select * from public.subscriptions;
truncate u2;
insert into u2 select id, raw_user_meta_data from auth.users;
drop table public.test_accounts;
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig5.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
select pg_temp.wipe204_unchanged('T7 (public.test_accounts missing)', '%public.test_accounts does not exist — nothing changed%') \g /dev/null
do $$
begin
  if (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000053b3') <> 'active'
     or (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000055a1') <> 'active' then
    raise exception 'T7 FAIL: a row was cancelled without the test-account registry';
  end if;
  raise notice 'T7 PASS: without public.test_accounts block 2 raises; the re-armed row and test account P''s row stay active';
end $$;

select 'wipe_subscriptions: ALL PASS' as result;
