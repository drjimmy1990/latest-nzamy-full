-- =============================================================================
-- Migration: 20261208_50_l18_confirmed_phone_unique.sql
--            (batch l18-answers, verify id: l18_confirmed_phone_unique)
-- =============================================================================
-- PURPOSE (owner answer ٢٣٥ §2, 27 Nov 2026)
--   «رقم الجوال المؤكَّد يكون لحساب واحد فقط».
--
--   A mobile CONFIRMED by a WhatsApp code (profiles.phone with
--   profiles.phone_verified_at set, 20261205_10) belongs to one account only.
--   The app refuses it first (phone-otp start / verify, profile PATCH — the
--   neutral «تعذّر استعمال هذا الرقم، استعمل رقمًا آخر أو تواصل معنا»); this
--   file is the same rule in the database, for every writer:
--
--   1. public.confirmed_phone_taken(user, phone) → boolean: another account
--      has this number confirmed (the same three spellings the sign-in
--      resolver 20261208_20 compares: +9665…, 9665…, 05…).
--   2. trigger trg_phone_verified_unique — BEFORE INSERT OR UPDATE OF phone,
--      phone_verified_at on public.profiles: a row that BECOMES confirmed
--      (phone_verified_at set where it was null, or a confirmed row whose
--      number changes) is refused with errcode 23505, message
--      «confirmed_phone_taken…», when another account already has that number
--      confirmed. Under an advisory lock on the number, so two confirmations
--      at the same moment cannot both pass.
--      Trigger ORDER matters: BEFORE triggers fire by name, and
--      trg_phone_verified_guard (20261205_10) — which CLEARS phone_verified_at
--      when the number changes — sorts before this one, so a plain change of
--      number is never mistaken for a confirmation.
--   3. A partial UNIQUE index profiles_confirmed_phone_unique on (phone)
--      where phone_verified_at is not null — created ONLY when no two
--      accounts share a confirmed number today. Otherwise a NOTICE names how
--      many numbers are shared: run the read-only report
--      20261208_51_duplicate_phones_report.sql, clean up by hand (NEVER an
--      admin / super_admin / staff account — owner red line), then re-run
--      THIS file to create the index. The trigger (2) protects new
--      confirmations either way.
--   4. Verify block — RAISES unless (1) and (2) hold.
--
--   Nothing is unconfirmed, changed or deleted here: an existing shared
--   number stays as it is until the operator cleans it up (the sign-in
--   resolver already signs nobody in by a shared number).
--
-- ORDER: any time; BEFORE the deploy of batch l18 is best (the app refuses
--   with the same words either way — it checks before it writes). Needs
--   20261205_10_phone_otp.sql (profiles.phone_verified_at).
-- DATA: none. 0 rows changed. (Only the index build reads every confirmed row.)
-- SAFE TO RE-RUN: yes (create or replace / drop trigger if exists / the index
--   only if missing and only when there are no duplicates).
-- RUN: docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--        < supabase/migrations/20261208_50_l18_confirmed_phone_unique.sql
--   Expect: NOTICE  l18_confirmed_phone_unique: the unique index … (created / already there)
--           — or NOTICE … N number(s) are confirmed on more than one account …
--           NOTICE  l18_confirmed_phone_unique verify: OK …   and a row with `t`.
-- ROLLBACK:
--   drop index if exists public.profiles_confirmed_phone_unique;
--   drop trigger if exists trg_phone_verified_unique on public.profiles;
--   drop function if exists public.confirmed_phone_guard();
--   drop function if exists public.confirmed_phone_taken(uuid, text);
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.profiles') is null then
    raise exception '20261208_50: public.profiles is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_verified_at') then
    raise exception '20261208_50: profiles.phone_verified_at is missing (run 20261205_10_phone_otp.sql first)';
  end if;
end
$pre$;

-- ── 1. is this number confirmed on another account? ─────────────────────────
create or replace function public.confirmed_phone_taken(p_user uuid, p_phone text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v text := pg_catalog.btrim(coalesce(p_phone, ''));
begin
  if v = '' then
    return false;
  end if;
  -- fold the three spellings to +9665XXXXXXXX, then compare all three
  if v ~ '^9665[0-9]{8}$' then
    v := '+' || v;
  elsif v ~ '^05[0-9]{8}$' then
    v := '+966' || pg_catalog.substr(v, 2);
  end if;
  if v !~ '^\+9665[0-9]{8}$' then
    return exists (select 1 from public.profiles p
                    where p.phone_verified_at is not null and p.id is distinct from p_user and p.phone = v);
  end if;
  return exists (select 1 from public.profiles p
                  where p.phone_verified_at is not null and p.id is distinct from p_user
                    and p.phone in (v, pg_catalog.substr(v, 2), '0' || pg_catalog.substr(v, 5)));
end
$fn$;

comment on function public.confirmed_phone_taken(uuid, text) is
  '20261208_50 (owner ٢٣٥): another account already has this mobile CONFIRMED (profiles.phone + phone_verified_at; +9665… / 9665… / 05… compared alike). Used by trg_phone_verified_unique. service_role only.';

-- ── 2. the guard ────────────────────────────────────────────────────────────
create or replace function public.confirmed_phone_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.phone_verified_at is null or coalesce(pg_catalog.btrim(new.phone), '') = '' then
    return new;
  end if;
  -- Only a row that BECOMES confirmed: a confirmed row re-saved with the same
  -- number (a name change, a stamp refresh) is not a new confirmation.
  if tg_op = 'UPDATE' and old.phone_verified_at is not null and new.phone is not distinct from old.phone then
    return new;
  end if;
  -- one lock per number whatever its spelling (the last 9 digits: 5XXXXXXXX)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('confirmed_phone:' || pg_catalog.right(pg_catalog.btrim(new.phone), 9), 0));
  if public.confirmed_phone_taken(new.id, new.phone) then
    raise exception 'confirmed_phone_taken: another account already has this mobile number confirmed'
      using errcode = '23505', constraint = 'confirmed_phone_unique';
  end if;
  return new;
end
$fn$;

comment on function public.confirmed_phone_guard() is
  '20261208_50 (owner ٢٣٥): BEFORE INSERT OR UPDATE OF phone, phone_verified_at on profiles (trg_phone_verified_unique) — refuses (23505 confirmed_phone_taken) a row that becomes confirmed with a number another account already has confirmed.';

do $g$
declare
  f text;
begin
  foreach f in array array['public.confirmed_phone_taken(uuid, text)', 'public.confirmed_phone_guard()'] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end
$g$;

-- trg_phone_verified_guard < trg_phone_verified_unique: the guard clears a
-- changed number's confirmation first (see PURPOSE 2).
drop trigger if exists trg_phone_verified_unique on public.profiles;
create trigger trg_phone_verified_unique
  before insert or update of phone, phone_verified_at on public.profiles
  for each row execute function public.confirmed_phone_guard();

-- ── 3. the unique index, only when nobody shares a confirmed number ────────
do $idx$
declare
  v_shared integer;
begin
  if to_regclass('public.profiles_confirmed_phone_unique') is not null then
    raise notice 'l18_confirmed_phone_unique: the unique index profiles_confirmed_phone_unique is already there';
    -- l18 review: 20261208_20's plain index on the same column and predicate is redundant now
    drop index if exists public.profiles_confirmed_phone_idx;
    return;
  end if;
  select pg_catalog.count(*)::integer into v_shared
    from (select p.phone from public.profiles p
           where p.phone_verified_at is not null and p.phone is not null
           group by p.phone having pg_catalog.count(*) > 1) d;
  if v_shared > 0 then
    raise notice 'l18_confirmed_phone_unique: % number(s) are confirmed on more than one account under the same stored spelling — the unique index was NOT created. Run supabase/migrations/20261208_51_duplicate_phones_report.sql (read only): its rows with blocks_unique_index = true are exactly these; it also lists numbers shared under another spelling (+9665… / 9665… / 05…) or by an unconfirmed account, which do not block the index but share a number all the same. Clean up by hand (never an admin / super_admin / staff account), then re-run this file. New confirmations are already refused by trg_phone_verified_unique.', v_shared;
    return;
  end if;
  begin
    create unique index profiles_confirmed_phone_unique
      on public.profiles (phone) where phone_verified_at is not null;
    -- l18 review: 20261208_20's plain index on the same column and predicate is redundant now
    drop index if exists public.profiles_confirmed_phone_idx;
    raise notice 'l18_confirmed_phone_unique: the unique index profiles_confirmed_phone_unique was created (no shared confirmed number); the plain profiles_confirmed_phone_idx was dropped';
  exception when unique_violation then
    raise notice 'l18_confirmed_phone_unique: a shared confirmed number appeared while the index was built — NOT created. Run 20261208_51, clean up, re-run this file.';
  end;
end
$idx$;

-- ── 4. verify ───────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  f text;
  r text;
begin
  foreach f in array array['public.confirmed_phone_taken(uuid, text)', 'public.confirmed_phone_guard()'] loop
    if to_regprocedure(f) is null then
      missing := missing || pg_catalog.format(' %s is missing;', f);
      continue;
    end if;
    if not exists (select 1 from pg_catalog.pg_proc where oid = to_regprocedure(f) and prosecdef and proconfig @> array['search_path=""']) then
      missing := missing || pg_catalog.format(' %s is not SECURITY DEFINER with an empty search_path;', f);
    end if;
    if has_function_privilege('public', f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' PUBLIC may execute %s;', f);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, f, 'EXECUTE') then
        missing := missing || pg_catalog.format(' %s may execute %s;', r, f);
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_catalog.pg_trigger t
                  where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'trg_phone_verified_unique'
                    and not t.tgisinternal and t.tgenabled <> 'D'
                    and t.tgfoid = to_regprocedure('public.confirmed_phone_guard()')) then
    missing := missing || ' profiles has no enabled trg_phone_verified_unique;';
  end if;
  if missing <> '' then
    raise exception 'l18_confirmed_phone_unique verify FAILED:%', missing;
  end if;
  raise notice 'l18_confirmed_phone_unique verify: OK — a second confirmation of the same mobile is refused (trg_phone_verified_unique, 23505 confirmed_phone_taken); unique index present: %',
    to_regclass('public.profiles_confirmed_phone_unique') is not null;
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261208_50 l18 confirmed phone unique' as migration, true as ok;
