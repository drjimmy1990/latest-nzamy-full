-- accounts_firms_owner_answers.test.sql — proves 20261030_12 (owner answers
-- ٣٠٧–٣١٣, package 2026-10-30) on top of 20261026_70 (D6).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261030_12
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql $M/20260904_phase5_deadline_radar.sql \
--     $M/20261019_21_consultant_court_write_guard.sql $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql $M/20261017_41_notes_visibility_case_team.sql $T/prelude_attachments_live.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql $M/20261025_31_dashboard_notes.sql \
--     $M/20261025_32_case_tracking_links.sql $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql \
--     $M/20260706_entitlement_requests.sql $T/prelude_storage_objects_stub.sql \
--     $M/20261026_70_account_deletion.sql $M/20261026_70_account_deletion.sql \
--     supabase/storage_policies_documents.sql \
--     $T/prelude_accounts_firms_before.sql \
--     $M/20261030_12_accounts_firms_owner_answers.sql $M/20261030_12_accounts_firms_owner_answers.sql \
--     $T/accounts_firms_owner_answers.test.sql
-- (the same chain as account_deletion.test.sql, plus the prelude and 20261030_12)
--
-- NEGATIVE CONTROLS (each must FAIL; recorded in the ledger
-- docs/audits/2026-10-30-owner-package-accounts-firms.md):
--   1. the chain WITHOUT the two 20261030_12 lines → the first assertion that
--      reads original_author_id fails (T1: column missing).
--   2. the chain with 20261030_12 and then 20261026_70 run AGAIN after it
--      (its own specs and removal trigger back) → "T3 FAIL: a service-role
--      removal moved R2's hearing to the consultant owner".
--
-- People (prelude): O2 firm owner (firm account) · L2 member removed BEFORE
-- this file · S2 secretary · L3 member removed in T2 · C2 client/buyer ·
-- Q2 consulting-office owner (lawyer_profiles.practice_kind consultant) · R2
-- lawyer in Q2's office · B2 company owner · BM member of B2's legal team.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login;
  end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant select, delete on auth.users to supabase_auth_admin;

-- ── T1 ٣٠٨ backfill: a note already moved names its real author; nothing else moved ──
do $$
declare r record;
begin
  select * into r from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000001';
  if r.author_user_id <> 'c3000000-0000-0000-0000-000000000001' then raise exception 'T1 FAIL: the note is not O2''s'; end if;
  if r.original_author_id is distinct from 'c3000000-0000-0000-0000-000000000002' then
    raise exception 'T1 FAIL: the moved private note names % as its author, expected L2', r.original_author_id;
  end if;
  if r.visibility <> 'private' then raise exception 'T1 FAIL: the moved note is no longer private'; end if;
  if r.updated_at <> '2026-01-01'::timestamptz then
    raise exception 'T1 FAIL: the backfill moved «آخر تعديل» to %', r.updated_at;
  end if;
  if (select original_author_id from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000003')
     is distinct from 'c3000000-0000-0000-0000-000000000001' then
    raise exception 'T1 FAIL: O2''s own note does not name O2';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.case_notes'::regclass and attname = 'original_author_id' and not attnotnull) then
    raise exception 'T1 FAIL: original_author_id is nullable';
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.case_notes'::regclass and contype = 'f'
              and conkey = array[(select attnum from pg_attribute where attrelid = 'public.case_notes'::regclass and attname = 'original_author_id')]) then
    raise exception 'T1 FAIL: original_author_id has a foreign key — it would not outlive the author';
  end if;
  raise notice 'T1 PASS: the already-moved private note stays private, is O2''s, names L2 as its author, and its edit date did not move; O2''s own note names O2; NOT NULL, no FK';
end $$;

-- ── T1b the firm owner reads it as his own private note; nobody forges or rewrites the author ──
set role authenticated;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000001', false);
do $$
declare o uuid; n int;
begin
  select original_author_id into o from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000001';
  if o is distinct from 'c3000000-0000-0000-0000-000000000002' then raise exception 'T1b FAIL: O2 cannot read the moved note or its author'; end if;
  -- the session holds UPDATE on (body, visibility, firm_id) only (20261025_51)
  begin
    update public.case_notes set original_author_id = 'c3000000-0000-0000-0000-000000000001'
     where id = 'c3b00000-0000-0000-0000-000000000001';
    raise exception 'T1b FAIL: a session may write original_author_id';
  exception when insufficient_privilege then null;
  end;
  update public.case_notes set body = 'ملاحظة L2 الخاصة (عدّلها O2)'
   where id = 'c3b00000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1b FAIL: O2 cannot edit his inherited private note'; end if;
  if (select original_author_id from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000001')
     is distinct from 'c3000000-0000-0000-0000-000000000002' then
    raise exception 'T1b FAIL: a session rewrote the original author';
  end if;
  insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body, original_author_id)
  values ('c3b00000-0000-0000-0000-0000000000a1', 'case-l2', 'c3000000-0000-0000-0000-000000000001',
          'c3f00000-0000-0000-0000-0000000000f2', 'private', 'جديدة', 'c3000000-0000-0000-0000-000000000004');
  if (select original_author_id from public.case_notes where id = 'c3b00000-0000-0000-0000-0000000000a1')
     is distinct from 'c3000000-0000-0000-0000-000000000001' then
    raise exception 'T1b FAIL: an insert chose its own original author';
  end if;
end $$;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000003', false);
do $$
begin
  if exists (select 1 from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000001') then
    raise exception 'T1b FAIL: S2 (an active colleague) reads the owner''s private note';
  end if;
  raise notice 'T1b PASS: O2 reads and edits the inherited private note, the author stays L2; a session cannot write the column, an insert cannot choose the author; a colleague cannot read it';
end $$;
reset role;
-- even the service role (which may write every column) cannot rewrite it
set role service_role;
update public.case_notes set original_author_id = 'c3000000-0000-0000-0000-000000000004'
 where id = 'c3b00000-0000-0000-0000-000000000001';
reset role;
do $$
begin
  if (select original_author_id from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000001')
     is distinct from 'c3000000-0000-0000-0000-000000000002' then
    raise exception 'T1c FAIL: the service role rewrote the original author';
  end if;
  raise notice 'T1c PASS: the original author never changes, whoever writes';
end $$;

-- ── T2 ٣٠٨ a removal after this file: the private note moves, still private, author kept, even after his purge ──
insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body) values
  ('c3b00000-0000-0000-0000-000000000009', 'case-l2', 'c3000000-0000-0000-0000-000000000009',
   'c3f00000-0000-0000-0000-0000000000f2', 'private', 'ملاحظة L3 الخاصة بي فقط');
insert into public.dashboard_notes (id, author_user_id, firm_id, case_request_id, body, visibility) values
  ('c3d00000-0000-0000-0000-000000000009', 'c3000000-0000-0000-0000-000000000009',
   'c3f00000-0000-0000-0000-0000000000f2', 'case-l2', 'تذكير L3 على قضية المكتب', 'private');
set role authenticated;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000001', false);
update public.firm_members set status = 'removed'
 where firm_id = 'c3f00000-0000-0000-0000-0000000000f2' and user_id = 'c3000000-0000-0000-0000-000000000009';
reset role;
set session authorization supabase_auth_admin;
delete from auth.users where id = 'c3000000-0000-0000-0000-000000000009';
reset session authorization;
do $$
declare r record; d record;
begin
  select * into r from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000009';
  if not found then raise exception 'T2 FAIL: L3''s private note on the firm case went with his account'; end if;
  if r.author_user_id <> 'c3000000-0000-0000-0000-000000000001' or r.visibility <> 'private'
     or r.original_author_id is distinct from 'c3000000-0000-0000-0000-000000000009' then
    raise exception 'T2 FAIL: note is author %, %, original % — expected O2, private, L3', r.author_user_id, r.visibility, r.original_author_id;
  end if;
  select * into d from public.dashboard_notes where id = 'c3d00000-0000-0000-0000-000000000009';
  if not found or d.original_author_id is distinct from 'c3000000-0000-0000-0000-000000000009' then
    raise exception 'T2 FAIL: the dashboard note on the firm case lost its author';
  end if;
  raise notice 'T2 PASS: L3 removed then purged — his private case note and dashboard note are O2''s, still private, and name L3';
end $$;

-- ── T3 ٣١٢ consulting office: a removal (even by the service role) keeps the court rows with the lawyer ──
insert into public.lawyer_profiles (user_id, practice_kind) values ('c3000000-0000-0000-0000-000000000005', 'consultant');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('c3f00000-0000-0000-0000-0000000000f3', 'c3000000-0000-0000-0000-000000000005', 'مكتب Q2 الاستشاري');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('c3f00000-0000-0000-0000-0000000000f3', 'c3000000-0000-0000-0000-000000000006', 'lawyer', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-r2', 'c3000000-0000-0000-0000-000000000006', 'c3000000-0000-0000-0000-000000000006', 'قضية R2', 'c3f00000-0000-0000-0000-0000000000f3');
insert into public.hearings (id, case_request_id, firm_id, owner_user_id, kind, title, hearing_date) values
  ('c3e00000-0000-0000-0000-000000000001', 'case-r2', 'c3f00000-0000-0000-0000-0000000000f3', 'c3000000-0000-0000-0000-000000000006', 'judicial',    'جلسة R2', current_date + 5),
  ('c3e00000-0000-0000-0000-000000000002', 'case-r2', 'c3f00000-0000-0000-0000-0000000000f3', 'c3000000-0000-0000-0000-000000000006', 'appointment', 'موعد R2', current_date + 2);
insert into public.case_stages (id, case_request_id, firm_id, owner_user_id) values
  ('c3e00000-0000-0000-0000-000000000003', 'case-r2', 'c3f00000-0000-0000-0000-0000000000f3', 'c3000000-0000-0000-0000-000000000006');
insert into public.deadlines (id, owner_user_id, firm_id, case_request_id, title, kind, trigger_date, due_date) values
  ('c3e00000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000006', 'c3f00000-0000-0000-0000-0000000000f3', 'case-r2', 'مهلة الاعتراض', 'statutory', current_date, current_date + 30),
  ('c3e00000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000006', 'c3f00000-0000-0000-0000-0000000000f3', 'case-r2', 'التزام تعاقدي', 'contract',  current_date, current_date + 10);
insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body) values
  ('c3b00000-0000-0000-0000-000000000006', 'case-r2', 'c3000000-0000-0000-0000-000000000006', 'c3f00000-0000-0000-0000-0000000000f3', 'firm', 'مذكرة R2');

-- the removal written by the service role (an admin tool, a script): the Art. 18 guard lets it through
set role service_role;
update public.firm_members set status = 'removed'
 where firm_id = 'c3f00000-0000-0000-0000-0000000000f3' and user_id = 'c3000000-0000-0000-0000-000000000006';
reset role;
do $$
begin
  if exists (select 1 from public.hearings where case_request_id = 'case-r2' and owner_user_id <> 'c3000000-0000-0000-0000-000000000006') then
    raise exception 'T3 FAIL: a service-role removal moved R2''s hearing to the consultant owner';
  end if;
  if (select owner_user_id from public.case_stages where id = 'c3e00000-0000-0000-0000-000000000003') <> 'c3000000-0000-0000-0000-000000000006' then
    raise exception 'T3 FAIL: the case stage left R2';
  end if;
  if (select owner_user_id from public.deadlines where id = 'c3e00000-0000-0000-0000-000000000004') <> 'c3000000-0000-0000-0000-000000000006' then
    raise exception 'T3 FAIL: the court deadline left R2';
  end if;
  if (select owner_user_id from public.deadlines where id = 'c3e00000-0000-0000-0000-000000000005') <> 'c3000000-0000-0000-0000-000000000005' then
    raise exception 'T3 FAIL: the contract obligation did not move to the office owner';
  end if;
  if (select author_user_id from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000006') <> 'c3000000-0000-0000-0000-000000000005' then
    raise exception 'T3 FAIL: the note did not move to the office owner';
  end if;
  if (select assigned_to from public.service_requests where id = 'case-r2') <> 'c3000000-0000-0000-0000-000000000005' then
    raise exception 'T3 FAIL: the case lead did not move to the office owner';
  end if;
  if current_setting('nzamy.firm_transfer_reason', true) not in ('') then
    raise exception 'T3 FAIL: the removal left its marker set (%)', current_setting('nzamy.firm_transfer_reason', true);
  end if;
  raise notice 'T3 PASS: consulting office — the removal keeps the hearing, the appointment, the stage and the court deadline in R2''s name; the contract date, the note and the case lead move to Q2';
end $$;
set role authenticated;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000006', false);
do $$
declare n int;
begin
  select count(*) into n from public.hearings where case_request_id = 'case-r2';
  if n <> 2 then raise exception 'T3b FAIL: the departed lawyer sees % of his 2 hearings / appointments', n; end if;
  raise notice 'T3b PASS: the departed lawyer still sees his hearing and appointment';
end $$;
reset role;

-- ── T3c ٣١٢ his account is deleted: they pass to the owner, to view and keep, not to plead ──
set role service_role;
do $$
declare r jsonb;
begin
  r := public.account_purge_prepare('c3000000-0000-0000-0000-000000000006');
  if not (r->>'ok')::boolean then raise exception 'T3c FAIL: prepare blocked R2: %', r; end if;
end $$;
reset role;
set session authorization supabase_auth_admin;
delete from auth.users where id = 'c3000000-0000-0000-0000-000000000006';
reset session authorization;
do $$
begin
  if (select count(*) from public.hearings where case_request_id = 'case-r2' and owner_user_id = 'c3000000-0000-0000-0000-000000000005') <> 2 then
    raise exception 'T3c FAIL: after R2''s deletion his hearings are not the office owner''s';
  end if;
  if (select owner_user_id from public.deadlines where id = 'c3e00000-0000-0000-0000-000000000004') <> 'c3000000-0000-0000-0000-000000000005' then
    raise exception 'T3c FAIL: the court deadline was not kept for the office owner';
  end if;
  if (select owner_user_id from public.case_stages where id = 'c3e00000-0000-0000-0000-000000000003') is distinct from 'c3000000-0000-0000-0000-000000000005' then
    raise exception 'T3c FAIL: the case stage was not kept for the office owner';
  end if;
end $$;
set role authenticated;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000005', false);
do $$
declare n int;
begin
  select count(*) into n from public.hearings where case_request_id = 'case-r2';
  if n <> 2 then raise exception 'T3c FAIL: the office owner cannot view the kept hearings (% of 2)', n; end if;
  begin
    update public.hearings set title = 'تمثيل' where id = 'c3e00000-0000-0000-0000-000000000001';
    raise exception 'T3c FAIL: the consultant owner edited a kept hearing (representation)';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3c PASS: R2 deleted — his hearing, appointment, stage and court deadline are the consultant owner''s to view and keep; the Art. 18 guard refuses him editing them';
end $$;
reset role;

-- ── T3d an ordinary (advocate) firm is unchanged: a service-role removal moves the hearing ──
insert into auth.users (id) values ('c3000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, user_type, display_name) values ('c3000000-0000-0000-0000-00000000000a', 'lawyer', 'L4');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('c3f00000-0000-0000-0000-0000000000f2', 'c3000000-0000-0000-0000-00000000000a', 'lawyer', 'active', now());
insert into public.hearings (id, case_request_id, firm_id, owner_user_id, kind, title, hearing_date) values
  ('c3e00000-0000-0000-0000-00000000000a', 'case-l2', 'c3f00000-0000-0000-0000-0000000000f2', 'c3000000-0000-0000-0000-00000000000a', 'judicial', 'جلسة L4', current_date + 4);
set role service_role;
update public.firm_members set status = 'removed'
 where firm_id = 'c3f00000-0000-0000-0000-0000000000f2' and user_id = 'c3000000-0000-0000-0000-00000000000a';
reset role;
do $$
begin
  if (select owner_user_id from public.hearings where id = 'c3e00000-0000-0000-0000-00000000000a') <> 'c3000000-0000-0000-0000-000000000001' then
    raise exception 'T3d FAIL: an ordinary firm''s removal no longer moves the hearing to its owner';
  end if;
  raise notice 'T3d PASS: in an advocate firm a removal still moves the hearing to the firm owner';
end $$;

-- ── T4 ٣٠٧ the caller learns his own block; nobody asks for another's ────────
create temp table _t4 (who text, block text);
grant all on _t4 to authenticated;
set role authenticated;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000001', false);
insert into _t4 select 'O2', public.account_deletion_owner_block();
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000004', false);
insert into _t4 select 'C2', public.account_deletion_owner_block();
do $$
begin
  begin
    perform public.account_entity_owner_block('c3000000-0000-0000-0000-000000000001');
    raise exception 'T4 FAIL: a session asked another account''s block';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role anon;
do $$
begin
  begin
    perform public.account_deletion_owner_block();
    raise exception 'T4 FAIL: anon may call account_deletion_owner_block';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  if (select block from _t4 where who = 'O2') is distinct from 'firm' then
    raise exception 'T4 FAIL: the firm owner with members is told %', (select block from _t4 where who = 'O2');
  end if;
  if (select block from _t4 where who = 'C2') is not null then
    raise exception 'T4 FAIL: a client is told he owns an entity';
  end if;
  raise notice 'T4 PASS: O2 (a firm with members) is told «firm», a client nothing; no session can ask about someone else, anon cannot ask at all';
end $$;

-- ── T5 ٣١١ a company legal-team member is an independent account ────────────
insert into public.business_profiles (id, owner_user_id, name_ar) values
  ('c3a00000-0000-0000-0000-0000000000b2', 'c3000000-0000-0000-0000-000000000007', 'شركة B2');
insert into public.business_members (business_id, user_id, status) values
  ('c3a00000-0000-0000-0000-0000000000b2', 'c3000000-0000-0000-0000-000000000008', 'active');
insert into public.service_requests (id, requester_user_id, assigned_to, title) values
  ('case-bm', 'c3000000-0000-0000-0000-000000000008', 'c3000000-0000-0000-0000-000000000008', 'ملف BM');
insert into public.case_notes (id, request_id, author_user_id, visibility, body) values
  ('c3b00000-0000-0000-0000-000000000008', 'case-bm', 'c3000000-0000-0000-0000-000000000008', 'private', 'ملاحظة BM');
set role authenticated;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000007', false);
do $$
begin
  if public.account_deletion_owner_block() is distinct from 'business' then
    raise exception 'T5 FAIL: the company owner with a team is not told «business»';
  end if;
  begin
    perform public.request_account_deletion(null);
    raise exception 'T5 FAIL: the company owner with a team froze his account';
  exception when sqlstate '55000' then null;
  end;
end $$;
reset role;
set session authorization supabase_auth_admin;
delete from auth.users where id = 'c3000000-0000-0000-0000-000000000008';
reset session authorization;
do $$
begin
  if exists (select 1 from public.firm_asset_transfers where from_user_id = 'c3000000-0000-0000-0000-000000000008') then
    raise exception 'T5 FAIL: something of the company member was transferred';
  end if;
  if exists (select 1 from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000008') then
    raise exception 'T5 FAIL: the company member''s personal note survived his account';
  end if;
  if not exists (select 1 from public.business_profiles where id = 'c3a00000-0000-0000-0000-0000000000b2') then
    raise exception 'T5 FAIL: the company went with its member';
  end if;
  raise notice 'T5 PASS: the company owner with a team is refused (٣٠٧); the team member''s deletion transfers nothing — an independent account (٣١١)';
end $$;

-- ── T6 ٣١٠ a tax invoice is never deleted and keeps its buyer ───────────────
update public.profiles set national_address = 'الرياض، حي العليا، ٢٢٣٣' where id = 'c3000000-0000-0000-0000-000000000004';
update auth.users set email = 'c2@auth.example.test' where id = 'c3000000-0000-0000-0000-000000000004';
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, receipt_number, paid_at, live) values
  ('c3c00000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004', 'plan', 'client-pro', 'monthly', 10000, 1500, 11500, 'exclusive', 'paid',     'NZ-T-000001', now(), true),
  ('c3c00000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000004', 'plan', 'client-pro', 'monthly', 10000, 1500, 11500, 'exclusive', 'refunded', 'NZ-T-000002', now(), null),
  ('c3c00000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000004', 'plan', 'client-pro', 'monthly', 10000, 1500, 11500, 'exclusive', 'created',  null, null, true),
  ('c3c00000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000004', 'plan', 'client-pro', 'monthly', 10000, 1500, 11500, 'exclusive', 'paid',     null, now(), false);
set role service_role;
do $$
begin
  begin
    delete from public.payment_orders where id = 'c3c00000-0000-0000-0000-000000000001';
    raise exception 'T6 FAIL: a paid live invoice was deleted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.payment_orders where id = 'c3c00000-0000-0000-0000-000000000002';
    raise exception 'T6 FAIL: a refunded invoice was deleted';
  exception when insufficient_privilege then null;
  end;
  delete from public.payment_orders where id in ('c3c00000-0000-0000-0000-000000000003', 'c3c00000-0000-0000-0000-000000000004');
  if (select count(*) from public.payment_orders where id in ('c3c00000-0000-0000-0000-000000000003', 'c3c00000-0000-0000-0000-000000000004')) <> 0 then
    raise exception 'T6 FAIL: an unpaid / test-mode order could not be deleted';
  end if;
end $$;
reset role;
set session authorization supabase_auth_admin;
delete from auth.users where id = 'c3000000-0000-0000-0000-000000000004';
reset session authorization;
set role service_role;
update public.payment_orders set metadata = '{"refund_job": {"state": "done"}}'::jsonb
 where id = 'c3c00000-0000-0000-0000-000000000001';
reset role;
do $$
declare m jsonb; u uuid;
begin
  select metadata, user_id into m, u from public.payment_orders where id = 'c3c00000-0000-0000-0000-000000000001';
  if not found then raise exception 'T6 FAIL: the buyer''s deletion took the invoice'; end if;
  if u is not null then raise exception 'T6 FAIL: the invoice still points at the deleted account'; end if;
  if m->'buyer_snapshot'->>'email' <> 'c2@auth.example.test' then raise exception 'T6 FAIL: the snapshot lost the buyer: %', m; end if;
  if m->'buyer_snapshot'->>'national_address' is distinct from 'الرياض، حي العليا، ٢٢٣٣' then
    raise exception 'T6 FAIL: the snapshot has no national address: %', m;
  end if;
  if m->'refund_job'->>'state' <> 'done' then raise exception 'T6 FAIL: the later write itself was lost: %', m; end if;
  if (select metadata->'buyer_snapshot'->>'display_name' from public.payment_orders where id = 'c3c00000-0000-0000-0000-000000000002') <> 'C2 موكل' then
    raise exception 'T6 FAIL: the refunded invoice has no buyer';
  end if;
  raise notice 'T6 PASS: paid and refunded invoices cannot be deleted (unpaid and test-mode can); the buyer''s deletion keeps them with name, email and national address; a later wholesale metadata write keeps the snapshot';
end $$;

-- ── T7 ٣١٣ an admin freeze is the administration's to lift (re-proved) ──────
set role service_role;
select public.account_deletion_request_for('c3000000-0000-0000-0000-000000000003', null, 'admin') is not null;
reset role;
set role authenticated;
select set_config('test.uid', 'c3000000-0000-0000-0000-000000000003', false);
do $$
begin
  if public.cancel_account_deletion() then raise exception 'T7 FAIL: the user lifted an admin freeze'; end if;
end $$;
reset role;
set role service_role;
do $$
begin
  if not public.account_deletion_cancel_for('c3000000-0000-0000-0000-000000000003', null) then
    raise exception 'T7 FAIL: an admin could not lift it';
  end if;
  raise notice 'T7 PASS: the user cannot lift an admin freeze; an admin can';
end $$;
reset role;

-- ── T8 nothing left switched off ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
              where c.relname in ('case_notes', 'dashboard_notes', 'lawyer_client_notes', 'consultation_notes')
                and not t.tgisinternal and t.tgenabled = 'D') then
    raise exception 'T8 FAIL: a note-table trigger is still disabled after the backfill';
  end if;
  raise notice 'T8 PASS: every note-table trigger is on';
end $$;

\echo 'accounts_firms_owner_answers.test.sql: ALL PASS'
