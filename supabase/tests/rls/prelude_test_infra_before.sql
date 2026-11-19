-- Chain step (NOT a migration) for test_infra.test.sql — the world BEFORE
-- 20261129_90: two tables the stubs lack in the shape the purge cares about
-- (payments: a child of service_requests with NO owner column, so it can only
-- inherit a tag; research_items: the same for research_sessions), auth.users
-- with its e-mail column, and the accounts with rows that already exist when
-- the migration runs (the one-time tagging → batch 'legacy').
--
-- Actors: A a001 admin (listed in test_accounts — staff, never a test account)
--         L a002 test lawyer (listed)   C a003 test client (listed)
--         D a004 demo client (is_demo)  R a005 real lawyer   R2 a006 real client
\set ON_ERROR_STOP on

alter table auth.users add column if not exists email text;

create table if not exists public.payments (
  id text primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  status text not null default 'paid'
);
-- research_items exists in stubs.sql (session_id → research_sessions, cascade)

grant all on all tables in schema public to app_user, anon, authenticated, service_role;
grant all on all sequences in schema public to app_user, anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'admin@nezamy.example.sa'),
  ('00000000-0000-0000-0000-00000000a002', 'qa.lawyer@team.example.sa'),
  ('00000000-0000-0000-0000-00000000a003', 'qa.client@team.example.sa'),
  ('00000000-0000-0000-0000-00000000a004', 'demo.client@team.example.sa'),
  ('00000000-0000-0000-0000-00000000a005', 'real.lawyer@firm.example.sa'),
  ('00000000-0000-0000-0000-00000000a006', 'real.client@mail.example.sa');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000a001', 'admin',  'مسؤول'),
  ('00000000-0000-0000-0000-00000000a002', 'lawyer', 'محامٍ اختبار'),
  ('00000000-0000-0000-0000-00000000a003', 'client', 'عميل اختبار'),
  ('00000000-0000-0000-0000-00000000a004', 'client', 'عميل تجريبي'),
  ('00000000-0000-0000-0000-00000000a005', 'lawyer', 'محامٍ حقيقي'),
  ('00000000-0000-0000-0000-00000000a006', 'client', 'عميل حقيقي');
insert into public.test_accounts (user_id, source) values
  ('00000000-0000-0000-0000-00000000a001', 'seed-clean-test-accounts'),
  ('00000000-0000-0000-0000-00000000a002', 'manual'),
  ('00000000-0000-0000-0000-00000000a003', 'manual');
update public.profiles set is_demo = true where id = '00000000-0000-0000-0000-00000000a004';

-- rows that exist before the migration
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver) values
  ('c-old', '00000000-0000-0000-0000-00000000a003', 'قضية قديمة لحساب اختبار', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer'),
  ('r-old', '00000000-0000-0000-0000-00000000a006', 'قضية عميل حقيقي',          '00000000-0000-0000-0000-00000000a005', 'assigned', 'lawyer');
insert into public.payments (id, request_id, amount) values
  ('pay-c-old', 'c-old', 100),
  ('pay-r-old', 'r-old', 100);
insert into public.notifications (user_id, title) values
  ('00000000-0000-0000-0000-00000000a003', 'إشعار قديم لحساب اختبار'),
  ('00000000-0000-0000-0000-00000000a005', 'إشعار محامٍ حقيقي'),
  ('00000000-0000-0000-0000-00000000a001', 'إشعار المسؤول');
