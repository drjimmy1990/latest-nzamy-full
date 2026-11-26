-- =============================================================================
-- Migration: 20261208_40_l18_access_defaults.sql   (batch l18, verify id: l18_access)
-- =============================================================================
-- PURPOSE (owner package 2026-11-26, decisions ق٢٦-٢ and ق٢٦-٣)
--   1. ق٢٦-٢ — the legal library is OPEN by default for the three legal
--      professions: lawyer, consultant and the law-firm account (individual,
--      business and provider stay closed). The switch is
--      platform_settings.library_access_by_account_type (20261128_20); the
--      code default (src/lib/library/accountAccess.ts) and the admin screen's
--      defaults change in the same batch.
--        * the row is created with the new defaults if it is missing;
--        * an existing row is changed ONLY while no admin has ever saved it
--          (updated_by is null — the admin screen /dashboard/admin/library-access
--          always stamps updated_by) and only when consultant or firm is not
--          already true: it sets those two keys to true and nothing else.
--          An admin's saved choice is never overwritten; the NOTICE then
--          prints the stored value so the owner can flip it on that screen.
--        * per-account exceptions (library_access_user_overrides) are not
--          touched: an «allowed = false» exception still closes that account.
--   2. ق٢٦-٣ — 10 free library-assistant questions for the law-firm account
--      too (the lawyer already has 10 — a consultant is a `lawyer` account and
--      gets them once the library opens; the individual keeps 5). The setting
--      platform_settings.free_questions_by_account_type (20261127_40) gains
--      "firm": 10 ONLY when it does not name the firm at all, so an admin's
--      value for the firm (even 0) is kept. Created with the three values if
--      the row is missing.
--      Welcome points: nothing to do — no sign-up grant exists anywhere (0 is
--      already the rule).
--   No function is re-created: with both rows guaranteed, the SQL fallbacks
--   of library_access_for / ai_free_question_status (used only when a row is
--   missing) are never reached.
--   3. Verify block — RAISES unless both rows exist and hold the rule (or an
--      admin's saved choice for the library switch).
--
-- CHANGES PROD DATA: yes, two platform_settings rows, each behind the narrow
--   guard above. Expected on a database where no admin saved the library
--   switch: «library switch rows changed: 1», «free questions rows changed: 1»
--   on the first run; 0 and 0 on any re-run.
--
-- HOW TO RUN (on the server, from the project folder):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261208_40_l18_access_defaults.sql
--   Expect: NOTICE  l18_access library switch rows changed: N … (before/after)
--           NOTICE  l18_access free questions rows changed: N … (before/after)
--           NOTICE  l18_access verify: OK …   and a final row with `t`.
--
-- RUN ORDER: after 20261127_40 and 20261128_20. Either order with the l18
--   deploy (the code reads the same keys; before this runs the code default
--   only fills a key the row does not hold). Then _verify.sql (block
--   l18_access).
-- SAFE TO RE-RUN: yes (each update is guarded and changes 0 rows the second time).
-- ROLLBACK (only if the owner reverses ق٢٦-٢ / ق٢٦-٣ — prefer the admin screens):
--   update public.platform_settings set value = value || '{"consultant": false, "firm": false}'::jsonb
--    where key = 'library_access_by_account_type';
--   update public.platform_settings set value = value - 'firm'
--    where key = 'free_questions_by_account_type';
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261208_40: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
end
$pre$;

-- ── 1. ق٢٦-٢: the library switch ─────────────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('library_access_by_account_type',
   '{"lawyer": true, "consultant": true, "firm": true, "individual": false, "business": false, "provider": false}'::jsonb,
   'المكتبة القانونية مفتوحة لكل نوع حساب أو مغلقة (المحامي والمستشار ومكتب المحاماة مفتوحة والباقي مغلق افتراضياً) — owner item 9 + ق٢٦-٢ (20261208_40)')
on conflict (key) do nothing;

do $lib$
declare
  v_before jsonb;
  v_after  jsonb;
  v_by     uuid;
  v_n      int;
begin
  select ps.value, ps.updated_by into v_before, v_by
    from public.platform_settings ps where ps.key = 'library_access_by_account_type';

  update public.platform_settings ps
     set value = ps.value || '{"consultant": true, "firm": true}'::jsonb,
         description = 'المكتبة القانونية مفتوحة لكل نوع حساب أو مغلقة (المحامي والمستشار ومكتب المحاماة مفتوحة والباقي مغلق افتراضياً) — owner item 9 + ق٢٦-٢ (20261208_40)',
         updated_at = now()
   where ps.key = 'library_access_by_account_type'
     and ps.updated_by is null
     and jsonb_typeof(ps.value) = 'object'
     and ((ps.value -> 'consultant') is distinct from 'true'::jsonb
          or (ps.value -> 'firm') is distinct from 'true'::jsonb);
  get diagnostics v_n = row_count;

  select ps.value into v_after from public.platform_settings ps where ps.key = 'library_access_by_account_type';
  raise notice 'l18_access library switch rows changed: % (saved by an admin: %) — before: % — after: %',
    v_n, (v_by is not null), coalesce(v_before::text, 'none'), coalesce(v_after::text, 'none');
  if v_n = 0 and v_by is not null
     and ((v_after -> 'consultant') is distinct from 'true'::jsonb or (v_after -> 'firm') is distinct from 'true'::jsonb) then
    raise notice 'l18_access: an admin saved the library switch, so it was NOT changed — open «مستشار قانوني» and «مكتب محاماة» on /dashboard/admin/library-access if the owner confirms';
  end if;
end
$lib$;

-- ── 2. ق٢٦-٣: the firm's 10 free questions ───────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('free_questions_by_account_type', '{"lawyer": 10, "firm": 10, "individual": 5}'::jsonb,
   'عدد الأسئلة المجانية مرة واحدة لكل حساب حسب نوعه: المحامي والمستشار ومكتب المحاماة ١٠ في مساعد المكتبة، والفرد ٥ — ق٢٦-٣ (20261208_40)')
on conflict (key) do nothing;

do $fq$
declare
  v_before jsonb;
  v_after  jsonb;
  v_n      int;
begin
  select ps.value into v_before from public.platform_settings ps where ps.key = 'free_questions_by_account_type';

  update public.platform_settings ps
     set value = ps.value || '{"firm": 10}'::jsonb,
         updated_at = now()
   where ps.key = 'free_questions_by_account_type'
     and jsonb_typeof(ps.value) = 'object'
     and not (ps.value ? 'firm');
  get diagnostics v_n = row_count;

  select ps.value into v_after from public.platform_settings ps where ps.key = 'free_questions_by_account_type';
  raise notice 'l18_access free questions rows changed: % — before: % — after: %',
    v_n, coalesce(v_before::text, 'none'), coalesce(v_after::text, 'none');
end
$fq$;

-- ── 3. verify ───────────────────────────────────────────────────────────────
do $verify$
declare
  v_lib jsonb;
  v_by  uuid;
  v_fq  jsonb;
  missing text := '';
begin
  select ps.value, ps.updated_by into v_lib, v_by
    from public.platform_settings ps where ps.key = 'library_access_by_account_type';
  select ps.value into v_fq from public.platform_settings ps where ps.key = 'free_questions_by_account_type';

  if v_lib is null then
    missing := missing || ' the library switch row is missing;';
  elsif v_by is null and ((v_lib -> 'consultant') is distinct from 'true'::jsonb or (v_lib -> 'firm') is distinct from 'true'::jsonb) then
    missing := missing || ' the unsaved library switch does not open consultant + firm;';
  end if;
  if v_fq is null then
    missing := missing || ' the free questions row is missing;';
  elsif not (v_fq ? 'firm') then
    missing := missing || ' the free questions setting does not name the firm;';
  end if;

  if missing <> '' then
    raise exception 'l18_access verify FAILED:%', missing;
  end if;
  raise notice 'l18_access verify: OK — library switch %, free questions %', v_lib::text, v_fq::text;
end
$verify$;

commit;

select '20261208_40 l18_access_defaults (library open for lawyer + consultant + firm unless an admin saved it; firm 10 free questions)' as migration, true as ok;
