-- =============================================================================
-- Migration: 20261206_80_admin_account_type_converter.sql
--            (batch l16-admin, verify id: l16_admin_account_type)
-- =============================================================================
-- PURPOSE (owner package 25 Nov, main report §٣.٣ — first slice of C14)
--
--   Until now an admin «changed the account type» by writing profiles.user_type
--   alone and was told to create the sector row by hand in the database. This
--   file adds ONE server-side converter for the three safe moves:
--     * lawyer advocate  ↔ lawyer consultant   (lawyer_profiles.practice_kind)
--     * individual       →  lawyer (advocate | consultant)
--     * individual       →  provider (notary | arbitrator | bailiff)
--   Every other move stays on the old path (a later, larger plan).
--
--   1. public.account_type_conversions — one row per conversion: from/to type
--      and kind, the written reason, the admin, and a SNAPSHOT of every
--      lawyer_profiles / provider_profiles row the account had before the
--      change («archived», never deleted). Server-only: RLS on, no policy,
--      no privilege for anon / authenticated.
--   2. public.admin_account_type_blockers(user) → text[] — the open
--      commitments that refuse a conversion:
--        paid_plan        an active / trialing / past-due subscription whose
--                         tier is not free and whose period has not ended;
--        firm_membership  a firm_members row invited / active / suspended, or
--                         a firm the account owns;
--        open_cases       a service request the account filed or holds that is
--                         not completed / cancelled / draft, or a cases row it
--                         is party to that is not closed;
--        founder_seat     a founder seat reserved or active (not ended).
--   3. public.admin_account_type_state(user) → jsonb — what the admin page
--      shows: the current type and kind, the verification state, the blockers
--      and the moves allowed from here.
--   4. public.admin_change_account_type(user, target, reason, actor) → jsonb —
--      the conversion, in one transaction, under a row lock on the profile:
--      checks the actor is an admin and not the account itself, the reason
--      (5–1000 characters), the move, and the blockers (refuses with the list:
--      nothing is changed); snapshots the sector rows; creates or updates the
--      lawyer_profiles / provider_profiles row and puts its verification
--      back to «pending» (l16 review: every move this slice allows is a new
--      kind — advocate ↔ consultant, a new sub_role — or a return to a
--      professional type, so the licence is reviewed again; a new row starts
--      «pending» anyway; the old state is kept in the snapshot and the audit
--      row); writes
--      profiles.user_type; logs one admin_audit_events row
--      (account_type_converted, before/after, reason) and the conversion row.
--      No row is ever deleted.
--   All three functions: SECURITY DEFINER, search_path '', service_role only
--   (the admin route /api/v1/admin/users/[id]/account-type, staff action
--   users.change_type).
--   5. Verify block — RAISES unless all of the above holds.
--
-- ORDER: BEFORE the deploy of batch l16-admin (the new route answers «الخدمة
--   غير متاحة مؤقتاً» — 503 — until it runs). Needs 20261019_20
--   (lawyer_profiles.practice_kind) and the provider_profiles table.
--   Optional and read only when present: 20261126_50 (practice_kind_confirmed_at),
--   20261101_10 (founder_seats), subscriptions, cases.
-- SAFE TO RE-RUN: yes (if not exists / create or replace).
-- RUN: docker exec -i <db container> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--        -f - < supabase/migrations/20261206_80_admin_account_type_converter.sql
--   Expect: NOTICE  l16_admin_account_type verify: OK …  and a row with `t`.
-- ROLLBACK:
--   drop function if exists public.admin_change_account_type(uuid, text, text, uuid);
--   drop function if exists public.admin_account_type_state(uuid);
--   drop function if exists public.admin_account_type_blockers(uuid);
--   (keep public.account_type_conversions — it is the history.)
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.profiles') is null then
    raise exception '20261206_80: public.profiles is missing';
  end if;
  if to_regclass('public.lawyer_profiles') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = 'practice_kind') then
    raise exception '20261206_80: run 20261019_20_lawyer_practice_kind.sql first (lawyer_profiles.practice_kind)';
  end if;
  if to_regclass('public.provider_profiles') is null then
    raise exception '20261206_80: public.provider_profiles is missing';
  end if;
  if to_regclass('public.admin_audit_events') is null
     or (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name = 'admin_audit_events'
            and column_name in ('actor_type', 'before_state', 'after_state')) < 3 then
    raise exception '20261206_80: public.admin_audit_events (actor_type, before_state, after_state) is missing';
  end if;
end
$pre$;

-- ── 1. The history table ─────────────────────────────────────────────────────
create table if not exists public.account_type_conversions (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  actor_id      uuid,
  from_type     text not null,
  from_kind     text,
  to_type       text not null,
  to_kind       text not null,
  reason        text not null,
  archived_rows jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists account_type_conversions_user_idx
  on public.account_type_conversions (user_id, created_at desc);

comment on table public.account_type_conversions is
  'l16 C14 (20261206_80): one row per admin account-type conversion — from/to, reason, admin, and a snapshot of the sector rows before the change (archived, never deleted). Server only.';

alter table public.account_type_conversions enable row level security;
revoke all on table public.account_type_conversions from public;
do $g$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.account_type_conversions from anon';
    execute 'revoke all on sequence public.account_type_conversions_id_seq from anon';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.account_type_conversions from authenticated';
    execute 'revoke all on sequence public.account_type_conversions_id_seq from authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant select, insert on table public.account_type_conversions to service_role';
    execute 'grant usage, select on sequence public.account_type_conversions_id_seq to service_role';
  end if;
end
$g$;

-- ── 2. The open commitments that refuse a conversion ─────────────────────────
create or replace function public.admin_account_type_blockers(p_user uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_out text[] := array[]::text[];
  v_hit boolean;
begin
  if p_user is null then
    return v_out;
  end if;

  if to_regclass('public.subscriptions') is not null then
    execute 'select exists (select 1 from public.subscriptions s
                             where s.user_id = $1
                               and s.status in (''active'', ''trialing'', ''past_due'')
                               and coalesce(s.tier, '''') <> ''free''
                               and (s.current_period_end is null or s.current_period_end > now()))'
      into v_hit using p_user;
    if v_hit then
      v_out := pg_catalog.array_append(v_out, 'paid_plan'::text);
    end if;
  end if;

  v_hit := false;
  if to_regclass('public.firm_members') is not null then
    execute 'select exists (select 1 from public.firm_members m
                             where m.user_id = $1 and m.status in (''invited'', ''active'', ''suspended''))'
      into v_hit using p_user;
  end if;
  if not v_hit and to_regclass('public.firm_profiles') is not null then
    execute 'select exists (select 1 from public.firm_profiles f where f.owner_user_id = $1)'
      into v_hit using p_user;
  end if;
  if v_hit then
    v_out := pg_catalog.array_append(v_out, 'firm_membership'::text);
  end if;

  v_hit := false;
  if to_regclass('public.service_requests') is not null then
    execute 'select exists (select 1 from public.service_requests r
                             where (r.requester_user_id = $1 or r.assigned_to = $1)
                               and coalesce(r.status, '''') not in (''completed'', ''cancelled'', ''draft''))'
      into v_hit using p_user;
  end if;
  if not v_hit and to_regclass('public.cases') is not null then
    execute 'select exists (select 1 from public.cases c
                             where (c.client_user_id = $1 or c.assigned_user_id = $1)
                               and coalesce(c.status, '''') not in (''closed'', ''completed'', ''cancelled'', ''canceled'', ''archived''))'
      into v_hit using p_user;
  end if;
  if v_hit then
    v_out := pg_catalog.array_append(v_out, 'open_cases'::text);
  end if;

  v_hit := false;
  if to_regclass('public.founder_seats') is not null then
    execute 'select exists (select 1 from public.founder_seats f
                             where f.user_id = $1 and f.status in (''reserved'', ''active'')
                               and (f.ends_at is null or f.ends_at > now()))'
      into v_hit using p_user;
  end if;
  if v_hit then
    v_out := pg_catalog.array_append(v_out, 'founder_seat'::text);
  end if;

  return v_out;
end
$fn$;

comment on function public.admin_account_type_blockers(uuid) is
  'l16 C14 (20261206_80): the open commitments (paid_plan, firm_membership, open_cases, founder_seat) that refuse an account-type conversion. Service role only.';

-- ── 3. What the admin page shows ─────────────────────────────────────────────
create or replace function public.admin_account_type_state(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_type     text;
  v_kind     text;
  v_lawyer   jsonb;
  v_provider jsonb;
  v_targets  text[] := array[]::text[];
begin
  select p.user_type into v_type from public.profiles p where p.id = p_user;
  if v_type is null then
    return jsonb_build_object('found', false);
  end if;
  select pg_catalog.to_jsonb(l) into v_lawyer from public.lawyer_profiles l where l.user_id = p_user;
  select pg_catalog.to_jsonb(v) into v_provider from public.provider_profiles v where v.user_id = p_user;

  if v_type = 'lawyer' then
    v_kind := coalesce(v_lawyer ->> 'practice_kind', 'advocate');
    v_targets := case when v_kind = 'consultant' then array['advocate'] else array['consultant'] end;
  elsif v_type = 'provider' then
    v_kind := v_provider ->> 'sub_role';
  elsif v_type = 'individual' then
    v_targets := array['advocate', 'consultant', 'notary', 'arbitrator', 'bailiff'];
  end if;

  return jsonb_build_object(
    'found', true,
    'user_type', v_type,
    'kind', v_kind,
    'lawyer_row', v_lawyer is not null,
    'lawyer_verification', v_lawyer ->> 'verification_status',
    'provider_row', v_provider is not null,
    'provider_verification', v_provider ->> 'verification_status',
    'blockers', pg_catalog.to_jsonb(public.admin_account_type_blockers(p_user)),
    'targets', pg_catalog.to_jsonb(v_targets)
  );
end
$fn$;

comment on function public.admin_account_type_state(uuid) is
  'l16 C14 (20261206_80): an account''s type and kind, verification state, blockers and the conversions allowed from here (admin page read). Service role only.';

-- ── 4. The conversion ────────────────────────────────────────────────────────
create or replace function public.admin_change_account_type(
  p_user   uuid,
  p_target text,
  p_reason text,
  p_actor  uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_reason    text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_from_type text;
  v_from_kind text;
  v_to_type   text;
  v_lawyer    jsonb;
  v_provider  jsonb;
  v_archived  jsonb := '[]'::jsonb;
  v_blockers  text[];
  v_has_confirmed boolean;
  v_conv_id   bigint;
  v_prev_verification text;
begin
  -- the caller
  if p_actor is null
     or not exists (select 1 from public.profiles a where a.id = p_actor and a.user_type = 'admin') then
    return jsonb_build_object('ok', false, 'code', 'actor_not_admin');
  end if;
  if p_user is null or p_user = p_actor then
    return jsonb_build_object('ok', false, 'code', 'self');
  end if;
  if pg_catalog.char_length(v_reason) < 5 or pg_catalog.char_length(v_reason) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;
  if p_target is null or p_target not in ('advocate', 'consultant', 'notary', 'arbitrator', 'bailiff') then
    return jsonb_build_object('ok', false, 'code', 'bad_target');
  end if;

  -- the account, locked for the whole conversion
  select p.user_type into v_from_type from public.profiles p where p.id = p_user for update;
  if v_from_type is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  select pg_catalog.to_jsonb(l) into v_lawyer from public.lawyer_profiles l where l.user_id = p_user for update;
  select pg_catalog.to_jsonb(v) into v_provider from public.provider_profiles v where v.user_id = p_user for update;
  v_to_type := case when p_target in ('advocate', 'consultant') then 'lawyer' else 'provider' end;

  if v_from_type = 'lawyer' then
    v_from_kind := coalesce(v_lawyer ->> 'practice_kind', 'advocate');
  elsif v_from_type = 'provider' then
    v_from_kind := v_provider ->> 'sub_role';
  end if;

  -- the three moves of this slice
  if not (
       (v_from_type = 'lawyer' and v_to_type = 'lawyer' and v_from_kind is distinct from p_target)
    or (v_from_type = 'individual')
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_supported', 'from_type', v_from_type, 'from_kind', v_from_kind);
  end if;

  v_blockers := public.admin_account_type_blockers(p_user);
  if pg_catalog.cardinality(v_blockers) > 0 then
    return jsonb_build_object('ok', false, 'code', 'open_commitments', 'blockers', pg_catalog.to_jsonb(v_blockers));
  end if;

  -- archive: a snapshot of every sector row the account had (nothing deleted)
  if v_lawyer is not null then
    v_archived := v_archived || jsonb_build_array(jsonb_build_object('table', 'lawyer_profiles', 'row', v_lawyer));
  end if;
  if v_provider is not null then
    v_archived := v_archived || jsonb_build_array(jsonb_build_object('table', 'provider_profiles', 'row', v_provider));
  end if;

  v_has_confirmed := exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = 'lawyer_profiles'
                                and column_name = 'practice_kind_confirmed_at');

  -- the verification state the target row had before (NULL = no row yet)
  v_prev_verification := case when v_to_type = 'lawyer' then v_lawyer ->> 'verification_status'
                              else v_provider ->> 'verification_status' end;

  if v_to_type = 'lawyer' then
    -- a new row starts «pending» (the column default); the signup trigger may
    -- read old signup metadata, so the kind is written explicitly after it
    insert into public.lawyer_profiles (user_id) values (p_user)
      on conflict (user_id) do nothing;
    if v_has_confirmed then
      execute 'update public.lawyer_profiles set practice_kind = $2, practice_kind_confirmed_at = now() where user_id = $1'
        using p_user, p_target;
    else
      update public.lawyer_profiles set practice_kind = p_target where user_id = p_user;
    end if;
  else
    insert into public.provider_profiles (user_id, sub_role) values (p_user, p_target)
      on conflict (user_id) do update set sub_role = excluded.sub_role;
  end if;

  -- l16 review: a new kind or a return to a professional type restarts the
  -- licence review — the row the account now works under is «pending»
  if v_to_type = 'lawyer' then
    update public.lawyer_profiles set verification_status = 'pending'
     where user_id = p_user and verification_status is distinct from 'pending';
  else
    update public.provider_profiles set verification_status = 'pending'
     where user_id = p_user and verification_status is distinct from 'pending';
  end if;

  if v_from_type <> v_to_type then
    update public.profiles set user_type = v_to_type where id = p_user;
  end if;

  insert into public.account_type_conversions
    (user_id, actor_id, from_type, from_kind, to_type, to_kind, reason, archived_rows)
  values
    (p_user, p_actor, v_from_type, v_from_kind, v_to_type, p_target, v_reason, v_archived)
  returning id into v_conv_id;

  insert into public.admin_audit_events
    (actor_id, actor_type, action, target_type, target_id, before_state, after_state, metadata)
  values (
    p_actor, 'admin', 'account_type_converted', 'user', p_user::text,
    jsonb_build_object('user_type', v_from_type, 'kind', v_from_kind, 'verification', v_prev_verification),
    jsonb_build_object('user_type', v_to_type, 'kind', p_target, 'verification', 'pending'),
    jsonb_build_object('reason', v_reason, 'conversion_id', v_conv_id,
                       'verification_reset', coalesce(v_prev_verification, 'none') <> 'pending',
                       'archived_tables', (select coalesce(jsonb_agg(e ->> 'table'), '[]'::jsonb) from jsonb_array_elements(v_archived) e))
  );

  return jsonb_build_object(
    'ok', true,
    'conversion_id', v_conv_id,
    'from_type', v_from_type, 'from_kind', v_from_kind,
    'to_type', v_to_type, 'to_kind', p_target,
    'verification', 'pending',
    'verification_before', v_prev_verification
  );
end
$fn$;

comment on function public.admin_change_account_type(uuid, text, text, uuid) is
  'l16 C14 (20261206_80): admin account-type conversion — advocate↔consultant, individual→lawyer (kind), individual→provider (sub_role). Refuses open commitments; snapshots the sector rows; puts the target row''s verification back to pending (l16 review: a new kind restarts the licence review; the old state is in the audit row); writes the audit row and the conversion row in the same transaction; deletes nothing. Service role only.';

-- ── privileges: service_role only ────────────────────────────────────────────
do $g$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_account_type_blockers(uuid)',
    'public.admin_account_type_state(uuid)',
    'public.admin_change_account_type(uuid, text, text, uuid)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end
$g$;

-- ── 5. Verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  f text;
  r text;
  c text;
begin
  if to_regclass('public.account_type_conversions') is null then
    missing := missing || ' account_type_conversions is missing;';
  else
    if not (select relrowsecurity from pg_class where oid = 'public.account_type_conversions'::regclass) then
      missing := missing || ' RLS is off on account_type_conversions;';
    end if;
    if exists (select 1 from pg_policy where polrelid = 'public.account_type_conversions'::regclass) then
      missing := missing || ' account_type_conversions has a policy;';
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
          if has_table_privilege(r, 'public.account_type_conversions', c)
             or (c <> 'DELETE' and has_any_column_privilege(r, 'public.account_type_conversions', c)) then
            missing := missing || format(' %s holds %s on account_type_conversions;', r, c);
          end if;
        end loop;
      end if;
    end loop;
  end if;

  foreach f in array array[
    'public.admin_account_type_blockers(uuid)',
    'public.admin_account_type_state(uuid)',
    'public.admin_change_account_type(uuid, text, text, uuid)'] loop
    if to_regprocedure(f) is null then
      missing := missing || format(' %s is missing;', f);
      continue;
    end if;
    if has_function_privilege('public', f, 'EXECUTE') then
      missing := missing || format(' PUBLIC may execute %s;', f);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, f, 'EXECUTE') then
        missing := missing || format(' %s may execute %s;', r, f);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role') and not has_function_privilege('service_role', f, 'EXECUTE') then
      missing := missing || format(' service_role cannot execute %s;', f);
    end if;
    if not exists (select 1 from pg_proc where oid = f::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      missing := missing || format(' %s is not SECURITY DEFINER with an empty search_path;', f);
    end if;
  end loop;

  if position('open_commitments' in coalesce(pg_get_functiondef(to_regprocedure('public.admin_change_account_type(uuid, text, text, uuid)')), '')) = 0 then
    missing := missing || ' admin_change_account_type does not refuse open commitments;';
  end if;
  if position('delete from' in lower(coalesce(pg_get_functiondef(to_regprocedure('public.admin_change_account_type(uuid, text, text, uuid)')), ''))) > 0 then
    missing := missing || ' admin_change_account_type deletes a row;';
  end if;

  if missing <> '' then
    raise exception 'l16_admin_account_type verify FAILED:%', missing;
  end if;
  raise notice 'l16_admin_account_type verify: OK — account_type_conversions is server-only; the converter, its state read and its blocker check are SECURITY DEFINER, service_role only; open commitments refuse; nothing is deleted';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261206_80 admin_account_type_converter' as migration, true as ok;
