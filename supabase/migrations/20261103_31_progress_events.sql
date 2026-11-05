-- =============================================================================
-- Migration: 20261103_31_progress_events.sql
-- A run's live progress: what the waiting screen shows while an AI tool works.
-- Owner-free wave, S2 Task E1 (report item ١٧).
-- =============================================================================
--
-- WHAT A ROW HOLDS — a file name, a search phrase, a law article's title, a stage
--   name. NEVER a text: no law or principle wording, no pasted or file text, no
--   token and no link (R7). src/lib/ai/progressEvents.ts builds every label, and
--   its source events take the title only.
--
-- WHO READS IT — the run's owner, through RLS, and only the granted columns. Only
--   the service role writes. This is a new table, so nothing here changes RLS on
--   an existing table, and no existing function is re-created.
--
-- DEPENDS ON — public.ai_runs and auth.users (20261027_10). Not on 20261103_30:
--   that file is not built (R30), and nothing here reads its columns.
--
-- DEPLOY ORDER — BEFORE the deploy. The code also survives its absence: a write
--   is logged once and ignored, and a read returns no events.
--
-- SCHEDULE — POST /api/v1/cron/ai-sweep?task=retention also runs the prune. A run
--   past its deadline is failed and refunded by ai_sweep_runs as before.
--
-- ROLLBACK — drop function if exists public.progress_events_prune();
--            drop table if exists public.progress_events;
-- Docker: supabase/tests/rls/progress_events.test.sql (chain in its header).
-- =============================================================================

begin;

create table if not exists public.progress_events (
  id         bigserial primary key,
  run_id     uuid not null references public.ai_runs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null constraint progress_events_kind_check
             check (kind in ('file','query','law','principle','verify','step','note')),
  label      text not null constraint progress_events_label_check
             check (char_length(label) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists progress_events_run_idx on public.progress_events (run_id, id);

comment on table public.progress_events is
  'A run''s live progress: titles and article numbers only, never a text (R7). Owner reads, service role writes, 7-day prune (20261103_31).';

alter table public.progress_events enable row level security;
drop policy if exists "own progress events" on public.progress_events;
create policy "own progress events" on public.progress_events
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.progress_events from anon, authenticated, public;
grant select (id, run_id, kind, label, created_at) on public.progress_events to authenticated;
grant all on public.progress_events to service_role;

revoke all on sequence public.progress_events_id_seq from anon, authenticated, public;
grant usage, select on sequence public.progress_events_id_seq to service_role;

create or replace function public.progress_events_prune()
returns int
language sql
volatile
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.progress_events e
     where e.created_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

comment on function public.progress_events_prune() is
  'Deletes progress events older than 7 days; returns how many (20261103_31). Service role only.';

revoke all on function public.progress_events_prune() from public, anon, authenticated;
grant execute on function public.progress_events_prune() to service_role;

commit;

-- Expected: one row, ok = true. ok is never NULL.
select coalesce(
         to_regclass('public.progress_events') is not null
         and to_regprocedure('public.progress_events_prune()') is not null
         and not has_table_privilege('authenticated', 'public.progress_events', 'INSERT')
         and not has_column_privilege('authenticated', 'public.progress_events', 'user_id', 'SELECT')
         and has_column_privilege('authenticated', 'public.progress_events', 'label', 'SELECT')
         and (select c.relrowsecurity from pg_class c where c.oid = 'public.progress_events'::regclass),
         false) as ok;
