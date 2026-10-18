-- =============================================================================
-- Migration: 20261019_20_lawyer_practice_kind.sql
-- =============================================================================
-- PURPOSE (owner answers ١٧٣ / ٢١٩, decisions of 2026-10-18)
--   The independent legal consultant («مستشار قانوني») is a `lawyer` account
--   whose lawyer_profiles row says practice_kind = 'consultant'. He uses the
--   lawyer dashboard; the court features are refused to him on the server
--   (later tasks of the batch). This file adds the two columns the workstream
--   needs and fills them at signup:
--     * practice_kind — 'advocate' (every lawyer today) or 'consultant';
--     * licence_image_path — the Storage path of the uploaded licence image,
--       read only by the server (the admin verification queue).
--   It also keeps the licence number the lawyer types at signup: the signup
--   page (src/app/register/provider/page.tsx) has always sent
--   `license_number` in the auth metadata, and nothing copied it into
--   lawyer_profiles — handle_new_user inserts (user_id, is_accepting_clients)
--   only.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. Refuses to run unless 20260922_03 (no table-level INSERT/UPDATE for the
--      API roles) and 20261016_10 (no table-level SELECT for them) are in
--      force: a column added to a table the API roles still hold table-level
--      privileges on would be readable / writable by them at once.
--   2. lawyer_profiles.practice_kind text NOT NULL DEFAULT 'advocate',
--      CHECK lawyer_profiles_practice_kind_check (advocate | consultant).
--      Every existing row reads 'advocate'.
--      lawyer_profiles.licence_image_path text NULL.
--   3. Privileges. The table carries no table-level privilege for anon /
--      authenticated any more (step 1), so the new columns start with none.
--      Exactly one grant is added:
--        grant select (practice_kind) on public.lawyer_profiles to anon, authenticated;
--      — a public profile shows «مستشار قانوني», and the session reads its own
--      kind. Nothing at all on licence_image_path (service role only). No
--      UPDATE on either column: the kind is chosen at signup, changed by an
--      admin (service role). No revoke / grant update is re-run on the table.
--   4. public.lawyer_profile_from_signup() — SECURITY DEFINER, search_path ''
--      — and the BEFORE INSERT trigger trg_lawyer_profiles_from_signup. It
--      reads auth.users.raw_user_meta_data for NEW.user_id and
--        * sets practice_kind = 'consultant' only when the metadata
--          practice_kind is exactly 'consultant' (it never writes 'advocate',
--          so an explicit value from a service-role insert stands);
--        * fills license_number from the metadata license_number (trimmed;
--          blank → nothing) when the inserted row's license_number is NULL.
--      handle_new_user (AFTER INSERT on auth.users) does the lawyer insert, so
--      the auth.users row is visible here. No auth.users row, NULL or
--      non-object metadata → the row is left as inserted. The body is wrapped
--      so that it can never raise and so block a signup (a failure is logged
--      as a WARNING). EXECUTE revoked from PUBLIC, anon, authenticated.
--   5. Raising verify; then `notify pgrst` after commit.
--
-- WHAT IT DOES NOT DO
--   * It does not touch handle_new_user.
--   * It does not backfill license_number for lawyers who signed up before it
--     (their metadata still holds what they typed). A separate one-time file
--     if the owner wants it.
--
-- DEPLOY ORDER — EITHER ORDER for the code in this commit (no code reads the
--   columns yet). It MUST be applied BEFORE the signup change of Task 2.5
--   (`practice_kind: 'consultant'` in the signup metadata) goes live: a
--   consultant who signs up before this file runs is stored as an advocate.
--
-- RE-RUN HAZARD
--   20261016_10 starts with a table-level `revoke select`, which takes every
--   column SELECT grant with it — including practice_kind's. If 20261016_10 is
--   ever re-run, re-run this file after it (_verify.sql says so).
--
-- ROLLBACK
--   drop trigger if exists trg_lawyer_profiles_from_signup on public.lawyer_profiles;
--   drop function if exists public.lawyer_profile_from_signup();
--   alter table public.lawyer_profiles drop column if exists licence_image_path,
--                                      drop column if exists practice_kind;
-- =============================================================================

begin;

-- ── 1. Prerequisites ─────────────────────────────────────────────────────────
do $$
declare
  r text;
  p text;
begin
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261019_20: public.lawyer_profiles does not exist';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_table_privilege(r, 'public.lawyer_profiles', p) then
        raise exception '20261019_20: % still holds table-level % on lawyer_profiles — run 20260922_03_lawyer_provider_column_grants.sql and 20261016_10_lawyer_profiles_select_column_lock.sql first (the new licence_image_path column would otherwise be open to the API roles)', r, p;
      end if;
    end loop;
  end loop;
  if to_regclass('auth.users') is null
     or not exists (select 1 from pg_attribute
                     where attrelid = 'auth.users'::regclass
                       and attname = 'raw_user_meta_data' and not attisdropped) then
    raise exception '20261019_20: auth.users.raw_user_meta_data is missing — the signup fill would have nothing to read';
  end if;
end $$;

-- ── 2. Columns ───────────────────────────────────────────────────────────────
alter table public.lawyer_profiles
  add column if not exists practice_kind      text not null default 'advocate',
  add column if not exists licence_image_path text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.lawyer_profiles'::regclass
                    and conname = 'lawyer_profiles_practice_kind_check') then
    alter table public.lawyer_profiles
      add constraint lawyer_profiles_practice_kind_check
      check (practice_kind in ('advocate', 'consultant'));
  end if;
end $$;

comment on column public.lawyer_profiles.practice_kind is
  'advocate = محامٍ مرخّص؛ consultant = مستشار قانوني (owner ١٧٣ / ٢١٩, 20261019_20). Filled at signup by trg_lawyer_profiles_from_signup from the signup metadata; anon/authenticated may SELECT it, nobody but the service role writes it.';
comment on column public.lawyer_profiles.licence_image_path is
  'Storage path of the licence image (20261019_20). Service role only: anon/authenticated hold no privilege on this column.';

-- ── 3. The one grant ─────────────────────────────────────────────────────────
grant select (practice_kind) on public.lawyer_profiles to anon, authenticated;

-- ── 4. The signup fill ───────────────────────────────────────────────────────
create or replace function public.lawyer_profile_from_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_meta    jsonb;
  v_licence text;
begin
  begin
    select u.raw_user_meta_data into v_meta
      from auth.users u
     where u.id = new.user_id;

    if v_meta is null or pg_catalog.jsonb_typeof(v_meta) <> 'object' then
      return new;
    end if;

    if v_meta ->> 'practice_kind' = 'consultant' then
      new.practice_kind := 'consultant';
    end if;

    if new.license_number is null
       and pg_catalog.jsonb_typeof(v_meta -> 'license_number') in ('string', 'number') then
      v_licence := nullif(pg_catalog.btrim(v_meta ->> 'license_number'), '');
      if v_licence is not null then
        new.license_number := v_licence;
      end if;
    end if;
  exception when others then
    -- Never block a signup: handle_new_user's insert is inside the auth.users
    -- insert, so an error here would abort the account creation itself.
    raise warning 'lawyer_profile_from_signup: % (%) — lawyer_profiles row for % kept as inserted',
      sqlerrm, sqlstate, new.user_id;
  end;
  return new;
end
$fn$;

comment on function public.lawyer_profile_from_signup() is
  'Owner ١٧٣ / ٢١٩ (20261019_20): BEFORE INSERT on lawyer_profiles — practice_kind = consultant when the signup metadata says exactly consultant; license_number from the signup metadata when the row has none. Never raises.';

revoke all on function public.lawyer_profile_from_signup() from public, anon, authenticated;

drop trigger if exists trg_lawyer_profiles_from_signup on public.lawyer_profiles;
create trigger trg_lawyer_profiles_from_signup
  before insert on public.lawyer_profiles
  for each row execute function public.lawyer_profile_from_signup();

comment on trigger trg_lawyer_profiles_from_signup on public.lawyer_profiles is
  'SIGNUP FILL since 20261019_20 (owner ١٧٣ / ٢١٩) — read by _verify.sql.';

-- ── 5. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  tbl     constant text := 'public.lawyer_profiles';
  fn      constant text := 'public.lawyer_profile_from_signup()';
  r       text;
  dfl     text;
  def     text;
  cfg     text[];
  definer boolean;
  owner   text;
  missing text := '';
begin
  -- the columns
  select pg_get_expr(d.adbin, d.adrelid) into dfl
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = tbl::regclass and a.attname = 'practice_kind' and not a.attisdropped;
  if not exists (select 1 from pg_attribute
                  where attrelid = tbl::regclass and attname = 'practice_kind'
                    and not attisdropped and attnotnull
                    and atttypid = 'text'::regtype) then
    missing := missing || ' practice_kind is missing, not text, or nullable;';
  end if;
  if dfl is distinct from '''advocate''::text' then
    missing := missing || format(' practice_kind default is %s, expected ''advocate'';', coalesce(dfl, 'none'));
  end if;
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conrelid = tbl::regclass and c.conname = 'lawyer_profiles_practice_kind_check'
     and c.contype = 'c' and c.convalidated;
  if def is null
     or position('''advocate''' in def) = 0
     or position('''consultant''' in def) = 0
     or (length(def) - length(replace(def, '::text', ''))) / length('::text') <> 2 then
    missing := missing || format(' lawyer_profiles_practice_kind_check is missing or not (advocate, consultant): %s;', coalesce(def, 'none'));
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = tbl::regclass and attname = 'licence_image_path'
                    and not attisdropped and not attnotnull
                    and atttypid = 'text'::regtype) then
    missing := missing || ' licence_image_path is missing, not text, or NOT NULL;';
  end if;
  if missing <> '' then
    raise exception '20261019_20 verify:%', missing;
  end if;

  -- the privileges
  foreach r in array array['anon', 'authenticated'] loop
    if not has_column_privilege(r, tbl, 'practice_kind', 'SELECT') then
      missing := missing || format(' %s cannot SELECT practice_kind;', r);
    end if;
    if has_column_privilege(r, tbl, 'practice_kind', 'INSERT, UPDATE') then
      missing := missing || format(' %s can write practice_kind;', r);
    end if;
    if has_column_privilege(r, tbl, 'licence_image_path', 'UPDATE') then
      missing := missing || format(' %s can UPDATE licence_image_path;', r);
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_column_privilege(r, tbl, 'licence_image_path', 'SELECT, INSERT, UPDATE, REFERENCES') then
      missing := missing || format(' %s holds a privilege on licence_image_path (service role only);', r);
    end if;
  end loop;
  if not has_column_privilege('service_role', tbl, 'licence_image_path', 'SELECT')
     or not has_column_privilege('service_role', tbl, 'licence_image_path', 'UPDATE')
     or not has_column_privilege('service_role', tbl, 'practice_kind', 'UPDATE') then
    missing := missing || ' service_role cannot read/write the new columns;';
  end if;

  -- the trigger
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = tbl::regclass
                    and t.tgname = 'trg_lawyer_profiles_from_signup'
                    and not t.tgisinternal
                    and t.tgenabled <> 'D'
                    and (t.tgtype & 7) = 7          -- FOR EACH ROW | BEFORE | INSERT
                    and t.tgfoid = to_regprocedure(fn)) then
    missing := missing || ' trg_lawyer_profiles_from_signup is missing, disabled, or not BEFORE INSERT FOR EACH ROW on lawyer_profile_from_signup();';
  end if;

  -- the function
  select p.proconfig, p.prosecdef, pg_get_userbyid(p.proowner)
    into cfg, definer, owner
    from pg_proc p where p.oid = to_regprocedure(fn);
  if not coalesce(definer, false) then
    missing := missing || ' lawyer_profile_from_signup is missing or not SECURITY DEFINER;';
  end if;
  if cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || format(' lawyer_profile_from_signup proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      missing := missing || format(' %s can EXECUTE lawyer_profile_from_signup;', r);
    end if;
  end loop;
  -- the definer must be able to read the metadata, or the fill silently does
  -- nothing (the body never raises)
  if owner is not null
     and not (has_schema_privilege(owner, 'auth', 'USAGE')
              and has_column_privilege(owner, 'auth.users', 'raw_user_meta_data', 'SELECT')) then
    missing := missing || format(' the function owner %s cannot read auth.users.raw_user_meta_data — the signup fill would silently do nothing;', owner);
  end if;

  if missing <> '' then
    raise exception '20261019_20 verify:%', missing;
  end if;
  raise notice '20261019_20 verify: OK — practice_kind (default advocate, CHECK advocate|consultant) readable by anon/authenticated, licence_image_path service role only, neither writable by a session; trg_lawyer_profiles_from_signup fills them at signup (definer %)', owner;
end $$;

commit;

notify pgrst, 'reload schema';
