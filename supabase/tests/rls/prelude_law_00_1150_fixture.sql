-- prelude_law_00_1150_fixture.sql — fixture for
-- supabase/one-time/2026-10-19_law_00_1150_in_force.sql (owner answer ٢١٢).
-- The target law as live holds it today (in force not yet declared), plus
-- three laws the file must leave alone: another «status_undeclared» law, a
-- repealed one and an unverified one. A snapshot of every row lets the test
-- prove that only the target's status moved.
--
-- Stands in for the user removing the dashes before `set local
-- nzamy.confirm_law_1150` in block 2 (a database-level setting reaches every
-- later session, so the file runs AS WRITTEN).
alter database postgres set nzamy.confirm_law_1150 = 'LAW-00-1150';

insert into library.laws (slug, title, type, section_code, status) values
  ('regulation-364-5-30-1430-11-02', 'لائحة التفتيش القضائي', 'لائحة تنفيذية', '00', 'status_undeclared'),
  ('law1150-other-undeclared', 'لائحة أخرى لم تُعلَن حالتها', 'لائحة تنفيذية', '00', 'status_undeclared'),
  ('law1150-repealed', 'نظام ملغى', 'نظام', '00', 'repealed'),
  ('law1150-unverified', 'نظام لم يُتحقق من نشره', 'نظام', '00', 'issued_publication_unverified');

create table public.law1150_before as
  select slug, title, type, section_code, status, updated_at from library.laws;
