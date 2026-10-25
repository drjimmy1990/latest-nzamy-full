-- hearing_reminders.test.sql — proves 20261025_30 (P4 N3.2, hearing reminders).
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
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261025_30_hearing_reminders.sql \
--     $M/20261025_30_hearing_reminders.sql \
--     $T/hearing_reminders.test.sql
-- Why each link: the first four give lawyer_profiles.practice_kind (the
-- consultant arm reads it); prelude_case_tables_real drops the stub hearings
-- so phase1 builds the live table; phase2 adds service_requests.firm_id and
-- the membership helpers; phase5 is notification_outbox; phase3 + case_notes +
-- 20261017_41 are case_team_members.
--
-- NEGATIVE CONTROLS (must FAIL):
--   * the chain without the two 20261025_30 lines
--     → T1 aborts: function public.hearing_reminder_targets(date, date) does not exist.
--   * the first draft of the function, which did not check that the hearing's
--     owner belongs to the firm it names (recorded 2026-10-25)
--     → "T1 FAIL: recipients are … C:consultant@b007 G:owner@b007 L:lead@b007
--       O:firm_owner@b007 P:consultant@b007 G:owner@b008 O:firm_owner@b008":
--       an outsider's own hearing put his chosen title in F's bells.
--   * 20260904_phase5's UPDATE policy, whose WITH CHECK tests the status only
--     (recorded 2026-10-25, before section 5 of the migration)
--     → "T6d FAIL: a deadline owner turned his deadline row into a hearing
--       reminder". _verify's hearing section raises on the same policy.
--
-- People (firm F, owner O):
--   O  owner of F (managing_partner)        L  lawyer of F, lead of case-f
--   Y  legal secretary of F, keeps h1        C  legal_consultant of F, on case-f's team
--   P  lawyer of F by role, practice_kind consultant, on case-f's team
--   T  lawyer of F (advocate) on case-f's team — a colleague, not a consultant
--   U  lawyer of F, lead of case-u, SUSPENDED      K  the client of case-f
--   S  solo lawyer, case-s (no firm), assigned_to G (unverified free text)
--   G  an outsider
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (RLS bypassed on purpose) ──────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a0'), -- O
  ('00000000-0000-0000-0000-0000000000a1'), -- L
  ('00000000-0000-0000-0000-0000000000a2'), -- Y
  ('00000000-0000-0000-0000-0000000000a3'), -- C
  ('00000000-0000-0000-0000-0000000000a4'), -- P
  ('00000000-0000-0000-0000-0000000000a5'), -- T
  ('00000000-0000-0000-0000-0000000000a6'), -- U
  ('00000000-0000-0000-0000-0000000000a7'), -- K
  ('00000000-0000-0000-0000-0000000000a8'), -- S
  ('00000000-0000-0000-0000-0000000000a9'); -- G
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a0','firm','O'),
  ('00000000-0000-0000-0000-0000000000a1','lawyer','L'),
  ('00000000-0000-0000-0000-0000000000a2','lawyer','Y'),
  ('00000000-0000-0000-0000-0000000000a3','lawyer','C'),
  ('00000000-0000-0000-0000-0000000000a4','lawyer','P'),
  ('00000000-0000-0000-0000-0000000000a5','lawyer','T'),
  ('00000000-0000-0000-0000-0000000000a6','lawyer','U'),
  ('00000000-0000-0000-0000-0000000000a7','individual','K'),
  ('00000000-0000-0000-0000-0000000000a8','lawyer','S'),
  ('00000000-0000-0000-0000-0000000000a9','lawyer','G');
insert into public.lawyer_profiles (user_id, practice_kind) values
  ('00000000-0000-0000-0000-0000000000a4', 'consultant'),
  ('00000000-0000-0000-0000-0000000000a5', 'advocate');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a0','مكتب الاختبار');
-- (the owner's own managing_partner row is written by the firm_profiles trigger)
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','legal_secretary','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a3','legal_consultant','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a4','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a5','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a6','lawyer','suspended', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id) values
  ('case-f','00000000-0000-0000-0000-0000000000a7','قضية المكتب','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-u','00000000-0000-0000-0000-0000000000a7','قضية الموقوف','00000000-0000-0000-0000-0000000000a6','ffffffff-0000-0000-0000-0000000000f1'),
  ('case-s','00000000-0000-0000-0000-0000000000a8','قضية منفردة','00000000-0000-0000-0000-0000000000a9', null);
insert into public.case_team_members (request_id, user_id, firm_id, added_by) values
  ('case-f','00000000-0000-0000-0000-0000000000a3','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1'),
  ('case-f','00000000-0000-0000-0000-0000000000a4','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1'),
  ('case-f','00000000-0000-0000-0000-0000000000a5','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1');
insert into public.hearings (id, case_request_id, firm_id, owner_user_id, kind, title, hearing_date, hearing_time, status) values
  ('00000000-0000-0000-0000-00000000b001','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','judicial','جلسة المكتب','2026-11-10','09:00','scheduled'),
  ('00000000-0000-0000-0000-00000000b002','case-s', null,'00000000-0000-0000-0000-0000000000a8','judicial','جلسة منفردة','2026-11-11','10:00','scheduled'),
  ('00000000-0000-0000-0000-00000000b003','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','judicial','جلسة ملغاة','2026-11-10','09:00','cancelled'),
  ('00000000-0000-0000-0000-00000000b004', null,'ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','appointment','موعد بلا قضية','2026-11-12', null,'scheduled'),
  ('00000000-0000-0000-0000-00000000b005','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','judicial','جلسة بعيدة','2026-12-30','09:00','scheduled'),
  ('00000000-0000-0000-0000-00000000b006','case-u','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','judicial','جلسة الموقوف','2026-11-13','11:00','scheduled');
insert into public.deadlines (id, owner_user_id, title, trigger_date, due_date) values
  ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000a8','مهلة اعتراض','2026-10-20','2026-11-19'),
  ('00000000-0000-0000-0000-00000000d002','00000000-0000-0000-0000-0000000000a1','مهلة غيره','2026-10-20','2026-11-19');

-- G — an outsider with a session — writes two hearings through his own token:
-- one pointing at firm F's case, one carrying only F's firm_id. The insert
-- policy only checks owner_user_id, and a foreign key ignores RLS, so both
-- rows are accepted. They must remind G himself and nobody at F.
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a9', false);
insert into public.hearings (id, case_request_id, firm_id, owner_user_id, kind, title, hearing_date, hearing_time, status) values
  ('00000000-0000-0000-0000-00000000b007','case-f', null,'00000000-0000-0000-0000-0000000000a9','judicial','عنوان يختاره الغريب','2026-11-14','09:00','scheduled'),
  ('00000000-0000-0000-0000-00000000b008', null,'ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a9','appointment','موعد على مكتب غيره','2026-11-14','10:00','scheduled');
reset role;

-- ── T1 the recipient rule, read as the scheduler (service_role) ─────────────
set role service_role;
do $$
declare got text; want text;
begin
  select string_agg(p.display_name || ':' || t.via || '@' || substr(t.hearing_id::text, 33), ' ' order by t.hearing_id, p.display_name)
    into got
    from public.hearing_reminder_targets('2026-11-01', '2026-11-20') t
    join public.profiles p on p.id = t.recipient_user_id;
  want := 'C:consultant@b001 L:lead@b001 O:firm_owner@b001 P:consultant@b001 Y:owner@b001 '
       || 'S:owner@b002 '
       || 'L:owner@b004 O:firm_owner@b004 '
       || 'L:owner@b006 O:firm_owner@b006 '
       || 'G:owner@b007 '
       || 'G:owner@b008';
  if got is distinct from want then
    raise exception 'T1 FAIL: recipients are % — expected %', got, want;
  end if;
  raise notice 'T1 PASS: owner, verified lead, case-team consultants (role or practice kind) and firm owner; never the client, the advocate colleague, the unverified or suspended lead, a cancelled or out-of-window hearing — and an outsider''s hearing on F''s case or firm reminds only himself';
end $$;

do $$
declare n int;
begin
  select count(*) into n from public.hearing_reminder_targets('2026-11-10', '2026-11-10') t
   where t.hearing_id = '00000000-0000-0000-0000-00000000b001' and t.title = 'جلسة المكتب'
     and t.hearing_time = '09:00' and t.case_request_id = 'case-f';
  if n <> 5 then raise exception 'T1b FAIL: % rows carry the hearing fields (expected 5)', n; end if;
  raise notice 'T1b PASS: each target row carries the hearing''s own date, time, title and case';
end $$;

-- ── T2 the hearing once-only key is an ON CONFLICT arbiter; the deadline key still is ──
do $$
declare n int;
begin
  for i in 1..2 loop
    insert into public.notification_outbox (hearing_id, recipient_user_id, channel, kind, scheduled_for, payload)
    values ('00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-0000000000a8','in_app','hearing_reminder_3d','2026-11-08T07:00:00Z','{"via":"owner"}')
    on conflict (hearing_id, recipient_user_id, channel, kind)
    do update set scheduled_for = excluded.scheduled_for, status = 'pending';
    insert into public.notification_outbox (deadline_id, recipient_user_id, channel, kind, scheduled_for)
    values ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-0000000000a8','in_app','hearing_reminder_3d','2026-11-12T03:00:00Z')
    on conflict (deadline_id, recipient_user_id, channel, kind)
    do update set scheduled_for = excluded.scheduled_for;
  end loop;
  select count(*) into n from public.notification_outbox where recipient_user_id = '00000000-0000-0000-0000-0000000000a8';
  if n <> 2 then raise exception 'T2 FAIL: % rows after two upserts of each kind (expected 2)', n; end if;
  raise notice 'T2 PASS: both keys arbitrate their own upserts; a deadline row and a hearing row with the same recipient/channel/kind coexist';
end $$;

-- ── T3 a row is for a deadline or a hearing, never both ─────────────────────
do $$ begin
  insert into public.notification_outbox (deadline_id, hearing_id, recipient_user_id, channel, kind, scheduled_for)
  values ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-0000000000a8','in_app','x', now());
  raise exception 'T3 FAIL: a row with both a deadline and a hearing was accepted';
exception when check_violation then
  raise notice 'T3 PASS: notification_outbox_one_source refuses a two-source row (23514)';
end $$;

-- Fixture rows for the session tests (still as service_role).
insert into public.notification_outbox (hearing_id, recipient_user_id, channel, kind, scheduled_for, payload) values
  ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000a3','in_app','hearing_reminder_eve','2026-11-09T17:00:00Z','{"via":"consultant"}'),
  ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000a0','in_app','hearing_reminder_eve','2026-11-09T17:00:00Z','{"via":"firm_owner"}');
reset role;

-- ── T4 the function is the scheduler's only ─────────────────────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  perform * from public.hearing_reminder_targets('2026-11-01', '2026-11-20');
  raise exception 'T4 FAIL: a session listed hearing reminder targets';
exception when insufficient_privilege then
  raise notice 'T4 PASS: a session cannot EXECUTE hearing_reminder_targets (42501)';
end $$;
reset role;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if has_function_privilege(r, 'public.hearing_reminder_targets(date,date)', 'EXECUTE') then
      raise exception 'T4b FAIL: % can EXECUTE hearing_reminder_targets', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.hearing_reminder_targets(date,date)', 'EXECUTE') then
    raise exception 'T4b FAIL: service_role cannot EXECUTE hearing_reminder_targets';
  end if;
  raise notice 'T4b PASS: EXECUTE is service_role only';
end $$;

-- ── T5 sessions read their own reminder and nobody else's ───────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
do $$
declare n int;
begin
  select count(*) into n from public.notification_outbox where hearing_id is not null;
  if n <> 1 then raise exception 'T5 FAIL: the consultant reads % hearing rows (expected 1: his own)', n; end if;
  raise notice 'T5 PASS: a recipient reads the reminder addressed to him only';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a9', false);
do $$
declare n int;
begin
  select count(*) into n from public.notification_outbox;
  if n <> 0 then raise exception 'T5b FAIL: an outsider reads % outbox rows', n; end if;
  raise notice 'T5b PASS: an outsider reads none';
end $$;

-- ── T6 a session can neither queue nor rewrite a hearing reminder ───────────
-- The hearing's own keeper (Y) tries to queue one to himself, and S (owner of
-- deadline d001) tries to ride his deadline's insert arm with a hearing_id.
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', false);
do $$ begin
  insert into public.notification_outbox (hearing_id, recipient_user_id, channel, kind, scheduled_for)
  values ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000a2','in_app','hearing_reminder_7d', now());
  raise exception 'T6 FAIL: a session queued a hearing reminder';
exception when insufficient_privilege then
  raise notice 'T6 PASS: a session cannot insert a hearing row (RLS 42501)';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a8', false);
do $$ begin
  insert into public.notification_outbox (deadline_id, hearing_id, recipient_user_id, channel, kind, scheduled_for)
  values ('00000000-0000-0000-0000-00000000d001','00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000a9','in_app','spam', now());
  raise exception 'T6b FAIL: a deadline owner attached a hearing_id';
exception when check_violation or insufficient_privilege then
  raise notice 'T6b PASS: a deadline owner cannot attach someone''s hearing to his row';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
do $$
declare n int;
begin
  update public.notification_outbox set status = 'cancelled', scheduled_for = now() where hearing_id is not null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6c FAIL: a recipient updated % hearing rows', n; end if;
  delete from public.notification_outbox where hearing_id is not null;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6c FAIL: a recipient deleted % hearing rows', n; end if;
  raise notice 'T6c PASS: a recipient can neither update nor delete a hearing reminder';
end $$;
-- T6d: S owns deadline d001 and may cancel its reminder (USING), but the
-- phase5 WITH CHECK tested only the status, so the same UPDATE could turn his
-- deadline row into a hearing row for any hearing, addressed to anyone — the
-- scheduler would then deliver that hearing's title, date and court.
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a8', false);
do $$ begin
  update public.notification_outbox
     set deadline_id = null,
         hearing_id = '00000000-0000-0000-0000-00000000b001',
         recipient_user_id = '00000000-0000-0000-0000-0000000000a8',
         kind = 'hearing_reminder_morning',
         scheduled_for = '2026-11-10T04:00:00Z'
   where deadline_id = '00000000-0000-0000-0000-00000000d001';
  raise exception 'T6d FAIL: a deadline owner turned his deadline row into a hearing reminder';
exception when insufficient_privilege or check_violation then
  raise notice 'T6d PASS: a deadline row cannot be rewritten into a hearing row (WITH CHECK)';
end $$;
do $$ begin
  update public.notification_outbox
     set deadline_id = '00000000-0000-0000-0000-00000000d002'
   where deadline_id = '00000000-0000-0000-0000-00000000d001';
  raise exception 'T6e FAIL: a deadline owner moved his row onto someone else''s deadline';
exception when insufficient_privilege or check_violation then
  raise notice 'T6e PASS: a row cannot be moved onto a deadline its writer cannot access';
end $$;
do $$
declare n int;
begin
  update public.notification_outbox set status = 'cancelled'
   where deadline_id = '00000000-0000-0000-0000-00000000d001' and status = 'pending';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T6f FAIL: the deadline owner cancelled % of his rows (expected 1)', n; end if;
  update public.notification_outbox set status = 'pending'
   where deadline_id = '00000000-0000-0000-0000-00000000d001';
  raise notice 'T6f PASS: the deadline owner still cancels (and re-arms) his own deadline reminder';
end $$;
reset role;

-- ── T7 deleting the hearing deletes its reminders; deadline rows are untouched ──
do $$
declare n int;
begin
  delete from public.hearings where id = '00000000-0000-0000-0000-00000000b001';
  select count(*) into n from public.notification_outbox where hearing_id = '00000000-0000-0000-0000-00000000b001';
  if n <> 0 then raise exception 'T7 FAIL: % reminders outlived their hearing', n; end if;
  select count(*) into n from public.notification_outbox where deadline_id is not null;
  if n <> 1 then raise exception 'T7 FAIL: deadline rows changed (% left)', n; end if;
  raise notice 'T7 PASS: ON DELETE CASCADE from hearings; deadline reminders untouched';
end $$;

select 'hearing_reminders: ALL PASS';
