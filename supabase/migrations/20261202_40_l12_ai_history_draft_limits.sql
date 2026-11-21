-- =============================================================================
-- Migration: 20261202_40_l12_ai_history_draft_limits.sql
-- Batch l12, builder lib-draft (owner file 03 ل2 / ل11, his file-13 row «ل12»).
-- =============================================================================
-- PURPOSE
--   1. «سجلّي» per-run delete (L11-log): public.ai_runs.user_hidden_at.
--      The user's delete (DELETE /api/v1/ai/history?id=…, service role, own
--      row only) stamps it and clears input / output / citations /
--      source_ids / error_message in the same update; the money facts and
--      dates stay (refunds, invoices). Every list the user sees skips a
--      hidden row. SELECT on this one column is granted to authenticated so
--      the session-client list (/api/v1/ai/runs) can filter on it — it is the
--      user's own row metadata under the existing own-rows policy; input,
--      usage, model and source_ids stay column-locked.
--   2. Retention as an admin setting (his «12 شهراً تُضبط من لوحة الإدارة»):
--      platform_settings 'ai_runs_retention' = {"months": 12}, inserted only
--      when missing. public.ai_runs_retention() (20261027_10, 90 days fixed)
--      is re-created with the SAME signature to read it: months 1..60, any
--      other value → 12. Same work as before (clears the content, keeps the
--      money facts); the daily cron /api/v1/cron/ai-sweep?task=retention
--      calls it unchanged.
--      NOTE: this LENGTHENS the stored window from 90 days to 12 months by
--      default — the owner's figure; the admin can lower it.
--   3. The library draft's limits (L2, his answer ج): platform_settings
--      'library_draft_limits' = {"max_items": 30, "share_excerpt_chars": 200},
--      inserted only when missing (copy-all and the Word file stop at
--      max_items; a share carries at most share_excerpt_chars of text).
--      The Word download itself needs no table: it counts through
--      library_read_quota_hit as one document per draft and day, which also
--      writes full_text_reads (the five-file refund rule).
--
-- WHO CAN DO WHAT: unchanged except the one column grant above. The function
--   stays SECURITY DEFINER, search_path '', EXECUTE for service_role only.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261202_40_l12_ai_history_draft_limits.sql
--   Expect: NOTICE  20261202_40 verify: OK …  and a row with `t`.
--
-- RUN ORDER: any time after 20261027_10, before or after the l12 deploy.
--   * Code first: «سجلّي» lists the runs and says the delete is not available
--     yet (the route answers 503 «الحذف غير متاح بعد»); the lists read
--     without the hidden filter; the draft limits use their code defaults
--     (30 / 200); retention stays 90 days until this runs.
--   * SQL first with the old code: the old code ignores the column and the
--     two settings; retention moves to 12 months.
--   Safe to run any number of times (an admin's settings are never reset).
--
-- ROLLBACK (one transaction):
--   re-run §6 of 20261027_10_ai_runs.sql (the 90-day function);
--   revoke select (user_hidden_at) on public.ai_runs from authenticated;
--   drop index if exists public.ai_runs_user_visible_idx;
--   alter table public.ai_runs drop column if exists user_hidden_at;   -- a hidden run's content is already cleared
--   delete from public.platform_settings where key in ('ai_runs_retention', 'library_draft_limits');
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.ai_runs') is null or to_regprocedure('public.ai_runs_retention()') is null then
    raise exception '20261202_40: run 20261027_10_ai_runs.sql first';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261202_40: public.platform_settings is missing';
  end if;
end $$;

-- ── 1. the user's delete ─────────────────────────────────────────────────────
alter table public.ai_runs add column if not exists user_hidden_at timestamptz;

comment on column public.ai_runs.user_hidden_at is
  'L11-log (20261202_40): when the user deleted this run from «سجلّي». Set together with clearing input / output / citations / source_ids / error_message; the money facts stay. Hidden rows leave every list the user sees.';

create index if not exists ai_runs_user_visible_idx
  on public.ai_runs (user_id, created_at desc) where user_hidden_at is null;

grant select (user_hidden_at) on public.ai_runs to authenticated;

-- ── 2. retention from the admin setting ──────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('ai_runs_retention', '{"months": 12}'::jsonb,
   'L11-log (20261202_40): months an AI run keeps its question and answer before ai_runs_retention() clears them (1–60; anything else reads as 12). Owner file 03 ل11: 12 months, set by the admin.')
on conflict (key) do nothing;

create or replace function public.ai_runs_retention()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_raw    jsonb;
  v_months int := 12;
  v_n      int;
begin
  select s.value into v_raw from public.platform_settings s where s.key = 'ai_runs_retention';
  if v_raw is not null and jsonb_typeof(v_raw) = 'object' and jsonb_typeof(v_raw -> 'months') = 'number'
     and (v_raw ->> 'months') ~ '^[0-9]{1,2}$' then
    v_months := (v_raw ->> 'months')::int;
    if v_months < 1 or v_months > 60 then
      v_months := 12;
    end if;
  end if;

  with cleared as (
    update public.ai_runs a
       set input = null, output = null, citations = null, source_ids = null, error_message = null
     where a.created_at < now() - make_interval(months => v_months)
       and (a.input is not null or a.output is not null or a.citations is not null or a.source_ids is not null)
    returning 1)
  select count(*)::int into v_n from cleared;
  return v_n;
end;
$$;

comment on function public.ai_runs_retention() is
  'Clears input / output / citations of AI runs older than platform_settings.ai_runs_retention months (default 12; 20261202_40, was 90 days in 20261027_10), keeping price, charge, status and dates. Service role only.';

revoke all on function public.ai_runs_retention() from public, anon, authenticated;
grant execute on function public.ai_runs_retention() to service_role;

-- ── 3. the draft limits ──────────────────────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('library_draft_limits', '{"max_items": 30, "share_excerpt_chars": 200}'::jsonb,
   'L2 (20261202_40, owner file 03 ل2 answer ج): items one «نسخ المسودة كاملة» or one Word file of the library draft may hold (1–50), and the characters of text a share carries (50–500; title and page link on top).')
on conflict (key) do nothing;

-- ── 4. verify ────────────────────────────────────────────────────────────────
do $$
declare
  def text;
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.ai_runs'::regclass and attname = 'user_hidden_at' and not attisdropped) then
    raise exception '20261202_40 verify: ai_runs.user_hidden_at is missing';
  end if;
  if not has_column_privilege('authenticated', 'public.ai_runs', 'user_hidden_at', 'SELECT') then
    raise exception '20261202_40 verify: authenticated cannot read ai_runs.user_hidden_at';
  end if;
  if has_column_privilege('authenticated', 'public.ai_runs', 'input', 'SELECT')
     or has_column_privilege('anon', 'public.ai_runs', 'user_hidden_at', 'SELECT')
     or has_table_privilege('authenticated', 'public.ai_runs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.ai_runs', 'INSERT') then
    raise exception '20261202_40 verify: a session role gained more than SELECT (user_hidden_at) on ai_runs';
  end if;
  if has_function_privilege('authenticated', 'public.ai_runs_retention()', 'EXECUTE')
     or has_function_privilege('anon', 'public.ai_runs_retention()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.ai_runs_retention()', 'EXECUTE') then
    raise exception '20261202_40 verify: ai_runs_retention() must be service role only';
  end if;
  def := pg_catalog.pg_get_functiondef(to_regprocedure('public.ai_runs_retention()'));
  if pg_catalog.strpos(def, 'ai_runs_retention''') = 0 or pg_catalog.strpos(def, '90 days') > 0 then
    raise exception '20261202_40 verify: ai_runs_retention() does not read the setting';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'ai_runs_retention')
     or not exists (select 1 from public.platform_settings where key = 'library_draft_limits') then
    raise exception '20261202_40 verify: a setting row is missing';
  end if;
  raise notice '20261202_40 verify: OK — user_hidden_at + own-column grant, retention % months, draft limits %',
    (select value ->> 'months' from public.platform_settings where key = 'ai_runs_retention'),
    (select value::text from public.platform_settings where key = 'library_draft_limits');
end $$;

commit;
notify pgrst, 'reload schema';

select '20261202_40: ai_runs.user_hidden_at, retention from ai_runs_retention (default 12 months), library_draft_limits' as migration, true;
