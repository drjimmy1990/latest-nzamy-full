-- share_passcode_lockout.test.sql — proves 20261109_11 (SAST-04): a share
-- passcode is checked in the database with a durable counter; 5 wrong in a
-- row lock the share for 15 minutes; while locked even the right passcode is
-- refused and not counted; a right passcode resets the counter; the function
-- is service role only. The migration runs TWICE (idempotent) with a stray
-- EXECUTE grant between the runs that the second run takes back.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself) — the chain of
-- document_shares_path_ownership.test.sql, then 20261109_11 twice. From the
-- repo root, in Git Bash:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $T/prelude_attachments_live.sql \
--     $T/prelude_attachments_stray_insert_policies.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $T/prelude_document_shares_live.sql \
--     $M/20261026_66_document_shares_path_ownership.sql \
--     $M/20261109_11_share_passcode_lockout.sql \
--     $T/prelude_share_passcode_lockout_between_runs.sql \
--     $M/20261109_11_share_passcode_lockout.sql \
--     $T/share_passcode_lockout.test.sql
-- NEGATIVE CONTROL: the same chain without the 20261109_11 files and the
-- between-prelude stops at T0 ("share_passcode_check does not exist").
--
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regprocedure('public.share_passcode_check(text, text)') is null then
    raise exception 'T0 FAIL: share_passcode_check does not exist (20261109_11 not applied)';
  end if;
end $$;

create function pg_temp.h(t text) returns text language sql immutable as
  $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

insert into public.document_shares (owner_id, document_id, document_path, token_hash, passcode_hash, expires_at)
values
  (null, '1', 'x/a.pdf', pg_temp.h('token-locked'), pg_temp.h('123456'), now() + interval '1 day'),
  (null, '2', 'x/b.pdf', pg_temp.h('token-open'),   null,                now() + interval '1 day'),
  (null, '3', 'x/c.pdf', pg_temp.h('token-reset'),  pg_temp.h('654321'), now() + interval '1 day');

-- T1 four wrong → denied (counted); the right one → ok and the counter resets
do $$
declare
  t text := pg_temp.h('token-reset');
  i int;
  r text;
begin
  for i in 1..4 loop
    r := public.share_passcode_check(t, pg_temp.h('000000')) ->> 'result';
    if r <> 'denied' then raise exception 'T1 FAIL: wrong passcode % answered %', i, r; end if;
  end loop;
  if (select failed_attempts from public.document_shares where token_hash = t) <> 4 then
    raise exception 'T1 FAIL: the counter is not 4 after four wrong passcodes';
  end if;
  r := public.share_passcode_check(t, pg_temp.h('654321')) ->> 'result';
  if r <> 'ok' then raise exception 'T1 FAIL: the right passcode answered %', r; end if;
  if (select failed_attempts from public.document_shares where token_hash = t) <> 0 then
    raise exception 'T1 FAIL: a right passcode did not reset the counter';
  end if;
end $$;

-- T2 the 5th wrong locks for 15 minutes; while locked the RIGHT passcode is
-- refused with the same answer as a wrong one, and nothing is counted
do $$
declare
  t text := pg_temp.h('token-locked');
  i int;
  r text;
  s record;
begin
  for i in 1..4 loop
    r := public.share_passcode_check(t, pg_temp.h('111111')) ->> 'result';
    if r <> 'denied' then raise exception 'T2 FAIL: wrong passcode % answered %', i, r; end if;
  end loop;
  r := public.share_passcode_check(t, pg_temp.h('111111')) ->> 'result';
  if r <> 'locked' then raise exception 'T2 FAIL: the 5th wrong passcode answered %', r; end if;
  select failed_attempts, locked_until into s from public.document_shares where token_hash = t;
  if s.failed_attempts <> 0 or s.locked_until <> now() + interval '15 minutes' then
    raise exception 'T2 FAIL: after the 5th wrong: attempts %, locked_until % (expected 0, now + 15 min)', s.failed_attempts, s.locked_until;
  end if;
  if public.share_passcode_check(t, pg_temp.h('123456')) ->> 'result' <> 'locked' then
    raise exception 'T2 FAIL: the right passcode opened a locked share';
  end if;
  if public.share_passcode_check(t, pg_temp.h('999999')) ->> 'result' <> 'locked' then
    raise exception 'T2 FAIL: a wrong passcode on a locked share did not answer locked';
  end if;
  select failed_attempts, locked_until into s from public.document_shares where token_hash = t;
  if s.failed_attempts <> 0 or s.locked_until <> now() + interval '15 minutes' then
    raise exception 'T2 FAIL: an attempt during the lock was counted or moved the lock';
  end if;
end $$;

-- T3 once the lock has passed, the right passcode opens and clears it
update public.document_shares set locked_until = now() - interval '1 second' where token_hash = pg_temp.h('token-locked');
do $$
declare
  t text := pg_temp.h('token-locked');
begin
  if public.share_passcode_check(t, pg_temp.h('123456')) ->> 'result' <> 'ok' then
    raise exception 'T3 FAIL: the right passcode after the lock did not open';
  end if;
  if (select locked_until from public.document_shares where token_hash = t) is not null then
    raise exception 'T3 FAIL: a right passcode did not clear the old lock';
  end if;
end $$;

-- T4 unknown / malformed token → none; open link → ok; malformed passcode hash → denied (counted)
do $$
begin
  if public.share_passcode_check(pg_temp.h('nope'), pg_temp.h('123456')) ->> 'result' <> 'none'
     or public.share_passcode_check('not-a-hash', pg_temp.h('123456')) ->> 'result' <> 'none'
     or public.share_passcode_check(null, pg_temp.h('123456')) ->> 'result' <> 'none' then
    raise exception 'T4 FAIL: an unknown or malformed token was not none';
  end if;
  if public.share_passcode_check(pg_temp.h('token-open'), pg_temp.h('')) ->> 'result' <> 'ok' then
    raise exception 'T4 FAIL: an open link (no passcode) did not answer ok';
  end if;
  if public.share_passcode_check(pg_temp.h('token-reset'), 'ZZZ') ->> 'result' <> 'denied'
     or public.share_passcode_check(pg_temp.h('token-reset'), null) ->> 'result' <> 'denied' then
    raise exception 'T4 FAIL: a malformed passcode hash was not denied';
  end if;
  if (select failed_attempts from public.document_shares where token_hash = pg_temp.h('token-reset')) <> 2 then
    raise exception 'T4 FAIL: malformed passcode hashes were not counted';
  end if;
end $$;

-- T5 sessions cannot EXECUTE (the second run took the stray grant back); service_role can
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    execute format('set local role %I', r);
    begin
      perform public.share_passcode_check(repeat('a', 64), repeat('b', 64));
      raise exception 'T5 FAIL: % could EXECUTE share_passcode_check', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  set local role service_role;
  r := public.share_passcode_check(repeat('a', 64), repeat('b', 64)) ->> 'result';
  reset role;
  if r <> 'none' then raise exception 'T5 FAIL: service_role call answered %', r; end if;
end $$;

do $$ begin raise notice 'share_passcode_lockout: ALL PASS (T0–T5)'; end $$;
