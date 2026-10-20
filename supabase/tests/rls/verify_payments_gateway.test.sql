-- verify_payments_gateway.test.sql — proves the payments_gateway block of
-- supabase/migrations/_verify.sql (Moyasar B1, Task 4 fix round 1):
--   * under nzamy.env=production it RAISES for the stub — provider 'stub',
--     status 'stub', or status 'test' with no provider;
--   * it does NOT raise for {"status":"test","provider":"moyasar"} (the owner's
--     run with Moyasar test keys), {"status":"live","provider":"moyasar"},
--     disabled, or a missing row;
--   * off production the stub is a WARNING, never an exception.
--
-- The block is extracted from _verify.sql between its markers, so this test
-- runs the very lines the deploy runs. run.sh copies it in as /tmp/mig2.sql
-- (it also runs once there, against the empty table: no row → no raise), and
-- each case below re-runs it with \i.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   T=supabase/tests/rls; B=$(mktemp -d)/verify_payments_gateway_block.sql
--   sed -n '/^-- >>> verify:payments_gateway/,/^-- <<< verify:payments_gateway/p' \
--     supabase/migrations/_verify.sql > "$B"
--   bash $T/run.sh $T/prelude_platform_settings_min.sql "$B" $T/verify_payments_gateway.test.sql
--
-- NEGATIVE CONTROL (must FAIL at T1) — the pre-B1 condition, which raised for
-- every status 'test' (moyasar included):
--   sed -n '/^-- >>> verify:payments_gateway/,/^-- <<< verify:payments_gateway/p' \
--     supabase/migrations/_verify.sql \
--   | perl -0pe "s/IF coalesce\(v_status, 'disabled'\) <> 'disabled'.*?\) THEN/IF v_status IN ('test', 'stub') THEN/s" > "$B"
--   bash $T/run.sh $T/prelude_platform_settings_min.sql "$B" $T/verify_payments_gateway.test.sql

\set ON_ERROR_STOP on

create temp table _gw_case (label text, value jsonb, env text, expect text);
insert into _gw_case values
  ('T1 moyasar test on production',  '{"status":"test","provider":"moyasar"}', 'production', 'pass'),
  ('T2 moyasar live on production',  '{"status":"live","provider":"moyasar"}', 'production', 'pass'),
  ('T3 disabled on production',      '{"status":"disabled","provider":null}',  'production', 'pass'),
  ('T4 stub test on production',     '{"status":"test","provider":"stub"}',    'production', 'raise'),
  ('T5 provider-less test on prod',  '{"status":"test","provider":null}',      'production', 'raise'),
  ('T6 status stub on production',   '{"status":"stub"}',                      'production', 'raise'),
  ('T7 stub test on staging',        '{"status":"test","provider":"stub"}',    'staging',    'pass');

-- One case at a time: \i cannot sit inside a PL/pgSQL handler, so psql's own
-- ERROR / LAST_ERROR_MESSAGE variables carry the outcome.
\set ON_ERROR_STOP off

-- T1
delete from public.platform_settings where key = 'payments_gateway';
insert into public.platform_settings values ('payments_gateway', '{"status":"test","provider":"moyasar"}');
set nzamy.env = 'production';
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T1', :'LAST_ERROR_MESSAGE', false);

-- T2
delete from public.platform_settings where key = 'payments_gateway';
insert into public.platform_settings values ('payments_gateway', '{"status":"live","provider":"moyasar"}');
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T2', :'LAST_ERROR_MESSAGE', false);

-- T3
delete from public.platform_settings where key = 'payments_gateway';
insert into public.platform_settings values ('payments_gateway', '{"status":"disabled","provider":null}');
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T3', :'LAST_ERROR_MESSAGE', false);

-- T4
delete from public.platform_settings where key = 'payments_gateway';
insert into public.platform_settings values ('payments_gateway', '{"status":"test","provider":"stub"}');
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T4', :'LAST_ERROR_MESSAGE', false);

-- T5
delete from public.platform_settings where key = 'payments_gateway';
insert into public.platform_settings values ('payments_gateway', '{"status":"test","provider":null}');
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T5', :'LAST_ERROR_MESSAGE', false);

-- T6
delete from public.platform_settings where key = 'payments_gateway';
insert into public.platform_settings values ('payments_gateway', '{"status":"stub"}');
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T6', :'LAST_ERROR_MESSAGE', false);

-- T7 (staging: a warning only)
delete from public.platform_settings where key = 'payments_gateway';
insert into public.platform_settings values ('payments_gateway', '{"status":"test","provider":"stub"}');
set nzamy.env = 'staging';
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T7', :'LAST_ERROR_MESSAGE', false);

-- T8 no row at all, on production
delete from public.platform_settings where key = 'payments_gateway';
set nzamy.env = 'production';
\set LAST_ERROR_MESSAGE ''
\i /tmp/mig2.sql
select set_config('t.T8', :'LAST_ERROR_MESSAGE', false);

\set ON_ERROR_STOP on

do $$
declare
  c record;
  got text;
begin
  for c in select * from _gw_case loop
    got := current_setting('t.' || split_part(c.label, ' ', 1));
    if c.expect = 'pass' and got <> '' then
      raise exception '% FAILED: expected no exception, got: %', c.label, got;
    elsif c.expect = 'raise' and got not like '%payments_gateway%on PRODUCTION%' then
      raise exception '% FAILED: expected the production stub exception, got: "%"', c.label, got;
    end if;
    raise notice '% ok', c.label;
  end loop;
  if current_setting('t.T8') <> '' then
    raise exception 'T8 no row on production FAILED: got %', current_setting('t.T8');
  end if;
  raise notice 'T8 no row on production ok';
  raise notice 'verify_payments_gateway: ALL PASS';
end $$;
