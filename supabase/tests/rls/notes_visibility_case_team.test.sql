-- notes_visibility_case_team.test.sql — proves 20261017_41 (owner decision ١٦٩).
--
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $R/notes_visibility_case_team.test.sql
--
-- NEGATIVE CONTROL: the same command without the two 20261017_41 lines fails
-- at T1 (no case_team_members), and every case_team assertion after it would
-- fail on the old two-value CHECK.
--
-- People (firm F, owner O):
--   L  lawyer, active member of F, lead + filer of case-x
--   S  legal secretary, active member of F, added to case-x's team by L
--   M  lawyer, active member of F, NOT on case-x's team
--   U  lawyer, member of F, lead of case-v, suspended mid-test
--   K  a client (individual account), never a member of F
--   G  owner of another firm F2
--   AD a platform admin
-- Every assertion RAISES on failure. Runs as role `authenticated` itself (what
-- PostgREST uses for a signed-in request): app_user holds direct grants in this
-- harness and could not show the case_team_members UPDATE revoke.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (RLS bypassed on purpose) ──────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000f'),
  ('11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002'),
  ('33333333-0000-0000-0000-000000000003'),
  ('44444444-0000-0000-0000-000000000004'),
  ('55555555-0000-0000-0000-000000000005'),
  ('66666666-0000-0000-0000-000000000006'),
  ('77777777-0000-0000-0000-000000000007');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000000f', 'firm',       'O'),
  ('11111111-0000-0000-0000-000000000001', 'lawyer',     'L'),
  ('22222222-0000-0000-0000-000000000002', 'individual', 'S'),
  ('33333333-0000-0000-0000-000000000003', 'lawyer',     'M'),
  ('44444444-0000-0000-0000-000000000004', 'individual', 'K'),
  ('55555555-0000-0000-0000-000000000005', 'firm',       'G'),
  ('66666666-0000-0000-0000-000000000006', 'lawyer',     'U'),
  ('77777777-0000-0000-0000-000000000007', 'admin',      'AD');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000f', 'مكتب الاختبار'),
  ('ffffffff-0000-0000-0000-0000000000f2', '55555555-0000-0000-0000-000000000005', 'مكتب آخر');
-- O and G become managing partners of their own firms by trigger (20260903_phase2).
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001', 'lawyer',          'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '22222222-0000-0000-0000-000000000002', 'legal_secretary', 'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-000000000003', 'lawyer',          'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '66666666-0000-0000-0000-000000000006', 'lawyer',          'active', now());

insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-x',    '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'قضية المكتب', 'ffffffff-0000-0000-0000-0000000000f1'),
  -- client-filed firm case: the requester is the client
  ('case-z',    '44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'قضية رفعها العميل', 'ffffffff-0000-0000-0000-0000000000f1'),
  -- assigned_to forged to the client (plan item N16 shape)
  ('case-w',    '11111111-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000004', 'قضية بإسناد مزوّر', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('case-v',    '66666666-0000-0000-0000-000000000006', '66666666-0000-0000-0000-000000000006', 'قضية يقودها U', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('case-solo', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'قضية فردية', null);
-- a firm-less consultation (the phase-3 trigger creates the consultations row)
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, assigned_to) values
  ('req-cons-solo', '44444444-0000-0000-0000-000000000004', 'consultation', 'استشارة', 'lawyer', 'assigned',
   '11111111-0000-0000-0000-000000000001');
insert into public.lawyer_clients (id, owner_user_id, firm_id, name) values
  ('cccccccc-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'موكّل المكتب');

do $$
begin
  if to_regclass('public.case_team_members') is null then
    raise exception 'T0 FAIL: public.case_team_members does not exist — 20261017_41 not applied';
  end if;
  if (select pg_get_functiondef('public.case_team_user_ids(text)'::regprocedure)) ~* '\mtasks\M' then
    raise exception 'T0 FAIL: the case team reads public.tasks — task assignees are self-joinable (tasks UPDATE policy)';
  end if;
  raise notice 'T0 PASS: case_team_members exists; the team definition does not read tasks';
end $$;

set role authenticated;

-- ── T1 the lead adds a team member ──────────────────────────────────────────
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  insert into public.case_team_members (request_id, user_id, firm_id, added_by)
  values ('case-x', '22222222-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1 FAIL: the lead could not add S (% rows)', n; end if;
  raise notice 'T1 PASS: the lead adds an active firm member to the case team';
end $$;

-- ── T2–T6 who may NOT add ───────────────────────────────────────────────────
select set_config('test.uid', '33333333-0000-0000-0000-000000000003', false);
do $$
begin
  begin
    insert into public.case_team_members (request_id, user_id, firm_id, added_by)
    values ('case-x', '33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', '33333333-0000-0000-0000-000000000003');
    raise exception 'T2 FAIL: a firm colleague joined a case team on their own';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: an active colleague cannot self-join a case team (42501)';
end $$;

select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
do $$
begin
  begin
    insert into public.case_team_members (request_id, user_id, firm_id, added_by)
    values ('case-x', '33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', '22222222-0000-0000-0000-000000000002');
    raise exception 'T3 FAIL: a team member (not the lead) added someone';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: a team member who is not the lead cannot add people (42501)';
end $$;

select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
begin
  begin
    insert into public.case_team_members (request_id, user_id, firm_id, added_by)
    values ('case-x', '55555555-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001');
    raise exception 'T4 FAIL: an account outside the firm was put on the team';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.case_team_members (request_id, user_id, firm_id, added_by)
    values ('case-x', '33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f2', '11111111-0000-0000-0000-000000000001');
    raise exception 'T5 FAIL: a team row was filed under another firm';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.case_team_members (request_id, user_id, firm_id, added_by)
    values ('case-x', '33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', '22222222-0000-0000-0000-000000000002');
    raise exception 'T6 FAIL: added_by was forged';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.case_team_members set user_id = '33333333-0000-0000-0000-000000000003' where request_id = 'case-x';
    raise exception 'T6 FAIL: a team row was edited in place';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4-T6 PASS: outsider, wrong firm, forged added_by and in-place edits are refused';
end $$;

-- ── T7 L writes one note of each scope on case-x ────────────────────────────
do $$
declare n int;
begin
  insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility) values
    ('case-x', '11111111-0000-0000-0000-000000000001', null, 'ملاحظة خاصة', 'private'),
    ('case-x', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'لفريق القضية', 'case_team'),
    ('case-x', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'لكل المكتب', 'firm');
  get diagnostics n = row_count;
  if n <> 3 then raise exception 'T7 FAIL: % notes written', n; end if;
  raise notice 'T7 PASS: private / case_team / firm notes written';
end $$;

-- ── T8 who reads what on case-x ─────────────────────────────────────────────
create or replace function pg_temp.notes_seen(p_uid text, p_request text) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('test.uid', p_uid, false);
  select count(*) into n from public.case_notes where request_id = p_request;
  return n;
end $$;

do $$
declare n int;
begin
  n := pg_temp.notes_seen('11111111-0000-0000-0000-000000000001', 'case-x');
  if n <> 3 then raise exception 'T8 FAIL: author L sees % (expect 3)', n; end if;
  n := pg_temp.notes_seen('22222222-0000-0000-0000-000000000002', 'case-x');
  if n <> 2 then raise exception 'T8 FAIL: team member S sees % (expect 2: case_team + firm)', n; end if;
  n := pg_temp.notes_seen('33333333-0000-0000-0000-000000000003', 'case-x');
  if n <> 1 then raise exception 'T8 FAIL: colleague M (not on the team) sees % (expect 1: firm)', n; end if;
  n := pg_temp.notes_seen('00000000-0000-0000-0000-00000000000f', 'case-x');
  if n <> 1 then raise exception 'T8 FAIL: firm owner O (not on the team) sees % (expect 1: firm)', n; end if;
  n := pg_temp.notes_seen('44444444-0000-0000-0000-000000000004', 'case-x');
  if n <> 0 then raise exception 'T8 FAIL: client K sees % (expect 0)', n; end if;
  n := pg_temp.notes_seen('55555555-0000-0000-0000-000000000005', 'case-x');
  if n <> 0 then raise exception 'T8 FAIL: other firm G sees % (expect 0)', n; end if;
  n := pg_temp.notes_seen('77777777-0000-0000-0000-000000000007', 'case-x');
  if n <> 0 then raise exception 'T8 FAIL: platform admin sees % (expect 0 — «خاصة بي فقط»)', n; end if;
  raise notice 'T8 PASS: L 3 · S 2 · M 1 · O 1 · K 0 · G 0 · admin 0';
end $$;

-- ── T9 the one team definition ──────────────────────────────────────────────
do $$
declare n int; v text;
begin
  perform set_config('test.uid', '33333333-0000-0000-0000-000000000003', false);
  select count(*) into n from public.case_team_user_ids('case-x');
  if n <> 2 then raise exception 'T9 FAIL: case-x team as seen by M has % people (expect 2: L, S)', n; end if;
  select via into v from public.case_team_user_ids('case-x') where user_id = '11111111-0000-0000-0000-000000000001';
  if v is distinct from 'lead' then raise exception 'T9 FAIL: L is listed as % (expect lead)', v; end if;
  perform set_config('test.uid', '44444444-0000-0000-0000-000000000004', false);
  select count(*) into n from public.case_team_user_ids('case-x');
  if n <> 0 then raise exception 'T9 FAIL: the client can list the case team (% rows)', n; end if;
  perform set_config('test.uid', '55555555-0000-0000-0000-000000000005', false);
  select count(*) into n from public.case_team_user_ids('case-x');
  if n <> 0 then raise exception 'T9 FAIL: another firm can list the case team (% rows)', n; end if;
  raise notice 'T9 PASS: the team is {L lead, S member}; the client and another firm list nothing';
end $$;

-- ── T10 / T11 the client is never on the team ───────────────────────────────
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility) values
  ('case-z', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'مداولة داخلية', 'case_team'),
  ('case-w', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'مداولة داخلية', 'case_team');
do $$
declare n int;
begin
  n := pg_temp.notes_seen('44444444-0000-0000-0000-000000000004', 'case-z');
  if n <> 0 then raise exception 'T10 FAIL: the client who filed case-z reads % internal note(s)', n; end if;
  n := pg_temp.notes_seen('44444444-0000-0000-0000-000000000004', 'case-w');
  if n <> 0 then raise exception 'T11 FAIL: the client forged into assigned_to of case-w reads % internal note(s)', n; end if;
  perform set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
  select count(*) into n from public.case_team_user_ids('case-z');
  if n <> 1 then raise exception 'T10 FAIL: case-z team has % people (expect 1: L — K the filer is not a member)', n; end if;
  select count(*) into n from public.case_team_user_ids('case-w');
  if n <> 1 then raise exception 'T11 FAIL: case-w team has % people (expect 1: L — K in assigned_to is not a member)', n; end if;
  raise notice 'T10-T11 PASS: a client as filer or as forged assignee reads 0 case_team notes and is not on the team';
end $$;

-- ── T12 a suspended lead cannot add people ──────────────────────────────────
reset role;
update public.firm_members set status = 'suspended'
 where firm_id = 'ffffffff-0000-0000-0000-0000000000f1' and user_id = '66666666-0000-0000-0000-000000000006';
set role authenticated;
select set_config('test.uid', '66666666-0000-0000-0000-000000000006', false);
do $$
begin
  begin
    insert into public.case_team_members (request_id, user_id, firm_id, added_by)
    values ('case-v', '22222222-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-0000000000f1', '66666666-0000-0000-0000-000000000006');
    raise exception 'T12 FAIL: a suspended lead added a team member';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T12 PASS: a suspended lead cannot add people (42501)';
end $$;

-- ── T13 adding / removing changes what a colleague reads ────────────────────
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
insert into public.case_team_members (request_id, user_id, firm_id, added_by)
values ('case-x', '33333333-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', '11111111-0000-0000-0000-000000000001');
do $$
declare n int;
begin
  n := pg_temp.notes_seen('33333333-0000-0000-0000-000000000003', 'case-x');
  if n <> 2 then raise exception 'T13 FAIL: M on the team sees % (expect 2)', n; end if;
  -- S is not a manager: removing M touches nothing
  perform set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);
  delete from public.case_team_members where request_id = 'case-x' and user_id = '33333333-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T13 FAIL: a non-manager removed a team member'; end if;
  -- the firm owner may manage the team
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
  delete from public.case_team_members where request_id = 'case-x' and user_id = '33333333-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T13 FAIL: the firm owner could not remove a team member (% rows)', n; end if;
  n := pg_temp.notes_seen('33333333-0000-0000-0000-000000000003', 'case-x');
  if n <> 1 then raise exception 'T13 FAIL: M off the team sees % (expect 1)', n; end if;
  raise notice 'T13 PASS: on the team M reads 2, off it 1; a non-manager cannot remove, the owner can';
end $$;

-- ── T14 a note's scope is pinned in RLS, not only in the API ────────────────
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  begin
    insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility)
    values ('case-x', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f2', 'لمكتب آخر', 'firm');
    raise exception 'T14 FAIL: a firm note on case-x was filed under firm F2';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility)
    values ('case-solo', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'فريق', 'case_team');
    raise exception 'T14 FAIL: a case_team note on a firm-less case';
  exception when insufficient_privilege then null;
  end;
  -- a firm-less case may still be shared with the author's own firm (as before)
  insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility)
  values ('case-solo', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'للمكتب', 'firm');
  begin
    update public.case_notes set visibility = 'firm', firm_id = 'ffffffff-0000-0000-0000-0000000000f2'
     where request_id = 'case-x' and visibility = 'private';
    raise exception 'T14 FAIL: an update moved a note into firm F2';
  exception when insufficient_privilege then null;
  end;
  update public.case_notes set visibility = 'case_team', firm_id = 'ffffffff-0000-0000-0000-0000000000f1'
   where request_id = 'case-x' and body = 'ملاحظة خاصة';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T14 FAIL: the author could not share a private note with the case team'; end if;
  update public.case_notes set visibility = 'private', firm_id = null
   where request_id = 'case-x' and body = 'ملاحظة خاصة';
  begin
    insert into public.case_notes (request_id, author_user_id, body, visibility)
    values ('case-x', '11111111-0000-0000-0000-000000000001', 'x', 'public');
    raise exception 'T14 FAIL: visibility public accepted';
  exception when insufficient_privilege then null;  -- the scope rule answers first
  end;
  raise notice 'T14 PASS: wrong-firm and firm-less case_team notes refused on insert and update; sharing and un-sharing work';
end $$;

-- …and the CHECK itself, with RLS out of the way (as postgres)
reset role;
do $$
begin
  begin
    insert into public.case_notes (request_id, author_user_id, body, visibility)
    values ('case-x', '11111111-0000-0000-0000-000000000001', 'x', 'public');
    raise exception 'T14 FAIL: the visibility CHECK accepts public';
  exception when check_violation then null;
  end;
  raise notice 'T14 PASS: the CHECK admits private / firm / case_team only';
end $$;
set role authenticated;
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);

-- ── T15 client-card notes carry the card's firm ─────────────────────────────
do $$
declare n int;
begin
  begin
    insert into public.lawyer_client_notes (client_id, author_user_id, firm_id, body, visibility)
    values ('cccccccc-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f2', 'x', 'firm');
    raise exception 'T15 FAIL: a client note was filed under firm F2';
  exception when insufficient_privilege then null;
  end;
  insert into public.lawyer_client_notes (client_id, author_user_id, firm_id, body, visibility) values
    ('cccccccc-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'للمكتب', 'firm'),
    -- live rows carry a stamped firm_id on private notes; private ignores it
    ('cccccccc-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000f1', 'خاصة', 'private');
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'T15 FAIL: % client notes written (expect 2)', n; end if;
  perform set_config('test.uid', '33333333-0000-0000-0000-000000000003', false);
  select count(*) into n from public.lawyer_client_notes;
  if n <> 1 then raise exception 'T15 FAIL: colleague M reads % client notes (expect 1: the firm one)', n; end if;
  perform set_config('test.uid', '77777777-0000-0000-0000-000000000007', false);
  select count(*) into n from public.lawyer_client_notes;
  if n <> 0 then raise exception 'T15 FAIL: the platform admin reads % client notes (expect 0 — «سرية»)', n; end if;
  raise notice 'T15 PASS: client notes pinned to the card''s firm; colleagues read the firm one; admin reads none';
end $$;

-- ── T16 consultation notes ──────────────────────────────────────────────────
select set_config('test.uid', '11111111-0000-0000-0000-000000000001', false);
do $$
declare cid text; n int;
begin
  select id into cid from public.consultations where request_id = 'req-cons-solo';
  if cid is null then raise exception 'T16 setup: the consultation row was not created'; end if;
  begin
    insert into public.consultation_notes (consultation_id, author_user_id, visibility, body)
    values (cid, '11111111-0000-0000-0000-000000000001', 'firm', 'للمكتب');
    raise exception 'T16 FAIL: a firm note on a consultation that has no firm';
  exception when insufficient_privilege then null;
  end;
  insert into public.consultation_notes (consultation_id, author_user_id, visibility, body)
  values (cid, '11111111-0000-0000-0000-000000000001', 'private', 'خاصة');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T16 FAIL: private consultation note not written'; end if;
  raise notice 'T16 PASS: «للمكتب» refused on a firm-less consultation; private works';
end $$;

-- ── T17 suspension ends access ──────────────────────────────────────────────
reset role;
update public.firm_members set status = 'suspended'
 where firm_id = 'ffffffff-0000-0000-0000-0000000000f1' and user_id = '22222222-0000-0000-0000-000000000002';
set role authenticated;
do $$
declare n int;
begin
  n := pg_temp.notes_seen('22222222-0000-0000-0000-000000000002', 'case-x');
  if n <> 0 then raise exception 'T17 FAIL: suspended S still reads % note(s) on case-x', n; end if;
  n := pg_temp.notes_seen('11111111-0000-0000-0000-000000000001', 'case-x');
  if n <> 3 then raise exception 'T17 FAIL: author L reads % (expect 3)', n; end if;
  raise notice 'T17 PASS: a suspended team member reads nothing; the author keeps all three';
end $$;

-- ── T18 guests hold no privilege ────────────────────────────────────────────
reset role;
set role anon;
do $$
begin
  begin
    perform 1 from public.case_notes limit 1;
    raise exception 'T18 FAIL: anon can read case_notes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.case_team_members limit 1;
    raise exception 'T18 FAIL: anon can read case_team_members';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.case_team_user_ids('case-x');
    raise exception 'T18 FAIL: anon can execute case_team_user_ids';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T18 PASS: anon has no privilege on the note tables or the team functions';
end $$;
reset role;

select 'notes_visibility_case_team: ALL PASS';
