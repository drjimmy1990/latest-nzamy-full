-- case_tracking_links.test.sql — proves 20261025_32 (P4 N3.6, the client's
-- case tracking link).
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
--     $M/20261025_32_case_tracking_links.sql \
--     $M/20261025_32_case_tracking_links.sql \
--     $T/case_tracking_links.test.sql
-- Why each link: as dashboard_notes.test.sql; prelude_case_tables_real lets
-- phase1 build the live hearings / case_stages (notes, minutes, judge_name…),
-- so T1 can prove those columns never reach the snapshot.
--
-- NEGATIVE CONTROLS (must FAIL; recorded 2026-10-25):
--   * the snapshot without the case_worker_ok filter on hearings and stages
--     → "T1 FAIL: the snapshot is {"court": "محكمة مزيفة", "stage":
--       "cassation", …}" — an outsider's stage and hearing, written straight
--       through REST with this case's id, reached the client's page.
--   * the snapshot without the maker re-check (case_worker_ok on the link's
--     owner) → "T4 FAIL: a suspended member's link still opens the case".
--   * the UPDATE policy with no WITH CHECK → "T6c FAIL: a revoked link was
--     brought back".
--
-- People: firm F (owner O)  L lawyer of F, lead of case-f   Y legal secretary of F
--         U lawyer of F (later SUSPENDED)   M2 lawyer of firm F2
--         S solo lawyer (case-s)   K the client of case-f   G an outsider lawyer
-- Tokens are sha256 hex strings; the test writes them as fixed 64-hex values.
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
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a4','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','lawyer','active', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id, metadata) values
  ('case-f','00000000-0000-0000-0000-0000000000c2','دعوى مطالبة مالية','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1',
   '{"court":"المحكمة التجارية بالرياض","fees":"50000","client_phone":"+966500000000","national_id":"1010101010"}'),
  ('case-s','00000000-0000-0000-0000-0000000000c1','قضية منفردة', null, null, '{"court":"المحكمة العامة بجدة"}');

-- Live stages and hearings on case-f, written by F's people (as postgres).
insert into public.case_stages (id, case_request_id, firm_id, owner_user_id, degree, court_name, court_case_no, judge_name, position, outcome, notes) values
  ('00000000-0000-0000-0000-00000000d001','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','first_instance','المحكمة التجارية بالرياض','4412345','القاضي س', 0,'lost','ملاحظة داخلية عن الحكم'),
  ('00000000-0000-0000-0000-00000000d002','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','appeal','محكمة الاستئناف بالرياض','4467890','القاضي ص', 1, null,'خطة الاستئناف السرية');
insert into public.hearings (id, case_request_id, firm_id, owner_user_id, kind, title, hearing_date, hearing_time, location, court_name, status, notes, minutes) values
  ('00000000-0000-0000-0000-00000000e001','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','judicial','جلسة المرافعة — استراتيجية سرية', (now() at time zone 'Asia/Riyadh')::date + 10, '09:30','محكمة الاستئناف بالرياض - الدائرة الثالثة','', 'scheduled','ملاحظة داخلية','محضر سري'),
  ('00000000-0000-0000-0000-00000000e002','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','judicial','جلسة ثانية', (now() at time zone 'Asia/Riyadh')::date + 20, null,'', 'محكمة الاستئناف','scheduled','',''),
  ('00000000-0000-0000-0000-00000000e003','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','judicial','جلسة سابقة', (now() at time zone 'Asia/Riyadh')::date - 3, '10:00','قديمة','', 'held','',''),
  ('00000000-0000-0000-0000-00000000e004','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','client_meet','اجتماع داخلي مع الموكل', (now() at time zone 'Asia/Riyadh')::date + 5, '12:00','المكتب','', 'scheduled','',''),
  ('00000000-0000-0000-0000-00000000e005','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','judicial','جلسة ملغاة', (now() at time zone 'Asia/Riyadh')::date + 7, '09:00','ملغاة','', 'cancelled','',''),
  ('00000000-0000-0000-0000-00000000e006','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','judicial','جلسة اليوم', (now() at time zone 'Asia/Riyadh')::date, '08:00','محكمة اليوم','', 'scheduled','','');

revoke all on public.case_tracking_links from app_user;

-- An outsider writes a hearing and a stage on case-f through his own session:
-- the hearings / case_stages insert policies check owner_user_id only.
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', false);
insert into public.hearings (case_request_id, firm_id, owner_user_id, kind, title, hearing_date, hearing_time, location, status) values
  ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c3','judicial','عنوان يختاره الغريب', (now() at time zone 'Asia/Riyadh')::date + 1, '07:00','محكمة مزيفة','scheduled');
insert into public.case_stages (case_request_id, firm_id, owner_user_id, degree, court_name, court_case_no, position) values
  ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c3','cassation','محكمة مزيفة','000', 99);
reset role;

-- ── T0 who may create a link ─────────────────────────────────────────────────
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  insert into public.case_tracking_links (id, case_request_id, owner_user_id, firm_id, token_hash) values
    ('00000000-0000-0000-0000-00000000f001','case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('a', 64));
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a4', true);
  insert into public.case_tracking_links (id, case_request_id, owner_user_id, firm_id, token_hash) values
    ('00000000-0000-0000-0000-00000000f002','case-f','00000000-0000-0000-0000-0000000000a4','ffffffff-0000-0000-0000-0000000000f1', repeat('b', 64));
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  insert into public.case_tracking_links (id, case_request_id, owner_user_id, firm_id, token_hash) values
    ('00000000-0000-0000-0000-00000000f003','case-s','00000000-0000-0000-0000-0000000000c1', null, repeat('c', 64));

  -- refusals
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c2', true);
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash)
    values ('case-f','00000000-0000-0000-0000-0000000000c2','ffffffff-0000-0000-0000-0000000000f1', repeat('d', 64));
    raise exception 'T0a FAIL: the client created a tracking link on his lawyer''s case';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', true);
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash)
    values ('case-f','00000000-0000-0000-0000-0000000000c3','ffffffff-0000-0000-0000-0000000000f1', repeat('d', 64));
    raise exception 'T0b FAIL: an outsider created a tracking link on firm F''s case';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash)
    values ('case-f','00000000-0000-0000-0000-0000000000b1', null, repeat('d', 64));
    raise exception 'T0c FAIL: a firm-F2 lawyer created a link on firm F''s case';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash)
    values ('case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f2', repeat('d', 64));
    raise exception 'T0d FAIL: a link on a firm-F case was filed under firm F2';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash)
    values ('case-f','00000000-0000-0000-0000-0000000000a2','ffffffff-0000-0000-0000-0000000000f1', repeat('d', 64));
    raise exception 'T0e FAIL: L created a link in Y''s name';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash)
    values ('case-s','00000000-0000-0000-0000-0000000000a1', null, repeat('d', 64));
    raise exception 'T0f FAIL: L created a link on S''s solo case';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash)
    values ('case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', 'not-a-hash');
    raise exception 'T0g FAIL: a non-hash token was stored';
  exception when check_violation then null; end;
  raise notice 'T0 PASS: case workers create links (firm lawyer, solo lawyer); the client, an outsider, another firm, a wrong firm, another name and a foreign solo case cannot; only a 64-hex hash is stored';
end $$;
reset role;

-- ── T1 the snapshot: exactly the whitelisted fields, from case workers' rows ─
set role service_role;
do $$
declare snap jsonb; want_keys text[] := array['case_number','court','hearings','stage','title']; k text; h jsonb; today date := (now() at time zone 'Asia/Riyadh')::date;
begin
  snap := public.case_tracking_snapshot(repeat('a', 64));
  if snap is null then raise exception 'T1 FAIL: a live link returned nothing'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(snap) key) is distinct from want_keys then
    raise exception 'T1 FAIL: top-level keys are % — expected %', (select array_agg(key order by key) from jsonb_object_keys(snap) key), want_keys;
  end if;
  if snap ->> 'title' <> 'دعوى مطالبة مالية' or snap ->> 'case_number' <> '4467890'
     or snap ->> 'court' <> 'محكمة الاستئناف بالرياض' or snap ->> 'stage' <> 'appeal' then
    raise exception 'T1 FAIL: the snapshot is % (expected the appeal stage written by L, not the outsider''s cassation)', snap;
  end if;
  if jsonb_array_length(snap -> 'hearings') <> 3 then
    raise exception 'T1 FAIL: the snapshot is % — expected 3 hearings (today, +10, +20)', snap;
  end if;
  for h in select * from jsonb_array_elements(snap -> 'hearings') loop
    if (select array_agg(key order by key) from jsonb_object_keys(h) key) is distinct from array['court','date','time'] then
      raise exception 'T1 FAIL: a hearing carries keys % — only date, time, court', (select array_agg(key order by key) from jsonb_object_keys(h) key);
    end if;
  end loop;
  if snap -> 'hearings' -> 0 ->> 'date' <> to_char(today, 'YYYY-MM-DD') or snap -> 'hearings' -> 0 ->> 'time' <> '08:00'
     or snap -> 'hearings' -> 1 ->> 'time' <> '09:30' or snap -> 'hearings' -> 1 ->> 'court' <> 'محكمة الاستئناف بالرياض - الدائرة الثالثة'
     or snap -> 'hearings' -> 2 -> 'time' <> 'null'::jsonb or snap -> 'hearings' -> 2 ->> 'court' <> 'محكمة الاستئناف' then
    raise exception 'T1 FAIL: hearings are % (expected today 08:00, +10 09:30 with its location as court, +20 untimed with court_name)', snap -> 'hearings';
  end if;
  foreach k in array array['عنوان يختاره الغريب','محكمة مزيفة','استراتيجية','ملاحظة داخلية','محضر سري','القاضي','خطة الاستئناف','lost','50000','+966','1010101010','اجتماع داخلي','ملغاة','قديمة','case-f','00000000-'] loop
    if snap::text like '%' || k || '%' then
      raise exception 'T1 FAIL: the snapshot leaks «%»: %', k, snap;
    end if;
  end loop;
  raise notice 'T1 PASS: title, current stage number/court/degree, and today-or-later scheduled judicial hearings (date, time, court) only — no stranger''s rows, titles, notes, minutes, judges, outcomes, fees, phones, ids, past/cancelled/non-judicial entries';
end $$;

-- the solo case: no stage, the court from the case metadata
do $$
declare snap jsonb;
begin
  snap := public.case_tracking_snapshot(repeat('c', 64));
  if snap is distinct from jsonb_build_object('title','قضية منفردة','case_number',null,'court','المحكمة العامة بجدة','stage',null,'hearings','[]'::jsonb) then
    raise exception 'T1b FAIL: the solo snapshot is %', snap;
  end if;
  raise notice 'T1b PASS: a case with no stage shows its metadata court and nulls, never invented values';
end $$;

-- ── T2 unknown and malformed tokens ──────────────────────────────────────────
do $$ begin
  if public.case_tracking_snapshot(repeat('e', 64)) is not null
     or public.case_tracking_snapshot('AAAA') is not null
     or public.case_tracking_snapshot(upper(repeat('a', 64))) is not null
     or public.case_tracking_snapshot(null) is not null
     or public.case_tracking_snapshot(repeat('a', 64) || ' ') is not null then
    raise exception 'T2 FAIL: an unknown or malformed token returned a snapshot';
  end if;
  if (select last_viewed_at from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f001') is null then
    raise exception 'T2 FAIL: a successful view did not stamp last_viewed_at';
  end if;
  raise notice 'T2 PASS: unknown, upper-case, padded and null tokens get NULL; a real view stamps last_viewed_at';
end $$;
reset role;

-- ── T3 sessions never call the snapshot, never read the hash ────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  perform public.case_tracking_snapshot(repeat('a', 64));
  raise exception 'T3 FAIL: a session called case_tracking_snapshot';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform token_hash from public.case_tracking_links;
  raise exception 'T3 FAIL: a session read token_hash';
exception when insufficient_privilege then
  raise notice 'T3 PASS: the snapshot is the service role''s; sessions cannot read token_hash';
end $$;
reset role;
set role anon;
do $$ begin
  perform public.case_tracking_snapshot(repeat('a', 64));
  raise exception 'T3b FAIL: anon called case_tracking_snapshot';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.case_tracking_links;
  raise exception 'T3b FAIL: anon read case_tracking_links';
exception when insufficient_privilege then
  raise notice 'T3b PASS: anon has neither the function nor the table';
end $$;
reset role;

-- ── T4 a link dies with its maker's membership ──────────────────────────────
update public.firm_members set status = 'suspended'
 where firm_id = 'ffffffff-0000-0000-0000-0000000000f1' and user_id = '00000000-0000-0000-0000-0000000000a4';
set role service_role;
do $$ begin
  if public.case_tracking_snapshot(repeat('b', 64)) is not null then
    raise exception 'T4 FAIL: a suspended member''s link still opens the case';
  end if;
  raise notice 'T4 PASS: a suspended member''s link stops working';
end $$;
reset role;

-- ── T5 who sees the links ────────────────────────────────────────────────────
set role app_user;
do $$
declare got text; want text; who text; uid uuid;
begin
  for who, uid, want in
    select * from (values
      ('L',  '00000000-0000-0000-0000-0000000000a1'::uuid, 'f001 f002'),
      ('Y',  '00000000-0000-0000-0000-0000000000a2'::uuid, 'f001 f002'),
      ('U',  '00000000-0000-0000-0000-0000000000a4'::uuid, 'f002'),
      ('S',  '00000000-0000-0000-0000-0000000000c1'::uuid, 'f003'),
      ('M2', '00000000-0000-0000-0000-0000000000b1'::uuid, ''),
      ('K',  '00000000-0000-0000-0000-0000000000c2'::uuid, ''),
      ('G',  '00000000-0000-0000-0000-0000000000c3'::uuid, '')
    ) v(who, uid, want)
  loop
    perform set_config('test.uid', uid::text, true);
    select coalesce(string_agg(substr(id::text, 33), ' ' order by id), '') into got from public.case_tracking_links;
    if got is distinct from want then
      raise exception 'T5 FAIL: % sees [%] — expected [%]', who, got, want;
    end if;
  end loop;
  raise notice 'T5 PASS: the case''s workers see its links (a suspended maker only his own); the client, another firm and an outsider see none';
end $$;
reset role;

-- ── T6 revoke only, never un-revoke, no delete ──────────────────────────────
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  update public.case_tracking_links set revoked_at = now() where id = '00000000-0000-0000-0000-00000000f002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T6a FAIL: a colleague could not revoke a departed member''s link'; end if;
  begin
    update public.case_tracking_links set token_hash = repeat('f', 64) where id = '00000000-0000-0000-0000-00000000f001';
    raise exception 'T6b FAIL: a session rewrote a token hash';
  exception when insufficient_privilege then null; end;
  begin
    update public.case_tracking_links set revoked_at = null where id = '00000000-0000-0000-0000-00000000f002';
    raise exception 'T6c FAIL: a revoked link was brought back';
  exception when insufficient_privilege then null; end;
  begin
    update public.case_tracking_links set last_viewed_at = now() where id = '00000000-0000-0000-0000-00000000f001';
    raise exception 'T6d FAIL: a session wrote last_viewed_at';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f001';
    raise exception 'T6e FAIL: a session deleted a link';
  exception when insufficient_privilege then null; end;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', true);
  update public.case_tracking_links set revoked_at = now() where id = '00000000-0000-0000-0000-00000000f001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6f FAIL: an outsider revoked firm F''s link'; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  update public.case_tracking_links set revoked_at = now() where id = '00000000-0000-0000-0000-00000000f001';
  raise notice 'T6 PASS: a case worker revokes; nobody un-revokes, rewrites the hash or the view stamp, or deletes; an outsider cannot touch the link';
end $$;
reset role;

set role service_role;
do $$ begin
  if public.case_tracking_snapshot(repeat('a', 64)) is not null then
    raise exception 'T7 FAIL: a revoked link still opens the case';
  end if;
  raise notice 'T7 PASS: a revoked link returns NULL';
end $$;
reset role;

-- ── T8 the app's hash is the database's hash ────────────────────────────────
-- node: createHash('sha256').update('a'.repeat(64), 'utf8').digest('hex')
-- (shareSecrets.sha256Hex) — trackingView.test.ts pins the same function.
do $$ begin
  if encode(sha256(convert_to(repeat('a', 64), 'UTF8')), 'hex') <> 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb' then
    raise exception 'T8 FAIL: SQL sha256 hex differs from the app''s sha256Hex';
  end if;
  raise notice 'T8 PASS: SQL encode(sha256(…)) equals the app''s sha256Hex for the same token';
end $$;

\echo 'case_tracking_links: ALL PASS'
