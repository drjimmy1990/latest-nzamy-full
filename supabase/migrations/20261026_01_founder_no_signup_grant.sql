-- =============================================================================
-- Migration: 20261026_01_founder_no_signup_grant.sql
-- =============================================================================
-- PURPOSE (owner answers of 25 Oct 2026, phase P0 — URGENT)
--   The owner (أ. أشرف ويح) decided that the founder badge, the founder seat
--   and the 3 months of library are NEVER given on a free signup any more.
--   As recorded in للمالك_دفعة_٢٥_أكتوبر/أسئلة_للمالك_حزمة_التسعير_٢٥_أكتوبر.md:
--     «لا شارة ولا مقعد مؤسس ولا ٣ أشهر مكتبة بمجرد التسجيل المجاني»
--   Only a verified licence plus an actual payment for the founder membership
--   (1,996 / 2,996 SAR a year, 1,096 paid seats — built later in phase P3)
--   earns them.
--   Since 20261021_50 the BEFORE INSERT trigger trg_lawyer_profiles_founder
--   gives every new lawyer_profiles row founder_badge = true and one
--   lib-founder library grant of library_days days while
--   founder_campaign_active() is true (from 25 Oct 2026, Riyadh). This file
--   stops that.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. lock_timeout 5s: DROP TRIGGER takes an ACCESS EXCLUSIVE lock on
--      lawyer_profiles. Behind a long read it stops with "canceling statement
--      due to lock timeout" and changes nothing — run it again a moment later
--      (without the limit every lawyer page would queue behind it).
--   2. Refuses to run unless lawyer_profiles.founder_badge exists
--      (20261021_50 applied) — the comment below needs the column.
--   3. drop trigger if exists trg_lawyer_profiles_founder, then
--      drop function if exists public.lawyer_profile_founder_campaign()
--      (no CASCADE: nothing else uses it).
--   4. KEEPS, for P3's paid founder membership:
--        * the column lawyer_profiles.founder_badge (and re-asserts its one
--          grant, select to anon / authenticated — a no-op normally; it
--          repairs a 20261016_10 re-run, which revokes it);
--        * public.founder_campaign_active(timestamptz);
--        * the platform setting founder_campaign (its value is not touched).
--      Its Arabic description, which still promised the signup gift, is
--      rewritten (description only, never value). It carries "20261026_01"
--      too: the second marker _verify.sql reads, which a re-run of
--      20261021_50 does not reset (its seed is `on conflict do nothing`).
--   5. KEEPS every badge and every lib-founder grant already given — what
--      happens to them waits on the owner's answer to question ٢٧٨. No row of
--      lawyer_profiles or library_access_grants is written.
--   6. The column comment now says who sets founder_badge (the paid founder
--      membership of P3 / the service role only). It carries the literal
--      "20261026_01": _verify.sql reads it as the proof this file ran.
--   7. Raising verify (NOTICEs the number of badges and lib-founder grants
--      already given — the number the owner needs for ٢٧٨); then
--      `notify pgrst` after commit.
--
-- DEPLOY ORDER — ANY TIME, NO CODE DEPLOY NEEDED. Run it NOW: every lawyer
--   who signs up before it runs gets the badge and the library days. No code
--   calls the trigger function. NOTE: deploy.sh does NOT run _verify.sql
--   (removed in 6223b221), so nothing stops a deploy if this file is skipped;
--   run it BEFORE deploying, then run _verify.sql by hand (README).
--
-- RE-RUN HAZARD
--   20261021_50 is idempotent and re-creates the trigger. If it is ever
--   re-run (its own verify passes), re-run THIS file after it; _verify.sql's
--   20261026_01 section raises until then (proved in Docker,
--   supabase/tests/rls/founder_no_signup_grant.test.sql). A re-run of 20261016_10 revokes
--   founder_badge's SELECT grant: re-run 20261019_20 and this file after it.
--
-- ROLLBACK (puts the signup gift back — only with the owner's written yes)
--   re-run supabase/migrations/20261021_50_founder_campaign.sql (it re-creates
--   the function, the trigger and the old column comment; the setting keeps
--   its current value and this file's description). A deliberate rollback
--   also means removing the verify:founder_no_signup_grant section from
--   _verify.sql, which otherwise raises (when run by hand) while the trigger exists.
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisite ──────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261026_01: public.lawyer_profiles does not exist';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.lawyer_profiles'::regclass
                    and attname = 'founder_badge' and not attisdropped) then
    raise exception '20261026_01: lawyer_profiles.founder_badge does not exist — 20261021_50_founder_campaign.sql was never applied, so there is no signup grant to stop (nothing to do)';
  end if;
end $$;

-- ── 2. Stop the signup grant ─────────────────────────────────────────────────
drop trigger if exists trg_lawyer_profiles_founder on public.lawyer_profiles;
drop function if exists public.lawyer_profile_founder_campaign();

-- ── 3. What stays, described honestly ────────────────────────────────────────
comment on column public.lawyer_profiles.founder_badge is
  'المحامي المؤسس (owner ٢١٨, 25-Oct answers; 20261021_50, signup grant removed by 20261026_01): never set on signup. Will be set by the paid founder membership (phase P3: verified licence + payment) through the service role only. anon/authenticated may SELECT it; no session writes it.';

grant select (founder_badge) on public.lawyer_profiles to anon, authenticated;

update public.platform_settings
   set description = 'حملة المحامي المؤسس: تاريخا البداية والنهاية (بتوقيت الرياض، شاملاً اليومين). منذ 20261026_01 (قرار المالك ٢٥ أكتوبر) لا يمنح التسجيل المجاني شارة المؤسس ولا أيام المكتبة؛ library_days غير مستخدم حالياً. ستُمنح الشارة لاحقاً بعضوية المحامي المؤسس المدفوعة (المرحلة P3).'
 where key = 'founder_campaign'
   and description is distinct from 'حملة المحامي المؤسس: تاريخا البداية والنهاية (بتوقيت الرياض، شاملاً اليومين). منذ 20261026_01 (قرار المالك ٢٥ أكتوبر) لا يمنح التسجيل المجاني شارة المؤسس ولا أيام المكتبة؛ library_days غير مستخدم حالياً. ستُمنح الشارة لاحقاً بعضوية المحامي المؤسس المدفوعة (المرحلة P3).';

-- ── 4. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  tbl     constant text := 'public.lawyer_profiles';
  fn_act  constant text := 'public.founder_campaign_active(timestamptz)';
  r       text;
  badges  bigint;
  grants  bigint;
  missing text := '';
begin
  if exists (select 1 from pg_trigger
              where tgrelid = tbl::regclass and tgname = 'trg_lawyer_profiles_founder') then
    missing := missing || ' trg_lawyer_profiles_founder still exists;';
  end if;
  if to_regprocedure('public.lawyer_profile_founder_campaign()') is not null then
    missing := missing || ' public.lawyer_profile_founder_campaign() still exists;';
  end if;
  -- no other trigger on lawyer_profiles may still call a founder function
  if exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
              where t.tgrelid = tbl::regclass and not t.tgisinternal
                and p.proname ilike '%founder%') then
    missing := missing || ' another trigger on lawyer_profiles still runs a *founder* function;';
  end if;

  -- what P3 reuses is still there
  if to_regprocedure(fn_act) is null then
    missing := missing || ' founder_campaign_active(timestamptz) is gone (P3 reuses it);';
  else
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if not has_function_privilege(r, fn_act, 'EXECUTE') then
        missing := missing || format(' %s cannot EXECUTE founder_campaign_active;', r);
      end if;
    end loop;
  end if;
  if not exists (select 1 from public.platform_settings where key = 'founder_campaign') then
    missing := missing || ' the platform setting founder_campaign is gone (P3 reuses it);';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if not has_column_privilege(r, tbl, 'founder_badge', 'SELECT') then
      missing := missing || format(' %s cannot SELECT founder_badge;', r);
    end if;
    if has_column_privilege(r, tbl, 'founder_badge', 'INSERT, UPDATE, REFERENCES') then
      missing := missing || format(' %s can write founder_badge;', r);
    end if;
  end loop;
  if coalesce(col_description(tbl::regclass,
                (select attnum from pg_attribute
                  where attrelid = tbl::regclass and attname = 'founder_badge')), '')
     not like '%20261026_01%' then
    missing := missing || ' the founder_badge comment lacks the 20261026_01 marker;';
  end if;
  if exists (select 1 from public.platform_settings
              where key = 'founder_campaign'
                and coalesce(description, '') not like '%20261026_01%') then
    missing := missing || ' the founder_campaign setting description lacks the 20261026_01 marker;';
  end if;

  if missing <> '' then
    raise exception '20261026_01 verify:%', missing;
  end if;

  select count(*) into badges from public.lawyer_profiles where founder_badge;
  select count(*) into grants from public.library_access_grants where plan_ref = 'lib-founder';
  raise notice '20261026_01 verify: OK — no signup trigger gives the founder badge or library days any more; founder_badge column, founder_campaign_active() and the founder_campaign setting kept for P3; already given (kept until the owner answers ٢٧٨): % badge(s), % lib-founder grant(s)',
    badges, grants;
end $$;

commit;

notify pgrst, 'reload schema';
