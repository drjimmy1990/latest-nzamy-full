-- library_eligibility_verifications.test.sql — proves 20261103_12 (owner
-- q375, owner-free wave S1 Task 18): the staff-verified library eligibility
-- table — its checks, its cascades, and that NO session role reaches it: a
-- signed-in user cannot read, insert, update or delete any row, not even his
-- own; anon cannot read. Also runs the _verify block
-- verify:library_eligibility_verifications.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261103_12
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   V=$D/verify_library_eligibility_verifications.sql
--   sed -n '/^-- >>> verify:library_eligibility_verifications/,/^-- <<< verify:library_eligibility_verifications/p' $M/_verify.sql > "$V"
--   bash $R/run.sh $M/20261103_12_library_eligibility_verifications.sql \
--     $M/20261103_12_library_eligibility_verifications.sql "$V" $R/library_eligibility_verifications.test.sql
--
-- NEGATIVE CONTROLS:
--   1. without 20261103_12 the _verify block RAISES «run 20261103_12 … (BEFORE
--      the deploy)»:   bash $R/run.sh "$V" $R/library_eligibility_verifications.test.sql
--      and the test alone stops at T0 (run.sh needs one file before the test):
--      bash $R/run.sh $R/prelude_platform_settings_min.sql $R/library_eligibility_verifications.test.sql
--   2. the table re-opened to users (a grant + an own-row policy) — the test
--      must FAIL at T3a (the row's own user reads it), and the _verify block must RAISE:
--      bash $R/run.sh $M/20261103_12_library_eligibility_verifications.sql \
--        $R/prelude_library_eligibility_leak.sql $R/library_eligibility_verifications.test.sql
--
-- The roles are the real ones (`set role authenticated` / `set role anon`),
-- never app_user: stubs.sql's default privileges grant app_user every new
-- public table, and app_user does not exist on Supabase.
-- Every assertion RAISES on failure.

-- T0 precondition (negative control 1 stops here)
do $$
begin
  if to_regclass('public.library_eligibility_verifications') is null then
    raise exception 'T0 FAIL: public.library_eligibility_verifications does not exist (20261103_12 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
-- …f101 a micro business, …f102 an NGO, …f103 a lawyer, …f104 staff, …f105 a stranger
insert into auth.users
  select ('00000000-0000-0000-0000-00000000f1' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 5) i;

-- T1 the checks
do $$
begin
  begin
    insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by)
      values ('00000000-0000-0000-0000-00000000f101', 'linked_lawyer', 'عقد مع محامٍ على المنصة', '00000000-0000-0000-0000-00000000f104');
    raise exception 'T1a FAIL: linked_lawyer without linked_lawyer_id accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by)
      values ('00000000-0000-0000-0000-00000000f101', 'legal_department', 'abcd', '00000000-0000-0000-0000-00000000f104');
    raise exception 'T1b FAIL: a 4-character evidence note accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by)
      values ('00000000-0000-0000-0000-00000000f101', 'legal_department', '   abcd   ', '00000000-0000-0000-0000-00000000f104');
    raise exception 'T1c FAIL: a note of 4 characters padded with spaces accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by)
      values ('00000000-0000-0000-0000-00000000f101', 'self_declared', 'لديه إدارة قانونية', '00000000-0000-0000-0000-00000000f104');
    raise exception 'T1d FAIL: an unknown basis accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by, revoke_note)
      values ('00000000-0000-0000-0000-00000000f101', 'legal_department', 'لديه إدارة قانونية', '00000000-0000-0000-0000-00000000f104', repeat('x', 1001));
    raise exception 'T1e FAIL: a 1001-character revoke note accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    insert into public.library_eligibility_verifications (user_id, basis, evidence_note)
      values ('00000000-0000-0000-0000-00000000f101', 'legal_department', 'لديه إدارة قانونية');
    raise exception 'T1f FAIL: a row without verified_by accepted';
  exception when not_null_violation then null;
  end;
end $$;

-- the two valid shapes
insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by)
  values ('00000000-0000-0000-0000-00000000f101', 'legal_department', 'خطاب الإدارة القانونية مرفق في التذكرة', '00000000-0000-0000-0000-00000000f104');
insert into public.library_eligibility_verifications (user_id, basis, linked_lawyer_id, evidence_note, verified_by)
  values ('00000000-0000-0000-0000-00000000f102', 'linked_lawyer', '00000000-0000-0000-0000-00000000f103', 'وكالة سارية مع المحامي', '00000000-0000-0000-0000-00000000f104');
do $$
begin
  if (select count(*) from public.library_eligibility_verifications) <> 2 then
    raise exception 'T1g FAIL: the two valid rows were not stored';
  end if;
  if (select verified_at from public.library_eligibility_verifications where user_id = '00000000-0000-0000-0000-00000000f101') is null then
    raise exception 'T1h FAIL: verified_at has no default';
  end if;
end $$;

-- T3 a signed-in user — the row's OWN user (…f101) — cannot read, insert,
-- update or delete it
select set_config('test.uid', '00000000-0000-0000-0000-00000000f101', false);
set role authenticated;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.library_eligibility_verifications;
    raise exception 'T3a FAIL: the row''s own user read the table (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by)
      values ('00000000-0000-0000-0000-00000000f101', 'legal_department', 'أنا أقرر بنفسي', '00000000-0000-0000-0000-00000000f101');
    raise exception 'T3b FAIL: a user inserted a verification';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.library_eligibility_verifications set evidence_note = 'تعديل من المستخدم'
     where user_id = '00000000-0000-0000-0000-00000000f101';
    raise exception 'T3c FAIL: a user updated his verification';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.library_eligibility_verifications where user_id = '00000000-0000-0000-0000-00000000f101';
    raise exception 'T3d FAIL: a user deleted his verification';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T4 anon cannot read either
set role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.library_eligibility_verifications;
    raise exception 'T4 FAIL: anon read the table (% rows)', n;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('test.uid', '', false);

-- T2 RLS on, no policy; the session roles hold nothing; service_role reads and writes
do $$
declare t constant text := 'public.library_eligibility_verifications';
begin
  if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then
    raise exception 'T2a FAIL: RLS is off';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'library_eligibility_verifications') then
    raise exception 'T2b FAIL: the table has a policy (service role only means none)';
  end if;
  if has_table_privilege('anon', t, 'SELECT') or has_table_privilege('authenticated', t, 'SELECT')
     or has_table_privilege('authenticated', t, 'INSERT') or has_table_privilege('authenticated', t, 'UPDATE')
     or has_table_privilege('authenticated', t, 'DELETE') or has_table_privilege('anon', t, 'INSERT') then
    raise exception 'T2c FAIL: a session role holds a privilege';
  end if;
  if not has_table_privilege('service_role', t, 'SELECT') or not has_table_privilege('service_role', t, 'UPDATE') then
    raise exception 'T2d FAIL: service_role cannot read and write';
  end if;
end $$;

-- T5 cascades: deleting the account removes its row; deleting the linked
-- lawyer removes the verification that rested on him (and does not fail)
do $$
begin
  delete from auth.users where id = '00000000-0000-0000-0000-00000000f101';
  if exists (select 1 from public.library_eligibility_verifications where user_id = '00000000-0000-0000-0000-00000000f101') then
    raise exception 'T5a FAIL: deleting the account left its verification';
  end if;
  delete from auth.users where id = '00000000-0000-0000-0000-00000000f103';
  if exists (select 1 from public.library_eligibility_verifications where user_id = '00000000-0000-0000-0000-00000000f102') then
    raise exception 'T5b FAIL: the verification that rested on the deleted lawyer is still there';
  end if;
end $$;

-- T6 a revoked row is kept as history
insert into public.library_eligibility_verifications (user_id, basis, evidence_note, verified_by)
  values ('00000000-0000-0000-0000-00000000f105', 'legal_department', 'خطاب الإدارة القانونية', '00000000-0000-0000-0000-00000000f104');
update public.library_eligibility_verifications
   set revoked_at = now(), revoked_by = '00000000-0000-0000-0000-00000000f104', revoke_note = 'انتهى التعاقد'
 where user_id = '00000000-0000-0000-0000-00000000f105';
do $$
begin
  if (select count(*) from public.library_eligibility_verifications
       where user_id = '00000000-0000-0000-0000-00000000f105' and revoked_at is not null) <> 1 then
    raise exception 'T6 FAIL: the revoked row is not kept';
  end if;
end $$;

select 'library_eligibility_verifications: ALL PASS' as result, true as ok;
