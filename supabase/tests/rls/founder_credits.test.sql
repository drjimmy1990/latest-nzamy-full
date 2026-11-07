-- founder_credits.test.sql — proves 20261101_10 §8 (lawyer founder
-- membership, P3 Task 2): a founder credit pays for an AI run instead of
-- points (ai_start_run_with_credit), and a failed run gives it back exactly
-- once (ai_fail_run).
--
-- It proves 20261101_10 ALONE: after 20261107_60 (owner ٤١٠) the rejoinder is
-- eligible, so T2 and T6 fail on purpose there — founder_rejoinder_410.test.sql
-- proves that chain.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself) — the chain of
-- founder_membership.test.sql (it already holds 20261027_10_ai_runs), the
-- migration TWICE with the between-runs prelude. From the repo root, in Git
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
--     $T/founder_credits.test.sql
-- The between-runs prelude pauses the sale and sets capacity 50: activation
-- ignores both (it does not check the window), so the seats below still
-- activate. The ONE-RUN chain (20261101_10 once, no prelude) must pass too.
--
-- NEGATIVE CONTROL / RED (must FAIL) — the same chain with the Task 1 version
-- of 20261101_10 (no §8):
--   → "T0 FAIL: public.ai_start_run_with_credit(...) does not exist (20261101_10 §8 not applied)".
--
-- The existing points refunds are proved unchanged by ai_runs.test.sql run
-- against a chain that ends with 20261101_10 (see the Task 2 report).
--
-- Actors (verified lawyers, each with a paid, activated founder order):
--   F1 …fc01 6 works + 1 output: spend, replay, fail twice, sweep, succeeded
--   F2 …fc02 expired credits · F3 …fc03 no seat at all (enforcement off)
--   F4 …fc04 seat revoked after a spend.
-- Every assertion RAISES on failure. Errors are matched exactly on
-- SQLSTATE P0001 and SQLERRM.
\set ON_ERROR_STOP on

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)') is null then
    raise exception 'T0 FAIL: public.ai_start_run_with_credit(...) does not exist (20261101_10 §8 not applied)';
  end if;
end $$;

-- T1 the contract Task 6 calls: ai_start_run's parameters, same names, types,
-- defaults and order, plus p_credit_kind last; six named result columns; one
-- overload each; service role only; ai_fail_run's signature unchanged
do $$
declare
  a_args text;
  c_args text;
  c_res  text;
  cfg    text[];
  sd     boolean;
  fn     text := 'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)';
  r      text;
  p      text;
begin
  select pg_get_function_arguments(p.oid) into a_args from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_start_run';
  select pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), p.proconfig, p.prosecdef
    into c_args, c_res, cfg, sd
    from pg_proc p where p.oid = to_regprocedure(fn);
  if c_args is distinct from a_args || ', p_credit_kind text DEFAULT NULL::text' then
    raise exception 'T1 FAIL: arguments differ from ai_start_run + p_credit_kind: [%] vs [%]', c_args, a_args;
  end if;
  if c_res is distinct from 'TABLE(run_id uuid, created boolean, status text, charged boolean, charged_points integer, credit_used boolean)' then
    raise exception 'T1 FAIL: result is %', c_res;
  end if;
  if not sd or not ('search_path=public, pg_temp' = any (cfg)) then
    raise exception 'T1 FAIL: not SECURITY DEFINER with search_path public, pg_temp (%)', cfg;
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception 'T1 FAIL: % can EXECUTE ai_start_run_with_credit', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'T1 FAIL: service_role cannot EXECUTE ai_start_run_with_credit';
  end if;
  foreach p in array array['ai_start_run', 'ai_fail_run', 'ai_start_run_with_credit'] loop
    if (select count(*) from pg_proc where proname = p) <> 1 then
      raise exception 'T1 FAIL: % overloads of % (PGRST203)', (select count(*) from pg_proc where proname = p), p;
    end if;
  end loop;
  if to_regprocedure('public.ai_fail_run(uuid, text, text)') is null
     or (select pg_get_function_arguments(oid) || ' → ' || pg_get_function_result(oid)
           from pg_proc where oid = to_regprocedure('public.ai_fail_run(uuid, text, text)'))
        is distinct from 'p_run uuid, p_code text, p_message text DEFAULT NULL::text → boolean' then
    raise exception 'T1 FAIL: ai_fail_run signature changed';
  end if;
  if has_function_privilege('authenticated', 'public.ai_fail_run(uuid, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ai_fail_run(uuid, text, text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.ai_fail_run(uuid, text, text)', 'EXECUTE') then
    raise exception 'T1 FAIL: ai_fail_run privileges changed';
  end if;
  raise notice 'T1 PASS: contract = ai_start_run args + p_credit_kind, 6 result columns; one overload each of ai_start_run / ai_fail_run / ai_start_run_with_credit; service role only';
end $$;

-- ── Setup ────────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000fc01'), ('00000000-0000-0000-0000-00000000fc02'),
  ('00000000-0000-0000-0000-00000000fc03'), ('00000000-0000-0000-0000-00000000fc04');
insert into public.profiles (id, user_type, display_name)
  select id, 'lawyer', 'مؤسس ' || right(id::text, 2) from auth.users
   where id::text like '00000000-0000-0000-0000-00000000fc%';
insert into public.lawyer_profiles (user_id, verification_status)
  select id, 'verified' from auth.users where id::text like '00000000-0000-0000-0000-00000000fc%';

-- orders …fb<lawyer>1, paid; F1, F2, F4 activated (F3 holds no seat)
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status, paid_at)
  select ('00000000-0000-0000-0000-00000000fb' || right(u.id::text, 1) || '1')::uuid, u.id, 'membership',
         'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'paid', now()
    from auth.users u
   where u.id in ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fc02',
                  '00000000-0000-0000-0000-00000000fc04');
do $$
declare
  o uuid;
  r text;
begin
  foreach o in array array['00000000-0000-0000-0000-00000000fb11'::uuid,
                           '00000000-0000-0000-0000-00000000fb21'::uuid,
                           '00000000-0000-0000-0000-00000000fb41'::uuid] loop
    r := public.founder_activate(o);
    if r is distinct from 'activated' then
      raise exception 'SETUP FAIL: founder_activate(%) returned %', o, r;
    end if;
  end loop;
end $$;

-- every call names all 15 arguments, as Task 6's admin.rpc(...) will
create function pg_temp.spend(p_user uuid, p_tool text, p_draft text, p_key text, p_kind text)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int, credit_used boolean)
language sql as $$
  select x.run_id, x.created, x.status, x.charged, x.charged_points, x.credit_used
    from public.ai_start_run_with_credit(
           p_user            => p_user,
           p_tool            => p_tool,
           p_variant         => null,
           p_class           => 'job',
           p_price           => 40,
           p_daily_limit     => 100,
           p_idempotency_key => p_key,
           p_deadline        => now() + interval '10 minutes',
           p_exempt          => false,
           p_input           => case when p_draft is null then null else jsonb_build_object('kind', p_draft) end,
           p_file_ids        => '{}',
           p_pages           => null,
           p_conversation    => null,
           p_source_ids      => null,
           p_credit_kind     => p_kind) x;
$$;
create function pg_temp.err_of(p_user uuid, p_tool text, p_draft text, p_key text, p_kind text)
returns text language plpgsql as $$
begin
  perform 1 from pg_temp.spend(p_user, p_tool, p_draft, p_key, p_kind);
  return 'no error';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.left_of(p_user uuid, p_kind text) returns int language sql as $$
  select c.remaining from public.membership_credits c
   where c.user_id = p_user and c.kind = p_kind order by c.created_at desc limit 1;
$$;

-- T2 points_enforcement OFF (the seed): a credit run starts as an ordinary
-- free run — nothing is consumed, no use row; a lawyer with no seat runs too
do $$
declare
  x record;
begin
  if (select value from public.platform_settings where key = 'points_enforcement') is distinct from 'false'::jsonb then
    raise exception 'T2 FAIL: setup expects points_enforcement false';
  end if;
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'claim', 'off-key-0001', 'drafting_work');
  if not x.created or x.credit_used or x.charged or x.charged_points <> 0 then
    raise exception 'T2 FAIL: F1 with enforcement off returned %', row_to_json(x);
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6 then
    raise exception 'T2 FAIL: enforcement off decremented F1 to %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc03', 'wargaming', null, 'off-key-0003', 'independent_output');
  if not x.created or x.credit_used or x.charged then
    raise exception 'T2 FAIL: F3 (no seat) with enforcement off returned %', row_to_json(x);
  end if;
  if (select price_points from public.ai_runs where id = x.run_id) <> 0 then
    raise exception 'T2 FAIL: the run was not started at price 0';
  end if;
  if exists (select 1 from public.membership_credit_uses) then
    raise exception 'T2 FAIL: enforcement off wrote a credit use';
  end if;
  -- the eligibility check still holds with enforcement off
  if pg_temp.err_of('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'rejoinder', 'off-key-0002', 'drafting_work')
     is distinct from 'P0001 credit_not_eligible' then
    raise exception 'T2 FAIL: rejoinder with enforcement off did not raise credit_not_eligible';
  end if;
  raise notice 'T2 PASS: enforcement off → free run at price 0, credit_used false, nothing decremented, no use row (seat or not)';
end $$;

update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- T3 a founder with 6 works spends one: remaining 5, credit_used, not charged
do $$
declare
  x record;
  u record;
begin
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'claim', 'work-key-0001', 'drafting_work');
  if not x.created or not x.credit_used or x.charged or x.charged_points <> 0 or x.status <> 'running' then
    raise exception 'T3 FAIL: spend returned %', row_to_json(x);
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 5 then
    raise exception 'T3 FAIL: remaining %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  if exists (select 1 from public.ai_runs where id = x.run_id and (charged or charged_at is not null or price_points <> 0)) then
    raise exception 'T3 FAIL: the run was charged or priced';
  end if;
  if exists (select 1 from public.points_ledger where ref = 'ai_run:' || x.run_id::text) then
    raise exception 'T3 FAIL: a points ledger row was written';
  end if;
  select cu.tool, cu.restored_at, c.kind into u
    from public.membership_credit_uses cu join public.membership_credits c on c.id = cu.credit_id
   where cu.run_id = x.run_id;
  if u.tool is distinct from 'legal-drafter' or u.kind is distinct from 'drafting_work' or u.restored_at is not null then
    raise exception 'T3 FAIL: use row %', row_to_json(u);
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'independent_output') <> 1 then
    raise exception 'T3 FAIL: the output credit moved';
  end if;
  raise notice 'T3 PASS: claim on legal-drafter → remaining 5, credit_used true, run charged false at price 0, one use row';
end $$;

-- T4 the same idempotency key again: the same run, no second decrement
do $$
declare
  x  record;
  r1 uuid;
begin
  select cu.run_id into r1 from public.membership_credit_uses cu
    join public.ai_runs a on a.id = cu.run_id where a.idempotency_key = 'work-key-0001';
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'claim', 'work-key-0001', 'drafting_work');
  if x.created or x.credit_used or x.run_id is distinct from r1 then
    raise exception 'T4 FAIL: replay returned %', row_to_json(x);
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 5
     or (select count(*) from public.membership_credit_uses where run_id = r1) <> 1 then
    raise exception 'T4 FAIL: replay decremented or wrote a second use';
  end if;
  raise notice 'T4 PASS: same key → the same run, created false, credit_used false, remaining 5';
end $$;

-- T5 ai_fail_run restores the work; a second ai_fail_run changes nothing
do $$
declare
  r1 uuid;
  ok boolean;
  t1 timestamptz;
begin
  select a.id into r1 from public.ai_runs a where a.idempotency_key = 'work-key-0001';
  ok := public.ai_fail_run(r1, 'n8n_error', 'first failure');
  if not ok then raise exception 'T5 FAIL: first ai_fail_run returned false'; end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6 then
    raise exception 'T5 FAIL: after the fail remaining %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  select restored_at into t1 from public.membership_credit_uses where run_id = r1;
  if t1 is null then raise exception 'T5 FAIL: restored_at not set'; end if;
  if exists (select 1 from public.ai_runs where id = r1 and (status <> 'failed' or refunded_at is not null)) then
    raise exception 'T5 FAIL: the run is not failed, or was marked refunded';
  end if;
end $$;
do $$
declare
  r1 uuid;
  ok boolean;
begin
  select a.id into r1 from public.ai_runs a where a.idempotency_key = 'work-key-0001';
  ok := public.ai_fail_run(r1, 'late_callback', 'second failure');
  if ok then raise exception 'T5 FAIL: second ai_fail_run returned true'; end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6 then
    raise exception 'T5 FAIL: second fail left remaining %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  -- even a use row whose restore was lost cannot be restored by a final run
  update public.membership_credit_uses set restored_at = null where run_id = r1;
  ok := public.ai_fail_run(r1, 'late_callback', 'third failure');
  if ok or pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6 then
    raise exception 'T5 FAIL: a fail on a final run restored again';
  end if;
  update public.membership_credit_uses set restored_at = now() where run_id = r1;
  raise notice 'T5 PASS: ai_fail_run → remaining 6 and restored_at set; a second fail → false, remaining 6';
end $$;

-- T6 not eligible: rejoinder, no kind, a wrong tool for the kind, no kind given
do $$
declare
  e      text;
  n_runs int := (select count(*) from public.ai_runs);
  c      record;
begin
  for c in select * from (values
      ('legal-drafter', 'rejoinder', 'drafting_work'),
      ('legal-drafter', null,        'drafting_work'),
      ('legal-drafter', 'unknown',   'drafting_work'),
      ('contracts-pro', 'claim',     'drafting_work'),
      ('legal-drafter', 'claim',     'independent_output'),
      ('legal-opinion-x', null,      'independent_output'),
      ('wargaming',     null,        'other_kind'),
      ('wargaming',     null,        null)) v(tool, draft, kind) loop
    e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc01', c.tool, c.draft, 'bad-key-' || md5(concat_ws('|', c.tool, c.draft, c.kind)), c.kind);
    if e is distinct from 'P0001 credit_not_eligible' then
      raise exception 'T6 FAIL: % / % / % gave %', c.tool, c.draft, c.kind, e;
    end if;
  end loop;
  if (select count(*) from public.ai_runs) <> n_runs
     or pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6
     or pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'independent_output') <> 1 then
    raise exception 'T6 FAIL: an ineligible call created a run or moved a credit';
  end if;
  raise notice 'T6 PASS: rejoinder / no kind / wrong tool / unknown or null credit kind → P0001 credit_not_eligible, nothing written';
end $$;

-- T7 every eligible drafter kind and every output tool passes the check: F3
-- holds no credit, so an eligible call gets past it and stops at no_credit
do $$
declare
  k text;
  e text;
begin
  foreach k in array array['claim', 'reply', 'supplementary', 'closing', 'appeal', 'cassation', 'petition'] loop
    e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc03', 'legal-drafter', k, 'elig-key-' || k, 'drafting_work');
    if e is distinct from 'P0001 no_credit' then
      raise exception 'T7 FAIL: drafter kind % gave %', k, e;
    end if;
  end loop;
  foreach k in array array['contracts-pro', 'legal-opinion-consult', 'legal-opinion-letter', 'wargaming'] loop
    e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc03', k, null, 'elig-key-' || k, 'independent_output');
    if e is distinct from 'P0001 no_credit' then
      raise exception 'T7 FAIL: output tool % gave %', k, e;
    end if;
  end loop;
  if exists (select 1 from public.ai_runs where idempotency_key like 'elig-key-%') then
    raise exception 'T7 FAIL: a no_credit call left a run';
  end if;
  raise notice 'T7 PASS: the 7 drafter kinds and the 4 output tools are eligible; without a credit → P0001 no_credit, no run';
end $$;

-- T8 the independent output on wargaming leaves 0; the same key replays the
-- run; a new key → no_credit
do $$
declare
  x  record;
  y  record;
  e  text;
begin
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'wargaming', null, 'out-key-0001', 'independent_output');
  if not x.created or not x.credit_used or x.charged then
    raise exception 'T8 FAIL: output spend returned %', row_to_json(x);
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'independent_output') <> 0 then
    raise exception 'T8 FAIL: output remaining %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'independent_output');
  end if;
  select * into y from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'wargaming', null, 'out-key-0001', 'independent_output');
  if y.created or y.credit_used or y.run_id is distinct from x.run_id then
    raise exception 'T8 FAIL: replay of the last credit returned %', row_to_json(y);
  end if;
  e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc01', 'contracts-pro', null, 'out-key-0002', 'independent_output');
  if e is distinct from 'P0001 no_credit' then
    raise exception 'T8 FAIL: a second output gave %', e;
  end if;
  if exists (select 1 from public.ai_runs where idempotency_key = 'out-key-0002')
     or pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6 then
    raise exception 'T8 FAIL: no_credit left a run or moved the works';
  end if;
  raise notice 'T8 PASS: wargaming → output 0; same key → same run, credit_used false; new key → P0001 no_credit, no run';
end $$;

-- T9 review focus 3: the sweep fails a timed-out run (restores), then a late
-- n8n failure arrives — restored exactly once
do $$
declare x record;
begin
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'appeal', 'sweep-key-0001', 'drafting_work');
  if not x.credit_used or pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 5 then
    raise exception 'T9 FAIL: setup spend %', row_to_json(x);
  end if;
  update public.ai_runs set deadline_at = now() - interval '1 minute' where id = x.run_id;
end $$;
do $$
declare
  n  int;
  r  uuid := (select id from public.ai_runs where idempotency_key = 'sweep-key-0001');
begin
  n := public.ai_sweep_runs();
  if n < 1 or (select status from public.ai_runs where id = r) <> 'failed' then
    raise exception 'T9 FAIL: the sweep did not fail the run (n = %)', n;
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6 then
    raise exception 'T9 FAIL: after the sweep remaining %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  if public.ai_fail_run(r, 'n8n_error', 'late failure') then
    raise exception 'T9 FAIL: the late ai_fail_run returned true';
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 6 then
    raise exception 'T9 FAIL: the late fail restored again (remaining %)', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  raise notice 'T9 PASS: sweep → failed and restored (6); late ai_fail_run → false, still 6';
end $$;

-- T10 a run that succeeded keeps its credit spent when a failure arrives late
do $$
declare
  x record;
begin
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'petition', 'ok-key-0001', 'drafting_work');
  update public.ai_runs set status = 'succeeded', finished_at = now() where id = x.run_id and status = 'running';
  if public.ai_fail_run(x.run_id, 'n8n_error', 'after success') then
    raise exception 'T10 FAIL: ai_fail_run on a succeeded run returned true';
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 5
     or (select restored_at from public.membership_credit_uses where run_id = x.run_id) is not null then
    raise exception 'T10 FAIL: a succeeded run gave its credit back';
  end if;
  raise notice 'T10 PASS: succeeded run + late failure → no restore, remaining 5';
end $$;

-- T11 the works run out: 5 more spends → 0, the next → no_credit; a fail of
-- one of them gives exactly one back
do $$
declare
  i int;
  x record;
  e text;
begin
  for i in 1..5 loop
    select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'reply', 'many-key-000' || i, 'drafting_work');
    if not x.credit_used then raise exception 'T11 FAIL: spend % not paid by credit', i; end if;
  end loop;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 0 then
    raise exception 'T11 FAIL: remaining % after 6 spends', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'reply', 'many-key-0006', 'drafting_work');
  if e is distinct from 'P0001 no_credit' then raise exception 'T11 FAIL: the 7th work gave %', e; end if;
  perform public.ai_fail_run(x.run_id, 'n8n_error', null);
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 1 then
    raise exception 'T11 FAIL: a fail at 0 left remaining %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  raise notice 'T11 PASS: 6 works spent → 0, 7th → no_credit; one fail → 1';
end $$;

-- T12 an expired credit (ends_at in the past) → no_credit, nothing written
update public.membership_credits set ends_at = now() - interval '1 day'
 where user_id = '00000000-0000-0000-0000-00000000fc02';
do $$
declare e text;
begin
  e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc02', 'legal-drafter', 'claim', 'exp-key-0001', 'drafting_work');
  if e is distinct from 'P0001 no_credit' then raise exception 'T12 FAIL: expired works gave %', e; end if;
  e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc02', 'legal-opinion-letter', null, 'exp-key-0002', 'independent_output');
  if e is distinct from 'P0001 no_credit' then raise exception 'T12 FAIL: expired output gave %', e; end if;
  if exists (select 1 from public.ai_runs where user_id = '00000000-0000-0000-0000-00000000fc02')
     or pg_temp.left_of('00000000-0000-0000-0000-00000000fc02', 'drafting_work') <> 6 then
    raise exception 'T12 FAIL: an expired credit left a run or moved';
  end if;
  raise notice 'T12 PASS: expired credits → P0001 no_credit, no run, remaining kept';
end $$;

-- T13 a revoked seat: the fail of a run spent before the revoke gives the
-- credit row a 1 back, but the revoked seat cannot spend it
do $$
declare x record;
begin
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc04', 'legal-drafter', 'closing', 'rev-key-0001', 'drafting_work');
  if not x.credit_used then raise exception 'T13 FAIL: setup spend %', row_to_json(x); end if;
  if public.founder_revoke('00000000-0000-0000-0000-00000000fb41', 'refund') is distinct from 'revoked' then
    raise exception 'T13 FAIL: revoke did not revoke';
  end if;
  perform public.ai_fail_run(x.run_id, 'n8n_error', null);
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc04', 'drafting_work') <> 1 then
    raise exception 'T13 FAIL: fail after revoke left remaining %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc04', 'drafting_work');
  end if;
  if pg_temp.err_of('00000000-0000-0000-0000-00000000fc04', 'legal-drafter', 'closing', 'rev-key-0002', 'drafting_work')
     is distinct from 'P0001 no_credit' then
    raise exception 'T13 FAIL: a revoked seat spent a credit';
  end if;
  raise notice 'T13 PASS: revoked seat → restore lands on the row but cannot be spent (no_credit)';
end $$;

-- T14 a points-paid run is still refunded in points (the restore block only
-- touches runs that hold a credit use): give F3 a lot, run a charged
-- ai_start_run, fail it → points back, no credit use
do $$
declare
  x   record;
  bal int;
begin
  insert into public.points_lots (user_id, source, points_total, points_left, expires_at)
    values ('00000000-0000-0000-0000-00000000fc03', 'admin', 100, 100, now() + interval '1 year');
  select * into x from public.ai_start_run('00000000-0000-0000-0000-00000000fc03', 'contracts-pro', null, 'job', 40, 100,
                                           'pts-key-0001', now() + interval '10 minutes');
  if not x.charged or x.charged_points <> 40 then
    raise exception 'T14 FAIL: points run %', row_to_json(x);
  end if;
  if not public.ai_fail_run(x.run_id, 'n8n_error', null) then raise exception 'T14 FAIL: fail returned false'; end if;
  select sum(points_left) into bal from public.points_lots where user_id = '00000000-0000-0000-0000-00000000fc03';
  if bal <> 100 or (select refunded_at from public.ai_runs where id = x.run_id) is null then
    raise exception 'T14 FAIL: points not refunded (balance %)', bal;
  end if;
  if exists (select 1 from public.membership_credit_uses where run_id = x.run_id) then
    raise exception 'T14 FAIL: a points run has a credit use';
  end if;
  raise notice 'T14 PASS: a points-paid run still refunds its 40 points through ai_fail_run';
end $$;

-- T15 as authenticated: no EXECUTE on the new function
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000fc01', false);
do $$
begin
  begin
    perform 1 from public.ai_start_run_with_credit(auth.uid(), 'legal-drafter', null, 'job', 0, 100, 'auth-key-0001',
                                                   now() + interval '10 minutes', false, '{"kind":"claim"}'::jsonb,
                                                   '{}', null, null, null, 'drafting_work');
    raise exception 'T15 FAIL: authenticated executed ai_start_run_with_credit';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T15 PASS: authenticated → 42501 on ai_start_run_with_credit';
end $$;
reset role;
select set_config('test.uid', '', false);

-- T16 two sessions race for F1's LAST work (remaining 1 after T11) with
-- different keys: B waits on A's row lock, then re-reads remaining 0 →
-- no_credit; remaining never goes below 0 and only one run is left
create extension if not exists dblink;
do $$
declare
  ra   text;
  rb   text;
  errb text;
  conn text := format('dbname=%s user=%s', quote_ident(current_database()), quote_ident(current_user));
  q    text := 'select (x.credit_used)::text from public.ai_start_run_with_credit(''00000000-0000-0000-0000-00000000fc01'', '
              || '''legal-drafter'', null, ''job'', 40, 100, %L, now() + interval ''10 minutes'', false, '
              || '''{"kind":"cassation"}''::jsonb, ''{}'', null, null, null, ''drafting_work'') x';
begin
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 1 then
    raise exception 'T16 FAIL: setup expects 1 work left, got %', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  perform dblink_connect('race_a', conn);
  perform dblink_connect('race_b', conn);
  perform dblink_exec('race_a', 'begin');
  select x into ra from dblink('race_a', format(q, 'race-key-000a')) as t(x text);
  if ra is distinct from 'true' then raise exception 'T16 FAIL: session A returned %', ra; end if;
  perform dblink_send_query('race_b', format(q, 'race-key-000b'));
  perform pg_sleep(0.5);
  if dblink_is_busy('race_b') <> 1 then
    raise exception 'T16 FAIL: session B did not wait for session A''s credit lock';
  end if;
  perform dblink_exec('race_a', 'commit');
  select x into rb from dblink_get_result('race_b', false) as t(x text);
  errb := dblink_error_message('race_b');
  perform x from dblink_get_result('race_b', false) as t(x text);   -- drain
  perform dblink_disconnect('race_a');
  perform dblink_disconnect('race_b');
  if rb is not null or errb not like '%no_credit%' then
    raise exception 'T16 FAIL: session B returned % / %', rb, errb;
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 0
     or exists (select 1 from public.ai_runs where idempotency_key = 'race-key-000b')
     or not exists (select 1 from public.ai_runs where idempotency_key = 'race-key-000a') then
    raise exception 'T16 FAIL: after the race remaining % / runs wrong',
      pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  raise notice 'T16 PASS: two sessions, one work — A spent it, B waited on the row lock and got no_credit; remaining 0';
end $$;

-- the file's final SELECT check
select (select count(*) from public.founder_seats) as seats,
       (select value->>'capacity' from public.platform_settings where key = 'founder_campaign') as capacity;

