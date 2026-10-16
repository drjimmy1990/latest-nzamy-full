-- =============================================================================
-- Migration: 20261016_11_provider_profiles_guest_read_revoke.sql   (N2 follow-up)
-- =============================================================================
-- PURPOSE
--   provider_profiles has the same REST hole that 20261016_10 (N2) closed on
--   lawyer_profiles. "public read verified providers" (USING
--   verification_status = 'verified' AND marketplace_visible) is a ROW policy
--   with no TO clause, and the self-host restore left table-level SELECT with
--   anon and authenticated. So anyone with the public anon key, and every
--   signed-in account, reads EVERY column of a listed provider through
--   PostgREST: license_number, license_expiry, hourly_rate, sub_role,
--   service_areas, availability and metadata — whose `settings` bag holds what
--   the provider types in Settings → «الملف الشخصي» (licence number, licence
--   expiry, years of experience, bio; profileSettingsFields.ts, `provider`).
--   Checked live 2026-10-16 with the anon key:
--     GET /rest/v1/provider_profiles?select=user_id,verification_status  → 200
--
-- WHY A REVOKE AND NOT N2's COLUMN LOCK
--   Nothing about a provider is public (grep of the whole repo, 2026-10-16;
--   the gitnexus index is broken this week, so impact was checked by grep):
--     * no page or route lists providers (no directory; the marketplace is
--       parked by BETA_MONOPOLY_MODE);
--     * src/ reads provider_profiles in three places only:
--         - api/v1/admin/verifications (GET) and …/[id] (PATCH): service role;
--         - api/v1/profile GET (`select("*")`) and PATCH (entitySettings:
--           `select("metadata")`, then `update({ metadata }).select("metadata")`):
--           the session, ONLY the caller's own row (`.eq("user_id", user.id)`);
--       onboarding/account-type inserts the row with the service role;
--     * outside src/, scripts/seed-clean-test-accounts.mjs reads it with
--       SUPABASE_SERVICE_ROLE_KEY (unaffected); no edge function or workflow
--       export in the repo names it;
--     * no policy on another table, and no view, reads provider_profiles (dump
--       2026-10-10 + every later migration); the only function that touches it
--       is handle_new_user, SECURITY DEFINER.
--   So the guest read has no reader. This file drops it instead of choosing
--   "public" columns nobody shows. What stays:
--     * "providers read own profile" (user_id = auth.uid()) — the profile
--       route's own-row reads keep working on the session, so NO code change
--       and no deploy order: a provider may read every column of the own row;
--     * "admins read all provider profiles" (is_admin(), TO authenticated after
--       20261016_09) — the admin console.
--   A provider directory, if one is ever built, must read through a Next route
--   with the service role and return chosen fields (like api/v1/lawyers), not
--   re-create this policy.
--
-- WHAT IT DOES (idempotent; one transaction)
--   0. Guards (raise, nothing changed): 20260922_03's provider part is in force;
--      no policy on another table and no view reads provider_profiles (either
--      would break for guests or keep leaking once this runs).
--   1. DROP POLICY "public read verified providers".
--   2. REVOKE ALL from anon and PUBLIC — guests have no row to read, so they
--      need no privilege at all.
--   3. authenticated: REVOKE DELETE / TRUNCATE / REFERENCES / TRIGGER only
--      (handed out by the restore's GRANT ALL, used by no API path; there is no
--      DELETE policy). NOT SELECT — the own-row reads above need it — and NOT
--      UPDATE: a table-level REVOKE UPDATE would also drop 20260922_03's column
--      grants (metadata, updated_at) and providers could not save settings.
--   4. Marker comment on provider_profiles.license_number (read by _verify.sql;
--      20260922_03 rewrites the TABLE comment on a re-run, not this one).
--   5. Verify block (raises → rolls back): the policy is gone and the only
--      SELECT/ALL policies that reach the API roles are the own-row and admin
--      ones; anon holds nothing; authenticated keeps table-level SELECT and
--      UPDATE on exactly (metadata, updated_at); service_role keeps everything;
--      then a LIVE PROBE as anon over every readable table and view in
--      `public` that fails on "permission denied for table provider_profiles"
--      (skipped with a NOTICE if SET ROLE is refused).
--
-- PREREQUISITE
--   20260922_03 in force (Step 0 of the 2026-10-16 batch) — refused below.
--   Independent of 20261016_09 and 20261016_10; runs before or after either.
--
-- DEPLOY ORDER — ANY TIME. The code that is live today works with or without it.
--
-- ROLLBACK (re-opens every column of a listed provider to the anon key):
--   create policy "public read verified providers" on public.provider_profiles
--     for select using (verification_status = 'verified' and marketplace_visible = true);
--   grant select on public.provider_profiles to anon;
-- =============================================================================

begin;

-- ── 0. Guards ────────────────────────────────────────────────────────────────
do $$
declare
  readers text;
begin
  if has_table_privilege('authenticated', 'public.provider_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.provider_profiles', 'INSERT') then
    raise exception '20261016_11: provider_profiles still has table-level INSERT/UPDATE for authenticated — run 20260922_03_lawyer_provider_column_grants.sql first (Step 0 of the 2026-10-16 batch)';
  end if;

  -- Policies on OTHER tables that read provider_profiles inline, and views over
  -- it. pg_depend records every relation a policy expression or a view query
  -- references.
  select string_agg(distinct format('policy %s on %s', p.polname, p.polrelid::regclass), '; ')
    into readers
    from pg_policy p
    join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = p.oid
                    and d.refclassid = 'pg_class'::regclass
                    and d.refobjid = 'public.provider_profiles'::regclass
   where p.polrelid <> 'public.provider_profiles'::regclass;
  if readers is not null then
    raise exception '20261016_11: these read public.provider_profiles inline, and this file assumes nothing does (guests would get 42501 on their table, signed-in users would lose rows) — send the names before running it: %', readers;
  end if;

  select string_agg(distinct format('view %s', r.ev_class::regclass), '; ')
    into readers
    from pg_rewrite r
    join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
                    and d.refclassid = 'pg_class'::regclass
                    and d.refobjid = 'public.provider_profiles'::regclass
   where r.ev_class <> 'public.provider_profiles'::regclass;
  if readers is not null then
    raise exception '20261016_11: these views read public.provider_profiles, and this file assumes none does (an invoker view would fail for guests, a definer view would keep leaking) — send the names before running it: %', readers;
  end if;
end $$;

-- ── 1. No guest read ─────────────────────────────────────────────────────────
drop policy if exists "public read verified providers" on public.provider_profiles;

-- ── 2. Guests hold nothing ───────────────────────────────────────────────────
revoke all on public.provider_profiles from anon, public;

-- ── 3. Signed-in users: own row (SELECT) and the 20260922_03 UPDATE list only ─
revoke delete, truncate, references, trigger on public.provider_profiles from authenticated;
grant all on public.provider_profiles to service_role;

-- ── 4. Marker ────────────────────────────────────────────────────────────────
comment on column public.provider_profiles.license_number is
  'Private since 20261016_11: no guest read of provider_profiles (anon holds no privilege; "public read verified providers" dropped). A provider reads the own row ("providers read own profile"), an admin reads all; a public provider list must go through a Next route with the service role.';

-- ── 5. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  -- 20260922_03's provider list. Keep in step with that file and with the
  -- copies in _verify.sql.
  update_cols  text[] := array['metadata', 'updated_at'];
  -- The SELECT/ALL policies that may reach anon/authenticated. Both names
  -- survive 20261016_09, which re-creates the admin one TO authenticated.
  select_pols  text[] := array['providers read own profile', 'admins read all provider profiles'];
  priv       text;
  a          record;
  t          record;
  offenders  text;
  can_probe  boolean;
  missing    text := '';
  probe_fail text := '';
begin
  -- The guest-read policy is gone, and nothing else hands rows to the API roles.
  select string_agg(format('%s (%s)', p.polname, pg_get_expr(p.polqual, p.polrelid)), '; ')
    into offenders
    from pg_policy p
   where p.polrelid = 'public.provider_profiles'::regclass
     and p.polcmd in ('r', '*')
     and (p.polroles = '{0}'::oid[]
          or 'anon'::regrole::oid = any (p.polroles)
          or 'authenticated'::regrole::oid = any (p.polroles))
     and not (p.polname = any (select_pols));
  if offenders is not null then
    missing := missing || format(' SELECT policies on provider_profiles that reach the API roles besides the own-row and admin ones: %s;', offenders);
  end if;
  if exists (select 1 from pg_policy p
              where p.polrelid = 'public.provider_profiles'::regclass
                and p.polname = 'providers read own profile'
                and pg_get_expr(p.polqual, p.polrelid) <> '(user_id = auth.uid())') then
    missing := missing || ' "providers read own profile" is no longer (user_id = auth.uid());';
  end if;

  -- anon (and PUBLIC, which has_*_privilege folds into anon) holds nothing.
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('anon', 'public.provider_profiles', priv) then
      missing := missing || format(' anon holds table-level %s on provider_profiles;', priv);
    end if;
  end loop;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
    if has_any_column_privilege('anon', 'public.provider_profiles', priv) then
      missing := missing || format(' anon holds column-level %s on provider_profiles;', priv);
    end if;
  end loop;

  -- authenticated: table-level SELECT (own-row reads), no other table-level
  -- privilege, UPDATE on exactly the 20260922_03 list.
  if not has_table_privilege('authenticated', 'public.provider_profiles', 'SELECT') then
    missing := missing || ' authenticated lost SELECT on provider_profiles (GET /api/v1/profile and the settings save read the own row with the session);';
  end if;
  foreach priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('authenticated', 'public.provider_profiles', priv) then
      missing := missing || format(' authenticated holds table-level %s on provider_profiles;', priv);
    end if;
  end loop;
  for a in
    select att.attname::text as name from pg_attribute att
     where att.attrelid = 'public.provider_profiles'::regclass and att.attnum > 0 and not att.attisdropped
  loop
    if (a.name = any (update_cols)) <> has_column_privilege('authenticated', 'public.provider_profiles', a.name, 'UPDATE') then
      missing := missing || format(' authenticated UPDATE on provider_profiles.%s is %s, expected %s;', a.name,
        has_column_privilege('authenticated', 'public.provider_profiles', a.name, 'UPDATE'), a.name = any (update_cols));
    end if;
  end loop;

  if not has_table_privilege('service_role', 'public.provider_profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.provider_profiles', 'UPDATE')
     or not has_table_privilege('service_role', 'public.provider_profiles', 'INSERT') then
    missing := missing || ' service_role lost read/write on provider_profiles (the admin verification queue and onboarding would fail);';
  end if;
  if coalesce(col_description('public.provider_profiles'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.provider_profiles'::regclass and attname = 'license_number')), '')
       not ilike '%private since 20261016_11%' then
    missing := missing || ' the marker comment on provider_profiles.license_number is missing;';
  end if;

  if missing <> '' then
    raise exception '20261016_11 verify:%', missing;
  end if;

  -- Live probe as anon: every readable table and view in `public`. Only
  -- "permission denied for table provider_profiles" is this file's doing;
  -- anything else is reported and left alone. authenticated keeps SELECT, so
  -- nothing can newly fail with 42501 for it.
  can_probe := true;
  begin
    execute 'set local role anon';
  exception when insufficient_privilege then
    can_probe := false;
  end;
  if not can_probe then
    raise notice '20261016_11: this session cannot SET ROLE anon — the live probe was skipped (the catalog checks above passed)';
  else
    execute 'set local statement_timeout = ''5s''';
    for t in
      select c.oid::regclass as rel
        from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind in ('r', 'p', 'v')
         and has_any_column_privilege('anon', c.oid, 'SELECT')
       order by 1
    loop
      begin
        execute format('select 1 from %s limit 1', t.rel);
      exception
        when insufficient_privilege then
          if sqlerrm ilike '%table provider_profiles%' then
            probe_fail := probe_fail || format(' %s (%s);', t.rel, sqlerrm);
          else
            raise notice '20261016_11: anon read of % already fails for another reason (%) — not caused by this file', t.rel, sqlerrm;
          end if;
        when query_canceled then
          raise notice '20261016_11: anon probe of % timed out (5 s) — skipped', t.rel;
        when others then
          raise notice '20261016_11: anon read of % fails for another reason (% %) — not caused by this file', t.rel, sqlstate, sqlerrm;
      end;
    end loop;
    execute 'reset statement_timeout';
    execute 'reset role';
  end if;
  if probe_fail <> '' then
    raise exception '20261016_11 verify: a guest read fails now that anon holds nothing on provider_profiles:%', probe_fail;
  end if;

  raise notice '20261016_11 verify: OK — no guest read of provider_profiles (policy dropped, anon holds nothing); a provider reads the own row, an admin reads all; authenticated UPDATE stays (metadata, updated_at); service_role reads everything';
end $$;

commit;

notify pgrst, 'reload schema';
