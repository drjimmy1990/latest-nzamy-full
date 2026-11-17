-- =============================================================================
-- Migration: 20261122_40_lawyer_registry.sql   (launch batch, registry R2/R3/R5/R6)
-- =============================================================================
-- PURPOSE
--   The owner's package (17-Nov, 01_التسجيل): a lawyer who registers types his
--   full name OR his licence number and the platform fills in the other from
--   the Saudi lawyers' registry, greeting him «أهلاً فلان، ترخيص رقم …، سارٍ
--   حتى …». This file is the database half:
--
--   1. public.lawyer_registry (new): one row per licence, loaded by the user
--      with scripts/registry/import-lawyer-registry.mjs. It holds real names
--      and MOBILE NUMBERS, so it is server-only: RLS on, no policies, every
--      privilege revoked from PUBLIC / anon / authenticated.
--        licence_no  = lawyer_registry_norm_licence(licence_raw)  (generated, unique)
--        name_norm   = lawyer_registry_norm_name(full_name)       (generated)
--        name_key    = name_norm without spaces («عبد الله» = «عبدالله»)
--        archived    = the registry's own note says «محفوظ من القاعدة السابقة»
--                      (not in today's active list) — generated from the note.
--      Validity is NOT the registry's status column (it says «سارية» on every
--      row); it is expiry_date compared with today's date in Riyadh, computed
--      at lookup time.
--
--   2. Two pure normalisers (immutable, the ONLY implementation — the import
--      and the lookup both go through them, so they cannot drift):
--        lawyer_registry_norm_name(text)    — strips tashkeel/tatweel and
--          direction marks; أ إ آ ٱ → ا, ى ئ → ي, ؤ → و, ة → ه; one space.
--        lawyer_registry_norm_licence(text) — Arabic-Indic digits → 0-9, no
--          spaces, - – — _ \ → /, one /, no leading/trailing /.
--
--   3. public.lawyer_registry_lookup(p_licence text, p_full_name text) → jsonb
--      (SECURITY DEFINER, service_role only). Used by the guest signup route
--      POST /api/v1/auth/lawyer-registry-lookup. At most ONE match:
--        * by licence when p_licence is given (the name is then ignored);
--        * else by the exact normalised full name, only when exactly one row
--          has it; several → {"status":"ambiguous"} with no personal data.
--      Answers:
--        {"status":"valid","name","licence","expiry","mobile_hint","city"}
--        {"status":"expired"} | {"status":"unverifiable"} | {"status":"not_found"}
--        | {"status":"ambiguous"}
--      expired / unverifiable (archived row, or no expiry date) / not_found
--      carry NO personal data. mobile_hint is the last two digits only: the
--      full number never leaves the database on this path.
--
--   4. public.lawyer_registry_admin_matches(p_user_ids uuid[]) (SECURITY
--      DEFINER, service_role only): for the admin verification queue — per
--      lawyer, what the registry says about the licence on his file, whether
--      the registry name matches his account name, whether the registry mobile
--      matches his account mobile, and how many OTHER accounts claim the same
--      licence. Computed when the admin reads the queue (never stored from
--      anything the browser sent). Nothing is auto-verified: there is no OTP
--      yet (R4), so a registry hit is a hint for the admin, not a proof.
--
--   5. R6 — no two VERIFIED lawyer accounts on one licence: a partial unique
--      index on lawyer_registry_norm_licence(license_number) WHERE
--      verification_status = 'verified'. Deliberately not on every row:
--      without an OTP an impostor who registered someone else's licence first
--      would lock the real lawyer out of signing up. If verified duplicates
--      already exist the index is SKIPPED with a NOTICE (the final SELECT says
--      so) instead of failing the file.
--
-- HOW TO RUN (server)
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < /www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261122_40_lawyer_registry.sql
--   Idempotent: safe to run twice. Then load the registry with the import
--   script (see its header). Until it is loaded every lookup answers
--   not_found and the signup page shows «لم نتمكن من التحقق…».
--
-- RUN ORDER
--   Any time; before or after the code deploy. Until this file runs, the
--   lookup route answers «unavailable» and the signup page lets the lawyer
--   continue; the admin queue shows no registry line.
--
-- ROLLBACK
--   drop index if exists public.lawyer_profiles_verified_licence_uniq;
--   drop function if exists public.lawyer_registry_admin_matches(uuid[]);
--   drop function if exists public.lawyer_registry_lookup(text, text);
--   drop table if exists public.lawyer_registry;
--   drop function if exists public.lawyer_registry_norm_name(text);
--   drop function if exists public.lawyer_registry_norm_licence(text);
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $$
begin
  if to_regclass('public.lawyer_profiles') is null or to_regclass('public.profiles') is null then
    raise exception '20261122_40: public.profiles / public.lawyer_profiles are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone') then
    raise exception '20261122_40: public.profiles.phone is missing — run 20260921_04 first';
  end if;
end $$;

-- 1. Normalisers (pure; used by generated columns, so IMMUTABLE)
create or replace function public.lawyer_registry_norm_name(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
           pg_catalog.translate(
             pg_catalog.regexp_replace(coalesce(p, ''), '[ً-ٰٟـ‌-‏؜]', '', 'g'),
             'أإآٱىئؤة',
             'ااااييوه'),
           '\s+', ' ', 'g')), '')
$fn$;

comment on function public.lawyer_registry_norm_name(text) is
  '20261122_40: Arabic name key for the lawyers'' registry — no tashkeel/tatweel, unified alef/ya/waw/ta-marbuta, single spaces. The only implementation (generated columns + lookup).';

create or replace function public.lawyer_registry_norm_licence(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
           pg_catalog.translate(
             pg_catalog.regexp_replace(coalesce(p, ''), '\s+', '', 'g'),
             '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹-–—_\',
             '01234567890123456789/////'),
           '/+', '/', 'g'), '/'), '')
$fn$;

comment on function public.lawyer_registry_norm_licence(text) is
  '20261122_40: licence-number key — western digits, no spaces, separators unified to a single /. The only implementation.';

-- 2. The registry table (server-only)
create table if not exists public.lawyer_registry (
  licence_raw       text not null,
  licence_no        text generated always as (public.lawyer_registry_norm_licence(licence_raw)) stored,
  full_name         text not null,
  name_norm         text generated always as (public.lawyer_registry_norm_name(full_name)) stored,
  name_key          text generated always as (pg_catalog.replace(public.lawyer_registry_norm_name(full_name), ' ', '')) stored,
  mobile            text,
  city              text,
  registry_status   text,
  expiry_date       date,
  expiry_hijri      text,
  registry_note     text,
  archived          boolean generated always as (coalesce(registry_note, '') like 'محفوظ من القاعدة السابقة%') stored,
  source_updated_on date,
  imported_at       timestamptz not null default now(),
  constraint lawyer_registry_licence_no_present check (licence_no is not null),
  constraint lawyer_registry_name_present check (name_key is not null)
);

create unique index if not exists lawyer_registry_licence_no_key on public.lawyer_registry (licence_no);
create index if not exists lawyer_registry_name_key_idx on public.lawyer_registry (name_key);

comment on table public.lawyer_registry is
  '20261122_40: Saudi lawyers'' registry (names, licences, expiry, MOBILES). Server-only: RLS on, no policies, no privilege for PUBLIC/anon/authenticated. Loaded by scripts/registry/import-lawyer-registry.mjs; read only through lawyer_registry_lookup / lawyer_registry_admin_matches.';

alter table public.lawyer_registry enable row level security;
revoke all on public.lawyer_registry from public, anon, authenticated;
grant all on public.lawyer_registry to service_role;

-- 3. Guest lookup (signup), service_role only
create or replace function public.lawyer_registry_lookup(p_licence text, p_full_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_licence text := public.lawyer_registry_norm_licence(p_licence);
  v_key     text := pg_catalog.replace(public.lawyer_registry_norm_name(p_full_name), ' ', '');
  v_today   date := (pg_catalog.now() at time zone 'Asia/Riyadh')::date;
  v_n       integer;
  r         public.lawyer_registry%rowtype;
  v_digits  text;
begin
  if v_licence is not null then
    select * into r from public.lawyer_registry where licence_no = v_licence;
    if not found then
      return pg_catalog.jsonb_build_object('status', 'not_found');
    end if;
  elsif v_key is not null and pg_catalog.length(v_key) >= 6 then
    select count(*) into v_n from public.lawyer_registry where name_key = v_key;
    if v_n = 0 then
      return pg_catalog.jsonb_build_object('status', 'not_found');
    elsif v_n > 1 then
      return pg_catalog.jsonb_build_object('status', 'ambiguous');
    end if;
    select * into r from public.lawyer_registry where name_key = v_key;
  else
    return pg_catalog.jsonb_build_object('status', 'not_found');
  end if;

  if r.archived or r.expiry_date is null then
    return pg_catalog.jsonb_build_object('status', 'unverifiable');
  end if;
  if r.expiry_date < v_today then
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  v_digits := pg_catalog.regexp_replace(coalesce(r.mobile, ''), '\D', '', 'g');
  return pg_catalog.jsonb_build_object(
    'status', 'valid',
    'name', r.full_name,
    'licence', r.licence_no,
    'expiry', r.expiry_date,
    'mobile_hint', case when pg_catalog.length(v_digits) >= 8 then pg_catalog.right(v_digits, 2) end,
    'city', nullif(nullif(pg_catalog.btrim(coalesce(r.city, '')), ''), '(غير محدد)'));
end
$fn$;

comment on function public.lawyer_registry_lookup(text, text) is
  '20261122_40: signup lookup — one match by licence, or by a unique exact normalised name; ambiguous/expired/unverifiable/not_found carry no personal data; mobile = last 2 digits. service_role only.';

revoke all on function public.lawyer_registry_lookup(text, text) from public, anon, authenticated;
grant execute on function public.lawyer_registry_lookup(text, text) to service_role;

-- 4. Admin queue hint, service_role only
create or replace function public.lawyer_registry_admin_matches(p_user_ids uuid[])
returns table (user_id uuid, registry_match jsonb)
language sql
stable
security definer
set search_path = ''
as $fn$
  select lp.user_id,
         case
           when public.lawyer_registry_norm_licence(lp.license_number) is null then
             pg_catalog.jsonb_build_object('status', 'no_licence', 'checked_at', pg_catalog.now())
           when r.licence_no is null then
             pg_catalog.jsonb_build_object(
               'status', 'not_found',
               'licence', public.lawyer_registry_norm_licence(lp.license_number),
               'other_claims', claims.n,
               'checked_at', pg_catalog.now())
           else
             pg_catalog.jsonb_build_object(
               'status', case
                           when r.expiry_date is null then 'unknown_expiry'
                           when r.expiry_date < (pg_catalog.now() at time zone 'Asia/Riyadh')::date then 'expired'
                           else 'valid'
                         end,
               'licence', r.licence_no,
               'registry_name', r.full_name,
               'expiry', r.expiry_date,
               'archived', r.archived,
               'name_match', case
                               when public.lawyer_registry_norm_name(p.display_name) is null then 'none'
                               when pg_catalog.replace(public.lawyer_registry_norm_name(p.display_name), ' ', '') = r.name_key then 'exact'
                               when pg_catalog.string_to_array(public.lawyer_registry_norm_name(p.display_name), ' ')
                                    operator(pg_catalog.<@) pg_catalog.string_to_array(r.name_norm, ' ') then 'partial'
                               else 'different'
                             end,
               'mobile_match', case
                                 when pg_catalog.length(pg_catalog.regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) < 9
                                   or pg_catalog.length(pg_catalog.regexp_replace(coalesce(r.mobile, ''), '\D', '', 'g')) < 9 then null
                                 else pg_catalog.right(pg_catalog.regexp_replace(p.phone, '\D', '', 'g'), 9)
                                    = pg_catalog.right(pg_catalog.regexp_replace(r.mobile, '\D', '', 'g'), 9)
                               end,
               'other_claims', claims.n,
               'checked_at', pg_catalog.now())
         end
    from public.lawyer_profiles lp
    left join public.profiles p on p.id = lp.user_id
    left join public.lawyer_registry r
           on r.licence_no = public.lawyer_registry_norm_licence(lp.license_number)
    cross join lateral (
      select count(*)::integer as n
        from public.lawyer_profiles o
       where o.user_id <> lp.user_id
         and public.lawyer_registry_norm_licence(o.license_number)
             = public.lawyer_registry_norm_licence(lp.license_number)
    ) claims
   where lp.user_id = any (p_user_ids)
$fn$;

comment on function public.lawyer_registry_admin_matches(uuid[]) is
  '20261122_40: admin verification queue — registry status/name/expiry for each lawyer''s licence, name_match (exact/partial/different/none), mobile_match (registry mobile vs account phone), other_claims. Never returns the registry mobile. service_role only.';

revoke all on function public.lawyer_registry_admin_matches(uuid[]) from public, anon, authenticated;
grant execute on function public.lawyer_registry_admin_matches(uuid[]) to service_role;

-- 5. R6 — one verified account per licence (skipped, not failed, on duplicates)
do $$
declare
  v_dups integer;
begin
  if to_regclass('public.lawyer_profiles_verified_licence_uniq') is not null then
    raise notice '20261122_40: lawyer_profiles_verified_licence_uniq already exists';
    return;
  end if;
  select count(*) into v_dups
    from (select public.lawyer_registry_norm_licence(license_number) as k
            from public.lawyer_profiles
           where verification_status = 'verified'
             and public.lawyer_registry_norm_licence(license_number) is not null
           group by 1
          having count(*) > 1) d;
  if v_dups > 0 then
    raise notice '20261122_40: R6 SKIPPED — % licence number(s) are already shared by more than one verified lawyer; resolve them in the admin queue, then run this file again', v_dups;
    return;
  end if;
  create unique index lawyer_profiles_verified_licence_uniq
    on public.lawyer_profiles (public.lawyer_registry_norm_licence(license_number))
    where verification_status = 'verified';
  comment on index public.lawyer_profiles_verified_licence_uniq is
    '20261122_40 (R6): no two VERIFIED lawyer accounts on one licence number (normalised). Pending accounts may share one: without an OTP, a first-come lock would let an impostor block the real lawyer.';
end $$;

-- 6. Verify — raises, so the transaction rolls back
do $verify$
declare
  missing text := '';
  r text;
begin
  if to_regclass('public.lawyer_registry') is null then
    missing := missing || ' table missing;';
  else
    if not (select relrowsecurity from pg_class where oid = 'public.lawyer_registry'::regclass) then
      missing := missing || ' RLS is off on lawyer_registry;';
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, 'public.lawyer_registry', 'SELECT')
         or has_table_privilege(r, 'public.lawyer_registry', 'INSERT')
         or has_table_privilege(r, 'public.lawyer_registry', 'UPDATE')
         or has_table_privilege(r, 'public.lawyer_registry', 'DELETE')
         or has_any_column_privilege(r, 'public.lawyer_registry', 'SELECT') then
        missing := missing || format(' %s holds a privilege on lawyer_registry;', r);
      end if;
      if has_function_privilege(r, 'public.lawyer_registry_lookup(text, text)', 'EXECUTE') then
        missing := missing || format(' %s may execute lawyer_registry_lookup;', r);
      end if;
      if has_function_privilege(r, 'public.lawyer_registry_admin_matches(uuid[])', 'EXECUTE') then
        missing := missing || format(' %s may execute lawyer_registry_admin_matches;', r);
      end if;
    end loop;
    if exists (select 1 from pg_policy where polrelid = 'public.lawyer_registry'::regclass) then
      missing := missing || ' lawyer_registry has a policy (it must have none);';
    end if;
  end if;
  if not has_function_privilege('service_role', 'public.lawyer_registry_lookup(text, text)', 'EXECUTE') then
    missing := missing || ' service_role cannot execute lawyer_registry_lookup;';
  end if;
  if not exists (select 1 from pg_proc
                  where oid = 'public.lawyer_registry_lookup(text, text)'::regprocedure
                    and prosecdef and proconfig @> array['search_path=""']) then
    missing := missing || ' lawyer_registry_lookup is not SECURITY DEFINER with an empty search_path;';
  end if;
  if public.lawyer_registry_norm_name('أَحْمَد  إبراهيم عبدالله آل مـوسى') <> 'احمد ابراهيم عبدالله ال موسي' then
    missing := missing || ' lawyer_registry_norm_name gives an unexpected key;';
  end if;
  if public.lawyer_registry_norm_licence(' ١٢ / ٣٤٥٦ ') <> '12/3456'
     or public.lawyer_registry_norm_licence('12-3456') <> '12/3456' then
    missing := missing || ' lawyer_registry_norm_licence gives an unexpected key;';
  end if;
  if missing <> '' then
    raise exception '20261122_40 verify FAILED:%', missing;
  end if;
  raise notice '20261122_40 verify: OK';
end
$verify$;

-- 7. PostgREST: see the two new functions now (else the routes answer 503 until it reloads)
notify pgrst, 'reload schema';

commit;

select '20261122_40 lawyer_registry' as step,
       to_regclass('public.lawyer_registry') is not null
       and not has_table_privilege('anon', 'public.lawyer_registry', 'SELECT')
       and not has_table_privilege('authenticated', 'public.lawyer_registry', 'SELECT')
       and not has_function_privilege('anon', 'public.lawyer_registry_lookup(text, text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.lawyer_registry_lookup(text, text)', 'EXECUTE') as ok,
       (select count(*) from public.lawyer_registry) as registry_rows,
       to_regclass('public.lawyer_profiles_verified_licence_uniq') is not null as r6_verified_licence_unique;
