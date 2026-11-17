-- =============================================================================
-- Migration: 20261126_50_accounts_limits.sql
-- =============================================================================
-- PURPOSE (owner TODO 17 Nov 2026: R9, S9 «8», S10 «8» firm seat cap)
--
--   1. R9 — advocate or consultant (Art. 18), asked of EVERY lawyer.
--      lawyer_profiles.practice_kind is NOT NULL DEFAULT 'advocate'
--      (20261019_20), so the column alone cannot tell a lawyer who chose
--      «محامٍ مترافع» from one who was never asked (a Google sign-up that
--      claimed `lawyer` in /onboarding). New column:
--        lawyer_profiles.practice_kind_confirmed_at timestamptz NULL
--      * A BEFORE INSERT trigger stamps it when the signup metadata carries
--        user_type 'lawyer' (the /register/provider form — its lawyer and
--        consultant cards ARE the choice). A row inserted with an explicit
--        value (the onboarding claim route, service role) keeps it.
--      * Backfill: every existing row is stamped EXCEPT the accounts that
--        reached `lawyer` through the Google claim (an admin_audit_events
--        row 'account_type_claimed' → lawyer) or that have only non-e-mail
--        identities in auth.identities. Those are asked once, by
--        /onboarding/practice-kind, before the lawyer dashboard opens.
--      * Nobody but the service role writes it (no session grant at all).
--
--   2. R9 — the entity type «مكتب استشارات مرخص (م١٨)».
--        firm_profiles.firm_kind text NOT NULL DEFAULT 'law_firm'
--        CHECK (firm_kind in ('law_firm', 'consulting_office'))
--      * BEFORE INSERT trigger: firm_kind = 'consulting_office' when the
--        signup metadata says exactly that (/register/provider firm card).
--        The onboarding claim route sends it explicitly (service role).
--      * A session (anon / authenticated) can never change it (guard trigger).
--      * public.firm_court_rows_stay_with_member (owner ٣١٢, 20261030_12 —
--        copied from its LATEST definition) now also treats a firm whose
--        firm_kind is 'consulting_office' as a consulting office; before
--        this file only a firm OWNED by a consultant lawyer counted, and a
--        `firm` account has no lawyer_profiles row, so it never fired.
--
--   3. S9 — a FREE SOLO lawyer: at most 5 ACTIVE cases and 10 clients.
--      «Free solo» = profiles.user_type 'lawyer' AND NOT any of:
--        * an active, unexpired, non-free `subscriptions` row of his own;
--        * an active founder seat (founder_seats.status 'active', not ended);
--        * an ACTIVE membership of any firm (firm_members.status 'active');
--        * a demo account (profiles.is_demo — it has its own, stricter caps).
--      Active case = a service_requests row ASSIGNED to him (assigned_to —
--        his own case, a marketplace claim, a converted consultation) whose
--        status is not completed / cancelled / draft, receiver <>
--        'ai_workspace', and not a legacy hearing/task/client flag row.
--      Client = a lawyer_clients row he owns whose status is not 'archived'.
--      Triggers on both tables, keyed on ROW columns (the service role is
--      held too), under a per-user advisory lock. They refuse only a row
--      that BECOMES counted (insert, re-assignment to him, reopening,
--      un-archiving): an account already over the cap (a lapsed plan) keeps
--      editing what it has.
--        → raise 'plan_limit:cases' | 'plan_limit:clients' (P0001)
--      public.solo_lawyer_limits() = (5, 10).
--
--   4. Firm seat cap. Seats = firm_members rows with status invited, active
--      or suspended (the owner's own managing_partner row included).
--        cap = greatest(plan cap, firm_profiles.max_seats)
--        plan cap: 'firm-enterprise' 15, 'firm-basic' 5 (owner TODO S10 «8»,
--          5/15), read from the firm's active unexpired subscription (the
--          owner account's, or one keyed on the firm entity);
--        firm_profiles.max_seats (existing column, default 5) is the
--          per-firm override sales/admin raise (service role only) — extra
--          seats are not sold online yet («لزيادة المقاعد تواصل معنا»).
--      * BEFORE INSERT OR UPDATE OF status on firm_members: a row that
--        BECOMES a seat (insert, removed → invited/active) is refused when the
--        firm is full → 'firm_seats_full' (P0001). invited → active and
--        active ⇄ suspended do not change the count. Covers the direct
--        invite, the re-invite, the link redeem and any service-role write.
--      * BEFORE INSERT on team_invitations (entity_type 'firm', status
--        pending): a new invitation LINK is refused while the firm is already
--        full (pending links themselves are not seats — the redeem is checked
--        by the trigger above, so the last pending link is never
--        double-counted).
--      public.firm_seat_status(p_firm) → (used, cap) for the firm's managers.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261126_50_accounts_limits.sql
--   Expect: NOTICE  20261126_50 verify: OK  and a row with `t`.
--
-- RUN ORDER: BEFORE the l6-accounts deploy. The new code writes
--   lawyer_profiles.practice_kind_confirmed_at and firm_profiles.firm_kind in
--   the onboarding claim; on a database without them that claim answers 500.
--   Needs 20261019_20 (practice_kind) and 20260903_phase2 (firm membership).
--   RE-RUN HAZARD: re-running 20261030_12 puts back the consultant-owner-only
--   firm_court_rows_stay_with_member — re-run this file after it.
--   This file itself is idempotent (safe to run any number of times).
--
-- ROLLBACK (one transaction):
--   drop trigger if exists trg_solo_lawyer_case_cap on public.service_requests;
--   drop trigger if exists trg_solo_lawyer_client_cap on public.lawyer_clients;
--   drop trigger if exists trg_firm_seat_cap on public.firm_members;
--   drop trigger if exists trg_firm_invite_seat_cap on public.team_invitations;
--   drop trigger if exists trg_lawyer_profiles_kind_confirmed on public.lawyer_profiles;
--   drop trigger if exists trg_firm_profiles_kind_from_signup on public.firm_profiles;
--   drop trigger if exists trg_firm_profiles_kind_guard on public.firm_profiles;
--   drop function if exists public.solo_lawyer_case_cap(), public.solo_lawyer_client_cap(),
--     public.solo_lawyer_is_capped(uuid), public.solo_lawyer_limits(),
--     public.firm_seat_cap_guard(), public.firm_invite_seat_guard(),
--     public.firm_seat_cap(uuid), public.firm_seats_used(uuid), public.firm_seat_status(uuid),
--     public.firm_plan_seat_cap(text), public.lawyer_profile_kind_confirmed(),
--     public.firm_profile_kind_from_signup(), public.firm_profile_kind_guard();
--   then re-run 20261030_12 (firm_court_rows_stay_with_member without firm_kind);
--   the two columns are records — keep them (or drop them last).
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.lawyer_profiles') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = 'practice_kind') then
    raise exception '20261126_50: run 20261019_20_lawyer_practice_kind.sql first (lawyer_profiles.practice_kind)';
  end if;
  if to_regclass('public.firm_members') is null or to_regclass('public.firm_profiles') is null then
    raise exception '20261126_50: public.firm_profiles / firm_members are missing';
  end if;
  if to_regclass('public.service_requests') is null then
    raise exception '20261126_50: public.service_requests is missing';
  end if;
end
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. R9 — lawyer_profiles.practice_kind_confirmed_at
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.lawyer_profiles add column if not exists practice_kind_confirmed_at timestamptz;

comment on column public.lawyer_profiles.practice_kind_confirmed_at is
  'R9 (20261126_50): when the lawyer chose advocate / consultant (Art. 18). NULL = never asked (a Google claim before R9) — /onboarding/practice-kind asks once. Service role only.';

-- A column added after 20261016_10 starts with no session privilege; keep it so.
do $g$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all (practice_kind_confirmed_at) on public.lawyer_profiles from anon';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'revoke all (practice_kind_confirmed_at) on public.lawyer_profiles from authenticated';
  end if;
end
$g$;

create or replace function public.lawyer_profile_kind_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_meta jsonb;
begin
  if new.practice_kind_confirmed_at is not null then
    return new;
  end if;
  begin
    select pg_catalog.to_jsonb(u) -> 'raw_user_meta_data' into v_meta
      from auth.users u
     where u.id = new.user_id;
    -- /register/provider: the lawyer card and the consultant card both send
    -- user_type 'lawyer' — the card IS the choice. A Google sign-up has no
    -- user_type in its metadata and is asked in /onboarding.
    if v_meta is not null and pg_catalog.jsonb_typeof(v_meta) = 'object'
       and v_meta ->> 'user_type' = 'lawyer' then
      new.practice_kind_confirmed_at := pg_catalog.now();
    end if;
  exception when others then
    raise warning 'lawyer_profile_kind_confirmed: % (%) — row for % kept unconfirmed', sqlerrm, sqlstate, new.user_id;
  end;
  return new;
end
$fn$;

comment on function public.lawyer_profile_kind_confirmed() is
  'R9 (20261126_50): BEFORE INSERT on lawyer_profiles — practice_kind_confirmed_at = now() when the signup metadata user_type is lawyer (the register form chose the card). Never raises.';

drop trigger if exists trg_lawyer_profiles_kind_confirmed on public.lawyer_profiles;
create trigger trg_lawyer_profiles_kind_confirmed
  before insert on public.lawyer_profiles
  for each row execute function public.lawyer_profile_kind_confirmed();

-- Backfill: every row the Google claim did not create. Re-runs touch only NULLs.
do $bf$
declare
  v_claimed uuid[] := '{}';
  v_oauth   uuid[] := '{}';
begin
  if to_regclass('public.admin_audit_events') is not null then
    select coalesce(array_agg(distinct (e.target_id)::uuid), '{}') into v_claimed
      from public.admin_audit_events e
     where e.action = 'account_type_claimed'
       and pg_catalog.to_jsonb(e) -> 'after_state' ->> 'user_type' = 'lawyer'
       and e.target_id ~ '^[0-9a-fA-F-]{36}$';
  end if;
  if to_regclass('auth.identities') is not null then
    execute $q$
      select coalesce(array_agg(distinct i.user_id), '{}')
        from auth.identities i
       where i.provider <> 'email'
         and not exists (select 1 from auth.identities e
                          where e.user_id = i.user_id and e.provider = 'email')$q$
      into v_oauth;
  end if;
  update public.lawyer_profiles lp
     set practice_kind_confirmed_at = coalesce(lp.created_at, pg_catalog.now())
   where lp.practice_kind_confirmed_at is null
     and not (lp.user_id = any (v_claimed))
     and not (lp.user_id = any (v_oauth));
end
$bf$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. R9 — firm_profiles.firm_kind «مكتب استشارات مرخص (م١٨)»
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.firm_profiles add column if not exists firm_kind text not null default 'law_firm';
-- The seat override this file reads. Every live database has it (20260603);
-- the guard only matters to a schema built without it.
alter table public.firm_profiles add column if not exists max_seats int not null default 5;

do $c$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.firm_profiles'::regclass
                    and conname = 'firm_profiles_firm_kind_check') then
    alter table public.firm_profiles
      add constraint firm_profiles_firm_kind_check check (firm_kind in ('law_firm', 'consulting_office'));
  end if;
end
$c$;

comment on column public.firm_profiles.firm_kind is
  'R9 (20261126_50): law_firm = شركة / مكتب محاماة; consulting_office = مكتب استشارات مرخص (Art. 18). Set at signup (metadata firm_kind) or by the onboarding claim; a session never changes it.';

create or replace function public.firm_profile_kind_from_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_meta jsonb;
begin
  if new.firm_kind is distinct from 'law_firm' then
    return new;   -- an explicit value (the claim route) stands
  end if;
  begin
    select pg_catalog.to_jsonb(u) -> 'raw_user_meta_data' into v_meta
      from auth.users u
     where u.id = new.owner_user_id;
    if v_meta is not null and pg_catalog.jsonb_typeof(v_meta) = 'object'
       and v_meta ->> 'firm_kind' = 'consulting_office' then
      new.firm_kind := 'consulting_office';
    end if;
  exception when others then
    raise warning 'firm_profile_kind_from_signup: % (%) — firm of % kept law_firm', sqlerrm, sqlstate, new.owner_user_id;
  end;
  return new;
end
$fn$;

comment on function public.firm_profile_kind_from_signup() is
  'R9 (20261126_50): BEFORE INSERT on firm_profiles — firm_kind = consulting_office when the signup metadata says exactly that. Never raises.';

drop trigger if exists trg_firm_profiles_kind_from_signup on public.firm_profiles;
create trigger trg_firm_profiles_kind_from_signup
  before insert on public.firm_profiles
  for each row execute function public.firm_profile_kind_from_signup();

create or replace function public.firm_profile_kind_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if current_user in ('anon', 'authenticated')
     and ((tg_op = 'INSERT' and new.firm_kind is distinct from 'law_firm')
          or (tg_op = 'UPDATE' and (new.firm_kind is distinct from old.firm_kind
                                    or new.max_seats is distinct from old.max_seats))) then
    raise exception 'firm_kind_locked' using errcode = '42501';
  end if;
  return new;
end
$fn$;

comment on function public.firm_profile_kind_guard() is
  'R9 / seat cap (20261126_50): anon / authenticated never set firm_kind or max_seats (SECURITY INVOKER on purpose: it reads current_user).';

drop trigger if exists trg_firm_profiles_kind_guard on public.firm_profiles;
create trigger trg_firm_profiles_kind_guard
  before insert or update of firm_kind, max_seats on public.firm_profiles
  for each row execute function public.firm_profile_kind_guard();

-- ٣١٢ — copied from its LATEST definition (20261030_12) + the firm_kind arm.
create or replace function public.firm_court_rows_stay_with_member(p_firm uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v boolean;
begin
  if coalesce(current_setting('nzamy.firm_transfer_reason', true), '') <> 'member_removed' then
    return false;
  end if;
  if p_firm is null then
    return false;
  end if;
  -- 20261126_50 (R9): the firm itself says it is a consulting office
  if exists (select 1 from public.firm_profiles fp
              where fp.id = p_firm and fp.firm_kind = 'consulting_office') then
    return true;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = 'practice_kind') then
    return false;
  end if;
  execute 'select exists (select 1 from public.firm_profiles fp
                             join public.lawyer_profiles lp on lp.user_id = fp.owner_user_id
                            where fp.id = $1 and lp.practice_kind = ''consultant'')'
    into v using p_firm;
  return coalesce(v, false);
end;
$$;

comment on function public.firm_court_rows_stay_with_member(uuid) is
  '20261030_12 (owner ٣١٢) + 20261126_50 (R9): true while a member is being REMOVED from a consulting office (firm_kind consulting_office, or the firm owner is a legal consultant, Art. 18): his hearings, appointments, case stages and court deadlines stay in his name. Always false on the account-deletion path.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. S9 — the free solo lawyer: 5 active cases, 10 clients
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.solo_lawyer_limits()
returns table (cases int, clients int)
language sql
immutable
set search_path = ''
as $fn$
  select 5, 10;
$fn$;

comment on function public.solo_lawyer_limits() is
  'S9 (20261126_50): a free solo lawyer holds at most 5 active cases and 10 non-archived clients.';

create or replace function public.solo_lawyer_is_capped(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_profile jsonb;
  v_hit     boolean := false;
begin
  if p_user is null then
    return false;
  end if;
  select pg_catalog.to_jsonb(p) into v_profile from public.profiles p where p.id = p_user;
  if v_profile is null or v_profile ->> 'user_type' is distinct from 'lawyer' then
    return false;
  end if;
  -- a demo account has its own, stricter caps (20261125_50)
  if coalesce((v_profile ->> 'is_demo')::boolean, false) then
    return false;
  end if;
  -- a member of a firm works under the firm's plan
  if exists (select 1 from public.firm_members m where m.user_id = p_user and m.status = 'active') then
    return false;
  end if;
  -- a paid plan of his own (status active, period not ended, not a free tier)
  if to_regclass('public.subscriptions') is not null then
    execute 'select exists (select 1 from public.subscriptions s
                             where s.user_id = $1 and s.status = ''active''
                               and s.tier <> ''free''
                               and (s.current_period_end is null or s.current_period_end > now()))'
      into v_hit using p_user;
    if v_hit then
      return false;
    end if;
  end if;
  -- a founder member
  if to_regclass('public.founder_seats') is not null then
    execute 'select exists (select 1 from public.founder_seats f
                             where f.user_id = $1 and f.status = ''active''
                               and (f.ends_at is null or f.ends_at > now()))'
      into v_hit using p_user;
    if v_hit then
      return false;
    end if;
  end if;
  return true;
end
$fn$;

comment on function public.solo_lawyer_is_capped(uuid) is
  'S9 (20261126_50): true for a lawyer with no active paid plan, no active founder seat, no active firm membership and not a demo account. Service role only.';

-- an active case of the lawyer named in assigned_to
create or replace function public.solo_lawyer_case_counts(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select (p ->> 'assigned_to') is not null
     and coalesce(p ->> 'status', '') not in ('completed', 'cancelled', 'draft')
     and coalesce(p ->> 'receiver', '') <> 'ai_workspace'
     and coalesce(p -> 'metadata' ->> 'hearing', '') <> 'true'
     and coalesce(p -> 'metadata' ->> 'task', '') <> 'true'
     and coalesce(p -> 'metadata' ->> 'client', '') <> 'true';
$fn$;

create or replace function public.solo_lawyer_case_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_new  jsonb := pg_catalog.to_jsonb(new);
  v_old  jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) end;
  v_user uuid;
  v_cap  int;
  v_n    int;
begin
  if not public.solo_lawyer_case_counts(v_new) then
    return new;
  end if;
  v_user := (v_new ->> 'assigned_to')::uuid;
  -- already one of his counted cases: an ordinary edit, never refused
  if tg_op = 'UPDATE'
     and public.solo_lawyer_case_counts(v_old)
     and (v_old ->> 'assigned_to') = (v_new ->> 'assigned_to') then
    return new;
  end if;
  if not public.solo_lawyer_is_capped(v_user) then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('solo_cap:cases:' || v_user::text));
  select l.cases into v_cap from public.solo_lawyer_limits() l;
  select count(*) into v_n
    from public.service_requests sr
   where sr.assigned_to = v_user
     and sr.id is distinct from new.id
     and public.solo_lawyer_case_counts(pg_catalog.to_jsonb(sr));
  if v_n >= v_cap then
    raise exception 'plan_limit:cases' using errcode = 'P0001', detail = 'service_requests';
  end if;
  return new;
end
$fn$;

comment on function public.solo_lawyer_case_cap() is
  'S9 (20261126_50): a free solo lawyer (solo_lawyer_is_capped) may not take a 6th active case (assigned_to). Only a row that BECOMES counted is checked. Keyed on row columns, so the service role is held too.';

drop trigger if exists trg_solo_lawyer_case_cap on public.service_requests;
create trigger trg_solo_lawyer_case_cap
  before insert or update of assigned_to, status, receiver, metadata on public.service_requests
  for each row execute function public.solo_lawyer_case_cap();

create or replace function public.solo_lawyer_client_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_new  jsonb := pg_catalog.to_jsonb(new);
  v_old  jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) end;
  v_user uuid  := nullif(v_new ->> 'owner_user_id', '')::uuid;
  v_cap  int;
  v_n    int;
begin
  if v_user is null or coalesce(v_new ->> 'status', 'active') = 'archived' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and coalesce(v_old ->> 'status', 'active') <> 'archived'
     and (v_old ->> 'owner_user_id') = (v_new ->> 'owner_user_id') then
    return new;
  end if;
  if not public.solo_lawyer_is_capped(v_user) then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('solo_cap:clients:' || v_user::text));
  select l.clients into v_cap from public.solo_lawyer_limits() l;
  select count(*) into v_n
    from public.lawyer_clients lc
   where lc.owner_user_id = v_user
     and lc.id is distinct from new.id
     and coalesce(pg_catalog.to_jsonb(lc) ->> 'status', 'active') <> 'archived';
  if v_n >= v_cap then
    raise exception 'plan_limit:clients' using errcode = 'P0001', detail = 'lawyer_clients';
  end if;
  return new;
end
$fn$;

comment on function public.solo_lawyer_client_cap() is
  'S9 (20261126_50): a free solo lawyer may not hold an 11th non-archived client. Only a row that BECOMES counted is checked.';

do $t$
begin
  if to_regclass('public.lawyer_clients') is not null then
    execute 'drop trigger if exists trg_solo_lawyer_client_cap on public.lawyer_clients';
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'lawyer_clients' and column_name = 'status') then
      execute 'create trigger trg_solo_lawyer_client_cap
                 before insert or update of status, owner_user_id on public.lawyer_clients
                 for each row execute function public.solo_lawyer_client_cap()';
    else
      execute 'create trigger trg_solo_lawyer_client_cap
                 before insert or update of owner_user_id on public.lawyer_clients
                 for each row execute function public.solo_lawyer_client_cap()';
    end if;
  else
    raise notice '20261126_50: public.lawyer_clients is not here — the client cap is skipped';
  end if;
end
$t$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. The firm seat cap
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.firm_plan_seat_cap(p_plan text)
returns int
language sql
immutable
set search_path = ''
as $fn$
  select case p_plan
           when 'firm-enterprise' then 15
           when 'firm-basic'      then 5
           else null
         end;
$fn$;

comment on function public.firm_plan_seat_cap(text) is
  'Seat cap (20261126_50, owner TODO S10 «8»: 5/15): firm-basic 5, firm-enterprise 15; null for any other plan.';

create or replace function public.firm_seat_cap(p_firm uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_owner    uuid;
  v_override int;
  v_plan     int;
begin
  select fp.owner_user_id, coalesce((pg_catalog.to_jsonb(fp) ->> 'max_seats')::int, 5)
    into v_owner, v_override
    from public.firm_profiles fp
   where fp.id = p_firm;
  if not found then
    return 0;
  end if;
  if to_regclass('public.subscriptions') is not null then
    execute 'select max(public.firm_plan_seat_cap(s.plan_id))
               from public.subscriptions s
              where (s.user_id = $1 or (s.entity_type = ''firm'' and s.entity_id = $2))
                and s.status = ''active''
                and (s.current_period_end is null or s.current_period_end > now())'
      into v_plan using v_owner, p_firm;
  end if;
  return greatest(coalesce(v_plan, 0), coalesce(v_override, 5));
end
$fn$;

comment on function public.firm_seat_cap(uuid) is
  'Seat cap (20261126_50): greatest(the active firm plan''s seats — basic 5, enterprise 15 —, firm_profiles.max_seats). max_seats is the per-firm override raised by sales/admin.';

create or replace function public.firm_seats_used(p_firm uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::int
    from public.firm_members m
   where m.firm_id = p_firm
     and m.status in ('invited', 'active', 'suspended');
$fn$;

comment on function public.firm_seats_used(uuid) is
  'Seat cap (20261126_50): seats taken = invited + active + suspended members (the owner''s row included).';

-- For the team page: the caller must manage the firm (owner or active managing partner).
create or replace function public.firm_seat_status(p_firm uuid)
returns table (used int, cap int)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'firm_seat_status: sign in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.firm_profiles fp where fp.id = p_firm and fp.owner_user_id = v_uid)
     and not exists (select 1 from public.firm_members m
                      where m.firm_id = p_firm and m.user_id = v_uid
                        and m.status = 'active' and m.role = 'managing_partner') then
    raise exception 'firm_seat_status: only the firm owner or a managing partner' using errcode = '42501';
  end if;
  return query select public.firm_seats_used(p_firm), public.firm_seat_cap(p_firm);
end
$fn$;

comment on function public.firm_seat_status(uuid) is
  'Seat cap (20261126_50): (used, cap) of a firm, for its owner or an active managing partner.';

create or replace function public.firm_seat_cap_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cap int;
  v_n   int;
begin
  if new.status not in ('invited', 'active', 'suspended') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('invited', 'active', 'suspended')
     and old.firm_id = new.firm_id then
    return new;   -- already a seat: accept, suspend, re-activate
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('firm_seats:' || new.firm_id::text));
  v_cap := public.firm_seat_cap(new.firm_id);
  select count(*) into v_n
    from public.firm_members m
   where m.firm_id = new.firm_id
     and m.id is distinct from new.id
     and m.status in ('invited', 'active', 'suspended');
  if v_n >= v_cap then
    raise exception 'firm_seats_full' using errcode = 'P0001', detail = 'firm_members';
  end if;
  return new;
end
$fn$;

comment on function public.firm_seat_cap_guard() is
  'Seat cap (20261126_50): a firm_members row that BECOMES a seat is refused when the firm is full (firm_seat_cap). Keyed on the row, so the service role is held too.';

drop trigger if exists trg_firm_seat_cap on public.firm_members;
create trigger trg_firm_seat_cap
  before insert or update of status, firm_id on public.firm_members
  for each row execute function public.firm_seat_cap_guard();

create or replace function public.firm_invite_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.entity_type is distinct from 'firm' or new.status is distinct from 'pending' or new.entity_id is null then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('firm_seats:' || new.entity_id::text));
  if public.firm_seats_used(new.entity_id) >= public.firm_seat_cap(new.entity_id) then
    raise exception 'firm_seats_full' using errcode = 'P0001', detail = 'team_invitations';
  end if;
  return new;
end
$fn$;

comment on function public.firm_invite_seat_guard() is
  'Seat cap (20261126_50): a new firm invitation link is refused while the firm''s seats are all taken. The redeem is held by trg_firm_seat_cap.';

do $t$
begin
  if to_regclass('public.team_invitations') is not null then
    execute 'drop trigger if exists trg_firm_invite_seat_cap on public.team_invitations';
    execute 'create trigger trg_firm_invite_seat_cap
               before insert on public.team_invitations
               for each row execute function public.firm_invite_seat_guard()';
  else
    raise notice '20261126_50: public.team_invitations is not here — the invitation-link check is skipped';
  end if;
end
$t$;

-- ── privileges ───────────────────────────────────────────────────────────────
do $gr$
declare
  fn text;
begin
  foreach fn in array array[
    'public.lawyer_profile_kind_confirmed()',
    'public.firm_profile_kind_from_signup()',
    'public.firm_profile_kind_guard()',
    'public.firm_court_rows_stay_with_member(uuid)',
    'public.solo_lawyer_is_capped(uuid)',
    'public.solo_lawyer_case_counts(jsonb)',
    'public.solo_lawyer_case_cap()',
    'public.solo_lawyer_client_cap()',
    'public.firm_plan_seat_cap(text)',
    'public.firm_seat_cap(uuid)',
    'public.firm_seats_used(uuid)',
    'public.firm_seat_status(uuid)',
    'public.firm_seat_cap_guard()',
    'public.firm_invite_seat_guard()'] loop
    execute pg_catalog.format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.solo_lawyer_is_capped(uuid) to service_role;
    grant execute on function public.solo_lawyer_limits() to service_role;
    grant execute on function public.firm_seat_cap(uuid) to service_role;
    grant execute on function public.firm_seats_used(uuid) to service_role;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    grant execute on function public.solo_lawyer_limits() to authenticated;
    grant execute on function public.firm_seat_status(uuid) to authenticated;
  end if;
end
$gr$;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  r record;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lawyer_profiles'
                    and column_name = 'practice_kind_confirmed_at') then
    raise exception '20261126_50 verify: lawyer_profiles.practice_kind_confirmed_at is missing';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_column_privilege('authenticated', 'public.lawyer_profiles', 'practice_kind_confirmed_at', 'SELECT')
          or has_column_privilege('authenticated', 'public.lawyer_profiles', 'practice_kind_confirmed_at', 'UPDATE'))
     and not has_table_privilege('authenticated', 'public.lawyer_profiles', 'SELECT') then
    raise exception '20261126_50 verify: authenticated holds a privilege on practice_kind_confirmed_at';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.firm_profiles'::regclass and conname = 'firm_profiles_firm_kind_check') then
    raise exception '20261126_50 verify: firm_profiles.firm_kind check is missing';
  end if;
  for r in
    select * from (values
      ('public.lawyer_profiles', 'trg_lawyer_profiles_kind_confirmed'),
      ('public.firm_profiles',   'trg_firm_profiles_kind_from_signup'),
      ('public.firm_profiles',   'trg_firm_profiles_kind_guard'),
      ('public.service_requests','trg_solo_lawyer_case_cap'),
      ('public.firm_members',    'trg_firm_seat_cap')) v(t, tg)
  loop
    if not exists (select 1 from pg_catalog.pg_trigger
                    where tgrelid = r.t::regclass and tgname = r.tg and not tgisinternal) then
      raise exception '20261126_50 verify: trigger % is missing on %', r.tg, r.t;
    end if;
  end loop;
  if to_regclass('public.lawyer_clients') is not null
     and not exists (select 1 from pg_catalog.pg_trigger
                      where tgrelid = 'public.lawyer_clients'::regclass and tgname = 'trg_solo_lawyer_client_cap') then
    raise exception '20261126_50 verify: trg_solo_lawyer_client_cap is missing on lawyer_clients';
  end if;
  if to_regclass('public.team_invitations') is not null
     and not exists (select 1 from pg_catalog.pg_trigger
                      where tgrelid = 'public.team_invitations'::regclass and tgname = 'trg_firm_invite_seat_cap') then
    raise exception '20261126_50 verify: trg_firm_invite_seat_cap is missing on team_invitations';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.firm_court_rows_stay_with_member(uuid)'::regprocedure), 'consulting_office') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.firm_court_rows_stay_with_member(uuid)'::regprocedure), 'member_removed') = 0 then
    raise exception '20261126_50 verify: firm_court_rows_stay_with_member lost the member_removed rule or the firm_kind arm';
  end if;
  if (select l.cases from public.solo_lawyer_limits() l) <> 5
     or (select l.clients from public.solo_lawyer_limits() l) <> 10
     or public.firm_plan_seat_cap('firm-basic') <> 5
     or public.firm_plan_seat_cap('firm-enterprise') <> 15 then
    raise exception '20261126_50 verify: the limits are not 5 / 10 and 5 / 15';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.solo_lawyer_is_capped(uuid)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.firm_seat_cap(uuid)', 'EXECUTE')) then
    raise exception '20261126_50 verify: a session may execute a server-only helper';
  end if;
  raise notice '20261126_50 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261126_50 accounts limits (R9 kinds, solo 5 cases / 10 clients, firm seats 5 / 15)' as step,
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'lawyer_profiles'
                   and column_name = 'practice_kind_confirmed_at')
        and exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'firm_profiles' and column_name = 'firm_kind')
        and exists (select 1 from pg_catalog.pg_trigger
                     where tgrelid = 'public.service_requests'::regclass and tgname = 'trg_solo_lawyer_case_cap')
        and exists (select 1 from pg_catalog.pg_trigger
                     where tgrelid = 'public.firm_members'::regclass and tgname = 'trg_firm_seat_cap')) as ok;
