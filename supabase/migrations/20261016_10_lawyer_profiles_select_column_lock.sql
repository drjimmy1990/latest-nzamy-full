-- =============================================================================
-- Migration: 20261016_10_lawyer_profiles_select_column_lock.sql   (plan item N2)
-- =============================================================================
-- PURPOSE
--   "public read verified lawyers" (USING verification_status = 'verified' AND
--   marketplace_visible) is a ROW policy with no TO clause, and the self-host
--   restore left table-level SELECT on lawyer_profiles with anon and
--   authenticated. So anyone with the public anon key reads EVERY column of
--   every listed lawyer through PostgREST — checked live 2026-10-16:
--     GET /rest/v1/lawyer_profiles?select=license_number,credit_balance,…  → 200
--   including license_number and bar_association (published only when the
--   lawyer turns on show_contact), hourly_rate (the owner's Q168 "hide my
--   rate" switch, show_hourly_rate — the API masks it, REST did not),
--   credit_balance / credit_package / credit_expiry / free_briefs_remaining,
--   office_address, bar_membership_number and metadata.
--
-- WHAT IT DOES (idempotent; one transaction)
--   1. REVOKE SELECT — and only SELECT — at table level from anon,
--      authenticated and PUBLIC, then GRANT SELECT back on the public columns.
--      `revoke all` / `revoke update` would ALSO drop the column UPDATE grants
--      of 20260922_03 and 20261016_05 (a table-level REVOKE revokes that
--      privilege's column grants too) and lawyers could no longer save their
--      profile; the verify block below re-asserts that list.
--      The public columns are what the public profile shows to everyone
--      (api/v1/lawyers[/id], lawyers/[slug]) plus the gate columns:
--        user_id, slug, specialties, years_experience, bio_ar, bio_en,
--        headline_ar, education, courts, languages, verification_status,
--        marketplace_visible, is_accepting_clients
--      Why each gate column must stay readable by the API roles:
--        * user_id / verification_status / marketplace_visible / slug — the
--          session-client reads filter on them (community/contributors,
--          community/posts[/id], posts/[id]/answers, reviews GET) and the
--          UPDATEs of PATCH /api/v1/profile and settings/preferences put user_id
--          in WHERE;
--        * two policies on OTHER tables read lawyer_profiles inline, and
--          Postgres checks the caller's column privileges there:
--          "lawyer services public read" on lawyer_services (guests; user_id,
--          verification_status, marketplace_visible) and
--          service_requests_select_policy (everyone; user_id,
--          verification_status). Removing the guest read entirely would turn
--          both into 42501 — so this is a column lock, not a revoke.
--   2. REVOKE DELETE / TRUNCATE / REFERENCES / TRIGGER from the API roles —
--      handed out by the restore's GRANT ALL, used by no API path (there is no
--      DELETE policy; account removal cascades from profiles as the owner).
--   3. Marker comment on lawyer_profiles.license_number (read by _verify.sql;
--      20260922_03 rewrites the TABLE comment on a re-run, not this one).
--   4. Verify block (raises → rolls back): no table-level SELECT for the API
--      roles; each public column readable, no other column readable; the 21
--      self-service UPDATE columns still granted and nothing table-level;
--      no policy that applies to the API roles reads a locked column (pg_depend
--      records every column a policy expression references); service_role
--      keeps everything; then a LIVE PROBE as anon and as authenticated over
--      every readable table in `public` that fails on "permission denied for
--      table lawyer_profiles" (skipped with a NOTICE if SET ROLE is refused).
--
-- CODE THAT GOES WITH IT (same branch)
--   * GET /api/v1/profile reads the lawyer's OWN row with the service role,
--     keyed by the id auth.getUser() verified (readOwnLawyerRow) — the column
--     grant is per role, not per row, so the owner's session cannot read its
--     own private columns any more. PATCH keeps the UPDATE on the session
--     client (the column UPDATE list stays in force), returns `user_id` only,
--     and reads the full row back with the service role. Every screen that
--     shows a lawyer his licence, rate or balance goes through that route.
--   * Every guest-facing read (api/v1/lawyers, lawyers/[id], lawyers/[slug]
--     layout, entitlements, access-control, admin) already uses the service
--     role (grep of src/, 2026-10-16).
--
-- PREREQUISITES
--   * 20260922_03 in force (Step 0 of the 2026-10-16 batch) — refused below.
--   * 20261016_05 (show_hourly_rate) — refused below.
--
-- DEPLOY ORDER — CODE FIRST, THEN THIS FILE
--   The old GET /api/v1/profile does `select("*")` on lawyer_profiles with the
--   session, and the old PATCH `.select()` is RETURNING *: both answer 42501
--   once this file runs, i.e. «تعذّر قراءة بياناتك المهنية» and «تعذّر حفظ» for
--   every lawyer until the new code is live.
--
-- ROLLBACK
--   `grant select on public.lawyer_profiles to anon, authenticated;` — re-opens
--   every column to the anon key.
-- =============================================================================

begin;

do $$
begin
  if has_table_privilege('authenticated', 'public.lawyer_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.lawyer_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.lawyer_profiles', 'UPDATE') then
    raise exception '20261016_10: lawyer_profiles still has table-level INSERT/UPDATE for the API roles — run 20260922_03_lawyer_provider_column_grants.sql first (Step 0 of the 2026-10-16 batch), then 20261016_05';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lawyer_profiles'
                    and column_name = 'show_hourly_rate') then
    raise exception '20261016_10: lawyer_profiles.show_hourly_rate is missing — run 20261016_05_lawyer_show_hourly_rate.sql first';
  end if;
end $$;

-- ── 1. SELECT: public columns only ───────────────────────────────────────────
revoke select on public.lawyer_profiles from anon, authenticated, public;
grant select (
  user_id,
  slug,
  specialties,
  years_experience,
  bio_ar,
  bio_en,
  headline_ar,
  education,
  courts,
  languages,
  verification_status,
  marketplace_visible,
  is_accepting_clients
) on public.lawyer_profiles to anon, authenticated;

-- ── 2. Nothing else the restore's GRANT ALL handed out ───────────────────────
revoke delete, truncate, references, trigger on public.lawyer_profiles from anon, authenticated, public;
grant all on public.lawyer_profiles to service_role;

-- ── 3. Marker ────────────────────────────────────────────────────────────────
comment on column public.lawyer_profiles.license_number is
  'Private since 20261016_10 (N2): anon/authenticated SELECT only the public columns of lawyer_profiles; the licence, rate, credit and contact columns are read by the Next routes with the service role (GET /api/v1/profile for the lawyer''s own row).';

-- ── 4. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  public_cols text[] := array[
    'user_id', 'slug', 'specialties', 'years_experience', 'bio_ar', 'bio_en',
    'headline_ar', 'education', 'courts', 'languages', 'verification_status',
    'marketplace_visible', 'is_accepting_clients'];
  -- 20260922_03's list + 20261016_05's show_hourly_rate. Keep in step with
  -- both files and with the copy in _verify.sql.
  update_cols text[] := array[
    'bio_ar', 'bio_en', 'specialties', 'years_experience', 'hourly_rate',
    'license_number', 'bar_association', 'city', 'marketplace_visible',
    'is_accepting_clients', 'show_contact', 'slug', 'education', 'courts',
    'languages', 'headline_ar', 'license_issued_on', 'office_address',
    'display_mode', 'updated_at', 'show_hourly_rate'];
  r          text;
  col        text;
  a          record;
  t          record;
  leaks      text;
  can_probe  boolean;
  missing    text := '';
  probe_fail text := '';
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.lawyer_profiles', 'SELECT') then
      missing := missing || format(' %s holds table-level SELECT on lawyer_profiles;', r);
    end if;
    foreach col in array public_cols loop
      if not has_column_privilege(r, 'public.lawyer_profiles', col, 'SELECT') then
        missing := missing || format(' %s cannot read public column lawyer_profiles.%s;', r, col);
      end if;
    end loop;
    for a in
      select att.attname::text as name from pg_attribute att
       where att.attrelid = 'public.lawyer_profiles'::regclass and att.attnum > 0 and not att.attisdropped
    loop
      if not (a.name = any (public_cols)) and has_column_privilege(r, 'public.lawyer_profiles', a.name, 'SELECT') then
        missing := missing || format(' %s can read locked column lawyer_profiles.%s;', r, a.name);
      end if;
    end loop;
    if has_table_privilege(r, 'public.lawyer_profiles', 'DELETE')
       or has_table_privilege(r, 'public.lawyer_profiles', 'TRUNCATE')
       or has_table_privilege(r, 'public.lawyer_profiles', 'INSERT')
       or has_table_privilege(r, 'public.lawyer_profiles', 'UPDATE') then
      missing := missing || format(' %s holds table-level DELETE/TRUNCATE/INSERT/UPDATE on lawyer_profiles;', r);
    end if;
  end loop;

  -- The self-service write list survived the SELECT revoke.
  foreach col in array update_cols loop
    if not has_column_privilege('authenticated', 'public.lawyer_profiles', col, 'UPDATE') then
      missing := missing || format(' authenticated lost UPDATE on lawyer_profiles.%s (lawyers could not save their profile);', col);
    end if;
  end loop;
  for a in
    select att.attname::text as name from pg_attribute att
     where att.attrelid = 'public.lawyer_profiles'::regclass and att.attnum > 0 and not att.attisdropped
  loop
    if not (a.name = any (update_cols)) and has_column_privilege('authenticated', 'public.lawyer_profiles', a.name, 'UPDATE') then
      missing := missing || format(' authenticated can UPDATE lawyer_profiles.%s;', a.name);
    end if;
    if has_column_privilege('anon', 'public.lawyer_profiles', a.name, 'UPDATE') then
      missing := missing || format(' anon can UPDATE lawyer_profiles.%s;', a.name);
    end if;
  end loop;

  -- No policy that reaches the API roles reads a locked column: every query of
  -- its table would answer 42501 for them.
  select string_agg(distinct format('%s on %s (lawyer_profiles.%s)', p.polname, p.polrelid::regclass, att.attname), '; ')
    into leaks
    from pg_policy p
    join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = p.oid
                    and d.refclassid = 'pg_class'::regclass
                    and d.refobjid = 'public.lawyer_profiles'::regclass and d.refobjsubid > 0
    join pg_attribute att on att.attrelid = d.refobjid and att.attnum = d.refobjsubid
   where (p.polroles = '{0}'::oid[]
          or 'anon'::regrole::oid = any (p.polroles)
          or 'authenticated'::regrole::oid = any (p.polroles))
     and not (att.attname::text = any (public_cols));
  if leaks is not null then
    missing := missing || format(' policies read a locked lawyer_profiles column and would fail with 42501: %s;', leaks);
  end if;

  if not has_table_privilege('service_role', 'public.lawyer_profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.lawyer_profiles', 'UPDATE')
     or not has_table_privilege('service_role', 'public.lawyer_profiles', 'INSERT') then
    missing := missing || ' service_role lost read/write on lawyer_profiles (the directory and the profile route would fail);';
  end if;
  if coalesce(col_description('public.lawyer_profiles'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.lawyer_profiles'::regclass and attname = 'license_number')), '')
       not ilike '%private since 20261016_10%' then
    missing := missing || ' the marker comment on lawyer_profiles.license_number is missing;';
  end if;

  if missing <> '' then
    raise exception '20261016_10 verify:%', missing;
  end if;

  -- Live probe: as anon and as authenticated, every readable table and view in
  -- `public`. Only "permission denied for table lawyer_profiles" is this
  -- file's doing; anything else is reported and left alone.
  foreach r in array array['anon', 'authenticated'] loop
    can_probe := true;
    begin
      execute format('set local role %I', r);
    exception when insufficient_privilege then
      can_probe := false;
    end;
    if not can_probe then
      raise notice '20261016_10: this session cannot SET ROLE % — the live probe for that role was skipped (the catalog checks above passed)', r;
      continue;
    end if;
    execute 'set local statement_timeout = ''5s''';
    for t in
      select c.oid::regclass as rel
        from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind in ('r', 'p', 'v')
         and has_any_column_privilege(r, c.oid, 'SELECT')
       order by 1
    loop
      begin
        execute format('select 1 from %s limit 1', t.rel);
      exception
        when insufficient_privilege then
          if sqlerrm ilike '%table lawyer_profiles%' then
            probe_fail := probe_fail || format(' %s as %s (%s);', t.rel, r, sqlerrm);
          else
            raise notice '20261016_10: % read of % already fails for another reason (%) — not caused by this file', r, t.rel, sqlerrm;
          end if;
        when query_canceled then
          raise notice '20261016_10: % probe of % timed out (5 s) — skipped', r, t.rel;
        when others then
          raise notice '20261016_10: % read of % fails for another reason (% %) — not caused by this file', r, t.rel, sqlstate, sqlerrm;
      end;
    end loop;
    execute 'reset statement_timeout';
    execute 'reset role';
  end loop;
  if probe_fail <> '' then
    raise exception '20261016_10 verify: a read fails on the locked lawyer_profiles columns:%', probe_fail;
  end if;

  raise notice '20261016_10 verify: OK — anon/authenticated read 13 public lawyer_profiles columns only; the 21 self-service UPDATE columns intact; no policy reads a locked column; service_role reads everything';
end $$;

commit;

notify pgrst, 'reload schema';
