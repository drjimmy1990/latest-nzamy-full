-- l19_ind_ai_fair_use.test.sql — proves 20261209_70 (batch l19, builder «plans», owner ق٢٦-٦):
--   * an active ind-ai subscriber gets 30 questions (quick-answer) + 2 works
--     (simple-contract) a Riyadh calendar month at price 0; the 31st question
--     and the 3rd work are refused (plan_allowance_used); the two buckets are
--     separate;
--   * one use per run: a retried request (same key) adds nothing; a FAILED
--     run gives its use back;
--   * no plan / an expired / a cancelled subscription / another plan of the
--     same tier / a tool that is not counted → plan_allowance_not_eligible;
--   * the month is Riyadh's: a run made one hour after the Riyadh month began
--     (still the previous month in UTC) counts in THIS month; one made one
--     second before it does not;
--   * points_enforcement off / an exempt caller: a plain run, nothing counted;
--   * the setting: a malformed number keeps the default, a set number is used;
--   * grants: every function service_role only, the table closed to sessions.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261209_70
-- runs TWICE (re-run safety), then its _verify.sql block, then this file.
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l19_plans.sql
--   sed -n "/^-- >>> verify:l19_ind_ai_fair_use/,/^-- <<< verify:l19_ind_ai_fair_use/p" $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261027_10_ai_runs.sql $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261209_70_ind_ai_fair_use.sql $M/20261209_70_ind_ai_fair_use.sql \
--     "$B" $R/l19_ind_ai_fair_use.test.sql
-- NEGATIVE CONTROLS: (1) the same chain without the two 20261209_70 files
-- fails at T0; (2) with a copy of 20261209_70 whose month is UTC instead of
-- Asia/Riyadh, T7 fails; (3) with a copy that matches the tier ('ai') instead
-- of the plan id, T6 fails.
--
-- Every assertion RAISES.

\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure('public.ai_start_plan_allowance_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)') is null
     or to_regclass('public.ai_plan_allowance_uses') is null then
    raise exception 'T0 FAIL: 20261209_70 is not applied';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

create or replace function pg_temp.go(p_user uuid, p_tool text, p_key text, p_exempt boolean default false)
returns table (run_id uuid, created boolean, charged boolean) language sql as $$
  select x.run_id, x.created, x.charged
    from public.ai_start_plan_allowance_run(p_user, p_tool, null, 'fast', 10, 100, p_key,
      now() + interval '90 seconds', p_exempt, '{"question":"سؤال قانوني للتجربة"}'::jsonb) x;
$$;
create or replace function pg_temp.refusal(p_user uuid, p_tool text, p_key text)
returns text language plpgsql as $$
begin
  perform * from pg_temp.go(p_user, p_tool, p_key);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
when sqlstate '22023' then
  return 'invalid';
end $$;
create or replace function pg_temp.uses(p_user uuid, p_kind text) returns text language sql as $$
  select count(*)::text from public.ai_plan_allowance_uses u where u.user_id = p_user and u.kind = p_kind;
$$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000f001'),   -- S  subscriber
  ('00000000-0000-0000-0000-00000000f002'),   -- N  individual, no plan
  ('00000000-0000-0000-0000-00000000f003'),   -- E  ind-ai ended yesterday
  ('00000000-0000-0000-0000-00000000f004'),   -- X  ind-ai cancelled
  ('00000000-0000-0000-0000-00000000f005'),   -- G  another plan of tier ai
  ('00000000-0000-0000-0000-00000000f006')    -- M  subscriber for the month test
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000f001', 'individual', 'S'),
  ('00000000-0000-0000-0000-00000000f002', 'individual', 'N'),
  ('00000000-0000-0000-0000-00000000f003', 'individual', 'E'),
  ('00000000-0000-0000-0000-00000000f004', 'individual', 'X'),
  ('00000000-0000-0000-0000-00000000f005', 'individual', 'G'),
  ('00000000-0000-0000-0000-00000000f006', 'individual', 'M')
on conflict do nothing;

-- a second tier-ai catalogue row (the office lesson: match the plan id, never the tier)
insert into public.subscription_plans (id, tier, audience, name_ar, name_en, price_monthly, price_yearly)
  values ('test-ai-other', 'ai', 'individual', 'باقة اختبار', 'Test plan', 1, 10)
  on conflict (id) do nothing;

insert into public.subscriptions (user_id, plan_id, tier, billing_cycle, status, current_period_end) values
  ('00000000-0000-0000-0000-00000000f001', 'ind-ai', 'ai', 'yearly', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-00000000f003', 'ind-ai', 'ai', 'yearly', 'active', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000f004', 'ind-ai', 'ai', 'yearly', 'cancelled', now() + interval '300 days'),
  ('00000000-0000-0000-0000-00000000f005', 'test-ai-other', 'ai', 'yearly', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-00000000f006', 'ind-ai', 'ai', 'custom', 'active', null);

insert into public.platform_settings (key, value) values ('points_enforcement', 'true'::jsonb)
  on conflict (key) do update set value = excluded.value;

-- T1 the status and the setting row
do $$
declare s record;
begin
  perform pg_temp.expect('T1a setting row',
    (select value::text from public.platform_settings where key = 'ind_ai_fair_use'),
    '{"works_per_month": 2, "questions_per_month": 30}');
  select * into s from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f001');
  perform pg_temp.expect('T1b subscriber active', s.plan_active::text, 'true');
  perform pg_temp.expect('T1c limits', s.questions_limit || '/' || s.works_limit, '30/2');
  perform pg_temp.expect('T1d nothing used', s.questions_used || '/' || s.works_used, '0/0');
  perform pg_temp.expect('T1e month start is Riyadh''s',
    s.month_start::text, (date_trunc('month', now() at time zone 'Asia/Riyadh'))::date::text);
  perform pg_temp.expect('T1f no plan',
    (select plan_active::text from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f002')), 'false');
  raise notice 'T1 PASS: status and setting';
end $$;

-- T2 thirty questions free, the thirty-first refused
do $$
declare r record; i int;
begin
  for i in 1..30 loop
    select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-' || lpad(i::text, 3, '0'));
    if not coalesce(r.created, false) or coalesce(r.charged, true) then
      raise exception 'T2a FAIL: question % was not a free start: %', i, r;
    end if;
  end loop;
  perform pg_temp.expect('T2b thirty use rows', pg_temp.uses('00000000-0000-0000-0000-00000000f001', 'question'), '30');
  perform pg_temp.expect('T2c every run at price 0',
    (select count(*)::text from public.ai_runs where user_id = '00000000-0000-0000-0000-00000000f001' and price_points = 0 and not charged), '30');
  perform pg_temp.expect('T2d the 31st refused',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-031'), 'plan_allowance_used');
  perform pg_temp.expect('T2e the refusal wrote no run',
    (select count(*)::text from public.ai_runs where user_id = '00000000-0000-0000-0000-00000000f001'), '30');
  raise notice 'T2 PASS: 30 questions, the 31st refused';
end $$;

-- T3 a retried request (same key) is the duplicate, nothing added
do $$
declare r record;
begin
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-001');
  perform pg_temp.expect('T3a duplicate not created', r.created::text, 'false');
  perform pg_temp.expect('T3b still thirty', pg_temp.uses('00000000-0000-0000-0000-00000000f001', 'question'), '30');
  raise notice 'T3 PASS: one use per run';
end $$;

-- T4 a failed (refunded) run gives its question back
do $$
declare r record;
begin
  update public.ai_runs set status = 'failed'
   where user_id = '00000000-0000-0000-0000-00000000f001' and idempotency_key = 'l19-s-q-007';
  perform pg_temp.expect('T4a used drops to 29',
    (select questions_used::text from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f001')), '29');
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-032');
  perform pg_temp.expect('T4b the freed question starts free', (r.created and not r.charged)::text, 'true');
  perform pg_temp.expect('T4c and then none is left',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-033'), 'plan_allowance_used');
  raise notice 'T4 PASS: a failed run gives its use back';
end $$;

-- T5 two works, the third refused; the buckets are separate
do $$
declare r record;
begin
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f001', 'simple-contract', 'l19-s-w-001');
  perform pg_temp.expect('T5a work 1 free', (r.created and not r.charged)::text, 'true');
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f001', 'simple-contract', 'l19-s-w-002');
  perform pg_temp.expect('T5b work 2 free', (r.created and not r.charged)::text, 'true');
  perform pg_temp.expect('T5c work 3 refused',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f001', 'simple-contract', 'l19-s-w-003'), 'plan_allowance_used');
  perform pg_temp.expect('T5d two work rows', pg_temp.uses('00000000-0000-0000-0000-00000000f001', 'work'), '2');
  perform pg_temp.expect('T5e questions unchanged', pg_temp.uses('00000000-0000-0000-0000-00000000f001', 'question'), '31');
  raise notice 'T5 PASS: 2 works, separate from the questions';
end $$;

-- T6 who is not eligible
do $$
begin
  perform pg_temp.expect('T6a no plan',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f002', 'quick-answer', 'l19-n-q-001'), 'plan_allowance_not_eligible');
  perform pg_temp.expect('T6b expired',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f003', 'quick-answer', 'l19-e-q-001'), 'plan_allowance_not_eligible');
  perform pg_temp.expect('T6c cancelled',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f004', 'quick-answer', 'l19-x-q-001'), 'plan_allowance_not_eligible');
  perform pg_temp.expect('T6d another plan of the same tier',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f005', 'quick-answer', 'l19-g-q-001'), 'plan_allowance_not_eligible');
  perform pg_temp.expect('T6e a tool that is not counted (floating)',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f006', 'floating', 'l19-m-f-001'), 'plan_allowance_not_eligible');
  perform pg_temp.expect('T6f a lawyer tool',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f006', 'legal-drafter', 'l19-m-d-001'), 'plan_allowance_not_eligible');
  perform pg_temp.expect('T6g no run written for any refusal',
    (select count(*)::text from public.ai_runs where user_id in ('00000000-0000-0000-0000-00000000f002',
       '00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-00000000f005',
       '00000000-0000-0000-0000-00000000f006')), '0');
  perform pg_temp.expect('T6h a null-end ind-ai plan is active',
    (select plan_active::text from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f006')), 'true');
  raise notice 'T6 PASS: plan id only, active and unexpired only, counted tools only';
end $$;

-- T7 the Riyadh calendar month
do $$
declare
  r      record;
  v_ry   timestamptz := (date_trunc('month', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh';
begin
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f006', 'simple-contract', 'l19-m-w-001');
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f006', 'simple-contract', 'l19-m-w-002');
  perform pg_temp.expect('T7a two works used', (select works_used::text from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f006')), '2');
  -- one second before the Riyadh month began: last month → not counted
  update public.ai_runs set created_at = v_ry - interval '1 second'
   where user_id = '00000000-0000-0000-0000-00000000f006' and idempotency_key = 'l19-m-w-001';
  perform pg_temp.expect('T7b a run of last (Riyadh) month is not counted',
    (select works_used::text from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f006')), '1');
  -- one hour after it began: still the previous month in UTC, this month in Riyadh → counted
  update public.ai_runs set created_at = v_ry + interval '1 hour'
   where user_id = '00000000-0000-0000-0000-00000000f006' and idempotency_key = 'l19-m-w-001';
  if date_trunc('month', (v_ry + interval '1 hour') at time zone 'UTC') = date_trunc('month', now() at time zone 'Asia/Riyadh') then
    raise exception 'T7 setup FAIL: the planted instant is not in the previous UTC month';
  end if;
  perform pg_temp.expect('T7c a run one hour into the Riyadh month counts (UTC still says last month)',
    (select works_used::text from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f006')), '2');
  perform pg_temp.expect('T7d so the third is refused',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f006', 'simple-contract', 'l19-m-w-003'), 'plan_allowance_used');
  raise notice 'T7 PASS: the month is the Riyadh calendar month';
end $$;

-- T8 enforcement off / exempt: a plain run, nothing counted
do $$
declare r record;
begin
  update public.platform_settings set value = 'false'::jsonb where key = 'points_enforcement';
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-off-1');
  perform pg_temp.expect('T8a off: started', r.created::text, 'true');
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f002', 'quick-answer', 'l19-n-q-off-1');
  perform pg_temp.expect('T8b off: a non-subscriber starts a plain run too', r.created::text, 'true');
  perform pg_temp.expect('T8c off: nothing counted', pg_temp.uses('00000000-0000-0000-0000-00000000f001', 'question'), '31');
  update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';
  select * into r from pg_temp.go('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-ex-1', true);
  perform pg_temp.expect('T8d exempt: started', r.created::text, 'true');
  perform pg_temp.expect('T8e exempt: nothing counted', pg_temp.uses('00000000-0000-0000-0000-00000000f001', 'question'), '31');
  raise notice 'T8 PASS: off / exempt spend no allowance';
end $$;

-- T9 the setting
do $$
begin
  update public.platform_settings set value = '{"questions_per_month": "lots", "works_per_month": null}'::jsonb where key = 'ind_ai_fair_use';
  perform pg_temp.expect('T9a malformed keeps the default',
    (select questions_limit || '/' || works_limit from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f002')), '30/2');
  update public.platform_settings set value = '{"questions_per_month": 40, "works_per_month": 3}'::jsonb where key = 'ind_ai_fair_use';
  perform pg_temp.expect('T9b a set number is used',
    (select questions_limit || '/' || works_limit from public.ai_plan_allowance_status('00000000-0000-0000-0000-00000000f002')), '40/3');
  perform pg_temp.expect('T9c a raised limit frees a question',
    pg_temp.refusal('00000000-0000-0000-0000-00000000f001', 'quick-answer', 'l19-s-q-040'), 'started');
  update public.platform_settings set value = '{"questions_per_month": 30, "works_per_month": 2}'::jsonb where key = 'ind_ai_fair_use';
  raise notice 'T9 PASS: the setting';
end $$;

-- T10 grants
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.ai_plan_allowance_kind(text)', 'public.ind_ai_plan_active(uuid)', 'public.ai_plan_allowance_status(uuid)',
    'public.ai_start_plan_allowance_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'T10 FAIL: % is executable by a session role', fn;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.ai_plan_allowance_uses', 'SELECT')
     or has_table_privilege('authenticated', 'public.ai_plan_allowance_uses', 'INSERT')
     or has_table_privilege('anon', 'public.ai_plan_allowance_uses', 'SELECT') then
    raise exception 'T10 FAIL: ai_plan_allowance_uses is open to a session role';
  end if;
  raise notice 'T10 PASS: service role only';
end $$;

do $$ begin raise notice 'l19_ind_ai_fair_use: ALL PASS'; end $$;
