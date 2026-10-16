-- =============================================================================
-- Migration: 20261017_30_business_delegations.sql
-- =============================================================================
-- PURPOSE
--   Owner decision ٣٦ (answers of 2026-10-06, section ج):
--     «تعديل بيانات الشركة محصور في مالك الحساب الرئيسي (Owner)، أو المفوّض
--      رسمياً بصلاحية إدارية مسجلة في جدول التفويضات.»
--   and owner decision ٥ (section د), which names «التفويض» as one of the five
--   company-dashboard sections to build first.
--
--   Before this file:
--     * public.business_profiles is writable by its owner only: the row policy
--       "business_profiles: owner can update" (20260921_03) under the column
--       list of 20260922_03. PATCH /api/v1/profile refuses everyone else
--       (WP-6 B-2).
--     * There is no delegations table anywhere. The settings tab «التفويض»
--       says so in plain words (src/app/settings/components/tabs/DelegationTab.tsx).
--     * `business_profiles.metadata` is granted to authenticated as a whole
--       column, so the owner can overwrite `metadata.features` through a raw
--       PostgREST PATCH. That bag is the admin console's feature-flag store
--       (src/app/api/v1/admin/corporates/route.ts), and 20260922_03's header
--       records it as a gap it left open. A delegate would inherit the same
--       reach, so this file closes it.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. public.business_delegations — the register «جدول التفويضات». One row per
--      grant: which company, which member, which power (`scope`), granted by
--      whom and when, an optional last day (`expires_on`, a Riyadh calendar
--      date), and the revocation (`revoked_at` / `revoked_by`). The only power
--      today is 'company_profile' — editing the company's data.
--      A revocation is final; there is no DELETE for the API roles. The record
--      of who could edit, and until when, is the point of a register.
--   2. Two guard triggers (SECURITY DEFINER, they read business_members and
--      business_profiles):
--        * BEFORE INSERT — the delegate must be an ACTIVE member of that
--          company and must not be its owner; `expires_on` cannot be in the
--          past; `granted_by` / `granted_at` are set by the server, never by
--          the request; a new row is never born revoked.
--        * BEFORE UPDATE — the only change allowed is revoking a live row.
--          `revoked_at` is overwritten with now() and `revoked_by` with the
--          caller, so neither can be back- or forward-dated.
--   3. Privileges: anon and PUBLIC hold nothing; authenticated may SELECT,
--      INSERT the five request columns, and UPDATE `revoked_at` only. No
--      DELETE / TRUNCATE (the 20261016_02 rule for membership tables).
--   4. RLS: an active member, the owner or an admin reads the company's
--      register; only the owner grants and revokes. Every policy goes through
--      the SECURITY DEFINER helpers of 20260921_03 (is_business_owner,
--      is_active_business_member) — no inline member-table read, so no 42P17.
--   5. public.is_business_profile_delegate(uuid) — the caller holds a live
--      'company_profile' delegation for that company AND is still an active
--      member (a suspended or removed member's delegation lapses by itself);
--      public.is_business_profile_editor(uuid) — owner OR such a delegate.
--      The API asks the second one; the policy below uses the first.
--   6. A SECOND permissive UPDATE policy on public.business_profiles,
--      "business_profiles: registered delegate can update". The owner's policy
--      is left exactly as it is: 20260922_03 and _verify.sql assert it by
--      name. Permissive policies are OR-ed, so the owner path is unchanged.
--      The delegate writes the SAME columns as the owner (20260922_03's list);
--      verification_status, plan_id, owner_user_id … stay ungranted for both.
--   7. public.business_profiles_keep_admin_flags() — BEFORE UPDATE OF metadata:
--      unless the caller is the server (no auth.uid(), i.e. the service role)
--      or an admin, `metadata.features` keeps its stored value whatever the
--      request sends. Every other key of the bag (metadata.settings, written by
--      PATCH /api/v1/profile) is unchanged in behaviour.
--   8. Verify block — RAISES (the transaction rolls back) on any miss.
--   9. notify pgrst to reload its schema cache.
--
-- WHO IS AFFECTED
--   * The company owner: nothing changes for their own edits.
--   * Members: nothing changes until the owner registers them as delegates.
--   * The admin console (service role): unchanged; the flag guard lets it pass.
--
-- DEPLOY ORDER — run this BEFORE deploying the code of the same branch.
--   The new routes (/api/v1/business/delegations, /api/v1/business/profile)
--   read the table and call the helpers; without this file they answer an
--   Arabic 500. The owner's own save keeps working either way: the profile
--   routes ask about delegation only after the owner check fails.
--   Running this file before that deploy breaks nothing: no deployed code
--   reads the new table, and the owner's UPDATE policy is untouched.
--
-- RE-RUN CLIFFS (recorded in docs/plans/2026-10-17-p3-run-order.md)
--   * Re-running 20260921_03_entity_rls_recursion_fix.sql drops EVERY policy on
--     business_profiles by catalogue, the delegate policy included. Delegates
--     then lose write access (fail-closed; the owner is unaffected). Re-run this
--     file after it.
--   * Re-running 20260922_03 does not touch this file's objects.
--
-- ROLLBACK (removes the delegate path; owner decision required)
--   begin;
--     drop policy if exists "business_profiles: registered delegate can update" on public.business_profiles;
--     drop trigger if exists trg_business_profiles_keep_admin_flags on public.business_profiles;
--     drop function if exists public.business_profiles_keep_admin_flags();
--     drop function if exists public.is_business_profile_editor(uuid);
--     drop function if exists public.is_business_profile_delegate(uuid);
--     drop table if exists public.business_delegations;   -- loses the register
--     drop function if exists public.business_delegations_guard_insert();
--     drop function if exists public.business_delegations_guard_update();
--   commit;
--   notify pgrst, 'reload schema';
--
-- DOCKER PROOF: supabase/tests/rls/business_delegations.test.sql (chain in its
-- header).
-- =============================================================================

begin;

-- ── 1. The register ──────────────────────────────────────────────────────────
create table if not exists public.business_delegations (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.business_profiles(id) on delete cascade,
  delegate_user_id uuid not null references public.profiles(id) on delete cascade,
  scope            text not null default 'company_profile'
                     check (scope in ('company_profile')),
  note             text check (note is null or char_length(note) <= 500),
  expires_on       date,
  granted_by       uuid references public.profiles(id) on delete set null,
  granted_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.business_delegations is
  'جدول التفويضات — owner decision 36. One row per delegation of an administrative power (today only company_profile: editing the company data) from a company owner to one of its ACTIVE members. Revocation is final (revoked_at); no DELETE for the API roles. Since 20261017_30.';

create index if not exists idx_business_delegations_business on public.business_delegations (business_id);
create index if not exists idx_business_delegations_delegate on public.business_delegations (delegate_user_id);
-- One LIVE delegation per member and power; history rows (revoked) may repeat.
create unique index if not exists uq_business_delegations_live
  on public.business_delegations (business_id, delegate_user_id, scope)
  where revoked_at is null;

-- ── 2. Guard triggers ────────────────────────────────────────────────────────
create or replace function public.business_delegations_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.granted_by := auth.uid();
  new.granted_at := now();
  new.revoked_at := null;
  new.revoked_by := null;
  new.created_at := now();
  new.updated_at := now();

  if exists (select 1 from public.business_profiles e
              where e.id = new.business_id and e.owner_user_id = new.delegate_user_id) then
    raise exception 'business_delegations: the company owner already holds every power and cannot be a delegate'
      using errcode = '23514';
  end if;

  if not exists (select 1 from public.business_members m
                  where m.business_id = new.business_id
                    and m.user_id = new.delegate_user_id
                    and m.status = 'active') then
    raise exception 'business_delegations: the delegate must be an active member of the company'
      using errcode = '23514';
  end if;

  if new.expires_on is not null
     and new.expires_on < (now() at time zone 'Asia/Riyadh')::date then
    raise exception 'business_delegations: expires_on is in the past'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.business_delegations_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    raise exception 'business_delegations: a revoked delegation is final'
      using errcode = '23514';
  end if;

  if new.business_id      is distinct from old.business_id
  or new.delegate_user_id is distinct from old.delegate_user_id
  or new.scope            is distinct from old.scope
  or new.note             is distinct from old.note
  or new.expires_on       is distinct from old.expires_on
  or new.granted_by       is distinct from old.granted_by
  or new.granted_at       is distinct from old.granted_at
  or new.created_at       is distinct from old.created_at then
    raise exception 'business_delegations: only revocation is allowed on an existing delegation'
      using errcode = '23514';
  end if;

  if new.revoked_at is null then
    -- Nothing to do; keep the row exactly as it was.
    new.revoked_by := old.revoked_by;
    new.updated_at := old.updated_at;
    return new;
  end if;

  new.revoked_at := now();
  new.revoked_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_business_delegations_guard_insert on public.business_delegations;
create trigger trg_business_delegations_guard_insert
  before insert on public.business_delegations
  for each row execute function public.business_delegations_guard_insert();

drop trigger if exists trg_business_delegations_guard_update on public.business_delegations;
create trigger trg_business_delegations_guard_update
  before update on public.business_delegations
  for each row execute function public.business_delegations_guard_update();

revoke execute on function public.business_delegations_guard_insert() from public, anon, authenticated;
revoke execute on function public.business_delegations_guard_update() from public, anon, authenticated;

-- ── 3. Privileges ────────────────────────────────────────────────────────────
-- Supabase's default privileges hand anon/authenticated ALL on a new table;
-- take everything back first, then grant exactly what the routes use.
revoke all on public.business_delegations from anon, authenticated, public;
grant select on public.business_delegations to authenticated;
grant insert (business_id, delegate_user_id, scope, note, expires_on)
  on public.business_delegations to authenticated;
grant update (revoked_at) on public.business_delegations to authenticated;
grant all on public.business_delegations to service_role;

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
alter table public.business_delegations enable row level security;

drop policy if exists "business_delegations: owner, member or admin can read" on public.business_delegations;
create policy "business_delegations: owner, member or admin can read" on public.business_delegations
  for select to authenticated
  using (public.is_business_owner(business_id)
         or public.is_active_business_member(business_id)
         or public.is_admin());

drop policy if exists "business_delegations: owner can grant" on public.business_delegations;
create policy "business_delegations: owner can grant" on public.business_delegations
  for insert to authenticated
  with check (public.is_business_owner(business_id));

drop policy if exists "business_delegations: owner can revoke" on public.business_delegations;
create policy "business_delegations: owner can revoke" on public.business_delegations
  for update to authenticated
  using (public.is_business_owner(business_id))
  with check (public.is_business_owner(business_id));

-- ── 5. Helpers ───────────────────────────────────────────────────────────────
create or replace function public.is_business_profile_delegate(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business is not null and auth.uid() is not null and exists (
    select 1
      from public.business_delegations d
      join public.business_members m
        on m.business_id = d.business_id
       and m.user_id     = d.delegate_user_id
       and m.status      = 'active'
     where d.business_id      = p_business
       and d.delegate_user_id = auth.uid()
       and d.scope            = 'company_profile'
       and d.revoked_at is null
       and (d.expires_on is null
            or d.expires_on >= (now() at time zone 'Asia/Riyadh')::date));
$$;

comment on function public.is_business_profile_delegate(uuid) is
  'True when the caller holds a live company_profile delegation for the company (not revoked, not past expires_on in Riyadh) AND is still an active member. SECURITY DEFINER: reads business_delegations and business_members from inside a business_profiles policy without recursion. Since 20261017_30.';

create or replace function public.is_business_profile_editor(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_business is not null and auth.uid() is not null and (
    exists (select 1 from public.business_profiles e
             where e.id = p_business and e.owner_user_id = auth.uid())
    or public.is_business_profile_delegate(p_business));
$$;

comment on function public.is_business_profile_editor(uuid) is
  'Owner decision 36: the company data may be edited by the owner account or a registered delegate (business_delegations). The API asks this; RLS enforces the same through the owner policy plus "business_profiles: registered delegate can update". Since 20261017_30.';

revoke execute on function public.is_business_profile_delegate(uuid) from public, anon;
revoke execute on function public.is_business_profile_editor(uuid)   from public, anon;
grant execute on function public.is_business_profile_delegate(uuid) to authenticated, service_role;
grant execute on function public.is_business_profile_editor(uuid)   to authenticated, service_role;

-- ── 6. The delegate's UPDATE arm on business_profiles ───────────────────────
drop policy if exists "business_profiles: registered delegate can update" on public.business_profiles;
create policy "business_profiles: registered delegate can update" on public.business_profiles
  for update to authenticated
  using (public.is_business_profile_delegate(id))
  with check (public.is_business_profile_delegate(id));

-- ── 7. metadata.features belongs to the admin console ───────────────────────
create or replace function public.business_profiles_keep_admin_flags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The server (service role: no auth.uid()) and admins write the flags.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if old.metadata ? 'features' then
    new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{features}',
                              old.metadata -> 'features', true);
  else
    new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'features';
  end if;
  return new;
end;
$$;

revoke execute on function public.business_profiles_keep_admin_flags() from public, anon, authenticated;

drop trigger if exists trg_business_profiles_keep_admin_flags on public.business_profiles;
create trigger trg_business_profiles_keep_admin_flags
  before update of metadata on public.business_profiles
  for each row execute function public.business_profiles_keep_admin_flags();

-- ── 8. Verify ────────────────────────────────────────────────────────────────
do $$
declare
  r       text;
  a       record;
  missing text := '';
  ins_ok  text[] := array['business_id', 'delegate_user_id', 'scope', 'note', 'expires_on'];
begin
  if to_regclass('public.business_delegations') is null then
    raise exception '20261017_30 verify: public.business_delegations was not created';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.business_delegations'::regclass) then
    missing := missing || ' RLS is off on business_delegations;';
  end if;

  -- anon: nothing at all
  if has_table_privilege('anon', 'public.business_delegations', 'SELECT')
     or has_any_column_privilege('anon', 'public.business_delegations', 'SELECT')
     or has_any_column_privilege('anon', 'public.business_delegations', 'INSERT')
     or has_any_column_privilege('anon', 'public.business_delegations', 'UPDATE')
     or has_table_privilege('anon', 'public.business_delegations', 'DELETE') then
    missing := missing || ' anon holds a privilege on business_delegations;';
  end if;

  -- authenticated: SELECT; INSERT on five columns; UPDATE on revoked_at; no DELETE
  if not has_table_privilege('authenticated', 'public.business_delegations', 'SELECT') then
    missing := missing || ' authenticated cannot SELECT business_delegations;';
  end if;
  if has_table_privilege('authenticated', 'public.business_delegations', 'DELETE')
     or has_table_privilege('authenticated', 'public.business_delegations', 'TRUNCATE') then
    missing := missing || ' authenticated can DELETE/TRUNCATE business_delegations;';
  end if;
  if has_table_privilege('authenticated', 'public.business_delegations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.business_delegations', 'INSERT') then
    missing := missing || ' authenticated holds a table-level INSERT/UPDATE on business_delegations;';
  end if;
  for a in
    select att.attname::text as name
      from pg_attribute att
     where att.attrelid = 'public.business_delegations'::regclass
       and att.attnum > 0 and not att.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.business_delegations', a.name, 'UPDATE')
       and a.name <> 'revoked_at' then
      missing := missing || format(' authenticated can UPDATE business_delegations.%s;', a.name);
    end if;
    if has_column_privilege('authenticated', 'public.business_delegations', a.name, 'INSERT')
       and not (a.name = any (ins_ok)) then
      missing := missing || format(' authenticated can INSERT business_delegations.%s;', a.name);
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.business_delegations', 'revoked_at', 'UPDATE') then
    missing := missing || ' authenticated cannot UPDATE business_delegations.revoked_at (revoke would 42501);';
  end if;
  if not has_table_privilege('service_role', 'public.business_delegations', 'DELETE') then
    missing := missing || ' service_role lost full access on business_delegations;';
  end if;

  -- policies: read / grant / revoke; no DELETE or ALL policy
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'business_delegations'
         and policyname in ('business_delegations: owner, member or admin can read',
                            'business_delegations: owner can grant',
                            'business_delegations: owner can revoke')) <> 3 then
    missing := missing || ' a business_delegations policy is missing;';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'business_delegations'
                and cmd in ('DELETE', 'ALL')) then
    missing := missing || ' a DELETE/ALL policy exists on business_delegations;';
  end if;

  -- triggers
  if (select count(*) from pg_trigger
       where tgrelid = 'public.business_delegations'::regclass and not tgisinternal
         and tgname in ('trg_business_delegations_guard_insert', 'trg_business_delegations_guard_update')) <> 2 then
    missing := missing || ' a business_delegations guard trigger is missing;';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.business_profiles'::regclass and not tgisinternal
                    and tgname = 'trg_business_profiles_keep_admin_flags') then
    missing := missing || ' trg_business_profiles_keep_admin_flags is missing;';
  end if;

  -- helpers: SECURITY DEFINER, executable by authenticated, not by anon
  foreach r in array array['public.is_business_profile_delegate(uuid)', 'public.is_business_profile_editor(uuid)']
  loop
    if not exists (select 1 from pg_proc where oid = to_regprocedure(r) and prosecdef) then
      missing := missing || format(' %s is missing or not SECURITY DEFINER;', r);
    elsif has_function_privilege('anon', r, 'EXECUTE') then
      missing := missing || format(' anon can EXECUTE %s;', r);
    elsif not has_function_privilege('authenticated', r, 'EXECUTE') then
      missing := missing || format(' authenticated cannot EXECUTE %s;', r);
    end if;
  end loop;

  -- business_profiles: the owner policy is untouched, the delegate policy is added
  if (select count(*) from pg_policy
       where polrelid = 'public.business_profiles'::regclass
         and polname = 'business_profiles: owner can update' and polcmd = 'w') <> 1 then
    missing := missing || ' "business_profiles: owner can update" is missing;';
  end if;
  if (select count(*) from pg_policy
       where polrelid = 'public.business_profiles'::regclass
         and polname = 'business_profiles: registered delegate can update' and polcmd = 'w') <> 1 then
    missing := missing || ' "business_profiles: registered delegate can update" is missing;';
  end if;
  -- …and no column was opened by this file: the delegate writes 20260922_03's list.
  if has_column_privilege('authenticated', 'public.business_profiles', 'verification_status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.business_profiles', 'owner_user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.business_profiles', 'plan_id', 'UPDATE') then
    missing := missing || ' authenticated can UPDATE a privileged business_profiles column (20260922_03 not applied?);';
  end if;

  if missing <> '' then
    raise exception '20261017_30 verify:%', missing;
  end if;

  raise notice '20261017_30 verify: OK — business_delegations register (owner grants/revokes, members read, no delete), delegate UPDATE arm on business_profiles, metadata.features pinned for non-admin sessions';
end $$;

commit;

-- ── 9. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Read-only re-check after applying (SQL Editor):
--   select count(*) from public.business_delegations;                                        -- 0 on day one
--   select has_table_privilege('anon', 'public.business_delegations', 'SELECT')   as anon_reads,        -- false
--          has_table_privilege('authenticated', 'public.business_delegations', 'DELETE') as can_delete;  -- false
--   select polname from pg_policy where polrelid = 'public.business_profiles'::regclass and polcmd = 'w';
--     -- "business_profiles: owner can update" and "business_profiles: registered delegate can update"
