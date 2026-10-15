-- =============================================================================
-- Migration: 20261016_02_profiles_members_write_lock.sql
-- =============================================================================
-- PURPOSE
--   Owner decisions ٢٩ and ٣٠ (confirmed in the answers of 2026-10-06, section
--   د: «مُؤكَّد؛ ترحيل أمني إلزامي لمنع التلاعب في البريد وحالة التوثيق أو الحذف
--   العشوائي لسجلات الشركات»).
--
--   ٢٩ — public.profiles: on production (schema dump 2026-10-10) the API roles
--   hold `GRANT ALL` and the policy "users update own profile" has no column
--   guard, so a signed-in user can PATCH their own row through PostgREST and set
--   any column:
--       PATCH {SUPABASE_URL}/rest/v1/profiles?id=eq.<me>
--         {"email":"colleague@firm.sa","verified_at":"2026-01-01","nafath_verified":true}
--   Changing `email` to a colleague's address makes the colleague's invitations
--   land on the attacker's account (review B6); `verified_at` /
--   `nafath_verified` are trust badges; `metadata` is a free jsonb bag other
--   code may read. The owner's default: «تُسحب صلاحية UPDATE على email
--   وverification_status وverified_at وnafath_verified من authenticated، ولا
--   تُعدَّل هذه الأعمدة إلا من مسار خادمي أو من الإدارة».
--   (verification_status lives on the role tables — lawyer_profiles,
--   provider_profiles, firm_profiles … — and is already column-locked there by
--   20260922_03_lawyer_provider_column_grants.sql.)
--
--   ٣٠ — the four entity membership tables: the owner of a firm / company /
--   government entity / NGO can hard-DELETE a membership row through PostgREST
--   (policies "<t>: owner or admin can delete" + GRANT ALL), erasing the
--   membership record and bypassing the API, which removes a member by status
--   change. The owner's default: «تُسحب صلاحية DELETE على جداول *_members من
--   authenticated، وتبقى الإزالة تغييراً في الحالة عبر الـAPI مع سجل تدقيق».
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. public.profiles
--      * revoke INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER from
--        anon, authenticated and PUBLIC (SELECT is left as it is: the RLS read
--        policies decide what a session sees, and anon reads zero rows);
--      * grant UPDATE on exactly the columns PATCH /api/v1/profile writes —
--        src/app/api/v1/profile/route.ts `profileFields`:
--          display_name, display_name_en, phone, avatar_url, language,
--          calendar_type, theme, country_code, city, onboarding_completed,
--          nationality
--        to authenticated. NOT: id, user_type (claimed once through the
--        service role — POST /api/v1/onboarding/account-type; trg_lock_user_type
--        also refuses it), email, verified_at, nafath_verified, metadata,
--        created_at, updated_at (set by the set_profiles_updated_at trigger,
--        which a column privilege does not block).
--      * the policies are unchanged: "users update own profile" still limits
--        the row to the caller's own.
--   2. public.firm_members / business_members / government_members /
--      ngo_members (each only if it exists)
--      * revoke DELETE and TRUNCATE from anon, authenticated and PUBLIC;
--      * drop every DELETE / ALL policy on them that applies to anon,
--        authenticated or PUBLIC (catalogue lookup, not by name) — a later
--        accidental re-grant then still deletes nothing.
--      public.group_members (community groups, members leave on their own) is
--      NOT touched.
--   3. Verify block — RAISES (the transaction rolls back) unless: authenticated
--      can UPDATE exactly the 11 columns and no other; no INSERT / DELETE on
--      profiles for the API roles; authenticated still SELECTs profiles;
--      service_role keeps full access on every table here; no DELETE privilege
--      and no DELETE policy for the API roles on the membership tables.
--   4. notify pgrst to reload its schema cache.
--
-- WHO IS AFFECTED (grep of src/, 2026-10-16)
--   * profiles writes with a session client: only PATCH /api/v1/profile, and it
--     sends only the 11 columns above (an allowlist, see the route). Every
--     other write uses the service role: admin/users/[id], admin/teams,
--     onboarding/account-type; handle_new_user() is SECURITY DEFINER.
--   * membership deletes: none in src/ — firm/members and business/members
--     remove a member by setting its status; admin tools use the service role.
--   No code change is needed for this file.
--
-- DEPLOY ORDER — INDEPENDENT (no code depends on it)
--   Apply by hand in the SQL Editor (as postgres), any time.
--
-- ROLLBACK (re-opens the self-edit of email / verification — owner decision required)
--   begin;
--     grant update on public.profiles to authenticated;
--     grant delete on public.firm_members, public.business_members,
--                     public.government_members, public.ngo_members to authenticated;
--     -- and re-create the four "<t>: owner or admin can delete" policies
--     -- from 20260921_03_entity_rls_recursion_fix.sql.
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 1. public.profiles: column-level UPDATE only ─────────────────────────────
revoke insert, update, delete, truncate, references, trigger
  on public.profiles from anon, authenticated, public;
grant update (
  display_name, display_name_en, phone, avatar_url, language,
  calendar_type, theme, country_code, city, onboarding_completed, nationality
) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Marker (read by _verify.sql).
comment on column public.profiles.email is
  'Copy of the sign-in e-mail. SERVER-WRITE-ONLY since 20261016_02 (owner decision 29): the API roles cannot UPDATE email, verified_at, nafath_verified or metadata; the server routes and admin tools write them with the service role.';

-- ── 2. The entity membership tables: no hard delete for the API roles ────────
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['firm_members', 'business_members', 'government_members', 'ngo_members']
  loop
    if to_regclass('public.' || t) is null then
      raise notice '20261016_02: public.% does not exist here — skipped', t;
      continue;
    end if;
    execute format('revoke delete, truncate on public.%I from anon, authenticated, public', t);
    execute format('grant all on public.%I to service_role', t);
    for p in
      select pol.policyname
        from pg_policies pol
       where pol.schemaname = 'public'
         and pol.tablename = t
         and pol.cmd in ('DELETE', 'ALL')
         and pol.roles && array['anon', 'authenticated', 'public']::name[]
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
      raise notice '20261016_02: dropped policy "%" on public.%', p.policyname, t;
    end loop;
  end loop;
end $$;

-- ── 3. Verify — raises, so a half-applied lock cannot look successful ────────
do $$
declare
  editable text[] := array[
    'display_name', 'display_name_en', 'phone', 'avatar_url', 'language',
    'calendar_type', 'theme', 'country_code', 'city', 'onboarding_completed', 'nationality'];
  r       text;
  t       text;
  a       record;
  missing text := '';
begin
  -- profiles
  foreach r in array array['anon', 'authenticated']
  loop
    if has_table_privilege(r, 'public.profiles', 'INSERT') or has_any_column_privilege(r, 'public.profiles', 'INSERT')
       or has_table_privilege(r, 'public.profiles', 'DELETE') or has_table_privilege(r, 'public.profiles', 'TRUNCATE')
       or has_table_privilege(r, 'public.profiles', 'UPDATE') then
      missing := missing || format(' %s holds INSERT / DELETE / table-level UPDATE on public.profiles;', r);
    end if;
    for a in
      select att.attname::text as name
        from pg_attribute att
       where att.attrelid = 'public.profiles'::regclass
         and att.attnum > 0
         and not att.attisdropped
    loop
      if has_column_privilege(r, 'public.profiles', a.name, 'UPDATE') then
        if r = 'anon' then
          missing := missing || format(' anon can UPDATE public.profiles.%s;', a.name);
        elsif not (a.name = any (editable)) then
          missing := missing || format(' authenticated can UPDATE public.profiles.%s;', a.name);
        end if;
      elsif r = 'authenticated' and a.name = any (editable) then
        missing := missing || format(' authenticated cannot UPDATE public.profiles.%s (PATCH /api/v1/profile would fail);', a.name);
      end if;
    end loop;
  end loop;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    missing := missing || ' authenticated lost SELECT on public.profiles;';
  end if;
  if not has_table_privilege('service_role', 'public.profiles', 'UPDATE')
     or not has_table_privilege('service_role', 'public.profiles', 'INSERT') then
    missing := missing || ' service_role lost write on public.profiles;';
  end if;
  if coalesce(col_description('public.profiles'::regclass,
                (select attnum from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'email')), '')
       not ilike '%server-write-only since 20261016_02%' then
    missing := missing || ' the marker comment on public.profiles.email is missing;';
  end if;

  -- membership tables
  foreach t in array array['firm_members', 'business_members', 'government_members', 'ngo_members']
  loop
    continue when to_regclass('public.' || t) is null;
    foreach r in array array['anon', 'authenticated']
    loop
      if has_table_privilege(r, 'public.' || t, 'DELETE') or has_table_privilege(r, 'public.' || t, 'TRUNCATE') then
        missing := missing || format(' %s can DELETE public.%s;', r, t);
      end if;
    end loop;
    if exists (select 1 from pg_policies pol
                where pol.schemaname = 'public' and pol.tablename = t
                  and pol.cmd in ('DELETE', 'ALL')
                  and pol.roles && array['anon', 'authenticated', 'public']::name[]) then
      missing := missing || format(' a DELETE policy for the API roles survives on public.%s;', t);
    end if;
    if not has_table_privilege('service_role', 'public.' || t, 'DELETE') then
      missing := missing || format(' service_role lost DELETE on public.%s;', t);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261016_02 verify:%', missing;
  end if;

  raise notice '20261016_02 verify: OK — authenticated updates 11 profile columns only (not email / verified_at / nafath_verified / metadata / user_type); no API-role hard delete on the entity membership tables';
end $$;

commit;

-- ── 4. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Read-only re-check after applying (SQL Editor):
--   select has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')           as email_editable,    -- false
--          has_column_privilege('authenticated', 'public.profiles', 'nafath_verified', 'UPDATE') as nafath_editable,   -- false
--          has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')    as name_editable,     -- true
--          has_table_privilege('authenticated', 'public.firm_members', 'DELETE')                 as member_deletable;  -- false
