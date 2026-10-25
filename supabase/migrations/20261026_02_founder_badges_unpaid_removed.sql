-- =============================================================================
-- Migration: 20261026_02_founder_badges_unpaid_removed.sql
-- =============================================================================
-- PURPOSE (owner answers of 26 Oct 2026, question ٢٧٨ — option (أ))
--   20261026_01 stopped the free signup grant of 20261021_50, but kept every
--   badge and lib-founder grant already given until the owner answered ٢٧٨.
--   He answered (أجوبة_المالك_٢٧٨-٢٩٨_٢٠٢٦-١٠-٢٦.md, section أولاً):
--     «من سجّلوا منذ بدء الحملة تُسحب منهم شارة «المحامي المؤسس» غير المدفوعة.»
--     «تبقى لهم أيام المكتبة الـ ٩٠ الممنوحة سابقاً حتى تنتهي مدتها دون قطعها.»
--   No paid founder membership exists yet (it is built in phase P3; one
--   all-in plan at 2,996 SAR a year per the same answers), so every
--   lawyer_profiles.founder_badge = true today is an unpaid one, given by the
--   signup trigger. This file takes those badges away and leaves the library
--   days alone.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. lock_timeout 5s: the UPDATE row-locks lawyer_profiles. Behind a long
--      write it stops with "canceling statement due to lock timeout" and
--      changes nothing — run it again a moment later.
--   2. Refuses to run unless
--        * lawyer_profiles.founder_badge exists (20261021_50 applied);
--        * 20261026_01 has run: trg_lawyer_profiles_founder and
--          lawyer_profile_founder_campaign() are gone and the founder_badge
--          comment carries "20261026_01". Otherwise the trigger would hand a
--          new badge to the next signup straight after this file cleared it,
--          so it raises "run 01_NOW_20261026_01… first".
--   3. public.founder_badge_removals (user_id uuid PRIMARY KEY, removed_at
--      timestamptz NOT NULL DEFAULT now(), reason text): the audit list of
--      who lost an unpaid badge and when. RLS on, NO policies; all privileges
--      revoked from PUBLIC / anon / authenticated, granted to service_role
--      (postgres owns it). No app code reads it.
--   4. THE RULE — the target is every lawyer_profiles row with
--      founder_badge = true whose user holds NO paid founder order:
--        not exists (select 1 from public.payment_orders
--                      where user_id = … and status = 'paid'
--                        and item_id ilike '%founder%')
--      (checked only when payment_orders exists — 20261022_10). Today no
--      founder item is sold, so the target is every badge, as the owner asked.
--      The target ids are inserted into founder_badge_removals
--      (`on conflict (user_id) do nothing`: the first removed_at is kept),
--      then exactly that target set is cleared: founder_badge = false. A
--      badge that comes back later for an unpaid user (a restore, a manual
--      edit) is cleared again on a re-run; a re-run with nothing new clears
--      nothing and writes nothing.
--   5. NEVER touches public.library_access_grants: every lib-founder /
--      founder_campaign grant keeps its ends_at and runs out on its own. The
--      verify hashes the whole table before and after and raises if a single
--      row differs.
--   6. The founder_badge column comment is rewritten to add "20261026_02"
--      (it keeps "20261026_01 … P3", which 20261026_01's verify and its
--      Docker test read). _verify.sql reads that marker to tell "never ran"
--      (NOTICE) from "ran, then its table was lost" (raise). A later re-run
--      of 20261026_01 rewrites the comment without it: _verify.sql then only
--      NOTICEs — re-run this file after 01 to put it back.
--   7. Raising verify; NOTICEs the counts (badges cleared now, removals
--      recorded in all, badges kept because paid, lib-founder grants kept and
--      how many are still running); then `notify pgrst` after commit.
--
-- P3 MUST READ THIS (paid founder membership)
--   The rule above protects a paid badge ONLY if P3 records the payment as a
--   payment_orders row with status 'paid' and an item_id containing
--   "founder" (e.g. lawyer-founder-2026). If P3 sells it any other way, P3
--   must change the predicate in step 4 (and in this header) in the same
--   commit — or this file must never be re-run after P3 ships. Holding a
--   lib-founder grant is NOT a sign of "unpaid": a lawyer who signed up on
--   25 Oct and pays in P3 still holds that old grant.
--
-- DEPLOY ORDER — AFTER 20261026_01, ANY TIME, NO CODE DEPLOY NEEDED. The code
--   already reads founder_badge as a plain boolean (false hides the badge).
--   NOTE: deploy.sh does NOT run _verify.sql; run it by hand afterwards
--   (SQL_batch_2026-10-26_owner_answers/README.md).
--
-- ROLLBACK (gives the unpaid badges back — only with the owner's written yes)
--   update public.lawyer_profiles lp set founder_badge = true
--     from public.founder_badge_removals r where r.user_id = lp.user_id;
--   (keep founder_badge_removals as the record; drop it only together with
--   the verify:founder_badges_unpaid_removed section of _verify.sql.)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisites ─────────────────────────────────────────────────────────
do $$
declare
  run01 constant text := 'run SQL_batch_2026-10-26_owner_answers/01_NOW_20261026_01_founder_no_signup_grant.sql first, then this file';
begin
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261026_02: public.lawyer_profiles does not exist';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.lawyer_profiles'::regclass
                    and attname = 'founder_badge' and not attisdropped) then
    raise exception '20261026_02: lawyer_profiles.founder_badge does not exist — 20261021_50_founder_campaign.sql was never applied, so no founder badge was ever given (nothing to do)';
  end if;
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261026_02: public.library_access_grants does not exist (20261019_10)';
  end if;
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.lawyer_profiles'::regclass
                and tgname = 'trg_lawyer_profiles_founder') then
    raise exception '20261026_02: trg_lawyer_profiles_founder still exists — the signup trigger would give the badge again right after this file clears it; %', run01;
  end if;
  if to_regprocedure('public.lawyer_profile_founder_campaign()') is not null then
    raise exception '20261026_02: public.lawyer_profile_founder_campaign() still exists — 20261026_01 has not run; %', run01;
  end if;
  if coalesce(col_description('public.lawyer_profiles'::regclass,
                (select attnum from pg_attribute
                  where attrelid = 'public.lawyer_profiles'::regclass
                    and attname = 'founder_badge')), '') not like '%20261026_01%' then
    raise exception '20261026_02: the founder_badge comment lacks the 20261026_01 marker — 20261026_01 has not run; %', run01;
  end if;
end $$;

-- ── 2. The audit list ────────────────────────────────────────────────────────
create table if not exists public.founder_badge_removals (
  user_id    uuid primary key,
  removed_at timestamptz not null default now(),
  reason     text
);

alter table public.founder_badge_removals enable row level security;
revoke all on public.founder_badge_removals from public, anon, authenticated;
grant all on public.founder_badge_removals to service_role;

comment on table public.founder_badge_removals is
  'Owner ٢٧٨ (أ), 26-Oct answers (20261026_02): lawyers whose UNPAID founder badge (given free on signup by 20261021_50) was removed. Their lib-founder library days were kept until they expire. Service role only; RLS on, no policies.';

-- ── 3. Clear the unpaid badges; never touch the library grants ───────────────
do $$
declare
  reason     constant text := 'owner ٢٧٨ (أ): unpaid founder badge given on free signup (20261021_50)';
  paid_po    constant text :=
    ' and not exists (select 1 from public.payment_orders po'
    || ' where po.user_id = lp.user_id and po.status = ''paid'''
    || ' and po.item_id ilike ''%founder%'')';
  unpaid     text := '';
  g_before   text;
  g_after    text;
  recorded   bigint;
  cleared    bigint;
begin
  if to_regclass('public.payment_orders') is not null then
    unpaid := paid_po;
  end if;

  select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) into g_before
    from public.library_access_grants g;

  execute 'insert into public.founder_badge_removals (user_id, reason)'
       || ' select lp.user_id, $1 from public.lawyer_profiles lp'
       || ' where lp.founder_badge' || unpaid
       || ' on conflict (user_id) do nothing'
    using reason;
  get diagnostics recorded = row_count;

  execute 'update public.lawyer_profiles lp set founder_badge = false'
       || ' where lp.founder_badge' || unpaid
       || ' and lp.user_id in (select r.user_id from public.founder_badge_removals r)';
  get diagnostics cleared = row_count;

  select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) into g_after
    from public.library_access_grants g;
  if g_after is distinct from g_before then
    raise exception '20261026_02: library_access_grants changed during this file — it must never be touched (owner ٢٧٨: the 90 library days stay)';
  end if;

  raise notice '20261026_02: % unpaid founder badge(s) cleared now, % new id(s) recorded in founder_badge_removals', cleared, recorded;
end $$;

-- ── 4. The column comment carries this file's marker ─────────────────────────
comment on column public.lawyer_profiles.founder_badge is
  'المحامي المؤسس (owner ٢١٨, 25-Oct answers; 20261021_50, signup grant removed by 20261026_01; unpaid badges removed by 20261026_02, owner ٢٧٨ (أ)): never set on signup. Will be set by the paid founder membership (phase P3: verified licence + payment) through the service role only. anon/authenticated may SELECT it; no session writes it.';

-- ── 5. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  tbl      constant text := 'public.founder_badge_removals';
  r        text;
  p        text;
  missing  text := '';
  unpaid   bigint;
  paid     bigint;
  removals bigint;
  grants   bigint;
  running  bigint;
begin
  if to_regclass(tbl) is null then
    missing := missing || ' founder_badge_removals is missing;';
  else
    if not (select relrowsecurity from pg_class where oid = tbl::regclass) then
      missing := missing || ' founder_badge_removals has RLS off;';
    end if;
    if exists (select 1 from pg_policy where polrelid = tbl::regclass) then
      missing := missing || ' founder_badge_removals has a policy (it must have none);';
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, tbl, p) then
          missing := missing || format(' %s holds %s on founder_badge_removals;', r, p);
        end if;
      end loop;
    end loop;
    if not has_table_privilege('service_role', tbl, 'SELECT, INSERT') then
      missing := missing || ' service_role cannot read / write founder_badge_removals;';
    end if;
  end if;

  if to_regclass('public.payment_orders') is not null then
    select count(*) filter (where po.uid is null), count(*) filter (where po.uid is not null)
      into unpaid, paid
      from public.lawyer_profiles lp
      left join lateral (select lp.user_id as uid from public.payment_orders o
                          where o.user_id = lp.user_id and o.status = 'paid'
                            and o.item_id ilike '%founder%' limit 1) po on true
     where lp.founder_badge;
  else
    select count(*), 0 into unpaid, paid from public.lawyer_profiles where founder_badge;
  end if;
  if unpaid <> 0 then
    missing := missing || format(' %s founder badge(s) without a paid founder order remain;', unpaid);
  end if;

  -- 20261026_01's verify and Docker test read "20261026_01 … P3"; _verify.sql
  -- reads "20261026_02"
  if coalesce(col_description('public.lawyer_profiles'::regclass,
                (select attnum from pg_attribute
                  where attrelid = 'public.lawyer_profiles'::regclass
                    and attname = 'founder_badge')), '') not like '%20261026_01%20261026_02%P3%' then
    missing := missing || ' the founder_badge comment lacks the 20261026_01 / 20261026_02 markers or the P3 note;';
  end if;

  if missing <> '' then
    raise exception '20261026_02 verify:%', missing;
  end if;

  select count(*) into removals from public.founder_badge_removals;
  select count(*), count(*) filter (where ends_at > now()) into grants, running
    from public.library_access_grants
   where plan_ref = 'lib-founder' and source = 'founder_campaign';
  raise notice '20261026_02 verify: OK — no unpaid founder badge remains; % removal(s) recorded in founder_badge_removals; % badge(s) kept because a paid founder order exists; library grants untouched: % lib-founder grant(s) kept, % still running',
    removals, paid, grants, running;
end $$;

commit;

notify pgrst, 'reload schema';
