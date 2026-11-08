-- free_daily_question_1108.test.sql — proves 20261108_50 (owner ٤١٢: one free
-- quick question a day per verified phone): verified_phones is server-write
-- only (a session reads its own row; RLS refuses a write even with a stray
-- grant), ai_free_question_claims is server only, and ai_start_free_question
-- gives an individual with a verified phone one free run a Riyadh day, keyed
-- on the PHONE (a second account on the same phone gets nothing), refuses the
-- unverified and non-individual accounts, answers a duplicate key as a
-- duplicate, gives the question back when its run failed, and leaves no claim
-- when the start itself is refused.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $R/free_daily_question_1108.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261108_50
-- files → "T0 FAIL: ai_start_free_question does not exist".
--
-- Actors: I1 …d001 individual, verified +966500000001; I2 …d002 individual,
-- verified on the SAME phone; U …d003 individual, not verified (typed phone
-- only); L …d004 lawyer, verified +966500000004. Every assertion RAISES.

do $$
begin
  if to_regprocedure('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)') is null then
    raise exception 'T0 FAIL: ai_start_free_question does not exist (20261108_50 not applied)';
  end if;
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000d001'), ('00000000-0000-0000-0000-00000000d002'),
  ('00000000-0000-0000-0000-00000000d003'), ('00000000-0000-0000-0000-00000000d004');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000d001', 'individual', 'I1'),
  ('00000000-0000-0000-0000-00000000d002', 'individual', 'I2'),
  ('00000000-0000-0000-0000-00000000d003', 'individual', 'U'),
  ('00000000-0000-0000-0000-00000000d004', 'lawyer', 'L');
insert into public.verified_phones (user_id, phone_e164) values
  ('00000000-0000-0000-0000-00000000d001', '+966500000001'),
  ('00000000-0000-0000-0000-00000000d002', '+966500000001'),
  ('00000000-0000-0000-0000-00000000d004', '+966500000004');
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

create or replace function pg_temp.ask(p_user uuid, p_key text, p_limit int default 30)
returns table (run_id uuid, created boolean, charged boolean, charged_points int) language sql as $$
  select x.run_id, x.created, x.charged, x.charged_points
    from public.ai_start_free_question(p_user, 'quick-answer', null, 'fast', 0, p_limit, p_key,
      now() + interval '90 seconds', false, '{"question":"سؤال"}'::jsonb) x;
$$;
create or replace function pg_temp.refusal(p_user uuid, p_key text, p_limit int default 30)
returns text language plpgsql as $$
begin
  perform * from pg_temp.ask(p_user, p_key, p_limit);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
end $$;

-- T1 the shape is a Saudi mobile in E.164
do $$
begin
  begin
    insert into public.verified_phones (user_id, phone_e164) values ('00000000-0000-0000-0000-00000000d003', '0500000003');
    raise exception 'T1 FAIL: a local-format phone was stored as verified';
  exception when check_violation then null;
  end;
  raise notice 'T1 PASS: verified phones are +9665XXXXXXXX';
end $$;

-- T2 not eligible: no verified phone (U), or not an individual account (L)
do $$
begin
  if pg_temp.refusal('00000000-0000-0000-0000-00000000d003', 'fq-u-0001') <> 'free_question_not_eligible' then
    raise exception 'T2 FAIL: an unverified account got a free question';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000d004', 'fq-l-0001') <> 'free_question_not_eligible' then
    raise exception 'T2 FAIL: a lawyer account got a free question';
  end if;
  if exists (select 1 from public.ai_runs) or exists (select 1 from public.ai_free_question_claims) then
    raise exception 'T2 FAIL: a refusal left a run or a claim';
  end if;
  raise notice 'T2 PASS: unverified and non-individual refused, nothing left behind';
end $$;

-- T3 I1's first question today is free (price 0, nothing charged with
--    enforcement on) and claims the phone for today's Riyadh day
do $$
declare r record;
begin
  select * into r from pg_temp.ask('00000000-0000-0000-0000-00000000d001', 'fq-i1-0001');
  if not r.created or r.charged or r.charged_points <> 0 then
    raise exception 'T3 FAIL: the free question was not a new uncharged run: %', r;
  end if;
  if (select price_points from public.ai_runs where id = r.run_id) <> 0 then
    raise exception 'T3 FAIL: the run is not priced 0';
  end if;
  if not exists (select 1 from public.ai_free_question_claims
                  where phone_e164 = '+966500000001' and run_id = r.run_id
                    and riyadh_day = (now() at time zone 'Asia/Riyadh')::date) then
    raise exception 'T3 FAIL: no claim for the phone on today''s Riyadh day';
  end if;
  raise notice 'T3 PASS: one free question, claimed on the phone';
end $$;

-- T4 the same phone again today: I1 a second time, and I2 (another account on
--    the same verified phone) — both refused; a repeated key is a duplicate
do $$
declare r record;
begin
  if pg_temp.refusal('00000000-0000-0000-0000-00000000d001', 'fq-i1-0002') <> 'free_question_used' then
    raise exception 'T4 FAIL: a second free question on the same day';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000d002', 'fq-i2-0001') <> 'free_question_used' then
    raise exception 'T4 FAIL: another account on the same phone got a free question';
  end if;
  select * into r from pg_temp.ask('00000000-0000-0000-0000-00000000d001', 'fq-i1-0001');
  if r.created then raise exception 'T4 FAIL: a repeated key created a run'; end if;
  if (select count(*) from public.ai_runs) <> 1 then
    raise exception 'T4 FAIL: refused requests left runs behind';
  end if;
  raise notice 'T4 PASS: one per phone per day, across accounts; duplicate key answered as duplicate';
end $$;

-- T5 a failed (refunded) run gives the free question back — to any account on the phone
do $$
declare r record;
begin
  perform public.ai_fail_run((select id from public.ai_runs where idempotency_key = 'fq-i1-0001'), 'model_error');
  select * into r from pg_temp.ask('00000000-0000-0000-0000-00000000d002', 'fq-i2-0002');
  if not r.created or r.charged then raise exception 'T5 FAIL: the freed question was not given: %', r; end if;
  if (select count(*) from public.ai_free_question_claims) <> 1
     or (select user_id from public.ai_free_question_claims) <> '00000000-0000-0000-0000-00000000d002' then
    raise exception 'T5 FAIL: the claim was not moved to the new run';
  end if;
  raise notice 'T5 PASS: a technical failure releases the claim';
end $$;

-- T6 a start that ai_start_run refuses (daily limit) leaves no claim; a claim of
--    yesterday does not count today
do $$
begin
  update public.ai_free_question_claims set riyadh_day = riyadh_day - 1;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000d001', 'fq-i1-0003', 0) <> 'daily_limit' then
    raise exception 'T6 FAIL: the daily limit did not refuse';
  end if;
  if exists (select 1 from public.ai_free_question_claims where riyadh_day = (now() at time zone 'Asia/Riyadh')::date) then
    raise exception 'T6 FAIL: a refused start left today''s claim';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-00000000d001', 'fq-i1-0004') <> 'started' then
    raise exception 'T6 FAIL: yesterday''s claim blocked today''s question';
  end if;
  raise notice 'T6 PASS: refused start leaves no claim; one per Riyadh day';
end $$;

-- T7 only quick-answer
do $$
begin
  begin
    perform public.ai_start_free_question('00000000-0000-0000-0000-00000000d001', 'legal-drafter', null, 'job', 0, 30,
      'fq-bad-0001', now() + interval '1 minute');
    raise exception 'T7 FAIL: another tool was started free';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'T7 PASS: quick-answer only';
end $$;

-- T8 sessions: a stray table grant (a self-host restore replays GRANT ALL)
--    still cannot write verified_phones or read claims (RLS, no policy for it);
--    without it, the column grants are SELECT only; own row only
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000d003', true);
  begin
    insert into public.verified_phones (user_id, phone_e164) values ('00000000-0000-0000-0000-00000000d003', '+966500000003');
    raise exception 'T8 FAIL: a session verified its own phone';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000d001', true);
  update public.verified_phones set phone_e164 = '+966500000009' where user_id = '00000000-0000-0000-0000-00000000d001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T8 FAIL: a session changed its verified phone'; end if;
  if (select count(*) from public.verified_phones) <> 1 then
    raise exception 'T8 FAIL: I1 does not see exactly its own verified phone';
  end if;
  if exists (select 1 from public.ai_free_question_claims) then
    raise exception 'T8 FAIL: a session reads the claims';
  end if;
end $$;
reset role;
revoke all on public.verified_phones, public.ai_free_question_claims from app_user;
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000d001', true);
  begin
    update public.verified_phones set verified_at = now();
    raise exception 'T8 FAIL: authenticated holds UPDATE on verified_phones';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ai_free_question_claims;
    raise exception 'T8 FAIL: authenticated holds SELECT on the claims';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.verified_phones) <> 1 then
    raise exception 'T8 FAIL: authenticated cannot read its own verified phone';
  end if;
  raise notice 'T8 PASS: verified_phones server-write only, claims server only';
end $$;
reset role;

select 'free_daily_question_1108: all passed' as ok;
