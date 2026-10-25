-- soft_delete_case_records.test.sql — proves 20261025_51 (P6 N3.9, owner
-- directive ٥: no hard delete of case notes or case documents; archive, owner
-- notified, one-click restore, a kept trail).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $T/prelude_attachments_live.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $T/soft_delete_case_records.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-25):
--   NC1 — the chain without the two 20261025_51 lines → T1 fails: the staff
--         member's DELETE of his own note succeeds ("T1 FAIL: a staff member
--         hard-deleted a case note").
--   NC2 — the chain without prelude_attachments_live.sql → the migration
--         refuses: "attachments.deleted_at is missing".
--   NC3 — the 20261025_51 of commit 4753b25c (no case-document freeze) →
--         "T11 FAIL: the uploader moved a case document out of its case".
--   NC4 — `… 20261025_51, 20261017_41` then only the verify:soft_delete_case_
--         records section of _verify.sql → it raises "a DELETE policy is back
--         on case_notes" (20261017_41's own verify passes on that re-run).
--
-- People (firm F, owner O — managing partner by the 20260903_phase2 trigger):
--   L  lawyer of F, lead of case-x and case-solo
--   S  legal secretary of F (staff)
--   M  lawyer of F (staff), not on case-x
--   K  a client, filer of case-z (a firm case led by L)
--   G  owner of another firm F2
-- Every assertion RAISES on failure. Runs as role `authenticated` (what
-- PostgREST uses for a signed-in request); app_user holds direct grants here.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000f'), ('11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002'), ('33333333-0000-0000-0000-000000000003'),
  ('44444444-0000-0000-0000-000000000004'), ('55555555-0000-0000-0000-000000000005');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000000f', 'firm',       'O صاحب المكتب'),
  ('11111111-0000-0000-0000-000000000001', 'lawyer',     'L المحامي'),
  ('22222222-0000-0000-0000-000000000002', 'individual', 'S السكرتير'),
  ('33333333-0000-0000-0000-000000000003', 'lawyer',     'M محامٍ'),
  ('44444444-0000-0000-0000-000000000004', 'individual', 'K موكل'),
  ('55555555-0000-0000-0000-000000000005', 'firm',       'G مكتب آخر');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000f', 'مكتب الاختبار'),
  ('ffffffff-0000-0000-0000-0000000000f2', '55555555-0000-0000-0000-000000000005', 'مكتب آخر');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001', 'lawyer',          'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '22222222-0000-0000-0000-000000000002', 'legal_secretary', 'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-000000000003', 'lawyer',          'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-x',    '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'قضية المكتب', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('case-z',    '44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'قضية رفعها العميل', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('case-solo', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'قضية فردية', null);

-- Notes, written as postgres (fixtures): S's firm note and M's private note on
-- case-x, L's firm note on case-z, L's note on the solo case.
insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'case-x', '22222222-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-0000000000f1', 'firm',    'مذكرة السكرتير السرية-١'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'case-x', '33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', 'private', 'ملاحظة خاصة بـ M'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'case-z', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'firm',    'ملاحظة L على قضية العميل'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'case-solo', '11111111-0000-0000-0000-000000000001', null, 'private', 'ملاحظة القضية الفردية'),
  -- M's note to case-x's team. The team is L (lead and filer); M writes as an
  -- active firm member. O owns the firm but is NOT on this team.
  ('aaaaaaaa-0000-0000-0000-000000000005', 'case-x', '33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', 'case_team', 'ملاحظة فريق القضية');

set role authenticated;

-- ── T1 a staff member cannot hard-delete — not even his own note ────────────
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
begin
  begin
    delete from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if found then raise exception 'T1 FAIL: a staff member hard-deleted a case note'; end if;
    raise exception 'T1 FAIL: DELETE on case_notes is still permitted for sessions (0 rows, but no 42501)';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.case_notes set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'T1 FAIL: a session wrote deleted_at directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T1 PASS: DELETE on case_notes and a direct deleted_at write both answer 42501';
end $$;

-- ── T2 the staff member archives his note: trail + the owner is told ────────
do $$
declare ok boolean; n int; body text;
begin
  -- not someone else's
  select public.archive_case_note('aaaaaaaa-0000-0000-0000-000000000003') into ok;
  if ok then raise exception 'T2 FAIL: S archived L''s note'; end if;

  select public.archive_case_note('aaaaaaaa-0000-0000-0000-000000000001') into ok;
  if not ok then raise exception 'T2 FAIL: S could not archive his own note'; end if;
  select count(*) into n from public.case_notes
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is not null
     and deleted_by = '22222222-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'T2 FAIL: the archived note is not stamped with S'; end if;
  select count(*) into n from public.case_record_history
   where record_kind = 'case_note' and record_id = 'aaaaaaaa-0000-0000-0000-000000000001' and action = 'archived'
     and actor_user_id = '22222222-0000-0000-0000-000000000002' and snapshot->>'body' = 'مذكرة السكرتير السرية-١';
  if n <> 1 then raise exception 'T2 FAIL: no history row (with the snapshot) for the archive'; end if;
  raise notice 'T2 PASS: S archives only his own note; deleted_by is S; the trail keeps the snapshot';
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000000f' and href = '/dashboard/firm/cases/case-x';
  if n <> 1 then raise exception 'T2b FAIL: the firm owner got % notifications, expected 1', n; end if;
  select count(*) into n from public.notifications where body like '%السرية-١%';
  if n <> 0 then raise exception 'T2b FAIL: a notification carries the note''s text'; end if;
  raise notice 'T2b PASS: the firm owner is notified, without the note''s content';
end $$;
set role authenticated;

-- ── T3 a staff colleague neither sees nor restores another's archived note ──
select set_config('test.uid', '33333333-0000-0000-0000-000000000003', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T3 FAIL: M still reads S''s archived firm note'; end if;
  select count(*) into n from public.case_record_history where record_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'T3 FAIL: M reads the trail of S''s note'; end if;
  select public.restore_case_note('aaaaaaaa-0000-0000-0000-000000000001') into ok;
  if ok then raise exception 'T3 FAIL: M restored S''s note'; end if;
  raise notice 'T3 PASS: a staff colleague cannot see, trace or restore another''s archived note';
end $$;

-- ── T4 M archives his PRIVATE note: nobody else sees it, nobody is told ─────
do $$
declare ok boolean;
begin
  select public.archive_case_note('aaaaaaaa-0000-0000-0000-000000000002') into ok;
  if not ok then raise exception 'T4 FAIL: M could not archive his private note'; end if;
  raise notice 'T4 PASS: M archives his private note';
end $$;

-- ── T5 the case lead and the firm owner see S's archived note; the other
--       firm's owner does not; nobody but M sees M's private one ─────────────
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is not null;
  if n <> 1 then raise exception 'T5 FAIL: the case lead cannot see the archived note in «المحذوفات»'; end if;
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'T5 FAIL: the lead reads M''s archived PRIVATE note'; end if;
  raise notice 'T5 PASS (lead): sees the archived firm note, not the private one';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'T5 FAIL: the firm owner reads M''s archived PRIVATE note'; end if;
  select count(*) into n from public.case_record_history where record_id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'T5 FAIL: the firm owner reads the trail (and body) of a private note'; end if;
  select public.restore_case_note('aaaaaaaa-0000-0000-0000-000000000002') into ok;
  if ok then raise exception 'T5 FAIL: the firm owner restored a private note'; end if;
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is not null;
  if n <> 1 then raise exception 'T5 FAIL: the firm owner cannot see S''s archived note'; end if;
  raise notice 'T5 PASS (owner): sees the archived firm note; the private note, its trail and its restore stay M''s';
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.notifications where user_id = '00000000-0000-0000-0000-00000000000f';
  if n <> 1 then raise exception 'T5b FAIL: archiving a private note notified the owner (% rows)', n; end if;
end $$;

-- ── T5c an archived CASE-TEAM note stays with the team (owner ١٦٩) ─────────
set role authenticated;
select set_config('test.uid', '33333333-0000-0000-0000-000000000003', false);
do $$
declare ok boolean;
begin
  select public.archive_case_note('aaaaaaaa-0000-0000-0000-000000000005') into ok;
  if not ok then raise exception 'T5c FAIL: M could not archive his case-team note'; end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000005';
  if n <> 0 then raise exception 'T5c FAIL: the firm owner, not on the team, reads an archived case-team note'; end if;
  select count(*) into n from public.case_record_history where record_id = 'aaaaaaaa-0000-0000-0000-000000000005';
  if n <> 0 then raise exception 'T5c FAIL: the firm owner reads the trail (and body) of a case-team note'; end if;
  select public.restore_case_note('aaaaaaaa-0000-0000-0000-000000000005') into ok;
  if ok then raise exception 'T5c FAIL: the firm owner restored a case-team note of a team he is not on'; end if;
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000005' and deleted_at is not null;
  if n <> 1 then raise exception 'T5c FAIL: the lead (on the team) cannot see the archived case-team note'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.notifications where user_id = '00000000-0000-0000-0000-00000000000f';
  if n <> 1 then raise exception 'T5c FAIL: the owner was notified of a case-team note of a team he is not on (% rows)', n; end if;
  raise notice 'T5c PASS: an archived case-team note stays with the team: the off-team owner neither sees, traces, restores nor is told; the lead sees it';
end $$;
set role authenticated;
select set_config('test.uid', '55555555-0000-0000-0000-000000000005', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.case_notes where request_id = 'case-x';
  if n <> 0 then raise exception 'T5 FAIL: another firm''s owner reads case-x notes'; end if;
  select public.restore_case_note('aaaaaaaa-0000-0000-0000-000000000001') into ok;
  if ok then raise exception 'T5 FAIL: another firm''s owner restored a note'; end if;
  raise notice 'T5 PASS (G): another firm''s owner sees and restores nothing';
end $$;

-- ── T6 the author cannot edit an archived note; the owner restores in one call
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  update public.case_notes set body = 'تعديل بعد الأرشفة' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6 FAIL: an archived note was edited'; end if;
  raise notice 'T6 PASS: an archived note is read-only';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare ok boolean; n int;
begin
  select public.restore_case_note('aaaaaaaa-0000-0000-0000-000000000001') into ok;
  if not ok then raise exception 'T6 FAIL: the firm owner could not restore S''s note'; end if;
  select count(*) into n from public.case_record_history
   where record_id = 'aaaaaaaa-0000-0000-0000-000000000001' and action = 'restored'
     and actor_user_id = '00000000-0000-0000-0000-00000000000f';
  if n <> 1 then raise exception 'T6 FAIL: no history row for the restore'; end if;
  raise notice 'T6 PASS: the firm owner restores the note; the trail records it';
end $$;
select set_config('test.uid', '33333333-0000-0000-0000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.case_notes where id = 'aaaaaaaa-0000-0000-0000-000000000001' and deleted_at is null;
  if n <> 1 then raise exception 'T6 FAIL: the restored firm note is not back for M'; end if;
  raise notice 'T6 PASS: the restored firm note reads normally again';
end $$;

-- ── T6b the author still edits a LIVE note — the exact PATCH shape of
--       /api/v1/cases/[id]/notes/[noteId] (body, visibility, firm_id, then
--       RETURNING the CASE_NOTE_SELECT columns), under the new column grant
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare rec record;
begin
  update public.case_notes
     set body = 'مذكرة بعد الاسترجاع', visibility = 'firm', firm_id = 'ffffffff-0000-0000-0000-0000000000f1'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001' and request_id = 'case-x'
  returning id, request_id, author_user_id, firm_id, visibility, body, created_at, updated_at into rec;
  if rec.id is null then raise exception 'T6b FAIL: the author could not edit his restored note'; end if;
  begin
    update public.case_notes set request_id = 'case-z' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'T6b FAIL: a note was moved to another case';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T6b PASS: the PATCH shape works under the column grant; request_id cannot move';
end $$;

-- ── T7 a client never supervises: L archives his note on the client's case ──
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare ok boolean;
begin
  select public.archive_case_note('aaaaaaaa-0000-0000-0000-000000000003') into ok;
  if not ok then raise exception 'T7 FAIL: L could not archive his note on case-z'; end if;
  select public.archive_case_note('aaaaaaaa-0000-0000-0000-000000000004') into ok;
  if not ok then raise exception 'T7 FAIL: L could not archive his solo-case note'; end if;
end $$;
select set_config('test.uid', '44444444-0000-0000-0000-000000000004', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.case_notes where request_id = 'case-z';
  if n <> 0 then raise exception 'T7 FAIL: the client reads an archived note of his case'; end if;
  select public.restore_case_note('aaaaaaaa-0000-0000-0000-000000000003') into ok;
  if ok then raise exception 'T7 FAIL: the client restored a lawyer''s note'; end if;
  raise notice 'T7 PASS: the client (filer of the case) is never a supervisor';
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.case_record_history where request_id = 'case-solo' and action = 'archived';
  if n <> 1 then raise exception 'T7b FAIL: the solo case archive left no trail'; end if;
  select count(*) into n from public.notifications;
  if n <> 2 then raise exception 'T7b FAIL: % notifications, expected 2 (S''s archive and L''s on case-z; none for the solo case)', n; end if;
  raise notice 'T7b PASS: a solo case is trailed, and nobody is notified for it';
end $$;
set role authenticated;

-- ── T8 documents: archive stamps the real actor, the owner restores, no DELETE
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare doc bigint; n int;
begin
  insert into public.attachments (request_id, owner_user_id, file_name, storage_path, mime_type)
  values ('case-x', '22222222-0000-0000-0000-000000000002', 'لائحة.pdf', 'case-x/لائحة.pdf', 'application/pdf')
  returning id into doc;
  perform set_config('test.doc', doc::text, false);

  begin
    delete from public.attachments where id = doc;
    raise exception 'T8 FAIL: DELETE on attachments is permitted for sessions';
  exception when insufficient_privilege then null;
  end;

  -- the Phase 6 soft delete, with a forged deleted_by
  update public.attachments set deleted_at = now(), deleted_by = '44444444-0000-0000-0000-000000000004' where id = doc;
  select count(*) into n from public.attachments where id = doc and deleted_by = '22222222-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'T8 FAIL: deleted_by was not stamped from the session'; end if;
  raise notice 'T8 PASS: no DELETE on case documents; the archive is stamped with the real actor';
end $$;
select set_config('test.uid', '33333333-0000-0000-0000-000000000003', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.attachments where id = current_setting('test.doc')::bigint;
  if n <> 0 then raise exception 'T8 FAIL: a staff colleague sees another''s archived document'; end if;
  select public.restore_case_document(current_setting('test.doc')::bigint) into ok;
  if ok then raise exception 'T8 FAIL: a staff colleague restored another''s document'; end if;
  raise notice 'T8 PASS: a staff colleague neither sees nor restores another''s archived document';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare n int; ok boolean;
begin
  select count(*) into n from public.attachments where id = current_setting('test.doc')::bigint and deleted_at is not null;
  if n <> 1 then raise exception 'T8 FAIL: the firm owner cannot see the archived document'; end if;
  select public.restore_case_document(current_setting('test.doc')::bigint) into ok;
  if not ok then raise exception 'T8 FAIL: the firm owner could not restore the document'; end if;
  select count(*) into n from public.attachments where id = current_setting('test.doc')::bigint;
  if n <> 0 then raise exception 'T8 FAIL: the owner still reads the RESTORED (live) document — the new arm must cover archived rows only'; end if;
  raise notice 'T8 PASS: the firm owner sees and restores the archived document (and only archived ones)';
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.case_record_history where record_kind = 'case_document';
  if n <> 2 then raise exception 'T8b FAIL: % document trail rows, expected 2 (archived, restored)', n; end if;
  select count(*) into n from public.case_record_history where record_kind = 'case_document' and snapshot ? 'storage_path';
  if n <> 0 then raise exception 'T8b FAIL: the trail copied a storage path'; end if;
  select count(*) into n from public.notifications where title = 'أُرشف مستند من قضية';
  if n <> 1 then raise exception 'T8b FAIL: the owner was not notified of the document archive'; end if;
  raise notice 'T8b PASS: the document trail has both rows, no storage path; the owner was notified';
end $$;

-- ── T9 the trail is append-only for every API role ──────────────────────────
do $$
declare r text;
begin
  foreach r in array array['authenticated', 'service_role'] loop
    execute format('set local role %I', r);
    begin
      delete from public.case_record_history;
      raise exception 'T9 FAIL: % deleted the trail', r;
    exception when insufficient_privilege then null;
    end;
    begin
      update public.case_record_history set action = 'restored';
      raise exception 'T9 FAIL: % rewrote the trail', r;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.case_record_history (record_kind, record_id, action) values ('case_note', 'x', 'archived');
      raise exception 'T9 FAIL: % planted a trail row', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  raise notice 'T9 PASS: no API role (service_role included) can insert, update or delete case_record_history';
end $$;

-- ── T10 deleting the archiving account is not blocked (FK ON DELETE SET NULL)
set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare doc bigint;
begin
  insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
  values ('case-x', '22222222-0000-0000-0000-000000000002', 'مذكرة.docx', 'case-x/مذكرة.docx')
  returning id into doc;
  perform set_config('test.doc2', doc::text, false);
end $$;
-- L (the case lead, a participant) archives S's upload
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  update public.attachments set deleted_at = now() where id = current_setting('test.doc2')::bigint;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T10 FAIL: the lead could not archive the document'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  begin
    delete from auth.users where id = '11111111-0000-0000-0000-000000000001';
  exception when others then
    raise exception 'T10 FAIL: deleting the account that archived a document fails (%): the stamp trigger fights ON DELETE SET NULL', sqlerrm;
  end;
  select count(*) into n from public.attachments
   where id = current_setting('test.doc2')::bigint and deleted_at is not null and deleted_by is null;
  if n <> 1 then raise exception 'T10 FAIL: the document lost its archive, or deleted_by still names the deleted account'; end if;
  select count(*) into n from public.case_record_history
   where record_id = current_setting('test.doc2') and actor_user_id = '11111111-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'T10 FAIL: the trail lost the actor'; end if;
  raise notice 'T10 PASS: deleting the archiving account succeeds; the document stays archived and the trail keeps the actor';
end $$;

-- ── T11 a case document cannot be detached from its case (then purged as a
--        vault document) nor pointed at another file; binding still works ──
set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
declare vault bigint; n int;
begin
  -- S uploaded test.doc2 to case-x; "attachments owner update" admits him.
  begin
    update public.attachments set request_id = null where id = current_setting('test.doc2')::bigint;
    raise exception 'T11 FAIL: the uploader moved a case document out of its case (DELETE ?permanent=1 / the cron would then purge it)';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set storage_path = '22222222-0000-0000-0000-000000000002/other.pdf'
     where id = current_setting('test.doc2')::bigint;
    raise exception 'T11 FAIL: the uploader re-pointed a case document at another file';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set request_id = 'case-solo' where id = current_setting('test.doc2')::bigint;
    raise exception 'T11 FAIL: a case document moved to another case';
  exception when insufficient_privilege then null;
  end;
  -- a personal vault document of S, then bound to case-x the way POST
  -- /api/v1/service-requests does it (service role, null → id)
  insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
  values (null, '22222222-0000-0000-0000-000000000002', 'خزنة.pdf', '22222222-0000-0000-0000-000000000002/خزنة.pdf')
  returning id into vault;
  update public.attachments set file_name = 'خزنة-٢.pdf', storage_path = '22222222-0000-0000-0000-000000000002/خزنة-٢.pdf'
   where id = vault;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T11 FAIL: a vault document (no case) can no longer be edited by its owner'; end if;
  perform set_config('test.vault', vault::text, false);
end $$;
reset role;
do $$
declare n int;
begin
  execute 'set local role service_role';
  update public.attachments set request_id = 'case-x' where id = current_setting('test.vault')::bigint and request_id is null;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'T11 FAIL: binding a vault document to a case (null → id) is refused'; end if;
  raise notice 'T11 PASS: a case document keeps its case and its file (42501); a vault document is still editable and bindable';
end $$;

-- ── T12 a notification that cannot be written never blocks the archive ─────
do $$
declare ok boolean; n int;
begin
  insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body) values
    ('aaaaaaaa-0000-0000-0000-000000000012', 'case-x', '33333333-0000-0000-0000-000000000003',
     'ffffffff-0000-0000-0000-0000000000f1', 'firm', 'ملاحظة T12');
  -- schema drift stand-in: every new notification row is refused
  alter table public.notifications add constraint t12_refuse_all check (false) not valid;
  perform set_config('test.uid', '33333333-0000-0000-0000-000000000003', true);
  execute 'set local role authenticated';
  select public.archive_case_note('aaaaaaaa-0000-0000-0000-000000000012') into ok;
  reset role;
  alter table public.notifications drop constraint t12_refuse_all;
  if not ok then raise exception 'T12 FAIL: the archive did not happen'; end if;
  select count(*) into n from public.case_record_history
   where record_id = 'aaaaaaaa-0000-0000-0000-000000000012' and action = 'archived';
  if n <> 1 then raise exception 'T12 FAIL: the trail row is missing'; end if;
  raise notice 'T12 PASS: with notifications refusing every row, the archive and its trail row still commit';
end $$;

\echo 'soft_delete_case_records.test.sql: ALL PASS'
