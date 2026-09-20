-- Chain step (NOT a migration) for profiles_cross_user_read.test.sql.
--
-- Runs AFTER 20260603_phase1_001_profiles.sql + 20260625_fix_rls_recursion.sql
-- and BEFORE 20260921_01_profiles_rls_lockdown.sql. Two jobs:
--
--   1. Create the four actors the test uses. Inserting into auth.users fires
--      the real handle_new_user() trigger, so every profiles row here is
--      created the way a live signup creates it.
--
--   2. Reproduce UAT-SEC-001. The live defect is a permissive policy scoped to
--      the `authenticated` role that no migration created (audit 06 probe B
--      excludes `TO public` and excludes disabled RLS; audit 01 §1 shows the
--      repository never created it). The Dashboard's one-click
--      "Enable read access for all users" produces exactly this shape, and its
--      default name is used here — the point of 20260921_01 is that it does not
--      need to know the name.
--
--      This file then PROVES the leak is live: user A reads user B's row. If it
--      cannot, the simulation is wrong and the run fails here, because then the
--      test that follows would prove nothing.
--
-- Everything after the proof is reset, so 20260921_01 runs as postgres.

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.test',
   '{"user_type":"lawyer","display_name":"المحامي أ"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.test',
   '{"user_type":"individual","display_name":"العميل ب"}'::jsonb),
  ('dddddddd-0000-0000-0000-000000000004', 'admin@example.test',
   '{"user_type":"admin","display_name":"مشرف"}'::jsonb),
  ('eeeeeeee-0000-0000-0000-000000000005', 'c@example.test',
   '{"user_type":"individual","display_name":"العميل ج"}'::jsonb);

-- The out-of-band policy that UAT-SEC-001 measures.
drop policy if exists "Enable read access for all users" on public.profiles;
create policy "Enable read access for all users"
  on public.profiles for select
  to authenticated
  using (true);

set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);

do $$
declare
  n_foreign int;
  n_total   int;
begin
  select count(*) into n_foreign from public.profiles
   where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  select count(*) into n_total from public.profiles;
  if n_foreign <> 1 then
    raise exception
      'leak injection: A cannot read B (%), so UAT-SEC-001 is NOT reproduced and the test below would prove nothing',
      n_foreign;
  end if;
  raise notice 'DEFECT REPRODUCED (UAT-SEC-001): A reads B''s profile row (foreign rows visible: %, total rows visible: % of 4)',
    n_foreign, n_total;
end $$;

reset role;
select set_config('test.uid', '', false);
