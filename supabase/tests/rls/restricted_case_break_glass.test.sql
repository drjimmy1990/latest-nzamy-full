-- restricted_case_break_glass.test.sql — proves 20261206_12 (l16, owner س٢١٦):
-- a platform admin no longer reads a RESTRICTED firm case; break-glass needs a
-- written reason, a SECOND super admin, ≤240 minutes, and notifies the firm;
-- owner / firm access is unchanged.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 12 runs TWICE.
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260627_platform_settings.sql \
--     $M/20261128_10_payref_settings.sql \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql \
--     $M/20261019_21_consultant_court_write_guard.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261122_31_firm_row_write_check.sql \
--     $M/20261124_50_hearings_assignee.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $T/prelude_invoice_payments_live.sql \
--     $M/20261126_40_time_trust_expenses.sql \
--     $M/20261129_10_firm_company_roles_seats.sql \
--     $M/20261201_10_l11_sec_fees_scope_device_phone.sql \
--     $M/20261202_80_l12_firm_roles_log_badge_storage.sql \
--     $M/20261019_30_platform_staff_roles.sql \
--     $T/prelude_break_glass.sql \
--     $M/20261206_12_restricted_case_break_glass.sql \
--     $M/20261206_12_restricted_case_break_glass.sql \
--     $T/restricted_case_break_glass.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261206_12 lines →
--   "T0 FAIL: case_visible still lets every admin through"; with T0 removed →
--   "T2 FAIL: an admin without a grant reads the restricted case's hearings (1)".
-- REGRESSION: l12_firm_scope.test.sql on its own chain + prelude_break_glass
--   + 20261206_12 still passes (owner / firm / trainee / finance rules).
-- prelude_break_glass.sql stands in for 20261019_30 (platform_staff,
--   is_super_admin) and adds the live admin_audit_events.actor_type.
--
-- People (firm F, owner O — the phase2 trigger makes O its managing_partner):
--   L  lawyer, filer + lead of case-r (restricted) and case-u (unrestricted)
--   T  trainee, on no team;  P  managing partner (not the owner)
--   S1, S2  platform admins with staff_role super_admin;  OP  admin, operations
-- Every assertion RAISES on failure. Runs as role `authenticated`.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-000000016a00'), ('00000000-0000-0000-0000-000000016a01'),
  ('00000000-0000-0000-0000-000000016a02'), ('00000000-0000-0000-0000-000000016a03'),
  ('00000000-0000-0000-0000-0000000165a1'), ('00000000-0000-0000-0000-0000000165a2'),
  ('00000000-0000-0000-0000-0000000160b0');
insert into public.profiles (id, user_type, display_name, email) values
  ('00000000-0000-0000-0000-000000016a00', 'firm',   'O',  'o@l16.test'),
  ('00000000-0000-0000-0000-000000016a01', 'lawyer', 'L',  'l@l16.test'),
  ('00000000-0000-0000-0000-000000016a02', 'individual', 'T', 't@l16.test'),
  ('00000000-0000-0000-0000-000000016a03', 'lawyer', 'P',  'p@l16.test'),
  ('00000000-0000-0000-0000-0000000165a1', 'admin',  'S1', 's1@l16.test'),
  ('00000000-0000-0000-0000-0000000165a2', 'admin',  'S2', 's2@l16.test'),
  ('00000000-0000-0000-0000-0000000160b0', 'admin',  'OP', 'op@l16.test');
insert into public.platform_staff (user_id, staff_role) values
  ('00000000-0000-0000-0000-0000000165a1', 'super_admin'),
  ('00000000-0000-0000-0000-0000000165a2', 'super_admin'),
  ('00000000-0000-0000-0000-0000000160b0', 'operations');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-000000016a00', 'مكتب l16');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-000000016a01', 'lawyer',           'active', now()),
  ('ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-000000016a02', 'trainee',          'active', now()),
  ('ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-000000016a03', 'managing_partner', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, description, firm_id, is_restricted) values
  ('case-r', '00000000-0000-0000-0000-000000016a01', '00000000-0000-0000-0000-000000016a01', 'قضية مقيّدة', 'تفاصيل سرية', 'ffffffff-0000-0000-0000-000000016f01', true),
  ('case-u', '00000000-0000-0000-0000-000000016a01', '00000000-0000-0000-0000-000000016a01', 'قضية عادية', '', 'ffffffff-0000-0000-0000-000000016f01', false);
insert into public.hearings (case_request_id, firm_id, owner_user_id, title, hearing_date) values
  ('case-r', 'ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-000000016a01', 'جلسة سرية', current_date + 3),
  ('case-u', 'ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-000000016a01', 'جلسة عادية', current_date + 4);
insert into public.attachments (request_id, owner_user_id, file_name, storage_path) values
  ('case-r', '00000000-0000-0000-0000-000000016a01', 'مذكرة.pdf', '00000000-0000-0000-0000-000000016a01/m.pdf');

create or replace function pg_temp.hearings_of(p_case text) returns int language sql as $$
  select count(*)::int from public.hearings where case_request_id = p_case;
$$;
grant execute on function pg_temp.hearings_of(text) to authenticated;

-- ── T0 the function ──────────────────────────────────────────────────────────
do $$
declare def text := pg_get_functiondef('public.case_visible(text)'::regprocedure);
begin
  if strpos(def, 'is_admin()') > 0 then raise exception 'T0 FAIL: case_visible still lets every admin through'; end if;
  if strpos(def, 'restricted_case_grant_active(sr.id)') = 0 or strpos(def, 'firm_case_scoped_member') = 0
     or strpos(def, 'assignee_user_id') = 0 then
    raise exception 'T0 FAIL: case_visible lost an arm (grant / scoped member / assignee)';
  end if;
  raise notice 'T0 PASS: case_visible has the grant arm instead of is_admin(), and keeps every other arm';
end $$;

set role authenticated;

-- ── T1 owner / firm access unchanged ─────────────────────────────────────────
do $$
declare who text; uid text;
begin
  foreach uid in array array['00000000-0000-0000-0000-000000016a00', '00000000-0000-0000-0000-000000016a01',
                             '00000000-0000-0000-0000-000000016a03'] loop
    perform set_config('test.uid', uid, false);
    if not public.case_visible('case-r') or pg_temp.hearings_of('case-r') <> 1 then
      raise exception 'T1 FAIL: % lost the restricted case', uid;
    end if;
  end loop;
  perform set_config('test.uid', '00000000-0000-0000-0000-000000016a02', false);
  if public.case_visible('case-r') or pg_temp.hearings_of('case-r') <> 0 then
    raise exception 'T1 FAIL: the trainee reads the restricted case';
  end if;
  raise notice 'T1 PASS: firm owner, lead and managing partner read the restricted case; the off-team trainee does not';
end $$;

-- ── T2 an admin without a grant: metadata only (no content rows) ────────────
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  if pg_temp.hearings_of('case-r') <> 0 then
    raise exception 'T2 FAIL: an admin without a grant reads the restricted case''s hearings (%)', pg_temp.hearings_of('case-r');
  end if;
  if public.case_visible('case-r') then raise exception 'T2 FAIL: case_visible is true for an admin without a grant'; end if;
  if pg_temp.hearings_of('case-u') <> 1 then
    raise exception 'T2 FAIL: the admin lost his read of an UNRESTRICTED firm case (%)', pg_temp.hearings_of('case-u');
  end if;
  begin
    perform public.restricted_case_break_glass_read('case-r');
    raise exception 'T2 FAIL: the break-glass read worked without a grant';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: an admin without a grant reads nothing of a restricted case (unrestricted unchanged)';
end $$;

-- ── T3 requesting ────────────────────────────────────────────────────────────
do $$
declare g1 uuid; g2 uuid;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000160b0', false);
  begin
    perform public.restricted_case_access_request('case-r', 'سبب مكتوب كافٍ لطلب الوصول الطارئ', 60);
    raise exception 'T3 FAIL: an operations admin requested break-glass';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-000000016a01', false);
  begin
    perform public.restricted_case_access_request('case-r', 'سبب مكتوب كافٍ لطلب الوصول الطارئ', 60);
    raise exception 'T3 FAIL: a lawyer requested break-glass';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  begin
    perform public.restricted_case_access_request('case-r', 'قصير', 60);
    raise exception 'T3 FAIL: a request with no real reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.restricted_case_access_request('case-r', 'سبب مكتوب كافٍ لطلب الوصول الطارئ', 600);
    raise exception 'T3 FAIL: a 10-hour grant was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.restricted_case_access_request('case-u', 'سبب مكتوب كافٍ لطلب الوصول الطارئ', 60);
    raise exception 'T3 FAIL: break-glass on an unrestricted case was accepted';
  exception when invalid_parameter_value then null;
  end;
  g1 := public.restricted_case_access_request('case-r', 'بلاغ رسمي يستلزم مراجعة عاجلة لملف القضية', 30);
  g2 := public.restricted_case_access_request('case-r', 'بلاغ رسمي يستلزم مراجعة عاجلة لملف القضية', 30);
  if g1 is null or g1 <> g2 then raise exception 'T3 FAIL: a second open request was created'; end if;
  perform set_config('test.grant', g1::text, false);
  if pg_temp.hearings_of('case-r') <> 0 then raise exception 'T3 FAIL: a pending request opened the case'; end if;
  raise notice 'T3 PASS: only a super admin requests, with a written reason, ≤240 min, on a restricted case; one open request; pending opens nothing';
end $$;

-- ── T4 approving: never the requester, never a non-super admin ──────────────
do $$
declare g uuid := current_setting('test.grant')::uuid; e timestamptz;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  begin
    perform public.restricted_case_access_approve(g, null);
    raise exception 'T4 FAIL: the requester approved his own request';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000160b0', false);
  begin
    perform public.restricted_case_access_approve(g, null);
    raise exception 'T4 FAIL: an operations admin approved';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a2', false);
  e := public.restricted_case_access_approve(g, 'موافق');
  if e is null or e > now() + interval '31 minutes' or e < now() + interval '29 minutes' then
    raise exception 'T4 FAIL: the expiry is not approval + 30 minutes (%)', e;
  end if;
  begin
    perform public.restricted_case_access_approve(g, null);
    raise exception 'T4 FAIL: a decided request was approved twice';
  exception when invalid_parameter_value then null;
  end;
  if pg_temp.hearings_of('case-r') <> 0 then raise exception 'T4 FAIL: the approver (no grant of his own) reads the case'; end if;
  raise notice 'T4 PASS: a second super admin approves; expiry = approval + duration; the approver himself reads nothing';
end $$;
reset role;
do $$
begin
  if (select count(*) from public.notifications
       where user_id in ('00000000-0000-0000-0000-000000016a00', '00000000-0000-0000-0000-000000016a03')
         and title = 'وصول طارئ من إدارة المنصة إلى قضية مقيّدة') <> 2 then
    raise exception 'T4b FAIL: the firm owner and the managing partner were not both notified';
  end if;
  if (select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000016a01'
        and title = 'وصول طارئ من إدارة المنصة إلى قضية مقيّدة') <> 0 then
    raise exception 'T4b FAIL: the notice went beyond the firm owner and managing partners';
  end if;
  if (select count(*) from public.admin_audit_events
       where action in ('restricted_case_access_requested', 'restricted_case_access_approved') and target_id = 'case-r') <> 2 then
    raise exception 'T4b FAIL: request + approval are not audited once each';
  end if;
  if (select firm_notified_at from public.restricted_case_access_grants where id = current_setting('test.grant')::uuid) is null then
    raise exception 'T4b FAIL: firm_notified_at not stamped';
  end if;
  raise notice 'T4b PASS: firm owner + managing partner notified, both steps audited, firm_notified_at stamped';
end $$;
set role authenticated;

-- ── T5 the grantee reads; nobody can read the grant table ───────────────────
do $$
declare r jsonb;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  if pg_temp.hearings_of('case-r') <> 1 or not public.case_visible('case-r') then
    raise exception 'T5 FAIL: the grantee does not read the case during his window';
  end if;
  r := public.restricted_case_break_glass_read('case-r');
  if r #>> '{case,title}' <> 'قضية مقيّدة' or jsonb_array_length(r -> 'documents') <> 1
     or (r -> 'documents' -> 0) ? 'storage_path' then
    raise exception 'T5 FAIL: the break-glass read is wrong: %', r;
  end if;
  begin
    perform 1 from public.restricted_case_access_grants;
    raise exception 'T5 FAIL: a session reads the grant table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.restricted_case_grant_active('case-r');
    raise exception 'T5 FAIL: a session calls the internal grant check';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T5 PASS: the grantee reads the case and its documents list (no storage path) in his window; the grant table and check are closed';
end $$;
reset role;
do $$
begin
  if (select count(*) from public.restricted_case_open_log
       where request_id = 'case-r' and viewer_user_id = '00000000-0000-0000-0000-0000000165a1') <> 1 then
    raise exception 'T5b FAIL: the break-glass open is not in the restricted-case open log';
  end if;
  raise notice 'T5b PASS: the open is logged where the case''s filer and lead read it';
end $$;
set role authenticated;

-- ── T6 revoke ends it at once; a demoted super admin loses it ───────────────
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a2', false);
  perform public.restricted_case_access_revoke(current_setting('test.grant')::uuid);
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  if pg_temp.hearings_of('case-r') <> 0 then raise exception 'T6 FAIL: the revoked grantee still reads'; end if;
  raise notice 'T6 PASS: revoking ends the access immediately';
end $$;
reset role;
-- a live grant (fixture as postgres) for S1, then S1 is demoted to operations
insert into public.restricted_case_access_grants
  (request_id, firm_id, requested_by, reason, duration_minutes, approved_by, approved_at, expires_at)
values
  ('case-r', 'ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-0000000165a1',
   'وصول تجريبي حي لاختبار خفض الصلاحية', 60, '00000000-0000-0000-0000-0000000165a2', now(), now() + interval '1 hour'),
  ('case-r', 'ffffffff-0000-0000-0000-000000016f01', '00000000-0000-0000-0000-0000000165a2',
   'وصول منتهٍ لاختبار انتهاء المدة تلقائياً', 15, '00000000-0000-0000-0000-0000000165a1', now() - interval '2 hours', now() - interval '1 hour');
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  if pg_temp.hearings_of('case-r') <> 1 then raise exception 'T7 FAIL: the live fixture grant does not open the case'; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a2', false);
  if pg_temp.hearings_of('case-r') <> 0 then raise exception 'T7 FAIL: an EXPIRED grant still opens the case'; end if;
  raise notice 'T7 PASS: an expired grant opens nothing (no job needed)';
end $$;
reset role;
update public.platform_staff set staff_role = 'operations' where user_id = '00000000-0000-0000-0000-0000000165a1';
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  if pg_temp.hearings_of('case-r') <> 0 then raise exception 'T7b FAIL: a demoted super admin keeps his grant'; end if;
  raise notice 'T7b PASS: a grantee who is no longer a super admin reads nothing';
end $$;
reset role;

-- ── T8 the record cannot be rewritten or deleted ────────────────────────────
do $$
begin
  begin
    delete from public.restricted_case_access_grants;
    raise exception 'T8 FAIL: a grant row was deleted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.restricted_case_access_grants set reason = 'سبب آخر مختلف تماماً عن الأصل' where id = current_setting('test.grant')::uuid;
    raise exception 'T8 FAIL: the reason was rewritten';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.restricted_case_access_grants set expires_at = now() + interval '9 hours' where id = current_setting('test.grant')::uuid;
    raise exception 'T8 FAIL: an approved expiry was extended';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T8 PASS: grants are never deleted; the request and a taken decision never change (even as postgres)';
end $$;

-- ── T9 a request left 24 h unapproved lapses ────────────────────────────────
update public.platform_staff set staff_role = 'super_admin' where user_id = '00000000-0000-0000-0000-0000000165a1';
insert into public.restricted_case_access_grants (id, request_id, firm_id, requested_by, reason, requested_at)
values ('99999999-0000-0000-0000-000000000016', 'case-r', 'ffffffff-0000-0000-0000-000000016f01',
        '00000000-0000-0000-0000-0000000165a2', 'طلب قديم لم يوافق عليه أحد خلال يوم', now() - interval '25 hours');
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000165a1', false);
  begin
    perform public.restricted_case_access_approve('99999999-0000-0000-0000-000000000016', null);
    raise exception 'T9 FAIL: a lapsed request was approved';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'T9 PASS: a request not approved within 24 hours cannot be approved';
end $$;
reset role;

select 'restricted_case_break_glass: ALL PASS';
