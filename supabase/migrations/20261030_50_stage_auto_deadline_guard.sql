-- =============================================================================
-- Migration: 20261030_50_stage_auto_deadline_guard.sql
-- =============================================================================
-- PURPOSE
--   Owner package 2026-10-30, LIVE-F15 / LIVE-F25 / CODE-F03 / CODE-F04 (the
--   case-stages judgment hook). The code fix lives in
--   src/lib/services/stageDeadlineSync.ts + the case-stages route. This file
--   adds the one database guard that code cannot give itself, and REPORTS the
--   rows the old hook left behind. It changes no existing row.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. REPORT (NOTICE + the SELECTs at the end):
--      a. open auto deadlines whose stage is «قيد النظر» or has no outcome —
--         born from the bug where «قيد النظر» was saved with the pre-filled
--         "today" (LIVE-F15). NOT cancelled here: the lawyer sees it, and the
--         next save of that stage («قيد النظر» again) cancels it with a reason.
--      b. stages with MORE than one open auto deadline (an old race).
--   2. GUARD: a partial UNIQUE index — at most one OPEN auto deadline
--      (computed_by_rule) per stage. Two concurrent saves can no longer both
--      create one; the route treats the loser's 23505 as "already there".
--      It is created ONLY when 1b found nothing; otherwise it is skipped with
--      a NOTICE (creating it would fail) — clean the duplicates, run again.
--
-- WHAT IT DOES NOT DO — ON PURPOSE
--   * No deadline is cancelled, re-dated or deleted. Moving a lawyer's due
--     date silently is worse than flagging it (same policy as 20261016_04).
--   * No column is added. The stage's chosen trigger event lives in the
--     existing case_stages.metadata, the computation inputs/history in the
--     existing deadlines.metadata.
--
-- DEPLOY ORDER — INDEPENDENT. The code works with or without the index (it
--   reads the linked deadlines as a list and handles 23505 either way). Run
--   it before or after the deploy.
--
-- ROLLBACK
--   drop index if exists public.uq_deadlines_one_open_auto_per_stage;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.deadlines') is null or to_regclass('public.case_stages') is null then
    raise exception '20261030_50: public.deadlines / public.case_stages missing — apply 20260904_phase5_deadline_radar.sql first';
  end if;
end $$;

do $$
declare
  pending_born int;
  dup_stages   int;
begin
  select count(*) into pending_born
    from public.deadlines d
    join public.case_stages s on s.id = d.stage_id
   where d.computed_by_rule and d.status = 'open'
     and (s.outcome is null or s.outcome = 'pending');

  select count(*) into dup_stages
    from (select stage_id
            from public.deadlines
           where computed_by_rule and status = 'open' and stage_id is not null
           group by stage_id
          having count(*) > 1) x;

  raise notice '20261030_50: % open auto deadline(s) belong to a stage that is pending / has no outcome (LIVE-F15) — listed by the SELECT below, not changed.', pending_born;
  raise notice '20261030_50: % stage(s) have more than one open auto deadline.', dup_stages;

  if dup_stages = 0 then
    execute 'create unique index if not exists uq_deadlines_one_open_auto_per_stage
               on public.deadlines (stage_id)
               where computed_by_rule and status = ''open'' and stage_id is not null';
    raise notice '20261030_50: guard index uq_deadlines_one_open_auto_per_stage is in place.';
  else
    raise notice '20261030_50: guard index SKIPPED — clean the duplicates listed below, then run this file again.';
  end if;
end $$;

commit;

-- ── CHECK (the SQL editor hides NOTICEs — read these instead) ────────────────
-- 1. Is the guard index in place? Expect one row.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and indexname = 'uq_deadlines_one_open_auto_per_stage';

-- 2. Open auto deadlines on a pending / outcome-less stage (expect 0 after the
--    lawyers concerned re-save those stages). Each row = one to review.
select d.id as deadline_id, d.title, d.due_date, d.trigger_date, d.created_at,
       s.id as stage_id, s.degree, s.outcome, s.closed_on, d.case_request_id
  from public.deadlines d
  join public.case_stages s on s.id = d.stage_id
 where d.computed_by_rule and d.status = 'open'
   and (s.outcome is null or s.outcome = 'pending')
 order by d.created_at desc;

-- 3. Stages with more than one open auto deadline (expect 0).
select stage_id, count(*) as open_auto_deadlines, array_agg(id order by created_at) as deadline_ids
  from public.deadlines
 where computed_by_rule and status = 'open' and stage_id is not null
 group by stage_id
having count(*) > 1;
