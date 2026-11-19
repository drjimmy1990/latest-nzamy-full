-- =============================================================================
-- Migration: 20261129_10_firm_company_roles_seats.sql
-- =============================================================================
-- PURPOSE (owner file 15, rows 2, 3 and 36; batch l9-secroles)
--
--   A. Row 2 — firm roles on the server. A firm TRAINEE (trainee) or LEGAL
--      SECRETARY (legal_secretary) no longer reads every case and client of
--      the firm: only what is assigned to him. Every other firm role keeps
--      what it had (the owner and the managing partner see everything; the
--      finance roles keep the firm finance tables).
--      «Scoped member» = an ACTIVE firm_members row of the case's firm whose
--      role is trainee or legal_secretary, and the caller is not the firm
--      owner — public.firm_case_scoped_member(p_firm).
--      1. public.case_visible(p_request) — THE case rule of 20261125_40 (copied
--         from its only definition, then extended): a firm case is hidden when
--         it is restricted OR the caller is a scoped member of its firm, unless
--         the caller is
--           * its filer (requester_user_id) or its lead (assigned_to);
--           * an active case-team member (case_team_members);
--           * the firm owner or an active managing partner;
--           * a platform admin;
--           * scoped members of an UNRESTRICTED case also: the assignee of a
--             hearing (hearings.assignee_user_id, 20261124_50) or of a task
--             (tasks.assignee_user_id) on that case — included only when the
--             column exists on this database.
--         Every «restricted case rows: case team only» policy (20261125_40,
--         20261126_40, 20261126_70: hearings, case_stages, tasks, deadlines,
--         case_notes, case_team_members, contracts, consultations, ledger,
--         tracking links, dashboard notes, time entries, expenses, trust
--         ledger, canvas boards, …) calls case_visible, so the children of a
--         case follow it with no new policy.
--      2. service_requests: a new RESTRICTIVE SELECT policy
--           «firm case: trainee and secretary see assigned cases only»
--           using (firm_id is null or not firm_case_scoped_member(firm_id)
--                  or case_visible(id))
--         (the 20261125_40 policy only called case_visible for restricted rows).
--      3. Client cards: public.client_card_visible(p_client) — a scoped member
--         sees a firm card he owns, or one linked to a case he sees
--         (service_requests.lawyer_client_id = the card, or the case was filed
--         by the card's platform account client_user_id). RESTRICTIVE SELECT
--         «firm role scope: assigned only» on lawyer_clients and
--         lawyer_client_notes.
--      4. public.firm_scoped_row_visible(firm, owner, case, client) — a
--         firm-wide row (contracts, consultations) is seen by a scoped member
--         only when it is his own, its case is visible to him, or its client
--         card is. The same RESTRICTIVE policy name on contracts and
--         consultations, and on the contract children (contract_versions,
--         contract_parties, contract_obligations, contract_payments) through
--         public.contract_scope_visible(contract) — they read through the
--         SECURITY DEFINER can_access_contract, which is NOT changed here.
--      5. The writer keeps his own work record: on time_entries, lawyer_expenses
--         and client_trust_ledger (20261126_40) the «restricted case rows:
--         case team only» policy is re-created as
--           (case_request_id is null or created_by = auth.uid()
--            or case_visible(case_request_id))
--         so a secretary's own timesheet line on a case he is not assigned to
--         (or no longer is) stays his — the owner's «a secretary reads only his
--         own» rule of l6. It reveals nothing he did not write himself.
--      SELECT only, TO authenticated only (the 20261125_40 reasons: a hidden
--      row cannot be updated or deleted either, and anon holds no EXECUTE on
--      these helpers). can_access_case_row is NOT changed: it is also called
--      as (null, firm_id) on rows with no case, and those stay firm-wide
--      (firm hearings / tasks with no case, the firm calendar).
--
--   B. Row 3 — company roles on the server.
--      1. public.business_case_reader(p_business): the company owner, or an
--         ACTIVE member whose role is one of owner, legal_manager, legal_staff,
--         compliance_officer, seconded (BUSINESS_CASE_ROLES of
--         src/constants/entityRouteAccess.ts). The 20260914 policy
--         «business members read business service requests» is re-created
--         with it (same name): an employee, department head, HR or finance
--         manager reads only the requests he filed or that are assigned to
--         him (the existing requester / assignee policies).
--      2. public.business_roster_reader(p_business): the company owner, or an
--         ACTIVE owner / legal_manager / hr_manager — the roles of
--         /dashboard/business/team. The business_members SELECT policy of
--         20260921_03 is replaced (still four policies on the table, still no
--         subquery — _verify's 20260922_02 block): a member reads his own row,
--         a roster manager reads the roster, an admin reads all. The e-mails
--         come from GET /api/v1/business/members, which now hides them from
--         everyone but a roster manager (and the member's own).
--
--   C. Row 36 — company seat cap (the firm design of 20261126_50).
--      business_profiles.max_seats int NOT NULL DEFAULT 5 (CHECK 1..10000):
--        the per-company override sales/admin raise (service role only —
--        authenticated holds column-scoped UPDATE grants since 20260922_03,
--        and none on this column). Extra seats are not sold online.
--      public.business_plan_seat_cap(plan) — the «المستخدمون» row of
--        /pricing (src/constants/pricing/pricing.companies.comparison.ts):
--        biz-sm 3/5/10, biz-md 5/15/25, biz-lg 10/30/custom,
--        dept-sm 2/5/10, dept-md 5/10/20, dept-lg 10/25/50. No company plan
--        is sold online today; the mapping applies when a plan is granted.
--      cap = greatest(plan seats of an active unexpired subscription of the
--        owner or of the company entity, or business_profiles.plan_id,
--        business_profiles.max_seats).
--      Seats = business_members rows invited / active / suspended (the
--        owner's row included). BEFORE INSERT OR UPDATE OF status,
--        business_id: a row that BECOMES a seat in a full company is refused
--        → 'business_seats_full' (P0001). The owner's own row is never
--        refused (the owner-membership trigger of 20260914 must not fail).
--      public.business_seat_status(p_business) → (used, cap) for roster
--        managers.
--
-- HOW TO RUN (any time; the code that reads it degrades honestly before):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_10_firm_company_roles_seats.sql
--   Expect: NOTICE  20261129_10 verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261128_60 (needs 20261125_40 case_visible, 20260914
--   business_id, 20260921_03 helpers, 20261126_40 / 20261126_70 tables when
--   present). Before or after the l9-secroles deploy: the new code only maps
--   the 'business_seats_full' token and hides e-mails in the API.
--   RE-RUN HAZARD: re-running 20261125_40 puts back the old case_visible
--   (trainees and secretaries read every firm case again), re-running
--   20261126_40 drops the writer's arm of A5, and re-running 20260914 or
--   20260921_03 puts back the role-blind business policies — re-run THIS
--   file after any of them. This file itself is idempotent.
--   No setting is changed (max_seats is a new column with its default).
--
-- ROLLBACK (manual, in this order):
--   do $$ declare r record; begin for r in select polrelid::regclass t, polname from pg_policy
--     where polname in ('firm case: trainee and secretary see assigned cases only', 'firm role scope: assigned only')
--     loop execute format('drop policy %I on %s', r.polname, r.t); end loop; end $$;
--   re-run 20261125_40_restricted_cases.sql (the old case_visible);
--   drop policy "business members read business service requests" on public.service_requests;
--     create it again as in 20260914 (is_active_business_member(business_id));
--   drop policy "business_members: own row, roster manager or admin can read" on public.business_members;
--     create "business_members: own row, co-member, owner or admin can read" as in 20260921_03;
--   drop trigger if exists trg_business_seat_cap on public.business_members;
--   drop function if exists public.business_seat_cap_guard(), public.business_seat_status(uuid),
--     public.business_seats_used(uuid), public.business_seat_cap(uuid), public.business_plan_seat_cap(text),
--     public.business_case_reader(uuid), public.business_roster_reader(uuid),
--     public.contract_scope_visible(text), public.firm_scoped_row_visible(uuid, uuid, text, uuid),
--     public.client_card_visible(uuid), public.firm_case_scoped_member(uuid);
--   business_profiles.max_seats is a record — keep it (or drop it last).
--
-- Docker: supabase/tests/rls/l9_secroles_firm.test.sql and
--   l9_secroles_business.test.sql (chains in their headers).
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ═════════════════════════════════════════════════════════════════════════════
-- A. Firm roles
-- ═════════════════════════════════════════════════════════════════════════════
do $pre$
begin
  if to_regclass('public.firm_members') is null or to_regclass('public.firm_profiles') is null
     or to_regclass('public.service_requests') is null then
    raise exception '20261129_10: firm_profiles / firm_members / service_requests are missing';
  end if;
  if to_regprocedure('public.case_visible(text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'service_requests' and column_name = 'is_restricted') then
    raise exception '20261129_10: run 20261125_40_restricted_cases.sql first (case_visible, service_requests.is_restricted)';
  end if;
  if to_regclass('public.case_team_members') is null then
    raise exception '20261129_10: public.case_team_members is missing — run 20261017_41 first';
  end if;
end
$pre$;

-- A scoped member: an active trainee / legal secretary of the firm who is not its owner.
create or replace function public.firm_case_scoped_member(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_firm is not null
     and exists (select 1 from public.firm_members m
                  where m.firm_id = p_firm and m.user_id = auth.uid()
                    and m.status = 'active' and m.role in ('trainee', 'legal_secretary'))
     and not exists (select 1 from public.firm_profiles fp
                      where fp.id = p_firm and fp.owner_user_id = auth.uid());
$$;

comment on function public.firm_case_scoped_member(uuid) is
  'Owner file 15 row 2 (20261129_10): the caller is an ACTIVE trainee or legal_secretary of p_firm and not its owner — he sees only the firm cases and clients assigned to him (case_visible, client_card_visible, firm_scoped_row_visible).';

-- case_visible: the 20261125_40 body, plus the scoped-member branch. Built
-- here so the hearing / task assignee arms are included only where the
-- columns exist (a function body naming a missing column cannot be created).
do $cv$
declare
  v_assignee text := '';
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'hearings' and column_name = 'assignee_user_id')
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hearings' and column_name = 'case_request_id') then
    v_assignee := v_assignee || '
              or exists (select 1 from public.hearings h
                          where h.case_request_id = sr.id and h.assignee_user_id = auth.uid())';
  else
    raise notice '20261129_10: hearings.assignee_user_id is not here — a hearing assignee is not a case arm';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_user_id')
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tasks' and column_name = 'case_request_id') then
    v_assignee := v_assignee || '
              or exists (select 1 from public.tasks tk
                          where tk.case_request_id = sr.id and tk.assignee_user_id = auth.uid())';
  else
    raise notice '20261129_10: tasks.assignee_user_id is not here — a task assignee is not a case arm';
  end if;

  execute '
create or replace function public.case_visible(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''''
as $fn$
  -- NULL-safe on purpose: with no session auth.uid() is null, every "= auth.uid()"
  -- is null, and coalesce(..., false) keeps a hidden case hidden.
  select not exists (
    select 1
      from public.service_requests sr
     where sr.id = p_request
       and sr.firm_id is not null
       and (sr.is_restricted or public.firm_case_scoped_member(sr.firm_id))
       and not coalesce((
             sr.requester_user_id = auth.uid()
          or sr.assigned_to = auth.uid()
          or exists (select 1 from public.firm_profiles fp
                      where fp.id = sr.firm_id and fp.owner_user_id = auth.uid())
          or exists (select 1 from public.firm_members m
                      where m.firm_id = sr.firm_id and m.user_id = auth.uid()
                        and m.status = ''active'' and m.role = ''managing_partner'')
          or exists (select 1
                       from public.case_team_members t
                       join public.firm_members tm
                         on tm.firm_id = t.firm_id and tm.user_id = t.user_id and tm.status = ''active''
                      where t.request_id = sr.id and t.firm_id = sr.firm_id and t.user_id = auth.uid())
          or public.is_admin()
          or (not sr.is_restricted and (false' || v_assignee || '))
       ), false)
  );
$fn$';
end
$cv$;

comment on function public.case_visible(text) is
  'N01-19 (20261125_40) + owner file 15 row 2 (20261129_10): false for a firm case that is restricted, or whose firm the caller belongs to only as a trainee / legal secretary, unless the caller is its filer, lead, active case-team member, the firm owner, an active managing partner or a platform admin (and, for an unrestricted case, the assignee of one of its hearings or tasks). Used by every "restricted case…" and "firm case…" RESTRICTIVE policy.';

-- the case row itself
drop policy if exists "firm case: trainee and secretary see assigned cases only" on public.service_requests;
create policy "firm case: trainee and secretary see assigned cases only" on public.service_requests
  as restrictive
  for select
  to authenticated
  using (firm_id is null or not public.firm_case_scoped_member(firm_id) or public.case_visible(id));

-- client cards
do $cc$
begin
  if to_regclass('public.lawyer_clients') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'service_requests' and column_name = 'lawyer_client_id') then
    raise notice '20261129_10: lawyer_clients / service_requests.lawyer_client_id are not here — client cards skipped';
    return;
  end if;

  execute $fn$
create or replace function public.client_card_visible(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $body$
  -- true unless the card belongs to a firm whose scoped member the caller is
  -- and it is neither his own card nor linked to a case he sees.
  select coalesce((
    select not public.firm_case_scoped_member(c.firm_id)
        or c.owner_user_id = auth.uid()
        or exists (select 1 from public.service_requests sr
                    where sr.firm_id = c.firm_id
                      and (sr.lawyer_client_id = c.id
                           or (c.client_user_id is not null and sr.requester_user_id = c.client_user_id))
                      and public.case_visible(sr.id))
      from public.lawyer_clients c
     where c.id = p_client and c.firm_id is not null
  ), true);
$body$
$fn$;

  execute $c$ comment on function public.client_card_visible(uuid) is
  'Owner file 15 row 2 (20261129_10): a firm client card is hidden from a trainee / legal secretary of its firm unless he owns it or it is linked to a case he sees (lawyer_client_id, or the case was filed by the card''s platform account).' $c$;

  execute 'drop policy if exists "firm role scope: assigned only" on public.lawyer_clients';
  execute 'create policy "firm role scope: assigned only" on public.lawyer_clients
             as restrictive for select to authenticated
             using (firm_id is null or not public.firm_case_scoped_member(firm_id) or public.client_card_visible(id))';

  if to_regclass('public.lawyer_client_notes') is not null then
    execute 'drop policy if exists "firm role scope: assigned only" on public.lawyer_client_notes';
    execute 'create policy "firm role scope: assigned only" on public.lawyer_client_notes
               as restrictive for select to authenticated
               using (public.client_card_visible(client_id))';
  end if;
end
$cc$;

-- A5: the writer keeps his own time / expense / trust rows
do $own$
declare
  t text;
begin
  foreach t in array array['time_entries', 'lawyer_expenses', 'client_trust_ledger'] loop
    if to_regclass('public.' || t) is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'created_by')
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'case_request_id') then
      raise notice '20261129_10: public.% (created_by, case_request_id) is not here — skipped', t;
      continue;
    end if;
    execute pg_catalog.format('drop policy if exists %I on public.%I', 'restricted case rows: case team only', t);
    execute pg_catalog.format(
      'create policy %I on public.%I as restrictive for select to authenticated using (case_request_id is null or created_by = auth.uid() or public.case_visible(case_request_id))',
      'restricted case rows: case team only', t);
  end loop;
end
$own$;

-- firm-wide rows that carry an owner, a case and a client card
do $rows$
declare
  v_client_fn boolean := to_regprocedure('public.client_card_visible(uuid)') is not null;
begin
  execute format($fn$
create or replace function public.firm_scoped_row_visible(p_firm uuid, p_owner uuid, p_request text, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $body$
  select not public.firm_case_scoped_member(p_firm)
      or (p_owner is not null and p_owner = auth.uid())
      or (p_request is not null
          and exists (select 1 from public.service_requests sr where sr.id = p_request and sr.firm_id = p_firm)
          and public.case_visible(p_request))
      or %s;
$body$
$fn$, case when v_client_fn then
        '(p_client is not null
          and exists (select 1 from public.lawyer_clients c where c.id = p_client and c.firm_id = p_firm)
          and public.client_card_visible(p_client))'
      else 'false' end);

  execute $c$ comment on function public.firm_scoped_row_visible(uuid, uuid, text, uuid) is
  'Owner file 15 row 2 (20261129_10): a firm-wide row (contract, consultation) is seen by a trainee / legal secretary of p_firm only when p_owner is him, its case p_request is visible to him, or its client card p_client is. True for everyone else.' $c$;
end
$rows$;

do $ct$
declare
  v_has_client boolean;
  child text;
begin
  -- contracts
  if to_regclass('public.contracts') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contracts' and column_name = 'firm_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'contracts' and column_name = 'owner_user_id') then
    v_has_client := exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'contracts' and column_name = 'lawyer_client_id');
    execute 'drop policy if exists "firm role scope: assigned only" on public.contracts';
    execute format('create policy "firm role scope: assigned only" on public.contracts
                      as restrictive for select to authenticated
                      using (firm_id is null or not public.firm_case_scoped_member(firm_id)
                             or public.firm_scoped_row_visible(firm_id, owner_user_id, request_id, %s))',
                   case when v_has_client then 'lawyer_client_id' else 'null::uuid' end);

    execute format($fn$
create or replace function public.contract_scope_visible(p_contract text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $body$
  select coalesce((
    select (c.firm_id is null or not public.firm_case_scoped_member(c.firm_id)
            or public.firm_scoped_row_visible(c.firm_id, c.owner_user_id, c.request_id, %s))
       and (c.request_id is null or public.case_visible(c.request_id))
      from public.contracts c
     where c.id = p_contract
  ), true);
$body$
$fn$, case when v_has_client then 'c.lawyer_client_id' else 'null::uuid' end);

    execute $c$ comment on function public.contract_scope_visible(text) is
    'Owner file 15 row 2 (20261129_10): the contract''s own scope (firm_scoped_row_visible) and its case (case_visible), for the contract children that read through the SECURITY DEFINER can_access_contract.' $c$;

    foreach child in array array['contract_versions', 'contract_parties', 'contract_obligations', 'contract_payments'] loop
      if to_regclass('public.' || child) is null
         or not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = child and column_name = 'contract_id') then
        raise notice '20261129_10: public.%.contract_id is not here — skipped', child;
        continue;
      end if;
      execute format('drop policy if exists %I on public.%I', 'firm role scope: assigned only', child);
      execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.contract_scope_visible(contract_id))',
                     'firm role scope: assigned only', child);
    end loop;
  else
    raise notice '20261129_10: public.contracts (firm_id, owner_user_id) is not here — contracts skipped';
  end if;

  -- consultations
  if to_regclass('public.consultations') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'consultations' and column_name = 'firm_id') then
    v_has_client := exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'consultations' and column_name = 'lawyer_client_id');
    execute 'drop policy if exists "firm role scope: assigned only" on public.consultations';
    execute format('create policy "firm role scope: assigned only" on public.consultations
                      as restrictive for select to authenticated
                      using (firm_id is null or not public.firm_case_scoped_member(firm_id)
                             or public.firm_scoped_row_visible(firm_id, lawyer_user_id, request_id, %s))',
                   case when v_has_client then 'lawyer_client_id' else 'null::uuid' end);
  else
    raise notice '20261129_10: public.consultations.firm_id is not here — consultations skipped';
  end if;
end
$ct$;


-- ═════════════════════════════════════════════════════════════════════════════
-- B. Company roles
-- ═════════════════════════════════════════════════════════════════════════════
do $biz$
begin
  if to_regclass('public.business_members') is null or to_regclass('public.business_profiles') is null then
    raise notice '20261129_10: business_profiles / business_members are not here — company roles and seats skipped';
    return;
  end if;

  execute $fn$
create or replace function public.business_case_reader(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $body$
  select p_business is not null and (
    exists (select 1 from public.business_profiles bp
             where bp.id = p_business and bp.owner_user_id = auth.uid())
    or exists (select 1 from public.business_members m
                where m.business_id = p_business and m.user_id = auth.uid() and m.status = 'active'
                  and m.role in ('owner', 'legal_manager', 'legal_staff', 'compliance_officer', 'seconded')));
$body$
$fn$;
  execute $c$ comment on function public.business_case_reader(uuid) is
  'Owner file 15 row 3 (20261129_10): the caller reads every request and case of company p_business — its owner, or an ACTIVE owner / legal_manager / legal_staff / compliance_officer / seconded member (BUSINESS_CASE_ROLES, src/constants/entityRouteAccess.ts).' $c$;

  execute $fn$
create or replace function public.business_roster_reader(p_business uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $body$
  select p_business is not null and (
    exists (select 1 from public.business_profiles bp
             where bp.id = p_business and bp.owner_user_id = auth.uid())
    or exists (select 1 from public.business_members m
                where m.business_id = p_business and m.user_id = auth.uid() and m.status = 'active'
                  and m.role in ('owner', 'legal_manager', 'hr_manager')));
$body$
$fn$;
  execute $c$ comment on function public.business_roster_reader(uuid) is
  'Owner file 15 row 3 (20261129_10): the caller reads the whole roster of company p_business — its owner, or an ACTIVE owner / legal_manager / hr_manager member (the roles of /dashboard/business/team). Everyone else reads his own row only.' $c$;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'service_requests' and column_name = 'business_id') then
    execute 'drop policy if exists "business members read business service requests" on public.service_requests';
    -- TO authenticated: anon holds no EXECUTE on the helper, and a policy
    -- naming it would turn every guest read of service_requests into 42501.
    execute 'create policy "business members read business service requests" on public.service_requests
               for select
               to authenticated
               using (business_id is not null and public.business_case_reader(business_id))';
  else
    raise notice '20261129_10: service_requests.business_id is not here — run 20260914 first; the company request policy is skipped';
  end if;

  execute 'drop policy if exists "business_members: own row, co-member, owner or admin can read" on public.business_members';
  execute 'drop policy if exists "business_members: own row, roster manager or admin can read" on public.business_members';
  execute 'create policy "business_members: own row, roster manager or admin can read" on public.business_members
             for select
             to authenticated
             using (user_id = auth.uid() or public.business_roster_reader(business_id) or public.is_admin())';
end
$biz$;


-- ═════════════════════════════════════════════════════════════════════════════
-- C. Company seat cap
-- ═════════════════════════════════════════════════════════════════════════════
do $seats$
begin
  if to_regclass('public.business_members') is null or to_regclass('public.business_profiles') is null then
    return;
  end if;

  alter table public.business_profiles
    add column if not exists max_seats int not null default 5;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.business_profiles'::regclass and conname = 'business_profiles_max_seats_check') then
    alter table public.business_profiles
      add constraint business_profiles_max_seats_check check (max_seats between 1 and 10000);
  end if;
  comment on column public.business_profiles.max_seats is
    'Seat cap (20261129_10, owner file 15 row 36): the per-company override sales/admin raise (service role only). Seats = greatest(this, the active company plan''s seats).';

  execute $fn$
create or replace function public.business_plan_seat_cap(p_plan text)
returns int
language sql
immutable
set search_path = ''
as $body$
  select case p_plan
           when 'biz-sm-basic'  then 3
           when 'biz-sm-pro'    then 5
           when 'biz-sm-full'   then 10
           when 'biz-md-basic'  then 5
           when 'biz-md-pro'    then 15
           when 'biz-md-full'   then 25
           when 'biz-lg-basic'  then 10
           when 'biz-lg-pro'    then 30
           when 'dept-sm-basic' then 2
           when 'dept-sm-pro'   then 5
           when 'dept-sm-full'  then 10
           when 'dept-md-basic' then 5
           when 'dept-md-pro'   then 10
           when 'dept-md-full'  then 20
           when 'dept-lg-basic' then 10
           when 'dept-lg-pro'   then 25
           when 'dept-lg-full'  then 50
           else null
         end;
$body$
$fn$;
  execute $c$ comment on function public.business_plan_seat_cap(text) is
  'Seat cap (20261129_10): the users each company plan includes — the «المستخدمون» row of /pricing (pricing.companies.comparison.ts). null for biz-lg-full (by contract) and any other plan.' $c$;

  execute $fn$
create or replace function public.business_seat_cap(p_business uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_owner    uuid;
  v_override int;
  v_plan_id  text;
  v_plan     int;
begin
  select bp.owner_user_id, bp.max_seats, bp.plan_id
    into v_owner, v_override, v_plan_id
    from public.business_profiles bp
   where bp.id = p_business;
  if not found then
    return 0;
  end if;
  v_plan := public.business_plan_seat_cap(v_plan_id);
  if to_regclass('public.subscriptions') is not null then
    execute 'select greatest($3, max(public.business_plan_seat_cap(s.plan_id)))
               from public.subscriptions s
              where (s.user_id = $1 or (s.entity_type = ''business'' and s.entity_id = $2))
                and s.status = ''active''
                and (s.current_period_end is null or s.current_period_end > now())'
      into v_plan using v_owner, p_business, v_plan;
  end if;
  return greatest(coalesce(v_plan, 0), coalesce(v_override, 5));
end
$body$
$fn$;
  execute $c$ comment on function public.business_seat_cap(uuid) is
  'Seat cap (20261129_10): greatest(the active company plan''s users — business_plan_seat_cap of an active unexpired subscription of the owner or the company, or business_profiles.plan_id —, business_profiles.max_seats).' $c$;

  execute $fn$
create or replace function public.business_seats_used(p_business uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $body$
  select count(*)::int
    from public.business_members m
   where m.business_id = p_business
     and m.status in ('invited', 'active', 'suspended');
$body$
$fn$;
  execute $c$ comment on function public.business_seats_used(uuid) is
  'Seat cap (20261129_10): seats taken = invited + active + suspended members (the owner''s row included).' $c$;

  execute $fn$
create or replace function public.business_seat_status(p_business uuid)
returns table (used int, cap int)
language plpgsql
stable
security definer
set search_path = ''
as $body$
begin
  if auth.uid() is null then
    raise exception 'business_seat_status: sign in' using errcode = '42501';
  end if;
  if not public.business_roster_reader(p_business) then
    raise exception 'business_seat_status: only the company owner, legal manager or HR manager' using errcode = '42501';
  end if;
  return query select public.business_seats_used(p_business), public.business_seat_cap(p_business);
end
$body$
$fn$;
  execute $c$ comment on function public.business_seat_status(uuid) is
  'Seat cap (20261129_10): (used, cap) of a company, for its roster managers (business_roster_reader).' $c$;

  execute $fn$
create or replace function public.business_seat_cap_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_cap int;
  v_n   int;
begin
  if new.status not in ('invited', 'active', 'suspended') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('invited', 'active', 'suspended')
     and old.business_id = new.business_id then
    return new;   -- already a seat: accept, suspend, re-activate
  end if;
  -- the owner always holds his own seat (the 20260914 owner-membership trigger)
  if exists (select 1 from public.business_profiles bp
              where bp.id = new.business_id and bp.owner_user_id = new.user_id) then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('business_seats:' || new.business_id::text));
  v_cap := public.business_seat_cap(new.business_id);
  select count(*) into v_n
    from public.business_members m
   where m.business_id = new.business_id
     and m.id is distinct from new.id
     and m.status in ('invited', 'active', 'suspended');
  if v_n >= v_cap then
    raise exception 'business_seats_full' using errcode = 'P0001', detail = 'business_members';
  end if;
  return new;
end
$body$
$fn$;
  execute $c$ comment on function public.business_seat_cap_guard() is
  'Seat cap (20261129_10): a business_members row that BECOMES a seat is refused when the company is full (business_seat_cap). Keyed on the row, so the service role is held too; the owner''s own row is never refused.' $c$;

  execute 'drop trigger if exists trg_business_seat_cap on public.business_members';
  execute 'create trigger trg_business_seat_cap
             before insert or update of status, business_id on public.business_members
             for each row execute function public.business_seat_cap_guard()';
end
$seats$;


-- ── Function privileges ──────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  -- called by policies (session) → authenticated + service_role; never anon
  foreach f in array array[
    'public.firm_case_scoped_member(uuid)',
    'public.case_visible(text)',
    'public.client_card_visible(uuid)',
    'public.firm_scoped_row_visible(uuid, uuid, text, uuid)',
    'public.contract_scope_visible(text)',
    'public.business_case_reader(uuid)',
    'public.business_roster_reader(uuid)',
    'public.business_seat_status(uuid)'
  ] loop
    if to_regprocedure(f) is null then
      continue;
    end if;
    execute pg_catalog.format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('grant execute on function %s to authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  -- internal: no session EXECUTE (the cap of any company is not a session's business)
  foreach f in array array[
    'public.business_plan_seat_cap(text)',
    'public.business_seat_cap(uuid)',
    'public.business_seats_used(uuid)',
    'public.business_seat_cap_guard()'
  ] loop
    if to_regprocedure(f) is null then
      continue;
    end if;
    execute pg_catalog.format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end
$grants$;


-- ── Verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  missing text := '';
  f text;
  t text;
  n int;
begin
  foreach f in array array['public.firm_case_scoped_member(uuid)', 'public.case_visible(text)',
                           'public.firm_scoped_row_visible(uuid, uuid, text, uuid)'] loop
    if to_regprocedure(f) is null then
      missing := missing || pg_catalog.format(' %s is missing;', f);
    elsif not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
      missing := missing || pg_catalog.format(' %s is not SECURITY DEFINER with an empty search_path;', f);
    elsif exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' anon can EXECUTE %s;', f);
    end if;
  end loop;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure('public.case_visible(text)')), 'firm_case_scoped_member') = 0 then
    missing := missing || ' case_visible has no scoped-member branch;';
  end if;
  if not exists (select 1 from pg_catalog.pg_policy
                  where polrelid = 'public.service_requests'::regclass
                    and polname = 'firm case: trainee and secretary see assigned cases only'
                    and not polpermissive and polcmd = 'r') then
    missing := missing || ' the restrictive firm-case policy on service_requests;';
  end if;
  foreach t in array array['lawyer_clients', 'lawyer_client_notes', 'contracts', 'consultations'] loop
    if to_regclass('public.' || t) is not null and not exists (
         select 1 from pg_catalog.pg_policy
          where polrelid = to_regclass('public.' || t)
            and polname = 'firm role scope: assigned only' and not polpermissive and polcmd = 'r') then
      missing := missing || pg_catalog.format(' the restrictive role-scope policy on %s;', t);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (select 1 from pg_catalog.pg_policy
                  where polname in ('firm case: trainee and secretary see assigned cases only', 'firm role scope: assigned only',
                                    'business members read business service requests',
                                    'business_members: own row, roster manager or admin can read')
                    and not (polroles @> array[(select oid from pg_catalog.pg_roles where rolname = 'authenticated')])) then
    missing := missing || ' a role-scope policy is not TO authenticated (guests would hit 42501);';
  end if;

  if to_regclass('public.business_members') is not null and to_regclass('public.business_profiles') is not null then
    select count(*) into n from pg_catalog.pg_policy
     where polrelid = 'public.business_members'::regclass
       and polname = 'business_members: own row, co-member, owner or admin can read';
    if n <> 0 then
      missing := missing || ' the role-blind business_members read policy is still there;';
    end if;
    if not exists (select 1 from pg_catalog.pg_policy
                    where polrelid = 'public.business_members'::regclass
                      and polname = 'business_members: own row, roster manager or admin can read'
                      and pg_catalog.pg_get_expr(polqual, polrelid) ilike '%business_roster_reader%') then
      missing := missing || ' the business_members roster policy;';
    end if;
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'service_requests' and column_name = 'business_id')
       and not exists (select 1 from pg_catalog.pg_policy
                        where polrelid = 'public.service_requests'::regclass
                          and polname = 'business members read business service requests'
                          and pg_catalog.pg_get_expr(polqual, polrelid) ilike '%business_case_reader%') then
      missing := missing || ' the company request policy is still role-blind;';
    end if;
    if not exists (select 1 from pg_catalog.pg_trigger
                    where tgrelid = 'public.business_members'::regclass and tgname = 'trg_business_seat_cap' and not tgisinternal) then
      missing := missing || ' trg_business_seat_cap;';
    end if;
    -- max_seats carries no column grant of its own. A session can write it
    -- only through a TABLE-level UPDATE/INSERT grant, which 20260922_03
    -- revoked (its own _verify block guards that); on a database without
    -- 20260922_03 this only reports.
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      if has_table_privilege('authenticated', 'public.business_profiles', 'UPDATE')
         or has_table_privilege('authenticated', 'public.business_profiles', 'INSERT') then
        raise notice '20261129_10: authenticated holds a table-level write grant on business_profiles (20260922_03 not applied here) — max_seats is session-writable until it is';
      elsif has_column_privilege('authenticated', 'public.business_profiles', 'max_seats', 'UPDATE')
            or has_column_privilege('authenticated', 'public.business_profiles', 'max_seats', 'INSERT') then
        missing := missing || ' a session holds a column grant on business_profiles.max_seats;';
      end if;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated')
       and has_function_privilege('authenticated', 'public.business_seat_cap(uuid)', 'EXECUTE') then
      missing := missing || ' sessions can EXECUTE business_seat_cap(uuid);';
    end if;
  end if;

  if missing <> '' then
    raise exception '20261129_10 verify:%', missing;
  end if;
  raise notice '20261129_10 verify: OK — firm trainee/secretary see assigned cases and clients only; company cases and roster by role; company seat cap';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261129_10 firm roles + company roles + company seat cap' as step,
       to_regprocedure('public.firm_case_scoped_member(uuid)') is not null
       and coalesce(pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure('public.case_visible(text)')), 'firm_case_scoped_member') > 0, false)
       and exists (select 1 from pg_catalog.pg_policy
                    where polrelid = 'public.service_requests'::regclass
                      and polname = 'firm case: trainee and secretary see assigned cases only')
       and (to_regclass('public.business_members') is null
            or exists (select 1 from pg_catalog.pg_trigger
                        where tgrelid = to_regclass('public.business_members') and tgname = 'trg_business_seat_cap'))
       as ok;
