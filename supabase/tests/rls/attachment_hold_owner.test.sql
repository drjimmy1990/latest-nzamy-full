-- attachment_hold_owner.test.sql — proves 20261206_11 (l16, owner س٢٠٣):
-- either party may PLACE a hold on any file of its request; only the file's
-- owner (or a case supervisor for a team member's file, or an admin) LIFTS it;
-- only the owner bins or restores; the other party asks («طلب رفع الحجز»).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 11 runs TWICE.
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $R/prelude_attachments_live.sql \
--     $R/prelude_attachments_stray_insert_policies.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $R/prelude_document_shares_live.sql \
--     $M/20261026_66_document_shares_path_ownership.sql \
--     $M/20261026_72_file_folder_owner.sql \
--     $M/20261203_80_vault_document_session_columns.sql \
--     $M/20261206_11_attachment_hold_owner.sql \
--     $M/20261206_11_attachment_hold_owner.sql \
--     $R/attachment_hold_owner.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261206_11 lines →
--   "T0 FAIL: trg_03_attachments_hold_owner is missing"; with the T0 block
--   removed → "T2 FAIL: the lawyer lifted the client's hold".
--
-- People:
--   C  client, filer of req-c (solo, assigned to L) and of case-k (firm F, lead L2)
--   L  lawyer, assignee of req-c
--   O  owner of firm F;  L2 active lawyer of F, lead of case-k;  T trainee of F
--   AD platform admin, assignee of req-ai (an AI-workspace order of C)
--   X  a stranger
-- Every assertion RAISES on failure. Sessions run as role `authenticated`.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('c0000000-0000-0000-0000-00000000000c'), ('10000000-0000-0000-0000-00000000001a'),
  ('0f000000-0000-0000-0000-0000000000f0'), ('20000000-0000-0000-0000-00000000002b'),
  ('70000000-0000-0000-0000-00000000007e'), ('ad000000-0000-0000-0000-0000000000ad'),
  ('80000000-0000-0000-0000-00000000008a');
insert into public.profiles (id, user_type, display_name) values
  ('c0000000-0000-0000-0000-00000000000c', 'individual', 'C موكل'),
  ('10000000-0000-0000-0000-00000000001a', 'lawyer',     'L محامٍ'),
  ('0f000000-0000-0000-0000-0000000000f0', 'firm',       'O صاحب المكتب'),
  ('20000000-0000-0000-0000-00000000002b', 'lawyer',     'L2 محامي المكتب'),
  ('70000000-0000-0000-0000-00000000007e', 'lawyer',     'T متدرب'),
  ('ad000000-0000-0000-0000-0000000000ad', 'admin',      'AD إدارة'),
  ('80000000-0000-0000-0000-00000000008a', 'individual', 'X غريب');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '0f000000-0000-0000-0000-0000000000f0', 'مكتب F');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-00000000002b', 'lawyer',  'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '70000000-0000-0000-0000-00000000007e', 'trainee', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, receiver, firm_id) values
  ('req-c',  'c0000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000001a', 'طلب C', 'lawyer', null),
  ('case-k', 'c0000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-00000000002b', 'قضية C لدى المكتب', 'lawyer', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('req-ai', 'c0000000-0000-0000-0000-00000000000c', 'ad000000-0000-0000-0000-0000000000ad', 'طلب ذكاء', 'ai_workspace', null),
  -- self-filed firm case: T (member) filed it, L2 leads it
  ('case-s', '70000000-0000-0000-0000-00000000007e', '20000000-0000-0000-0000-00000000002b', 'قضية المكتب الذاتية', 'lawyer', 'ffffffff-0000-0000-0000-0000000000f1');
-- Fixtures written as postgres.
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path, mime_type, size_bytes) values
  (902, 'req-c',  'c0000000-0000-0000-0000-00000000000c', 'دليل C.pdf',  'c0000000-0000-0000-0000-00000000000c/2-case.pdf', 'application/pdf', 200),
  (903, 'req-c',  '10000000-0000-0000-0000-00000000001a', 'مذكرة L.pdf', '10000000-0000-0000-0000-00000000001a/3-memo.pdf', 'application/pdf', 300),
  (904, 'case-k', '70000000-0000-0000-0000-00000000007e', 'مسودة T.pdf', '70000000-0000-0000-0000-00000000007e/4-draft.pdf', 'application/pdf', 400),
  (905, 'case-k', 'c0000000-0000-0000-0000-00000000000c', 'عقد C.pdf',   'c0000000-0000-0000-0000-00000000000c/5-k.pdf', 'application/pdf', 500),
  (906, 'req-ai', 'c0000000-0000-0000-0000-00000000000c', 'ملف C.pdf',   'c0000000-0000-0000-0000-00000000000c/6-ai.pdf', 'application/pdf', 600),
  (907, 'case-k', '20000000-0000-0000-0000-00000000002b', 'مذكرة L2.pdf', '20000000-0000-0000-0000-00000000002b/7-l2.pdf', 'application/pdf', 700),
  (908, 'case-s', '70000000-0000-0000-0000-00000000007e', 'لائحة T.pdf', '70000000-0000-0000-0000-00000000007e/8-t.pdf', 'application/pdf', 800);

-- ── T0 the trigger ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.attachments'::regclass
                  and tgname = 'trg_03_attachments_hold_owner' and tgenabled <> 'D') then
    raise exception 'T0 FAIL: trg_03_attachments_hold_owner is missing';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.attachments'::regclass
       and tgname = 'trg_03_attachments_hold_owner') <> 1 then
    raise exception 'T0 FAIL: the trigger is not there exactly once after two runs';
  end if;
  raise notice 'T0 PASS: the hold/bin owner guard is on attachments (once)';
end $$;

set role authenticated;

-- ── T1 either party places a hold on any file of the request ────────────────
select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
declare n int;
begin
  update public.attachments set legal_hold = true, hold_reason = 'حفظ دليل' where id = 902;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1 FAIL: the lawyer could not place a hold on the client''s file (% rows)', n; end if;
  raise notice 'T1 PASS: the other party places a hold on a file that is not his';
end $$;

-- ── T2 … but cannot lift it, change its reason, or bin the file ─────────────
do $$
begin
  begin
    update public.attachments set legal_hold = false, hold_reason = null where id = 902;
    raise exception 'T2 FAIL: the lawyer lifted the client''s hold';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set hold_reason = 'سبب آخر' where id = 902;
    raise exception 'T2 FAIL: the lawyer rewrote the reason of the client''s hold';
  exception when insufficient_privilege then null;
  end;
  if not (select legal_hold from public.attachments where id = 902) then
    raise exception 'T2 FAIL: the hold is gone';
  end if;
  raise notice 'T2 PASS: the other party cannot lift a hold or rewrite its reason (42501)';
end $$;

-- ── T3 the owner lifts his own hold, whoever placed it ──────────────────────
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  update public.attachments set legal_hold = false, hold_reason = null where id = 902;
  get diagnostics n = row_count;
  if n <> 1 or (select legal_hold from public.attachments where id = 902) then
    raise exception 'T3 FAIL: the owner could not lift the hold on his file';
  end if;
  raise notice 'T3 PASS: the owner lifts the hold on his own file';
end $$;

-- ── T4 bin / restore: the owner only ─────────────────────────────────────────
do $$
declare ok boolean;
begin
  -- C (party) bins L's memo → refused
  begin
    update public.attachments set deleted_at = now(), deleted_by = auth.uid() where id = 903;
    raise exception 'T4 FAIL: the client binned the lawyer''s file';
  exception when insufficient_privilege then null;
  end;
  -- C bins his own file → allowed
  update public.attachments set deleted_at = now(), deleted_by = auth.uid() where id = 902;
  if (select deleted_at from public.attachments where id = 902) is null then
    raise exception 'T4 FAIL: the owner could not bin his own file';
  end if;
  raise notice 'T4 PASS: a party bins only his own file';
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
declare ok boolean;
begin
  begin
    update public.attachments set deleted_at = null, deleted_by = null where id = 902;
    raise exception 'T4b FAIL: the lawyer restored the client''s file by a direct update';
  exception when insufficient_privilege then null;
  end;
  select public.restore_case_document(902) into ok;
  if ok then raise exception 'T4b FAIL: the lawyer restored the client''s file through restore_case_document'; end if;
  begin
    update public.attachments set deleted_at = now(), deleted_by = auth.uid() where id = 902;
    raise exception 'T4b FAIL: the lawyer re-binned the client''s file';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4b PASS: the other party neither restores (update or RPC) nor bins the owner''s file';
end $$;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare ok boolean;
begin
  select public.restore_case_document(902) into ok;
  if not ok or (select deleted_at from public.attachments where id = 902) is not null then
    raise exception 'T4c FAIL: the owner could not restore his file through restore_case_document';
  end if;
  raise notice 'T4c PASS: the owner restores his own file';
end $$;

-- ── T5 «طلب رفع الحجز» ───────────────────────────────────────────────────────
-- L's memo is on hold; C (the other party) cannot lift it and asks L to.
reset role;
update public.attachments set legal_hold = true, hold_reason = 'حجز المحامي' where id = 903;
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare r1 bigint; r2 bigint;
begin
  begin
    update public.attachments set legal_hold = false, hold_reason = null where id = 903;
    raise exception 'T5 FAIL: the client lifted the lawyer''s hold';
  exception when insufficient_privilege then null;
  end;
  r1 := public.request_attachment_hold_lift(903, 'أحتاج الملف');
  r2 := public.request_attachment_hold_lift(903, 'مرة ثانية');
  if r1 is null or r1 <> r2 then raise exception 'T5 FAIL: a repeat within 24 hours made a second request'; end if;
  if not (select legal_hold from public.attachments where id = 903) then
    raise exception 'T5 FAIL: the request changed the file';
  end if;
  if (select count(*) from public.attachment_hold_lift_requests where attachment_id = 903) <> 1 then
    raise exception 'T5 FAIL: the requester cannot read his request';
  end if;
  begin
    insert into public.attachment_hold_lift_requests (attachment_id, requested_by) values (903, auth.uid());
    raise exception 'T5 FAIL: a session wrote the request table directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.request_attachment_hold_lift(902, null);   -- his own file, not on hold
    raise exception 'T5 FAIL: a request on one''s own file was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'T5 PASS: the other party asks (one row per 24 h), the file is untouched, the table is not writable';
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
begin
  if (select count(*) from public.attachment_hold_lift_requests where attachment_id = 903) <> 1 then
    raise exception 'T5b FAIL: the file owner cannot read the request';
  end if;
  begin
    perform public.request_attachment_hold_lift(903, null);
    raise exception 'T5b FAIL: the owner asked himself';
  exception when invalid_parameter_value then null;
  end;
  update public.attachments set legal_hold = false, hold_reason = null where id = 903;
  if (select legal_hold from public.attachments where id = 903) then
    raise exception 'T5b FAIL: the owner could not lift his own hold';
  end if;
  raise notice 'T5b PASS: the owner reads the request and lifts the hold himself';
end $$;
select set_config('test.uid', '80000000-0000-0000-0000-00000000008a', false);
do $$
begin
  if (select count(*) from public.attachment_hold_lift_requests) <> 0 then
    raise exception 'T5c FAIL: a stranger reads hold-lift requests';
  end if;
  begin
    perform public.request_attachment_hold_lift(903, null);
    raise exception 'T5c FAIL: a stranger filed a hold-lift request';
  exception when no_data_found then null;
  end;
  raise notice 'T5c PASS: a stranger neither reads nor files a request («no such file»)';
end $$;
reset role;
do $$
begin
  if (select count(*) from public.notifications where user_id = '10000000-0000-0000-0000-00000000001a'
        and title = 'طلب رفع الحجز عن ملف') <> 1 then
    raise exception 'T5d FAIL: the file owner was not notified once';
  end if;
  if (select count(*) from public.notifications where user_id = 'ad000000-0000-0000-0000-0000000000ad'
        and title = 'طلب رفع الحجز عن ملف') <> 1 then
    raise exception 'T5d FAIL: the admin was not notified once';
  end if;
  if (select count(*) from public.admin_audit_events where action = 'attachment_hold_lift_requested' and target_id = '903') <> 1 then
    raise exception 'T5d FAIL: no single audit row';
  end if;
  begin
    update public.attachment_hold_lift_requests set reason = 'x';
    raise exception 'T5d FAIL: the request table is not append-only';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T5d PASS: owner + admin notified once, one audit row, append-only';
end $$;
set role authenticated;

-- ── T6 firm case: the lead manages a team member's file, never the client's ─
reset role;
update public.attachments set legal_hold = true, hold_reason = 'حجز' where id in (904, 905);
set role authenticated;
select set_config('test.uid', '20000000-0000-0000-0000-00000000002b', false);
do $$
begin
  update public.attachments set legal_hold = false, hold_reason = null where id = 904;
  if (select legal_hold from public.attachments where id = 904) then
    raise exception 'T6 FAIL: the lead could not lift the hold on the trainee''s file';
  end if;
  update public.attachments set deleted_at = now(), deleted_by = auth.uid() where id = 904;
  if (select deleted_at from public.attachments where id = 904) is null then
    raise exception 'T6 FAIL: the lead could not bin the trainee''s file';
  end if;
  begin
    update public.attachments set legal_hold = false, hold_reason = null where id = 905;
    raise exception 'T6 FAIL: the lead lifted the client''s hold';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T6 PASS: the case lead manages a team member''s file but not the client''s';
end $$;
select set_config('test.uid', '0f000000-0000-0000-0000-0000000000f0', false);
do $$
declare ok boolean;
begin
  select public.restore_case_document(904) into ok;
  if not ok then raise exception 'T6b FAIL: the firm owner could not restore the trainee''s archived file'; end if;
  raise notice 'T6b PASS: the firm owner still restores a team member''s archived file';
end $$;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
begin
  begin
    update public.attachments set deleted_at = now(), deleted_by = auth.uid() where id = 904;
    raise exception 'T6c FAIL: the client binned the firm''s file';
  exception when insufficient_privilege then null;
  end;
  update public.attachments set legal_hold = true, hold_reason = 'حجز الموكل' where id = 904;
  if not (select legal_hold from public.attachments where id = 904) then
    raise exception 'T6c FAIL: the client could not place a hold on the firm''s file';
  end if;
  raise notice 'T6c PASS: the client places a hold on, but cannot bin, the firm''s file';
end $$;

-- ── T6d firm access to the firm's OWN files is unchanged ─────────────────────
-- (the lead's own file on a client case; a colleague-filer's file on a
-- self-filed firm case)
reset role;
update public.attachments set deleted_at = now(), deleted_by = '20000000-0000-0000-0000-00000000002b' where id = 907;
update public.attachments set legal_hold = true, hold_reason = 'حجز المتدرب' where id = 908;
set role authenticated;
select set_config('test.uid', '0f000000-0000-0000-0000-0000000000f0', false);
do $$
declare ok boolean;
begin
  select public.restore_case_document(907) into ok;
  if not ok then raise exception 'T6d FAIL: the firm owner could not restore the lead''s archived file'; end if;
  raise notice 'T6d PASS: the firm owner restores the lead''s own archived file';
end $$;
select set_config('test.uid', '20000000-0000-0000-0000-00000000002b', false);
do $$
begin
  update public.attachments set legal_hold = false, hold_reason = null where id = 908;
  if (select legal_hold from public.attachments where id = 908) then
    raise exception 'T6e FAIL: the lead could not lift the hold on the filer-colleague''s file';
  end if;
  begin
    update public.attachments set legal_hold = false, hold_reason = null where id = 905;
    if (select legal_hold from public.attachments where id = 905) = false then
      raise exception 'T6e FAIL: the lead lifted the client''s hold';
    end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'T6e PASS: on a self-filed firm case the lead manages the filer-colleague''s file; still never the client''s';
end $$;

-- ── T7 admin: lifts (session as a party, or service role), never bins ───────
reset role;
update public.attachments set legal_hold = true, hold_reason = 'حجز' where id = 906;
set role authenticated;
select set_config('test.uid', 'ad000000-0000-0000-0000-0000000000ad', false);
do $$
begin
  begin
    update public.attachments set deleted_at = now(), deleted_by = auth.uid() where id = 906;
    raise exception 'T7 FAIL: the admin binned the client''s file';
  exception when insufficient_privilege then null;
  end;
  update public.attachments set legal_hold = false, hold_reason = null where id = 906;
  if (select legal_hold from public.attachments where id = 906) then
    raise exception 'T7 FAIL: the admin could not lift the hold';
  end if;
  raise notice 'T7 PASS: an admin lifts a hold, but bins nothing that is not his';
end $$;
reset role;
set role service_role;
do $$
begin
  update public.attachments set legal_hold = false, hold_reason = null where id = 905;
  if (select legal_hold from public.attachments where id = 905) then
    raise exception 'T7b FAIL: the service role could not lift the hold';
  end if;
  raise notice 'T7b PASS: the service role (the admin route) lifts a hold';
end $$;
reset role;

-- ── T8 a stranger updates nothing ───────────────────────────────────────────
set role authenticated;
select set_config('test.uid', '80000000-0000-0000-0000-00000000008a', false);
do $$
declare n int;
begin
  update public.attachments set legal_hold = true where id in (902, 903);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T8 FAIL: a stranger changed % rows', n; end if;
  raise notice 'T8 PASS: a stranger updates no row (RLS unchanged)';
end $$;
reset role;

select 'attachment_hold_owner: ALL PASS';
