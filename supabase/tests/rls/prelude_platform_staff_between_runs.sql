-- Runs BETWEEN the two 20261019_30 runs of platform_staff_roles.test.sql.
-- It plays what happens on live after the first apply, so the second run can
-- show that a re-run (to repair grant drift, say) promotes nobody — the
-- super_admin backfill runs only on the first apply (platform_staff empty):
--   * the user downgrades the admin a2 from super_admin to auditor — a re-run
--     must NOT promote a2 back;
--   * a new admin a3 is made after the first apply (by hand here; through
--     /admin/teams once T3.3/T3.4 ship) with no staff row — a re-run must NOT
--     give a3 a row: a3 stays an auditor (no role) until a super_admin assigns
--     one.
update public.platform_staff
   set staff_role = 'auditor', granted_by = '00000000-0000-0000-0000-0000000000a1'
 where user_id = '00000000-0000-0000-0000-0000000000a2';
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a3');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a3', 'admin', 'مشرف ثالث');
