-- RLS acceptance tests for 20260903_phase2_clients_and_firm_membership.sql
-- Four users: A (solo lawyer), B (another solo lawyer), O (owner of firm F),
-- C (lawyer, active member of F). Every test runs as the non-superuser role.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (bypasses RLS on purpose) ──────────────────────────
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000000f');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','B'),
  ('cccccccc-0000-0000-0000-000000000003','lawyer','C'),
  ('00000000-0000-0000-0000-00000000000f','firm','O');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','مكتب الاختبار');

select 'T10 owner auto-membership (expect 1): ' || count(*)
  from public.firm_members
 where firm_id = 'ffffffff-0000-0000-0000-0000000000f1'
   and user_id = '00000000-0000-0000-0000-00000000000f'
   and role = 'managing_partner' and status = 'active';

-- ── from here on: app_user, impersonating via test.uid ──────────────────────
set role app_user;

-- O adds C as an active member (owner-insert policy, 20260616)
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
insert into public.firm_members (firm_id, user_id, role, status, accepted_at)
values ('ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000003','lawyer','active', now());
select 'T0 owner added C as member (expect 2 rows visible to O): ' || count(*) from public.firm_members;
-- the exact SELECT that recursed before section 4b: a member reading co-members
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
select 'T0b member C reads co-members without recursion (expect 2): ' || count(*) from public.firm_members;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T0b outsider B reads firm F members (expect 0): ' || count(*) from public.firm_members;

-- T1 solo lawyer A files a client; B cannot see it
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.lawyer_clients (id, owner_user_id, name, national_id_hash, flags)
values ('11111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','أحمد المطيري',
        repeat('a', 64), '{vip}');
select 'T1 A sees own client (expect 1): ' || count(*) from public.lawyer_clients;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T1 B sees A''s client (expect 0): ' || count(*) from public.lawyer_clients;

-- T2 firm member C files a firm client; owner O sees it through membership; A and B do not
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
insert into public.lawyer_clients (id, owner_user_id, firm_id, client_type, name, commercial_register_no, national_id_hash)
values ('22222222-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','ffffffff-0000-0000-0000-0000000000f1',
        'company','شركة الأفق','CR-1001', repeat('b', 64));
select 'T2 C sees firm client (expect 1): ' || count(*) from public.lawyer_clients where firm_id is not null;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T2 O (owner, auto-member) sees firm client (expect 1): ' || count(*) from public.lawyer_clients where firm_id is not null;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select 'T2 A sees firm client (expect 0): ' || count(*) from public.lawyer_clients where firm_id is not null;

-- T3 uniqueness: same national id twice inside firm F → refused; same id for solo A → allowed (different scope)
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$ begin
  insert into public.lawyer_clients (owner_user_id, firm_id, name, national_id_hash)
  values ('00000000-0000-0000-0000-00000000000f','ffffffff-0000-0000-0000-0000000000f1','مكرر', repeat('b', 64));
  raise notice 'T3 FAIL: duplicate national id inside the firm was accepted';
exception when unique_violation then
  raise notice 'T3 PASS: duplicate national id inside the firm refused (23505)';
end $$;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.lawyer_clients (owner_user_id, name, national_id_hash)
values ('aaaaaaaa-0000-0000-0000-000000000001','نفس الشخص عند محامٍ مستقل', repeat('b', 64));
select 'T3 solo A may hold the same id as firm F (expect 2 own clients): ' || count(*) from public.lawyer_clients where owner_user_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- T4 refused flags: «bad» and «late_pay» must not be storable
do $$ begin
  insert into public.lawyer_clients (owner_user_id, name, flags)
  values ('aaaaaaaa-0000-0000-0000-000000000001','x', '{bad}');
  raise notice 'T4 FAIL: flag bad accepted';
exception when check_violation then
  raise notice 'T4 PASS: flag bad refused (23514)';
end $$;
do $$ begin
  insert into public.lawyer_clients (owner_user_id, name, flags)
  values ('aaaaaaaa-0000-0000-0000-000000000001','x', '{late_pay}');
  raise notice 'T4 FAIL: flag late_pay accepted';
exception when check_violation then
  raise notice 'T4 PASS: flag late_pay refused (23514)';
end $$;

-- T5 an advance without a total is refused
do $$ begin
  insert into public.lawyer_clients (owner_user_id, name, fee_paid_sar)
  values ('aaaaaaaa-0000-0000-0000-000000000001','x', 100);
  raise notice 'T5 FAIL: paid without total accepted';
exception when check_violation then
  raise notice 'T5 PASS: paid without total refused (23514)';
end $$;

-- T6 cannot file a client under someone else's name (insert policy)
do $$ begin
  insert into public.lawyer_clients (owner_user_id, name)
  values ('bbbbbbbb-0000-0000-0000-000000000002','forged owner');
  raise notice 'T6 FAIL: A inserted a client owned by B';
exception when insufficient_privilege then
  raise notice 'T6 PASS: insert under another owner refused (42501)';
end $$;

-- T7 service_requests firm arm: a case C created for firm F is readable by O, not by B
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id)
values ('req-firm-1','cccccccc-0000-0000-0000-000000000003','قضية للمكتب','cccccccc-0000-0000-0000-000000000003','ffffffff-0000-0000-0000-0000000000f1');
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T7 O reads firm case via membership (expect 1): ' || count(*) from public.service_requests where id = 'req-firm-1';
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T7 B reads firm case (expect 0): ' || count(*) from public.service_requests where id = 'req-firm-1';

-- T8 the old failing path is STILL refused at the table (clients no longer go there)
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$ begin
  insert into public.service_requests (id, requester_user_id, title, assigned_to, metadata)
  values ('req-old-client','aaaaaaaa-0000-0000-0000-000000000001'::uuid,'موكّل: قديم',null,'{"client":true}');
  -- requester = A here so this one passes; the bug shape had requester NULL:
  insert into public.service_requests (id, requester_user_id, title, assigned_to, metadata)
  values ('req-old-client-null', null, 'موكّل: قديم', 'aaaaaaaa-0000-0000-0000-000000000001', '{"client":true}');
  raise notice 'T8 FAIL: null-requester insert accepted';
exception when insufficient_privilege then
  raise notice 'T8 PASS: the old null-requester client insert is still 42501 (why lawyer_clients exists)';
end $$;

-- T9 row 170: participant may insert/update a consultation; a stranger may not
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.service_requests (id, requester_user_id, title) values ('req-a-1','aaaaaaaa-0000-0000-0000-000000000001','استشارة');
insert into public.consultations (id, request_id, requester_user_id) values ('cons-1','req-a-1','aaaaaaaa-0000-0000-0000-000000000001');
update public.consultations set status = 'scheduled' where id = 'cons-1';
select 'T9 A inserted+updated own consultation (expect scheduled): ' || status from public.consultations where id = 'cons-1';
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  insert into public.consultations (id, request_id, requester_user_id) values ('cons-forged','req-a-1','aaaaaaaa-0000-0000-0000-000000000001');
  raise notice 'T9 FAIL: B inserted a consultation as A';
exception when insufficient_privilege then
  raise notice 'T9 PASS: stranger insert refused (42501)';
when unique_violation then
  raise notice 'T9 FAIL: reached uniqueness, policy did not refuse first';
end $$;

-- T11 notes: private stays with the author; firm-visible reaches the owner; never a stranger
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
insert into public.lawyer_client_notes (client_id, author_user_id, firm_id, body, visibility)
values ('22222222-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','ffffffff-0000-0000-0000-0000000000f1','خاص','private');
insert into public.lawyer_client_notes (client_id, author_user_id, firm_id, body, visibility)
values ('22222222-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','ffffffff-0000-0000-0000-0000000000f1','للمكتب','firm');
select 'T11 C sees own notes (expect 2): ' || count(*) from public.lawyer_client_notes;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T11 O sees only the firm note (expect 1): ' || count(*) from public.lawyer_client_notes;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T11 B sees notes (expect 0): ' || count(*) from public.lawyer_client_notes;
-- a note on a card the author cannot read is refused
do $$ begin
  insert into public.lawyer_client_notes (client_id, author_user_id, body)
  values ('11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','تسلّل');
  raise notice 'T11 FAIL: B noted on A''s client';
exception when insufficient_privilege then
  raise notice 'T11 PASS: note on an unreadable card refused (42501)';
end $$;

-- T12 suspending C cuts C off immediately (membership arm), owner keeps access
reset role;
update public.firm_members set status = 'suspended' where user_id = 'cccccccc-0000-0000-0000-000000000003';
set role app_user;
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
select 'T12 suspended C still owns their own card (expect 1): ' || count(*) from public.lawyer_clients;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T12 O still sees the firm card after suspending C (expect 1): ' || count(*) from public.lawyer_clients where firm_id is not null;
select 'T12 O reads req-firm-1 after suspending C (expect 1): ' || count(*) from public.service_requests where id = 'req-firm-1';

-- verification footer queries
reset role;
select 'policies: ' || string_agg(tablename || '=' || cnt, ' · ' order by tablename)
  from (select tablename, count(*) as cnt from pg_policies
         where schemaname = 'public'
           and tablename in ('lawyer_clients','lawyer_client_notes','service_requests','consultations','cases','contracts')
         group by tablename) p;
select 'service_requests new columns (expect 2): ' || count(*) from information_schema.columns
 where table_schema = 'public' and table_name = 'service_requests' and column_name in ('firm_id','lawyer_client_id');
