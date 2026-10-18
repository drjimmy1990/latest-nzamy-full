-- wipe_subscriptions.test.sql — proves the one-time file
-- supabase/one-time/2026-10-19_wipe_subscriptions_and_trials.sql (owner answer ٢٠٤).
-- Chain (run.sh, postgres:16; stubs.sql — auth.users, public.profiles,
-- public.service_requests, the API roles — loads first by itself):
--   the real subscriptions shape (20260603_phase1_003, which also seeds the plans
--   the rows point at) → the library grants table (20261019_10) → the fixture
--   (accounts, rows, a library grant, a credit row, copies of each table, and
--   both settings armed at the database level) → the one-time file, run AS
--   WRITTEN (all 3 blocks, as the user pastes it) → this file.
-- Run from the repo root:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql $M/20261019_10_library_access_grants.sql \
--     $R/prelude_wipe_subscriptions_fixture.sql \
--     supabase/one-time/2026-10-19_wipe_subscriptions_and_trials.sql \
--     $R/wipe_subscriptions.test.sql
-- The one-time file is the 4th file of the chain, so it is /tmp/mig4.sql in the
-- container; T4–T6 run it again from there with \i.
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the one-time file →
--   bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261019_10_library_access_grants.sql $R/prelude_wipe_subscriptions_fixture.sql \
--     $R/wipe_subscriptions.test.sql
--   → "T1 FAIL: subscription …51a1 (active before) is still active".
--
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the four live rows created before the cutoff (A active, B trialing,
-- D past_due, admin E active) are cancelled exactly as the brief says.
do $$
declare
  t0 timestamptz := (select t0 from public.wipe204_t0);
  r  record;
  n  int := 0;
begin
  for r in
    select s.*, b.status as old_status, b.current_period_end as old_cpe,
           b.metadata as old_meta, b.tier as old_tier
      from public.subscriptions s join public.wipe204_subs_before b using (id)
     where s.id in ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-0000000051b2',
                    '00000000-0000-4000-8000-0000000051d4', '00000000-0000-4000-8000-0000000051e5')
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
  if n <> 4 then raise exception 'T1 FAIL: found % of the 4 old live rows', n; end if;
  -- D's period had already ended in July: the wipe must not move it forward.
  if (select current_period_end from public.subscriptions
       where id = '00000000-0000-4000-8000-0000000051d4') <> '2026-07-31 10:00+03' then
    raise exception 'T1 FAIL: D''s past period end moved';
  end if;
  raise notice 'T1 PASS: 4 live rows created before the cutoff cancelled (active, trialing, past_due, admin), period ends clipped, metadata stamped';
end $$;

-- T2 everything else is exactly as before: the rows created after the cutoff,
-- the rows already cancelled / expired, the library grant and the credits.
do $$
declare
  diff int;
begin
  select count(*) into diff from (
    (select * from public.subscriptions
      where id not in ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-0000000051b2',
                       '00000000-0000-4000-8000-0000000051d4', '00000000-0000-4000-8000-0000000051e5')
     except select * from public.wipe204_subs_before)
    union all
    (select * from public.wipe204_subs_before
      where id not in ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-0000000051b2',
                       '00000000-0000-4000-8000-0000000051d4', '00000000-0000-4000-8000-0000000051e5')
     except select * from public.subscriptions)
  ) d;
  if diff <> 0 then raise exception 'T2 FAIL: % other subscription row(s) changed', diff; end if;
  if (select count(*) from public.subscriptions) <> (select count(*) from public.wipe204_subs_before) then
    raise exception 'T2 FAIL: the number of subscription rows changed';
  end if;
  if (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000051c3') <> 'active'
     or (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000052d4') <> 'active' then
    raise exception 'T2 FAIL: a row created after the cutoff is no longer active';
  end if;

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
  raise notice 'T2 PASS: rows after the cutoff still active; cancelled/expired rows, the library grant and the credits untouched';
end $$;

-- T3 metadata: free only for the non-admins left with nothing (A, B, F); A's
-- other keys kept; C and D (a row after the cutoff) keep pro; admin E keeps
-- max; G (no tier key) and H (NULL) unchanged.
do $$
declare
  m jsonb;
  diff int;
begin
  select raw_user_meta_data into m from auth.users where id = '00000000-0000-4000-8000-00000000d0a1';
  if m is distinct from '{"tier":"free","full_name":"أحمد"}'::jsonb then
    raise exception 'T3 FAIL: A metadata is %', m;
  end if;
  select raw_user_meta_data into m from auth.users where id = '00000000-0000-4000-8000-00000000d0b2';
  if m is distinct from '{"tier":"free"}'::jsonb then raise exception 'T3 FAIL: B metadata is %', m; end if;
  select raw_user_meta_data into m from auth.users where id = '00000000-0000-4000-8000-00000000d0f6';
  if m is distinct from '{"tier":"free"}'::jsonb then raise exception 'T3 FAIL: F metadata is %', m; end if;

  select count(*) into diff
    from auth.users u join public.wipe204_users_before b using (id)
   where u.id not in ('00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-00000000d0b2',
                      '00000000-0000-4000-8000-00000000d0f6')
     and u.raw_user_meta_data is distinct from b.raw_user_meta_data;
  if diff <> 0 then
    raise exception 'T3 FAIL: % account(s) outside A/B/F had their metadata changed (C, D keep pro; admin E keeps max; G, H as they were)', diff;
  end if;
  if (select raw_user_meta_data->>'tier' from auth.users where id = '00000000-0000-4000-8000-00000000d0e5') <> 'max' then
    raise exception 'T3 FAIL: the admin''s metadata changed';
  end if;
  raise notice 'T3 PASS: metadata reset to free for A, B, F only; C, D, admin E, G, H untouched';
end $$;

-- T4 a second run (the whole file again, still confirmed) is a no-op.
create temp table s1 as select * from public.subscriptions;
create temp table u1 as select id, raw_user_meta_data from auth.users;
create temp table g1 as select * from public.library_access_grants;
\o /dev/null
\i /tmp/mig4.sql
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
  (id, user_id, plan_id, tier, billing_cycle, status, auto_renew, current_period_end, created_at, metadata)
values ('00000000-0000-4000-8000-0000000053b2', '00000000-0000-4000-8000-00000000d0b2', 'lawyer-pro', 'pro',
        'custom', 'active', false, '2099-01-01 00:00+03', '2026-08-20 10:00+03', '{"method":"admin_grant"}');
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
  raise notice '% PASS: block 2 raised (%), nothing changed', label, err;
end $$;

-- T5a no confirmation
set nzamy.confirm_wipe = '';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig4.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.confirm_wipe;
select pg_temp.wipe204_unchanged('T5a (no confirmation)', '%NOT confirmed%') \g /dev/null

-- T5b no cutoff
set nzamy.wipe_cutoff = '';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig4.sql
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
\i /tmp/mig4.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.confirm_wipe;
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5c (neither setting)', '%NOT confirmed%') \g /dev/null

-- T5d a cutoff that is not a time (the placeholder left as it is)
set nzamy.wipe_cutoff = '<the time deploy.sh finished>';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig4.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5d (cutoff not a time)', '%is not a time%') \g /dev/null

-- T5e a cutoff in the future (it would cancel subscriptions granted after the deploy)
set nzamy.wipe_cutoff = '2999-01-01 00:00:00+03';
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig4.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.wipe_cutoff;
select pg_temp.wipe204_unchanged('T5e (cutoff in the future)', '%in the future%') \g /dev/null

-- T6 with both settings back, the re-armed row IS a target: the run cancels it
-- and B is back to free (so T5's "nothing changed" was not vacuous).
\o /dev/null
\i /tmp/mig4.sql
\o
do $$
begin
  if (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000053b2') <> 'cancelled' then
    raise exception 'T6 FAIL: the re-armed old row was not cancelled by a confirmed run';
  end if;
  if (select raw_user_meta_data from auth.users where id = '00000000-0000-4000-8000-00000000d0b2')
     is distinct from '{"tier":"free"}'::jsonb then
    raise exception 'T6 FAIL: B''s metadata was not reset by a confirmed run';
  end if;
  if (select status from public.subscriptions where id = '00000000-0000-4000-8000-0000000051c3') <> 'active' then
    raise exception 'T6 FAIL: C''s row created after the cutoff was cancelled';
  end if;
  raise notice 'T6 PASS: confirmed again, the re-armed row is cancelled and B reset; C kept';
end $$;

select 'wipe_subscriptions: ALL PASS' as result;
