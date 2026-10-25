-- =============================================================================
-- Migration: 20261025_50_profile_visibility.sql
-- Plan: docs/plans/2026-10-25-owner-free-phases-plan.md, P6 item N3.8.
-- Owner intent: package 2026-10-22 §٤٣ directive ١ and §٤٥ axis ٣ («حوكمة ظهور
-- ملف المحامي» — the lawyer decides which sections of his public profile a
-- visitor sees).
-- =============================================================================
--
-- WHAT CHANGES (idempotent; one transaction)
--   1. Three switches on public.lawyer_profiles, boolean NOT NULL DEFAULT true
--      — every lawyer keeps today's profile until he turns one off:
--        show_services   «الخدمات» (his lawyer_services price list)
--        show_education  «المؤهلات العلمية» (lawyer_profiles.education)
--        show_courts     «المحاكم التي يترافع أمامها» (lawyer_profiles.courts)
--   2. authenticated may UPDATE the three columns (column grants, next to the
--      20260922_03 / 20261016_05 list). PATCH /api/v1/profile allowlists them
--      for the lawyer's own row; the row policy "lawyers update own profile"
--      is unchanged. anon gets nothing.
--   3. NO SELECT grant to anon/authenticated: like show_contact and
--      show_hourly_rate, the switches are read by the Next routes with the
--      service role (GET /api/v1/profile for the lawyer, GET /api/v1/lawyers/[id]
--      for the public profile). 20261016_10's SELECT column lock is NARROWED by
--      item 4 (education, courts).
--   4. The raw data behind the switches is protected too, or a switch would
--      only be a promise of the platform's own pages:
--        * REVOKE SELECT (education, courts) from anon and authenticated —
--          two of the 13 public columns of 20261016_10. Every reader of them
--          is a Next route on the service role (GET /api/v1/lawyers/[id], the
--          /lawyers/[slug] layout, GET /api/v1/profile); no session-client
--          query names them (grepped 2026-10-25: src/**, both columns).
--          A lawyer still SAVES them: UPDATE needs no SELECT on a SET column,
--          and PATCH /api/v1/profile returns user_id only.
--        * "lawyer services public read" on lawyer_services also requires
--          public.lawyer_shows_services(lawyer_user_id) — SECURITY DEFINER,
--          because Postgres checks the caller's column privileges inside a
--          policy, and show_services is not readable by the API roles (an
--          inline lp.show_services would turn every guest read into 42501).
--          The lawyer's own management list ("lawyer services owner read")
--          is unchanged.
--   5. Verify block — raises (and so rolls back) unless the columns exist as
--      NOT NULL DEFAULT true, authenticated can update them and anon cannot,
--      neither API role can READ them or education / courts, and the services
--      guest policy reads the switch.
--
-- WHAT DOES NOT CHANGE, ON PURPOSE
--   * The licence and bar association keep following show_contact.
--   * Reviews cannot be hidden: they are clients' words about the lawyer, not
--     the lawyer's own content (owner decision on reviews; plan N3.8).
--   * The directory list (/api/v1/lawyers) shows none of the three sections,
--     so it needs no switch.
--
-- WHAT A REST CLIENT WITH THE ANON KEY STILL SEES
--   Nothing of the three sections: education / courts are no longer readable
--   by anon or authenticated at all (switch on or off — the pages read them
--   with the service role), and a lawyer's services are listed to guests only
--   while show_services is on.
--
-- CODE THAT GOES WITH IT (same branch)
--   * GET /api/v1/lawyers/[id] reads the switches in their OWN query
--     (src/lib/lawyers/profileVisibility.ts) and, for a section switched off,
--     sends an empty list and drops the raw column from the embedded row.
--     Before this file runs the read fails with 42703 and every section shows,
--     which is exactly the default — so the code can deploy first.
--   * The switches: /dashboard/lawyer/profile/edit and Settings → المهنة,
--     shown only when GET /api/v1/profile returns the keys (it reads the own
--     row with select("*")), so the screens keep saving before this file runs.
--
-- PREREQUISITE — 20260922_03 IN FORCE (refused below otherwise)
--
-- NOT AFTER THIS FILE WITHOUT CARE
--   * Re-running 20260922_03_lawyer_provider_column_grants.sql revokes UPDATE
--     on lawyer_profiles and re-grants ITS list, which lacks these columns: the
--     switches would answer «تعذّر حفظ» (42501). Re-run this file after it
--     (and 20261016_05).
--   * Re-running 20261016_10 raises in its own verify («authenticated can
--     UPDATE lawyer_profiles.show_services»): its self-service list predates
--     this file. It never needs a re-run once applied; if it must be re-run,
--     do it before this one — it RE-GRANTS SELECT on education / courts, so
--     re-run this file after it (_verify.sql's profile_visibility section
--     raises until then). _verify.sql's 20260922_03 section lists the three
--     columns as allowed; its 20261016_10 section stops expecting education /
--     courts to be public once show_education exists.
--
-- ROLLBACK
--   grant select (education, courts) on public.lawyer_profiles to anon, authenticated;
--   re-create "lawyer services public read" from 20260907 (without the switch);
--   drop function if exists public.lawyer_shows_services(uuid);
--   alter table public.lawyer_profiles
--     drop column if exists show_services,
--     drop column if exists show_education,
--     drop column if exists show_courts;
-- =============================================================================

begin;

-- ── 0. 20260922_03 must be in force ──────────────────────────────────────────
do $$
begin
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261025_50: public.lawyer_profiles is missing';
  end if;
  if has_table_privilege('authenticated', 'public.lawyer_profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.lawyer_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.lawyer_profiles', 'INSERT') then
    raise exception '20261025_50: lawyer_profiles still has table-level INSERT/UPDATE for the API roles — run 20260922_03_lawyer_provider_column_grants.sql first, then 20261016_05, then this file';
  end if;
end $$;

-- ── 1. The switches ──────────────────────────────────────────────────────────
alter table public.lawyer_profiles
  add column if not exists show_services  boolean not null default true,
  add column if not exists show_education boolean not null default true,
  add column if not exists show_courts    boolean not null default true;

comment on column public.lawyer_profiles.show_services is
  'N3.8 (20261025_50): the public profile lists the lawyer''s services only when true. Read by the Next routes with the service role.';
comment on column public.lawyer_profiles.show_education is
  'N3.8 (20261025_50): the public profile shows lawyer_profiles.education only when true.';
comment on column public.lawyer_profiles.show_courts is
  'N3.8 (20261025_50): the public profile shows lawyer_profiles.courts only when true.';

-- ── 2. The lawyer may switch them ────────────────────────────────────────────
grant update (show_services, show_education, show_courts) on public.lawyer_profiles to authenticated;
revoke update (show_services, show_education, show_courts) on public.lawyer_profiles from anon;

-- ── 3. The raw data behind the switches ──────────────────────────────────────
revoke select (education, courts) on public.lawyer_profiles from anon, authenticated, public;

create or replace function public.lawyer_shows_services(p_lawyer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = p_lawyer and lp.show_services);
$$;

comment on function public.lawyer_shows_services(uuid) is
  'N3.8 (20261025_50): whether the lawyer lists his services on the public profile — read by the "lawyer services public read" policy (DEFINER: show_services is not readable by the API roles).';

revoke all on function public.lawyer_shows_services(uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant execute on function public.lawyer_shows_services(uuid) to %I', r);
    end if;
  end loop;
end $$;

-- The guest read of the price list follows the switch. Same gate as 20260907
-- (an ACTIVE service of a VERIFIED, LISTED lawyer), plus show_services.
do $$
begin
  if to_regclass('public.lawyer_services') is not null then
    drop policy if exists "lawyer services public read" on public.lawyer_services;
    create policy "lawyer services public read" on public.lawyer_services for select
      using (active
             and exists (select 1 from public.lawyer_profiles lp
                          where lp.user_id = lawyer_user_id
                            and lp.verification_status = 'verified'
                            and lp.marketplace_visible = true)
             and public.lawyer_shows_services(lawyer_user_id));
  end if;
end $$;

-- ── 4. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  c       text;
  r       text;
  missing text := '';
begin
  foreach c in array array['show_services', 'show_education', 'show_courts'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'lawyer_profiles'
                      and column_name = c and data_type = 'boolean'
                      and is_nullable = 'NO' and column_default = 'true') then
      missing := missing || format(' lawyer_profiles.%s is missing or not boolean NOT NULL DEFAULT true;', c);
      continue;
    end if;
    if not has_column_privilege('authenticated', 'public.lawyer_profiles', c, 'UPDATE') then
      missing := missing || format(' authenticated cannot UPDATE %s (the switch would fail);', c);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if r = 'anon' and has_column_privilege('anon', 'public.lawyer_profiles', c, 'UPDATE') then
        missing := missing || format(' anon can UPDATE %s;', c);
      end if;
      if has_column_privilege(r, 'public.lawyer_profiles', c, 'SELECT') then
        missing := missing || format(' %s can SELECT %s (the switches are read with the service role only);', r, c);
      end if;
    end loop;
  end loop;
  if has_table_privilege('authenticated', 'public.lawyer_profiles', 'UPDATE') then
    missing := missing || ' authenticated holds table-level UPDATE on lawyer_profiles;';
  end if;
  foreach c in array array['education', 'courts'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_column_privilege(r, 'public.lawyer_profiles', c, 'SELECT') then
        missing := missing || format(' %s can still SELECT lawyer_profiles.%s (a switched-off section stays readable through REST);', r, c);
      end if;
    end loop;
    if not has_column_privilege('authenticated', 'public.lawyer_profiles', c, 'UPDATE') then
      missing := missing || format(' authenticated cannot UPDATE lawyer_profiles.%s (the lawyer could not save it);', c);
    end if;
  end loop;
  if not coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.lawyer_shows_services(uuid)')), false) then
    missing := missing || ' lawyer_shows_services is missing or not SECURITY DEFINER (the guest policy would hit 42501);';
  end if;
  if to_regclass('public.lawyer_services') is not null and not exists (
       select 1 from pg_policy where polrelid = 'public.lawyer_services'::regclass
          and polname = 'lawyer services public read'
          and pg_get_expr(polqual, polrelid) ~ 'lawyer_shows_services') then
    missing := missing || ' "lawyer services public read" does not read show_services;';
  end if;
  if missing <> '' then
    raise exception '20261025_50 verify:%', missing;
  end if;
  raise notice '20261025_50 verify: OK — show_services / show_education / show_courts (default true); the lawyer can switch them, anon cannot, and neither API role can read them; education / courts are service-role reads only; the guest services list follows show_services';
end $$;

commit;

notify pgrst, 'reload schema';
