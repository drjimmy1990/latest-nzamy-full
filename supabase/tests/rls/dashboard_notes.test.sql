-- dashboard_notes.test.sql — proves 20261025_31 (P4 N3.4, sticky notes wall)
-- and the case-worker helpers 20261025_32/_33 reuse.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $T/dashboard_notes.test.sql
-- Why each link: phase1 = can_access_case_row + the live case tables; phase2 =
-- service_requests.firm_id and the firm membership trigger; phase3 + case_notes
-- + 20261017_41 = case_team_members, is_case_team_member, case_note_scope_ok.
--
-- NEGATIVE CONTROLS (must FAIL; recorded 2026-10-25):
--   * the chain without the two 20261025_31 lines
--     → T1 aborts: function public.case_worker_ok(text, uuid) does not exist.
--   * a draft of case_worker_ok that admitted `sr.assigned_to = p_user` on a
--     FIRM case too → "T1 FAIL: case workers are … G@case-f2 …" (an outsider
--     named as the lead of a firm case by free text counted as its worker).
--   * the UPDATE policy with `with check (author_user_id = auth.uid())` only
--     (the 20260910 case_notes shape) → "T7a FAIL: L relinked his note to S's
--     case".
--
-- People: firm F (owner O)  L lawyer of F, lead of case-f   Y legal secretary of F
--         T lawyer of F on case-f's team                    U lawyer of F, SUSPENDED
--         firm F2 (owner O2)  M2 lawyer of F2
--         S solo lawyer (case-s, his own; assignee of case-k)  K a client
--         G an outsider lawyer (named assignee of firm case case-f2)
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (RLS bypassed on purpose) ──────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a0'), -- O
  ('00000000-0000-0000-0000-0000000000a1'), -- L
  ('00000000-0000-0000-0000-0000000000a2'), -- Y
  ('00000000-0000-0000-0000-0000000000a3'), -- T
  ('00000000-0000-0000-0000-0000000000a4'), -- U
  ('00000000-0000-0000-0000-0000000000b0'), -- O2
  ('00000000-0000-0000-0000-0000000000b1'), -- M2
  ('00000000-0000-0000-0000-0000000000c1'), -- S
  ('00000000-0000-0000-0000-0000000000c2'), -- K
  ('00000000-0000-0000-0000-0000000000c3'); -- G
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a0','firm','O'),
  ('00000000-0000-0000-0000-0000000000a1','lawyer','L'),
  ('00000000-0000-0000-0000-0000000000a2','individual','Y'),
  ('00000000-0000-0000-0000-0000000000a3','lawyer','T'),
  ('00000000-0000-0000-0000-0000000000a4','lawyer','U'),
  ('00000000-0000-0000-0000-0000000000b0','firm','O2'),
  ('00000000-0000-0000-0000-0000000000b1','lawyer','M2'),
  ('00000000-0000-0000-0000-0000000000c1','lawyer','S'),
  ('00000000-0000-0000-0000-0000000000c2','individual','K'),
  ('00000000-0000-0000-0000-0000000000c3','lawyer','G');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a0','مكتب ف'),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b0','مكتب ف٢');
-- (each owner's own managing_partner row is written by the firm_profiles trigger)
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','legal_secretary','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a3','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a4','lawyer','suspended', now()),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','lawyer','active', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id) values
  ('case-f', '00000000-0000-0000-0000-0000000000c2','قضية المكتب','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-f2','00000000-0000-0000-0000-0000000000c2','قضية باسم غريب','00000000-0000-0000-0000-0000000000c3','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-s', '00000000-0000-0000-0000-0000000000c1','قضية منفردة', null, null),
  ('case-k', '00000000-0000-0000-0000-0000000000c2','قضية رفعها موكل','00000000-0000-0000-0000-0000000000c1', null);
insert into public.case_team_members (request_id, user_id, firm_id, added_by) values
  ('case-f','00000000-0000-0000-0000-0000000000a3','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1');

-- app_user's privileges on the new table come only through `authenticated`
-- (stubs.sql's default privileges hand it a direct grant on every new table).
revoke all on public.dashboard_notes from app_user;

-- ── T1 the case-worker rule (service_role) ───────────────────────────────────
set role service_role;
do $$
declare got text; want text;
begin
  select string_agg(p.display_name || '@' || c.id, ' ' order by c.id, p.display_name)
    into got
    from public.profiles p cross join (values ('case-f'),('case-f2'),('case-s'),('case-k')) c(id)
   where public.case_worker_ok(c.id, p.id);
  want := 'L@case-f O@case-f T@case-f Y@case-f L@case-f2 O@case-f2 T@case-f2 Y@case-f2 S@case-k S@case-s';
  if got is distinct from want then
    raise exception 'T1 FAIL: case workers are % — expected %', got, want;
  end if;
  if public.case_worker_ok(null, '00000000-0000-0000-0000-0000000000a1') or public.case_worker_ok('case-f', null) then
    raise exception 'T1 FAIL: a null case or user counted as a worker';
  end if;
  raise notice 'T1 PASS: firm case = active members and owner only (not the suspended member, not the client filer, not an outsider named as assignee); solo case = assignee or lawyer filer, never a client filer';
end $$;
reset role;

-- ── T2 sessions cannot probe case_worker_ok; anon has nothing ───────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  perform public.case_worker_ok('case-f', '00000000-0000-0000-0000-0000000000a2');
  raise exception 'T2 FAIL: a session called case_worker_ok';
exception when insufficient_privilege then
  raise notice 'T2 PASS: a session cannot EXECUTE case_worker_ok (42501)';
end $$;
do $$ begin
  if not public.is_case_worker('case-f') or public.is_case_worker('case-s') then
    raise exception 'T2b FAIL: is_case_worker gave the wrong answer for L';
  end if;
  raise notice 'T2b PASS: is_case_worker answers for the session only';
end $$;
reset role;

-- ── T3–T5 writes and reads ──────────────────────────────────────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.dashboard_notes (id, author_user_id, body, color, pinned, visibility) values
  ('00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-0000000000a1','خاصة بي','amber', true,'private');
insert into public.dashboard_notes (id, author_user_id, firm_id, body, color, visibility) values
  ('00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','للمكتب','sky','firm');
insert into public.dashboard_notes (id, author_user_id, firm_id, case_request_id, body, color, visibility) values
  ('00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','case-f','لفريق القضية','rose','case_team');
reset role;

set role app_user;
do $$
declare got text; want text; who text; uid uuid;
begin
  for who, uid, want in
    select * from (values
      ('L',  '00000000-0000-0000-0000-0000000000a1'::uuid, 'e001 e002 e003'),
      ('Y',  '00000000-0000-0000-0000-0000000000a2'::uuid, 'e002'),
      ('T',  '00000000-0000-0000-0000-0000000000a3'::uuid, 'e002 e003'),
      ('O',  '00000000-0000-0000-0000-0000000000a0'::uuid, 'e002'),
      ('U',  '00000000-0000-0000-0000-0000000000a4'::uuid, ''),
      ('M2', '00000000-0000-0000-0000-0000000000b1'::uuid, ''),
      ('K',  '00000000-0000-0000-0000-0000000000c2'::uuid, ''),
      ('G',  '00000000-0000-0000-0000-0000000000c3'::uuid, '')
    ) v(who, uid, want)
  loop
    perform set_config('test.uid', uid::text, true);
    select coalesce(string_agg(substr(id::text, 33), ' ' order by id), '') into got from public.dashboard_notes;
    if got is distinct from want then
      raise exception 'T3 FAIL: % reads [%] — expected [%]', who, got, want;
    end if;
  end loop;
  raise notice 'T3 PASS: private = author only; firm = active members of the note firm (not the suspended one, not firm F2, not the client); case_team = the case team (lead + team member), not the secretary outside it';
end $$;
reset role;

-- ── T6 nobody plants a note into another case or firm ───────────────────────
set role app_user;
do $$
declare who uuid; ok boolean;
begin
  -- a: an outsider links his note to firm F's case
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', true);
  begin
    insert into public.dashboard_notes (author_user_id, case_request_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000c3','case-f','x','private');
    raise exception 'T6a FAIL: an outsider linked a note to firm F''s case';
  exception when insufficient_privilege then null; end;
  -- b: an outsider shares a note with firm F
  begin
    insert into public.dashboard_notes (author_user_id, firm_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000c3','ffffffff-0000-0000-0000-0000000000f1','x','firm');
    raise exception 'T6b FAIL: an outsider filed a firm note under firm F';
  exception when insufficient_privilege then null; end;
  -- c: the outsider named as assignee of firm case case-f2 is not its worker
  begin
    insert into public.dashboard_notes (author_user_id, case_request_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000c3','case-f2','x','private');
    raise exception 'T6c FAIL: the free-text assignee of a firm case linked a note to it';
  exception when insufficient_privilege then null; end;
  -- d: a firm-F2 lawyer files a firm note under firm F
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  begin
    insert into public.dashboard_notes (author_user_id, firm_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000b1','ffffffff-0000-0000-0000-0000000000f1','x','firm');
    raise exception 'T6d FAIL: a firm-F2 member filed a note under firm F';
  exception when insufficient_privilege then null; end;
  -- e: L links a firm note to firm F's case but under firm F2
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    insert into public.dashboard_notes (author_user_id, firm_id, case_request_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f2','case-f','x','firm');
    raise exception 'T6e FAIL: a note on a firm-F case was filed under firm F2';
  exception when insufficient_privilege then null; end;
  -- f: a private note carrying a firm
  begin
    insert into public.dashboard_notes (author_user_id, firm_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','x','private');
    raise exception 'T6f FAIL: a private note carried a firm';
  exception when insufficient_privilege then null; end;
  -- g: a note written in someone else's name
  begin
    insert into public.dashboard_notes (author_user_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000a2','x','private');
    raise exception 'T6g FAIL: L wrote a note as Y';
  exception when insufficient_privilege then null; end;
  -- h: a client links a note to the case he filed
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c2', true);
  begin
    insert into public.dashboard_notes (author_user_id, case_request_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000c2','case-k','x','private');
    raise exception 'T6h FAIL: a client linked a dashboard note to his case';
  exception when insufficient_privilege then null; end;
  -- i: a case_team note on a solo case (no team)
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  begin
    insert into public.dashboard_notes (author_user_id, case_request_id, body, visibility)
    values ('00000000-0000-0000-0000-0000000000c1','case-s','x','case_team');
    raise exception 'T6i FAIL: a case_team note on a firm-less case';
  exception when insufficient_privilege then null; end;
  -- j: the solo lawyer links his own case (allowed)
  insert into public.dashboard_notes (id, author_user_id, case_request_id, body, visibility)
  values ('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-0000000000c1','case-s','قضيتي','private');
  raise notice 'T6 PASS: no note into another case or firm (outsider, free-text assignee, other firm, wrong firm on a firm case, private with a firm, another author, the client, case_team on a solo case); a solo lawyer links his own case';
end $$;
reset role;

-- ── T7 UPDATE re-tests the new row ───────────────────────────────────────────
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    update public.dashboard_notes set case_request_id = 'case-s' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T7a FAIL: L relinked his note to S''s case';
  exception when insufficient_privilege then null; end;
  begin
    update public.dashboard_notes set firm_id = 'ffffffff-0000-0000-0000-0000000000f2' where id = '00000000-0000-0000-0000-00000000e002';
    raise exception 'T7b FAIL: L re-scoped his note to firm F2';
  exception when insufficient_privilege then null; end;
  begin
    update public.dashboard_notes set author_user_id = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T7c FAIL: the author of a note was rewritten';
  exception when insufficient_privilege then null; end;
  update public.dashboard_notes set pinned = false, color = 'violet', body = 'معدّلة' where id = '00000000-0000-0000-0000-00000000e001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T7d FAIL: L could not edit his own note (% rows)', n; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  update public.dashboard_notes set body = 'عبث' where id = '00000000-0000-0000-0000-00000000e002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T7e FAIL: a colleague edited L''s firm note'; end if;
  raise notice 'T7 PASS: no relink to a foreign case, no re-scope to another firm, no author rewrite; the author edits body/colour/pin; a colleague who can read the note cannot edit it';
end $$;
reset role;

-- ── T8 DELETE: author only ───────────────────────────────────────────────────
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a0', true);
  delete from public.dashboard_notes where id = '00000000-0000-0000-0000-00000000e002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T8 FAIL: the firm owner deleted L''s note'; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  delete from public.dashboard_notes where id = '00000000-0000-0000-0000-00000000e002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T8 FAIL: L could not delete his own note'; end if;
  raise notice 'T8 PASS: only the author deletes a note';
end $$;
reset role;

-- ── T9 the colour CHECK and the body limit ──────────────────────────────────
do $$ begin
  insert into public.dashboard_notes (author_user_id, body, color) values ('00000000-0000-0000-0000-0000000000a1','x','black');
  raise exception 'T9 FAIL: a sixth colour was accepted';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.dashboard_notes (author_user_id, body) values ('00000000-0000-0000-0000-0000000000a1', repeat('م', 2001));
  raise exception 'T9 FAIL: a 2001-character note was accepted';
exception when check_violation then
  raise notice 'T9 PASS: five colours only, 2000 characters at most';
end $$;

-- ── T10 a deleted case unlinks, the note stays ──────────────────────────────
delete from public.service_requests where id = 'case-s';
do $$ begin
  if not exists (select 1 from public.dashboard_notes where id = '00000000-0000-0000-0000-00000000e004' and case_request_id is null) then
    raise exception 'T10 FAIL: deleting the case did not unlink (or deleted) the note';
  end if;
  raise notice 'T10 PASS: deleting a case unlinks its notes (ON DELETE SET NULL)';
end $$;

-- ── T11 anon ─────────────────────────────────────────────────────────────────
set role anon;
do $$ begin
  perform 1 from public.dashboard_notes;
  raise exception 'T11 FAIL: anon read dashboard_notes';
exception when insufficient_privilege then
  raise notice 'T11 PASS: anon holds no privilege on dashboard_notes';
end $$;
reset role;

\echo 'dashboard_notes: ALL PASS'
