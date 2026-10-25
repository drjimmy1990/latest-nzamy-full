-- account_deletion.test.sql — proves 20261026_70 (D6, owner ٢٩٨: an
-- independent account is frozen for 60 days then purged without its tax
-- invoices; a firm member's case files, office notes and client documents are
-- never deleted with him — they move to the firm owner).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20261019_21_consultant_court_write_guard.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $T/prelude_attachments_live.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261025_32_case_tracking_links.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20260706_entitlement_requests.sql \
--     $T/prelude_storage_objects_stub.sql \
--     $M/20261026_70_account_deletion.sql \
--     $M/20261026_70_account_deletion.sql \
--     supabase/storage_policies_documents.sql \
--     $T/account_deletion.test.sql
-- (storage_policies_documents.sql is the canonical copy of
-- SQL_batch_2026-10-26_owner_answers/71_AFTER_70_…; prod runs it as
-- supabase_admin, Docker as postgres.)
--
-- NEGATIVE CONTROL (must FAIL): the chain without the two 20261026_70 lines,
-- running only the fixtures (everything before the first `set role
-- authenticated`) and T9 — i.e. today's bare deleteUser of a firm member.
-- Recorded 2026-10-26: "T9 FAIL: case-l lost its lead (assigned_to /
-- requester not moved to O)", exit 3 — the cascade nulls the case's lead and
-- deletes his notes, document, hearing, task and client card.
-- NEGATIVE CONTROL 2 (must FAIL): the full chain with the 20261026_70 of
-- commit a82c0d5c (no 42501 catch in transfer_firm_assets) → T11 stops at
-- the member-removal UPDATE with the Art. 18 refusal «هذه الأداة للمحامي
-- المرخّص بالترافع…», exit 3 (recorded 2026-10-26): a consultant firm owner
-- could not remove a lawyer at all.
-- NEGATIVE CONTROLS of the 2026-10-26 fix pass (each must FAIL; recorded
-- 2026-10-26, exit 3). "fixtures" = everything before the first `set role
-- authenticated`; "old 70" = 20261026_70 of commit 5cb01e6f.
--   3. storage policy with the reviewer's INLINE subquery (`not exists (select
--      … from public.attachments …)` in the policy, no definer helper), on
--      fixtures + T6 + T15 → "T15 FAIL: the removed member still reads
--      (Storage API) the firm document he uploaded": the subquery runs under
--      M's RLS, sees no row, and lets the bytes through. The same with
--      SQL_batch_2026-10-25_owner_free/17 (no SELECT guard) — i.e. re-running
--      17 after 71.
--   4. old 70, fixtures + T12 → "T12 FAIL: the user lifted a freeze the
--      administration made".
--   5. old 70, fixtures + T13 + T14 → "T13 FAIL: the client's request on the
--      firm case went to 00000000-…-00000000000f" (a non-member's rows moved).
--   6. old 70, fixtures + T14 (preview check removed) → "T14 FAIL: prepare
--      changed N's rows: …:9999…  → …:0000…000f … trail=5 notes_to_O=1":
--      the old prepare committed the moves before deleteUser.
--   7. 70 of commit 95089d73 (catches only 42501), fixtures + T16 → the
--      member-removal UPDATE fails: "duplicate key value violates unique
--      constraint _t16_hearing_owner_title" — the firm owner could not remove
--      the member at all.
--
-- People:
--   O  firm owner of F (managing partner by the 20260903_phase2 trigger)
--   L  lawyer, active member of F        — his account is deleted (T9)
--   M  lawyer, active member of F        — removed from the firm (T6)
--   S  legal secretary, active member of F (keeps O an owner "with members")
--   I  independent lawyer (verified, listed) — frozen, cancels, frozen, purged
--   C  independent client of I (case-i)
--   X  a stranger
--   A  admin
--   Q  owner of firm F3, a legal consultant (practice_kind) — T11
--   R  lawyer, member of F3                               — T11
--   N  lawyer, member of F, whose purge fails after prepare — T14
--   Z  an auth user with no profiles row                  — T12
-- The live lawyer_profiles (prelude + 20261016_10 + 20261019_20) and the
-- Art. 18 guard of 20261019_21 are in the chain on purpose: the guard reads
-- the SESSION's role, so it judges the firm owner's member-removal PATCH.
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- GoTrue's auth.users has an email column (the stub does not); GoTrue deletes
-- as supabase_auth_admin with no SET ROLE (T11b, T14).
alter table auth.users add column if not exists email text;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login;
  end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant select, delete on auth.users to supabase_auth_admin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000f'), ('11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002'), ('33333333-0000-0000-0000-000000000003'),
  ('44444444-0000-0000-0000-000000000004'), ('55555555-0000-0000-0000-000000000005'),
  ('66666666-0000-0000-0000-000000000006'), ('aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.profiles (id, user_type, display_name, email) values
  ('00000000-0000-0000-0000-00000000000f', 'firm',       'O صاحب المكتب', 'o@example.test'),
  ('11111111-0000-0000-0000-000000000001', 'lawyer',     'L محامٍ',       'l@example.test'),
  ('22222222-0000-0000-0000-000000000002', 'lawyer',     'M محامٍ',       'm@example.test'),
  ('33333333-0000-0000-0000-000000000003', 'individual', 'S سكرتير',      's@example.test'),
  ('44444444-0000-0000-0000-000000000004', 'lawyer',     'I محامٍ مستقل', null),
  ('55555555-0000-0000-0000-000000000005', 'individual', 'C موكل',        'c@example.test'),
  ('66666666-0000-0000-0000-000000000006', 'individual', 'X غريب',        'x@example.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin',      'A مشرف',        'a@example.test');
-- I signed up with Google: profiles.email is empty, auth.users.email is not (7: the snapshot reads the auth row)
update auth.users set email = 'i@auth.example.test' where id = '44444444-0000-0000-0000-000000000004';
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000f', 'مكتب الاختبار');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001', 'lawyer',          'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '22222222-0000-0000-0000-000000000002', 'lawyer',          'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-000000000003', 'legal_secretary', 'active', now());
insert into public.lawyer_profiles (user_id, verification_status, marketplace_visible) values
  ('44444444-0000-0000-0000-000000000004', 'verified', true);

insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-l',   '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'قضية L في المكتب', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('case-m',   '22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'قضية M في المكتب', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('case-i',   '55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000004', 'قضية C عند I',     null),
  ('case-own', '44444444-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000004', 'قضية I الخاصة',    null);

insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'case-l',   '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'firm',    'مذكرة المكتب من L'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'case-l',   '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'private', 'ملاحظة L الخاصة على قضية المكتب'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'case-m',   '22222222-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-0000000000f1', 'firm',    'مذكرة المكتب من M'),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'case-own', '44444444-0000-0000-0000-000000000004', null, 'private', 'ملاحظة I الشخصية'),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'case-i',   '44444444-0000-0000-0000-000000000004', null, 'private', 'ملاحظة I على قضية C');

insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
  (101, 'case-l',   '11111111-0000-0000-0000-000000000001', 'l.pdf',      '11111111-0000-0000-0000-000000000001/1-l.pdf'),
  (102, 'case-m',   '22222222-0000-0000-0000-000000000002', 'm.pdf',      '22222222-0000-0000-0000-000000000002/1-m.pdf'),
  (103, null,       '44444444-0000-0000-0000-000000000004', 'vault.pdf',  '44444444-0000-0000-0000-000000000004/1-vault.pdf'),
  (104, 'case-own', '44444444-0000-0000-0000-000000000004', 'own.pdf',    '44444444-0000-0000-0000-000000000004/2-own.pdf'),
  (105, 'case-i',   '44444444-0000-0000-0000-000000000004', 'shared.pdf', '44444444-0000-0000-0000-000000000004/3-shared.pdf'),
  (106, 'case-i',   '55555555-0000-0000-0000-000000000005', 'c.pdf',      '55555555-0000-0000-0000-000000000005/1-c.pdf'),
  (107, null,       '22222222-0000-0000-0000-000000000002', 'mine.pdf',   '22222222-0000-0000-0000-000000000002/2-mine.pdf');

insert into storage.objects (bucket_id, name) values
  ('documents', '11111111-0000-0000-0000-000000000001/1-l.pdf'),
  ('documents', '22222222-0000-0000-0000-000000000002/1-m.pdf'),
  ('documents', '22222222-0000-0000-0000-000000000002/2-mine.pdf'),
  ('documents', '22222222-0000-0000-0000-000000000002/contracts/ct-f/1-firm.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/1-vault.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/2-own.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/3-shared.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/9-orphan.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/contracts/ct-1/1-contract.pdf'),
  ('documents', '55555555-0000-0000-0000-000000000005/1-c.pdf'),
  ('blog-covers', '44444444-0000-0000-0000-000000000004/not-this-bucket.png');

insert into public.contracts (id, client_user_id, owner_user_id, title) values
  ('ct-1', '55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000004', 'عقد أتعاب');
insert into public.contracts (id, client_user_id, owner_user_id, firm_id, title) values
  ('ct-f', '55555555-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-0000000000f1', 'عقد المكتب');
insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by) values
  ('ct-1', 1, 'contract.pdf', '44444444-0000-0000-0000-000000000004/contracts/ct-1/1-contract.pdf', '44444444-0000-0000-0000-000000000004'),
  ('ct-f', 1, 'firm.pdf',     '22222222-0000-0000-0000-000000000002/contracts/ct-f/1-firm.pdf',     '22222222-0000-0000-0000-000000000002');

insert into public.hearings (case_request_id, firm_id, owner_user_id, title, hearing_date) values
  ('case-l', 'ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001', 'جلسة قضية L', current_date + 7);
insert into public.tasks (case_request_id, firm_id, owner_user_id, assignee_user_id, title) values
  ('case-l', 'ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'مهمة قضية L');
insert into public.lawyer_clients (id, owner_user_id, firm_id, name) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'موكل المكتب');
insert into public.lawyer_client_notes (client_id, author_user_id, firm_id, body, visibility) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'ملاحظة على موكل المكتب', 'firm');
insert into public.dashboard_notes (id, author_user_id, firm_id, body, visibility) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'تذكير شخصي لـ L', 'private'),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'تنبيه للمكتب من L', 'firm');

insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, receipt_number, paid_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004', 'plan', 'lawyer-pro', 'monthly', 10000, 1500, 11500, 'exclusive', 'paid',    'NZ-2026-000001', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000004', 'plan', 'lawyer-pro', 'monthly', 10000, 1500, 11500, 'exclusive', 'created', null, null);

set role authenticated;

-- ── T1 a session cannot write the requests table, nor read another's row ────
select set_config('test.uid', '66666666-0000-0000-0000-000000000006', false);
do $$
begin
  begin
    insert into public.account_deletion_requests (user_id) values ('44444444-0000-0000-0000-000000000004');
    raise exception 'T1 FAIL: a session inserted a deletion request for someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.account_deletion_requests set status = 'cancelled';
    raise exception 'T1 FAIL: a session may UPDATE account_deletion_requests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.account_deletion_request_for('44444444-0000-0000-0000-000000000004', null, 'x');
    raise exception 'T1 FAIL: a session may call the service-role freeze';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.transfer_firm_assets('11111111-0000-0000-0000-000000000001', null, 'member_removed');
    raise exception 'T1 FAIL: a session may call transfer_firm_assets';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T1 PASS: no session write on the requests table; the service-role functions answer 42501';
end $$;

-- ── T2 I requests deletion: frozen, 60 days, unlisted, idempotent ──────────
select set_config('test.uid', '44444444-0000-0000-0000-000000000004', false);
do $$
declare r jsonb; r2 jsonb; n int;
begin
  select public.request_account_deletion('سأتوقف عن العمل') into r;
  if r->>'status' <> 'requested' then raise exception 'T2 FAIL: status is %', r->>'status'; end if;
  if (r->>'purge_after')::timestamptz <> (r->>'requested_at')::timestamptz + interval '60 days' then
    raise exception 'T2 FAIL: purge_after is not requested_at + 60 days (%)', r;
  end if;
  select public.request_account_deletion(null) into r2;
  if r2->>'id' <> r->>'id' then raise exception 'T2 FAIL: a second request opened another row'; end if;
  select count(*) into n from public.account_deletion_requests;
  if n <> 1 then raise exception 'T2 FAIL: I reads % rows, expected his 1', n; end if;
  raise notice 'T2 PASS: requested, purge_after = requested_at + 60 days, a repeat returns the same request';
end $$;
reset role;
do $$
declare v boolean;
begin
  select marketplace_visible into v from public.lawyer_profiles where user_id = '44444444-0000-0000-0000-000000000004';
  if v then raise exception 'T2b FAIL: the frozen lawyer is still listed'; end if;
  update public.lawyer_profiles set marketplace_visible = true where user_id = '44444444-0000-0000-0000-000000000004';
  select marketplace_visible into v from public.lawyer_profiles where user_id = '44444444-0000-0000-0000-000000000004';
  if v then raise exception 'T2b FAIL: a write re-listed a frozen account'; end if;
  raise notice 'T2b PASS: the frozen account is unlisted, and no write lists it again';
end $$;
set role authenticated;

-- ── T3 a stranger neither sees nor cancels I's request ──────────────────────
select set_config('test.uid', '66666666-0000-0000-0000-000000000006', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.account_deletion_requests;
  if n <> 0 then raise exception 'T3 FAIL: X reads % deletion requests', n; end if;
  select public.cancel_account_deletion() into ok;
  if ok then raise exception 'T3 FAIL: X cancelled something'; end if;
  raise notice 'T3 PASS: X cannot read or cancel someone else''s deletion';
end $$;
reset role;
do $$
begin
  if (select status from public.account_deletion_requests where user_id = '44444444-0000-0000-0000-000000000004') <> 'requested' then
    raise exception 'T3b FAIL: I''s request changed after X''s cancel';
  end if;
end $$;
set role authenticated;

-- ── T4 I restores within the 60 days: cancelled, listed again ───────────────
select set_config('test.uid', '44444444-0000-0000-0000-000000000004', false);
do $$
declare ok boolean;
begin
  select public.cancel_account_deletion() into ok;
  if not ok then raise exception 'T4 FAIL: I could not cancel his own request'; end if;
  select public.cancel_account_deletion() into ok;
  if ok then raise exception 'T4 FAIL: a second cancel reported another cancellation'; end if;
  raise notice 'T4 PASS: I cancels his own request once';
end $$;
reset role;
do $$
declare v boolean; s text;
begin
  select status into s from public.account_deletion_requests where user_id = '44444444-0000-0000-0000-000000000004';
  if s <> 'cancelled' then raise exception 'T4b FAIL: status is %', s; end if;
  select marketplace_visible into v from public.lawyer_profiles where user_id = '44444444-0000-0000-0000-000000000004';
  if not v then raise exception 'T4b FAIL: the restored lawyer is not listed again'; end if;
  raise notice 'T4b PASS: the request is cancelled and the listing is back as it was';
end $$;
set role authenticated;

-- ── T5 an admin and an owner of a firm with members cannot self-request ─────
do $$
begin
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
  begin
    perform public.request_account_deletion(null);
    raise exception 'T5 FAIL: an admin froze his own account from settings';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
  begin
    perform public.request_account_deletion(null);
    raise exception 'T5 FAIL: the owner of a firm with members froze his account';
  exception when object_not_in_prerequisite_state then
    if sqlerrm not like 'ACCOUNT_DELETION_ENTITY_OWNER%' then raise; end if;
  end;
  raise notice 'T5 PASS: admin 42501; firm owner with members 55000 ACCOUNT_DELETION_ENTITY_OWNER';
end $$;

-- ── T6 O removes M: M's firm files move to O, M loses them ──────────────────
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
update public.firm_members set status = 'removed'
 where user_id = '22222222-0000-0000-0000-000000000002' and firm_id = 'ffffffff-0000-0000-0000-0000000000f1';
do $$
declare n int;
begin
  select count(*) into n from public.service_requests where id = 'case-m'
     and requester_user_id = auth.uid() and assigned_to = auth.uid();
  if n <> 1 then raise exception 'T6 FAIL: O does not hold case-m after M left'; end if;
  select count(*) into n from public.case_notes where id = 'bbbbbbbb-0000-0000-0000-000000000003' and author_user_id = auth.uid();
  if n <> 1 then raise exception 'T6 FAIL: O does not hold M''s office note'; end if;
  select count(*) into n from public.attachments where id = 102 and owner_user_id = auth.uid();
  if n <> 1 then raise exception 'T6 FAIL: O does not hold M''s case document'; end if;
  select count(*) into n from public.firm_asset_transfers
   where from_user_id = '22222222-0000-0000-0000-000000000002' and reason = 'member_removed';
  if n < 4 then raise exception 'T6 FAIL: O reads % transfer rows for M, expected ≥ 4', n; end if;
  raise notice 'T6 PASS: case, office note and document of the removed member belong to O; O reads the trail';
end $$;
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from public.case_notes where request_id = 'case-m';
  if n <> 0 then raise exception 'T6b FAIL: the removed member still reads the firm note'; end if;
  select count(*) into n from public.attachments where id = 102;
  if n <> 0 then raise exception 'T6b FAIL: the removed member still reads the firm document'; end if;
  select count(*) into n from public.firm_asset_transfers;
  if n <> 0 then raise exception 'T6b FAIL: the removed member reads the transfer trail'; end if;
  raise notice 'T6b PASS: the removed member no longer reaches the firm''s rows';
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000000f' and body not like '%مذكرة%';
  if n < 1 then raise exception 'T6c FAIL: the firm owner was not told (or the notice carries content)'; end if;
  raise notice 'T6c PASS: the firm owner is notified with a count, never the content';
end $$;

-- ── T15 raw Storage reads follow the rows (the documents SELECT policy) ─────
-- M's firm document and firm contract version stay in M's folder after the
-- transfer; the Storage API must refuse them to him. His own vault file stays
-- his; an active member (L) still reads the firm document he uploaded.
set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/1-m.pdf';
  if n <> 0 then raise exception 'T15 FAIL: the removed member still reads (Storage API) the firm document he uploaded'; end if;
  select count(*) into n from storage.objects
   where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/contracts/ct-f/1-firm.pdf';
  if n <> 0 then raise exception 'T15 FAIL: the removed member still reads the firm contract version he uploaded'; end if;
  select count(*) into n from storage.objects
   where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/2-mine.pdf';
  if n <> 1 then raise exception 'T15 FAIL: the removed member lost his own vault file'; end if;
  raise notice 'T15 PASS: the removed member cannot read the firm document or contract version left in his folder; his own vault file stays readable';
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'documents' and name = '11111111-0000-0000-0000-000000000001/1-l.pdf';
  if n <> 1 then raise exception 'T15b FAIL: an active member lost his own upload on a firm case'; end if;
  raise notice 'T15b PASS: an active member still reads the firm document he uploaded';
end $$;
reset role;

-- ── T7 purge of I after 60 days: personal goes, shared and invoices stay ────
set role authenticated;
select set_config('test.uid', '44444444-0000-0000-0000-000000000004', false);
select public.request_account_deletion(null) is not null;
reset role;
-- 61 days ago (the BEFORE UPDATE trigger recomputes purge_after from it)
update public.account_deletion_requests set requested_at = now() - interval '61 days'
 where user_id = '44444444-0000-0000-0000-000000000004' and status = 'requested';
set role service_role;
do $$
declare claimed int; r jsonb; paths text[]; ok boolean;
begin
  -- a cancel by I once the job holds the row is too late
  select count(*) into claimed from public.account_purge_claim(10);
  if claimed <> 1 then raise exception 'T7 FAIL: % request(s) claimed, expected 1', claimed; end if;
  select count(*) into claimed from public.account_purge_claim(10);
  if claimed <> 0 then raise exception 'T7 FAIL: the same request was claimed twice'; end if;
  select public.account_purge_prepare('44444444-0000-0000-0000-000000000004') into r;
  if not (r->>'ok')::boolean then raise exception 'T7 FAIL: prepare refused: %', r; end if;
  -- a dry run: the keep rules are previewed, nothing is written before the delete
  if (r->'keep_preview'->>'documents_kept_for_others')::int <> 1 or (r->'keep_preview'->>'invoices_snapshotted')::int <> 1 then
    raise exception 'T7 FAIL: the preview is %', r->'keep_preview';
  end if;
  if (select owner_user_id from public.attachments where id = 105) is distinct from '44444444-0000-0000-0000-000000000004' then
    raise exception 'T7 FAIL: prepare detached the shared document before the delete';
  end if;
  if exists (select 1 from public.payment_orders where metadata ? 'buyer_snapshot') then
    raise exception 'T7 FAIL: prepare wrote the buyer snapshot before the delete';
  end if;
  begin
    perform public.account_purge_storage_paths('44444444-0000-0000-0000-000000000004');
    raise exception 'T7 FAIL: the files of a live account were listed for removal';
  exception when object_not_in_prerequisite_state then null;
  end;
  raise notice 'T7 PASS: claimed once; prepare is a dry run (previewed, nothing detached or snapshotted); no file list while the account exists';
end $$;
reset role;
set role authenticated;
select set_config('test.uid', '44444444-0000-0000-0000-000000000004', false);
do $$
declare ok boolean;
begin
  select public.cancel_account_deletion() into ok;
  if ok then raise exception 'T7b FAIL: I cancelled a request the purge job already holds'; end if;
  raise notice 'T7b PASS: a request being purged cannot be cancelled';
end $$;
reset role;
-- what deleteUser does
delete from auth.users where id = '44444444-0000-0000-0000-000000000004';
set role service_role;
do $$
declare paths text[];
begin
  select array(select unnest(public.account_purge_storage_paths('44444444-0000-0000-0000-000000000004')) order by 1) into paths;
  if paths <> array['44444444-0000-0000-0000-000000000004/1-vault.pdf',
                    '44444444-0000-0000-0000-000000000004/2-own.pdf',
                    '44444444-0000-0000-0000-000000000004/9-orphan.pdf'] then
    raise exception 'T7d FAIL: storage paths to remove are %', paths;
  end if;
  raise notice 'T7d PASS: after the delete the file list is the vault, own-case and orphan objects — never the shared case document, the contract or another bucket';
end $$;
select public.account_purge_finish(
  (select id from public.account_deletion_requests where user_id = '44444444-0000-0000-0000-000000000004' and status = 'purging'),
  'purged', '{"storage_removed": 3}'::jsonb, null);
reset role;
do $$
declare n int; snap jsonb; s text;
begin
  select count(*) into n from public.case_notes where author_user_id = '44444444-0000-0000-0000-000000000004';
  if n <> 0 then raise exception 'T7c FAIL: I''s personal notes survived the purge'; end if;
  select count(*) into n from public.attachments where id in (103, 104);
  if n <> 0 then raise exception 'T7c FAIL: I''s personal documents survived the purge'; end if;
  select count(*) into n from public.attachments where id = 105 and owner_user_id is null;
  if n <> 1 then raise exception 'T7c FAIL: I''s document on C''s case was not kept for C'; end if;
  select count(*) into n from public.attachments where id = 106 and owner_user_id = '55555555-0000-0000-0000-000000000005';
  if n <> 1 then raise exception 'T7c FAIL: C''s own document on the case was touched'; end if;
  select count(*) into n from public.contract_versions where contract_id = 'ct-1';
  if n <> 1 then raise exception 'T7c FAIL: the contract version was lost'; end if;
  select metadata->'buyer_snapshot' into snap from public.payment_orders where id = 'eeeeeeee-0000-0000-0000-000000000001';
  if snap is null or snap->>'display_name' <> 'I محامٍ مستقل' or snap->>'email' is distinct from 'i@auth.example.test' then
    raise exception 'T7c FAIL: the paid invoice lost its buyer, or took the empty profiles.email over auth.users.email (%)', snap;
  end if;
  if (select user_id from public.payment_orders where id = 'eeeeeeee-0000-0000-0000-000000000001') is not null then
    raise exception 'T7c FAIL: payment_orders.user_id should be SET NULL';
  end if;
  select metadata->'buyer_snapshot' into snap from public.payment_orders where id = 'eeeeeeee-0000-0000-0000-000000000002';
  if snap is not null then raise exception 'T7c FAIL: an unpaid order got a buyer snapshot'; end if;
  select status into s from public.account_deletion_requests where user_id = '44444444-0000-0000-0000-000000000004' and purged_at is not null;
  if s is distinct from 'purged' then raise exception 'T7c FAIL: the purged request is not recorded (%)', s; end if;
  raise notice 'T7c PASS: notes and own documents gone; the shared document, the contract and the tax invoice (with its buyer) stay; the request row records the purge';
end $$;

-- ── T8 the firm owner with members cannot be purged ─────────────────────────
set role service_role;
do $$
declare r jsonb;
begin
  select public.account_deletion_request_for('00000000-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-00000000000a', 'admin freeze') into r;
  if r->>'status' <> 'requested' then raise exception 'T8 FAIL: an admin could not freeze the firm owner'; end if;
  select public.account_purge_prepare('00000000-0000-0000-0000-00000000000f') into r;
  if (r->>'ok')::boolean or r->>'blocked' <> 'entity_owner' then raise exception 'T8 FAIL: prepare let the firm owner through: %', r; end if;
  begin
    perform public.account_deletion_request_for('aaaaaaaa-0000-0000-0000-00000000000a', null, 'x');
    raise exception 'T8 FAIL: an admin account was frozen';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T8 PASS: the firm owner can be frozen but prepare blocks him; an admin cannot be frozen';
end $$;
reset role;
do $$
begin
  begin
    delete from auth.users where id = '00000000-0000-0000-0000-00000000000f';
    raise exception 'T8b FAIL: the owner of a firm with members was deleted (the firm would cascade)';
  exception when insufficient_privilege then
    if sqlerrm not like 'ACCOUNT_DELETE_ENTITY_OWNER%' then raise; end if;
  end;
  raise notice 'T8b PASS: deleting the firm owner directly is refused while the firm has members';
end $$;
set role service_role;
do $$
declare ok boolean;
begin
  select public.account_deletion_cancel_for('00000000-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-00000000000a') into ok;
  if not ok then raise exception 'T8c FAIL: an admin could not restore the frozen owner'; end if;
  raise notice 'T8c PASS: an admin restores a frozen account';
end $$;
reset role;

-- ── T9 L's account is deleted while a member: the firm keeps everything ─────
delete from auth.users where id = '11111111-0000-0000-0000-000000000001';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare n int;
begin
  select count(*) into n from public.service_requests where id = 'case-l' and assigned_to = auth.uid() and requester_user_id = auth.uid();
  if n <> 1 then raise exception 'T9 FAIL: case-l lost its lead (assigned_to / requester not moved to O)'; end if;
  select count(*) into n from public.case_notes where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'T9 FAIL: the firm note of L was deleted with his account'; end if;
  select count(*) into n from public.case_notes where id = 'bbbbbbbb-0000-0000-0000-000000000002' and visibility = 'private';
  if n <> 1 then raise exception 'T9 FAIL: L''s private note on the firm case was not kept (Q2 default: kept, private, O''s)'; end if;
  select count(*) into n from public.attachments where id = 101;
  if n <> 1 then raise exception 'T9 FAIL: the firm document of L was deleted'; end if;
  select count(*) into n from public.hearings where case_request_id = 'case-l';
  if n <> 1 then raise exception 'T9 FAIL: the hearing of case-l was deleted'; end if;
  select count(*) into n from public.tasks where case_request_id = 'case-l' and owner_user_id = auth.uid() and assignee_user_id = auth.uid();
  if n <> 1 then raise exception 'T9 FAIL: the task of case-l is gone or not O''s'; end if;
  select count(*) into n from public.lawyer_clients where id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'T9 FAIL: the firm client card was deleted'; end if;
  select count(*) into n from public.lawyer_client_notes where client_id = 'cccccccc-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'T9 FAIL: the note on the firm client was deleted'; end if;
  select count(*) into n from public.dashboard_notes where id = 'dddddddd-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'T9 FAIL: L''s office dashboard note was deleted'; end if;
  update public.case_notes set body = 'عدّلها صاحب المكتب' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if not found then raise exception 'T9 FAIL: O cannot edit the note he now holds'; end if;
  raise notice 'T9 PASS: case lead, notes (office and private), document, hearing, task, client card and its note, office dashboard note — all O''s, read and edited through RLS';
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.dashboard_notes where id = 'dddddddd-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T9b FAIL: L''s personal dashboard note survived'; end if;
  select count(*) into n from public.firm_asset_transfers
   where from_user_id = '11111111-0000-0000-0000-000000000001' and reason = 'account_deleted'
     and table_name = 'case_notes' and column_name = 'author_user_id';
  if n <> 2 then raise exception 'T9b FAIL: the trail holds % case-note moves for L, expected 2', n; end if;
  raise notice 'T9b PASS: the personal dashboard note went with L; the trail names him as the original author';
end $$;

-- ── T10 an admin who decided an entitlement request can be deleted ──────────
insert into public.entitlement_requests (user_id, kind, status, decided_by, decided_at) values
  ('55555555-0000-0000-0000-000000000005', 'plan', 'approved', 'aaaaaaaa-0000-0000-0000-00000000000a', now());
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$
begin
  if exists (select 1 from public.entitlement_requests where decided_by is not null) then
    raise exception 'T10 FAIL: decided_by still points at the deleted admin';
  end if;
  if not exists (select 1 from public.entitlement_requests where user_id = '55555555-0000-0000-0000-000000000005') then
    raise exception 'T10 FAIL: the decided request went with the admin';
  end if;
  raise notice 'T10 PASS: entitlement_requests.decided_by is SET NULL, the request stays';
end $$;

-- ── T11 a consultant firm owner removes a lawyer: the removal never fails ────
-- 20261019_21 refuses a session moving a hearing to a consultant. The removal
-- still succeeds; the hearing is reported refused and stays with R; the purge
-- (service role) moves it later, so nothing is lost.
insert into auth.users (id) values
  ('77777777-0000-0000-0000-000000000007'), ('88888888-0000-0000-0000-000000000008');
insert into public.profiles (id, user_type, display_name, email) values
  ('77777777-0000-0000-0000-000000000007', 'firm',   'Q مكتب استشارات', 'q@example.test'),
  ('88888888-0000-0000-0000-000000000008', 'lawyer', 'R محامٍ',          'r@example.test');
insert into public.lawyer_profiles (user_id, practice_kind) values ('77777777-0000-0000-0000-000000000007', 'consultant');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f3', '77777777-0000-0000-0000-000000000007', 'مكتب الاستشارات');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f3', '88888888-0000-0000-0000-000000000008', 'lawyer', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-r', '88888888-0000-0000-0000-000000000008', '88888888-0000-0000-0000-000000000008', 'قضية R', 'ffffffff-0000-0000-0000-0000000000f3');
insert into public.hearings (case_request_id, firm_id, owner_user_id, title, hearing_date) values
  ('case-r', 'ffffffff-0000-0000-0000-0000000000f3', '88888888-0000-0000-0000-000000000008', 'جلسة قضية R', current_date + 3);
insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body) values
  ('bbbbbbbb-0000-0000-0000-000000000011', 'case-r', '88888888-0000-0000-0000-000000000008', 'ffffffff-0000-0000-0000-0000000000f3', 'firm', 'مذكرة R');
set role authenticated;
select set_config('test.uid', '77777777-0000-0000-0000-000000000007', false);
update public.firm_members set status = 'removed'
 where user_id = '88888888-0000-0000-0000-000000000008' and firm_id = 'ffffffff-0000-0000-0000-0000000000f3';
reset role;
do $$
begin
  if (select status from public.firm_members where user_id = '88888888-0000-0000-0000-000000000008') <> 'removed' then
    raise exception 'T11 FAIL: the removal did not commit';
  end if;
  if (select author_user_id from public.case_notes where id = 'bbbbbbbb-0000-0000-0000-000000000011') <> '77777777-0000-0000-0000-000000000007' then
    raise exception 'T11 FAIL: the note did not move to Q';
  end if;
  if (select owner_user_id from public.hearings where case_request_id = 'case-r') <> '88888888-0000-0000-0000-000000000008' then
    raise exception 'T11 FAIL: the Art. 18 guard was expected to keep the hearing with R on the session path';
  end if;
  raise notice 'T11 PASS: a consultant owner''s removal of a lawyer succeeds; the hearing the Art. 18 guard refuses stays with R, the note moves';
end $$;
set role service_role;
do $$
declare r jsonb;
begin
  r := public.account_purge_prepare('88888888-0000-0000-0000-000000000008');
  if not (r->>'ok')::boolean then raise exception 'T11b FAIL: prepare refused R: %', r; end if;
  if (select owner_user_id from public.hearings where case_request_id = 'case-r') <> '88888888-0000-0000-0000-000000000008' then
    raise exception 'T11b FAIL: prepare moved the hearing — it must be a dry run';
  end if;
end $$;
reset role;
-- what GoTrue does: its login role, supabase_auth_admin, with no SET ROLE
set session authorization supabase_auth_admin;
delete from auth.users where id = '88888888-0000-0000-0000-000000000008';
reset session authorization;
do $$
begin
  if exists (select 1 from auth.users where id = '88888888-0000-0000-0000-000000000008') then
    raise exception 'T11b FAIL: R was not deleted';
  end if;
  if (select owner_user_id from public.hearings where case_request_id = 'case-r') <> '77777777-0000-0000-0000-000000000007' then
    raise exception 'T11b FAIL: the delete (supabase_auth_admin) did not move the hearing to the firm owner';
  end if;
  raise notice 'T11b PASS: prepare moves nothing; the delete itself, as GoTrue''s supabase_auth_admin, moves the hearing the Art. 18 guard refused on the session path — nothing is lost';
end $$;

-- ── T12 an admin's freeze is the administration's to lift ───────────────────
-- (finding 2; the reviewer's P1.) The user's «استعادة» lifts only a freeze he
-- asked for; a self request an admin then freezes becomes the admin's.
insert into auth.users (id) values ('abababab-0000-0000-0000-0000000000ab');  -- Z: no profiles row
set role service_role;
do $$
declare r jsonb;
begin
  r := public.account_deletion_request_for('66666666-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000a', 'admin');
  if r->>'requested_by' <> 'admin' then raise exception 'T12 FAIL: the admin freeze is %', r; end if;
end $$;
reset role;
set role authenticated;
select set_config('test.uid', '66666666-0000-0000-0000-000000000006', false);
do $$
declare ok boolean; r jsonb;
begin
  select public.cancel_account_deletion() into ok;
  if ok then raise exception 'T12 FAIL: the user lifted a freeze the administration made'; end if;
  select public.request_account_deletion(null) into r;
  if r->>'requested_by' <> 'admin' then raise exception 'T12 FAIL: a self request turned the admin freeze into his own (%)', r; end if;
end $$;
reset role;
set role service_role;
do $$
declare ok boolean;
begin
  if (select status from public.account_deletion_requests
       where user_id = '66666666-0000-0000-0000-000000000006' and status <> 'cancelled') <> 'requested' then
    raise exception 'T12 FAIL: the admin freeze did not survive the user''s cancel';
  end if;
  select public.account_deletion_cancel_for('66666666-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000a') into ok;
  if not ok then raise exception 'T12 FAIL: an admin could not lift the administration''s freeze'; end if;
end $$;
reset role;
-- X asks himself, then an admin freezes: the request becomes the admin's, its date stays
set role authenticated;
select set_config('test.uid', '66666666-0000-0000-0000-000000000006', false);
select public.request_account_deletion('بطلبي') is not null;
reset role;
create temp table _t12 as
  select purge_after from public.account_deletion_requests
   where user_id = '66666666-0000-0000-0000-000000000006' and status = 'requested';
set role service_role;
select public.account_deletion_request_for('66666666-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000a', 'admin') is not null;
reset role;
set role authenticated;
select set_config('test.uid', '66666666-0000-0000-0000-000000000006', false);
do $$
declare ok boolean;
begin
  select public.cancel_account_deletion() into ok;
  if ok then raise exception 'T12 FAIL: the user lifted his own request after an admin froze it too'; end if;
end $$;
reset role;
do $$
declare r public.account_deletion_requests;
begin
  select * into r from public.account_deletion_requests
   where user_id = '66666666-0000-0000-0000-000000000006' and status = 'requested';
  if r.requested_by <> 'admin' or r.requested_by_user <> 'aaaaaaaa-0000-0000-0000-00000000000a' then
    raise exception 'T12 FAIL: the taken-over request is %/%', r.requested_by, r.requested_by_user;
  end if;
  if r.purge_after <> (select purge_after from _t12) then
    raise exception 'T12 FAIL: the admin take-over moved purge_after';
  end if;
end $$;
set role service_role;
do $$
declare ok boolean; r jsonb;
begin
  select public.account_deletion_cancel_for('66666666-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000a') into ok;
  if not ok then raise exception 'T12 FAIL: the admin could not restore X'; end if;
  -- 7: an auth user with no profiles row can be frozen (and restored)
  r := public.account_deletion_request_for('abababab-0000-0000-0000-0000000000ab', 'aaaaaaaa-0000-0000-0000-00000000000a', 'admin');
  if r->>'status' <> 'requested' then raise exception 'T12 FAIL: an auth user with no profile could not be frozen (%)', r; end if;
  select public.account_deletion_cancel_for('abababab-0000-0000-0000-0000000000ab', 'aaaaaaaa-0000-0000-0000-00000000000a') into ok;
  if not ok then raise exception 'T12 FAIL: the profile-less account could not be restored'; end if;
  begin
    perform public.account_deletion_request_for(gen_random_uuid(), null, 'x');
    raise exception 'T12 FAIL: a freeze was opened for an account that does not exist';
  exception when no_data_found then null;
  end;
  raise notice 'T12 PASS: the user cannot lift an admin freeze (nor by asking himself); a self request an admin freezes becomes the admin''s with its date kept; an admin lifts both; a profile-less auth user can be frozen; a missing account is P0002';
end $$;
reset role;

-- ── T13 a client's rows on a firm case are not firm assets ──────────────────
-- (finding 3; the reviewer's P2.) C is no member of F. Deleting C must not
-- move his request to the firm owner, nor tell O that "a member" left.
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-cf', '55555555-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000f', 'طلب C لدى المكتب', 'ffffffff-0000-0000-0000-0000000000f1');
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
  (201, 'case-cf', '55555555-0000-0000-0000-000000000005', 'c2.pdf', '55555555-0000-0000-0000-000000000005/2-c.pdf');
create temp table _t13 as select count(*) as n from public.notifications where user_id = '00000000-0000-0000-0000-00000000000f';
set role service_role;
do $$
declare r jsonb;
begin
  r := public.account_purge_prepare('55555555-0000-0000-0000-000000000005');
  if not (r->>'ok')::boolean then raise exception 'T13 FAIL: a firm''s client is blocked from deletion: %', r; end if;
  if coalesce((r->'keep_preview'->'transferred'->>'total')::int, 0) <> 0 then
    raise exception 'T13 FAIL: the preview moves a client''s rows to the firm owner: %', r->'keep_preview';
  end if;
end $$;
reset role;
delete from auth.users where id = '55555555-0000-0000-0000-000000000005';
do $$
begin
  if (select requester_user_id from public.service_requests where id = 'case-cf') is not null then
    raise exception 'T13 FAIL: the client''s request on the firm case went to %', (select requester_user_id from public.service_requests where id = 'case-cf');
  end if;
  if not exists (select 1 from public.attachments where id = 201 and owner_user_id is null) then
    raise exception 'T13 FAIL: the client''s document on the firm case was not kept for the firm (owner null)';
  end if;
  if (select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-00000000000f') <> (select n from _t13) then
    raise exception 'T13 FAIL: the firm owner was told a member''s account was deleted';
  end if;
  if exists (select 1 from public.firm_asset_transfers where from_user_id = '55555555-0000-0000-0000-000000000005') then
    raise exception 'T13 FAIL: the client''s rows are in the firm transfer trail';
  end if;
  raise notice 'T13 PASS: a non-member''s request on a firm case is nulled, not moved; his document stays for the firm with no owner; no member-left notice, no trail row';
end $$;

-- ── T14 a delete that fails after prepare changes nothing ───────────────────
-- (finding 4.) N is a member of F with a firm case. prepare is a dry run; a
-- delete that fails (here a NO ACTION key, as a hand-applied prod FK would)
-- rolls the trigger's moves back with it, so N is restorable with his work.
-- Then a move a guard refuses makes the delete itself refuse
-- (ACCOUNT_DELETE_FIRM_ASSETS_LEFT), and once both are gone the delete (as
-- GoTrue) moves everything to O.
insert into auth.users (id) values ('99999999-0000-0000-0000-000000000009');
insert into public.profiles (id, user_type, display_name, email) values
  ('99999999-0000-0000-0000-000000000009', 'lawyer', 'N محامٍ', 'n@example.test');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-000000000009', 'lawyer', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-n', '99999999-0000-0000-0000-000000000009', '99999999-0000-0000-0000-000000000009', 'قضية N', 'ffffffff-0000-0000-0000-0000000000f1');
insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body) values
  ('bbbbbbbb-0000-0000-0000-000000000021', 'case-n', '99999999-0000-0000-0000-000000000009', 'ffffffff-0000-0000-0000-0000000000f1', 'firm', 'مذكرة N');
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
  (301, 'case-n', '99999999-0000-0000-0000-000000000009', 'n.pdf', '99999999-0000-0000-0000-000000000009/1-n.pdf');
insert into public.hearings (case_request_id, firm_id, owner_user_id, title, hearing_date) values
  ('case-n', 'ffffffff-0000-0000-0000-0000000000f1', '99999999-0000-0000-0000-000000000009', 'جلسة قضية N', current_date + 5);
create function pg_temp.t14_snapshot() returns text language sql as $$
  select concat_ws(' | ',
    (select string_agg(sr.id || ':' || coalesce(sr.requester_user_id::text, '-') || ':' || coalesce(sr.assigned_to::text, '-'), ',')
       from public.service_requests sr where sr.id = 'case-n'),
    (select string_agg(n.id::text || ':' || coalesce(n.author_user_id::text, '-'), ',') from public.case_notes n where n.request_id = 'case-n'),
    (select string_agg(a.id::text || ':' || coalesce(a.owner_user_id::text, '-'), ',') from public.attachments a where a.request_id = 'case-n'),
    (select string_agg(coalesce(h.owner_user_id::text, '-'), ',') from public.hearings h where h.case_request_id = 'case-n'),
    'trail=' || (select count(*) from public.firm_asset_transfers t where t.from_user_id = '99999999-0000-0000-0000-000000000009'),
    'notes_to_O=' || (select count(*) from public.notifications x where x.user_id = '00000000-0000-0000-0000-00000000000f'),
    'user=' || (select count(*) from auth.users u where u.id = '99999999-0000-0000-0000-000000000009'));
$$;
create temp table _t14 as select pg_temp.t14_snapshot() as before;
set role service_role;
do $$
declare r jsonb;
begin
  r := public.account_purge_prepare('99999999-0000-0000-0000-000000000009');
  if not (r->>'ok')::boolean then raise exception 'T14 FAIL: prepare refused N: %', r; end if;
  if coalesce((r->'keep_preview'->'transferred'->>'total')::int, 0) < 4 then
    raise exception 'T14 FAIL: the preview should name N''s firm rows: %', r->'keep_preview';
  end if;
end $$;
reset role;
create table public._t14_hold (u uuid references auth.users(id));
insert into public._t14_hold values ('99999999-0000-0000-0000-000000000009');
do $$
begin
  if pg_temp.t14_snapshot() <> (select before from _t14) then
    raise exception 'T14 FAIL: prepare changed N''s rows: % → %', (select before from _t14), pg_temp.t14_snapshot();
  end if;
  begin
    delete from auth.users where id = '99999999-0000-0000-0000-000000000009';
    raise exception 'T14 FAIL: the delete went through the NO ACTION key';
  exception when foreign_key_violation then null;
  end;
  if pg_temp.t14_snapshot() <> (select before from _t14) then
    raise exception 'T14 FAIL: a failed delete after prepare changed N''s rows: % → %', (select before from _t14), pg_temp.t14_snapshot();
  end if;
  raise notice 'T14 PASS: prepare writes nothing, and a delete that fails afterwards leaves N''s case, note, document, hearing, trail and the owner''s notices exactly as they were';
end $$;
drop table public._t14_hold;
-- a guard refuses one move: the delete itself refuses, and nothing changes
create function public._t14_refuse() returns trigger language plpgsql as $$
begin
  if old.author_user_id = '99999999-0000-0000-0000-000000000009' and new.author_user_id is distinct from old.author_user_id then
    raise exception using errcode = '42501', message = 'T14 test guard';
  end if;
  return new;
end $$;
create trigger _t14_refuse before update on public.case_notes for each row execute function public._t14_refuse();
set role service_role;
do $$
declare r jsonb;
begin
  r := public.account_purge_prepare('99999999-0000-0000-0000-000000000009');
  if (r->>'ok')::boolean or r->>'blocked' <> 'firm_assets_left' then
    raise exception 'T14b FAIL: prepare let N through with a firm note that cannot move: %', r;
  end if;
end $$;
reset role;
do $$
begin
  begin
    delete from auth.users where id = '99999999-0000-0000-0000-000000000009';
    raise exception 'T14b FAIL: N was deleted with a firm note that could not move';
  exception when insufficient_privilege then
    if sqlerrm not like 'ACCOUNT_DELETE_FIRM_ASSETS_LEFT%' then raise; end if;
  end;
  if pg_temp.t14_snapshot() <> (select before from _t14) then
    raise exception 'T14b FAIL: the refused delete changed N''s rows: % → %', (select before from _t14), pg_temp.t14_snapshot();
  end if;
  raise notice 'T14b PASS: a firm row the transfer cannot move refuses the delete (ACCOUNT_DELETE_FIRM_ASSETS_LEFT) and prepare reports it blocked; nothing changed';
end $$;
drop trigger _t14_refuse on public.case_notes;
drop function public._t14_refuse();
set session authorization supabase_auth_admin;
delete from auth.users where id = '99999999-0000-0000-0000-000000000009';
reset session authorization;
do $$
declare o text := '00000000-0000-0000-0000-00000000000f';
begin
  if pg_temp.t14_snapshot() <> format('case-n:%s:%s | bbbbbbbb-0000-0000-0000-000000000021:%s | 301:%s | %s | trail=5 | notes_to_O=%s | user=0',
                                      o, o, o, o, o, (select n + 1 from _t13) + 0) then
    raise exception 'T14c FAIL: after the delete N''s firm rows are %', pg_temp.t14_snapshot();
  end if;
  raise notice 'T14c PASS: the delete that succeeds moves N''s case, note, document and hearing to O, with 5 trail rows and one notice';
end $$;

-- ── T16 a unique key the owner already holds never fails a removal ─────────
-- (the reviewer's uniq probe: no such key on a moved column in the repo
-- today, so one is made here.) The move is refused like a guard's; the
-- removal commits; the colliding row stays with the member, the rest moves.
insert into auth.users (id) values ('16161616-0000-0000-0000-000000000016');
insert into public.profiles (id, user_type, display_name, email) values
  ('16161616-0000-0000-0000-000000000016', 'lawyer', 'P محامٍ', 'p@example.test');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1', '16161616-0000-0000-0000-000000000016', 'lawyer', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-p', '16161616-0000-0000-0000-000000000016', '16161616-0000-0000-0000-000000000016', 'قضية P', 'ffffffff-0000-0000-0000-0000000000f1');
insert into public.hearings (case_request_id, firm_id, owner_user_id, title, hearing_date) values
  ('case-p', 'ffffffff-0000-0000-0000-0000000000f1', '16161616-0000-0000-0000-000000000016', 'جلسة مكررة', current_date + 9),
  ('case-p', 'ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000f', 'جلسة مكررة', current_date + 9);
create unique index _t16_hearing_owner_title on public.hearings (owner_user_id, title);
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
update public.firm_members set status = 'removed'
 where user_id = '16161616-0000-0000-0000-000000000016' and firm_id = 'ffffffff-0000-0000-0000-0000000000f1';
reset role;
do $$
begin
  if (select status from public.firm_members where user_id = '16161616-0000-0000-0000-000000000016') <> 'removed' then
    raise exception 'T16 FAIL: the removal did not commit';
  end if;
  if (select requester_user_id from public.service_requests where id = 'case-p') <> '00000000-0000-0000-0000-00000000000f' then
    raise exception 'T16 FAIL: the case did not move to O';
  end if;
  if not exists (select 1 from public.hearings where case_request_id = 'case-p' and owner_user_id = '16161616-0000-0000-0000-000000000016') then
    raise exception 'T16 FAIL: the colliding hearing should have stayed with P';
  end if;
  raise notice 'T16 PASS: a unique key the owner already holds is refused like a guard — the removal commits, the case moves, the colliding row stays';
end $$;
drop index public._t16_hearing_owner_title;

select 'account_deletion.test.sql: ALL PASS';
