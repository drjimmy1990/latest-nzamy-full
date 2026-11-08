-- =============================================================================
-- Migration: 20261108_40_drafter_section_edits.sql
-- =============================================================================
-- PURPOSE (owner ٤١٠, batch 2026-11-08 B3)
--   «يُمنح المستخدم ٥ تعديلات مجانية على المذكرة ككل، بسقف تعديلين كحد أقصى
--   للقسم الواحد، وما زاد يكون بـ 10 نقاط لكل تعديل قسم إضافي (توليد جزئي
--   للقسم المستهدف فقط).»
--   Controller ruling: an edit of one section of a written memo (one
--   legal-drafter conversation) is FREE while the memo has used fewer than 5
--   free edits AND that section fewer than 2; every other edit costs 10 points
--   (debited at start, refunded only on a technical failure, as every run).
--   Technical ceiling: 30 section edits per memo.
--
-- WHY A FUNCTION
--   The app reads the memo's earlier edits and prices the edit BEFORE it calls
--   the start function, outside any lock: two edits sent at once would both
--   read "4 free used" and both start free. ai_start_run already serialises
--   every start of one user's runs of one tool (pg_advisory_xact_lock on
--   'ai_start_run:<user>:<tool>'); there is no unique (conversation, turn).
--   public.ai_start_section_edit takes that same lock first (an advisory xact
--   lock is re-entrant, so ai_start_run takes it again without waiting),
--   recounts the memo's section edits that did not fail, and:
--     * a key already used        → ai_start_run's own duplicate answer
--                                   (nothing is recounted or refused);
--     * no succeeded draft        → P0001 section_no_draft;
--     * 30 edits already          → P0001 section_edit_limit;
--     * the app's price differs   → P0001 section_price_changed (nothing is
--                                   created; the screen shows the new price);
--     * else                      → ai_start_run with that price and no daily
--                                   limit (the memo's ceiling bounds edits; the
--                                   drafter's daily limit stays for memos).
--   A free edit is a section run priced 0 (ai_runs.price_points, recorded
--   whether or not points_enforcement is on). A failed (refunded) run is not
--   counted, so it gives its free edit back.
--
-- WHAT IT DOES (idempotent — safe to re-run)
--   Creates public.ai_start_section_edit (security definer, search_path '',
--   service role only). Nothing else changes: ai_start_run, ai_fail_run and
--   ai_start_run_with_credit are untouched. A section edit never goes through
--   ai_start_run_with_credit (it is not a founder drafting work).
--
-- DEPLOY ORDER — ANY TIME (before or after the deploy)
--   Old code never calls it. New code without it refuses a section edit,
--   uncharged («تعديل الأقسام غير متاح بعد»), rather than start one unlocked.
--
-- ROLLBACK
--   drop function if exists public.ai_start_section_edit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, int, int, int, int, int);
--   notify pgrst, 'reload schema';
--   (the app then refuses section edits again, uncharged)
-- =============================================================================

begin;

create or replace function public.ai_start_section_edit(
  p_user               uuid,
  p_tool               text,
  p_variant            text,
  p_class              text,
  p_price              int,
  p_daily_limit        int,
  p_idempotency_key    text,
  p_deadline           timestamptz,
  p_exempt             boolean default false,
  p_input              jsonb default null,
  p_file_ids           text[] default '{}',
  p_pages              int default null,
  p_conversation       uuid default null,
  p_source_ids         jsonb default null,
  p_section_index      int default null,
  p_free_per_memo      int default 5,
  p_free_per_section   int default 2,
  p_paid_price         int default 10,
  p_max_per_memo       int default 30)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total     int;
  v_free_memo int;
  v_free_sec  int;
  v_price     int;
begin
  if p_user is null or p_tool is null or p_conversation is null or p_idempotency_key is null
     or p_section_index is null or p_section_index < 0
     or p_free_per_memo is null or p_free_per_memo < 0
     or p_free_per_section is null or p_free_per_section < 0
     or p_paid_price is null or p_paid_price < 0
     or p_max_per_memo is null or p_max_per_memo < 0
     or p_input is null or p_input ->> 'phase' is distinct from 'section'
     or p_input ->> 'section_index' is distinct from p_section_index::text then
    raise exception 'ai_start_section_edit: invalid arguments' using errcode = '22023';
  end if;

  -- The lock ai_start_run takes; held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtextextended('ai_start_run:' || p_user::text || ':' || p_tool, 0));

  -- A retried request: ai_start_run answers it as the duplicate it is.
  if exists (select 1 from public.ai_runs r where r.user_id = p_user and r.idempotency_key = p_idempotency_key) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, p_price, 2147483647, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  if not exists (
    select 1 from public.ai_runs r
     where r.user_id = p_user and r.tool = p_tool and r.conversation_id = p_conversation
       and r.status = 'succeeded' and r.input ->> 'phase' = 'draft') then
    raise exception 'section_no_draft' using errcode = 'P0001';
  end if;

  select count(*)::int,
         (count(*) filter (where r.price_points = 0))::int,
         (count(*) filter (where r.price_points = 0 and r.input ->> 'section_index' = p_section_index::text))::int
    into v_total, v_free_memo, v_free_sec
    from public.ai_runs r
   where r.user_id = p_user and r.tool = p_tool and r.conversation_id = p_conversation
     and r.status <> 'failed' and r.input ->> 'phase' = 'section';

  if v_total >= p_max_per_memo then
    raise exception 'section_edit_limit' using errcode = 'P0001',
      detail = format('%s of %s section edits used', v_total, p_max_per_memo);
  end if;

  v_price := case when v_free_memo < p_free_per_memo and v_free_sec < p_free_per_section then 0 else p_paid_price end;
  if p_price is distinct from v_price then
    raise exception 'section_price_changed' using errcode = 'P0001',
      detail = format('asked %s, now %s (memo free %s, section free %s)', p_price, v_price, v_free_memo, v_free_sec);
  end if;

  return query select * from public.ai_start_run(
    p_user, p_tool, p_variant, p_class, v_price, 2147483647, p_idempotency_key, p_deadline,
    p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
end;
$$;

comment on function public.ai_start_section_edit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, int, int, int, int, int) is
  'Owner ٤١٠ (20261108_40): starts a legal-drafter section edit. Under ai_start_run''s lock: duplicate key → ai_start_run''s duplicate; no succeeded draft → P0001 section_no_draft; p_max_per_memo edits → P0001 section_edit_limit; free while < p_free_per_memo free edits in the memo and < p_free_per_section in that section (price_points = 0, failed runs not counted), else p_paid_price; a p_price that differs → P0001 section_price_changed; then ai_start_run without a daily limit. Service role only.';

revoke all on function public.ai_start_section_edit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.ai_start_section_edit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, int, int, int, int, int) to service_role;

-- ── verify ──────────────────────────────────────────────────────────────────
do $$
declare
  fn       text := 'public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)';
  fn_owner text;
begin
  if to_regprocedure(fn) is null then
    raise exception '20261108_40 verify: % is missing', fn;
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ai_start_section_edit') <> 1 then
    raise exception '20261108_40 verify: more than one ai_start_section_edit overload (PostgREST cannot choose: PGRST203)';
  end if;
  if has_function_privilege('authenticated', fn, 'EXECUTE') or has_function_privilege('anon', fn, 'EXECUTE') then
    raise exception '20261108_40 verify: a session role can EXECUTE %', fn;
  end if;
  select pg_get_userbyid(proowner) into fn_owner from pg_proc where oid = to_regprocedure(fn);
  if not has_function_privilege(fn_owner,
       'public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE') then
    raise exception '20261108_40 verify: %, the owner of ai_start_section_edit, cannot EXECUTE ai_start_run — every section edit fails; give them the same owner', fn_owner;
  end if;
  raise notice '20261108_40 verify: OK — ai_start_section_edit, service role only, owner % runs ai_start_run', fn_owner;
end $$;

commit;
notify pgrst, 'reload schema';
