-- =============================================================================
-- Migration: 20261108_41_drafter_daily_limit_excludes_sections.sql
-- =============================================================================
-- PURPOSE (final review of batch 2026-11-08, item 2; owner ٤١٠)
--   The legal-drafter's daily limit (tools.ts dailyLimit: 10, or the admin's
--   platform_settings.ai_tools override) is checked in public.ai_start_run:
--   it counts today's (Riyadh day) runs of the user and tool that did not
--   fail. Since 20261108_40 a section edit («عدّل هذا القسم») is a
--   legal-drafter run too. ai_start_section_edit starts it with no daily limit
--   of its own (2147483647), but ai_start_run still COUNTED it for the next
--   memo. So:
--     * a lawyer who edited 9 sections could no longer start a memo today;
--     * worse, an analysis could start (and be CHARGED) as the 10th run, and
--       its free turn-1 draft was then refused with 429 daily_limit — a paid
--       analysis with no memo until tomorrow.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   Re-creates public.ai_start_run with the IDENTICAL signature, defaults,
--   result, SECURITY DEFINER and search_path '' of 20261027_10 (the latest and
--   only definition; 20261101_10 and 20261107_60 redefine
--   ai_start_run_with_credit, which calls this). The only changes, both for
--   the legal-drafter alone (every other tool counts exactly as before):
--     1. the daily count leaves out runs whose input ->> 'phase' = 'section'
--        (`is distinct from`, so a run with no input or no phase still counts);
--     2. the draft (input phase 'draft') of a conversation whose analysis
--        (phase 'issues') SUCCEEDED, while that conversation holds no draft
--        that did not fail, is never refused for the daily limit. One draft
--        per analysis: a second draft is not exempt (the app refuses it
--        anyway — legalDrafterTurn). The draft still counts toward later runs.
--   CREATE OR REPLACE keeps the owner and the grants; they are re-stated below
--   anyway (service role only). NEVER add a second overload (PGRST203 breaks
--   every AI run).
--
--   The other start functions need no change, because each one reaches the
--   count only through this function:
--     * ai_start_run_with_credit (20261107_60) passes the caller's daily limit
--       to ai_start_run;
--     * ai_start_section_edit (20261108_40) passes 2147483647 — a section edit
--       was never REFUSED for the day, only counted against the memos;
--     * ai_start_free_question (20261108_50) calls it for quick-answer.
--   The app has no daily check of its own (runCore.ts passes
--   runtime.dailyLimit to the database), so nothing changes there.
--
-- DEPLOY ORDER — ANY TIME (before or after the deploy). The app's call is the
--   same with or without this file; without it the old count applies.
--
-- ROLLBACK
--   Re-run section 3 («ai_start_run») of 20261027_10_ai_runs.sql (the
--   `create or replace function public.ai_start_run(` statement and its
--   comment), then: notify pgrst, 'reload schema';
-- =============================================================================

begin;

create or replace function public.ai_start_run(
  p_user            uuid,
  p_tool            text,
  p_variant         text,
  p_class           text,
  p_price           int,
  p_daily_limit     int,
  p_idempotency_key text,
  p_deadline        timestamptz,
  p_exempt          boolean default false,
  p_input           jsonb default null,
  p_file_ids        text[] default '{}',
  p_pages           int default null,
  p_conversation    uuid default null,
  p_source_ids      jsonb default null)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run     public.ai_runs;
  v_today   timestamptz := (date_trunc('day', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh';
  v_used    int;
  v_enforce boolean;
  v_charge  boolean;
  v_draft_after_analysis boolean;
begin
  if p_user is null or p_tool is null or p_class is null or p_price is null or p_price < 0
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100
     or p_deadline is null or p_daily_limit is null or p_daily_limit < 0 then
    raise exception 'ai_start_run: invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_start_run:' || p_user::text || ':' || p_tool, 0));

  select * into v_run from public.ai_runs r
   where r.user_id = p_user and r.idempotency_key = p_idempotency_key;
  if found then
    return query select v_run.id, false, v_run.status, v_run.charged, v_run.charged_points;
    return;
  end if;

  -- 20261108_41: the legal-drafter's free draft that follows a succeeded
  -- analysis (and no other live draft of that memo) is never refused for the
  -- day — the analysis was charged for both.
  v_draft_after_analysis := coalesce(
    p_tool = 'legal-drafter'
    and p_input ->> 'phase' = 'draft'
    and p_conversation is not null
    and exists (select 1 from public.ai_runs r
                 where r.user_id = p_user and r.tool = p_tool and r.conversation_id = p_conversation
                   and r.status = 'succeeded' and r.input ->> 'phase' = 'issues')
    and not exists (select 1 from public.ai_runs r
                     where r.user_id = p_user and r.tool = p_tool and r.conversation_id = p_conversation
                       and r.status <> 'failed' and r.input ->> 'phase' = 'draft'),
    false);

  if not v_draft_after_analysis then
    -- 20261108_41: a legal-drafter section edit is bounded by its memo's
    -- ceiling (ai_start_section_edit), not by the day: it is not counted here.
    select count(*) into v_used from public.ai_runs r
     where r.user_id = p_user and r.tool = p_tool and r.created_at >= v_today and r.status <> 'failed'
       and (p_tool <> 'legal-drafter' or r.input ->> 'phase' is distinct from 'section');
    if v_used >= p_daily_limit then
      raise exception 'daily_limit' using errcode = 'P0001',
        detail = format('used %s of %s today', v_used, p_daily_limit);
    end if;
  end if;

  select coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false) into v_enforce;
  v_charge := v_enforce and not coalesce(p_exempt, false) and p_price > 0;

  insert into public.ai_runs (user_id, tool, variant, class, price_points, idempotency_key, deadline_at,
                              input, file_ids, pages, conversation_id, source_ids)
    values (p_user, p_tool, p_variant, p_class, p_price, p_idempotency_key, p_deadline,
            p_input, coalesce(p_file_ids, '{}'), p_pages, p_conversation, p_source_ids)
    returning * into v_run;

  if v_charge then
    -- raises P0001 insufficient_points and rolls the whole call back: no run
    perform public.debit_points(p_user, p_price, p_tool, 'ai_run:' || v_run.id::text);
    update public.ai_runs r
       set charged = true, charged_points = p_price, charged_at = now()
     where r.id = v_run.id and r.charged_at is null
     returning * into v_run;
  end if;

  return query select v_run.id, true, v_run.status, v_run.charged, v_run.charged_points;
end;
$$;

comment on function public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) is
  'Starts an AI run: duplicate key → the existing run; over the daily limit → P0001 daily_limit; with points_enforcement on and the caller not exempt, debits the price (P0001 insufficient_points → no run). One transaction (20261027_10). legal-drafter (20261108_41): section edits are not counted for the day, and the draft that follows a succeeded analysis is never refused for it. Service role only.';

revoke all on function public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

commit;
notify pgrst, 'reload schema';

-- The check (the SQL editor shows only the last result): ok = t.
select (pg_get_functiondef(p.oid) like '%is distinct from ''section''%') as sections_not_counted,
       (pg_get_functiondef(p.oid) like '%v_draft_after_analysis%') as draft_after_analysis_exempt,
       (p.prosecdef and p.proconfig @> array['search_path=""']) as definer_empty_path,
       (select count(*) from pg_proc q join pg_namespace m on m.oid = q.pronamespace
         where m.nspname = 'public' and q.proname = 'ai_start_run') as overloads,
       (pg_get_functiondef(p.oid) like '%is distinct from ''section''%'
        and pg_get_functiondef(p.oid) like '%v_draft_after_analysis%'
        and p.prosecdef and p.proconfig @> array['search_path=""']
        and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and (select count(*) from pg_proc q join pg_namespace m on m.oid = q.pronamespace
              where m.nspname = 'public' and q.proname = 'ai_start_run') = 1) as ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'ai_start_run';
