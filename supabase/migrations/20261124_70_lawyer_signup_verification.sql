-- =============================================================================
-- Migration: 20261124_70_lawyer_signup_verification.sql   (batch l3, slice l3-signup)
-- =============================================================================
-- PURPOSE (owner decisions ٢٠–٢١, 17 Nov 2026)
--   The lawyer signs up with his four-part name, his licence number and a
--   photo of the licence. The platform checks the licence in the lawyers'
--   registry (20261122_40), sends a one-time code ONLY to the mobile the
--   registry holds (never a number he types), and approves him at once only
--   when everything matches; anything else is held for a human with the
--   message «سجّلنا بياناتك وسنتواصل معك». This file is the database half:
--
--   1. public.lawyer_signup_verifications — one row per lawyer: what the
--      registry said (status, name match, last two digits of the registry
--      mobile — never the number), when the identity code and the e-mail code
--      were confirmed, «رقمي تغيّر», and the decision (pending / review /
--      approved, with reason codes). The lawyer may SELECT his own row, a few
--      safe columns only; every write is the server's (service role).
--   2. public.lawyer_otp_challenges — the codes: a keyed HMAC of the code only
--      (never the code), a keyed hash of the target (never the number or the
--      address) plus a two-character hint, attempts, 10-minute expiry,
--      channel, purpose 'identity' | 'email'. Server-only (no session access).
--   3. public.lawyer_licence_images — the uploaded licence photos: the path in
--      the private bucket, type, size, the AI pre-check status and result.
--      Server-only.
--   4. Four SECURITY DEFINER functions, service_role only:
--        lawyer_signup_registry_check(user, typed name) → the registry status
--          of the licence on his file, the name match (exact / subset /
--          different / none — same rule as src/lib/lawyerSignup/nameLicence.ts),
--          how many OTHER verified accounts hold the licence, whether a usable
--          registry mobile exists and its last two digits; writes them on his
--          verification row. Never returns the mobile.
--        lawyer_signup_registry_mobile(user) → the registry mobile for HIS
--          licence, only while that licence is valid and not archived. The
--          server sends the code to it and never stores or returns it.
--        lawyer_otp_issue(…) → inserts a challenge after the limits:
--          60 s between two sends on one channel, 5 sends per hour per user
--          and purpose, 10 sends per 24 h to one target across ALL accounts
--          (so many accounts cannot pester one real lawyer).
--        lawyer_otp_verify(user, purpose, code hash) → under an advisory lock:
--          a hit consumes every open challenge of that purpose and stamps the
--          verification row (identity: with the licence the code proved);
--          a miss adds one attempt to every open challenge (5 → dead).
--   5. The private Storage bucket `lawyer-licences` (5 MB; jpeg/png/webp/pdf)
--      and ONE storage.objects policy: a signed-in user may INSERT into his
--      own `<uid>/` folder. No SELECT / UPDATE / DELETE policy: admins read
--      through the server (service role, 5-minute signed links). The app's
--      upload route goes through the server too (type/size/magic-byte check).
--
-- HOW TO RUN (server; as supabase_admin, which may write storage.*)
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < /www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261124_70_lawyer_signup_verification.sql
--   Expect: NOTICE 20261124_70 verify: OK and a final row with ok = t.
--   Idempotent: safe to run twice.
--
-- RUN ORDER
--   AFTER 20261122_40_lawyer_registry.sql (it uses its normalisers and table).
--   Before or after the code deploy: until it runs, the new routes answer
--   503 «الخدمة غير متاحة مؤقتاً» and the signup page shows the hold message;
--   the admin queue simply has no signup line.
--
-- ROLLBACK
--   drop policy if exists "lawyer-licences insert own" on storage.objects;
--   delete from storage.buckets where id = 'lawyer-licences';   -- only when empty
--   drop function if exists public.lawyer_otp_verify(uuid, text, text);
--   drop function if exists public.lawyer_otp_issue(uuid, text, text, text, text, text, text);
--   drop function if exists public.lawyer_signup_registry_mobile(uuid);
--   drop function if exists public.lawyer_signup_registry_check(uuid, text);
--   drop table if exists public.lawyer_licence_images;
--   drop table if exists public.lawyer_otp_challenges;
--   drop table if exists public.lawyer_signup_verifications;
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $pre$
begin
  if to_regclass('public.lawyer_registry') is null
     or to_regprocedure('public.lawyer_registry_norm_licence(text)') is null
     or to_regprocedure('public.lawyer_registry_norm_name(text)') is null then
    raise exception '20261124_70: run 20261122_40_lawyer_registry.sql first';
  end if;
  if to_regclass('public.lawyer_profiles') is null or to_regclass('auth.users') is null then
    raise exception '20261124_70: public.lawyer_profiles / auth.users are missing';
  end if;
end
$pre$;

-- ── 1. one verification row per lawyer ──────────────────────────────────────
create table if not exists public.lawyer_signup_verifications (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  licence_no                  text,
  full_name_input             text,
  registry_status             text not null default 'not_checked',
  name_match                  text,
  other_verified_claims       integer not null default 0,
  has_registry_mobile         boolean not null default false,
  mobile_hint                 text,
  registry_checked_at         timestamptz,
  identity_otp_verified_at    timestamptz,
  identity_otp_channel        text,
  identity_otp_licence_no     text,
  email_otp_verified_at       timestamptz,
  email_otp_hint              text,
  email_throwaway             boolean not null default false,
  mobile_change_requested_at  timestamptz,
  mobile_change_new_mobile    text,
  decision                    text not null default 'pending',
  decision_reasons            text[] not null default '{}',
  decided_by                  text,
  decided_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint lsv_registry_status check (registry_status in
    ('valid', 'expired', 'unverifiable', 'not_found', 'no_licence', 'unavailable', 'not_checked')),
  constraint lsv_name_match check (name_match is null or name_match in ('exact', 'subset', 'different', 'none')),
  constraint lsv_mobile_hint check (mobile_hint is null or mobile_hint ~ '^[0-9]{2}$'),
  constraint lsv_identity_channel check (identity_otp_channel is null or identity_otp_channel in ('whatsapp', 'sms')),
  constraint lsv_new_mobile check (mobile_change_new_mobile is null or mobile_change_new_mobile ~ '^\+9665[0-9]{8}$'),
  constraint lsv_decision check (decision in ('pending', 'review', 'approved')),
  constraint lsv_decided_by check (decided_by is null or decided_by in ('system', 'admin'))
);

comment on table public.lawyer_signup_verifications is
  '20261124_70 (owner ٢٠–٢١): the lawyer signup verification state — registry status, name match, OTP confirmations, «رقمي تغيّر», decision. The lawyer reads a few safe columns of his own row; the server (service role) writes. Never holds the registry mobile (mobile_hint = last 2 digits).';

alter table public.lawyer_signup_verifications enable row level security;
revoke all on public.lawyer_signup_verifications from public, anon, authenticated;
grant select (user_id, registry_status, mobile_hint, identity_otp_verified_at, email_otp_verified_at,
              decision, updated_at)
  on public.lawyer_signup_verifications to authenticated;
grant all on public.lawyer_signup_verifications to service_role;

drop policy if exists "lawyer reads own signup verification" on public.lawyer_signup_verifications;
create policy "lawyer reads own signup verification" on public.lawyer_signup_verifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ── 2. the codes (server-only) ──────────────────────────────────────────────
create table if not exists public.lawyer_otp_challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  purpose      text not null,
  channel      text not null,
  licence_no   text,
  target_hash  text not null,
  target_hint  text,
  code_hash    text not null,
  attempts     integer not null default 0,
  delivery     text not null default 'pending',
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint loc_purpose check (purpose in ('identity', 'email')),
  constraint loc_channel check ((purpose = 'identity' and channel in ('whatsapp', 'sms') and licence_no is not null)
                             or (purpose = 'email' and channel = 'email')),
  constraint loc_attempts check (attempts between 0 and 5),
  constraint loc_delivery check (delivery in ('pending', 'sent', 'failed')),
  constraint loc_hashes check (code_hash ~ '^[0-9a-f]{64}$' and target_hash ~ '^[0-9a-f]{64}$'),
  constraint loc_hint check (target_hint is null or pg_catalog.length(target_hint) <= 80)
);

create index if not exists lawyer_otp_challenges_user_idx on public.lawyer_otp_challenges (user_id, purpose, created_at desc);
create index if not exists lawyer_otp_challenges_target_idx on public.lawyer_otp_challenges (target_hash, created_at desc);

comment on table public.lawyer_otp_challenges is
  '20261124_70 (owner ٢١): one-time codes — HMAC of the code and of the target only (never the code, the mobile or the address), 10-minute expiry, 5 attempts. Server-only: RLS on, no policies, no privilege for anon/authenticated.';

alter table public.lawyer_otp_challenges enable row level security;
revoke all on public.lawyer_otp_challenges from public, anon, authenticated;
grant all on public.lawyer_otp_challenges to service_role;

-- ── 3. the licence photos (server-only) ─────────────────────────────────────
create table if not exists public.lawyer_licence_images (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  purpose        text not null default 'signup',
  storage_path   text not null unique,
  mime           text not null,
  size_bytes     integer not null,
  ai_status      text not null default 'pending',
  ai_result      jsonb,
  ai_checked_at  timestamptz,
  provider_copy  text not null default 'none',
  created_at     timestamptz not null default now(),
  constraint lli_purpose check (purpose in ('signup', 'mobile_change')),
  constraint lli_own_folder check (pg_catalog.split_part(storage_path, '/', 1) = user_id::text
                                   and storage_path !~ '\.\.'),
  constraint lli_mime check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint lli_size check (size_bytes > 0 and size_bytes <= 5242880),
  constraint lli_ai_status check (ai_status in ('pending', 'match', 'doubt', 'mismatch', 'skipped', 'error')),
  constraint lli_provider_copy check (provider_copy in ('none', 'inline_not_stored'))
);

create index if not exists lawyer_licence_images_user_idx on public.lawyer_licence_images (user_id, created_at desc);

comment on table public.lawyer_licence_images is
  '20261124_70 (owner ٢٠): licence photos in the private bucket lawyer-licences (<user_id>/…), with the AI pre-check status/result. provider_copy = inline_not_stored: the image went to the model inline (no file kept on the provider side). Server-only.';

alter table public.lawyer_licence_images enable row level security;
revoke all on public.lawyer_licence_images from public, anon, authenticated;
grant all on public.lawyer_licence_images to service_role;

-- ── 4a. registry check for the caller's own licence ─────────────────────────
create or replace function public.lawyer_signup_registry_check(p_user uuid, p_full_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_today   date := (pg_catalog.now() at time zone 'Asia/Riyadh')::date;
  v_raw     text;
  v_lic     text;
  v_found   boolean := false;
  r         public.lawyer_registry%rowtype;
  v_status  text;
  v_in      text := public.lawyer_registry_norm_name(p_full_name);
  v_match   text := 'none';
  v_claims  integer := 0;
  v_digits  text;
  v_has     boolean := false;
  v_hint    text;
begin
  if p_user is null then
    raise exception 'lawyer_signup_registry_check: p_user is required' using errcode = '22023';
  end if;
  select lp.license_number into v_raw from public.lawyer_profiles lp where lp.user_id = p_user;
  if not found then
    return pg_catalog.jsonb_build_object('status', 'no_profile');
  end if;
  v_lic := public.lawyer_registry_norm_licence(v_raw);

  if v_lic is null then
    v_status := 'no_licence';
  else
    select * into r from public.lawyer_registry where licence_no = v_lic;
    v_found := found;
    if not v_found then
      v_status := 'not_found';
    elsif r.archived or r.expiry_date is null then
      v_status := 'unverifiable';
    elsif r.expiry_date < v_today then
      v_status := 'expired';
    else
      v_status := 'valid';
    end if;

    select count(*)::integer into v_claims
      from public.lawyer_profiles o
     where o.user_id <> p_user
       and o.verification_status = 'verified'
       and public.lawyer_registry_norm_licence(o.license_number) = v_lic;
  end if;

  if v_found and v_in is not null then
    if pg_catalog.replace(v_in, ' ', '') = r.name_key then
      v_match := 'exact';
    elsif pg_catalog.cardinality(pg_catalog.string_to_array(v_in, ' ')) >= 4
          and pg_catalog.string_to_array(v_in, ' ') operator(pg_catalog.<@) pg_catalog.string_to_array(r.name_norm, ' ') then
      v_match := 'subset';
    else
      v_match := 'different';
    end if;
  end if;

  if v_status = 'valid' then
    v_digits := pg_catalog.regexp_replace(coalesce(r.mobile, ''), '\D', '', 'g');
    v_has := pg_catalog.length(v_digits) >= 9;
    v_hint := case when v_has then pg_catalog.right(v_digits, 2) end;
  end if;

  insert into public.lawyer_signup_verifications as v
         (user_id, licence_no, full_name_input, registry_status, name_match, other_verified_claims,
          has_registry_mobile, mobile_hint, registry_checked_at, updated_at)
  values (p_user, v_lic, pg_catalog.left(p_full_name, 160), v_status, v_match, v_claims,
          v_has, v_hint, pg_catalog.now(), pg_catalog.now())
  on conflict (user_id) do update
     set licence_no = excluded.licence_no,
         full_name_input = coalesce(excluded.full_name_input, v.full_name_input),
         registry_status = excluded.registry_status,
         name_match = excluded.name_match,
         other_verified_claims = excluded.other_verified_claims,
         has_registry_mobile = excluded.has_registry_mobile,
         mobile_hint = excluded.mobile_hint,
         registry_checked_at = excluded.registry_checked_at,
         updated_at = excluded.updated_at;

  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'licence', v_lic,
    'name_match', v_match,
    'other_verified_claims', v_claims,
    'has_mobile', v_has,
    'mobile_hint', v_hint,
    'registry_name', case when v_found then r.full_name end,
    'expiry', case when v_found then r.expiry_date end);
end
$fn$;

comment on function public.lawyer_signup_registry_check(uuid, text) is
  '20261124_70: registry status / name match / other verified claims / mobile hint for the licence on the user''s own lawyer_profiles row; writes them on lawyer_signup_verifications. Never returns the mobile. service_role only.';

-- ── 4b. the registry mobile for his own, valid licence (server sends to it) ─
create or replace function public.lawyer_signup_registry_mobile(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select r.mobile
    from public.lawyer_profiles lp
    join public.lawyer_registry r
      on r.licence_no = public.lawyer_registry_norm_licence(lp.license_number)
   where lp.user_id = p_user
     and not r.archived
     and r.expiry_date is not null
     and r.expiry_date >= (pg_catalog.now() at time zone 'Asia/Riyadh')::date
$fn$;

comment on function public.lawyer_signup_registry_mobile(uuid) is
  '20261124_70: the registry mobile of the licence on the user''s own file, only while valid and not archived. The server sends the identity code to it and never stores or returns it. service_role only.';

-- ── 4c. issue a code (limits, then insert) ──────────────────────────────────
create or replace function public.lawyer_otp_issue(
  p_user uuid, p_purpose text, p_channel text, p_licence_no text,
  p_target_hash text, p_target_hint text, p_code_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_last  timestamptz;
  v_n     integer;
  v_old   timestamptz;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if p_user is null or p_purpose not in ('identity', 'email') then
    raise exception 'lawyer_otp_issue: bad arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lawyer_otp:' || p_user::text || ':' || p_purpose, 0));

  select max(created_at) into v_last from public.lawyer_otp_challenges
   where user_id = p_user and purpose = p_purpose and channel = p_channel;
  if v_last is not null and v_last > pg_catalog.now() - interval '60 seconds' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'cooldown',
      'retry_after', greatest(1, pg_catalog.ceil(60 - extract(epoch from pg_catalog.now() - v_last)))::integer);
  end if;

  select count(*)::integer, min(created_at) into v_n, v_old from public.lawyer_otp_challenges
   where user_id = p_user and purpose = p_purpose and created_at > pg_catalog.now() - interval '1 hour';
  if v_n >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_limit',
      'retry_after', greatest(1, pg_catalog.ceil(3600 - extract(epoch from pg_catalog.now() - v_old)))::integer);
  end if;

  select count(*)::integer into v_n from public.lawyer_otp_challenges
   where target_hash = p_target_hash and created_at > pg_catalog.now() - interval '24 hours';
  if v_n >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'target_limit', 'retry_after', 3600);
  end if;

  insert into public.lawyer_otp_challenges (user_id, purpose, channel, licence_no, target_hash, target_hint, code_hash)
  values (p_user, p_purpose, p_channel, p_licence_no, p_target_hash, p_target_hint, p_code_hash)
  returning id, expires_at into v_id, v_exp;

  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_exp);
end
$fn$;

comment on function public.lawyer_otp_issue(uuid, text, text, text, text, text, text) is
  '20261124_70: issue a code — 60 s cooldown per channel, 5 per hour per user+purpose, 10 per 24 h per target across all users. Stores hashes only. service_role only.';

-- ── 4d. verify a code (atomic) ──────────────────────────────────────────────
create or replace function public.lawyer_otp_verify(p_user uuid, p_purpose text, p_code_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_hit  record;
  v_open integer;
  v_max  integer;
begin
  if p_user is null or p_purpose not in ('identity', 'email') then
    raise exception 'lawyer_otp_verify: bad arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lawyer_otp:' || p_user::text || ':' || p_purpose, 0));

  select c.id, c.channel, c.licence_no, c.target_hint into v_hit
    from public.lawyer_otp_challenges c
   where c.user_id = p_user and c.purpose = p_purpose
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5
     and c.code_hash = p_code_hash
   order by c.created_at desc
   limit 1;

  if v_hit.id is not null then
    update public.lawyer_otp_challenges
       set consumed_at = pg_catalog.now()
     where user_id = p_user and purpose = p_purpose and consumed_at is null;

    if p_purpose = 'identity' then
      insert into public.lawyer_signup_verifications as v
             (user_id, identity_otp_verified_at, identity_otp_channel, identity_otp_licence_no, updated_at)
      values (p_user, pg_catalog.now(), v_hit.channel, v_hit.licence_no, pg_catalog.now())
      on conflict (user_id) do update
         set identity_otp_verified_at = excluded.identity_otp_verified_at,
             identity_otp_channel = excluded.identity_otp_channel,
             identity_otp_licence_no = excluded.identity_otp_licence_no,
             updated_at = excluded.updated_at;
    else
      insert into public.lawyer_signup_verifications as v (user_id, email_otp_verified_at, email_otp_hint, updated_at)
      values (p_user, pg_catalog.now(), v_hit.target_hint, pg_catalog.now())
      on conflict (user_id) do update
         set email_otp_verified_at = excluded.email_otp_verified_at,
             email_otp_hint = excluded.email_otp_hint,
             updated_at = excluded.updated_at;
    end if;
    return pg_catalog.jsonb_build_object('ok', true, 'channel', v_hit.channel);
  end if;

  select count(*)::integer into v_open from public.lawyer_otp_challenges c
   where c.user_id = p_user and c.purpose = p_purpose
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5;
  if v_open = 0 then
    if exists (select 1 from public.lawyer_otp_challenges c
                where c.user_id = p_user and c.purpose = p_purpose
                  and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts >= 5) then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update public.lawyer_otp_challenges c
     set attempts = c.attempts + 1
   where c.user_id = p_user and c.purpose = p_purpose
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5;
  select max(c.attempts) into v_max from public.lawyer_otp_challenges c
   where c.user_id = p_user and c.purpose = p_purpose
     and c.consumed_at is null and c.expires_at > pg_catalog.now();
  return pg_catalog.jsonb_build_object('ok', false, 'reason', 'wrong', 'attempts_left', greatest(0, 5 - coalesce(v_max, 5)));
end
$fn$;

comment on function public.lawyer_otp_verify(uuid, text, text) is
  '20261124_70: verify a code under an advisory lock — a hit consumes every open code of that purpose and stamps lawyer_signup_verifications; a miss adds one attempt to every open code (5 = dead). service_role only.';

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.lawyer_signup_registry_check(uuid, text)',
    'public.lawyer_signup_registry_mobile(uuid)',
    'public.lawyer_otp_issue(uuid, text, text, text, text, text, text)',
    'public.lawyer_otp_verify(uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

-- ── 5. the private bucket and the one own-folder insert policy ─────────────
do $bucket$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '20261124_70: storage.buckets not found — bucket lawyer-licences not created';
    return;
  end if;
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('lawyer-licences', 'lawyer-licences', false, 5242880,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  exception when insufficient_privilege then
    raise warning '20261124_70: this role may not write storage.buckets — run this file as supabase_admin';
  end;
end
$bucket$;

do $policy$
begin
  if to_regclass('storage.objects') is null then
    raise notice '20261124_70: storage.objects not found — no Storage policy created';
    return;
  end if;
  begin
    execute 'drop policy if exists "lawyer-licences insert own" on storage.objects';
    execute $p$create policy "lawyer-licences insert own" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'lawyer-licences'
                  and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  exception when insufficient_privilege then
    raise warning '20261124_70: this role may not change storage.objects policies — run this file as supabase_admin';
  end;
end
$policy$;

-- ── 6. verify — raises, so the transaction rolls back ───────────────────────
do $verify$
declare
  missing text := '';
  t text;
  r text;
  f text;
  c text;
begin
  foreach t in array array['public.lawyer_signup_verifications', 'public.lawyer_otp_challenges', 'public.lawyer_licence_images'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      missing := missing || format(' RLS is off on %s;', t);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach c in array array['INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(r, t, c) or (c <> 'DELETE' and has_any_column_privilege(r, t, c)) then
          missing := missing || format(' %s holds %s on %s;', r, c, t);
        end if;
      end loop;
      if r = 'anon' or t <> 'public.lawyer_signup_verifications' then
        if has_table_privilege(r, t, 'SELECT') or has_any_column_privilege(r, t, 'SELECT') then
          missing := missing || format(' %s may read %s;', r, t);
        end if;
      end if;
    end loop;
  end loop;

  if has_table_privilege('authenticated', 'public.lawyer_signup_verifications', 'SELECT') then
    missing := missing || ' authenticated holds table-level SELECT on lawyer_signup_verifications;';
  end if;
  foreach c in array array['licence_no', 'full_name_input', 'mobile_change_new_mobile', 'email_otp_hint',
                           'identity_otp_licence_no', 'decision_reasons', 'name_match'] loop
    if has_column_privilege('authenticated', 'public.lawyer_signup_verifications', c, 'SELECT') then
      missing := missing || format(' authenticated may read lawyer_signup_verifications.%s;', c);
    end if;
  end loop;
  if exists (select 1 from pg_policy where polrelid in ('public.lawyer_otp_challenges'::regclass, 'public.lawyer_licence_images'::regclass)) then
    missing := missing || ' a server-only table has a policy;';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.lawyer_signup_verifications'::regclass) <> 1
     or exists (select 1 from pg_policy where polrelid = 'public.lawyer_signup_verifications'::regclass and polcmd <> 'r') then
    missing := missing || ' lawyer_signup_verifications must carry exactly its one SELECT policy;';
  end if;

  foreach f in array array[
    'public.lawyer_signup_registry_check(uuid, text)',
    'public.lawyer_signup_registry_mobile(uuid)',
    'public.lawyer_otp_issue(uuid, text, text, text, text, text, text)',
    'public.lawyer_otp_verify(uuid, text, text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      missing := missing || format(' a session may execute %s;', f);
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      missing := missing || format(' service_role cannot execute %s;', f);
    end if;
    if not exists (select 1 from pg_proc where oid = f::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      missing := missing || format(' %s is not SECURITY DEFINER with an empty search_path;', f);
    end if;
  end loop;

  if to_regclass('storage.buckets') is not null
     and not exists (select 1 from storage.buckets where id = 'lawyer-licences' and public = false) then
    missing := missing || ' the private bucket lawyer-licences is missing (run as supabase_admin);';
  end if;
  if to_regclass('storage.objects') is not null then
    if not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'lawyer-licences insert own') then
      missing := missing || ' the lawyer-licences insert policy is missing (run as supabase_admin);';
    end if;
    if exists (select 1 from pg_policy
                where polrelid = 'storage.objects'::regclass and polcmd <> 'a'
                  and (coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '')) like '%lawyer-licences%') then
      missing := missing || ' a SELECT/UPDATE/DELETE policy names lawyer-licences;';
    end if;
    -- A policy that names no bucket at all could open this bucket too.
    for r in select polname from pg_policy
              where polrelid = 'storage.objects'::regclass
                and polcmd in ('r', '*')
                and position('bucket_id' in coalesce(pg_get_expr(polqual, polrelid), '')) = 0 loop
      raise warning '20261124_70: storage.objects policy "%" reads without naming a bucket — it may expose lawyer-licences', r;
    end loop;
  end if;

  if missing <> '' then
    raise exception '20261124_70 verify FAILED:%', missing;
  end if;
  raise notice '20261124_70 verify: OK';
end
$verify$;

-- PostgREST: see the new tables and functions now.
notify pgrst, 'reload schema';

commit;

select '20261124_70 lawyer signup verification' as step,
       to_regclass('public.lawyer_signup_verifications') is not null
       and to_regclass('public.lawyer_otp_challenges') is not null
       and to_regclass('public.lawyer_licence_images') is not null
       and not has_table_privilege('authenticated', 'public.lawyer_otp_challenges', 'SELECT')
       and not has_table_privilege('authenticated', 'public.lawyer_licence_images', 'SELECT')
       and not has_function_privilege('authenticated', 'public.lawyer_signup_registry_mobile(uuid)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.lawyer_otp_verify(uuid, text, text)', 'EXECUTE')
       and (to_regclass('storage.buckets') is null
            or exists (select 1 from storage.buckets where id = 'lawyer-licences' and public = false))
       as ok;
