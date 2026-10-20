-- prelude_wipe_subscriptions_fixture.sql — the accounts, subscriptions, library
-- grant and credit row that wipe_subscriptions.test.sql checks, plus a copy of
-- each table taken BEFORE the wipe runs. Listed BEFORE
-- supabase/one-time/2026-10-19_wipe_subscriptions_and_trials.sql and AFTER
-- 20261017_44 (public.test_accounts) in the chain of
-- wipe_subscriptions.test.sql (which documents the full command).
--
-- stubs.sql's auth.users has only `id`; the live table also has `email` and
-- `raw_user_meta_data` (where user_metadata.tier is stored), which the
-- one-time file reads and writes.
alter table auth.users add column if not exists email text;
alter table auth.users add column if not exists raw_user_meta_data jsonb;

-- Stands in for the user removing the dashes before the two `set local` lines
-- of block 2 and typing the deploy time: every later connection (each file of
-- the chain) starts confirmed. T5 of the test clears each setting in turn and
-- proves block 2 then raises and changes nothing.
-- The cutoff is a fixed past time: "old" rows below are created before it,
-- "new" rows after it (and still before now, so the future-cutoff guard passes).
alter database postgres set nzamy.confirm_wipe = 'WIPE-2026-10-19';
alter database postgres set nzamy.wipe_cutoff = '2026-09-01 00:00:00+03';

-- Accounts (all non-admin except E):
--   A d0a1 client  pro  — one old ACTIVE row (period end in the future) + the library grant
--   B d0b2 lawyer  pro  — one old TRIALING row (an invite trial, no period end)
--   C d0c3 client  pro  — one NEW active row (created after the cutoff)
--   D d0d4 lawyer  pro  — an old PAST_DUE row (period already ended) AND a new active row; credits
--   E d0e5 admin   max  — one old active row (cancelled; the metadata stays)
--   F d0f6 client  ai   — no live row, one row cancelled long ago (must not change)
--   G d0a7 client  —    — metadata without a tier key, no row (must not change)
--   H d0a8 client  —    — metadata NULL, one old EXPIRED row (must not change)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000d0a1', 'a@wipe.test', '{"tier":"pro","full_name":"أحمد"}'),
  ('00000000-0000-4000-8000-00000000d0b2', 'b@wipe.test', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d0c3', 'c@wipe.test', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d0d4', 'd@wipe.test', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d0e5', 'e@wipe.test', '{"tier":"max"}'),
  ('00000000-0000-4000-8000-00000000d0f6', 'f@wipe.test', '{"tier":"ai"}'),
  ('00000000-0000-4000-8000-00000000d0a7', 'g@wipe.test', '{"full_name":"زينب"}'),
  ('00000000-0000-4000-8000-00000000d0a8', 'h@wipe.test', null);
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-4000-8000-00000000d0a1', 'client', 'A'),
  ('00000000-0000-4000-8000-00000000d0b2', 'lawyer', 'B'),
  ('00000000-0000-4000-8000-00000000d0c3', 'client', 'C'),
  ('00000000-0000-4000-8000-00000000d0d4', 'lawyer', 'D'),
  ('00000000-0000-4000-8000-00000000d0e5', 'admin',  'E'),
  ('00000000-0000-4000-8000-00000000d0f6', 'client', 'F'),
  ('00000000-0000-4000-8000-00000000d0a7', 'client', 'G'),
  ('00000000-0000-4000-8000-00000000d0a8', 'client', 'H');

-- Plans come from 20260603_phase1_003's seed (individual-*, lawyer-*).
insert into public.subscriptions
  (id, user_id, plan_id, tier, billing_cycle, status, auto_renew,
   started_at, current_period_start, current_period_end, cancelled_at, created_at, updated_at, metadata)
values
  ('00000000-0000-4000-8000-0000000051a1', '00000000-0000-4000-8000-00000000d0a1', 'individual-pro', 'pro', 'custom', 'active', true,
   '2026-08-01 10:00+03', '2026-08-01 10:00+03', '2099-01-01 00:00+03', null, '2026-08-01 10:00+03', '2026-08-01 10:00+03',
   '{"method":"admin_grant","granted_by":null}'),
  ('00000000-0000-4000-8000-0000000051b2', '00000000-0000-4000-8000-00000000d0b2', 'lawyer-pro', 'pro', 'custom', 'trialing', false,
   '2026-08-15 10:00+03', '2026-08-15 10:00+03', null, null, '2026-08-15 10:00+03', '2026-08-15 10:00+03',
   '{"method":"invite_trial"}'),
  ('00000000-0000-4000-8000-0000000051c3', '00000000-0000-4000-8000-00000000d0c3', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-09-15 10:00+03', '2026-09-15 10:00+03', '2099-01-01 00:00+03', null, '2026-09-15 10:00+03', '2026-09-15 10:00+03',
   '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000051d4', '00000000-0000-4000-8000-00000000d0d4', 'lawyer-pro', 'pro', 'monthly', 'past_due', true,
   '2026-07-01 10:00+03', '2026-07-01 10:00+03', '2026-07-31 10:00+03', null, '2026-07-01 10:00+03', '2026-07-01 10:00+03',
   '{"method":"admin_assignment"}'),
  ('00000000-0000-4000-8000-0000000052d4', '00000000-0000-4000-8000-00000000d0d4', 'lawyer-pro', 'pro', 'custom', 'active', false,
   '2026-09-20 10:00+03', '2026-09-20 10:00+03', '2099-01-01 00:00+03', null, '2026-09-20 10:00+03', '2026-09-20 10:00+03',
   '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000051e5', '00000000-0000-4000-8000-00000000d0e5', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-08-01 10:00+03', '2026-08-01 10:00+03', '2099-01-01 00:00+03', null, '2026-08-01 10:00+03', '2026-08-01 10:00+03',
   '{"method":"admin_assignment"}'),
  ('00000000-0000-4000-8000-0000000051f6', '00000000-0000-4000-8000-00000000d0f6', 'individual-ai', 'ai', 'custom', 'cancelled', false,
   '2026-07-01 10:00+03', '2026-07-01 10:00+03', '2026-08-10 10:00+03', '2026-08-10 10:00+03', '2026-07-01 10:00+03', '2026-08-10 10:00+03',
   '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000051a8', '00000000-0000-4000-8000-00000000d0a8', 'individual-ai', 'ai', 'custom', 'expired', false,
   '2026-06-01 10:00+03', '2026-06-01 10:00+03', '2026-07-01 10:00+03', null, '2026-06-01 10:00+03', '2026-07-01 10:00+03',
   '{}');

-- public.entitlement_requests — the live shape (20260706_entitlement_requests.sql
-- without its policies; columns and CHECKs as in the 2026-10-10 schema dump).
create table if not exists public.entitlement_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('plan','credits','wallet','library','media')),
  requested_ref text,
  amount        numeric,
  note          text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- SPARED or not — accounts an admin acted on (or seemed to) after the cutoff:
--   J d1a1 client pro — old active row + a PLAN request approved AFTER the cutoff
--                        (approved while already entitled: no new row)   → spared
--   K d1a2 lawyer pro — old active row + a MEDIA request approved AFTER the cutoff → spared
--   L d1a3 client pro — old active row whose updated_at is AFTER the cutoff
--                        (the admin's «تغيير الخطة» edits the row in place) → spared
--   M d1a4 client pro — old active row + a PLAN request approved BEFORE the cutoff → wiped
--   N d1a5 client pro — old active row + a LIBRARY request approved after the cutoff,
--                        a PLAN request REJECTED after it, a PLAN request pending → wiped
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000d1a1', 'j@wipe.test', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d1a2', 'k@wipe.test', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d1a3', 'l@wipe.test', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d1a4', 'm@wipe.test', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d1a5', 'n@wipe.test', '{"tier":"pro"}');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-4000-8000-00000000d1a1', 'client', 'J'),
  ('00000000-0000-4000-8000-00000000d1a2', 'lawyer', 'K'),
  ('00000000-0000-4000-8000-00000000d1a3', 'client', 'L'),
  ('00000000-0000-4000-8000-00000000d1a4', 'client', 'M'),
  ('00000000-0000-4000-8000-00000000d1a5', 'client', 'N');
insert into public.subscriptions
  (id, user_id, plan_id, tier, billing_cycle, status, auto_renew,
   started_at, current_period_start, current_period_end, created_at, updated_at, metadata)
values
  ('00000000-0000-4000-8000-0000000054a1', '00000000-0000-4000-8000-00000000d1a1', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-08-05 10:00+03', '2026-08-05 10:00+03', '2099-01-01 00:00+03', '2026-08-05 10:00+03', '2026-08-05 10:00+03', '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000054a2', '00000000-0000-4000-8000-00000000d1a2', 'lawyer-pro', 'pro', 'custom', 'active', false,
   '2026-08-05 10:00+03', '2026-08-05 10:00+03', '2099-01-01 00:00+03', '2026-08-05 10:00+03', '2026-08-05 10:00+03', '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000054a3', '00000000-0000-4000-8000-00000000d1a3', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-08-05 10:00+03', '2026-08-05 10:00+03', '2099-01-01 00:00+03', '2026-08-05 10:00+03', '2026-09-05 10:00+03', '{"method":"admin_assignment"}'),
  ('00000000-0000-4000-8000-0000000054a4', '00000000-0000-4000-8000-00000000d1a4', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-08-05 10:00+03', '2026-08-05 10:00+03', '2099-01-01 00:00+03', '2026-08-05 10:00+03', '2026-08-05 10:00+03', '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000054a5', '00000000-0000-4000-8000-00000000d1a5', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-08-05 10:00+03', '2026-08-05 10:00+03', '2099-01-01 00:00+03', '2026-08-05 10:00+03', '2026-08-05 10:00+03', '{"method":"admin_grant"}');
insert into public.entitlement_requests (user_id, kind, requested_ref, status, decided_by, decided_at, created_at) values
  ('00000000-0000-4000-8000-00000000d1a1', 'plan',    'pro',     'approved', '00000000-0000-4000-8000-00000000d0e5', '2026-09-10 10:00+03', '2026-09-09 10:00+03'),
  ('00000000-0000-4000-8000-00000000d1a2', 'media',   'media',   'approved', '00000000-0000-4000-8000-00000000d0e5', '2026-09-12 10:00+03', '2026-09-11 10:00+03'),
  ('00000000-0000-4000-8000-00000000d1a4', 'plan',    'pro',     'approved', '00000000-0000-4000-8000-00000000d0e5', '2026-08-20 10:00+03', '2026-08-19 10:00+03'),
  ('00000000-0000-4000-8000-00000000d1a5', 'library', 'library', 'approved', '00000000-0000-4000-8000-00000000d0e5', '2026-09-10 10:00+03', '2026-09-09 10:00+03'),
  ('00000000-0000-4000-8000-00000000d1a5', 'plan',    'pro',     'rejected', '00000000-0000-4000-8000-00000000d0e5', '2026-09-11 10:00+03', '2026-09-09 10:00+03'),
  ('00000000-0000-4000-8000-00000000d1a5', 'plan',    'max',     'pending',  null,                                   null,                  '2026-09-12 10:00+03');

-- TEST ACCOUNTS (owner ٢٢٤: «مع الإبقاء الإلزامي على الحسابات التجريبية»),
-- registered in public.test_accounts (20261017_44, loaded before this file):
--   P d2a1 client pro — an old ACTIVE row (created and changed before the
--                        cutoff, no request) → only the test-account rule
--                        keeps it: the row stays live, the tier stays pro
--   Q d2a2 lawyer pro — NO live row (one row cancelled long ago) → an ordinary
--                        account would be reset to free; Q keeps pro
-- The ordinary accounts with an old live row (A, B, M, N) are the control.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000d2a1', 'client-pro@nezamy.sa', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d2a2', 'qa-wipe@nzamy.test',   '{"tier":"pro","full_name":"اختبار"}');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-4000-8000-00000000d2a1', 'client', 'P'),
  ('00000000-0000-4000-8000-00000000d2a2', 'lawyer', 'Q');
insert into public.subscriptions
  (id, user_id, plan_id, tier, billing_cycle, status, auto_renew,
   started_at, current_period_start, current_period_end, cancelled_at, created_at, updated_at, metadata)
values
  ('00000000-0000-4000-8000-0000000055a1', '00000000-0000-4000-8000-00000000d2a1', 'individual-pro', 'pro', 'custom', 'active', true,
   '2026-08-01 10:00+03', '2026-08-01 10:00+03', '2099-01-01 00:00+03', null, '2026-08-01 10:00+03', '2026-08-01 10:00+03',
   '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000055a2', '00000000-0000-4000-8000-00000000d2a2', 'lawyer-pro', 'pro', 'custom', 'cancelled', false,
   '2026-07-01 10:00+03', '2026-07-01 10:00+03', '2026-08-01 10:00+03', '2026-08-01 10:00+03', '2026-07-01 10:00+03', '2026-08-01 10:00+03',
   '{"method":"admin_grant"}');
insert into public.test_accounts (user_id, source) values
  ('00000000-0000-4000-8000-00000000d2a1', 'seed-clean-test-accounts'),
  ('00000000-0000-4000-8000-00000000d2a2', 'uat');

-- TEST ACCOUNTS NOT IN THE REGISTRY (created after 20261017_44's one-time
-- backfill — the UAT kit never registers its accounts). The wipe spares them by
-- the backfill's own e-mail patterns:
--   R d2a3 client pro — 'QA-Unreg@NZAMY.test' (case differs) + an old ACTIVE row → spared
--   S d2a4 client pro — 'corp-owner@nezamy.sa' (the role list) + an old ACTIVE row → spared
--   T d2a5 lawyer pro — 'lawyer11@nezamy.sa' (NOT one of lawyer1..10) + an old ACTIVE row → wiped
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000d2a3', 'QA-Unreg@NZAMY.test',  '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d2a4', 'corp-owner@nezamy.sa', '{"tier":"pro"}'),
  ('00000000-0000-4000-8000-00000000d2a5', 'lawyer11@nezamy.sa',   '{"tier":"pro"}');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-4000-8000-00000000d2a3', 'client', 'R'),
  ('00000000-0000-4000-8000-00000000d2a4', 'client', 'S'),
  ('00000000-0000-4000-8000-00000000d2a5', 'lawyer', 'T');
insert into public.subscriptions
  (id, user_id, plan_id, tier, billing_cycle, status, auto_renew,
   started_at, current_period_start, current_period_end, created_at, updated_at, metadata)
values
  ('00000000-0000-4000-8000-0000000055a3', '00000000-0000-4000-8000-00000000d2a3', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-08-01 10:00+03', '2026-08-01 10:00+03', '2099-01-01 00:00+03', '2026-08-01 10:00+03', '2026-08-01 10:00+03', '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000055a4', '00000000-0000-4000-8000-00000000d2a4', 'individual-pro', 'pro', 'custom', 'active', false,
   '2026-08-01 10:00+03', '2026-08-01 10:00+03', '2099-01-01 00:00+03', '2026-08-01 10:00+03', '2026-08-01 10:00+03', '{"method":"admin_grant"}'),
  ('00000000-0000-4000-8000-0000000055a5', '00000000-0000-4000-8000-00000000d2a5', 'lawyer-pro', 'pro', 'custom', 'active', false,
   '2026-08-01 10:00+03', '2026-08-01 10:00+03', '2099-01-01 00:00+03', '2026-08-01 10:00+03', '2026-08-01 10:00+03', '{"method":"admin_grant"}');

-- A new-model library grant (20261019_10) for A — the file never touches it.
insert into public.library_access_grants (id, user_id, plan_ref, source, starts_at, ends_at, granted_by, created_at)
values ('00000000-0000-4000-8000-000000006a01', '00000000-0000-4000-8000-00000000d0a1', 'lib-founder', 'founder_campaign',
        '2026-08-02 10:00+03', '2099-01-01 00:00+03', null, '2026-08-02 10:00+03');

-- A credit row for D — credits stay as they are (owner ٢٢٤: points balances stay).
insert into public.credit_transactions (user_id, amount, kind, balance_after, description)
values ('00000000-0000-4000-8000-00000000d0d4', 500, 'admin_adjustment', 500, 'wipe fixture');

-- Copies taken before the wipe, and the time the fixture finished.
create table public.wipe204_subs_before    as select * from public.subscriptions;
create table public.wipe204_users_before   as select id, raw_user_meta_data from auth.users;
create table public.wipe204_grants_before  as select * from public.library_access_grants;
create table public.wipe204_credits_before as select * from public.credit_transactions;
create table public.wipe204_requests_before as select * from public.entitlement_requests;
create table public.wipe204_tests_before    as select * from public.test_accounts;
create table public.wipe204_t0 as select clock_timestamp() as t0;
