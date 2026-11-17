-- leave_firm_transfer_l4.test.sql — proves that «مغادرة المكتب» (public.leave_firm,
-- 20261125_40) runs the REAL removal path of 20261026_70 / 20261030_12 when the
-- member himself is the caller: his firm case, its hearing and his firm note move
-- to the firm owner (firm_asset_transfers trail + a notification to the owner),
-- and the restricted-case policies sit beside the 20261025_31/32/33 tables.
--
-- CHAIN (run.sh, postgres:16). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql $M/20260904_phase5_deadline_radar.sql \
--     $M/20261019_21_consultant_court_write_guard.sql $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql $M/20261017_41_notes_visibility_case_team.sql $T/prelude_attachments_live.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql $M/20261025_31_dashboard_notes.sql \
--     $M/20261025_32_case_tracking_links.sql $M/20261025_33_legal_ledger.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql \
--     $M/20260706_entitlement_requests.sql $T/prelude_storage_objects_stub.sql \
--     $M/20261026_70_account_deletion.sql supabase/storage_policies_documents.sql \
--     $M/20261030_12_accounts_firms_owner_answers.sql \
--     $M/20261125_40_restricted_cases.sql $M/20261125_40_restricted_cases.sql \
--     $T/leave_firm_transfer_l4.test.sql
-- (account_deletion / accounts_firms_owner_answers chain + 20261025_33 + 20261125_40)
\set ON_ERROR_STOP 1

insert into auth.users (id) values
  ('d4000000-0000-0000-0000-000000000001'),  -- O firm owner (firm account, advocate office)
  ('d4000000-0000-0000-0000-000000000002'),  -- L lawyer, active member, leaves
  ('d4000000-0000-0000-0000-000000000003');  -- M lawyer, active member, stays
insert into public.profiles (id, user_type, display_name, email) values
  ('d4000000-0000-0000-0000-000000000001', 'firm',   'O مكتب', 'o4@example.test'),
  ('d4000000-0000-0000-0000-000000000002', 'lawyer', 'L محامٍ', 'l4@example.test'),
  ('d4000000-0000-0000-0000-000000000003', 'lawyer', 'M محامٍ', 'm4@example.test');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('d4f00000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'مكتب المغادرة');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('d4f00000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000002', 'lawyer', 'active', now()),
  ('d4f00000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000003', 'lawyer', 'active', now())
on conflict do nothing;
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-leave', 'd4000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000002', 'قضية L', 'd4f00000-0000-0000-0000-000000000001');
insert into public.hearings (owner_user_id, firm_id, case_request_id, title, hearing_date)
values ('d4000000-0000-0000-0000-000000000002', 'd4f00000-0000-0000-0000-000000000001', 'case-leave', 'جلسة L', current_date + 7);
insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility)
values ('case-leave', 'd4000000-0000-0000-0000-000000000002', 'd4f00000-0000-0000-0000-000000000001', 'ملاحظة L', 'firm');

-- ── L1 the member leaves through the RPC, as himself ────────────────────────
set role authenticated;
select set_config('test.uid', 'd4000000-0000-0000-0000-000000000002', false);
select public.leave_firm('d4f00000-0000-0000-0000-000000000001');
reset role;

do $$
declare r record; n int;
begin
  if (select status from public.firm_members
       where firm_id = 'd4f00000-0000-0000-0000-000000000001' and user_id = 'd4000000-0000-0000-0000-000000000002') <> 'removed' then
    raise exception 'L1 FAIL: the membership is not removed';
  end if;
  select requester_user_id, assigned_to into r from public.service_requests where id = 'case-leave';
  if r.requester_user_id <> 'd4000000-0000-0000-0000-000000000001' or r.assigned_to <> 'd4000000-0000-0000-0000-000000000001' then
    raise exception 'L1 FAIL: the firm case did not move to the owner (requester %, lead %)', r.requester_user_id, r.assigned_to;
  end if;
  if (select owner_user_id from public.hearings where case_request_id = 'case-leave') <> 'd4000000-0000-0000-0000-000000000001' then
    raise exception 'L1 FAIL: the hearing did not move to the owner';
  end if;
  if (select author_user_id from public.case_notes where request_id = 'case-leave') <> 'd4000000-0000-0000-0000-000000000001' then
    raise exception 'L1 FAIL: the firm note did not move to the owner';
  end if;
  select count(*) into n from public.firm_asset_transfers
   where from_user_id = 'd4000000-0000-0000-0000-000000000002' and to_user_id = 'd4000000-0000-0000-0000-000000000001';
  if n < 4 then raise exception 'L1 FAIL: only % transfer trail rows', n; end if;
  if not exists (select 1 from public.notifications where user_id = 'd4000000-0000-0000-0000-000000000001') then
    raise exception 'L1 FAIL: the owner was not notified';
  end if;
  raise notice 'L1 PASS: leave_firm by the member himself moves his firm case (filer + lead), hearing and note to the owner; % trail rows; owner notified', n;
end $$;

-- ── L2 the member who left reads none of it; the one who stayed still does ──
set role authenticated;
select set_config('test.uid', 'd4000000-0000-0000-0000-000000000002', false);
do $$
begin
  if exists (select 1 from public.service_requests where id = 'case-leave')
     or exists (select 1 from public.hearings where case_request_id = 'case-leave') then
    raise exception 'L2 FAIL: the member who left still reads the firm case';
  end if;
  raise notice 'L2 PASS: the member who left no longer reads the firm case or its hearing';
end $$;
select set_config('test.uid', 'd4000000-0000-0000-0000-000000000003', false);
do $$
begin
  if not exists (select 1 from public.service_requests where id = 'case-leave') then
    raise exception 'L2 FAIL: a remaining member lost the firm case';
  end if;
  raise notice 'L2b PASS: a remaining member still reads the firm case';
end $$;
reset role;

select 'leave_firm_transfer_l4: ALL PASS' as result;
