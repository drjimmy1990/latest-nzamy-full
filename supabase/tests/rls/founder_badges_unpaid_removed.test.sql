-- founder_badges_unpaid_removed.test.sql — proves 20261026_02 (owner ٢٧٨ (أ),
-- 26-Oct answers: the unpaid founder badges given on a free signup are taken
-- away; the 90 library days already given stay until they run out) and its
-- _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The founder
-- chain of founder_no_signup_grant.test.sql up to 20261026_01, then
-- 20261026_02 THREE times. The _verify blocks are extracted from _verify.sql
-- between their markers; v02 runs before 01 and before 02 (it must only
-- NOTICE "not applied yet") and at the end (it must pass). From the repo
-- root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   sed -n '/^-- >>> verify:founder_no_signup_grant/,/^-- <<< verify:founder_no_signup_grant/p' $M/_verify.sql > "$D/v01.sql"
--   sed -n '/^-- >>> verify:founder_badges_unpaid_removed/,/^-- <<< verify:founder_badges_unpaid_removed/p' $M/_verify.sql > "$D/v02.sql"
--   bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $T/prelude_founder_no_signup_grant_before.sql \
--     $T/prelude_founder_badges_unpaid_removed_before.sql \
--     "$D/v02.sql" \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     "$D/v02.sql" \
--     $M/20261026_02_founder_badges_unpaid_removed.sql \
--     $T/prelude_founder_badges_unpaid_removed_after_first.sql \
--     $M/20261026_02_founder_badges_unpaid_removed.sql \
--     $T/prelude_founder_badges_unpaid_removed_between.sql \
--     $M/20261026_02_founder_badges_unpaid_removed.sql \
--     "$D/v01.sql" "$D/v02.sql" \
--     $T/founder_badges_unpaid_removed.test.sql
-- Why each link: as in founder_no_signup_grant.test.sql, plus
--   prelude_founder_badges_unpaid_removed_before.sql  f4 signs up before the
--       fix too (2 unpaid badges, 2 lib-founder grants), b1 holds an admin
--       grant, and every grant row is copied to _t_grants_before;
--   …_after_first.sql  the first run cleared both; snapshot of the removals;
--   …_between.sql      the second run was a no-op; then the post-P3 world: a
--       paid founder order for f1 (badge back), f4's badge back unpaid.
--
-- NEGATIVE CONTROLS (must FAIL)
--   (a) 02 before 01: the chain up to prelude_founder_badges_unpaid_removed_before.sql,
--       then $M/20261026_02_founder_badges_unpaid_removed.sql → it raises
--       "trg_lawyer_profiles_founder still exists … run
--       SQL_batch_2026-10-26_owner_answers/01_NOW… first" and changes
--       nothing.
--   (b) the full chain, then `drop table public.founder_badge_removals;` and
--       "$D/v02.sql" → it raises "20261026_02 ran … founder_badge_removals is
--       missing".
--   (c) the rule without its payment_orders clause (delete the line
--       `unpaid := paid_po;`) → T1 fails: f1's paid badge is cleared.
--
-- Actors: f1 (paid founder after P3) · f4 (unpaid, badge came back) ·
-- b1 / b2 lawyers from before 20261021_50. Every assertion RAISES on failure.
\set ON_ERROR_STOP on

-- T1 the badges: f1 kept (paid founder order), f4 cleared again, nobody else
do $$
begin
  if (select founder_badge from public.lawyer_profiles
       where user_id = '00000000-0000-0000-0000-0000000000f1') is distinct from true then
    raise exception 'T1 FAIL: f1''s badge was cleared although f1 holds a paid founder order';
  end if;
  if (select founder_badge from public.lawyer_profiles
       where user_id = '00000000-0000-0000-0000-0000000000f4') is distinct from false then
    raise exception 'T1 FAIL: f4''s unpaid badge came back and was not cleared again';
  end if;
  if (select count(*) from public.lawyer_profiles where founder_badge) <> 1 then
    raise exception 'T1 FAIL: % badge(s) held, expected only f1''s paid one',
      (select count(*) from public.lawyer_profiles where founder_badge);
  end if;
  raise notice 'T1 PASS: the paid badge (f1) is kept, the unpaid one that came back (f4) is cleared again, nobody else holds one';
end $$;

-- T2 the audit list: f1 and f4, each with the removed_at of the FIRST run
do $$
begin
  if exists ((select user_id, removed_at, reason from public.founder_badge_removals
              except select user_id, removed_at, reason from public._t_removals_first)
             union all
             (select user_id, removed_at, reason from public._t_removals_first
              except select user_id, removed_at, reason from public.founder_badge_removals)) then
    raise exception 'T2 FAIL: founder_badge_removals differs from the first run''s: %',
      (select array_agg(user_id order by user_id) from public.founder_badge_removals);
  end if;
  if exists (select 1 from public.founder_badge_removals where reason not like '%٢٧٨%') then
    raise exception 'T2 FAIL: a removal does not name owner question ٢٧٨';
  end if;
  raise notice 'T2 PASS: founder_badge_removals = f1 and f4 with their first removed_at and reason (re-runs added nothing)';
end $$;

-- T3 the library days: every grant row unchanged; f1's and f4's lib-founder
-- grants still running
do $$
begin
  if exists ((select * from public.library_access_grants except select * from public._t_grants_before)
             union all
             (select * from public._t_grants_before except select * from public.library_access_grants)) then
    raise exception 'T3 FAIL: library_access_grants differs from before 20261026_01';
  end if;
  if (select count(*) from public.library_access_grants
       where plan_ref = 'lib-founder' and source = 'founder_campaign' and ends_at > now()
         and user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f4')) <> 2 then
    raise exception 'T3 FAIL: f1 and f4 do not each still hold one running lib-founder grant';
  end if;
  raise notice 'T3 PASS: library_access_grants is row for row what it was (% rows); both lib-founder grants still running',
    (select count(*) from public.library_access_grants);
end $$;

-- T4 the audit table is service-role only (stubs.sql gives every new table to
-- anon / authenticated, as Supabase's default privileges do)
do $$
declare r text; p text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.founder_badge_removals'::regclass)
     or exists (select 1 from pg_policy where polrelid = 'public.founder_badge_removals'::regclass) then
    raise exception 'T4 FAIL: founder_badge_removals must have RLS on and no policies';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(r, 'public.founder_badge_removals', p) then
        raise exception 'T4 FAIL: % holds % on founder_badge_removals', r, p;
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', 'public.founder_badge_removals', 'SELECT, INSERT, UPDATE, DELETE') then
    raise exception 'T4 FAIL: service_role cannot use founder_badge_removals';
  end if;
  raise notice 'T4 PASS: founder_badge_removals — RLS on, no policies, nothing for anon / authenticated, service_role reads and writes';
end $$;

-- T5 an authenticated session is refused outright
set role authenticated;
do $$
begin
  perform 1 from public.founder_badge_removals;
  raise exception 'T5 FAIL: an authenticated session read founder_badge_removals';
exception when insufficient_privilege then
  raise notice 'T5 PASS: an authenticated session is refused (permission denied)';
end $$;
reset role;

-- T6 the comment carries both markers and the P3 note; no signup trigger
do $$
declare c text;
begin
  c := col_description('public.lawyer_profiles'::regclass,
         (select attnum from pg_attribute where attrelid = 'public.lawyer_profiles'::regclass
            and attname = 'founder_badge'));
  if c not like '%20261026_01%P3%' or c not like '%20261026_02%' then
    raise exception 'T6 FAIL: the founder_badge comment lost a marker: %', c;
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.lawyer_profiles'::regclass
               and tgname = 'trg_lawyer_profiles_founder') then
    raise exception 'T6 FAIL: the signup trigger is back';
  end if;
  raise notice 'T6 PASS: the founder_badge comment carries 20261026_01 … P3 and 20261026_02; no signup trigger';
end $$;
