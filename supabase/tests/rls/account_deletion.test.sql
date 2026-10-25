-- account_deletion.test.sql — proves 20261026_70 (D6, owner ٢٩٨: an
-- independent account is frozen for 60 days then purged without its tax
-- invoices; a firm member's case files, office notes and client documents are
-- never deleted with him — they move to the firm owner).
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
--     $T/prelude_attachments_live.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261025_32_case_tracking_links.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $T/prelude_storage_objects_stub.sql \
--     $M/20261026_70_account_deletion.sql \
--     $M/20261026_70_account_deletion.sql \
--     $T/account_deletion.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the chain without the two 20261026_70 lines,
-- running only the fixtures (everything before the first `set role
-- authenticated`) and T9 — i.e. today's bare deleteUser of a firm member.
-- Recorded 2026-10-26: "T9 FAIL: case-l lost its lead (assigned_to /
-- requester not moved to O)", exit 3 — the cascade nulls the case's lead and
-- deletes his notes, document, hearing, task and client card.
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
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

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
  ('44444444-0000-0000-0000-000000000004', 'lawyer',     'I محامٍ مستقل', 'i@example.test'),
  ('55555555-0000-0000-0000-000000000005', 'individual', 'C موكل',        'c@example.test'),
  ('66666666-0000-0000-0000-000000000006', 'individual', 'X غريب',        'x@example.test'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'admin',      'A مشرف',        'a@example.test');
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
  (106, 'case-i',   '55555555-0000-0000-0000-000000000005', 'c.pdf',      '55555555-0000-0000-0000-000000000005/1-c.pdf');

insert into storage.objects (bucket_id, name) values
  ('documents', '11111111-0000-0000-0000-000000000001/1-l.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/1-vault.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/2-own.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/3-shared.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/9-orphan.pdf'),
  ('documents', '44444444-0000-0000-0000-000000000004/contracts/ct-1/1-contract.pdf'),
  ('documents', '55555555-0000-0000-0000-000000000005/1-c.pdf'),
  ('blog-covers', '44444444-0000-0000-0000-000000000004/not-this-bucket.png');

insert into public.contracts (id, client_user_id, owner_user_id, title) values
  ('ct-1', '55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000004', 'عقد أتعاب');
insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by) values
  ('ct-1', 1, 'contract.pdf', '44444444-0000-0000-0000-000000000004/contracts/ct-1/1-contract.pdf', '44444444-0000-0000-0000-000000000004');

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
  select array(select jsonb_array_elements_text(r->'storage_paths') order by 1) into paths;
  if paths <> array['44444444-0000-0000-0000-000000000004/1-vault.pdf',
                    '44444444-0000-0000-0000-000000000004/2-own.pdf',
                    '44444444-0000-0000-0000-000000000004/9-orphan.pdf'] then
    raise exception 'T7 FAIL: storage paths to remove are %', paths;
  end if;
  raise notice 'T7 PASS: claimed once; prepare lists the vault, own-case and orphan objects — never the shared case document, the contract or another bucket';
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
  if snap is null or snap->>'display_name' <> 'I محامٍ مستقل' or snap->>'email' <> 'i@example.test' then
    raise exception 'T7c FAIL: the paid invoice lost its buyer (%)', snap;
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

select 'account_deletion.test.sql: ALL PASS';
