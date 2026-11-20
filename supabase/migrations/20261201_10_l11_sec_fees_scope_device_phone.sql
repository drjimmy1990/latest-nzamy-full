-- =============================================================================
-- Migration: 20261201_10_l11_sec_fees_scope_device_phone.sql   (verify id: l11_sec)
-- =============================================================================
-- Batch l11 (Patch A, owner-free), builder "sec". Four database pieces:
--
--   A. O1 / N01-20 / S1 — client-card FEES closed to direct reads.
--      A plain firm lawyer could read his colleagues' lawyer_clients.fee_total_sar
--      / fee_paid_sar straight from PostgREST (RLS lets every active member read
--      the firm's cards; the API hid the two figures only, in
--      src/lib/services/clientFeeVisibility.ts).
--        1. SELECT on lawyer_clients becomes a COLUMN grant: every column except
--           the two fee columns, for each API role (anon / authenticated) that
--           held SELECT before — nothing is broadened. Only SELECT is touched:
--           a table-level REVOKE of INSERT/UPDATE would also drop column grants,
--           and the API still writes the fees with the session (owner / partners).
--           Same shape as 20261016_10 (lawyer_profiles column lock).
--        2. public.lawyer_client_fee_visible(owner, firm) — the clientFeeVisibility
--           rule once, in SQL: the card's owner; or, for a firm card, the firm's
--           owner or an ACTIVE member whose role is managing_partner, partner or
--           finance_manager (FEE_VISIBLE_FIRM_ROLES). Internal (service_role only).
--        3. public.lawyer_client_fees(ids uuid[]) → (id, fee_total_sar, fee_paid_sar)
--           SECURITY DEFINER, EXECUTE for authenticated: the fees of the asked
--           cards that rule lets the caller see; any other card is simply absent.
--           At most 1000 ids per call (the routes send 500 at a time).
--      NOTE for whoever adds a column to lawyer_clients later: a new column is
--      NOT readable by the session roles until it is granted (re-running this
--      file grants every non-fee column again).
--
--   B. O2 — library_device_gate: the admin 'exempt' early return is removed
--      (file 19 «بلا أي bypass»). CREATE OR REPLACE of the 20261129_40 body,
--      otherwise identical (the now-unused v_type lookup is gone with it).
--      Skipped with a NOTICE where the function does not exist.
--
--   C. O3 — firm hearings / tasks / dashboard notes with NO case: a trainee or
--      legal secretary of the row's firm (public.firm_case_scoped_member,
--      20261129_10) reads only his own rows or rows assigned to him. RESTRICTIVE
--      SELECT policies «firm role scope: no-case rows own only», TO authenticated.
--      can_access_case_row is NOT changed; every other role reads what it read.
--        hearings:        owner_user_id or assignee_user_id (when the column exists)
--        tasks:           owner_user_id or assignee_user_id
--        dashboard_notes: author_user_id
--      task_steps follow their task (their policy is an EXISTS on tasks).
--
--   D. R6 — one VERIFIED account per mobile. The mobile is profiles.phone (E.164,
--      20260921_04) and «verified» lives on lawyer_profiles / provider_profiles,
--      so a single unique index cannot express it. Instead two triggers, each
--      serialised by an advisory lock on the number:
--        * trg_verified_phone_unique on lawyer_profiles / provider_profiles —
--          BEFORE INSERT OR UPDATE OF verification_status, when a row BECOMES
--          'verified': refused (23505, «verified_phone_taken…») if another
--          account that is already a verified lawyer/provider has the same
--          profiles.phone;
--        * trg_verified_phone_unique on profiles — BEFORE UPDATE OF phone, when
--          a verified lawyer/provider moves to a number another verified one holds.
--      Like the per-licence rule (20261122_40) it counts VERIFIED accounts only,
--      so an unverified sign-up cannot block a number. Duplicates that already
--      exist are never touched: the file counts them and says so in a NOTICE
--      (the triggers only refuse NEW duplicates; nothing fails).
--
-- HOW TO RUN (server)
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261201_10_l11_sec_fees_scope_device_phone.sql
--   Expect: NOTICE  l11_sec verify: OK  and a row with `t`.
--   Idempotent: safe to run twice.
--
-- RUN ORDER — AFTER THE CODE DEPLOY (part A)
--   The OLD /api/v1/lawyer/clients code selects fee_total_sar / fee_paid_sar
--   with the session; once part A runs that read answers 42501 («تعذّر تحميل
--   دليل الموكّلين»). The NEW code reads the fees through lawyer_client_fees and
--   falls back to the old read while the function is missing, so it works both
--   before and after this file. Prerequisites: 20261129_10 (firm_case_scoped_member)
--   and 20261129_40 (the device gate it replaces).
--   RE-RUN HAZARD: re-running 20261129_40 puts the admin exemption back; re-run
--   this file after it.
--
-- ROLLBACK
--   A: grant select on public.lawyer_clients to authenticated;   (re-opens the fees)
--   B: re-run 20261129_40_library_read_log.sql
--   C: drop policy "firm role scope: no-case rows own only" on public.hearings / tasks / dashboard_notes;
--   D: drop trigger trg_verified_phone_unique on public.lawyer_profiles / provider_profiles / profiles;
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- ── A. fees ──────────────────────────────────────────────────────────────────
do $a$
declare
  v_cols  text;
  v_had   text[] := '{}';
  r       text;
begin
  if to_regclass('public.lawyer_clients') is null then
    raise notice '20261201_10: public.lawyer_clients is not here — part A skipped';
    return;
  end if;
  if not (select pg_catalog.count(*) from pg_catalog.pg_attribute where attrelid = to_regclass('public.lawyer_clients') and attname in ('fee_total_sar', 'fee_paid_sar') and not attisdropped) = 2 then
    raise notice '20261201_10: lawyer_clients has no fee_total_sar / fee_paid_sar here — part A skipped';
    return;
  end if;

  execute $fn$
    create or replace function public.lawyer_client_fee_visible(p_owner uuid, p_firm uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $$
      select auth.uid() is not null and (
        p_owner = auth.uid()
        or (p_firm is not null and (
              exists (select 1 from public.firm_profiles fp
                       where fp.id = p_firm and fp.owner_user_id = auth.uid())
           or exists (select 1 from public.firm_members m
                       where m.firm_id = p_firm and m.user_id = auth.uid()
                         and m.status = 'active'
                         and m.role in ('managing_partner', 'partner', 'finance_manager')))))
    $$
  $fn$;
  comment on function public.lawyer_client_fee_visible(uuid, uuid) is
    'O1 (20261201_10): may the caller see a client card''s fees? Its owner; for a firm card the firm owner or an ACTIVE managing_partner / partner / finance_manager. Equal to canSeeClientFees + FEE_VISIBLE_FIRM_ROLES (src/lib/services/clientFeeVisibility.ts). Internal.';
  revoke all on function public.lawyer_client_fee_visible(uuid, uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.lawyer_client_fee_visible(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.lawyer_client_fee_visible(uuid, uuid) from authenticated;
  end if;

  execute $fn$
    create or replace function public.lawyer_client_fees(p_ids uuid[])
    returns table (id uuid, fee_total_sar numeric, fee_paid_sar numeric)
    language sql
    stable
    security definer
    set search_path = ''
    as $$
      select lc.id, lc.fee_total_sar, lc.fee_paid_sar
        from public.lawyer_clients lc
       where p_ids is not null
         and pg_catalog.cardinality(p_ids) <= 1000
         and lc.id = any (p_ids)
         and public.lawyer_client_fee_visible(lc.owner_user_id, lc.firm_id)
    $$
  $fn$;
  comment on function public.lawyer_client_fees(uuid[]) is
    'O1 (20261201_10): the fees of the asked client cards that the caller may see (lawyer_client_fee_visible); other cards are absent. ≤ 1000 ids. The only way a session reads lawyer_clients.fee_total_sar / fee_paid_sar.';
  revoke all on function public.lawyer_client_fees(uuid[]) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.lawyer_client_fees(uuid[]) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.lawyer_client_fees(uuid[]) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.lawyer_client_fees(uuid[]) to service_role;
    grant execute on function public.lawyer_client_fee_visible(uuid, uuid) to service_role;
  end if;

  -- The column list (every column but the two fees), read now: a column added
  -- later is picked up by a re-run.
  select pg_catalog.string_agg(pg_catalog.quote_ident(a.attname), ', ' order by a.attnum)
    into v_cols
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.lawyer_clients'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname not in ('fee_total_sar', 'fee_paid_sar');

  -- Who could read the table before (table-level or column-level, directly or
  -- through PUBLIC) gets the column list back; nobody else gets anything.
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r)
       and has_any_column_privilege(r, 'public.lawyer_clients', 'SELECT') then
      v_had := v_had || r;
    end if;
  end loop;

  revoke select on public.lawyer_clients from public;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute pg_catalog.format('revoke select on public.lawyer_clients from %I', r);
    end if;
  end loop;
  foreach r in array v_had loop
    execute pg_catalog.format('grant select (%s) on public.lawyer_clients to %I', v_cols, r);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.lawyer_clients to service_role;
  end if;

  comment on column public.lawyer_clients.fee_total_sar is
    'Private since 20261201_10 (O1): no session SELECT on the two fee columns; read through public.lawyer_client_fees(ids) (owner, firm owner, managing_partner, partner, finance_manager).';
end
$a$;

-- ── B. device gate: no admin exemption ──────────────────────────────────────
do $b$
begin
  if to_regprocedure('public.library_device_gate(uuid,text,text,uuid,boolean)') is null
     or to_regclass('public.user_devices') is null
     or to_regclass('public.library_monitor_settings') is null then
    raise notice '20261201_10: library_device_gate / user_devices / library_monitor_settings is not here — part B skipped';
    return;
  end if;

  execute $fn$
create or replace function public.library_device_gate(
  p_user          uuid,
  p_device_hash   text,
  p_label         text,
  p_session       uuid,
  p_code_required boolean)
returns table (
  status         text,
  device_limit   int,
  device_id      uuid,
  devices        jsonb,
  sessions_ended int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled  boolean;
  v_limit    int;
  v_label    text;
  v_row      public.user_devices;
  v_verified int;
  v_id       uuid;
  v_list     jsonb;
  v_found    boolean;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'library_device_gate: invalid arguments' using errcode = '22023';
  end if;
  v_label := left(coalesce(nullif(btrim(p_label), ''), 'جهاز'), 120);

  select s.device_limit_enabled, s.device_limit into v_enabled, v_limit
    from public.library_monitor_settings s where s.id;
  v_limit := coalesce(v_limit, 2);
  if not coalesce(v_enabled, false) then
    return query select 'disabled'::text, v_limit, null::uuid, '[]'::jsonb, 0;
    return;
  end if;

  -- 20261201_10 (O2): no exemption — an admin is counted like everyone else.

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash;
  v_found := found;  -- the next SELECT INTO resets FOUND

  select pg_catalog.count(*)::int into v_verified from public.user_devices d
   where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null;

  v_list := coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label,
                                                           'first_seen', d.first_seen, 'last_seen', d.last_seen)
                                        order by d.last_seen desc)
                        from public.user_devices d
                       where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null), '[]'::jsonb);

  -- 1. A verified, active device. A new session is only recorded (20261129_40:
  --    the rule is the library's; no other session of the account is ended).
  if v_found and v_row.revoked_at is null and v_row.verified_at is not null then
    if p_session is not null and v_row.session_id is distinct from p_session then
      update public.user_devices d
         set session_id = p_session, opened_at = now(), last_seen = now(), label = v_label
       where d.id = v_row.id;
    elsif v_row.last_seen < now() - interval '5 minutes' or v_row.label is distinct from v_label then
      update public.user_devices d set last_seen = now(), label = v_label where d.id = v_row.id;
    end if;
    return query select 'ok'::text, v_limit, v_row.id, '[]'::jsonb, 0;
    return;
  end if;

  -- 2. A known device (verified once) that signed out: back in if there is room.
  if v_found and v_row.verified_at is not null then
    if v_verified >= v_limit then
      return query select 'refused'::text, v_limit, null::uuid, v_list, 0;
      return;
    end if;
    update public.user_devices d
       set revoked_at = null, revoked_by = null, revoke_reason = null, label = v_label,
           last_seen = now(), opened_at = now(), session_id = p_session
     where d.id = v_row.id;
    return query select 'ok'::text, v_limit, v_row.id, '[]'::jsonb, 0;
    return;
  end if;

  -- 3. A device never verified while the verified devices fill the limit: the
  --    third device is refused with the list (owner ٦٣ — never a suspension).
  if v_verified >= v_limit then
    return query select 'refused'::text, v_limit, null::uuid, v_list, 0;
    return;
  end if;

  -- 4. Room left, and the server cannot send the code: registered at once.
  if not coalesce(p_code_required, true) then
    insert into public.user_devices as d (user_id, device_hash, label, verified_at, opened_at, session_id)
    values (p_user, p_device_hash, v_label, now(), now(), p_session)
    on conflict on constraint user_devices_user_hash_key do update
       set revoked_at = null, revoked_by = null, revoke_reason = null, label = excluded.label,
           first_seen = now(), last_seen = now(), verified_at = now(), opened_at = now(),
           session_id = excluded.session_id, code_hash = null, code_expires_at = null, code_attempts = 0
    returning d.id into v_id;
    return query select 'registered'::text, v_limit, v_id, '[]'::jsonb, 0;
    return;
  end if;

  -- 5. Room left: a pending row waits for the e-mail code.
  insert into public.user_devices as d (user_id, device_hash, label)
  values (p_user, p_device_hash, v_label)
  on conflict on constraint user_devices_user_hash_key do update
     set revoked_at = null, revoked_by = null, revoke_reason = null,
         label = excluded.label, last_seen = now()
  returning d.id into v_id;
  return query select 'needs_code'::text, v_limit, v_id, '[]'::jsonb, 0;
end;
$$
  $fn$;

  comment on function public.library_device_gate(uuid, text, text, uuid, boolean) is
    'Owner ٤٠ / ٦٣ + register 14 item 9 (20261127_60 → 20261129_40 → 20261201_10): the library device gate — disabled / ok / needs_code / registered / refused. No admin exemption (O2, file 19). The rule is the LIBRARY''s only: it never ends a platform session (sessions_ended is always 0). The third device is refused with the list, never suspended. Service role only.';

  revoke all on function public.library_device_gate(uuid, text, text, uuid, boolean) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.library_device_gate(uuid, text, text, uuid, boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.library_device_gate(uuid, text, text, uuid, boolean) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.library_device_gate(uuid, text, text, uuid, boolean) to service_role;
  end if;
end
$b$;

-- ── C. firm rows with no case: trainee / secretary see their own ────────────
do $c$
declare
  pol  constant text := 'firm role scope: no-case rows own only';
  spec text[];
  t    text;
  own  text;
begin
  if to_regprocedure('public.firm_case_scoped_member(uuid)') is null then
    raise notice '20261201_10: public.firm_case_scoped_member is not here (20261129_10) — part C skipped';
    return;
  end if;
  foreach spec slice 1 in array array[
    array['hearings',        'case_request_id', 'owner_user_id',  'assignee_user_id'],
    array['tasks',           'case_request_id', 'owner_user_id',  'assignee_user_id'],
    array['dashboard_notes', 'case_request_id', 'author_user_id', '']
  ] loop
    t := spec[1];
    if to_regclass('public.' || t) is null then
      raise notice '20261201_10: public.% is not here — skipped', t;
      continue;
    end if;
    if (select pg_catalog.count(*) from information_schema.columns
         where table_schema = 'public' and table_name = t
           and column_name in (spec[2], spec[3], 'firm_id')) <> 3 then
      raise notice '20261201_10: public.% lacks % / % / firm_id — skipped', t, spec[2], spec[3];
      continue;
    end if;
    own := pg_catalog.format('%I = auth.uid()', spec[3]);
    if spec[4] <> '' and exists (select 1 from information_schema.columns
                                  where table_schema = 'public' and table_name = t and column_name = spec[4]) then
      own := own || pg_catalog.format(' or %I = auth.uid()', spec[4]);
    end if;
    execute pg_catalog.format('drop policy if exists %I on public.%I', pol, t);
    execute pg_catalog.format(
      'create policy %I on public.%I as restrictive for select to authenticated
         using (%I is not null or firm_id is null or %s or not public.firm_case_scoped_member(firm_id))',
      pol, t, spec[2], own);
  end loop;
end
$c$;

-- ── D. one verified account per mobile ───────────────────────────────────────
do $d$
declare
  v_arms  text := '';
  v_dups  integer;
  t       text;
begin
  if to_regclass('public.profiles') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone') then
    raise notice '20261201_10: public.profiles.phone is not here — part D skipped';
    return;
  end if;
  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is not null
       and (select pg_catalog.count(*) from information_schema.columns
             where table_schema = 'public' and table_name = t
               and column_name in ('user_id', 'verification_status')) = 2 then
      v_arms := v_arms || case when v_arms = '' then '' else ' or ' end
        || pg_catalog.format('exists (select 1 from public.%I x where x.user_id = p_user and x.verification_status = ''verified'')', t);
    end if;
  end loop;
  if v_arms = '' then
    raise notice '20261201_10: neither lawyer_profiles nor provider_profiles is here — part D skipped';
    return;
  end if;

  execute pg_catalog.format($fn$
    create or replace function public.is_verified_provider_account(p_user uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $$ select p_user is not null and (%s) $$
  $fn$, v_arms);
  comment on function public.is_verified_provider_account(uuid) is
    'R6 (20261201_10): the account holds a VERIFIED lawyer_profiles or provider_profiles row. Internal.';

  execute $fn$
    create or replace function public.verified_phone_taken(p_user uuid, p_phone text)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $$
      select p_phone is not null and pg_catalog.btrim(p_phone) <> ''
         and exists (select 1 from public.profiles p
                      where p.phone = p_phone
                        and p.id is distinct from p_user
                        and public.is_verified_provider_account(p.id))
    $$
  $fn$;
  comment on function public.verified_phone_taken(uuid, text) is
    'R6 (20261201_10): another account that is a VERIFIED lawyer/provider already has this mobile (profiles.phone, E.164). Used by trg_verified_phone_unique and the admin approval. service_role only.';

  execute $fn$
    create or replace function public.verified_phone_guard_profile_row()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      v_phone text;
    begin
      if new.verification_status is distinct from 'verified' then
        return new;
      end if;
      if tg_op = 'UPDATE' and old.verification_status is not distinct from 'verified' then
        return new;
      end if;
      select p.phone into v_phone from public.profiles p where p.id = new.user_id;
      if v_phone is null or pg_catalog.btrim(v_phone) = '' then
        return new;
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('verified_phone:' || v_phone, 0));
      if public.verified_phone_taken(new.user_id, v_phone) then
        raise exception 'verified_phone_taken: another verified account already uses this mobile number'
          using errcode = '23505', constraint = 'verified_phone_unique';
      end if;
      return new;
    end
    $$
  $fn$;

  execute $fn$
    create or replace function public.verified_phone_guard_profiles()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    begin
      if new.phone is null or pg_catalog.btrim(new.phone) = '' or new.phone is not distinct from old.phone then
        return new;
      end if;
      if not public.is_verified_provider_account(new.id) then
        return new;
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('verified_phone:' || new.phone, 0));
      if public.verified_phone_taken(new.id, new.phone) then
        raise exception 'verified_phone_taken: another verified account already uses this mobile number'
          using errcode = '23505', constraint = 'verified_phone_unique';
      end if;
      return new;
    end
    $$
  $fn$;

  foreach t in array array['public.is_verified_provider_account(uuid)', 'public.verified_phone_taken(uuid, text)',
                           'public.verified_phone_guard_profile_row()', 'public.verified_phone_guard_profiles()'] loop
    execute pg_catalog.format('revoke all on function %s from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', t);
    end if;
  end loop;

  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is null
       or (select pg_catalog.count(*) from information_schema.columns
            where table_schema = 'public' and table_name = t
              and column_name in ('user_id', 'verification_status')) <> 2 then
      continue;
    end if;
    execute pg_catalog.format('drop trigger if exists trg_verified_phone_unique on public.%I', t);
    execute pg_catalog.format(
      'create trigger trg_verified_phone_unique before insert or update of verification_status on public.%I
         for each row execute function public.verified_phone_guard_profile_row()', t);
  end loop;
  drop trigger if exists trg_verified_phone_unique on public.profiles;
  create trigger trg_verified_phone_unique before update of phone on public.profiles
    for each row execute function public.verified_phone_guard_profiles();

  create index if not exists profiles_phone_idx on public.profiles (phone) where phone is not null;

  select pg_catalog.count(*) into v_dups
    from (select p.phone from public.profiles p
           where p.phone is not null and public.is_verified_provider_account(p.id)
           group by p.phone having pg_catalog.count(*) > 1) d;
  if v_dups > 0 then
    raise notice '20261201_10: R6 — % mobile number(s) are ALREADY shared by more than one verified account; they are left as they are (only new duplicates are refused). Resolve them in the admin verification queue.', v_dups;
  else
    raise notice '20261201_10: R6 — no mobile number is shared by two verified accounts';
  end if;
end
$d$;

-- ── E. verify — raises, so the transaction rolls back ───────────────────────
do $verify$
declare
  missing    text := '';
  r          text;
  a          record;
  t          record;
  leaks      text;
  can_probe  boolean;
  probe_fail text := '';
  def        text;
begin
  -- A
  if (select pg_catalog.count(*) from pg_catalog.pg_attribute where attrelid = to_regclass('public.lawyer_clients') and attname in ('fee_total_sar', 'fee_paid_sar') and not attisdropped) = 2 then
    foreach r in array array['anon', 'authenticated'] loop
      if not exists (select 1 from pg_roles where rolname = r) then continue; end if;
      if has_table_privilege(r, 'public.lawyer_clients', 'SELECT') then
        missing := missing || pg_catalog.format(' %s holds table-level SELECT on lawyer_clients;', r);
      end if;
      if has_column_privilege(r, 'public.lawyer_clients', 'fee_total_sar', 'SELECT')
         or has_column_privilege(r, 'public.lawyer_clients', 'fee_paid_sar', 'SELECT') then
        missing := missing || pg_catalog.format(' %s can read a fee column of lawyer_clients;', r);
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      for a in
        select att.attname::text as name from pg_attribute att
         where att.attrelid = 'public.lawyer_clients'::regclass and att.attnum > 0 and not att.attisdropped
           and att.attname not in ('fee_total_sar', 'fee_paid_sar')
      loop
        if not has_column_privilege('authenticated', 'public.lawyer_clients', a.name, 'SELECT') then
          missing := missing || pg_catalog.format(' authenticated cannot read lawyer_clients.%s;', a.name);
        end if;
      end loop;
      if not has_function_privilege('authenticated', 'public.lawyer_client_fees(uuid[])', 'EXECUTE') then
        missing := missing || ' authenticated cannot execute lawyer_client_fees;';
      end if;
      if has_function_privilege('authenticated', 'public.lawyer_client_fee_visible(uuid,uuid)', 'EXECUTE') then
        missing := missing || ' authenticated can execute lawyer_client_fee_visible (internal);';
      end if;
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon')
       and has_function_privilege('anon', 'public.lawyer_client_fees(uuid[])', 'EXECUTE') then
      missing := missing || ' anon can execute lawyer_client_fees;';
    end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure('public.lawyer_client_fees(uuid[])')
                    and prosecdef and proconfig @> array['search_path=""']) then
      missing := missing || ' lawyer_client_fees is missing or not SECURITY DEFINER with search_path '''';';
    end if;
    def := pg_catalog.pg_get_functiondef('public.lawyer_client_fee_visible(uuid,uuid)'::regprocedure);
    if pg_catalog.strpos(def, '''managing_partner'', ''partner'', ''finance_manager''') = 0 then
      missing := missing || ' lawyer_client_fee_visible lost the managing_partner / partner / finance_manager list;';
    end if;
    -- No policy reaching the API roles reads a fee column (it would answer 42501).
    select string_agg(distinct pg_catalog.format('%s on %s', p.polname, p.polrelid::regclass), '; ')
      into leaks
      from pg_policy p
      join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = p.oid
                      and d.refclassid = 'pg_class'::regclass
                      and d.refobjid = 'public.lawyer_clients'::regclass and d.refobjsubid > 0
      join pg_attribute att on att.attrelid = d.refobjid and att.attnum = d.refobjsubid
     where att.attname in ('fee_total_sar', 'fee_paid_sar');
    if leaks is not null then
      missing := missing || pg_catalog.format(' policies read a fee column: %s;', leaks);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role')
       and not has_table_privilege('service_role', 'public.lawyer_clients', 'SELECT') then
      missing := missing || ' service_role lost SELECT on lawyer_clients;';
    end if;
  end if;

  -- B
  if to_regprocedure('public.library_device_gate(uuid,text,text,uuid,boolean)') is not null
     and to_regclass('public.user_devices') is not null then
    def := pg_catalog.pg_get_functiondef('public.library_device_gate(uuid,text,text,uuid,boolean)'::regprocedure);
    if pg_catalog.strpos(def, '''exempt''') > 0 then
      missing := missing || ' library_device_gate still answers ''exempt'' (20261129_40 re-run after this file?);';
    end if;
    if pg_catalog.strpos(def, 'auth.sessions') > 0 then
      missing := missing || ' library_device_gate ends platform sessions again;';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated')
       and has_function_privilege('authenticated', 'public.library_device_gate(uuid,text,text,uuid,boolean)', 'EXECUTE') then
      missing := missing || ' authenticated can execute library_device_gate;';
    end if;
  end if;

  -- C
  if to_regprocedure('public.firm_case_scoped_member(uuid)') is not null then
    for t in
      select v.tb from (values ('hearings'), ('tasks'), ('dashboard_notes')) v(tb)
       where to_regclass('public.' || v.tb) is not null
    loop
      if not exists (select 1 from pg_policy
                      where polrelid = ('public.' || t.tb)::regclass
                        and polname = 'firm role scope: no-case rows own only' and not polpermissive) then
        missing := missing || pg_catalog.format(' %s has no restrictive «no-case rows own only» policy;', t.tb);
      end if;
    end loop;
  end if;

  -- D
  if to_regprocedure('public.verified_phone_taken(uuid,text)') is not null then
    if not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
                    and tgname = 'trg_verified_phone_unique' and not tgisinternal) then
      missing := missing || ' profiles has no trg_verified_phone_unique;';
    end if;
    if to_regclass('public.lawyer_profiles') is not null
       and not exists (select 1 from pg_trigger where tgrelid = 'public.lawyer_profiles'::regclass
                        and tgname = 'trg_verified_phone_unique' and not tgisinternal) then
      missing := missing || ' lawyer_profiles has no trg_verified_phone_unique;';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated')
       and has_function_privilege('authenticated', 'public.verified_phone_taken(uuid,text)', 'EXECUTE') then
      missing := missing || ' authenticated can execute verified_phone_taken;';
    end if;
  end if;

  if missing <> '' then
    raise exception 'l11_sec verify:%', missing;
  end if;

  -- Live probe (A): as anon and as authenticated, every readable table and
  -- view in `public`. Only "permission denied for table lawyer_clients" is this
  -- file's doing; anything else is reported and left alone.
  if (select pg_catalog.count(*) from pg_catalog.pg_attribute where attrelid = to_regclass('public.lawyer_clients') and attname in ('fee_total_sar', 'fee_paid_sar') and not attisdropped) = 2 then
    foreach r in array array['anon', 'authenticated'] loop
      if not exists (select 1 from pg_roles where rolname = r) then continue; end if;
      can_probe := true;
      begin
        execute pg_catalog.format('set local role %I', r);
      exception when insufficient_privilege then
        can_probe := false;
      end;
      if not can_probe then
        raise notice '20261201_10: this session cannot SET ROLE % — the live probe for that role was skipped', r;
        continue;
      end if;
      execute 'set local statement_timeout = ''5s''';
      for t in
        select c.oid::regclass as rel
          from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
         where ns.nspname = 'public' and c.relkind in ('r', 'p', 'v')
           and has_any_column_privilege(r, c.oid, 'SELECT')
           and c.oid <> 'public.lawyer_clients'::regclass
         order by 1
      loop
        begin
          execute pg_catalog.format('select 1 from %s limit 1', t.rel);
        exception
          when insufficient_privilege then
            if sqlerrm ilike '%table lawyer_clients%' then
              probe_fail := probe_fail || pg_catalog.format(' %s as %s (%s);', t.rel, r, sqlerrm);
            end if;
          when query_canceled then
            raise notice '20261201_10: % probe of % timed out (5 s) — skipped', r, t.rel;
          when others then
            null;
        end;
      end loop;
      execute 'reset statement_timeout';
      execute 'reset role';
    end loop;
    if probe_fail <> '' then
      raise exception 'l11_sec verify: a read fails on the locked lawyer_clients fee columns:%', probe_fail;
    end if;
  end if;

  raise notice 'l11_sec verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261201_10 l11 sec (O1 fee columns closed to sessions + lawyer_client_fees; O2 device gate without admin exemption; O3 no-case firm rows own-only for trainee/secretary; R6 one verified account per mobile)' as migration,
       case when not (select pg_catalog.count(*) from pg_catalog.pg_attribute where attrelid = to_regclass('public.lawyer_clients') and attname in ('fee_total_sar', 'fee_paid_sar') and not attisdropped) = 2 then true
            else not has_column_privilege('authenticated', 'public.lawyer_clients', 'fee_total_sar', 'SELECT')
                 and to_regprocedure('public.lawyer_client_fees(uuid[])') is not null end
       and coalesce(pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure('public.library_device_gate(uuid,text,text,uuid,boolean)')), '''exempt''') = 0, true)
       as ok;
