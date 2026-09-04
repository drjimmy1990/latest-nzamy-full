-- RLS acceptance tests for 20260905_phase3_consultations_and_contracts.sql
-- Run after 20260903_phase2 and 20260904_phase5 (run.sh accepts several
-- migrations, in order, before the test file).
-- Users: A (solo lawyer), B (another solo lawyer), O (owner of firm F),
-- C (lawyer, active member of F), K (client). Non-superuser role throughout.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

-- fixtures as postgres
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000000f'),
  ('dddddddd-0000-0000-0000-000000000004');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','B'),
  ('cccccccc-0000-0000-0000-000000000003','lawyer','C'),
  ('00000000-0000-0000-0000-00000000000f','firm','O'),
  ('dddddddd-0000-0000-0000-000000000004','individual','K');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','مكتب الاختبار');
-- O's membership is created by the Phase 2 trigger; only C is added by hand
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000003','lawyer','active', now());

-- three consultation requests through the three real code paths' shapes
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, metadata) values
  ('req-k',  'dddddddd-0000-0000-0000-000000000004', 'consultation', 'استشارة العميل', 'ai_workspace', 'pending_assignment',
   '{"mode":"video","specialty":"تجاري","path":"lawyer"}'::jsonb);
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, assigned_to, metadata) values
  ('req-a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'consultation', 'استشارة حضورية', 'lawyer', 'pending_assignment',
   'aaaaaaaa-0000-0000-0000-000000000001',
   '{"mode":"in-person","day":"2026-09-10","time":"10:30","duration":"45"}'::jsonb);
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, assigned_to, firm_id, metadata) values
  ('req-c1', 'cccccccc-0000-0000-0000-000000000003', 'consultation', 'استشارة المكتب', 'lawyer', 'assigned',
   'cccccccc-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1',
   '{"mode":"text","duration":"900"}'::jsonb);
-- a non-consultation request must NOT create a row
insert into public.service_requests (id, requester_user_id, type, title, assigned_to) values
  ('req-a-case', 'aaaaaaaa-0000-0000-0000-000000000001', 'service', 'قضية أ', 'aaaaaaaa-0000-0000-0000-000000000001');

select 'T0 trigger created one row per consultation request (expect 3): ' || count(*) from public.consultations;
select 'T0 lawyer booking is scheduled with its wall-clock time (expect scheduled|2026-09-10 10:30|45): '
       || status || '|' || to_char(scheduled_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') || '|' || duration_minutes
  from public.consultations where request_id = 'req-a1';
select 'T0 client booking is requested, unassigned (expect requested|): ' || status || '|' || coalesce(lawyer_user_id::text,'')
  from public.consultations where request_id = 'req-k';
select 'T0 out-of-range duration is dropped, not stored (expect ): ' || coalesce(duration_minutes::text,'')
  from public.consultations where request_id = 'req-c1';
-- assignment flows through
update public.service_requests set assigned_to = 'aaaaaaaa-0000-0000-0000-000000000001' where id = 'req-k';
select 'T0 assignment follows to the working record (expect A): '
       || case when lawyer_user_id = 'aaaaaaaa-0000-0000-0000-000000000001' then 'A' else 'other' end
  from public.consultations where request_id = 'req-k';

set role app_user;

-- T1 who sees what
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
select 'T1 client K reads own consultation only (expect 1): ' || count(*) from public.consultations;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select 'T1 A reads the two assigned to A (expect 2): ' || count(*) from public.consultations;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T1 B reads nothing (expect 0): ' || count(*) from public.consultations;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T1 firm owner O reads member C''s firm consultation (expect 1): ' || count(*) from public.consultations;

-- T2 only the lawyer side updates the working record
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
with u as (update public.consultations set status = 'completed' where request_id = 'req-k' returning 1)
select 'T2 client cannot change status (expect 0 rows): ' || count(*) from u;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
with u as (update public.consultations set status = 'scheduled', scheduled_at = now() + interval '2 days', duration_minutes = 30
            where request_id = 'req-k' returning 1)
select 'T2 lawyer schedules it (expect 1): ' || count(*) from u;
do $$ begin
  update public.consultations set status = 'done' where request_id = 'req-k';
  raise notice 'T2 FAIL: unknown status accepted';
exception when check_violation then
  raise notice 'T2 PASS: status vocabulary is checked (23514)';
end $$;
do $$ begin
  update public.consultations set opinion_text = 'رأي' where request_id = 'req-k';
  raise notice 'T2 FAIL: an opinion without a delivery time was stored';
exception when check_violation then
  raise notice 'T2 PASS: opinion_text requires opinion_delivered_at (23514)';
end $$;
with u as (update public.consultations set opinion_text = 'الرأي القانوني', opinion_delivered_at = now(),
                  status = 'completed', outcome = 'opinion_delivered' where request_id = 'req-k' returning 1)
select 'T2 delivered opinion stored (expect 1): ' || count(*) from u;
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
select 'T2 client reads the delivered opinion (expect الرأي القانوني): ' || opinion_text from public.consultations where request_id = 'req-k';

-- T3 private notes never reach the client; firm notes reach the firm
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.consultation_notes (consultation_id, author_user_id, visibility, body)
select id, 'aaaaaaaa-0000-0000-0000-000000000001', 'private', 'ملاحظة خاصة' from public.consultations where request_id = 'req-k';
select 'T3 A reads own note (expect 1): ' || count(*) from public.consultation_notes;
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
select 'T3 client K reads no notes (expect 0): ' || count(*) from public.consultation_notes;
do $$ begin
  insert into public.consultation_notes (consultation_id, author_user_id, visibility, body)
  select id, 'dddddddd-0000-0000-0000-000000000004', 'private', 'تسلل' from public.consultations where request_id = 'req-k';
  raise notice 'T3 FAIL: client wrote a note';
exception when insufficient_privilege then
  raise notice 'T3 PASS: client cannot write notes (42501)';
end $$;
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
insert into public.consultation_notes (consultation_id, author_user_id, visibility, body)
select id, 'cccccccc-0000-0000-0000-000000000003', 'firm', 'ملاحظة للمكتب' from public.consultations where request_id = 'req-c1';
insert into public.consultation_notes (consultation_id, author_user_id, visibility, body)
select id, 'cccccccc-0000-0000-0000-000000000003', 'private', 'ملاحظة خاصة بـ C' from public.consultations where request_id = 'req-c1';
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T3 firm owner O reads the firm note only (expect 1): ' || count(*) from public.consultation_notes;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T3 B reads no notes (expect 0): ' || count(*) from public.consultation_notes;

-- T4 convert to case exactly once
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.service_requests (id, requester_user_id, type, title, assigned_to, source_consultation_id)
select 'case-from-k', 'aaaaaaaa-0000-0000-0000-000000000001', 'service', 'قضية من الاستشارة',
       'aaaaaaaa-0000-0000-0000-000000000001', id from public.consultations where request_id = 'req-k';
select 'T4 first conversion stored (expect 1): ' || count(*) from public.service_requests where source_consultation_id is not null;
do $$ begin
  insert into public.service_requests (id, requester_user_id, type, title, assigned_to, source_consultation_id)
  select 'case-from-k-again', 'aaaaaaaa-0000-0000-0000-000000000001', 'service', 'تكرار',
         'aaaaaaaa-0000-0000-0000-000000000001', id from public.consultations where request_id = 'req-k';
  raise notice 'T4 FAIL: the same consultation converted twice';
exception when unique_violation then
  raise notice 'T4 PASS: a consultation converts once (23505)';
end $$;
with u as (update public.consultations set converted_case_request_id = 'case-from-k', outcome = 'converted_to_case'
            where request_id = 'req-k' returning 1)
select 'T4 back-link stored (expect 1): ' || count(*) from u;

-- T5 contracts: owner, firm, stranger
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.contracts (id, owner_user_id, title, contract_type, status, starts_on, ends_on, value_sar)
values ('ct-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'عقد أتعاب', 'fee_agreement', 'draft', '2026-09-01', '2027-08-31', 12000);
select 'T5 A reads own contract (expect 1): ' || count(*) from public.contracts;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T5 B reads nothing (expect 0): ' || count(*) from public.contracts;
do $$ begin
  insert into public.contracts (id, owner_user_id, title) values ('ct-forged', 'aaaaaaaa-0000-0000-0000-000000000001', 'مزوّر');
  raise notice 'T5 FAIL: B inserted a contract owned by A';
exception when insufficient_privilege then
  raise notice 'T5 PASS: cannot insert a contract in someone else''s name (42501)';
end $$;
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
insert into public.contracts (id, owner_user_id, firm_id, title, contract_type)
values ('ct-c', 'cccccccc-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', 'عقد المكتب', 'service_agreement');
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T5 firm owner O reads member C''s contract (expect 1): ' || count(*) from public.contracts;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select 'T5 A still sees only own (expect 1): ' || count(*) from public.contracts;
do $$ begin
  insert into public.contracts (id, owner_user_id, title, status) values ('ct-bad', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'signed');
  raise notice 'T5 FAIL: unknown contract status accepted';
exception when check_violation then
  raise notice 'T5 PASS: contract status vocabulary is checked (23514)';
end $$;
do $$ begin
  insert into public.contracts (id, owner_user_id, title, starts_on, ends_on) values ('ct-bad2', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', '2026-09-10', '2026-09-01');
  raise notice 'T5 FAIL: ends_on before starts_on accepted';
exception when check_violation then
  raise notice 'T5 PASS: ends_on >= starts_on (23514)';
end $$;

-- T6 versions: history is per contract, one number once, client reads but never writes
insert into public.contract_versions (contract_id, version_no, label, file_name, storage_path, uploaded_by)
values ('ct-a', 1, 'draft', 'عقد.pdf', 'aaaaaaaa-0000-0000-0000-000000000001/contracts/ct-a/v1-contract.pdf', 'aaaaaaaa-0000-0000-0000-000000000001');
select 'T6 A reads own version (expect 1): ' || count(*) from public.contract_versions;
do $$ begin
  insert into public.contract_versions (contract_id, version_no, label, file_name, storage_path)
  values ('ct-a', 1, 'revised', 'x.pdf', 'p');
  raise notice 'T6 FAIL: duplicate version number accepted';
exception when unique_violation then
  raise notice 'T6 PASS: version numbers are unique per contract (23505)';
end $$;
update public.contracts set current_version_id = (select id from public.contract_versions where contract_id = 'ct-a' and version_no = 1),
                            client_user_id = 'dddddddd-0000-0000-0000-000000000004'
 where id = 'ct-a';
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  insert into public.contract_versions (contract_id, version_no, label, file_name, storage_path)
  values ('ct-a', 2, 'revised', 'x.pdf', 'p');
  raise notice 'T6 FAIL: stranger uploaded a version';
exception when insufficient_privilege then
  raise notice 'T6 PASS: stranger cannot add a version (42501)';
end $$;
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
select 'T6 client K reads the contract shared with them (expect 1): ' || count(*) from public.contracts;
select 'T6 client K reads its versions (expect 1): ' || count(*) from public.contract_versions;
do $$ begin
  insert into public.contract_versions (contract_id, version_no, label, file_name, storage_path)
  values ('ct-a', 2, 'revised', 'x.pdf', 'p');
  raise notice 'T6 FAIL: client uploaded a version';
exception when insufficient_privilege then
  raise notice 'T6 PASS: client cannot add a version (42501)';
end $$;
with u as (update public.contracts set title = 'غيّره العميل' where id = 'ct-a' returning 1)
select 'T6 client cannot edit the contract (expect 0 rows): ' || count(*) from u;

-- T7 parties, obligations, payments
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.contract_parties (contract_id, role, party_kind, name, entity_type, commercial_register_no)
values ('ct-a', 'second_party', 'counterparty', 'شركة الأفق', 'company', '1010123456');
do $$ begin
  insert into public.contract_parties (contract_id, name, commercial_register_no) values ('ct-a', 'x', '123');
  raise notice 'T7 FAIL: malformed commercial register accepted';
exception when check_violation then
  raise notice 'T7 PASS: commercial register is 10 digits (23514)';
end $$;
insert into public.contract_obligations (contract_id, title, kind, due_on)
values ('ct-a', 'إشعار عدم التجديد', 'renewal', '2027-08-01');
do $$ begin
  insert into public.contract_obligations (contract_id, title, due_on, status) values ('ct-a', 'x', '2027-01-01', 'late');
  raise notice 'T7 FAIL: unknown obligation status accepted';
exception when check_violation then
  raise notice 'T7 PASS: obligation status is checked (23514)';
end $$;
insert into public.contract_payments (contract_id, label, stage, amount_sar, due_on)
values ('ct-a', 'مقدّم', 'advance', 4000, '2026-09-15');
do $$ begin
  insert into public.contract_payments (contract_id, label, stage, amount_sar) values ('ct-a', 'صفر', 'final', 0);
  raise notice 'T7 FAIL: zero payment accepted';
exception when check_violation then
  raise notice 'T7 PASS: a payment is positive (23514)';
end $$;
do $$ begin
  update public.contract_payments set status = 'paid' where contract_id = 'ct-a';
  raise notice 'T7 FAIL: paid without paid_on accepted';
exception when check_violation then
  raise notice 'T7 PASS: paid requires paid_on (23514)';
end $$;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T7 B reads no parties/obligations/payments (expect 0|0|0): '
       || (select count(*) from public.contract_parties) || '|'
       || (select count(*) from public.contract_obligations) || '|'
       || (select count(*) from public.contract_payments);
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
insert into public.contract_obligations (contract_id, title, kind, due_on) values ('ct-c', 'تسليم', 'delivery', '2026-12-01');
select 'T7 firm owner O manages obligations on member C''s contract (expect 1): ' || count(*) from public.contract_obligations;

-- T8 the radar link
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.deadlines (owner_user_id, contract_id, title, kind, trigger_date, due_date, computed_by_rule)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'ct-a', 'إشعار عدم التجديد — عقد أتعاب', 'contract', '2026-09-01', '2027-08-01', false);
update public.contract_obligations o set deadline_id = d.id
  from public.deadlines d where d.contract_id = 'ct-a' and o.contract_id = 'ct-a' and o.kind = 'renewal';
select 'T8 obligation linked to a radar deadline (expect 1): ' || count(*)
  from public.contract_obligations where deadline_id is not null;

reset role;
select 'policies consultations=' || (select count(*) from pg_policies where tablename = 'consultations')
    || ' notes=' || (select count(*) from pg_policies where tablename = 'consultation_notes')
    || ' contracts=' || (select count(*) from pg_policies where tablename = 'contracts')
    || ' versions=' || (select count(*) from pg_policies where tablename = 'contract_versions')
    || ' parties=' || (select count(*) from pg_policies where tablename = 'contract_parties')
    || ' obligations=' || (select count(*) from pg_policies where tablename = 'contract_obligations')
    || ' payments=' || (select count(*) from pg_policies where tablename = 'contract_payments')
    || ' (expect 3 4 4 3 2 2 2)';
select 'columns: contracts.owner_user_id=' || (select count(*) from information_schema.columns where table_name='contracts' and column_name='owner_user_id')
    || ' contracts.assigned_user_id=' || (select count(*) from information_schema.columns where table_name='contracts' and column_name='assigned_user_id')
    || ' deadlines.contract_id=' || (select count(*) from information_schema.columns where table_name='deadlines' and column_name='contract_id')
    || ' service_requests.source_consultation_id=' || (select count(*) from information_schema.columns where table_name='service_requests' and column_name='source_consultation_id')
    || ' (expect 1 0 1 1)';
