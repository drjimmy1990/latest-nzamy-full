-- =============================================================================
-- Migration: 20261109_12_group_membership_self_check.sql
-- =============================================================================
-- WHY (security review 2026-11-08, DB-01)
--   Group membership checks reachable from the API must answer only about the
--   caller. public.is_group_member_or_owner(p_group_id uuid, p_user_id uuid)
--   (20260625_fix_rls_recursion.sql) is SECURITY DEFINER, takes a user id and
--   kept PostgreSQL's default PUBLIC EXECUTE. It cannot simply be revoked: the
--   SELECT policies of public.groups and public.group_members call it, so the
--   querying role needs EXECUTE. They move to a caller-only function instead.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run if any policy OTHER than the two below, or any other
--      function, still calls the two-argument function (the revoke in step 3
--      would break it). Nothing in the repo does; the check is for the live DB.
--   1. public.is_group_member_or_owner_self(p_group_id uuid) → boolean —
--      SECURITY DEFINER, search_path = '', STABLE. The same test as the old
--      function, for auth.uid() only (false without a session): owner of the
--      group, or an ACTIVE member. EXECUTE: authenticated + service_role.
--   2. The two policies are re-created TO authenticated on the new function,
--      with the same meaning as in 20260625 (owner or active member reads the
--      group and its member list):
--        public.groups         «group members read their groups»
--        public.group_members  «group members read membership»
--      A guest (anon) now gets 0 rows from them instead of evaluating the
--      function (no permission error even where anon holds SELECT).
--   3. The old two-argument function is KEPT but revoked from PUBLIC, anon and
--      authenticated; only service_role may execute it.
--   Unchanged: every other policy on both tables (owners insert / update /
--   delete), and src/ (no code calls either function; the group routes read
--   through RLS with the request client).
--
-- RUN ORDER — ANY TIME (independent of the deploy). Needs 20260625.
--
-- ROLLBACK (restores the 20260625 state — only if group reads break)
--   drop policy if exists "group members read their groups" on public.groups;
--   create policy "group members read their groups" on public.groups
--     for select using (public.is_group_member_or_owner(id, auth.uid()));
--   drop policy if exists "group members read membership" on public.group_members;
--   create policy "group members read membership" on public.group_members
--     for select using (public.is_group_member_or_owner(group_id, auth.uid()));
--   grant execute on function public.is_group_member_or_owner(uuid, uuid) to public;
--   drop function if exists public.is_group_member_or_owner_self(uuid);
--
-- Docker: supabase/tests/rls/group_membership_self_check.test.sql
-- =============================================================================

begin;

-- ── 0. prerequisites + nothing else depends on the old function ─────────────
do $$
declare
  offenders text;
begin
  if to_regclass('public.groups') is null or to_regclass('public.group_members') is null then
    raise exception '20261109_12: public.groups / public.group_members are missing — run 20260603_phase1_004_community_features.sql first';
  end if;

  select string_agg(format('%I.%I «%s»', p.schemaname, p.tablename, p.policyname), ', ')
    into offenders
    from pg_policies p
   where (coalesce(p.qual, '') ~ 'is_group_member_or_owner\('
          or coalesce(p.with_check, '') ~ 'is_group_member_or_owner\(')
     and not (p.schemaname = 'public'
              and ((p.tablename = 'groups' and p.policyname = 'group members read their groups')
                or (p.tablename = 'group_members' and p.policyname = 'group members read membership')));
  if offenders is not null then
    raise exception '20261109_12: these policies also call public.is_group_member_or_owner(uuid, uuid) and would break after the revoke: % — move them to is_group_member_or_owner_self first', offenders;
  end if;

  select string_agg(q.oid::regprocedure::text, ', ')
    into offenders
    from pg_proc q
    join pg_namespace n on n.oid = q.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and q.prosrc ~ 'is_group_member_or_owner\('
     and q.proname <> 'is_group_member_or_owner';
  if offenders is not null then
    raise exception '20261109_12: these functions call public.is_group_member_or_owner(uuid, uuid) and would break after the revoke: %', offenders;
  end if;
end $$;

-- ── 1. the self-only check ───────────────────────────────────────────────────
create or replace function public.is_group_member_or_owner_self(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and (exists (select 1 from public.groups g
                   where g.id = p_group_id and g.owner_id = auth.uid())
          or exists (select 1 from public.group_members m
                      where m.group_id = p_group_id and m.user_id = auth.uid() and m.status = 'active'));
$$;

comment on function public.is_group_member_or_owner_self(uuid) is
  'DB-01 (20261109_12): true when the CALLER (auth.uid()) owns the group or is an active member. Used by the SELECT policies of public.groups / public.group_members (bypasses their RLS, so the two policies do not recurse). Takes no user id: a caller can ask only about himself.';

revoke all on function public.is_group_member_or_owner_self(uuid) from public, anon;
grant execute on function public.is_group_member_or_owner_self(uuid) to authenticated, service_role;

-- ── 2. the two SELECT policies, on the new function ──────────────────────────
drop policy if exists "group members read their groups" on public.groups;
create policy "group members read their groups" on public.groups
  for select to authenticated
  using (public.is_group_member_or_owner_self(id));

drop policy if exists "group members read membership" on public.group_members;
create policy "group members read membership" on public.group_members
  for select to authenticated
  using (public.is_group_member_or_owner_self(group_id));

-- ── 3. the old function: server only ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.is_group_member_or_owner(uuid, uuid)') is not null then
    revoke all on function public.is_group_member_or_owner(uuid, uuid) from public, anon, authenticated;
    grant execute on function public.is_group_member_or_owner(uuid, uuid) to service_role;
    comment on function public.is_group_member_or_owner(uuid, uuid) is
      'Bypasses RLS to check group ownership or active membership of ANY user. Service role only since 20261109_12 (DB-01); the policies use is_group_member_or_owner_self.';
  end if;
end $$;

-- ── 4. verify (raises on a failure) ──────────────────────────────────────────
do $$
declare
  old_fn  constant text := 'public.is_group_member_or_owner(uuid, uuid)';
  self_fn constant text := 'public.is_group_member_or_owner_self(uuid)';
  cfg     text[];
  r       text;
  fn_owner text;
begin
  select p.proconfig into cfg from pg_proc p where p.oid = to_regprocedure(self_fn);
  if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(self_fn))
     or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception '20261109_12 verify: % is not SECURITY DEFINER with search_path = ''''', self_fn;
  end if;
  -- The function reads groups / group_members, whose SELECT policies call it:
  -- its owner must read both past RLS, or every group read recurses (42P17).
  select pg_get_userbyid(p.proowner) into fn_owner from pg_proc p where p.oid = to_regprocedure(self_fn);
  if not has_table_privilege(fn_owner, 'public.groups', 'SELECT')
     or not has_table_privilege(fn_owner, 'public.group_members', 'SELECT') then
    raise exception '20261109_12 verify: %, the owner of %, cannot read public.groups / public.group_members', fn_owner, self_fn;
  end if;
  if not exists (select 1 from pg_roles x where x.rolname = fn_owner and (x.rolsuper or x.rolbypassrls))
     and ((select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.groups'::regclass) <> fn_owner
          or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.group_members'::regclass) <> fn_owner) then
    raise exception '20261109_12 verify: %, the owner of %, neither owns public.groups and public.group_members nor bypasses RLS — every group read would recurse (42P17)', fn_owner, self_fn;
  end if;
  if has_function_privilege('anon', self_fn, 'EXECUTE') or not has_function_privilege('authenticated', self_fn, 'EXECUTE') then
    raise exception '20261109_12 verify: % must be executable by authenticated and not by anon', self_fn;
  end if;
  if to_regprocedure(old_fn) is not null then
    foreach r in array array['public', 'anon', 'authenticated'] loop
      if has_function_privilege(r, old_fn, 'EXECUTE') then
        raise exception '20261109_12 verify: % can still EXECUTE %', r, old_fn;
      end if;
    end loop;
  end if;
  if exists (select 1 from pg_policies
              where coalesce(qual, '') ~ 'is_group_member_or_owner\('
                 or coalesce(with_check, '') ~ 'is_group_member_or_owner\(') then
    raise exception '20261109_12 verify: a policy still calls the two-argument function';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public'
         and ((tablename = 'groups' and policyname = 'group members read their groups')
           or (tablename = 'group_members' and policyname = 'group members read membership'))
         and roles = array['authenticated']::name[]
         and qual ~ 'is_group_member_or_owner_self\(') <> 2 then
    raise exception '20261109_12 verify: the two group SELECT policies are not TO authenticated on is_group_member_or_owner_self';
  end if;
  raise notice '20261109_12 verify: OK — group reads use is_group_member_or_owner_self (caller only); the two-argument function is service role only';
end $$;

commit;

-- ── check (the SQL editor shows only this last result) ───────────────────────
select 'two-argument is_group_member_or_owner not executable by anon / authenticated' as check,
       to_regprocedure('public.is_group_member_or_owner(uuid, uuid)') is null
       or (not has_function_privilege('anon', 'public.is_group_member_or_owner(uuid, uuid)', 'EXECUTE')
           and not has_function_privilege('authenticated', 'public.is_group_member_or_owner(uuid, uuid)', 'EXECUTE')) as ok
union all
select 'is_group_member_or_owner_self: authenticated yes, anon no',
       has_function_privilege('authenticated', 'public.is_group_member_or_owner_self(uuid)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.is_group_member_or_owner_self(uuid)', 'EXECUTE')
union all
select 'group SELECT policies on the self-only check, TO authenticated',
       (select count(*) = 2 from pg_policies
         where schemaname = 'public'
           and ((tablename = 'groups' and policyname = 'group members read their groups')
             or (tablename = 'group_members' and policyname = 'group members read membership'))
           and roles = array['authenticated']::name[]
           and qual ~ 'is_group_member_or_owner_self\(');
