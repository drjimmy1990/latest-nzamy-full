-- points_wallets_l7.test.sql — proves 20261127_40 (batch l7, decisions 5–9):
-- the library_agent wallet is spent only by the library assistant (and first
-- by it), the spend order plan → purchased → bonus/gift by nearest expiry,
-- credit_wallet_points, points_expire_lots (the «انتهاء» rows, safe to
-- repeat), the free library questions ONCE per account by type, and the
-- grants. The migration runs TWICE (it must be re-runnable), and the l7_points
-- block of _verify.sql runs after it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l7_points.sql
--   sed -n '/^-- >>> verify:l7_points/,/^-- <<< verify:l7_points/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $M/20261127_40_points_wallets.sql \
--     $M/20261127_40_points_wallets.sql \
--     "$B" \
--     $R/points_wallets_l7.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261127_40
-- files and the verify block → "T0 FAIL: points_lots.wallet_scope does not exist".
--
-- Actors: L …f001 lawyer; I …f002 individual; C …f003 corporate. Every
-- assertion RAISES.

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'points_lots' and column_name = 'wallet_scope') then
    raise exception 'T0 FAIL: points_lots.wallet_scope does not exist (20261127_40 not applied)';
  end if;
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000f001'), ('00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000f003');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000f001', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-00000000f002', 'individual', 'I'),
  ('00000000-0000-0000-0000-00000000f003', 'corporate', 'C');
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- L's lots: a general gift expiring soonest, a purchase, a general plan lot
-- expiring last, and a library_agent plan lot.
insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at, wallet_scope) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-00000000f001', 'admin',    50,  50, now() + interval '10 days',  'general'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-00000000f001', 'purchase', 100, 100, now() + interval '90 days', 'general'),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-00000000f001', 'plan',     20,  20, now() + interval '300 days', 'general'),
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-00000000f001', 'plan',     30,  30, now() + interval '200 days', 'library_agent');

create or replace function pg_temp.left_of(p uuid) returns int language sql as $$
  select points_left from public.points_lots where id = p $$;

-- T1 a general tool: plan points first, then purchased — never the gift that
--    expires sooner, never the library lot
do $$
begin
  perform public.debit_points('00000000-0000-0000-0000-00000000f001', 25, 'legal-drafter', 't1');
  if pg_temp.left_of('00000000-0000-0000-0000-0000000a0003') <> 0
     or pg_temp.left_of('00000000-0000-0000-0000-0000000a0002') <> 95
     or pg_temp.left_of('00000000-0000-0000-0000-0000000a0001') <> 50
     or pg_temp.left_of('00000000-0000-0000-0000-0000000a0004') <> 30 then
    raise exception 'T1 FAIL: wrong spend order for a general tool';
  end if;
  raise notice 'T1 PASS: plan → purchased; gift and library lot untouched';
end $$;

-- T2 the library assistant: its own wallet first, then general (purchased
--    before the gift)
do $$
begin
  perform public.debit_points('00000000-0000-0000-0000-00000000f001', 40, 'library-assistant', 't2');
  if pg_temp.left_of('00000000-0000-0000-0000-0000000a0004') <> 0
     or pg_temp.left_of('00000000-0000-0000-0000-0000000a0002') <> 85
     or pg_temp.left_of('00000000-0000-0000-0000-0000000a0001') <> 50 then
    raise exception 'T2 FAIL: the library assistant did not spend its wallet first';
  end if;
  if (select count(*) from public.points_ledger where ref = 't2' and reason = 'usage' and tool = 'library-assistant') <> 2 then
    raise exception 'T2 FAIL: expected one usage row per lot touched';
  end if;
  raise notice 'T2 PASS: library_agent first, then purchased';
end $$;

-- T3 a general tool can never spend a library lot: short → insufficient_points, nothing changed
do $$
declare v_lot uuid;
begin
  v_lot := public.credit_wallet_points('00000000-0000-0000-0000-00000000f001', 100, 'plan', now() + interval '30 days',
                                       null, 't3', 'library_agent');
  begin
    perform public.debit_points('00000000-0000-0000-0000-00000000f001', 200, 'legal-drafter', 't3');
    raise exception 'T3 FAIL: a general tool spent library points';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'insufficient_points' then raise; end if;
  end;
  if pg_temp.left_of(v_lot) <> 100 or pg_temp.left_of('00000000-0000-0000-0000-0000000a0002') <> 85 then
    raise exception 'T3 FAIL: a refused debit changed a lot';
  end if;
  -- the gift (rank 3) goes last: 85 purchased + 30 of the gift
  perform public.debit_points('00000000-0000-0000-0000-00000000f001', 115, 'legal-drafter', 't3b');
  if pg_temp.left_of('00000000-0000-0000-0000-0000000a0002') <> 0 or pg_temp.left_of('00000000-0000-0000-0000-0000000a0001') <> 20
     or pg_temp.left_of(v_lot) <> 100 then
    raise exception 'T3 FAIL: purchased before the gift, library untouched';
  end if;
  raise notice 'T3 PASS: library lots are the library assistant''s only; gifts are spent last';
end $$;

-- T4 credit_wallet_points refuses a bad wallet and a past expiry; a second
--    lot for the same order and source is 23505
do $$
begin
  begin
    perform public.credit_wallet_points('00000000-0000-0000-0000-00000000f001', 5, 'plan', now() + interval '1 day', null, null, 'drafter');
    raise exception 'T4 FAIL: an unknown wallet was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.credit_wallet_points('00000000-0000-0000-0000-00000000f001', 5, 'plan', now() - interval '1 day', null, null, 'general');
    raise exception 'T4 FAIL: a past expiry was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.credit_wallet_points('00000000-0000-0000-0000-00000000f001', 5, 'nonsense', now() + interval '1 day', null, null, 'general');
    raise exception 'T4 FAIL: an unknown source was accepted';
  exception when check_violation then null;
  end;
  raise notice 'T4 PASS: credit_wallet_points validates the wallet, the expiry and the source';
end $$;

-- T5 expiry: an expired lot with points is emptied once, with one 'expiry' row
do $$
declare v jsonb;
begin
  insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at)
    values ('00000000-0000-0000-0000-0000000a0009', '00000000-0000-0000-0000-00000000f002', 'purchase', 40, 15, now() - interval '1 hour');
  v := public.points_expire_lots(500);
  if (v ->> 'lots')::int <> 1 or (v ->> 'points')::int <> 15 then
    raise exception 'T5 FAIL: expected {lots 1, points 15}, got %', v;
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-0000000a0009') <> 0
     or (select count(*) from public.points_ledger where lot_id = '00000000-0000-0000-0000-0000000a0009'
            and reason = 'expiry' and delta = -15) <> 1 then
    raise exception 'T5 FAIL: no single expiry ledger row';
  end if;
  v := public.points_expire_lots(500);
  if (v ->> 'lots')::int <> 0 then raise exception 'T5 FAIL: a re-run expired again: %', v; end if;
  begin
    perform public.points_expire_lots(0);
    raise exception 'T5 FAIL: p_limit 0 accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'T5 PASS: expired lots emptied once, «انتهاء» row written, re-run is a no-op';
end $$;

-- T6 a charged library-assistant run through ai_start_run spends the library wallet
do $$
declare r record; v_lib uuid;
begin
  select id into v_lib from public.points_lots
   where user_id = '00000000-0000-0000-0000-00000000f001' and wallet_scope = 'library_agent' and points_left = 100;
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000f001', 'library-assistant', null, 'fast', 5, 60,
    'l7-charged-0001', now() + interval '90 seconds', false, '{"message":"سؤال"}'::jsonb);
  if not r.charged or r.charged_points <> 5 or pg_temp.left_of(v_lib) <> 95 then
    raise exception 'T6 FAIL: the charged library run did not spend the library wallet: %', r;
  end if;
  raise notice 'T6 PASS: ai_start_run passes the tool, debit_points picks the wallet';
end $$;

create or replace function pg_temp.ask(p_user uuid, p_key text, p_tool text default 'library-assistant')
returns table (run_id uuid, created boolean, charged boolean, charged_points int) language sql as $$
  select x.run_id, x.created, x.charged, x.charged_points
    from public.ai_start_free_question(p_user, p_tool, null, 'fast', 0, 60, p_key,
      now() + interval '90 seconds', false, '{"message":"سؤال"}'::jsonb) x;
$$;
create or replace function pg_temp.refusal(p_user uuid, p_key text, p_tool text default 'library-assistant')
returns text language plpgsql as $$
begin
  perform * from pg_temp.ask(p_user, p_key, p_tool);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
when sqlstate '22023' then
  return 'invalid';
end $$;

-- T7 the defaults (no admin edit): lawyer 10, individual 5, corporate 0
do $$
begin
  if (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-00000000f001') s) <> 10
     or (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-00000000f002') s) <> 5
     or (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-00000000f003') s) <> 0 then
    raise exception 'T7 FAIL: the seeded allowances are not 10 / 5 / 0';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000f003', 'fq-c-0001') <> 'free_question_not_eligible' then
    raise exception 'T7 FAIL: a corporate account got a free question';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000f002', 'fq-q-0001', 'quick-answer') <> 'invalid' then
    raise exception 'T7 FAIL: the free question still serves quick-answer';
  end if;
  raise notice 'T7 PASS: 10 / 5 / 0 by account type; library assistant only';
end $$;

-- T8 ONCE: the individual's 5, uncharged; the 6th refused; a duplicate key is
--    a duplicate; a failed run gives one back
do $$
declare r record; i int;
begin
  for i in 1..5 loop
    select * into r from pg_temp.ask('00000000-0000-0000-0000-00000000f002', 'fq-i-000' || i);
    if not r.created or r.charged or r.charged_points <> 0 then
      raise exception 'T8 FAIL: free question % was not a new uncharged run: %', i, r;
    end if;
  end loop;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000f002', 'fq-i-0006') <> 'free_question_used' then
    raise exception 'T8 FAIL: a sixth free question was given';
  end if;
  select * into r from pg_temp.ask('00000000-0000-0000-0000-00000000f002', 'fq-i-0001');
  if r.created then raise exception 'T8 FAIL: a repeated key created a run'; end if;
  if (select count(*) from public.ai_free_question_uses where user_id = '00000000-0000-0000-0000-00000000f002') <> 5 then
    raise exception 'T8 FAIL: expected 5 use rows';
  end if;
  update public.ai_runs set status = 'failed' where idempotency_key = 'fq-i-0003';
  select * into r from pg_temp.ask('00000000-0000-0000-0000-00000000f002', 'fq-i-0007');
  if not r.created or r.charged then raise exception 'T8 FAIL: a failed run did not give its question back'; end if;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000f002', 'fq-i-0008') <> 'free_question_used' then
    raise exception 'T8 FAIL: more than the allowance after the give-back';
  end if;
  raise notice 'T8 PASS: five once, failed runs given back, duplicate answered as duplicate';
end $$;

-- T9 an admin edit of the setting is read at once (the lawyer's 10 → 1)
do $$
declare r record;
begin
  update public.platform_settings set value = '{"lawyer": 1, "individual": 5}'::jsonb where key = 'free_questions_by_account_type';
  select * into r from pg_temp.ask('00000000-0000-0000-0000-00000000f001', 'fq-l-0001');
  if not r.created or r.charged then raise exception 'T9 FAIL: the lawyer''s free question: %', r; end if;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000f001', 'fq-l-0002') <> 'free_question_used' then
    raise exception 'T9 FAIL: the edited allowance was not applied';
  end if;
  raise notice 'T9 PASS: the allowance comes from the setting';
end $$;

-- T10 sessions: own wallet_scope readable through RLS; no session reaches the
--     new tables or functions
do $$
begin
  if not has_column_privilege('authenticated', 'public.points_lots', 'wallet_scope', 'SELECT') then
    raise exception 'T10 FAIL: authenticated cannot read wallet_scope';
  end if;
  if has_column_privilege('authenticated', 'public.points_lots', 'wallet_scope', 'UPDATE')
     or has_table_privilege('authenticated', 'public.ai_free_question_uses', 'SELECT')
     or has_table_privilege('authenticated', 'public.points_lot_expiry_notices', 'SELECT')
     or has_function_privilege('authenticated', 'public.credit_wallet_points(uuid,int,text,timestamptz,uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.points_expire_lots(int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ai_free_question_status(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE') then
    raise exception 'T10 FAIL: a session role reaches a server-only object';
  end if;
  raise notice 'T10 PASS: grants';
end $$;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000f001', false);
do $$
begin
  if (select count(*) from public.points_lots where wallet_scope = 'library_agent') <> 2 then
    raise exception 'T11 FAIL: the lawyer does not see his two library lots';
  end if;
  if exists (select 1 from public.points_lots where user_id <> '00000000-0000-0000-0000-00000000f001') then
    raise exception 'T11 FAIL: another user''s lots are visible';
  end if;
  raise notice 'T11 PASS: own lots with their wallet';
end $$;
reset role;

do $$ begin raise notice 'points_wallets_l7: ALL PASS'; end $$;
