-- time_trust_expenses_l6.test.sql — proves 20261126_40 (batch l6-ledger):
--   time_entries, lawyer_expenses, client_trust_ledger — finance-role reads,
--   scoped writes, restricted cases, void-with-reason, trust balance.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $T/prelude_invoice_payments_live.sql \
--     $M/20261126_40_time_trust_expenses.sql \
--     $M/20261126_40_time_trust_expenses.sql \
--     $T/time_trust_expenses_l6.test.sql
--
-- NEGATIVE CONTROLS (must FAIL):
--   * SELECT policy `can_access_case_row(created_by, firm_id)` (the legal
--     ledger's) instead of can_read_firm_finance → «T3 FAIL: Y reads …»
--     (a secretary would read colleagues' fees).
--   * no RESTRICTIVE policy on time_entries → «T3 FAIL: P reads time
--     [e001 e002 e003] — expected [e001 e003]» (recorded 2026-11-18).
--   * the guard trigger dropped → «T5c FAIL: a voided entry was edited».
--
-- People: firm F (owner O)  L lawyer (lead of case-f, case-r)  Y legal secretary
--         P partner  FM finance_manager (an individual account)
--         firm F2 (owner O2)  M2 lawyer of F2      S solo lawyer (case-s)
-- case-r is a RESTRICTED firm-F case (team: L only).
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a0'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a5'),
  ('00000000-0000-0000-0000-0000000000b0'), ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a0','firm','O'),
  ('00000000-0000-0000-0000-0000000000a1','lawyer','L'),
  ('00000000-0000-0000-0000-0000000000a2','individual','Y'),
  ('00000000-0000-0000-0000-0000000000a3','lawyer','P'),
  ('00000000-0000-0000-0000-0000000000a5','individual','FM'),
  ('00000000-0000-0000-0000-0000000000b0','firm','O2'),
  ('00000000-0000-0000-0000-0000000000b1','lawyer','M2'),
  ('00000000-0000-0000-0000-0000000000c1','lawyer','S'),
  ('00000000-0000-0000-0000-0000000000c2','individual','K');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a0','مكتب ف'),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b0','مكتب ف٢');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','legal_secretary','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a3','partner','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a5','finance_manager','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','lawyer','active', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id) values
  ('case-f','00000000-0000-0000-0000-0000000000c2','قضية المكتب','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-r','00000000-0000-0000-0000-0000000000c2','قضية مقيدة','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-s','00000000-0000-0000-0000-0000000000c1','قضية منفردة', null, null),
  ('case-m','00000000-0000-0000-0000-0000000000c2','قضية ف٢','00000000-0000-0000-0000-0000000000b1','ffffffff-0000-0000-0000-0000000000f2');
update public.service_requests set is_restricted = true where id = 'case-r';
insert into public.lawyer_clients (id, owner_user_id, firm_id, name) values
  ('cccccccc-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','موكل المكتب'),
  ('cccccccc-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','ffffffff-0000-0000-0000-0000000000f2','موكل ف٢'),
  ('cccccccc-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c1', null,'موكل منفرد');
insert into public.payments (id, request_id, amount, status) values ('pay-1','case-f', 450, 'requires_payment');

-- app_user inherits everything by default privileges; the test proves the
-- grants given to `authenticated`.
revoke all on public.time_entries, public.lawyer_expenses, public.client_trust_ledger from app_user;

-- ── T1 legitimate writes ─────────────────────────────────────────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.time_entries (id, created_by, firm_id, case_request_id, lawyer_client_id, duration_min, description, hourly_rate_halalas) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','case-f','cccccccc-0000-0000-0000-0000000000f1', 90,'إعداد مذكرة', 30000),
  ('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','case-r', null, 30,'مراجعة سرية', 30000);
insert into public.lawyer_expenses (id, created_by, firm_id, case_request_id, lawyer_client_id, category, description, amount_halalas, receipt_path) values
  ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', null,'cccccccc-0000-0000-0000-0000000000f1','court_fees','رسوم', 15000,
   '00000000-0000-0000-0000-0000000000a1/expense-receipts/r1.pdf');
insert into public.client_trust_ledger (id, created_by, firm_id, lawyer_client_id, kind, amount_halalas, description) values
  ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-0000000000f1','deposit', 100000,'دفعة أمانة');
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', false);
insert into public.time_entries (id, created_by, firm_id, case_request_id, duration_min, description) values
  ('00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-0000000000a2','ffffffff-0000-0000-0000-0000000000f1','case-f', 20,'تنسيق ملف');
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a5', false);
insert into public.client_trust_ledger (id, created_by, firm_id, lawyer_client_id, case_request_id, kind, amount_halalas, description, negative_ack) values
  ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-0000000000a5','ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-0000000000f1','case-f','disbursement', 30000,'رسوم خبير', false);
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', false);
insert into public.time_entries (id, created_by, firm_id, lawyer_client_id, duration_min, description, hourly_rate_halalas, billable) values
  ('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-0000000000c1', null,'cccccccc-0000-0000-0000-0000000000c1', 45,'استشارة هاتفية', 20000, false);
insert into public.lawyer_expenses (id, created_by, firm_id, case_request_id, category, description, amount_halalas) values
  ('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-0000000000c1', null,'case-s','travel','سفر للجلسة', 50000);
reset role;
do $$
begin
  if (select amount_halalas from public.time_entries where id = '00000000-0000-0000-0000-00000000e001') <> 45000 then
    raise exception 'T1 FAIL: 90 min at 300 SAR/h is not 450.00 SAR (45000 halalas)';
  end if;
  raise notice 'T1 PASS: a firm lawyer, a secretary (time on his case), the finance manager (trust) and a solo lawyer write; amount = round(minutes × rate / 60)';
end $$;

-- ── T2 nobody plants a row into another case, card or firm ──────────────────
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  begin
    insert into public.time_entries (created_by, firm_id, case_request_id, duration_min, description)
    values ('00000000-0000-0000-0000-0000000000b1','ffffffff-0000-0000-0000-0000000000f1','case-f', 10,'x');
    raise exception 'T2a FAIL: a firm-F2 lawyer logged time on firm F''s case';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    insert into public.time_entries (created_by, firm_id, case_request_id, duration_min, description)
    values ('00000000-0000-0000-0000-0000000000a1', null,'case-f', 10,'x');
    raise exception 'T2b FAIL: a firm case row without its firm (hidden from firm finance)';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.time_entries (created_by, firm_id, lawyer_client_id, duration_min, description)
    values ('00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f2','cccccccc-0000-0000-0000-0000000000f2', 10,'x');
    raise exception 'T2c FAIL: L logged time on firm F2''s client card';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.time_entries (created_by, firm_id, case_request_id, lawyer_client_id, duration_min, description)
    values ('00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','case-f','cccccccc-0000-0000-0000-0000000000c1', 10,'x');
    raise exception 'T2d FAIL: a firm case paired with another lawyer''s solo card';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.time_entries (created_by, firm_id, duration_min, description)
    values ('00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', 10,'x');
    raise exception 'T2e FAIL: a row with neither case nor client';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.time_entries (created_by, firm_id, case_request_id, duration_min, description)
    values ('00000000-0000-0000-0000-0000000000a2','ffffffff-0000-0000-0000-0000000000f1','case-f', 10,'x');
    raise exception 'T2f FAIL: L logged time in Y''s name';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.lawyer_expenses (created_by, firm_id, case_request_id, category, description, amount_halalas, receipt_path)
    values ('00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','case-f','other','x', 100,
            '00000000-0000-0000-0000-0000000000a2/expense-receipts/x.pdf');
    raise exception 'T2g FAIL: a receipt path in someone else''s storage folder';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.time_entries (created_by, firm_id, case_request_id, duration_min, description, voided_at, void_reason)
    values ('00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','case-f', 10,'x', now(), 'born void');
    raise exception 'T2h FAIL: a row was born voided';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  begin
    insert into public.client_trust_ledger (created_by, firm_id, lawyer_client_id, kind, amount_halalas, description)
    values ('00000000-0000-0000-0000-0000000000a2','ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-0000000000f1','deposit', 100,'x');
    raise exception 'T2i FAIL: a secretary wrote into a client''s trust account';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a5', true);
  begin
    insert into public.client_trust_ledger (created_by, firm_id, lawyer_client_id, kind, amount_halalas, description)
    values ('00000000-0000-0000-0000-0000000000a5', null,'cccccccc-0000-0000-0000-0000000000f1','deposit', 100,'x');
    raise exception 'T2j FAIL: a firm card''s trust row without the firm';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.client_trust_ledger (created_by, firm_id, lawyer_client_id, kind, amount_halalas, description)
    values ('00000000-0000-0000-0000-0000000000a5','ffffffff-0000-0000-0000-0000000000f2','cccccccc-0000-0000-0000-0000000000f2','deposit', 100,'x');
    raise exception 'T2k FAIL: firm F''s finance manager wrote into firm F2''s trust account';
  exception when insufficient_privilege then null; end;
  raise notice 'T2 PASS: no row from another firm, without its firm, on a foreign card, with no target, in another''s name, with a foreign receipt folder, born voided; trust only by card owner / finance';
end $$;
reset role;

-- ── T3 reads: the writer + firm finance roles; restricted case hidden ───────
set role app_user;
do $$
declare got text; want text; who text; uid uuid; tbl text;
begin
  for who, uid, tbl, want in
    select * from (values
      ('L',  '00000000-0000-0000-0000-0000000000a1'::uuid, 'time',  'e001 e002'),
      ('Y',  '00000000-0000-0000-0000-0000000000a2'::uuid, 'time',  'e003'),
      ('P',  '00000000-0000-0000-0000-0000000000a3'::uuid, 'time',  'e001 e003'),
      ('FM', '00000000-0000-0000-0000-0000000000a5'::uuid, 'time',  'e001 e003'),
      ('O',  '00000000-0000-0000-0000-0000000000a0'::uuid, 'time',  'e001 e002 e003'),
      ('M2', '00000000-0000-0000-0000-0000000000b1'::uuid, 'time',  ''),
      ('O2', '00000000-0000-0000-0000-0000000000b0'::uuid, 'time',  ''),
      ('S',  '00000000-0000-0000-0000-0000000000c1'::uuid, 'time',  'e004'),
      ('K',  '00000000-0000-0000-0000-0000000000c2'::uuid, 'time',  ''),
      ('L',  '00000000-0000-0000-0000-0000000000a1'::uuid, 'exp',   'd001'),
      ('Y',  '00000000-0000-0000-0000-0000000000a2'::uuid, 'exp',   ''),
      ('FM', '00000000-0000-0000-0000-0000000000a5'::uuid, 'exp',   'd001'),
      ('S',  '00000000-0000-0000-0000-0000000000c1'::uuid, 'exp',   'd002'),
      ('L',  '00000000-0000-0000-0000-0000000000a1'::uuid, 'trust', 'a001 a002'),
      ('Y',  '00000000-0000-0000-0000-0000000000a2'::uuid, 'trust', ''),
      ('FM', '00000000-0000-0000-0000-0000000000a5'::uuid, 'trust', 'a001 a002'),
      ('M2', '00000000-0000-0000-0000-0000000000b1'::uuid, 'trust', '')
    ) v(who, uid, tbl, want)
  loop
    perform set_config('test.uid', uid::text, true);
    if tbl = 'time' then
      select coalesce(string_agg(substr(id::text, 33), ' ' order by id), '') into got from public.time_entries;
    elsif tbl = 'exp' then
      select coalesce(string_agg(substr(id::text, 33), ' ' order by id), '') into got from public.lawyer_expenses;
    else
      select coalesce(string_agg(substr(id::text, 33), ' ' order by id), '') into got from public.client_trust_ledger;
    end if;
    if got is distinct from want then
      raise exception 'T3 FAIL: % reads % [%] — expected [%]', who, tbl, got, want;
    end if;
  end loop;
  raise notice 'T3 PASS: writer + owner/partner/finance manager read; secretary reads only his own; other firms, the client and the restricted case stay hidden';
end $$;
reset role;

-- ── T4 trust balance: authorizes first, counts every live row ───────────────
set role app_user;
do $$
declare b bigint;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  b := public.client_trust_balance('cccccccc-0000-0000-0000-0000000000f1');
  if b <> 70000 then raise exception 'T4a FAIL: card owner balance %, expected 70000', b; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a5', true);
  b := public.client_trust_balance('cccccccc-0000-0000-0000-0000000000f1');
  if b <> 70000 then raise exception 'T4b FAIL: finance manager balance %, expected 70000', b; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  begin
    b := public.client_trust_balance('cccccccc-0000-0000-0000-0000000000f1');
    raise exception 'T4c FAIL: a secretary read a client''s trust balance';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  begin
    b := public.client_trust_balance('cccccccc-0000-0000-0000-0000000000f1');
    raise exception 'T4d FAIL: another firm read a client''s trust balance';
  exception when insufficient_privilege then null; end;
  raise notice 'T4 PASS: the balance (deposits − disbursements) for the card owner and finance, refused to everyone else';
end $$;
reset role;

-- ── T5 void with reason; voided rows final; writer-only edits ───────────────
set role app_user;
do $$
declare n int; r record;
begin
  -- the writer edits his own unvoided, unbilled entry; the amount follows
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  update public.time_entries set duration_min = 120 where id = '00000000-0000-0000-0000-00000000e001';
  if (select amount_halalas from public.time_entries where id = '00000000-0000-0000-0000-00000000e001') <> 60000 then
    raise exception 'T5a FAIL: the amount did not follow the edited duration';
  end if;
  -- nobody moves a row
  begin
    update public.time_entries set firm_id = null where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T5b FAIL: the writer moved his entry out of the firm';
  exception when insufficient_privilege then null; end;
  begin
    update public.time_entries set case_request_id = 'case-r' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T5b FAIL: the writer moved his entry to another case';
  exception when insufficient_privilege then null; end;
  -- a secretary cannot touch a colleague's row (USING hides it)
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  update public.time_entries set voided_at = now(), void_reason = 'خطأ في القيد' where id = '00000000-0000-0000-0000-00000000e001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T5c FAIL: a secretary voided a colleague''s entry'; end if;
  -- the finance manager may not edit content, but may void with a reason
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a5', true);
  begin
    update public.time_entries set description = 'غيّره المدير المالي' where id = '00000000-0000-0000-0000-00000000e003';
    raise exception 'T5d FAIL: the finance manager rewrote a colleague''s entry';
  exception when insufficient_privilege then null; end;
  begin
    update public.time_entries set voided_at = now(), void_reason = 'x' where id = '00000000-0000-0000-0000-00000000e003';
    raise exception 'T5e FAIL: a void without a real reason';
  exception when check_violation then null; end;
  update public.time_entries set voided_at = now(), void_reason = '  مكرر مع قيد آخر  ', duration_min = 999
   where id = '00000000-0000-0000-0000-00000000e003';
  reset role;
  select * into r from public.time_entries where id = '00000000-0000-0000-0000-00000000e003';
  if r.voided_by is distinct from '00000000-0000-0000-0000-0000000000a5'::uuid
     or r.void_reason <> 'مكرر مع قيد آخر' or r.duration_min <> 20 then
    raise exception 'T5f FAIL: void stamped by % reason [%] duration % — the void must change nothing else', r.voided_by, r.void_reason, r.duration_min;
  end if;
  set role app_user;
  -- a voided row is final, even for its writer
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  begin
    update public.time_entries set description = 'بعد الإلغاء' where id = '00000000-0000-0000-0000-00000000e003';
    raise exception 'T5g FAIL: a voided entry was edited';
  exception when object_not_in_prerequisite_state then null; end;
  -- no DELETE
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    delete from public.time_entries where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T5h FAIL: a session deleted a time entry';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.client_trust_ledger where id = '00000000-0000-0000-0000-00000000a001';
    raise exception 'T5h FAIL: a session deleted a trust row';
  exception when insufficient_privilege then null; end;
  raise notice 'T5 PASS: the writer edits, nobody moves a row, finance voids with a reason (void changes nothing else), voided rows are final, no DELETE';
end $$;
reset role;

-- ── T6 trust rows: void-only; the void moves the balance ────────────────────
set role app_user;
do $$
declare b bigint;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    update public.client_trust_ledger set amount_halalas = 1 where id = '00000000-0000-0000-0000-00000000a002';
    raise exception 'T6a FAIL: a trust amount was edited';
  exception when insufficient_privilege then null; end;
  begin
    update public.client_trust_ledger set void_reason = 'سبب بلا إلغاء' where id = '00000000-0000-0000-0000-00000000a002';
    raise exception 'T6b FAIL: a reason without a void was stored';
  exception when insufficient_privilege or check_violation then null; end;
  update public.client_trust_ledger set voided_at = now(), void_reason = 'صرف مسجل بالخطأ' where id = '00000000-0000-0000-0000-00000000a002';
  b := public.client_trust_balance('cccccccc-0000-0000-0000-0000000000f1');
  if b <> 100000 then raise exception 'T6c FAIL: balance % after voiding the disbursement, expected 100000', b; end if;
  raise notice 'T6 PASS: trust rows cannot be edited, only voided with a reason; a voided row leaves the balance';
end $$;
reset role;

-- ── T7 billing: the link stamps billed_at and freezes the content ───────────
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  update public.time_entries set billed_payment_id = 'pay-1' where id = '00000000-0000-0000-0000-00000000e001';
  if (select billed_at from public.time_entries where id = '00000000-0000-0000-0000-00000000e001') is null then
    raise exception 'T7a FAIL: billed_at was not stamped';
  end if;
  begin
    update public.time_entries set duration_min = 5 where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T7b FAIL: a billed entry was edited';
  exception when insufficient_privilege then null; end;
  begin
    update public.time_entries set billed_payment_id = 'no-such-invoice' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T7c FAIL: an entry was billed to an invoice that does not exist';
  exception when foreign_key_violation then null; end;
  raise notice 'T7 PASS: billing stamps billed_at, a billed entry is frozen, the invoice must exist';
end $$;
reset role;

-- ── T8 guests and privileges ────────────────────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.time_entries', 'SELECT')
     or has_table_privilege('anon', 'public.client_trust_ledger', 'SELECT')
     or has_function_privilege('anon', 'public.client_trust_balance(uuid)', 'EXECUTE') then
    raise exception 'T8 FAIL: a guest privilege exists';
  end if;
  raise notice 'T8 PASS: no guest privilege';
end $$;

select 'time_trust_expenses_l6: ALL PASS' as result;
