-- legal_ledger.test.sql — proves 20261025_33 (P4 N3.7, the legal outgoing /
-- incoming register).
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
--     $M/20261025_33_legal_ledger.sql \
--     $M/20261025_33_legal_ledger.sql \
--     $T/legal_ledger.test.sql
-- Why each link: as dashboard_notes.test.sql — 20261025_31 provides
-- case_row_scope_ok, which every write policy here calls.
--
-- NEGATIVE CONTROLS (must FAIL; recorded 2026-10-25):
--   * the chain without 20261025_31 → 20261025_33 refuses to run:
--     "public.case_row_scope_ok(text, uuid) is missing — apply 20261025_31…".
--   * an INSERT policy of `created_by = auth.uid()` only (the shape the
--     hearings / case_stages insert policies of 20260903_phase1 still have)
--     → "T3a FAIL: an outsider planted an entry into firm F's case".
--   * `grant update on legal_ledger_entries to authenticated` (table-wide)
--     → "T5a FAIL: the writer moved his entry to another case" (to case-g, a
--     second case of the same firm, which the scope rule alone admits).
--
-- People: firm F (owner O)  L lawyer of F (lead of case-f)   Y legal secretary of F
--         U lawyer of F, SUSPENDED      firm F2 (owner O2)  M2 lawyer of F2
--         S solo lawyer (case-s)        K a client (filer of case-f)
--         G an outsider lawyer, free-text assignee of firm case case-g
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a0'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000b0'), ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000c3');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a0','firm','O'),
  ('00000000-0000-0000-0000-0000000000a1','lawyer','L'),
  ('00000000-0000-0000-0000-0000000000a2','individual','Y'),
  ('00000000-0000-0000-0000-0000000000a4','lawyer','U'),
  ('00000000-0000-0000-0000-0000000000b0','firm','O2'),
  ('00000000-0000-0000-0000-0000000000b1','lawyer','M2'),
  ('00000000-0000-0000-0000-0000000000c1','lawyer','S'),
  ('00000000-0000-0000-0000-0000000000c2','individual','K'),
  ('00000000-0000-0000-0000-0000000000c3','lawyer','G');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a0','مكتب ف'),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b0','مكتب ف٢');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','legal_secretary','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a4','lawyer','suspended', now()),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','lawyer','active', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id) values
  ('case-f','00000000-0000-0000-0000-0000000000c2','قضية المكتب','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-g','00000000-0000-0000-0000-0000000000c2','قضية باسم غريب','00000000-0000-0000-0000-0000000000c3','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-s','00000000-0000-0000-0000-0000000000c1','قضية منفردة', null, null),
  ('case-m','00000000-0000-0000-0000-0000000000c2','قضية ف٢','00000000-0000-0000-0000-0000000000b1','ffffffff-0000-0000-0000-0000000000f2');

revoke all on public.legal_ledger_entries from app_user;

-- ── T1 legitimate writes ─────────────────────────────────────────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.legal_ledger_entries (id, case_request_id, firm_id, created_by, direction, channel, title, occurred_at) values
  ('00000000-0000-0000-0000-00000000e001','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','out','najiz','مذكرة جوابية','2026-10-20T09:00:00Z');
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', false);
insert into public.legal_ledger_entries (id, case_request_id, firm_id, created_by, direction, channel, title, notes, occurred_at) values
  ('00000000-0000-0000-0000-00000000e002','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','in','hand','أصل الوكالة','استلمته السكرتارية','2026-10-21T11:00:00Z');
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', false);
insert into public.legal_ledger_entries (id, case_request_id, firm_id, created_by, direction, channel, title) values
  ('00000000-0000-0000-0000-00000000e003','case-s', null,'00000000-0000-0000-0000-0000000000c1','out','email','إنذار');
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
insert into public.legal_ledger_entries (id, case_request_id, firm_id, created_by, direction, channel, title) values
  ('00000000-0000-0000-0000-00000000e004','case-m','ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','in','registered_mail','تبليغ');
reset role;
do $$ begin raise notice 'T1 PASS: a firm lawyer, a firm secretary, a solo lawyer and a firm-F2 lawyer each file on their own cases'; end $$;

-- ── T2 reads: the writer and the active members of the entry's firm ─────────
set role app_user;
do $$
declare got text; want text; who text; uid uuid;
begin
  for who, uid, want in
    select * from (values
      ('L',  '00000000-0000-0000-0000-0000000000a1'::uuid, 'e001 e002'),
      ('Y',  '00000000-0000-0000-0000-0000000000a2'::uuid, 'e001 e002'),
      ('O',  '00000000-0000-0000-0000-0000000000a0'::uuid, 'e001 e002'),
      ('U',  '00000000-0000-0000-0000-0000000000a4'::uuid, ''),
      ('M2', '00000000-0000-0000-0000-0000000000b1'::uuid, 'e004'),
      ('O2', '00000000-0000-0000-0000-0000000000b0'::uuid, 'e004'),
      ('S',  '00000000-0000-0000-0000-0000000000c1'::uuid, 'e003'),
      ('K',  '00000000-0000-0000-0000-0000000000c2'::uuid, ''),
      ('G',  '00000000-0000-0000-0000-0000000000c3'::uuid, '')
    ) v(who, uid, want)
  loop
    perform set_config('test.uid', uid::text, true);
    select coalesce(string_agg(substr(id::text, 33), ' ' order by id), '') into got from public.legal_ledger_entries;
    if got is distinct from want then
      raise exception 'T2 FAIL: % reads [%] — expected [%]', who, got, want;
    end if;
  end loop;
  raise notice 'T2 PASS: firm F''s register is read by its active members only (not the suspended one, not firm F2, not the client, not an outsider); a solo register by its writer';
end $$;
reset role;

-- ── T3 nobody plants an entry into another case or firm ─────────────────────
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', true);
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c3','in','hand','x');
    raise exception 'T3a FAIL: an outsider planted an entry into firm F''s case';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-f', null,'00000000-0000-0000-0000-0000000000c3','in','hand','x');
    raise exception 'T3b FAIL: an outsider filed on firm F''s case without its firm';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-g','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c3','in','hand','x');
    raise exception 'T3c FAIL: the free-text assignee of a firm case filed on it';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-f','ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000a1','out','email','x');
    raise exception 'T3d FAIL: an entry on a firm-F case was filed under firm F2';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-f', null,'00000000-0000-0000-0000-0000000000a1','out','email','x');
    raise exception 'T3e FAIL: an entry on a firm case carried no firm (hidden from the firm''s register)';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-m','ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000a1','out','email','x');
    raise exception 'T3f FAIL: a firm-F lawyer filed on firm F2''s case';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','out','email','x');
    raise exception 'T3g FAIL: L filed an entry in Y''s name';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title, archived_at)
    values ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','out','email','x', now());
    raise exception 'T3h FAIL: an entry was born archived';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a4', true);
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a4','in','hand','x');
    raise exception 'T3i FAIL: a suspended member filed on the firm''s case';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c2', true);
  begin
    insert into public.legal_ledger_entries (case_request_id, firm_id, created_by, direction, channel, title)
    values ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c2','in','whatsapp','x');
    raise exception 'T3j FAIL: the client filed an entry into his lawyer''s register';
  exception when insufficient_privilege then null; end;
  raise notice 'T3 PASS: no entry from an outsider, a free-text assignee, a suspended member or the client; none under a wrong or missing firm, in someone else''s name, or born archived';
end $$;
reset role;

-- ── T4 the vocabularies ──────────────────────────────────────────────────────
do $$ begin
  insert into public.legal_ledger_entries (case_request_id, created_by, direction, channel, title)
  values ('case-s','00000000-0000-0000-0000-0000000000c1','sideways','email','x');
  raise exception 'T4 FAIL: a third direction was accepted';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.legal_ledger_entries (case_request_id, created_by, direction, channel, title)
  values ('case-s','00000000-0000-0000-0000-0000000000c1','in','fax','x');
  raise exception 'T4 FAIL: an unknown channel was accepted';
exception when check_violation then
  raise notice 'T4 PASS: direction in|out and the five channels only';
end $$;

-- ── T5 UPDATE: the writer edits the text, nobody moves the row ──────────────
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  -- case-g is another case of the same firm, on which L is a worker: only
  -- the column lock (no UPDATE on case_request_id) stops this one.
  begin
    update public.legal_ledger_entries set case_request_id = 'case-g' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T5a FAIL: the writer moved his entry to another case';
  exception when insufficient_privilege then null; end;
  begin
    update public.legal_ledger_entries set case_request_id = 'case-m' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T5a FAIL: the writer moved his entry to another firm''s case';
  exception when insufficient_privilege then null; end;
  begin
    update public.legal_ledger_entries set firm_id = 'ffffffff-0000-0000-0000-0000000000f2' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T5b FAIL: the writer moved his entry to another firm';
  exception when insufficient_privilege then null; end;
  begin
    update public.legal_ledger_entries set created_by = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-00000000e001';
    raise exception 'T5c FAIL: the writer of an entry was rewritten';
  exception when insufficient_privilege then null; end;
  update public.legal_ledger_entries set title = 'مذكرة جوابية (معدلة)', channel = 'email', archived_at = now() where id = '00000000-0000-0000-0000-00000000e001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T5d FAIL: the writer could not edit/archive his own entry'; end if;
  update public.legal_ledger_entries set title = 'عبث' where id = '00000000-0000-0000-0000-00000000e002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T5e FAIL: a colleague edited Y''s entry'; end if;
  raise notice 'T5 PASS: case, firm and writer cannot move; the writer edits and archives his entry; a colleague cannot';
end $$;
reset role;

-- A writer who has left the firm can no longer edit his entry.
update public.firm_members set status = 'suspended'
 where firm_id = 'ffffffff-0000-0000-0000-0000000000f1' and user_id = '00000000-0000-0000-0000-0000000000a2';
set role app_user;
do $$ begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  begin
    update public.legal_ledger_entries set title = 'بعد المغادرة' where id = '00000000-0000-0000-0000-00000000e002';
    raise exception 'T5f FAIL: a suspended writer edited the firm''s register';
  exception when insufficient_privilege then
    raise notice 'T5f PASS: a writer who left the firm cannot edit its register';
  end;
end $$;
reset role;

-- ── T6 no DELETE for sessions ────────────────────────────────────────────────
set role app_user;
do $$ begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  delete from public.legal_ledger_entries where id = '00000000-0000-0000-0000-00000000e003';
  raise exception 'T6 FAIL: a session deleted a ledger entry';
exception when insufficient_privilege then
  raise notice 'T6 PASS: no session deletes from the register — archive only (owner directive 5)';
end $$;
reset role;

-- ── T7 anon ──────────────────────────────────────────────────────────────────
set role anon;
do $$ begin
  perform 1 from public.legal_ledger_entries;
  raise exception 'T7 FAIL: anon read the register';
exception when insufficient_privilege then
  raise notice 'T7 PASS: anon holds no privilege on legal_ledger_entries';
end $$;
reset role;

\echo 'legal_ledger: ALL PASS'
