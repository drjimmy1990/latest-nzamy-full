-- Chain step (NOT a migration) for client_case_view_no_internal_rows.test.sql.
--
-- stubs.sql creates reduced copies of public.case_stages and public.hearings
-- (no notes, no minutes, no update policies) for the Phase 5 tests. The real
-- 20260903_phase1_case_tables.sql uses `create table if not exists`, so without
-- this drop the stub shapes would survive and the test would be checking the
-- stub policies, not the live ones. CASCADE drops only foreign keys pointing at
-- them; nothing in stubs.sql depends on them otherwise.
drop table if exists public.hearings cascade;
drop table if exists public.case_stages cascade;
