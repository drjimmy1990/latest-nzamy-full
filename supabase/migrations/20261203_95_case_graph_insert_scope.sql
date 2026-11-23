-- =============================================================================
-- Migration: 20261203_95_case_graph_insert_scope.sql   (verify id: l13_case_graph_insert)
-- =============================================================================
-- PURPOSE (batch l13 integration — found by the canvas builder)
--
--   public.case_graphs holds ONE map per case (primary key case_request_id).
--   Its INSERT policy (20260903_phase1_case_tables.sql) only checked
--   owner_user_id = auth.uid(), so any signed-in user could create the map row
--   of a case he cannot open, and the case's own lawyers could then never save
--   theirs (the key is taken and the row is invisible to them).
--
--   This adds a RESTRICTIVE insert policy: the map of a case is created only by
--   someone who can open the case row under its own policies AND works on it —
--   public.case_board_open (20261203_60, SECURITY INVOKER), the same rule as the
--   case's free board. Reads and updates are unchanged.
--
-- ORDER: after 20261203_60 (stops with a clear message before it). Any time
--        relative to the deploy.
-- SAFE TO RE-RUN: yes.
-- ROLLBACK:
--   drop policy if exists "case graph insert: case workers only" on public.case_graphs;
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.case_graphs') is null then
    raise exception '20261203_95: public.case_graphs is missing (run 20260903_phase1_case_tables.sql first)';
  end if;
  if to_regprocedure('public.case_board_open(text)') is null then
    raise exception '20261203_95: run 20261203_60_case_free_board.sql first (no public.case_board_open)';
  end if;
end
$pre$;

drop policy if exists "case graph insert: case workers only" on public.case_graphs;
create policy "case graph insert: case workers only" on public.case_graphs
  as restrictive
  for insert
  to authenticated
  with check (public.case_board_open(case_request_id));

do $v$
begin
  if not exists (select 1 from pg_catalog.pg_policies
                  where schemaname = 'public' and tablename = 'case_graphs'
                    and policyname = 'case graph insert: case workers only'
                    and permissive = 'RESTRICTIVE' and cmd = 'INSERT') then
    raise exception '20261203_95 verify: the restrictive insert policy is missing';
  end if;
  raise notice 'l13_case_graph_insert verify: OK — a case map is created only by someone who works on the case';
end
$v$;

commit;

select '20261203_95 case_graphs insert limited to the case''s workers' as migration, true as ok;
