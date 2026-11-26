-- =============================================================================
-- Migration: 20261206_70_roles_office_plan.sql   (batch l16 «roles»)
-- =============================================================================
-- PURPOSE
--
--   1. Owner decision س٢١٢ (25 Nov 2026) — «إدارة المكتب» is paid.
--        FREE: the profile, market intake (claiming / accepting a client's
--              request), the per-point tools, 1 GB of stored files.
--        PAID («إدارة المكتب» lawyer-pro / lawyer-bundle, the firm plans, a
--              founder seat): team & seats, cases & clients, shared
--              documents, tasks / hearings, invoices & reports.
--      ONE rule decides who is on the free side:
--        public.office_features_locked(p_user) — true for a PROFESSIONAL
--          account (user_type lawyer or firm, or an active member of a firm)
--          that is not a demo account and holds no office entitlement:
--        public.office_plan_entitled(p_user) — any of
--          * an active, unexpired, non-free `subscriptions` row of his own
--            (lawyer-pro, lawyer-bundle, consultant-independent, firm-basic,
--            firm-enterprise, an admin grant …);
--          * an active founder seat (founder_seats: the founder's ERP year);
--          * an ACTIVE membership of a firm whose owner holds one of the two
--            above, or that has its own firm-entity subscription.
--        public.my_office_features_locked() — the same for auth.uid(); the
--          one function a session may call (the API gate reads it).
--      The API routes refuse the paid writes with «متاحة في باقة إدارة
--      المكتب» (src/lib/auth/officePlan.ts). In the database:
--
--   2. Cases & clients (supersedes S9's free 5 cases / 10 clients, 20261126_50):
--        * public.solo_lawyer_limits() = (0, 0) — THE single constant of the
--          free allowance. Default 0 while the owner's question «does any
--          case / client stay free?» is open; change these two numbers only.
--        * public.solo_lawyer_is_capped(uuid) = office_features_locked(uuid):
--          a firm account and an individual member of an unpaid firm are now
--          held too (before: free solo `lawyer` accounts only).
--        * public.solo_lawyer_case_counts(jsonb): a counted case is now a
--          case the professional FILED for himself (requester_user_id =
--          assigned_to). A client's request he claimed from the market is NOT
--          counted — market intake stays free (س٢١٢). The other conditions
--          (status not completed/cancelled/draft, receiver <> ai_workspace,
--          no legacy hearing/task/client flag) are unchanged.
--        Existing rows stay readable and editable: only a row that BECOMES
--        counted is refused (unchanged trigger logic), → 'plan_limit:cases' /
--        'plan_limit:clients'.
--
--   3. 1 GB for the free side (D-132b). platform_settings.free_storage_quota
--      = {"gb": 1}. A BEFORE INSERT trigger on storage.objects refuses a NEW
--      object of an owner whose office features are locked once the bytes he
--      already stores reach the cap → 'storage_quota_full'. An object with no
--      owner (the service role: licence images, server-side stationery) is
--      never held. public.my_storage_quota() → (used_bytes, cap_bytes,
--      limited) for the upload screens. Skipped with a NOTICE where
--      storage.objects is missing or not ours to alter.
--
--   4. D-53 — the firm's team managers. firm_members writes were the owner's
--      only (20260921_03). New permissive arms for an ACTIVE member whose
--      role is managing_partner or hr_manager (public.firm_team_manager),
--      held by public.firm_members_manager_guard():
--        * a manager never grants, changes or removes the managing_partner
--          role (only the owner does), never touches the owner's row, never
--          changes his own role and never inserts himself;
--        * the invitee's own answer (20260922_02) and the owner are untouched.
--      public.set_firm_public_reviews(boolean) also admits the firm's active
--      managing partner (owner decision 20 named «مدير المكتب»).
--
-- HOW TO RUN (as supabase_admin — it alters a trigger on storage.objects):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_70_roles_office_plan.sql
--   Expect: NOTICE  20261206_70 verify: OK …  and a row with `t`.
--   Then run the `-- >>> verify:l16_roles` block of supabase/migrations/_verify.sql.
--
-- RUN ORDER: BEFORE the l16 deploy. The new code calls
--   my_office_features_locked() and my_storage_quota(); before this file both
--   answer 42883 and the code lets the write through (fail open on a missing
--   function only, logged once) — so the other order works too, it is just
--   ungated until this runs. Needs 20261126_50 (the S9 caps), 20260921_03
--   (firm_members RLS) and 20261017_31 (set_firm_public_reviews).
--   RE-RUN HAZARD: re-running 20261126_50 puts back the 5 / 10 caps and the
--   lawyer-only solo_lawyer_is_capped; re-running 20261017_31 puts back the
--   owner-only set_firm_public_reviews — re-run THIS file after either.
--   This file itself is idempotent (safe to run any number of times).
--
-- ROLLBACK (one transaction):
--   drop trigger if exists trg_storage_quota_guard on storage.objects;
--   drop trigger if exists trg_firm_members_manager_guard on public.firm_members;
--   drop policy if exists "firm_members: team manager can insert" on public.firm_members;
--   drop policy if exists "firm_members: team manager can update" on public.firm_members;
--   drop function if exists public.storage_quota_guard(), public.my_storage_quota(),
--     public.storage_used_bytes(uuid), public.storage_quota_cap_bytes(),
--     public.firm_members_manager_guard(), public.firm_team_manager(uuid),
--     public.my_office_features_locked();
--   then re-run 20261126_50 (S9 caps, lawyer-only rule) and 20261017_31
--   (owner-only review switch); office_features_locked / office_plan_entitled
--   may stay (nothing else calls them) or be dropped last;
--   delete from public.platform_settings where key = 'free_storage_quota';
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.solo_lawyer_is_capped(uuid)') is null
     or to_regprocedure('public.solo_lawyer_limits()') is null
     or to_regprocedure('public.solo_lawyer_case_counts(jsonb)') is null then
    raise exception '20261206_70: run 20261126_50_accounts_limits.sql first (the S9 caps)';
  end if;
  if to_regclass('public.firm_members') is null or to_regclass('public.firm_profiles') is null then
    raise exception '20261206_70: public.firm_profiles / firm_members are missing';
  end if;
  if to_regprocedure('public.is_firm_owner(uuid)') is null then
    raise exception '20261206_70: run 20260921_03_entity_rls_recursion_fix.sql first (is_firm_owner)';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261206_70: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
end
$pre$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Who holds «إدارة المكتب»
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.office_plan_entitled(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_hit boolean := false;
  v_subs boolean := to_regclass('public.subscriptions') is not null;
  v_seats boolean := to_regclass('public.founder_seats') is not null;
begin
  if p_user is null then
    return false;
  end if;
  -- his own paid plan (status active, period not ended, not a free tier)
  if v_subs then
    execute 'select exists (select 1 from public.subscriptions s
                             where s.user_id = $1 and s.status = ''active''
                               and coalesce(s.tier, ''free'') <> ''free''
                               and (s.current_period_end is null or s.current_period_end > pg_catalog.now()))'
      into v_hit using p_user;
    if v_hit then
      return true;
    end if;
  end if;
  -- his founder seat (the founder's ERP year)
  if v_seats then
    execute 'select exists (select 1 from public.founder_seats f
                             where f.user_id = $1 and f.status = ''active''
                               and (f.ends_at is null or f.ends_at > pg_catalog.now()))'
      into v_hit using p_user;
    if v_hit then
      return true;
    end if;
  end if;
  -- a member works under his firm's plan: the owner's own plan or seat, or
  -- a subscription keyed on the firm entity
  if v_subs then
    execute 'select exists (
               select 1
                 from public.firm_members m
                 join public.firm_profiles fp on fp.id = m.firm_id
                where m.user_id = $1 and m.status = ''active''
                  and exists (select 1 from public.subscriptions s
                               where (s.user_id = fp.owner_user_id
                                      or (s.entity_type = ''firm'' and s.entity_id = fp.id))
                                 and s.status = ''active''
                                 and coalesce(s.tier, ''free'') <> ''free''
                                 and (s.current_period_end is null or s.current_period_end > pg_catalog.now())))'
      into v_hit using p_user;
    if v_hit then
      return true;
    end if;
  end if;
  if v_seats then
    execute 'select exists (
               select 1
                 from public.firm_members m
                 join public.firm_profiles fp on fp.id = m.firm_id
                 join public.founder_seats f on f.user_id = fp.owner_user_id
                where m.user_id = $1 and m.status = ''active''
                  and f.status = ''active''
                  and (f.ends_at is null or f.ends_at > pg_catalog.now()))'
      into v_hit using p_user;
    if v_hit then
      return true;
    end if;
  end if;
  return false;
end
$fn$;

comment on function public.office_plan_entitled(uuid) is
  'س٢١٢ (20261206_70): true when p_user holds «إدارة المكتب» — an active unexpired non-free subscription of his own, an active founder seat, or an active membership of a firm whose owner holds either (or whose firm entity is subscribed). Service role only.';

create or replace function public.office_features_locked(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_profile jsonb;
  v_type    text;
begin
  if p_user is null then
    return false;
  end if;
  select pg_catalog.to_jsonb(p) into v_profile from public.profiles p where p.id = p_user;
  if v_profile is null then
    return false;
  end if;
  -- a demo account has its own, stricter caps (20261125_50)
  if coalesce((v_profile ->> 'is_demo')::boolean, false) then
    return false;
  end if;
  v_type := v_profile ->> 'user_type';
  if v_type = 'admin' then
    return false;
  end if;
  if v_type is distinct from 'lawyer' and v_type is distinct from 'firm'
     and not exists (select 1 from public.firm_members m where m.user_id = p_user and m.status = 'active') then
    return false;   -- not a professional account: a client, a company, staff …
  end if;
  return not public.office_plan_entitled(p_user);
end
$fn$;

comment on function public.office_features_locked(uuid) is
  'س٢١٢ (20261206_70): true for a professional account (lawyer / firm, or an active firm member) that is not a demo account and holds no «إدارة المكتب» (office_plan_entitled). Free side: profile, market intake, per-point tools, 1 GB. Service role only.';

create or replace function public.my_office_features_locked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.office_features_locked(auth.uid());
$fn$;

comment on function public.my_office_features_locked() is
  'س٢١٢ (20261206_70): office_features_locked(auth.uid()) — the API gate of the paid office writes. The caller learns only his own answer.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Cases & clients — the free allowance (supersedes S9's 5 / 10)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.solo_lawyer_limits()
returns table (cases int, clients int)
language sql
immutable
set search_path = ''
as $fn$
  -- THE free allowance (س٢١٢). 0 / 0 until the owner says whether any case
  -- or client stays free; change only these two numbers.
  select 0, 0;
$fn$;

comment on function public.solo_lawyer_limits() is
  'س٢١٢ (20261206_70, was S9 5/10 in 20261126_50): the free allowance of self-filed active cases and non-archived clients for an account without «إدارة المكتب». 0 / 0 while the owner''s question is open.';

create or replace function public.solo_lawyer_is_capped(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.office_features_locked(p_user);
$fn$;

comment on function public.solo_lawyer_is_capped(uuid) is
  'س٢١٢ (20261206_70): = office_features_locked(p_user) — a professional account without «إدارة المكتب» (paid plan, founder seat, or a paid firm''s membership), not a demo account. Service role only.';

-- a case he filed for himself (requester = assignee); a market claim is free
create or replace function public.solo_lawyer_case_counts(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select (p ->> 'assigned_to') is not null
     and (p ->> 'requester_user_id') is not distinct from (p ->> 'assigned_to')
     and coalesce(p ->> 'status', '') not in ('completed', 'cancelled', 'draft')
     and coalesce(p ->> 'receiver', '') <> 'ai_workspace'
     and coalesce(p -> 'metadata' ->> 'hearing', '') <> 'true'
     and coalesce(p -> 'metadata' ->> 'task', '') <> 'true'
     and coalesce(p -> 'metadata' ->> 'client', '') <> 'true';
$fn$;

comment on function public.solo_lawyer_case_counts(jsonb) is
  'س٢١٢ (20261206_70): a counted case is one the professional filed for himself (requester_user_id = assigned_to), open, not an ai_workspace order and not a legacy hearing/task/client row. A client''s request claimed from the market is not counted (market intake is free).';

-- the case trigger also fires on a change of requester_user_id now
do $t$
begin
  execute 'drop trigger if exists trg_solo_lawyer_case_cap on public.service_requests';
  execute 'create trigger trg_solo_lawyer_case_cap
             before insert or update of assigned_to, requester_user_id, status, receiver, metadata on public.service_requests
             for each row execute function public.solo_lawyer_case_cap()';
end
$t$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. 1 GB for the free side
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.platform_settings (key, value, description) values
  ('free_storage_quota', '{"gb": 1}'::jsonb,
   'سعة الملفات المحفوظة للحساب المهني دون باقة «إدارة المكتب» (س٢١٢): gb بالجيجابايت، عدد صحيح من 1 إلى 1000. يُرفض رفع ملف جديد إذا بلغت ملفاته هذا الحد، ولا يُحذف شيء (20261206_70)')
on conflict (key) do nothing;

create or replace function public.storage_quota_cap_bytes()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v jsonb;
  v_gb int := 1;
begin
  select s.value into v from public.platform_settings s where s.key = 'free_storage_quota';
  if v is not null and pg_catalog.jsonb_typeof(v -> 'gb') = 'number'
     and (v ->> 'gb') ~ '^[0-9]{1,4}$' and (v ->> 'gb')::int between 1 and 1000 then
    v_gb := (v ->> 'gb')::int;
  end if;
  return v_gb::bigint * 1073741824;
end
$fn$;

comment on function public.storage_quota_cap_bytes() is
  'س٢١٢ (20261206_70): platform_settings.free_storage_quota.gb (default 1) in bytes. Service role only.';

do $st$
declare
  v_owner_expr text;
  v_new_owner  text;
begin
  if to_regclass('storage.objects') is null then
    raise notice '20261206_70: storage.objects is not here — the storage quota is skipped';
    return;
  end if;
  -- newer storage schemas carry owner_id (text); older ones owner (uuid)
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
    v_owner_expr := 'o.owner_id = p_user::text';
    v_new_owner  := 'nullif(pg_catalog.to_jsonb(new) ->> ''owner_id'', '''')';
  elsif exists (select 1 from information_schema.columns
                 where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner') then
    v_owner_expr := 'o.owner = p_user';
    v_new_owner  := 'nullif(pg_catalog.to_jsonb(new) ->> ''owner'', '''')';
  else
    raise notice '20261206_70: storage.objects has no owner column — the storage quota is skipped';
    return;
  end if;

  execute pg_catalog.format($fn$
create or replace function public.storage_used_bytes(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $body$
  select coalesce(pg_catalog.sum(case when (o.metadata ->> 'size') ~ '^\d{1,18}$'
                                      then (o.metadata ->> 'size')::bigint else 0 end), 0)::bigint
    from storage.objects o
   where p_user is not null and %s;
$body$
$fn$, v_owner_expr);

  execute $c$ comment on function public.storage_used_bytes(uuid) is
  'س٢١٢ (20261206_70): bytes stored by p_user in every bucket (storage.objects metadata size, by owner). Service role only.' $c$;

  execute pg_catalog.format($fn$
create or replace function public.storage_quota_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_owner text := %s;
  v_user  uuid;
begin
  -- no owner: the service role wrote it (licence images, stationery) — never held
  if v_owner is null or v_owner !~ '^[0-9a-fA-F-]{36}$' then
    return new;
  end if;
  v_user := v_owner::uuid;
  if not public.office_features_locked(v_user) then
    return new;
  end if;
  if public.storage_used_bytes(v_user) >= public.storage_quota_cap_bytes() then
    raise exception 'storage_quota_full' using errcode = 'P0001', detail = 'storage.objects';
  end if;
  return new;
end
$body$
$fn$, v_new_owner);

  execute $c$ comment on function public.storage_quota_guard() is
  'س٢١٢ (20261206_70): a new object of an owner without «إدارة المكتب» (office_features_locked) is refused once his stored bytes reach free_storage_quota (1 GB). Objects with no owner (service role) pass. Nothing already stored is touched.' $c$;

  begin
    execute 'drop trigger if exists trg_storage_quota_guard on storage.objects';
    execute 'create trigger trg_storage_quota_guard
               before insert on storage.objects
               for each row execute function public.storage_quota_guard()';
  exception when insufficient_privilege then
    raise notice '20261206_70: not allowed to add a trigger on storage.objects — run this file as supabase_admin; the storage quota is NOT active';
  end;

  execute $q$
create or replace function public.my_storage_quota()
returns table (used_bytes bigint, cap_bytes bigint, limited boolean)
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'my_storage_quota: sign in' using errcode = '42501';
  end if;
  return query
    select public.storage_used_bytes(v_uid),
           public.storage_quota_cap_bytes(),
           public.office_features_locked(v_uid);
end
$body$
$q$;

  execute $c$ comment on function public.my_storage_quota() is
  'س٢١٢ (20261206_70): the caller''s stored bytes, the free cap, and whether the cap applies to him (limited = office_features_locked). For the upload screens.' $c$;
end
$st$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. D-53 — the firm's team managers (managing_partner, hr_manager)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.firm_team_manager(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_firm is not null and auth.uid() is not null and exists (
    select 1 from public.firm_members m
     where m.firm_id = p_firm and m.user_id = auth.uid() and m.status = 'active'
       and m.role in ('managing_partner', 'hr_manager'));
$fn$;

comment on function public.firm_team_manager(uuid) is
  'D-53 (20261206_70): the caller is an ACTIVE managing_partner or hr_manager of p_firm — he may invite, suspend and re-role members (firm_members_manager_guard holds what he may not). The owner is is_firm_owner().';

create or replace function public.firm_members_manager_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  -- the service role, a migration, an internal trigger, an admin: not this guard's business
  if v_uid is null or public.is_admin() then
    return new;
  end if;
  select fp.owner_user_id into v_owner from public.firm_profiles fp where fp.id = new.firm_id;
  if v_owner = v_uid then
    return new;   -- the owner
  end if;
  -- a member's own row: the invitee's answer (20260922_02) and nothing else —
  -- nobody but the owner changes his own role or moves his own row
  if new.user_id = v_uid or (tg_op = 'UPDATE' and old.user_id = v_uid) then
    if tg_op = 'UPDATE'
       and (new.role is distinct from old.role or new.firm_id is distinct from old.firm_id
            or new.user_id is distinct from old.user_id) then
      raise exception 'firm_members_manager_guard: only the firm owner changes your role' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' and public.firm_team_manager(new.firm_id) then
      raise exception 'firm_members_manager_guard: a manager does not add himself' using errcode = '42501';
    end if;
    return new;
  end if;
  if not public.firm_team_manager(new.firm_id) then
    return new;   -- RLS decides every other writer
  end if;
  -- a team manager acting on somebody else's row
  if new.user_id = v_owner then
    raise exception 'firm_members_manager_guard: the owner''s membership is the owner''s' using errcode = '42501';
  end if;
  if new.role = 'managing_partner' or (tg_op = 'UPDATE' and old.role = 'managing_partner') then
    raise exception 'firm_members_manager_guard: only the firm owner grants or changes a managing partner' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.firm_id is distinct from old.firm_id or new.user_id is distinct from old.user_id) then
    raise exception 'firm_members_manager_guard: a membership does not move' using errcode = '42501';
  end if;
  return new;
end
$fn$;

comment on function public.firm_members_manager_guard() is
  'D-53 (20261206_70): a team manager (firm_team_manager) never grants / changes / removes managing_partner, never touches the owner''s row, never re-roles or inserts himself, never moves a row to another firm or person. Owner, admin and service role pass.';

drop trigger if exists trg_firm_members_manager_guard on public.firm_members;
create trigger trg_firm_members_manager_guard
  before insert or update on public.firm_members
  for each row execute function public.firm_members_manager_guard();

drop policy if exists "firm_members: team manager can insert" on public.firm_members;
create policy "firm_members: team manager can insert" on public.firm_members
  for insert to authenticated
  with check (public.firm_team_manager(firm_id));

drop policy if exists "firm_members: team manager can update" on public.firm_members;
create policy "firm_members: team manager can update" on public.firm_members
  for update to authenticated
  using (public.firm_team_manager(firm_id))
  with check (public.firm_team_manager(firm_id));

-- owner decision 20: the review switch — the firm account, or its active managing partner
do $rv$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'firm_profiles' and column_name = 'public_reviews') then
    raise notice '20261206_70: firm_profiles.public_reviews is missing (20261017_31 not run) — set_firm_public_reviews left as is';
    return;
  end if;
  execute $f$
create or replace function public.set_firm_public_reviews(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_value boolean;
  v_firm  uuid;
begin
  if auth.uid() is null or p_enabled is null then
    raise exception 'set_firm_public_reviews: sign in as the firm account' using errcode = '42501';
  end if;

  select f.id into v_firm from public.firm_profiles f where f.owner_user_id = auth.uid() limit 1;
  if v_firm is null then
    select m.firm_id into v_firm
      from public.firm_members m
     where m.user_id = auth.uid() and m.status = 'active' and m.role = 'managing_partner'
     order by m.created_at
     limit 1;
  end if;
  if v_firm is null then
    raise exception 'set_firm_public_reviews: only the firm account or its managing partner may change its review visibility'
      using errcode = '42501';
  end if;

  update public.firm_profiles
     set public_reviews            = p_enabled,
         public_reviews_changed_at = now(),
         public_reviews_changed_by = auth.uid()
   where id = v_firm
  returning public_reviews into v_value;

  if not found then
    raise exception 'set_firm_public_reviews: only the firm account or its managing partner may change its review visibility'
      using errcode = '42501';
  end if;
  return v_value;
end;
$body$
$f$;
  execute $c$ comment on function public.set_firm_public_reviews(boolean) is
  'Owner decision 20 + D-53 (20261017_31, 20261206_70): the firm account (firm_profiles.owner_user_id) or its active managing partner switches the public display of the firm''s reviews. The only write path for the API roles.' $c$;
  execute 'revoke execute on function public.set_firm_public_reviews(boolean) from public, anon';
  execute 'grant execute on function public.set_firm_public_reviews(boolean) to authenticated, service_role';
end
$rv$;

-- ── privileges ───────────────────────────────────────────────────────────────
do $gr$
declare
  fn text;
begin
  foreach fn in array array[
    'public.office_plan_entitled(uuid)',
    'public.office_features_locked(uuid)',
    'public.my_office_features_locked()',
    'public.solo_lawyer_is_capped(uuid)',
    'public.solo_lawyer_case_counts(jsonb)',
    'public.storage_quota_cap_bytes()',
    'public.storage_used_bytes(uuid)',
    'public.storage_quota_guard()',
    'public.my_storage_quota()',
    'public.firm_team_manager(uuid)',
    'public.firm_members_manager_guard()'] loop
    if to_regprocedure(fn) is null then
      continue;   -- the storage functions where storage.objects is missing
    end if;
    execute pg_catalog.format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.office_plan_entitled(uuid) to service_role;
    grant execute on function public.office_features_locked(uuid) to service_role;
    grant execute on function public.solo_lawyer_is_capped(uuid) to service_role;
    grant execute on function public.solo_lawyer_limits() to service_role;
    grant execute on function public.storage_quota_cap_bytes() to service_role;
    if to_regprocedure('public.storage_used_bytes(uuid)') is not null then
      grant execute on function public.storage_used_bytes(uuid) to service_role;
    end if;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    grant execute on function public.my_office_features_locked() to authenticated;
    grant execute on function public.solo_lawyer_limits() to authenticated;
    -- RLS policy functions run as the caller: the two policies above need it
    grant execute on function public.firm_team_manager(uuid) to authenticated;
    if to_regprocedure('public.my_storage_quota()') is not null then
      grant execute on function public.my_storage_quota() to authenticated;
    end if;
  end if;
end
$gr$;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  missing text := '';
  f text;
begin
  if (select l.cases from public.solo_lawyer_limits() l) <> 0
     or (select l.clients from public.solo_lawyer_limits() l) <> 0 then
    missing := missing || ' solo_lawyer_limits() is not (0, 0);';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.solo_lawyer_is_capped(uuid)'::regprocedure), 'office_features_locked') = 0 then
    missing := missing || ' solo_lawyer_is_capped does not read office_features_locked;';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.solo_lawyer_case_counts(jsonb)'::regprocedure), 'requester_user_id') = 0 then
    missing := missing || ' solo_lawyer_case_counts still counts market claims;';
  end if;
  -- the immutable rule itself: a self-filed open case counts, a market claim does not
  if not public.solo_lawyer_case_counts('{"assigned_to":"00000000-0000-0000-0000-000000000001","requester_user_id":"00000000-0000-0000-0000-000000000001","status":"assigned","receiver":"lawyer"}'::jsonb)
     or public.solo_lawyer_case_counts('{"assigned_to":"00000000-0000-0000-0000-000000000001","requester_user_id":"00000000-0000-0000-0000-000000000002","status":"assigned","receiver":"lawyer"}'::jsonb) then
    missing := missing || ' solo_lawyer_case_counts does not tell a self-filed case from a market claim;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.service_requests'::regclass and tgname = 'trg_solo_lawyer_case_cap' and not tgisinternal) then
    missing := missing || ' trg_solo_lawyer_case_cap is missing;';
  end if;
  foreach f in array array[
    'public.office_plan_entitled(uuid)', 'public.office_features_locked(uuid)',
    'public.solo_lawyer_is_capped(uuid)', 'public.storage_quota_cap_bytes()',
    'public.firm_members_manager_guard()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' a session may execute %s;', f);
    end if;
    if not exists (select 1 from pg_catalog.pg_proc where oid = f::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      missing := missing || pg_catalog.format(' %s is not SECURITY DEFINER with an empty search_path;', f);
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.my_office_features_locked()', 'EXECUTE')
     or has_function_privilege('anon', 'public.my_office_features_locked()', 'EXECUTE') then
    missing := missing || ' my_office_features_locked is not for signed-in sessions only;';
  end if;
  if has_function_privilege('anon', 'public.firm_team_manager(uuid)', 'EXECUTE') then
    missing := missing || ' anon may execute firm_team_manager;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.firm_members'::regclass and tgname = 'trg_firm_members_manager_guard' and not tgisinternal) then
    missing := missing || ' trg_firm_members_manager_guard is missing;';
  end if;
  if (select count(*) from pg_catalog.pg_policy
       where polrelid = 'public.firm_members'::regclass
         and polname in ('firm_members: team manager can insert', 'firm_members: team manager can update')) <> 2 then
    missing := missing || ' the two team-manager policies on firm_members are missing;';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'free_storage_quota') then
    missing := missing || ' the free_storage_quota setting row is missing;';
  end if;
  if public.storage_quota_cap_bytes() < 1073741824 then
    missing := missing || ' storage_quota_cap_bytes() is under 1 GB;';
  end if;
  if to_regclass('storage.objects') is not null and to_regprocedure('public.my_storage_quota()') is not null then
    if has_function_privilege('anon', 'public.my_storage_quota()', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.storage_used_bytes(uuid)', 'EXECUTE') then
      missing := missing || ' the storage quota functions are open to the wrong roles;';
    end if;
  end if;

  if missing <> '' then
    raise exception '20261206_70 verify FAILED:%', missing;
  end if;
  raise notice '20261206_70 verify: OK — «إدارة المكتب» gate (office_features_locked), free allowance %/% , market claims not counted, firm team managers held by their guard, storage quota trigger: %',
    (select l.cases from public.solo_lawyer_limits() l), (select l.clients from public.solo_lawyer_limits() l),
    case when to_regclass('storage.objects') is null then 'skipped (no storage.objects)'
         when exists (select 1 from pg_catalog.pg_trigger
                       where tgrelid = 'storage.objects'::regclass and tgname = 'trg_storage_quota_guard' and not tgisinternal)
           then 'active' else 'NOT active (run as supabase_admin)' end;
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261206_70 roles: office plan gate (س٢١٢), free allowance 0/0, 1 GB quota, firm team managers (D-53)' as migration, true as ok;
