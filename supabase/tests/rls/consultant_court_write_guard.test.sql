-- consultant_court_write_guard.test.sql — proves 20261019_21 (Art. 18 of نظام
-- المحاماة: a legal consultant does not plead or manage hearings, so the
-- database refuses his hearings, case stages and court deadlines even when he
-- writes them straight through PostgREST with his own token).
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
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20261019_21_consultant_court_write_guard.sql \
--     $M/20261019_21_consultant_court_write_guard.sql \
--     $T/consultant_court_write_guard.test.sql
-- Why each link:
--   prelude_lawyer_profiles_live.sql  the live lawyer_profiles columns, grants
--       and policies (see its header); its rows b1 / b2 / c1 are unused here.
--   prelude_signup_metadata_live.sql  auth.users.raw_user_meta_data, without
--       which 20261019_20 refuses to run.
--   20261016_10   the live SELECT column lock; 20261019_20 needs it.
--   20261019_20   lawyer_profiles.practice_kind — the column the guard reads.
--   prelude_case_tables_real.sql  drops the reduced stub hearings / case_stages
--       so the next file builds the LIVE shapes and policies.
--   20260903_phase1 / 20260904_phase5  hearings, case_stages, deadlines exactly
--       as live: GRANT ALL to authenticated (stubs.sql's default privileges,
--       like the self-host restore) and owner-only RLS checks — the hole.
--
-- NEGATIVE CONTROL (must FAIL; recorded 2026-10-18) — the chain without the
-- two 20261019_21 files:
--   bash $T/run.sh $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql $M/20260903_phase1_case_tables.sql \
--     $M/20260904_phase5_deadline_radar.sql $T/consultant_court_write_guard.test.sql
--   → "T1 FAIL: allowed — insert into public.hearings …" (the consultant's
--     judicial hearing is written).
--
-- HOW A SESSION IS PLAYED: `set role authenticated` + test.uid, i.e. exactly
-- what PostgREST does for a signed-in request (it sets the `role` setting to
-- authenticated; auth.uid() is the token's sub). T10 repeats the key cases as
-- anon and as app_user — a role that is neither an API role nor trusted — to
-- show the guard is fail-closed: it trusts only postgres, service_role,
-- supabase_admin and supabase_auth_admin. T12 plays GoTrue exactly: `set
-- session authorization supabase_auth_admin` (the role is created here), no
-- SET ROLE, and an account delete that cascades into the court tables.
-- T13 / T14: an UPDATE that only nulls ON DELETE SET NULL pointers (what a
-- delete cascades) passes from anyone; anything else with it is refused.
--
-- A refusal must be THE GUARD'S: RLS failures and denied EXECUTE are 42501 too,
-- so t_refused() also requires the Art. 18 message.
--
-- Actors:
--   K  …e1  consultant (lawyer_profiles.practice_kind = 'consultant'),
--           active member of firm F
--   A  …e2  advocate, active member of firm F
--   N  …e3  firm account with NO lawyer_profiles row, owner of firm F
--           (GoTrue deletes this account in T12)
--   KA …e4  consultant who is also a platform admin (profiles.user_type admin)
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP on

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3'), ('00000000-0000-0000-0000-0000000000e4');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'lawyer', 'مستشار قانوني'),
  ('00000000-0000-0000-0000-0000000000e2', 'lawyer', 'محامٍ مرخّص'),
  ('00000000-0000-0000-0000-0000000000e3', 'firm',   'مكتب'),
  ('00000000-0000-0000-0000-0000000000e4', 'admin',  'مشرف مستشار');
insert into public.lawyer_profiles (user_id, practice_kind) values
  ('00000000-0000-0000-0000-0000000000e1', 'consultant'),
  ('00000000-0000-0000-0000-0000000000e2', 'advocate'),
  ('00000000-0000-0000-0000-0000000000e4', 'consultant');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e3', 'مكتب الاختبار');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'legal_consultant', 'active', now()),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e2', 'lawyer', 'active', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('req-k', '00000000-0000-0000-0000-0000000000e1', 'قضية المستشار', '00000000-0000-0000-0000-0000000000e1'),
  ('req-a', '00000000-0000-0000-0000-0000000000e2', 'قضية المحامي', '00000000-0000-0000-0000-0000000000e2'),
  ('req-n', '00000000-0000-0000-0000-0000000000e3', 'قضية المكتب', '00000000-0000-0000-0000-0000000000e3');

-- t_refused: the statement must fail with 42501 AND the guard's Art. 18 text.
-- SECURITY INVOKER, so the statement runs as whatever role the caller set.
create function public.t_refused(p_label text, p_stmt text) returns void
language plpgsql as $$
begin
  begin
    execute p_stmt;
  exception when insufficient_privilege then
    if sqlerrm <> 'هذه الأداة للمحامي المرخّص بالترافع؛ المستشار القانوني لا يترافع ولا يدير الجلسات (المادة ١٨ من نظام المحاماة).' then
      raise exception '% FAIL: 42501, but not the Art. 18 guard: %', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception '% FAIL: allowed — %', p_label, left(p_stmt, 110);
end $$;

-- t_ok: the statement must succeed (any error is reported with its label).
create function public.t_ok(p_label text, p_stmt text) returns void
language plpgsql as $$
begin
  execute p_stmt;
exception when others then
  raise exception '% FAIL: refused (% %) — %', p_label, sqlstate, sqlerrm, left(p_stmt, 110);
end $$;

-- T1 (first, so the negative control stops on behaviour) — the consultant's
-- own judicial hearing, through his session
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_refused('T1',
    $q$insert into public.hearings (owner_user_id, case_request_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'req-k', 'judicial', 'جلسة', '2026-11-01')$q$);
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.hearings where owner_user_id = '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'T1 FAIL: a hearing owned by the consultant was written';
  end if;
  raise notice 'T1 PASS: a consultant session inserting his own judicial hearing gets 42501 (Art. 18) and no row is written';
end $$;

-- T2 every other court row from the same session: an appointment on the diary
-- (the hearings route refuses every kind), a case stage, and each non-contract
-- deadline kind
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_refused('T2 appointment',
    $q$insert into public.hearings (owner_user_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'appointment', 'موعد', '2026-11-02')$q$);
  perform public.t_refused('T2 case stage',
    $q$insert into public.case_stages (case_request_id, owner_user_id, degree, court_name)
       values ('req-k', '00000000-0000-0000-0000-0000000000e1', 'first_instance', 'المحكمة العامة')$q$);
  perform public.t_refused('T2 statutory deadline',
    $q$insert into public.deadlines (owner_user_id, case_request_id, title, kind, trigger_date, due_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'req-k', 'مهلة الاستئناف', 'statutory', '2026-11-01', '2026-12-01')$q$);
  perform public.t_refused('T2 court_order deadline',
    $q$insert into public.deadlines (owner_user_id, title, kind, trigger_date, due_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'أمر المحكمة', 'court_order', '2026-11-01', '2026-11-10')$q$);
  perform public.t_refused('T2 internal deadline',
    $q$insert into public.deadlines (owner_user_id, title, kind, trigger_date, due_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'مهلة داخلية', 'internal', '2026-11-01', '2026-11-05')$q$);
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.hearings    where owner_user_id = '00000000-0000-0000-0000-0000000000e1')
     or exists (select 1 from public.case_stages where owner_user_id = '00000000-0000-0000-0000-0000000000e1')
     or exists (select 1 from public.deadlines   where owner_user_id = '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'T2 FAIL: a court row owned by the consultant was written';
  end if;
  raise notice 'T2 PASS: an appointment, a case stage and statutory / court_order / internal deadlines from the consultant all get 42501; nothing is written';
end $$;

-- T3 a contract obligation is his to manage: kind = 'contract' passes
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_ok('T3',
    $q$insert into public.deadlines (id, owner_user_id, title, kind, trigger_date, due_date, priority)
       values ('00000000-0000-0000-0000-00000000dc01', '00000000-0000-0000-0000-0000000000e1',
               'إشعار التجديد / عدم التجديد — عقد توريد', 'contract', '2026-11-01', '2027-01-01', 'normal')$q$);
end $$;
reset role;
do $$
begin
  if (select count(*) from public.deadlines where owner_user_id = '00000000-0000-0000-0000-0000000000e1') <> 1 then
    raise exception 'T3 FAIL: the consultant''s contract deadline is not there';
  end if;
  raise notice 'T3 PASS: the consultant inserts a kind = ''contract'' deadline';
end $$;

-- T4 the advocate writes all three; T5 so does an account with no lawyer row
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e2', true);
  perform public.t_ok('T4 hearing',
    $q$insert into public.hearings (id, owner_user_id, case_request_id, firm_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-0000000000e2', 'req-a',
               '00000000-0000-0000-0000-0000000000f1', 'judicial', 'جلسة المحامي', '2026-11-03')$q$);
  perform public.t_ok('T4 case stage',
    $q$insert into public.case_stages (id, case_request_id, owner_user_id, firm_id, degree)
       values ('00000000-0000-0000-0000-00000000a402', 'req-a', '00000000-0000-0000-0000-0000000000e2',
               '00000000-0000-0000-0000-0000000000f1', 'appeal')$q$);
  perform public.t_ok('T4 statutory deadline',
    $q$insert into public.deadlines (owner_user_id, case_request_id, title, kind, trigger_date, due_date)
       values ('00000000-0000-0000-0000-0000000000e2', 'req-a', 'مهلة الاعتراض', 'statutory', '2026-11-01', '2026-12-01')$q$);

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e3', true);
  perform public.t_ok('T5 hearing',
    $q$insert into public.hearings (owner_user_id, case_request_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-0000000000e3', 'req-n', 'judicial', 'جلسة المكتب', '2026-11-04')$q$);
  perform public.t_ok('T5 case stage',
    $q$insert into public.case_stages (case_request_id, owner_user_id)
       values ('req-n', '00000000-0000-0000-0000-0000000000e3')$q$);
  perform public.t_ok('T5 court_order deadline',
    $q$insert into public.deadlines (owner_user_id, title, kind, trigger_date, due_date)
       values ('00000000-0000-0000-0000-0000000000e3', 'أمر المحكمة', 'court_order', '2026-11-01', '2026-11-10')$q$);
end $$;
reset role;
do $$
begin
  if (select count(*) from public.hearings where owner_user_id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3')) <> 2
     or (select count(*) from public.case_stages where owner_user_id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3')) <> 2
     or (select count(*) from public.deadlines where owner_user_id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3')) <> 2 then
    raise exception 'T4/T5 FAIL: the advocate''s or the firm account''s rows are not all there';
  end if;
  raise notice 'T4 PASS: an advocate session inserts a hearing, a case stage and a statutory deadline';
  raise notice 'T5 PASS: a session with no lawyer_profiles row inserts all three';
end $$;

-- T6 the server writes consultant-owned court rows: the service role (Next
-- routes on the service client, cron) and a plain postgres session (SQL
-- editor, backfills). These rows are the ones T7 / T8 try to change.
set role service_role;
do $$
begin
  perform public.t_ok('T6 service_role hearing',
    $q$insert into public.hearings (id, owner_user_id, case_request_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-00000000c601', '00000000-0000-0000-0000-0000000000e1', 'req-k', 'judicial', 'جلسة قديمة', '2026-11-05')$q$);
  perform public.t_ok('T6 service_role case stage',
    $q$insert into public.case_stages (id, case_request_id, owner_user_id, notes)
       values ('00000000-0000-0000-0000-00000000c602', 'req-k', '00000000-0000-0000-0000-0000000000e1', 'قبل')$q$);
  perform public.t_ok('T6 service_role deadline',
    $q$insert into public.deadlines (id, owner_user_id, case_request_id, title, kind, trigger_date, due_date)
       values ('00000000-0000-0000-0000-00000000c603', '00000000-0000-0000-0000-0000000000e1', 'req-k', 'مهلة قديمة', 'statutory', '2026-11-01', '2026-12-01')$q$);
  perform public.t_ok('T6 service_role firm hearing',
    $q$insert into public.hearings (id, owner_user_id, firm_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-00000000c604', '00000000-0000-0000-0000-0000000000e1',
               '00000000-0000-0000-0000-0000000000f1', 'judicial', 'جلسة المستشار في المكتب', '2026-11-06')$q$);
end $$;
reset role;
do $$
begin
  if pg_catalog.current_setting('role') <> 'none' or session_user <> 'postgres' then
    raise exception 'T6 SETUP: expected a plain postgres session, got role % / session_user %',
      pg_catalog.current_setting('role'), session_user;
  end if;
  perform public.t_ok('T6 postgres hearing',
    $q$insert into public.hearings (owner_user_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'judicial', 'جلسة من محرّر SQL', '2026-11-07')$q$);
  if (select count(*) from public.hearings where owner_user_id = '00000000-0000-0000-0000-0000000000e1') <> 3
     or (select count(*) from public.case_stages where owner_user_id = '00000000-0000-0000-0000-0000000000e1') <> 1
     or (select count(*) from public.deadlines where owner_user_id = '00000000-0000-0000-0000-0000000000e1' and kind <> 'contract') <> 1 then
    raise exception 'T6 FAIL: the server''s consultant-owned rows are not all there';
  end if;
  raise notice 'T6 PASS: service_role and a plain postgres session insert consultant-owned hearings, stages and court deadlines';
end $$;

-- T7 UPDATE by the consultant: his existing court rows are refused (RLS lets
-- him reach them — they are his — so the refusal is the guard's); his
-- contract deadline still moves; no deadline crosses the contract line
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_refused('T7 hearing update',
    $q$update public.hearings set status = 'adjourned' where id = '00000000-0000-0000-0000-00000000c601'$q$);
  perform public.t_refused('T7 case stage update',
    $q$update public.case_stages set notes = 'بعد' where id = '00000000-0000-0000-0000-00000000c602'$q$);
  perform public.t_refused('T7 deadline update',
    $q$update public.deadlines set status = 'done' where id = '00000000-0000-0000-0000-00000000c603'$q$);
  perform public.t_refused('T7 court deadline relabelled as contract',
    $q$update public.deadlines set kind = 'contract' where id = '00000000-0000-0000-0000-00000000c603'$q$);
  perform public.t_refused('T7 contract deadline relabelled as court',
    $q$update public.deadlines set kind = 'statutory' where id = '00000000-0000-0000-0000-00000000dc01'$q$);
  perform public.t_ok('T7 contract deadline sync',
    $q$update public.deadlines set due_date = '2027-02-01', status = 'done', completed_at = now()
        where id = '00000000-0000-0000-0000-00000000dc01'$q$);
end $$;
reset role;
do $$
begin
  if (select status from public.hearings where id = '00000000-0000-0000-0000-00000000c601') <> 'scheduled'
     or (select notes from public.case_stages where id = '00000000-0000-0000-0000-00000000c602') <> 'قبل'
     or (select status || '/' || kind from public.deadlines where id = '00000000-0000-0000-0000-00000000c603') <> 'open/statutory' then
    raise exception 'T7 FAIL: a refused update changed a court row';
  end if;
  if (select status || '/' || kind || '/' || due_date from public.deadlines where id = '00000000-0000-0000-0000-00000000dc01') <> 'done/contract/2027-02-01' then
    raise exception 'T7 FAIL: the contract deadline did not move';
  end if;
  raise notice 'T7 PASS: the consultant''s updates of his hearing / stage / court deadline get 42501 and change nothing; relabelling either way is refused; his contract deadline syncs';
end $$;

-- T8 the two firm paths (UPDATE policies admit any active member of the firm):
--   caller — the consultant edits the ADVOCATE's firm hearing and stage:
--            refused (what the route checks: the caller);
--   owner  — the advocate edits the CONSULTANT's firm hearing: refused too
--            (the brief's rule: a consultant-owned row is not a court row).
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_refused('T8 caller: consultant edits the advocate''s hearing',
    $q$update public.hearings set status = 'held', minutes = 'محضر' where id = '00000000-0000-0000-0000-00000000a401'$q$);
  perform public.t_refused('T8 caller: consultant edits the advocate''s stage',
    $q$update public.case_stages set outcome = 'won' where id = '00000000-0000-0000-0000-00000000a402'$q$);

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e2', true);
  perform public.t_refused('T8 owner: advocate edits the consultant''s hearing',
    $q$update public.hearings set status = 'held' where id = '00000000-0000-0000-0000-00000000c604'$q$);
end $$;
reset role;
do $$
begin
  if (select status from public.hearings where id = '00000000-0000-0000-0000-00000000a401') <> 'scheduled'
     or (select outcome from public.case_stages where id = '00000000-0000-0000-0000-00000000a402') is not null
     or (select status from public.hearings where id = '00000000-0000-0000-0000-00000000c604') <> 'scheduled' then
    raise exception 'T8 FAIL: a refused firm update changed a row';
  end if;
  raise notice 'T8 PASS: a consultant firm member cannot edit an advocate colleague''s hearing / stage, and a consultant-owned firm hearing is refused to the advocate';
end $$;

-- T9 a consultant who is a platform admin passes (the route's isPlatformAdmin
-- = public.is_admin() for the caller)
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e4', true);
  perform public.t_ok('T9 admin hearing',
    $q$insert into public.hearings (id, owner_user_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-00000000a901', '00000000-0000-0000-0000-0000000000e4', 'judicial', 'جلسة المشرف', '2026-11-08')$q$);
  perform public.t_ok('T9 admin statutory deadline',
    $q$insert into public.deadlines (owner_user_id, title, kind, trigger_date, due_date)
       values ('00000000-0000-0000-0000-0000000000e4', 'مهلة المشرف', 'statutory', '2026-11-01', '2026-12-01')$q$);
  perform public.t_ok('T9 admin hearing update',
    $q$update public.hearings set status = 'held' where id = '00000000-0000-0000-0000-00000000a901'$q$);
end $$;
reset role;
do $$
begin
  if (select status from public.hearings where id = '00000000-0000-0000-0000-00000000a901') is distinct from 'held' then
    raise exception 'T9 FAIL: the admin consultant''s hearing was not written / updated';
  end if;
  raise notice 'T9 PASS: a consultant who is a platform admin inserts and updates his hearing and a statutory deadline';
end $$;

-- T10 fail-closed: the guard trusts postgres / service_role / supabase_admin
-- only. anon (an API role whose RLS would refuse anyway — the message shows the
-- guard answered first) and app_user (neither an API role nor trusted) are
-- guarded like authenticated; app_user still writes an advocate's hearing.
set role anon;
do $$
begin
  perform set_config('test.uid', '', true);
  perform public.t_refused('T10 anon',
    $q$insert into public.hearings (owner_user_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'judicial', 'جلسة', '2026-11-09')$q$);
end $$;
reset role;
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_refused('T10 app_user as the consultant',
    $q$insert into public.hearings (owner_user_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-0000000000e1', 'judicial', 'جلسة', '2026-11-09')$q$);
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e2', true);
  perform public.t_ok('T10 app_user as the advocate',
    $q$insert into public.hearings (owner_user_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-0000000000e2', 'judicial', 'جلسة', '2026-11-09')$q$);
end $$;
reset role;
do $$
begin
  if (select count(*) from public.hearings where owner_user_id = '00000000-0000-0000-0000-0000000000e1') <> 3 then
    raise exception 'T10 FAIL: anon or app_user wrote a consultant-owned hearing';
  end if;
  raise notice 'T10 PASS: anon and app_user are guarded (fail-closed); app_user still writes an advocate''s hearing';
end $$;

-- T11 catalog: the function, its privileges, and one guard per table after two
-- runs — enabled, BEFORE INSERT OR UPDATE FOR EACH ROW (no DELETE, no column
-- list, no WHEN), and the first BEFORE trigger on its table
do $$
declare
  fn  constant regprocedure := 'public.refuse_consultant_court_rows()'::regprocedure;
  tbl text;
  r   text;
  cfg text[];
  first_before text;
begin
  select proconfig into cfg from pg_proc where oid = fn;
  if not (select prosecdef from pg_proc where oid = fn) or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception 'T11 FAIL: refuse_consultant_court_rows is not SECURITY DEFINER with search_path '''' (proconfig %)', cfg;
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception 'T11 FAIL: % can EXECUTE refuse_consultant_court_rows', r;
    end if;
  end loop;
  foreach tbl in array array['public.hearings', 'public.case_stages', 'public.deadlines'] loop
    if (select count(*) from pg_trigger t
         where t.tgrelid = tbl::regclass and t.tgname = 'trg_00_refuse_consultant_court_rows'
           and not t.tgisinternal and t.tgenabled in ('O', 'A')
           and (t.tgtype & 23) = 23 and (t.tgtype & (8 | 32 | 64)) = 0
           and t.tgqual is null and t.tgattr = ''::int2vector
           and t.tgfoid = fn) <> 1 then
      raise exception 'T11 FAIL: % lacks exactly one enabled trg_00_refuse_consultant_court_rows BEFORE INSERT OR UPDATE FOR EACH ROW', tbl;
    end if;
    select t.tgname into first_before from pg_trigger t
     where t.tgrelid = tbl::regclass and not t.tgisinternal and (t.tgtype & 2) = 2
     order by t.tgname limit 1;
    if first_before <> 'trg_00_refuse_consultant_court_rows' then
      raise exception 'T11 FAIL: % fires before the guard on %', first_before, tbl;
    end if;
  end loop;
  raise notice 'T11 PASS: definer with search_path '''', no API EXECUTE; one enabled BEFORE INSERT OR UPDATE row guard per table, first in line, after two runs';
end $$;

-- T12 GoTrue deletes an account: it connects as supabase_auth_admin and sets
-- no role. Deleting the firm owner N cascades auth.users → profiles →
-- firm_profiles → firm_id SET NULL on the firm's court rows, among them the
-- CONSULTANT's firm hearing c604 (the admin console's auth.admin.deleteUser).
-- First, so the pre-fix guard fails here. Then a direct insert by the same
-- role isolates the trusted-role half (an INSERT is never cascade-shaped).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant select, delete on auth.users to supabase_auth_admin;
grant insert on public.hearings to supabase_auth_admin;
set session authorization supabase_auth_admin;
do $$
begin
  if pg_catalog.current_setting('role') <> 'none' or session_user <> 'supabase_auth_admin' then
    raise exception 'T12 SETUP: expected GoTrue''s shape (no role, session_user supabase_auth_admin), got % / %',
      pg_catalog.current_setting('role'), session_user;
  end if;
  perform public.t_ok('T12 GoTrue deletes the firm owner',
    $q$delete from auth.users where id = '00000000-0000-0000-0000-0000000000e3'$q$);
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_ok('T12 supabase_auth_admin inserts a consultant-owned hearing',
    $q$insert into public.hearings (id, owner_user_id, kind, title, hearing_date)
       values ('00000000-0000-0000-0000-00000000c1a1', '00000000-0000-0000-0000-0000000000e1', 'judicial', 'جلسة', '2026-11-10')$q$);
end $$;
reset session authorization;
do $$
begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000e3')
     or exists (select 1 from public.firm_profiles where id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'T12 FAIL: the firm owner or the firm survived the delete';
  end if;
  if (select firm_id from public.hearings where id = '00000000-0000-0000-0000-00000000c604') is not null
     or (select firm_id from public.hearings where id = '00000000-0000-0000-0000-00000000a401') is not null then
    raise exception 'T12 FAIL: the firm''s hearings still point at the deleted firm';
  end if;
  if not exists (select 1 from public.hearings where id = '00000000-0000-0000-0000-00000000c1a1') then
    raise exception 'T12 FAIL: the supabase_auth_admin insert is not there';
  end if;
  raise notice 'T12 PASS: GoTrue (supabase_auth_admin, no role) deletes a firm owner — the firm_id nulls on the consultant''s firm hearing go through — and is trusted on a direct insert';
end $$;

-- T13 a consultant's direct UPDATE of a pointer: only nulling ON DELETE SET
-- NULL pointers passes; any other change with it, re-pointing, setting a
-- pointer, or a no-op is refused. Rows seeded by the service role:
--   S1 c701 his stage · H1 c702 his hearing on S1 · D1 c703 his deadline on S1
--   and H1 · D2 c705 his deadline on H1 · H2 c704 his hearing on the
--   advocate's stage a402
set role service_role;
insert into public.case_stages (id, case_request_id, owner_user_id)
  values ('00000000-0000-0000-0000-00000000c701', 'req-k', '00000000-0000-0000-0000-0000000000e1');
insert into public.hearings (id, owner_user_id, case_request_id, stage_id, kind, title, hearing_date) values
  ('00000000-0000-0000-0000-00000000c702', '00000000-0000-0000-0000-0000000000e1', 'req-k',
   '00000000-0000-0000-0000-00000000c701', 'judicial', 'جلسة على الدرجة', '2026-11-11'),
  ('00000000-0000-0000-0000-00000000c704', '00000000-0000-0000-0000-0000000000e1', null,
   '00000000-0000-0000-0000-00000000a402', 'judicial', 'جلسة على درجة المحامي', '2026-11-12');
insert into public.deadlines (id, owner_user_id, stage_id, hearing_id, title, kind, trigger_date, due_date) values
  ('00000000-0000-0000-0000-00000000c703', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000c702', 'مهلة على الجلسة', 'statutory', '2026-11-11', '2026-12-11'),
  ('00000000-0000-0000-0000-00000000c705', '00000000-0000-0000-0000-0000000000e1',
   null, '00000000-0000-0000-0000-00000000c702', 'مهلة ثانية على الجلسة', 'court_order', '2026-11-11', '2026-11-21');
-- every other pointer in the guard's list, on rows of a second firm F2 (owned
-- by the advocate; the consultant an active member, so a stage with no owner
-- stays reachable): H3 c706 · S2 c707 · S3 c708 · D3 c709 (firm + rule)
reset role;
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', 'المكتب الثاني');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'legal_consultant', 'active', now());
set role service_role;
insert into public.hearings (id, owner_user_id, firm_id, kind, title, hearing_date) values
  ('00000000-0000-0000-0000-00000000c706', '00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000f2', 'judicial', 'جلسة في المكتب الثاني', '2026-11-13');
insert into public.case_stages (id, case_request_id, owner_user_id, firm_id) values
  ('00000000-0000-0000-0000-00000000c707', 'req-k', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-00000000c708', 'req-k', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2');
insert into public.deadlines (id, owner_user_id, firm_id, rule_id, title, kind, trigger_date, due_date)
  select '00000000-0000-0000-0000-00000000c709', '00000000-0000-0000-0000-0000000000e1',
         '00000000-0000-0000-0000-0000000000f2', r.id, 'مهلة بقاعدة', 'statutory', '2026-11-13', '2026-12-13'
    from public.deadline_rules r where r.owner_user_id is null order by r.code limit 1;
reset role;
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_ok('T13 null hearings.firm_id',
    $q$update public.hearings set firm_id = null where id = '00000000-0000-0000-0000-00000000c706'$q$);
  perform public.t_ok('T13 null case_stages.firm_id',
    $q$update public.case_stages set firm_id = null where id = '00000000-0000-0000-0000-00000000c707'$q$);
  perform public.t_ok('T13 null case_stages.owner_user_id',
    $q$update public.case_stages set owner_user_id = null where id = '00000000-0000-0000-0000-00000000c708'$q$);
  perform public.t_ok('T13 null deadlines.firm_id and rule_id together',
    $q$update public.deadlines set firm_id = null, rule_id = null where id = '00000000-0000-0000-0000-00000000c709'$q$);
  perform public.t_refused('T13 null a pointer AND change a court field (hearing)',
    $q$update public.hearings set stage_id = null, status = 'held' where id = '00000000-0000-0000-0000-00000000c702'$q$);
  perform public.t_refused('T13 null a pointer AND change a court field (deadline)',
    $q$update public.deadlines set hearing_id = null, due_date = '2027-01-15' where id = '00000000-0000-0000-0000-00000000c703'$q$);
  perform public.t_refused('T13 re-point a pointer',
    $q$update public.hearings set stage_id = '00000000-0000-0000-0000-00000000c602' where id = '00000000-0000-0000-0000-00000000c702'$q$);
  perform public.t_refused('T13 set a pointer from NULL',
    $q$update public.deadlines set rule_id = (select r.id from public.deadline_rules r where r.owner_user_id is null order by r.code limit 1)
        where id = '00000000-0000-0000-0000-00000000c703'$q$);
  perform public.t_refused('T13 no-op update',
    $q$update public.hearings set status = status where id = '00000000-0000-0000-0000-00000000c702'$q$);
  perform public.t_ok('T13 only null a pointer (updated_at ignored)',
    $q$update public.deadlines set hearing_id = null, updated_at = now() where id = '00000000-0000-0000-0000-00000000c703'$q$);
end $$;
reset role;
do $$
begin
  if (select status || '/' || stage_id from public.hearings where id = '00000000-0000-0000-0000-00000000c702')
       <> 'scheduled/00000000-0000-0000-0000-00000000c701' then
    raise exception 'T13 FAIL: a refused update changed H1';
  end if;
  if (select due_date from public.deadlines where id = '00000000-0000-0000-0000-00000000c703') <> '2026-12-11'
     or (select stage_id from public.deadlines where id = '00000000-0000-0000-0000-00000000c703') is distinct from '00000000-0000-0000-0000-00000000c701'
     or (select rule_id from public.deadlines where id = '00000000-0000-0000-0000-00000000c703') is not null
     or (select hearing_id from public.deadlines where id = '00000000-0000-0000-0000-00000000c703') is not null then
    raise exception 'T13 FAIL: D1 is not (due 2026-12-11, stage S1, no rule, hearing nulled)';
  end if;
  if (select firm_id from public.hearings where id = '00000000-0000-0000-0000-00000000c706') is not null
     or (select firm_id from public.case_stages where id = '00000000-0000-0000-0000-00000000c707') is not null
     or (select owner_user_id from public.case_stages where id = '00000000-0000-0000-0000-00000000c708') is not null
     or (select count(*) from public.deadlines where id = '00000000-0000-0000-0000-00000000c709'
           and firm_id is null and rule_id is null) <> 1 then
    raise exception 'T13 FAIL: a pointer the consultant nulled is still set';
  end if;
  raise notice 'T13 PASS: nulling only SET NULL pointers passes — every pointer in the list, alone or together, updated_at ignored; with a court field, re-pointing, setting from NULL or a no-op it gets 42501';
end $$;

-- T14 deletes and their SET NULL cascades, through sessions:
--   the consultant deletes his stage S1 (H1.stage_id and D1.stage_id nulled)
--   and his hearing H1 (D2.hearing_id nulled); the advocate deletes his stage
--   a402 (the CONSULTANT's H2.stage_id nulled)
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', true);
  perform public.t_ok('T14 consultant deletes his stage',
    $q$delete from public.case_stages where id = '00000000-0000-0000-0000-00000000c701'$q$);
  perform public.t_ok('T14 consultant deletes his hearing',
    $q$delete from public.hearings where id = '00000000-0000-0000-0000-00000000c702'$q$);
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000e2', true);
  perform public.t_ok('T14 advocate deletes his stage under a consultant''s hearing',
    $q$delete from public.case_stages where id = '00000000-0000-0000-0000-00000000a402'$q$);
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.case_stages where id in ('00000000-0000-0000-0000-00000000c701', '00000000-0000-0000-0000-00000000a402'))
     or exists (select 1 from public.hearings where id = '00000000-0000-0000-0000-00000000c702') then
    raise exception 'T14 FAIL: a deleted stage or hearing is still there';
  end if;
  if (select stage_id from public.deadlines where id = '00000000-0000-0000-0000-00000000c703') is not null
     or (select hearing_id from public.deadlines where id = '00000000-0000-0000-0000-00000000c705') is not null
     or (select stage_id from public.hearings where id = '00000000-0000-0000-0000-00000000c704') is not null then
    raise exception 'T14 FAIL: a pointer to a deleted row was not nulled';
  end if;
  raise notice 'T14 PASS: a consultant deletes his stage and hearing, an advocate deletes a stage under a consultant''s hearing — the SET NULL cascades go through';
end $$;

drop function public.t_refused(text, text);
drop function public.t_ok(text, text);
