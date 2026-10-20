-- =============================================================================
-- Migration: 20261021_50_founder_campaign.sql
-- =============================================================================
-- PURPOSE (owner decision ٢١٨, dates ٢٢٥)
--   The founder-lawyer campaign: every lawyer who signs up between
--   25 Oct 2026 and 25 Jan 2027 (Riyadh dates, both days included) gets
--   3 months (90 days) of the legal library and the founder badge
--   («المحامي المؤسس») on his profile. Consultants are lawyers too and get it.
--   The dates live in a platform setting so the admin can move them in
--   /admin/settings without a code change.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. Refuses to run unless
--        * 20260922_03 / 20261016_10 are in force: anon / authenticated hold
--          no table-level SELECT, INSERT, UPDATE or REFERENCES on
--          lawyer_profiles (a new column would otherwise be open to them);
--        * public.platform_settings exists (20260627);
--        * public.library_access_grants exists (20261019_10) and its CHECKs
--          allow plan_ref 'lib-founder' and source 'founder_campaign'.
--   2. Seeds platform_settings key `founder_campaign` with the owner's dates:
--        {"starts_on": "2026-10-25", "ends_on": "2027-01-25", "library_days": 90}
--      `on conflict (key) do nothing` — a re-run never overwrites an admin's
--      later edit. Shape: starts_on / ends_on are "YYYY-MM-DD" or null (null
--      = the campaign is off), library_days a whole number of days.
--   3. public.founder_campaign_active(p_at timestamptz default now())
--      returns boolean — true when the Riyadh calendar date of p_at is
--      between starts_on and ends_on, both included. False when the setting
--      is missing, not an object, either date is null or not a real
--      "YYYY-MM-DD" date, or p_at is null. Never raises. STABLE, SECURITY
--      DEFINER (search_path ''), EXECUTE for anon / authenticated /
--      service_role (it returns one public boolean; the banner may call it).
--   4. lawyer_profiles.founder_badge boolean NOT NULL DEFAULT false (every
--      existing lawyer reads false) and exactly one grant:
--        grant select (founder_badge) on public.lawyer_profiles to anon, authenticated;
--      No INSERT / UPDATE grant: only the trigger and the service role set it.
--      It is a column, not a key inside `metadata`, because metadata is
--      outside 20261016_10's SELECT allow-list (a guest cannot read it).
--      No `revoke all` is run on lawyer_profiles: that would also drop the
--      21 self-service UPDATE column grants and practice_kind's SELECT.
--      Step 1 proves the table-level privileges are already gone, and the
--      verify block sweeps every column's effective privilege.
--   5. public.lawyer_profile_founder_campaign() — SECURITY DEFINER,
--      search_path '' — and the BEFORE INSERT trigger
--      trg_lawyer_profiles_founder. While founder_campaign_active(now()):
--        * it does nothing when a lawyer_profiles row already exists for
--          NEW.user_id. handle_new_user inserts with `on conflict (user_id) do
--          nothing`, and a BEFORE INSERT trigger fires even when the row then
--          conflicts, so an existing lawyer going through that path must not
--          be granted anything;
--        * it inserts ONE library_access_grants row ('lib-founder',
--          'founder_campaign', starts_at now(), ends_at now() + library_days
--          days; library_days missing or not a whole number in 1–3650 → 90),
--          only when the user holds no 'lib-founder' row yet (a deleted and
--          re-created profile does not get a second one). A per-user advisory
--          transaction lock makes the check-then-insert safe against two
--          concurrent inserts;
--        * it sets NEW.founder_badge = true (on NEW, so no UPDATE re-fires the
--          row's update triggers).
--      It applies to every new lawyer_profiles row, consultants included. It
--      fires BEFORE trg_lawyer_profiles_from_signup (triggers fire in name
--      order, "fo" < "fr"), so it sees practice_kind = 'advocate' (the default)
--      and does not branch on practice_kind.
--      The body is wrapped so it can never raise and so block a signup
--      (handle_new_user's insert runs inside the auth.users insert): a failure
--      is logged as a WARNING and the row is inserted with no badge and no
--      grant. EXECUTE revoked from PUBLIC, anon, authenticated.
--   6. Raising verify; then `notify pgrst` after commit.
--
-- DEPLOY ORDER — EITHER ORDER for the code in this commit (the admin route
--   only allowlists the key). It MUST be applied BEFORE 25 Oct 2026 (Riyadh)
--   for the first day's signups to be granted. The badge / banner code of the
--   next task tolerates the column being absent (42703).
--
-- RE-RUN HAZARD
--   20261016_10 starts with a table-level `revoke select`, which takes every
--   column SELECT grant with it — including founder_badge's. If 20261016_10 is
--   ever re-run, re-run 20261019_20 and this file after it (_verify.sql says
--   so).
--
-- ROLLBACK
--   drop trigger if exists trg_lawyer_profiles_founder on public.lawyer_profiles;
--   drop function if exists public.lawyer_profile_founder_campaign();
--   drop function if exists public.founder_campaign_active(timestamptz);
--   alter table public.lawyer_profiles drop column if exists founder_badge;
--   delete from public.platform_settings where key = 'founder_campaign';
--   (the lib-founder grants already given stay; delete them by hand if wanted:
--    delete from public.library_access_grants where plan_ref = 'lib-founder';)
-- =============================================================================

begin;

-- ── 1. Prerequisites ─────────────────────────────────────────────────────────
do $$
declare
  r   text;
  p   text;
  def text;
begin
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261021_50: public.lawyer_profiles does not exist';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_table_privilege(r, 'public.lawyer_profiles', p) then
        raise exception '20261021_50: % still holds table-level % on lawyer_profiles — run 20260922_03_lawyer_provider_column_grants.sql and 20261016_10_lawyer_profiles_select_column_lock.sql first (the new founder_badge column would otherwise be writable by the API roles)', r, p;
      end if;
    end loop;
  end loop;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261021_50: public.platform_settings does not exist — run 20260627_platform_settings.sql first';
  end if;
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261021_50: public.library_access_grants does not exist — run 20261019_10_library_access_grants.sql first';
  end if;
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.library_access_grants'::regclass and conname = 'library_access_grants_plan_ref_check';
  if def is null or position('''lib-founder''' in def) = 0 then
    raise exception '20261021_50: library_access_grants_plan_ref_check does not allow ''lib-founder'' (%) — re-run 20261019_10', coalesce(def, 'missing');
  end if;
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.library_access_grants'::regclass and conname = 'library_access_grants_source_check';
  if def is null or position('''founder_campaign''' in def) = 0 then
    raise exception '20261021_50: library_access_grants_source_check does not allow ''founder_campaign'' (%) — re-run 20261019_10', coalesce(def, 'missing');
  end if;
end $$;

-- ── 2. The setting, with the owner's dates (٢٢٥) ─────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('founder_campaign',
   '{"starts_on": "2026-10-25", "ends_on": "2027-01-25", "library_days": 90}'::jsonb,
   'حملة المحامي المؤسس (قرار المالك ٢١٨ / ٢٢٥): كل محامٍ يسجّل بين starts_on و ends_on (بتاريخ الرياض، شاملاً اليومين) يحصل على المكتبة القانونية library_days يوماً وشارة المؤسس. اجعل التاريخين null لإيقاف الحملة.')
on conflict (key) do nothing;

-- ── 3. Is the campaign on? ───────────────────────────────────────────────────
create or replace function public.founder_campaign_active(p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_value jsonb;
  v_start date;
  v_end   date;
  v_day   date;
begin
  if p_at is null then
    return false;
  end if;

  select s.value into v_value
    from public.platform_settings s
   where s.key = 'founder_campaign';

  if v_value is null or pg_catalog.jsonb_typeof(v_value) <> 'object'
     or pg_catalog.jsonb_typeof(v_value -> 'starts_on') is distinct from 'string'
     or pg_catalog.jsonb_typeof(v_value -> 'ends_on') is distinct from 'string'
     or (v_value ->> 'starts_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or (v_value ->> 'ends_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  begin
    -- an ISO YYYY-MM-DD literal reads the same under every DateStyle
    v_start := (v_value ->> 'starts_on')::date;
    v_end   := (v_value ->> 'ends_on')::date;
  exception when others then
    return false;   -- e.g. 2027-02-30
  end;

  v_day := (p_at at time zone 'Asia/Riyadh')::date;
  return v_day >= v_start and v_day <= v_end;
end
$fn$;

comment on function public.founder_campaign_active(timestamptz) is
  'Owner ٢١٨ / ٢٢٥ (20261021_50): true when the Riyadh date of p_at is between platform_settings founder_campaign.starts_on and .ends_on, both included; false when either is null or malformed. Never raises.';

revoke all on function public.founder_campaign_active(timestamptz) from public;
grant execute on function public.founder_campaign_active(timestamptz) to anon, authenticated, service_role;

-- ── 4. The badge column and its one grant ────────────────────────────────────
alter table public.lawyer_profiles
  add column if not exists founder_badge boolean not null default false;

comment on column public.lawyer_profiles.founder_badge is
  'المحامي المؤسس (owner ٢١٨ / ٢٢٥, 20261021_50): set to true by trg_lawyer_profiles_founder when the lawyer row is created during the founder campaign. anon/authenticated may SELECT it; nobody but the trigger and the service role writes it.';

grant select (founder_badge) on public.lawyer_profiles to anon, authenticated;

-- ── 5. The automatic grant at signup ─────────────────────────────────────────
create or replace function public.lawyer_profile_founder_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_value jsonb;
  v_days  integer := 90;
begin
  begin
    if not public.founder_campaign_active(pg_catalog.now()) then
      return new;
    end if;

    -- One lock per user: two concurrent inserts for the same user cannot both
    -- pass the checks below.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('founder_campaign:' || new.user_id::text, 0));

    -- An existing lawyer going through `insert … on conflict do nothing`:
    -- no row will be inserted, so nothing is granted.
    if exists (select 1 from public.lawyer_profiles lp where lp.user_id = new.user_id) then
      return new;
    end if;

    select s.value into v_value
      from public.platform_settings s
     where s.key = 'founder_campaign';
    if pg_catalog.jsonb_typeof(v_value -> 'library_days') = 'number'
       and (v_value ->> 'library_days') ~ '^[0-9]{1,4}$'
       and (v_value ->> 'library_days')::integer between 1 and 3650 then
      v_days := (v_value ->> 'library_days')::integer;
    end if;

    if not exists (select 1 from public.library_access_grants g
                    where g.user_id = new.user_id and g.plan_ref = 'lib-founder') then
      insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at)
      values (new.user_id, 'lib-founder', 'founder_campaign',
              pg_catalog.now(), pg_catalog.now() + pg_catalog.make_interval(days => v_days));
    end if;

    new.founder_badge := true;
  exception when others then
    -- Never block a signup: handle_new_user's insert is inside the auth.users
    -- insert, so an error here would abort the account creation itself.
    raise warning 'lawyer_profile_founder_campaign: % (%) — lawyer_profiles row for % inserted without the founder grant and badge',
      sqlerrm, sqlstate, new.user_id;
  end;
  return new;
end
$fn$;

comment on function public.lawyer_profile_founder_campaign() is
  'Owner ٢١٨ / ٢٢٥ (20261021_50): BEFORE INSERT on lawyer_profiles — during the founder campaign a NEW lawyer row gets founder_badge = true and one lib-founder library grant of library_days (default 90) days, once per user. Never raises.';

revoke all on function public.lawyer_profile_founder_campaign() from public, anon, authenticated;

drop trigger if exists trg_lawyer_profiles_founder on public.lawyer_profiles;
create trigger trg_lawyer_profiles_founder
  before insert on public.lawyer_profiles
  for each row execute function public.lawyer_profile_founder_campaign();

comment on trigger trg_lawyer_profiles_founder on public.lawyer_profiles is
  'FOUNDER CAMPAIGN since 20261021_50 (owner ٢١٨ / ٢٢٥) — read by _verify.sql.';

-- ── 6. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  tbl     constant text := 'public.lawyer_profiles';
  fn_act  constant text := 'public.founder_campaign_active(timestamptz)';
  fn_trg  constant text := 'public.lawyer_profile_founder_campaign()';
  r       text;
  dfl     text;
  cfg     text[];
  definer boolean;
  owner   text;
  v       jsonb;
  missing text := '';
begin
  -- the setting
  select value into v from public.platform_settings where key = 'founder_campaign';
  if v is null or jsonb_typeof(v) <> 'object'
     or not (v ? 'starts_on') or not (v ? 'ends_on') or not (v ? 'library_days') then
    missing := missing || format(' platform_settings founder_campaign is missing or not {starts_on, ends_on, library_days}: %s;', coalesce(v::text, 'no row'));
  end if;

  -- the column
  select pg_get_expr(d.adbin, d.adrelid) into dfl
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = tbl::regclass and a.attname = 'founder_badge' and not a.attisdropped;
  if not exists (select 1 from pg_attribute
                  where attrelid = tbl::regclass and attname = 'founder_badge'
                    and not attisdropped and attnotnull
                    and atttypid = 'boolean'::regtype)
     or dfl is distinct from 'false' then
    missing := missing || format(' founder_badge is not boolean NOT NULL DEFAULT false (default %s);', coalesce(dfl, 'none'));
  end if;
  if missing <> '' then
    raise exception '20261021_50 verify:%', missing;
  end if;

  -- the effective privileges (has_column_privilege counts table-level, column
  -- and inherited grants): founder_badge readable, not writable; no
  -- table-level privilege; metadata still locked
  foreach r in array array['anon', 'authenticated'] loop
    if not has_column_privilege(r, tbl, 'founder_badge', 'SELECT') then
      missing := missing || format(' %s cannot SELECT founder_badge;', r);
    end if;
    if has_column_privilege(r, tbl, 'founder_badge', 'INSERT, UPDATE, REFERENCES') then
      missing := missing || format(' %s can write founder_badge;', r);
    end if;
    if has_column_privilege(r, tbl, 'metadata', 'SELECT') then
      missing := missing || format(' %s can SELECT metadata;', r);
    end if;
    if has_table_privilege(r, tbl, 'SELECT, INSERT, UPDATE, REFERENCES') then
      missing := missing || format(' %s holds a table-level privilege on lawyer_profiles;', r);
    end if;
  end loop;
  if has_column_privilege('public', tbl, 'founder_badge', 'SELECT, INSERT, UPDATE, REFERENCES') then
    missing := missing || ' PUBLIC holds a privilege on founder_badge;';
  end if;
  if not has_column_privilege('service_role', tbl, 'founder_badge', 'SELECT')
     or not has_column_privilege('service_role', tbl, 'founder_badge', 'UPDATE') then
    missing := missing || ' service_role cannot read/write founder_badge;';
  end if;

  -- founder_campaign_active
  select p.proconfig, p.prosecdef into cfg, definer from pg_proc p where p.oid = to_regprocedure(fn_act);
  if not coalesce(definer, false) then
    missing := missing || ' founder_campaign_active is missing or not SECURITY DEFINER;';
  end if;
  if cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || format(' founder_campaign_active proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  end if;
  if to_regprocedure(fn_act) is not null then
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if not has_function_privilege(r, fn_act, 'EXECUTE') then
        missing := missing || format(' %s cannot EXECUTE founder_campaign_active;', r);
      end if;
    end loop;
  end if;

  -- the trigger function
  select p.proconfig, p.prosecdef, pg_get_userbyid(p.proowner)
    into cfg, definer, owner
    from pg_proc p where p.oid = to_regprocedure(fn_trg);
  if not coalesce(definer, false) then
    missing := missing || ' lawyer_profile_founder_campaign is missing or not SECURITY DEFINER;';
  end if;
  if cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || format(' lawyer_profile_founder_campaign proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  end if;
  if to_regprocedure(fn_trg) is not null then
    foreach r in array array['public', 'anon', 'authenticated'] loop
      if has_function_privilege(r, fn_trg, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE lawyer_profile_founder_campaign;', r);
      end if;
    end loop;
  end if;
  -- the definer must be able to read the setting and the grants and write a
  -- grant, or the body (which never raises) silently grants nothing
  if owner is not null
     and not (has_table_privilege(owner, 'public.platform_settings', 'SELECT')
              and has_table_privilege(owner, 'public.library_access_grants', 'SELECT')
              and has_table_privilege(owner, 'public.library_access_grants', 'INSERT')
              and has_table_privilege(owner, 'public.lawyer_profiles', 'SELECT')) then
    missing := missing || format(' the function owner %s cannot read platform_settings / lawyer_profiles or read and insert library_access_grants — the founder grant would silently do nothing;', owner);
  end if;

  -- the trigger
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = tbl::regclass
                    and t.tgname = 'trg_lawyer_profiles_founder'
                    and not t.tgisinternal
                    and t.tgenabled <> 'D'
                    and (t.tgtype & 7) = 7          -- FOR EACH ROW | BEFORE | INSERT
                    and (t.tgtype & 16) = 0         -- not on UPDATE
                    and t.tgfoid = to_regprocedure(fn_trg)) then
    missing := missing || ' trg_lawyer_profiles_founder is missing, disabled, or not BEFORE INSERT FOR EACH ROW on lawyer_profile_founder_campaign();';
  end if;

  if missing <> '' then
    raise exception '20261021_50 verify:%', missing;
  end if;
  raise notice '20261021_50 verify: OK — founder_campaign = %; founder_badge (default false) readable by anon/authenticated, written by nobody but the trigger and the service role; founder_campaign_active() definer; trg_lawyer_profiles_founder BEFORE INSERT (definer %); campaign active now: %',
    v, owner, public.founder_campaign_active();
end $$;

commit;

notify pgrst, 'reload schema';
