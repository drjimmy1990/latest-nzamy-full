-- l18_contract_fees_firm_roles.test.sql — proves 20261208_53 (batch
-- l18-answers, owner answer ٢٢٩): a FIRM contract's fee schedule
-- (contract_payments) is read and written only by the firm owner, an ACTIVE
-- managing partner or an ACTIVE finance manager; a solo lawyer keeps his own.
--   F1 the firm owner reads and adds a payment;
--   F2 the active managing partner and finance manager read and update;
--   F3 the member lawyer who CREATED the contract reads no payment, adds none,
--      changes none and deletes none (the contract itself he still reads);
--   F4 a suspended finance manager reads nothing;
--   F5 a solo lawyer reads and writes his own contract's schedule; another
--      solo lawyer reads nothing (the existing policies, unchanged);
--   F6 the service role (the reminder cron) still reads everything.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261208_53
-- runs TWICE. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20261208_53_l18_contract_fees_firm_roles.sql $M/20261208_53_l18_contract_fees_firm_roles.sql \
--     $R/l18_contract_fees_firm_roles.test.sql
--   Expect from each run of 20261208_53: «l18_contract_fees_firm_roles verify: OK …».
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261208_53
--   lines → «F3 the member lawyer reads no payment of the firm contract FAIL: got 2, want 0».
-- Synthetic fixtures only. Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'rows:' || n;
exception when others then
  return 'refused:' || sqlstate;
end $$;
grant execute on function pg_temp.expect(text, text, text) to public;
grant execute on function pg_temp.try(text) to public;

-- fixtures (postgres)
insert into auth.users values
  ('00000000-0000-0000-0000-0000000053f0'),  -- O  firm owner
  ('00000000-0000-0000-0000-0000000053a1'),  -- MP managing partner
  ('00000000-0000-0000-0000-0000000053a2'),  -- FM finance manager
  ('00000000-0000-0000-0000-0000000053a3'),  -- L  member lawyer (creates the contract)
  ('00000000-0000-0000-0000-0000000053a4'),  -- SF suspended finance manager
  ('00000000-0000-0000-0000-0000000053b1'),  -- S  solo lawyer
  ('00000000-0000-0000-0000-0000000053b2');  -- S2 another solo lawyer
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000053f0', 'firm',   'O'),
  ('00000000-0000-0000-0000-0000000053a1', 'lawyer', 'MP'),
  ('00000000-0000-0000-0000-0000000053a2', 'lawyer', 'FM'),
  ('00000000-0000-0000-0000-0000000053a3', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-0000000053a4', 'lawyer', 'SF'),
  ('00000000-0000-0000-0000-0000000053b1', 'lawyer', 'S'),
  ('00000000-0000-0000-0000-0000000053b2', 'lawyer', 'S2');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('00000000-0000-0000-0000-0000000053ff', '00000000-0000-0000-0000-0000000053f0', 'مكتب اختبار');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000053ff', '00000000-0000-0000-0000-0000000053a1', 'managing_partner', 'active', now()),
  ('00000000-0000-0000-0000-0000000053ff', '00000000-0000-0000-0000-0000000053a2', 'finance_manager', 'active', now()),
  ('00000000-0000-0000-0000-0000000053ff', '00000000-0000-0000-0000-0000000053a3', 'lawyer', 'active', now()),
  ('00000000-0000-0000-0000-0000000053ff', '00000000-0000-0000-0000-0000000053a4', 'finance_manager', 'suspended', now());
insert into public.contracts (id, owner_user_id, firm_id, title) values
  ('l18-c-firm', '00000000-0000-0000-0000-0000000053a3', '00000000-0000-0000-0000-0000000053ff', 'عقد المكتب'),
  ('l18-c-solo', '00000000-0000-0000-0000-0000000053b1', null, 'عقد المحامي الفرد');
insert into public.contract_payments (id, contract_id, label, amount_sar) values
  ('00000000-0000-0000-0000-0000000053c1', 'l18-c-firm', 'دفعة مقدمة', 1000),
  ('00000000-0000-0000-0000-0000000053c2', 'l18-c-solo', 'دفعة مقدمة', 500);

set role app_user;

-- F1 owner
select set_config('test.uid', '00000000-0000-0000-0000-0000000053f0', false);
select pg_temp.expect('F1 the firm owner reads the firm contract''s payments',
  (select count(*)::text from public.contract_payments where contract_id = 'l18-c-firm'), '1');
select pg_temp.expect('F1 … and adds one',
  pg_temp.try($$insert into public.contract_payments (contract_id, label, amount_sar) values ('l18-c-firm', 'دفعة ثانية', 200)$$), 'rows:1');

-- F2 managing partner, finance manager
select set_config('test.uid', '00000000-0000-0000-0000-0000000053a1', false);
select pg_temp.expect('F2 the managing partner reads them',
  (select count(*)::text from public.contract_payments where contract_id = 'l18-c-firm'), '2');
select set_config('test.uid', '00000000-0000-0000-0000-0000000053a2', false);
select pg_temp.expect('F2 the finance manager updates one',
  pg_temp.try($$update public.contract_payments set label = 'دفعة مقدمة (معدّلة)' where id = '00000000-0000-0000-0000-0000000053c1'$$), 'rows:1');

-- F3 the member lawyer who created it
select set_config('test.uid', '00000000-0000-0000-0000-0000000053a3', false);
select pg_temp.expect('F3 the member lawyer still reads the contract itself',
  (select count(*)::text from public.contracts where id = 'l18-c-firm'), '1');
select pg_temp.expect('F3 the member lawyer reads no payment of the firm contract',
  (select count(*)::text from public.contract_payments where contract_id = 'l18-c-firm'), '0');
select pg_temp.expect('F3 … adds none',
  pg_temp.try($$insert into public.contract_payments (contract_id, label, amount_sar) values ('l18-c-firm', 'دفعة', 1)$$), 'refused:42501');
select pg_temp.expect('F3 … changes none',
  pg_temp.try($$update public.contract_payments set amount_sar = 1 where contract_id = 'l18-c-firm'$$), 'rows:0');
select pg_temp.expect('F3 … deletes none',
  pg_temp.try($$delete from public.contract_payments where contract_id = 'l18-c-firm'$$), 'rows:0');

-- F4 suspended finance manager
select set_config('test.uid', '00000000-0000-0000-0000-0000000053a4', false);
select pg_temp.expect('F4 a suspended finance manager reads nothing',
  (select count(*)::text from public.contract_payments where contract_id = 'l18-c-firm'), '0');

-- F5 solo lawyers
select set_config('test.uid', '00000000-0000-0000-0000-0000000053b1', false);
select pg_temp.expect('F5 a solo lawyer reads his own schedule',
  (select count(*)::text from public.contract_payments where contract_id = 'l18-c-solo'), '1');
select pg_temp.expect('F5 … and adds to it',
  pg_temp.try($$insert into public.contract_payments (contract_id, label, amount_sar) values ('l18-c-solo', 'دفعة نهائية', 300)$$), 'rows:1');
select set_config('test.uid', '00000000-0000-0000-0000-0000000053b2', false);
select pg_temp.expect('F5 another solo lawyer reads nothing of it',
  (select count(*)::text from public.contract_payments), '0');

reset role;

-- F6 service role
set role service_role;
select pg_temp.expect('F6 the service role still reads every payment',
  (select count(*)::text from public.contract_payments), '4');
reset role;

select 'l18_contract_fees_firm_roles: ALL OK' as result;
