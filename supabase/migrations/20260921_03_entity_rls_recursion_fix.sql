-- =============================================================================
-- Migration: 20260921_03_entity_rls_recursion_fix.sql
-- =============================================================================
-- PURPOSE
--   `42P17 infinite recursion detected in policy for relation "<x>_members"`.
--   Confirmed live on 2026-09-20 for `firm_members` and `business_members`, for
--   the `anon` role too (audit 06, probe B) — so it is policy-evaluation-wide,
--   not tied to a signed-in identity. Two recursive shapes exist:
--
--     (a) self-reference — `"<x>_members: active members can read co-members"`
--         selects from `<x>_members` inside a policy ON `<x>_members`
--         (20260603_phase1_002_entities.sql:168/347/517/690, restated at
--          20260616_entities_setup_and_rls_fix.sql:394/475/556/637).
--         20260903_phase2_clients_and_firm_membership.sql:283-334 fixed ONLY
--         this shape, with the `is_active_*_member()` helpers.
--     (b) mutual cycle `<x>_members ↔ <x>_profiles` — `"<x>_profiles: members
--         can read their …"` selects from `<x>_members`, while
--         `"<x>_members: … owner can read all members"` selects from
--         `<x>_profiles` (20260616:354/384, 435/465, 516/546, 597/627).
--         NOTHING has ever fixed this shape. It is the live defect.
--
--   This file takes a clean slate: it drops EVERY policy on the eight entity
--   tables and rebuilds one flat matrix in which no policy expression reads any
--   of those eight tables inline. Every cross-table test goes through a
--   `security definer` helper, which is the only construct that breaks an RLS
--   cycle. The verify block at the end proves the property rather than assuming
--   it.
--
-- CLOSES (UAT ids)
--   UAT-TEAM-001 (entity-membership-rls.json — 11/11 HTTP 500)
--   Unblocks UAT-BIZ-001 / UAT-TENANT-003, whose business checks cannot run
--   while `business_members` raises 42P17.
--
-- SUPERSEDES — do not deploy either of these (renamed `_superseded_…` so the
-- deploy runner skips them; audit 01 §4 has the full analysis)
--   * _superseded_20260916_fix_all_entities_rls_infinite_recursion.sql
--       BLOCKER 1: re-declares the four 20260903 helpers with new parameter
--       names (`p_firm_id`, `p_business_id`, `p_gov_id`, `p_ngo_id`) →
--       `42P13 cannot change name of input parameter`; the file is
--       `begin;…commit;`, so the WHOLE transaction rolls back and nothing is
--       fixed while the apply log can look plausible.
--       BLOCKER 2: several `drop policy if exists` name guesses never matched a
--       live policy (silent no-ops), so the recursive originals survive and are
--       OR-combined with the new ones — `business_members`/`business_profiles`
--       would still recurse even if BLOCKER 1 were fixed.
--   * _superseded_20260916_fix_firm_profiles_and_members_rls_recursion.sql
--       Second attempt at the firm half; disagrees with the first on
--       `is_firm_owner`'s parameter name, so whichever ran second hit 42P13.
--   The policy INTENT of those two files (owner/member/admin read, owner-only
--   writes, an explicit DELETE arm) is carried over here; their bugs are not.
--
-- PREREQUISITES
--   * The eight tables, whichever of them exist:
--       firm_profiles / firm_members            20260603_phase1_002_entities.sql:35 / :118
--       business_profiles / business_members    …:218 / :298
--       government_profiles / government_members …:397 / :475
--       ngo_profiles / ngo_members              …:567 / :645
--     Each entity block is guarded with `to_regclass` (the same pattern
--     20260903_phase2…:296-334 uses), so this file also applies to a database
--     that only ever created the firm pair.
--   * public.is_admin()  — 20260625_fix_rls_recursion.sql:16-26. REQUIRED; the
--     file raises immediately if it is missing.
--   * Member-table columns used here (verified against
--     20260603_phase1_002_entities.sql / 20260616_entities_setup_and_rls_fix.sql):
--       firm_members.firm_id · business_members.business_id ·
--       government_members.gov_id (NOT government_id) · ngo_members.ngo_id ·
--       every `<x>_members` has user_id + status, every `<x>_profiles` has
--       id + owner_user_id.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE POLICY MATRIX (identical for every entity X ∈ {firm, business,
-- government, ngo}; `<X>_members.<fk>` is the entity key named above)
-- ─────────────────────────────────────────────────────────────────────────────
--   X_profiles  SELECT  owner_user_id = auth.uid()
--                         or public.is_active_X_member(id)
--                         or public.is_admin()
--   X_profiles  INSERT  with check (owner_user_id = auth.uid())
--   X_profiles  UPDATE  using/with check (owner_user_id = auth.uid())
--   X_members   SELECT  user_id = auth.uid()
--                         or public.is_active_X_member(<fk>)
--                         or public.is_X_owner(<fk>)
--                         or public.is_admin()
--   X_members   INSERT  with check (public.is_X_owner(<fk>) or public.is_admin())
--   X_members   UPDATE  using/with check (public.is_X_owner(<fk>) or public.is_admin())
--   X_members   DELETE  using (public.is_X_owner(<fk>) or public.is_admin())
--   ⇒ exactly 3 policies per X_profiles, 4 per X_members.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EVERY POLICY THIS FILE REPLACES (name — source file:line)
-- ─────────────────────────────────────────────────────────────────────────────
-- firm_profiles
--   "firm_profiles: owner can read own firm"        20260603_phase1_002_entities.sql:75 · 20260616:350
--   "firm_profiles: members can read their firm"    20260603_phase1_002_entities.sql:79 · 20260616:354  ← recursion (b)
--   "firm_profiles: owner can insert"               20260603_phase1_002_entities.sql:90 · 20260616:365
--   "firm_profiles: owner can update"               20260603_phase1_002_entities.sql:94 · 20260616:369
--   "firm_profiles: admin full read"                20260603_phase1_002_entities.sql:99
--   "admins read firm profiles"                     20260616:374
--   "admins read all firm_profiles"                 20260617_fix_remaining_rls.sql:20
-- firm_members
--   "firm_members: member can read own membership"  20260603_phase1_002_entities.sql:154 · 20260616:380
--   "firm_members: firm owner can read all members" 20260603_phase1_002_entities.sql:158 · 20260616:384  ← recursion (b)
--   "firm_members: active members can read co-members" 20260603_phase1_002_entities.sql:168 · 20260616:394 · 20260903:291 (helper form)
--   "firm_members: firm owner can insert"           20260603_phase1_002_entities.sql:179 · 20260616:405
--   "firm_members: firm owner can update"           20260603_phase1_002_entities.sql:189 · 20260616:415
--   "firm_members: admin full read"                 20260603_phase1_002_entities.sql:199
--   "admins read firm members"                      20260616:425
--   "admins read all firm_members"                  20260617_fix_remaining_rls.sql:30
-- business_profiles
--   "business_profiles: owner can read own"         20260603_phase1_002_entities.sql:255 · 20260616:431
--   "business_profiles: members can read their org" 20260603_phase1_002_entities.sql:259 · 20260616:435  ← recursion (b)
--   "business_profiles: owner can insert"           20260603_phase1_002_entities.sql:270 · 20260616:446
--   "business_profiles: owner can update"           20260603_phase1_002_entities.sql:274 · 20260616:450
--   "business_profiles: admin full read"            20260603_phase1_002_entities.sql:279
--   "admins read business profiles"                 20260616:455
--   "admins read all business_profiles"             20260617_fix_remaining_rls.sql:40
-- business_members
--   "business_members: member can read own membership"   20260603_phase1_002_entities.sql:333 · 20260616:461
--   "business_members: org owner can read all members"   20260603_phase1_002_entities.sql:337 · 20260616:465  ← recursion (b)
--   "business_members: active members can read co-members" 20260603_phase1_002_entities.sql:347 · 20260616:475 · 20260903:306 (helper form)
--   "business_members: org owner can insert"             20260603_phase1_002_entities.sql:358 · 20260616:486
--   "business_members: org owner can update"             20260603_phase1_002_entities.sql:368 · 20260616:496
--   "business_members: admin full read"                  20260603_phase1_002_entities.sql:378
--   "admins read business members"                       20260616:506
--   "admins read all business_members"                   20260617_fix_remaining_rls.sql:50
-- government_profiles
--   "government_profiles: owner can read own"            20260603_phase1_002_entities.sql:432 · 20260616:512
--   "government_profiles: members can read their entity" 20260603_phase1_002_entities.sql:436 · 20260616:516  ← recursion (b)
--   "government_profiles: owner can insert"              20260603_phase1_002_entities.sql:447 · 20260616:527
--   "government_profiles: owner can update"              20260603_phase1_002_entities.sql:451 · 20260616:531
--   "government_profiles: admin full read"               20260603_phase1_002_entities.sql:456
--   "admins read government profiles"                    20260616:536
--   "admins read all government_profiles"                20260617_fix_remaining_rls.sql:60
-- government_members
--   "government_members: member can read own membership" 20260603_phase1_002_entities.sql:503 · 20260616:542
--   "government_members: entity owner can read all"      20260603_phase1_002_entities.sql:507 · 20260616:546  ← recursion (b)
--   "government_members: active members can read co-members" 20260603_phase1_002_entities.sql:517 · 20260616:556 · 20260903:318 (helper form)
--   "government_members: entity owner can insert"        20260603_phase1_002_entities.sql:528 · 20260616:567
--   "government_members: entity owner can update"        20260603_phase1_002_entities.sql:538 · 20260616:577
--   "government_members: admin full read"                20260603_phase1_002_entities.sql:548
--   "admins read government members"                     20260616:587
--   "admins read all government_members"                 20260617_fix_remaining_rls.sql:70
-- ngo_profiles
--   "ngo_profiles: owner can read own"                   20260603_phase1_002_entities.sql:602 · 20260616:593
--   "ngo_profiles: members can read their org"           20260603_phase1_002_entities.sql:606 · 20260616:597  ← recursion (b)
--   "ngo_profiles: owner can insert"                     20260603_phase1_002_entities.sql:617 · 20260616:608
--   "ngo_profiles: owner can update"                     20260603_phase1_002_entities.sql:621 · 20260616:612
--   "ngo_profiles: admin full read"                      20260603_phase1_002_entities.sql:626
--   "admins read ngo profiles"                           20260616:617
--   "admins read all ngo_profiles"                       20260617_fix_remaining_rls.sql:80
-- ngo_members
--   "ngo_members: member can read own membership"        20260603_phase1_002_entities.sql:676 · 20260616:623
--   "ngo_members: org owner can read all"                20260603_phase1_002_entities.sql:680 · 20260616:627  ← recursion (b)
--   "ngo_members: active members can read co-members"    20260603_phase1_002_entities.sql:690 · 20260616:637 · 20260903:330 (helper form)
--   "ngo_members: org owner can insert"                  20260603_phase1_002_entities.sql:701 · 20260616:648
--   "ngo_members: org owner can update"                  20260603_phase1_002_entities.sql:711 · 20260616:658
--   "ngo_members: admin full read"                       20260603_phase1_002_entities.sql:721
--   "admins read ngo members"                            20260616:668
--   "admins read all ngo_members"                        20260617_fix_remaining_rls.sql:90
--   (the step-1 loop drops whatever is actually there, including any policy
--    created out of band that this list does not know about)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SEMANTICS CHECKED AGAINST THE OLD SET — nothing else was doing anything
-- ─────────────────────────────────────────────────────────────────────────────
--   * "member can read own membership" (`user_id = auth.uid()`) — kept, as the
--     first arm of the X_members SELECT policy.
--   * "members can read their <entity>" — kept, as `is_active_X_member(id)`.
--   * "<x> owner can read all members" — kept, as `is_X_owner(<fk>)`.
--   * every admin read policy (three spellings per table) — kept, collapsed to
--     one `public.is_admin()` arm, which is also the non-recursive form
--     (20260603/20260616/20260617 all inline `select … from public.profiles`,
--     which is the same shape 20260625 had to remove from `profiles` itself).
--   * No old policy ever let a member update their own membership row, and no
--     old policy exposed any of the eight tables publicly (the only
--     `public read verified …` policy in the tree is on `lawyer_profiles`,
--     20260603_phase1_001_profiles.sql:127-129, and is untouched).
--   * CHANGE OF BEHAVIOUR — the only one: DELETE. No DELETE policy has ever
--     existed on any `<x>_members` table, so removing a member is impossible
--     today even for the entity owner (and `deleted` is not one of the `status`
--     values). The matrix adds `X_members DELETE` for the owner/admin, which is
--     what _superseded_20260916_fix_all_entities…:82/135/188/241 also intended.
--     Nothing else gains a privilege it did not already have.
--
-- WHAT THIS FILE DOES NOT TOUCH
--   * `public.is_active_business_member(uuid)` is REPLACED, never dropped:
--     20260914_entity_memberships_and_business_requests.sql:52-59 has a policy
--     on `public.service_requests` that calls it, and a DROP (even without
--     CASCADE) would fail — or, with CASCADE, would silently delete that
--     policy. Same reasoning for the other three member helpers.
--   * `micro_profiles` has no members table and was never affected.
--   * Policies on `service_requests`, `lawyer_clients`, `lawyer_client_notes`
--     that call the member helpers keep working unchanged: the helper
--     signatures and bodies are identical to 20260903's.
--
-- ROLLBACK
--   Re-apply 20260603_phase1_002_entities.sql's policy section followed by
--   20260616 + 20260617 + 20260903 — which restores 42P17. There is no
--   non-recursive earlier state to roll back to.
-- =============================================================================

begin;

-- ── 0. Hard prerequisite ────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception '20260921_03: public.is_admin() is missing — apply 20260625_fix_rls_recursion.sql first';
  end if;
end $$;

-- ── 1. Clean slate: drop EVERY policy on the eight entity tables ────────────
-- Names are not guessed. Whatever is on these tables goes, including anything
-- created out of band, and every policy is rebuilt below.
do $$
declare
  p record;
begin
  for p in
    select c.relname as tbl, pol.polname
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
             'firm_profiles', 'firm_members',
             'business_profiles', 'business_members',
             'government_profiles', 'government_members',
             'ngo_profiles', 'ngo_members'
           )
     order by c.relname, pol.polname
  loop
    raise notice '20260921_03: dropping policy "%" on public.%', p.polname, p.tbl;
    execute format('drop policy %I on public.%I', p.polname, p.tbl);
  end loop;
end $$;

-- ── 2+3. Helpers and the policy matrix, one guarded block per entity ────────

-- ── entity: firm — firm_profiles / firm_members (membership key firm_members.firm_id) ─────────────────
do $do$
begin
  if to_regclass('public.firm_profiles') is null or to_regclass('public.firm_members') is null then
    raise notice '20260921_03: public.firm_profiles / public.firm_members absent — firm block skipped';
    return;
  end if;

  alter table public.firm_profiles enable row level security;
  alter table public.firm_members enable row level security;

  -- Membership helper. CREATE OR REPLACE with 20260903's parameter name
  -- (p_firm) so no DROP is needed and no dependent policy elsewhere breaks.
  create or replace function public.is_active_firm_member(p_firm uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_firm is not null and exists (
      select 1 from public.firm_members m
       where m.firm_id = p_firm and m.user_id = auth.uid() and m.status = 'active');
  $fn$;

  -- Ownership helper. New in this file; dropped first (no CASCADE — step 1
  -- already removed every policy on the eight tables that could depend on it).
  drop function if exists public.is_firm_owner(uuid);
  create function public.is_firm_owner(p_firm uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_firm is not null and exists (
      select 1 from public.firm_profiles e
       where e.id = p_firm and e.owner_user_id = auth.uid());
  $fn$;

  -- firm_profiles
  create policy "firm_profiles: owner, member or admin can read" on public.firm_profiles
    for select using (
      owner_user_id = auth.uid()
      or public.is_active_firm_member(id)
      or public.is_admin()
    );

  create policy "firm_profiles: owner can insert" on public.firm_profiles
    for insert with check (owner_user_id = auth.uid());

  create policy "firm_profiles: owner can update" on public.firm_profiles
    for update using (owner_user_id = auth.uid())
            with check (owner_user_id = auth.uid());

  -- firm_members
  create policy "firm_members: own row, co-member, owner or admin can read" on public.firm_members
    for select using (
      user_id = auth.uid()
      or public.is_active_firm_member(firm_id)
      or public.is_firm_owner(firm_id)
      or public.is_admin()
    );

  create policy "firm_members: owner or admin can insert" on public.firm_members
    for insert with check (public.is_firm_owner(firm_id) or public.is_admin());

  create policy "firm_members: owner or admin can update" on public.firm_members
    for update using (public.is_firm_owner(firm_id) or public.is_admin())
            with check (public.is_firm_owner(firm_id) or public.is_admin());

  create policy "firm_members: owner or admin can delete" on public.firm_members
    for delete using (public.is_firm_owner(firm_id) or public.is_admin());

  raise notice '20260921_03: firm — 3 policies on firm_profiles, 4 on firm_members, helpers is_active_firm_member/is_firm_owner installed';
end
$do$;

-- ── entity: business — business_profiles / business_members (membership key business_members.business_id) ─────────────────
do $do$
begin
  if to_regclass('public.business_profiles') is null or to_regclass('public.business_members') is null then
    raise notice '20260921_03: public.business_profiles / public.business_members absent — business block skipped';
    return;
  end if;

  alter table public.business_profiles enable row level security;
  alter table public.business_members enable row level security;

  -- Membership helper. CREATE OR REPLACE with 20260903's parameter name
  -- (p_business) so no DROP is needed and no dependent policy elsewhere breaks.
  create or replace function public.is_active_business_member(p_business uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_business is not null and exists (
      select 1 from public.business_members m
       where m.business_id = p_business and m.user_id = auth.uid() and m.status = 'active');
  $fn$;

  -- Ownership helper. New in this file; dropped first (no CASCADE — step 1
  -- already removed every policy on the eight tables that could depend on it).
  drop function if exists public.is_business_owner(uuid);
  create function public.is_business_owner(p_business uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_business is not null and exists (
      select 1 from public.business_profiles e
       where e.id = p_business and e.owner_user_id = auth.uid());
  $fn$;

  -- business_profiles
  create policy "business_profiles: owner, member or admin can read" on public.business_profiles
    for select using (
      owner_user_id = auth.uid()
      or public.is_active_business_member(id)
      or public.is_admin()
    );

  create policy "business_profiles: owner can insert" on public.business_profiles
    for insert with check (owner_user_id = auth.uid());

  create policy "business_profiles: owner can update" on public.business_profiles
    for update using (owner_user_id = auth.uid())
            with check (owner_user_id = auth.uid());

  -- business_members
  create policy "business_members: own row, co-member, owner or admin can read" on public.business_members
    for select using (
      user_id = auth.uid()
      or public.is_active_business_member(business_id)
      or public.is_business_owner(business_id)
      or public.is_admin()
    );

  create policy "business_members: owner or admin can insert" on public.business_members
    for insert with check (public.is_business_owner(business_id) or public.is_admin());

  create policy "business_members: owner or admin can update" on public.business_members
    for update using (public.is_business_owner(business_id) or public.is_admin())
            with check (public.is_business_owner(business_id) or public.is_admin());

  create policy "business_members: owner or admin can delete" on public.business_members
    for delete using (public.is_business_owner(business_id) or public.is_admin());

  raise notice '20260921_03: business — 3 policies on business_profiles, 4 on business_members, helpers is_active_business_member/is_business_owner installed';
end
$do$;

-- ── entity: government — government_profiles / government_members (membership key government_members.gov_id) ─────────────────
do $do$
begin
  if to_regclass('public.government_profiles') is null or to_regclass('public.government_members') is null then
    raise notice '20260921_03: public.government_profiles / public.government_members absent — government block skipped';
    return;
  end if;

  alter table public.government_profiles enable row level security;
  alter table public.government_members enable row level security;

  -- Membership helper. CREATE OR REPLACE with 20260903's parameter name
  -- (p_gov) so no DROP is needed and no dependent policy elsewhere breaks.
  create or replace function public.is_active_government_member(p_gov uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_gov is not null and exists (
      select 1 from public.government_members m
       where m.gov_id = p_gov and m.user_id = auth.uid() and m.status = 'active');
  $fn$;

  -- Ownership helper. New in this file; dropped first (no CASCADE — step 1
  -- already removed every policy on the eight tables that could depend on it).
  drop function if exists public.is_government_owner(uuid);
  create function public.is_government_owner(p_gov uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_gov is not null and exists (
      select 1 from public.government_profiles e
       where e.id = p_gov and e.owner_user_id = auth.uid());
  $fn$;

  -- government_profiles
  create policy "government_profiles: owner, member or admin can read" on public.government_profiles
    for select using (
      owner_user_id = auth.uid()
      or public.is_active_government_member(id)
      or public.is_admin()
    );

  create policy "government_profiles: owner can insert" on public.government_profiles
    for insert with check (owner_user_id = auth.uid());

  create policy "government_profiles: owner can update" on public.government_profiles
    for update using (owner_user_id = auth.uid())
            with check (owner_user_id = auth.uid());

  -- government_members
  create policy "government_members: own row, co-member, owner or admin can read" on public.government_members
    for select using (
      user_id = auth.uid()
      or public.is_active_government_member(gov_id)
      or public.is_government_owner(gov_id)
      or public.is_admin()
    );

  create policy "government_members: owner or admin can insert" on public.government_members
    for insert with check (public.is_government_owner(gov_id) or public.is_admin());

  create policy "government_members: owner or admin can update" on public.government_members
    for update using (public.is_government_owner(gov_id) or public.is_admin())
            with check (public.is_government_owner(gov_id) or public.is_admin());

  create policy "government_members: owner or admin can delete" on public.government_members
    for delete using (public.is_government_owner(gov_id) or public.is_admin());

  raise notice '20260921_03: government — 3 policies on government_profiles, 4 on government_members, helpers is_active_government_member/is_government_owner installed';
end
$do$;

-- ── entity: ngo — ngo_profiles / ngo_members (membership key ngo_members.ngo_id) ─────────────────
do $do$
begin
  if to_regclass('public.ngo_profiles') is null or to_regclass('public.ngo_members') is null then
    raise notice '20260921_03: public.ngo_profiles / public.ngo_members absent — ngo block skipped';
    return;
  end if;

  alter table public.ngo_profiles enable row level security;
  alter table public.ngo_members enable row level security;

  -- Membership helper. CREATE OR REPLACE with 20260903's parameter name
  -- (p_ngo) so no DROP is needed and no dependent policy elsewhere breaks.
  create or replace function public.is_active_ngo_member(p_ngo uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_ngo is not null and exists (
      select 1 from public.ngo_members m
       where m.ngo_id = p_ngo and m.user_id = auth.uid() and m.status = 'active');
  $fn$;

  -- Ownership helper. New in this file; dropped first (no CASCADE — step 1
  -- already removed every policy on the eight tables that could depend on it).
  drop function if exists public.is_ngo_owner(uuid);
  create function public.is_ngo_owner(p_ngo uuid)
  returns boolean language sql stable security definer set search_path = '' as $fn$
    select p_ngo is not null and exists (
      select 1 from public.ngo_profiles e
       where e.id = p_ngo and e.owner_user_id = auth.uid());
  $fn$;

  -- ngo_profiles
  create policy "ngo_profiles: owner, member or admin can read" on public.ngo_profiles
    for select using (
      owner_user_id = auth.uid()
      or public.is_active_ngo_member(id)
      or public.is_admin()
    );

  create policy "ngo_profiles: owner can insert" on public.ngo_profiles
    for insert with check (owner_user_id = auth.uid());

  create policy "ngo_profiles: owner can update" on public.ngo_profiles
    for update using (owner_user_id = auth.uid())
            with check (owner_user_id = auth.uid());

  -- ngo_members
  create policy "ngo_members: own row, co-member, owner or admin can read" on public.ngo_members
    for select using (
      user_id = auth.uid()
      or public.is_active_ngo_member(ngo_id)
      or public.is_ngo_owner(ngo_id)
      or public.is_admin()
    );

  create policy "ngo_members: owner or admin can insert" on public.ngo_members
    for insert with check (public.is_ngo_owner(ngo_id) or public.is_admin());

  create policy "ngo_members: owner or admin can update" on public.ngo_members
    for update using (public.is_ngo_owner(ngo_id) or public.is_admin())
            with check (public.is_ngo_owner(ngo_id) or public.is_admin());

  create policy "ngo_members: owner or admin can delete" on public.ngo_members
    for delete using (public.is_ngo_owner(ngo_id) or public.is_admin());

  raise notice '20260921_03: ngo — 3 policies on ngo_profiles, 4 on ngo_members, helpers is_active_ngo_member/is_ngo_owner installed';
end
$do$;

-- ── 4. Read-only verification — raises, so the transaction rolls back ───────
do $$
declare
  r        record;
  n        int;
  expected int;
  bad      text;
begin
  -- 4a. policy count per table equals the matrix (tables that do not exist are
  --     skipped, exactly as their block was skipped above)
  for r in
    select unnest(array[
             'firm_profiles', 'firm_members',
             'business_profiles', 'business_members',
             'government_profiles', 'government_members',
             'ngo_profiles', 'ngo_members'
           ]) as tbl
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;
    expected := case when r.tbl like '%_members' then 4 else 3 end;
    select count(*) into n
      from pg_policy where polrelid = ('public.' || r.tbl)::regclass;
    if n <> expected then
      raise exception '20260921_03 verify: public.% has % policies, expected %', r.tbl, n, expected;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || r.tbl)::regclass) then
      raise exception '20260921_03 verify: row level security is not enabled on public.%', r.tbl;
    end if;
  end loop;

  -- 4b. NO policy expression on the eight tables may read any of them inline.
  --     This is the 42P17 bug in one regex: helper functions only.
  select string_agg(format('%s.%s', c.relname, pol.polname), ', ') into bad
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in (
           'firm_profiles', 'firm_members',
           'business_profiles', 'business_members',
           'government_profiles', 'government_members',
           'ngo_profiles', 'ngo_members'
         )
     and (
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' '
        || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
         ) ~* '(from|join)[[:space:]]+(public\.)?(firm|business|government|ngo)_(members|profiles)';
  if bad is not null then
    raise exception '20260921_03 verify: policy expression reads an entity table inline (42P17 shape): %', bad;
  end if;

  -- 4c. belt and braces: no subquery of any kind in these policies
  select string_agg(format('%s.%s', c.relname, pol.polname), ', ') into bad
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in (
           'firm_profiles', 'firm_members',
           'business_profiles', 'business_members',
           'government_profiles', 'government_members',
           'ngo_profiles', 'ngo_members'
         )
     and (
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' '
        || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
         ) ~* '\([[:space:]]*select';
  if bad is not null then
    raise exception '20260921_03 verify: policy expression still contains a subquery: %', bad;
  end if;

  -- 4d. both helpers exist, and are SECURITY DEFINER, for every entity present
  for r in
    select * from (values
      ('firm_profiles',       'is_active_firm_member',       'is_firm_owner'),
      ('business_profiles',   'is_active_business_member',   'is_business_owner'),
      ('government_profiles', 'is_active_government_member', 'is_government_owner'),
      ('ngo_profiles',        'is_active_ngo_member',        'is_ngo_owner')
    ) as v(tbl, member_fn, owner_fn)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue;
    end if;
    select count(*) into n
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.proname in (r.member_fn, r.owner_fn)
       and p.prosecdef
       and p.pronargs = 1;
    if n <> 2 then
      raise exception '20260921_03 verify: expected security-definer %() and %(), found % of 2',
        r.member_fn, r.owner_fn, n;
    end if;
  end loop;

  raise notice '20260921_03 verify: OK — matrix in place, no policy on the eight tables reads any of them inline';
end $$;

commit;

-- Read-only re-check after applying in staging:
--   select c.relname, pol.polname, pol.polcmd,
--          pg_get_expr(pol.polqual, pol.polrelid)      as using_expr,
--          pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
--     from pg_policy pol join pg_class c on c.oid = pol.polrelid
--    where c.relname in ('firm_profiles','firm_members','business_profiles','business_members',
--                        'government_profiles','government_members','ngo_profiles','ngo_members')
--    order by c.relname, pol.polname;
--   -- and the PostgREST probe that returned 42P17 on 2026-09-20:
--   --   GET /rest/v1/business_members?select=id&limit=1   → 200 []
--   --   GET /rest/v1/firm_members?select=id&limit=1       → 200 []
