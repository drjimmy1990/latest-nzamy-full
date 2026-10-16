-- =============================================================================
-- Migration: 20261017_10_profiles_national_address.sql
-- =============================================================================
-- PURPOSE
--   Owner decisions ٥٦ / ٥٧ (answers of 2026-10-06): «الجنسية للمحامي والفرد،
--   والمدينة تكفي لعنوان العميل الفرد مع إتاحة إضافة العنوان الوطني اختيارياً
--   للفواتير».
--     * nationality for lawyers and individuals — already built:
--       profiles.nationality (20260906), self-editable (20261016_02), shown on
--       the settings tab for those two account types only;
--     * a city is enough for an individual's address — already the case:
--       profiles.city, no free-text address is collected;
--     * an OPTIONAL national address for invoices — this file: a nullable
--       profiles.national_address the account holder may fill or clear.
--
-- WHY A profiles COLUMN (not metadata, not a new table)
--   * metadata is server-write-only since 20261016_02 (owner decision ٢٩), and
--     an individual has no entity table whose settings bag could hold it.
--   * A national address is personal data. public.profiles is readable only by
--     its owner ("users read own profile") and by admins ("admins read all
--     profiles", is_admin()) — checked against the live schema of 2026-10-10
--     and every migration since; anon holds no SELECT since 20261016_09. Server
--     routes that read OTHER users' profiles select narrow column lists
--     (business/members, lawyer clients, …); the two wide reads are admin-only
--     (admin/users/[id], admin/teams). So the column is seen by the person and
--     the platform admin only.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. add column public.profiles.national_address text (nullable);
--   2. CHECK profiles_national_address_length: NULL, or 1–300 characters after
--      trimming (the app stores a blank as NULL);
--   3. GRANT UPDATE (national_address) to authenticated — a COLUMN grant, so
--      the 20261016_02 lock stays exactly as it is for every other column;
--   4. verify (RAISES, the transaction rolls back) — see the block;
--   5. notify pgrst to reload its schema cache.
--
-- PREREQUISITE
--   20261016_02_profiles_members_write_lock.sql (live since 2026-10-16). The
--   verify refuses to pass while authenticated still holds table-level UPDATE.
--
-- ⚠ RE-RUN HAZARD (proved in Docker, see the test file)
--   Re-running 20261016_02 AFTER this file revokes UPDATE on the whole table,
--   which also removes this column grant (a table-level REVOKE takes the
--   column privileges with it), and its own verify still passes (it checks its
--   11 columns). The settings save of anyone who fills the national address
--   would then fail with 42501. If 20261016_02 is ever re-run, re-run this file
--   right after it. _verify.sql's 20261017_10 section catches the gap.
--
-- DEPLOY ORDER — MIGRATION FIRST, then the code that sends national_address
--   (PATCH /api/v1/profile + the settings field). Code first would make the
--   save fail with 42703 for an individual who fills the new field (the form
--   sends changed fields only, so nobody else is affected).
--
-- ROLLBACK
--   begin;
--     revoke update (national_address) on public.profiles from authenticated;
--     alter table public.profiles drop constraint if exists profiles_national_address_length;
--     alter table public.profiles drop column if exists national_address;
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 1. the column ────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists national_address text;

-- ── 2. its shape ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass
                    and conname = 'profiles_national_address_length') then
    alter table public.profiles
      add constraint profiles_national_address_length
      check (national_address is null or char_length(btrim(national_address)) between 1 and 300);
  end if;
end $$;

comment on column public.profiles.national_address is
  'Optional national address for invoices (owner decisions 56/57, 20261017_10). Self-editable through PATCH /api/v1/profile; readable by the owner and admins only. NULL = not given.';

-- ── 3. the account holder may write it ───────────────────────────────────────
grant update (national_address) on public.profiles to authenticated;

-- ── 4. verify ────────────────────────────────────────────────────────────────
do $$
declare
  editable text[] := array[
    'display_name', 'display_name_en', 'phone', 'avatar_url', 'language',
    'calendar_type', 'theme', 'country_code', 'city', 'onboarding_completed', 'nationality',
    'national_address'];
  a       record;
  missing text := '';
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.profiles'::regclass and attname = 'national_address'
                    and not attisdropped) then
    missing := missing || ' public.profiles.national_address is missing;';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass
                    and conname = 'profiles_national_address_length' and convalidated) then
    missing := missing || ' constraint profiles_national_address_length is missing or not validated;';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    missing := missing || ' authenticated holds table-level UPDATE on public.profiles — run 20261016_02 first;';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'national_address', 'UPDATE') then
    missing := missing || ' authenticated cannot UPDATE public.profiles.national_address;';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'national_address', 'UPDATE')
     or has_column_privilege('anon', 'public.profiles', 'national_address', 'INSERT') then
    missing := missing || ' anon can write public.profiles.national_address;';
  end if;
  -- The 20261016_02 shape, plus this one column — nothing else became writable.
  for a in
    select att.attname::text as name
      from pg_attribute att
     where att.attrelid = 'public.profiles'::regclass and att.attnum > 0 and not att.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.profiles', a.name, 'UPDATE')
       and not (a.name = any (editable)) then
      missing := missing || format(' authenticated can UPDATE public.profiles.%s;', a.name);
    end if;
  end loop;
  -- Who can read it: the owner and admins only — no profiles policy reaches anon / PUBLIC.
  if exists (select 1 from pg_policy
              where polrelid = 'public.profiles'::regclass
                and polcmd in ('r', '*')
                and (polroles = '{0}'::oid[] or 'anon'::regrole::oid = any (polroles))) then
    missing := missing || ' a SELECT policy on public.profiles reaches anon or PUBLIC;';
  end if;
  if not has_column_privilege('service_role', 'public.profiles', 'national_address', 'UPDATE') then
    missing := missing || ' service_role cannot write public.profiles.national_address;';
  end if;

  if missing <> '' then
    raise exception '20261017_10 verify:%', missing;
  end if;
  raise notice '20261017_10 verify: OK — profiles.national_address (optional, ≤300) is self-editable; the 20261016_02 lock is otherwise unchanged';
end $$;

commit;

notify pgrst, 'reload schema';
