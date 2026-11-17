-- =============================================================================
-- Migration: 20261125_40_restricted_cases.sql
-- =============================================================================
-- PURPOSE (owner package 13 Nov 2026, file 01 + TODO 2026-11-17; batch l4-lawyer)
--
--   A. N01-19 «عزل القضايا المقيدة» — a firm case can be marked restricted.
--      1. public.service_requests.is_restricted boolean NOT NULL DEFAULT false.
--      2. public.case_visible(p_request text) — THE restriction rule, once:
--         a case is visible to the caller unless it is a FIRM case marked
--         restricted and the caller is none of:
--           * its filer (requester_user_id) or its lead (assigned_to);
--           * an explicit case-team member (case_team_members, 20261017_41)
--             who is still an ACTIVE member of the case's firm;
--           * the firm owner (firm_profiles.owner_user_id);
--           * an ACTIVE managing_partner of the case's firm;
--           * a platform admin (public.is_admin()) — the case tables keep
--             their admin read arms.
--         The firm owner and managing partner are in the set ON PURPOSE (the
--         restriction model decision, see the l4-lawyer report): whoever may
--         lift a restriction must still see the case to do it.
--      3. RESTRICTIVE policies (AND-ed with every permissive policy, new names
--         that no older file drops), so can_access_case_row(owner, firm) and
--         every existing policy stay exactly as they are:
--           * service_requests  FOR SELECT  (not is_restricted or case_visible(id))
--           * every case child table that has a firm-wide arm, FOR ALL:
--             (<case column> is null or case_visible(<case column>))
--             case_stages, hearings, tasks, activity_events, case_graphs,
--             deadlines, legal_ledger_entries, case_tracking_links,
--             dashboard_notes (case_request_id); case_notes,
--             case_team_members, contracts, consultations (request_id).
--             task_steps follows tasks through its own EXISTS policy.
--           A table or column missing on this database is skipped (NOTICE).
--         can_access_case_row(p_owner, p_firm) has no case id (it is also
--         called with (null, firm_id) on non-case rows), so the rule lives in
--         case_visible() instead — the TODO's «can_access_case_row: isolate
--         restricted cases» is met for every row it guards.
--      4. public.set_case_restricted(p_request text, p_restricted boolean) —
--         SECURITY DEFINER (the session write guard trg_00_service_requests_
--         session_guard, 20261018_04, refuses any session UPDATE of a column
--         other than status/updated_at/lawyer_client_id). Allowed: the firm
--         owner, an active managing partner, or the case's lead/filer while an
--         active member of the case's firm. Firm cases only (22023 otherwise),
--         42501 for anyone else.
--
--   B. N01-21/22/23 — public.ai_runs.case_request_id text NULL
--      references service_requests(id) ON DELETE SET NULL (+ index, + column
--      SELECT grant to authenticated). Written by the server only
--      (POST /api/v1/cases/[id]/documents/from-ai, service role, after it has
--      checked run.user_id = the caller and that the caller can read the case).
--
--   C. F7 — firm invitations by link + leaving the firm.
--      1. team_invitations (20260603_phase1_004, unused until now): its INSERT
--         policy only checks inviter_id = auth.uid(), so anyone could mint an
--         invitation into any firm's entity_id. INSERT / UPDATE / DELETE are
--         revoked from anon and authenticated; rows are written only by:
--      2. public.create_firm_team_invitation(p_firm, p_email, p_role) —
--         firm owner or active managing partner; one live invitation per
--         (firm, e-mail): an older pending one is cancelled. Returns id,
--         token, expires_at (7 days, the table default).
--      3. public.redeem_firm_team_invitation(p_token) — the signed-in
--         invitee. Re-checks: pending, not expired, entity_type 'firm', the
--         inviter STILL owns the firm or is still its active managing partner,
--         the caller's e-mail equals invitee_email, the caller is a lawyer or
--         individual account and not the firm owner. Writes a firm_members row
--         at status 'invited' (or re-opens a removed/suspended one) and marks
--         the invitation accepted; returns the membership id. The app then
--         calls the existing POST /api/v1/me/invitations/firm/{id}/accept, so
--         the consent guard of 20260922_02 is the only way to 'active'.
--      4. public.leave_firm(p_firm uuid) — an active member (never the
--         owner) sets his own row to 'removed'. The existing trigger
--         trg_firm_members_removed_transfer (20261026_70) then moves his firm
--         rows to the firm owner (transfer_firm_assets).
--      5. public.cancel_firm_team_invitation(p_id uuid) — owner / managing
--         partner cancel a pending invitation of their firm.
--
--   D. Q468–Q470 — the firm finance points counter.
--      1. public.firm_member_points_usage(uuid) is re-created with the SAME
--         signature and columns; the only change is that an active
--         finance_manager may read it too (Q469: owner + managing partner +
--         financial manager). Counting from the join date (Q468) is unchanged.
--      2. public.firm_points_overview(p_firm uuid) returns jsonb:
--           { "owner_balance": <unexpired points of the firm account>,
--             "founder_works": [ { "user_id", "works_month", "works_total" } ] }
--         founder_works = AI runs of each ACTIVE member paid with a founder
--         membership credit (membership_credit_uses → ai_runs.user_id), not
--         restored, since the member joined. Same caller rule as 1. A missing
--         table (founder membership not installed) gives null, never 0.
--
-- HOW TO RUN (BEFORE the deploy — the new routes call these functions; the old
--   code never reads the new column, so running it early is safe):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261125_40_restricted_cases.sql
--   Expect: NOTICE  20261125_40 verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261124_70 (the last file on prod); any time before the
--   l4-lawyer deploy. Re-runnable (if not exists / create or replace / drop
--   policy if exists).
--
-- ROLLBACK (manual, in this order):
--   do $$ declare r record; begin for r in select polrelid::regclass t, polname from pg_policy
--     where polname in ('restricted case: case team only', 'restricted case rows: case team only')
--     loop execute format('drop policy %I on %s', r.polname, r.t); end loop; end $$;
--   drop function if exists public.set_case_restricted(text, boolean), public.case_visible(text),
--     public.create_firm_team_invitation(uuid, text, text), public.redeem_firm_team_invitation(text),
--     public.cancel_firm_team_invitation(uuid), public.leave_firm(uuid), public.firm_points_overview(uuid);
--   alter table public.service_requests drop column if exists is_restricted;
--   alter table public.ai_runs drop column if exists case_request_id;
--   grant insert, update, delete on public.team_invitations to authenticated;
--   re-run 20261108_30_firm_member_points_usage.sql (finance_manager loses the counter).
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.service_requests') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'service_requests' and column_name = 'firm_id') then
    raise exception '20261125_40: service_requests.firm_id is missing — run 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
  if to_regclass('public.case_team_members') is null then
    raise exception '20261125_40: public.case_team_members is missing — run 20261017_41_notes_visibility_case_team.sql first';
  end if;
  if to_regclass('public.firm_members') is null or to_regclass('public.firm_profiles') is null then
    raise exception '20261125_40: firm_profiles / firm_members missing';
  end if;
end
$pre$;


-- ═════════════════════════════════════════════════════════════════════════════
-- A. Restricted cases
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.service_requests
  add column if not exists is_restricted boolean not null default false;

comment on column public.service_requests.is_restricted is
  'N01-19 (20261125_40): a restricted FIRM case is seen only by its filer, its lead, its case team (active members), the firm owner, active managing partners and platform admins — see public.case_visible(). Changed only through public.set_case_restricted().';

create index if not exists idx_service_requests_restricted
  on public.service_requests (id) where is_restricted;

create or replace function public.case_visible(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- NULL-safe on purpose: with no session auth.uid() is null, every "= auth.uid()"
  -- is null, and coalesce(..., false) keeps a restricted case hidden.
  select not exists (
    select 1
      from public.service_requests sr
     where sr.id = p_request
       and sr.is_restricted
       and sr.firm_id is not null
       and not coalesce((
             sr.requester_user_id = auth.uid()
          or sr.assigned_to = auth.uid()
          or exists (select 1 from public.firm_profiles fp
                      where fp.id = sr.firm_id and fp.owner_user_id = auth.uid())
          or exists (select 1 from public.firm_members m
                      where m.firm_id = sr.firm_id and m.user_id = auth.uid()
                        and m.status = 'active' and m.role = 'managing_partner')
          or exists (select 1
                       from public.case_team_members t
                       join public.firm_members tm
                         on tm.firm_id = t.firm_id and tm.user_id = t.user_id and tm.status = 'active'
                      where t.request_id = sr.id and t.firm_id = sr.firm_id and t.user_id = auth.uid())
          or public.is_admin()
       ), false)
  );
$$;

comment on function public.case_visible(text) is
  'N01-19 (20261125_40): false only for a restricted firm case and a caller who is not its filer, lead, active case-team member, firm owner, active managing partner or a platform admin. Used by the "restricted case…" RESTRICTIVE policies.';

-- service_requests itself
drop policy if exists "restricted case: case team only" on public.service_requests;
create policy "restricted case: case team only" on public.service_requests
  as restrictive
  for select
  using (not is_restricted or public.case_visible(id));

-- the case child tables
do $children$
declare
  pair text[];
  t text;
  c text;
begin
  foreach pair slice 1 in array array[
    array['case_stages',          'case_request_id'],
    array['hearings',             'case_request_id'],
    array['tasks',                'case_request_id'],
    array['activity_events',      'case_request_id'],
    array['case_graphs',          'case_request_id'],
    array['deadlines',            'case_request_id'],
    array['legal_ledger_entries', 'case_request_id'],
    array['case_tracking_links',  'case_request_id'],
    array['dashboard_notes',      'case_request_id'],
    array['case_notes',           'request_id'],
    array['case_team_members',    'request_id'],
    array['contracts',            'request_id'],
    array['consultations',        'request_id']
  ] loop
    t := pair[1];
    c := pair[2];
    if to_regclass('public.' || t) is null then
      raise notice '20261125_40: public.% does not exist here — skipped', t;
      continue;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = c) then
      raise notice '20261125_40: public.%.% does not exist here — skipped', t, c;
      continue;
    end if;
    execute pg_catalog.format('drop policy if exists %I on public.%I', 'restricted case rows: case team only', t);
    execute pg_catalog.format(
      'create policy %I on public.%I as restrictive for all using (%I is null or public.case_visible(%I)) with check (%I is null or public.case_visible(%I))',
      'restricted case rows: case team only', t, c, c, c, c);
  end loop;
end
$children$;

-- Who may restrict / lift: firm owner, active managing partner, or the case's
-- lead / filer while an active member of the case's firm.
create or replace function public.can_restrict_case(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select exists (select 1 from public.firm_profiles fp
                    where fp.id = sr.firm_id and fp.owner_user_id = auth.uid())
        or exists (select 1 from public.firm_members m
                    where m.firm_id = sr.firm_id and m.user_id = auth.uid()
                      and m.status = 'active'
                      and (m.role = 'managing_partner'
                           or sr.assigned_to = auth.uid()
                           or sr.requester_user_id = auth.uid()))
      from public.service_requests sr
     where sr.id = p_request and sr.firm_id is not null
  ), false);
$$;

comment on function public.can_restrict_case(text) is
  'N01-19 (20261125_40): may the caller mark this firm case restricted or lift it — firm owner, active managing partner, or the case''s lead/filer while an active member of its firm.';

create or replace function public.set_case_restricted(p_request text, p_restricted boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_firm uuid;
begin
  if auth.uid() is null then
    raise exception 'set_case_restricted: sign in' using errcode = '42501';
  end if;
  if p_restricted is null then
    raise exception 'set_case_restricted: p_restricted is required' using errcode = '22023';
  end if;
  select sr.firm_id into v_firm from public.service_requests sr where sr.id = p_request;
  if not found then
    raise exception 'set_case_restricted: no such case' using errcode = 'P0002';
  end if;
  if v_firm is null then
    raise exception 'set_case_restricted: only a firm case can be restricted' using errcode = '22023';
  end if;
  if not public.can_restrict_case(p_request) then
    raise exception 'set_case_restricted: only the firm owner, a managing partner or the case''s lawyer may change this' using errcode = '42501';
  end if;
  update public.service_requests
     set is_restricted = p_restricted
   where id = p_request
     and is_restricted is distinct from p_restricted;
  return p_restricted;
end;
$$;

comment on function public.set_case_restricted(text, boolean) is
  'N01-19 (20261125_40): mark a firm case restricted (true) or open it to the whole firm again (false). Caller rule: public.can_restrict_case().';


-- ═════════════════════════════════════════════════════════════════════════════
-- B. ai_runs.case_request_id
-- ═════════════════════════════════════════════════════════════════════════════
do $airuns$
begin
  if to_regclass('public.ai_runs') is null then
    raise notice '20261125_40: public.ai_runs does not exist here — case_request_id skipped';
    return;
  end if;
  alter table public.ai_runs
    add column if not exists case_request_id text references public.service_requests(id) on delete set null;
  create index if not exists ai_runs_case_request_idx on public.ai_runs (case_request_id) where case_request_id is not null;
  comment on column public.ai_runs.case_request_id is
    'N01-21/22 (20261125_40): the case this run''s result was saved to (server-written, after checking the run is the caller''s and the case is readable by him).';
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select (case_request_id) on public.ai_runs to authenticated;
  end if;
end
$airuns$;


-- ═════════════════════════════════════════════════════════════════════════════
-- C. Firm invitations by link + leaving the firm
-- ═════════════════════════════════════════════════════════════════════════════
-- The 20260603_phase1_004 table, re-declared only where it is missing (a fresh
-- database); the token default does not need pgcrypto.
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  entity_type text not null
    check (entity_type in ('firm', 'business', 'government', 'ngo')),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text,
  invitee_phone text,
  role text not null,
  department text,
  seat_type text not null default 'member'
    check (seat_type in ('assistant', 'member', 'professional')),
  scope text not null default 'entity'
    check (scope in ('personal', 'entity', 'department', 'case')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  token text not null unique
    default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.team_invitations enable row level security;
create index if not exists idx_team_invitations_entity on public.team_invitations (entity_id, entity_type);

-- Reads stay as they were (the inviter's own rows); every write goes through
-- the functions below.
revoke insert, update, delete, truncate on public.team_invitations from public;
do $ti$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke insert, update, delete, truncate on public.team_invitations from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke insert, update, delete, truncate on public.team_invitations from authenticated;
    grant select on public.team_invitations to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.team_invitations to service_role;
  end if;
end
$ti$;

-- owner or active managing partner of the firm
create or replace function public.is_firm_manager(p_firm uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_firm is not null and p_user is not null and (
    exists (select 1 from public.firm_profiles fp where fp.id = p_firm and fp.owner_user_id = p_user)
    or exists (select 1 from public.firm_members m
                where m.firm_id = p_firm and m.user_id = p_user
                  and m.status = 'active' and m.role = 'managing_partner'));
$$;

comment on function public.is_firm_manager(uuid, uuid) is
  'F7 (20261125_40): p_user owns firm p_firm or is its active managing partner.';

-- The owner also sees the invitations a managing partner sent (and vice versa).
drop policy if exists "firm managers read their firm invitations" on public.team_invitations;
create policy "firm managers read their firm invitations" on public.team_invitations
  for select
  using (entity_type = 'firm' and public.is_firm_manager(entity_id, auth.uid()));

create or replace function public.create_firm_team_invitation(p_firm uuid, p_email text, p_role text)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_uid is null then
    raise exception 'create_firm_team_invitation: sign in' using errcode = '42501';
  end if;
  if not public.is_firm_manager(p_firm, v_uid) then
    raise exception 'create_firm_team_invitation: only the firm owner or a managing partner may invite' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    raise exception 'create_firm_team_invitation: invalid e-mail' using errcode = '22023';
  end if;
  if p_role is null or p_role not in (
       'managing_partner','partner','senior_lawyer','lawyer','trainee',
       'legal_secretary','office_admin','finance_manager','hr_manager',
       'compliance_manager','external_of_counsel','legal_consultant','in_house_counsel') then
    raise exception 'create_firm_team_invitation: invalid role' using errcode = '22023';
  end if;

  -- one live invitation per (firm, e-mail)
  update public.team_invitations ti
     set status = 'cancelled'
   where ti.entity_id = p_firm and ti.entity_type = 'firm'
     and ti.status = 'pending' and lower(ti.invitee_email) = v_email;

  return query
    insert into public.team_invitations as ti
           (entity_id, entity_type, inviter_id, invitee_email, role, scope, token, metadata)
    values (p_firm, 'firm', v_uid, v_email, p_role, 'entity',
            replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
            jsonb_build_object('source', 'firm_invite_link'))
    returning ti.id, ti.token, ti.expires_at;
end;
$$;

comment on function public.create_firm_team_invitation(uuid, text, text) is
  'F7 (20261125_40): a firm invitation by link for an e-mail address — firm owner or active managing partner; cancels an older pending one for the same e-mail.';

create or replace function public.cancel_firm_team_invitation(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_firm uuid;
begin
  select ti.entity_id into v_firm from public.team_invitations ti
   where ti.id = p_id and ti.entity_type = 'firm';
  if not found or not public.is_firm_manager(v_firm, auth.uid()) then
    raise exception 'cancel_firm_team_invitation: no such invitation' using errcode = 'P0002';
  end if;
  update public.team_invitations set status = 'cancelled'
   where id = p_id and status = 'pending';
  return found;
end;
$$;

create or replace function public.redeem_firm_team_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_inv    public.team_invitations;
  v_email  text;
  v_type   text;
  v_member public.firm_members;
begin
  if v_uid is null then
    raise exception 'redeem_firm_team_invitation: sign in' using errcode = '42501';
  end if;
  select * into v_inv from public.team_invitations ti
   where ti.token = p_token and ti.entity_type = 'firm'
   for update;
  if not found or v_inv.status <> 'pending' then
    raise exception 'redeem_firm_team_invitation: no pending invitation' using errcode = 'P0002';
  end if;
  if v_inv.expires_at <= now() then
    update public.team_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'redeem_firm_team_invitation: expired' using errcode = 'P0003';
  end if;
  if not public.is_firm_manager(v_inv.entity_id, v_inv.inviter_id) then
    raise exception 'redeem_firm_team_invitation: the inviter no longer manages this firm' using errcode = '42501';
  end if;
  if exists (select 1 from public.firm_profiles fp where fp.id = v_inv.entity_id and fp.owner_user_id = v_uid) then
    raise exception 'redeem_firm_team_invitation: the firm owner is already a member' using errcode = '22023';
  end if;

  -- the signed-in e-mail (auth.users is authoritative; profiles.email where the
  -- auth table carries none) must be the invited one
  select coalesce(nullif(to_jsonb(u) ->> 'email', ''), p.email), p.user_type
    into v_email, v_type
    from public.profiles p
    left join auth.users u on u.id = p.id
   where p.id = v_uid;
  if v_email is null or lower(btrim(v_email)) <> lower(btrim(coalesce(v_inv.invitee_email, ''))) then
    raise exception 'redeem_firm_team_invitation: this invitation was sent to another e-mail address' using errcode = '42501';
  end if;
  if v_type is null or v_type not in ('lawyer', 'individual') then
    raise exception 'redeem_firm_team_invitation: only a lawyer or individual account can join a firm team' using errcode = '42501';
  end if;

  select * into v_member from public.firm_members m
   where m.firm_id = v_inv.entity_id and m.user_id = v_uid
   for update;
  if not found then
    insert into public.firm_members (firm_id, user_id, role, status, accepted_at)
    values (v_inv.entity_id, v_uid, v_inv.role, 'invited', null)
    returning * into v_member;
  elsif v_member.status in ('removed', 'suspended') then
    update public.firm_members
       set role = v_inv.role, status = 'invited', accepted_at = null
     where id = v_member.id
    returning * into v_member;
  end if;
  -- 'invited' or 'active' rows are left as they are

  update public.team_invitations
     set status = 'accepted', accepted_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('redeemed_by', v_uid)
   where id = v_inv.id;
  return v_member.id;
end;
$$;

comment on function public.redeem_firm_team_invitation(text) is
  'F7 (20261125_40): the invitee (signed in with the invited e-mail) turns a pending firm invitation link into a firm_members row at ''invited''; accepting is the existing /api/v1/me/invitations/firm/{id}/accept.';

create or replace function public.leave_firm(p_firm uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'leave_firm: sign in' using errcode = '42501';
  end if;
  if exists (select 1 from public.firm_profiles fp where fp.id = p_firm and fp.owner_user_id = v_uid) then
    raise exception 'leave_firm: the firm owner cannot leave his own firm' using errcode = '42501';
  end if;
  update public.firm_members
     set status = 'removed'
   where firm_id = p_firm and user_id = v_uid and status = 'active';
  if not found then
    raise exception 'leave_firm: no active membership in this firm' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

comment on function public.leave_firm(uuid) is
  'F7 (20261125_40): «مغادرة المكتب» — the caller''s own active membership becomes removed; trg_firm_members_removed_transfer (20261026_70) moves his firm rows to the firm owner.';


-- ═════════════════════════════════════════════════════════════════════════════
-- D. Firm points counter (Q468–Q470)
-- ═════════════════════════════════════════════════════════════════════════════
do $points$
begin
  if to_regclass('public.points_ledger') is null then
    raise notice '20261125_40: public.points_ledger does not exist here — the points counter functions are skipped';
    return;
  end if;

  -- Same signature, columns and sums as 20261108_30; only the caller rule
  -- gains an active finance_manager (Q469).
  execute $fn$
create or replace function public.firm_member_points_usage(p_firm uuid)
returns table (
  user_id      uuid,
  display_name text,
  role         text,
  is_owner     boolean,
  joined_at    timestamptz,
  points_month bigint,
  points_total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $body$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_month timestamptz := (date_trunc('month', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh';
begin
  if v_uid is null or p_firm is null then
    raise exception 'firm_member_points_usage: sign in' using errcode = '42501';
  end if;

  select fp.owner_user_id into v_owner from public.firm_profiles fp where fp.id = p_firm;
  if v_owner is null then
    raise exception 'firm_member_points_usage: not the firm owner, managing partner or finance manager' using errcode = '42501';
  end if;

  if v_owner <> v_uid and not exists (
    select 1 from public.firm_members m
     where m.firm_id = p_firm and m.user_id = v_uid
       and m.status = 'active' and m.role in ('managing_partner', 'finance_manager')) then
    raise exception 'firm_member_points_usage: not the firm owner, managing partner or finance manager' using errcode = '42501';
  end if;

  return query
    select m.user_id,
           nullif(btrim(p.display_name), ''),
           m.role,
           m.user_id = v_owner,
           coalesce(m.accepted_at, m.created_at),
           coalesce(sum(-l.delta) filter (where l.created_at >= v_month), 0)::bigint,
           coalesce(sum(-l.delta), 0)::bigint
      from public.firm_members m
      left join public.profiles p on p.id = m.user_id
      left join public.points_ledger l
             on l.user_id = m.user_id
            and l.reason in ('usage', 'usage_refund')
            and l.created_at >= coalesce(m.accepted_at, m.created_at)
     where m.firm_id = p_firm
       and m.status = 'active'
     group by m.user_id, p.display_name, m.role, m.accepted_at, m.created_at
     order by (m.user_id = v_owner) desc, coalesce(m.accepted_at, m.created_at), m.user_id;
end;
$body$
$fn$;

  execute $c$ comment on function public.firm_member_points_usage(uuid) is
  'Owner ٤٤٤ + Q469: per active member of a firm, points consumed (ledger usage net of usage_refund, since the member joined) this Riyadh month and in total. Caller must be the firm owner or an active managing_partner / finance_manager (42501 otherwise). Totals only (20261108_30, caller rule 20261125_40).' $c$;
  execute 'revoke all on function public.firm_member_points_usage(uuid) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.firm_member_points_usage(uuid) from anon';
  end if;
end
$points$;

create or replace function public.firm_points_overview(p_firm uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_month   timestamptz := (date_trunc('month', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh';
  v_balance bigint;
  v_works   jsonb;
begin
  if v_uid is null or p_firm is null then
    raise exception 'firm_points_overview: sign in' using errcode = '42501';
  end if;
  select fp.owner_user_id into v_owner from public.firm_profiles fp where fp.id = p_firm;
  if v_owner is null or (v_owner <> v_uid and not exists (
       select 1 from public.firm_members m
        where m.firm_id = p_firm and m.user_id = v_uid
          and m.status = 'active' and m.role in ('managing_partner', 'finance_manager'))) then
    raise exception 'firm_points_overview: not the firm owner, managing partner or finance manager' using errcode = '42501';
  end if;

  if to_regclass('public.points_lots') is not null then
    execute 'select coalesce(sum(l.points_left), 0)::bigint from public.points_lots l where l.user_id = $1 and l.expires_at > now()'
      into v_balance using v_owner;
  end if;

  if to_regclass('public.membership_credit_uses') is not null and to_regclass('public.ai_runs') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', x.user_id, 'works_month', x.works_month, 'works_total', x.works_total)
               order by x.user_id), '[]'::jsonb)
        from (
          select m.user_id,
                 count(u.id) filter (where u.used_at >= $2)::bigint as works_month,
                 count(u.id)::bigint as works_total
            from public.firm_members m
            left join public.ai_runs r on r.user_id = m.user_id
            left join public.membership_credit_uses u
                   on u.run_id = r.id
                  and u.restored_at is null
                  and u.used_at >= coalesce(m.accepted_at, m.created_at)
           where m.firm_id = $1 and m.status = 'active'
           group by m.user_id
        ) x
    $q$ into v_works using p_firm, v_month;
  end if;

  return jsonb_build_object('owner_balance', v_balance, 'founder_works', v_works);
end;
$$;

comment on function public.firm_points_overview(uuid) is
  'Q468–Q470 (20261125_40): the firm account''s unexpired points (owner_balance) and, per active member, AI runs paid with a founder membership credit since joining (founder_works). null = that part is not installed here. Same caller rule as firm_member_points_usage.';


-- ── Function privileges ──────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.case_visible(text)',
    'public.can_restrict_case(text)',
    'public.set_case_restricted(text, boolean)',
    'public.is_firm_manager(uuid, uuid)',
    'public.create_firm_team_invitation(uuid, text, text)',
    'public.cancel_firm_team_invitation(uuid)',
    'public.redeem_firm_team_invitation(text)',
    'public.leave_firm(uuid)',
    'public.firm_points_overview(uuid)'
  ] loop
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
end
$grants$;


-- ── Verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  missing text := '';
  f text;
  t text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'service_requests' and column_name = 'is_restricted') then
    missing := missing || ' service_requests.is_restricted;';
  end if;
  if not exists (select 1 from pg_catalog.pg_policy
                  where polrelid = 'public.service_requests'::regclass
                    and polname = 'restricted case: case team only' and not polpermissive) then
    missing := missing || ' the restrictive policy on service_requests;';
  end if;
  foreach t in array array['case_stages', 'hearings', 'tasks', 'case_notes', 'case_team_members'] loop
    if to_regclass('public.' || t) is not null then
      if not exists (
           select 1 from pg_catalog.pg_policy
            where polrelid = to_regclass('public.' || t)
              and polname = 'restricted case rows: case team only' and not polpermissive) then
        missing := missing || pg_catalog.format(' the restrictive policy on %s;', t);
      end if;
    end if;
  end loop;
  foreach f in array array[
    'public.case_visible(text)', 'public.set_case_restricted(text, boolean)',
    'public.create_firm_team_invitation(uuid, text, text)', 'public.redeem_firm_team_invitation(text)',
    'public.cancel_firm_team_invitation(uuid)', 'public.leave_firm(uuid)', 'public.firm_points_overview(uuid)'
  ] loop
    if to_regprocedure(f) is null then
      missing := missing || pg_catalog.format(' %s is missing;', f);
    elsif not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
      missing := missing || pg_catalog.format(' %s is not SECURITY DEFINER with an empty search_path;', f);
    elsif exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' anon can EXECUTE %s;', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.team_invitations', 'INSERT')
          or has_table_privilege('authenticated', 'public.team_invitations', 'UPDATE')) then
    missing := missing || ' authenticated can still write team_invitations;';
  end if;
  if to_regclass('public.ai_runs') is not null and not exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'ai_runs' and column_name = 'case_request_id') then
    missing := missing || ' ai_runs.case_request_id;';
  end if;

  if missing <> '' then
    raise exception '20261125_40 verify:%', missing;
  end if;
  raise notice '20261125_40 verify: OK — restricted cases (column, case_visible, restrictive policies, set_case_restricted), ai_runs.case_request_id, firm invitation link + leave_firm, firm points overview';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261125_40 restricted cases + AI→case link + firm invitations/leave + firm points overview' as step,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'service_requests' and column_name = 'is_restricted')
       and to_regprocedure('public.case_visible(text)') is not null
       and to_regprocedure('public.set_case_restricted(text, boolean)') is not null
       and to_regprocedure('public.redeem_firm_team_invitation(text)') is not null
       and to_regprocedure('public.leave_firm(uuid)') is not null
       and to_regprocedure('public.firm_points_overview(uuid)') is not null
       as ok;
