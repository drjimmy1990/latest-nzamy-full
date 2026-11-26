-- =============================================================================
-- Migration: 20261206_12_restricted_case_break_glass.sql   (verify id: l16_breakglass)
-- =============================================================================
-- PURPOSE (batch l16, builder «secdb» — owner decision س٢١٦, gaps C53 / E-65)
--
--   «لا يرى [حساب الإدارة] المحتوى افتراضياً (البيانات الوصفية فقط) صيانةً لسر
--   المهنة؛ والوصول الطارئ Break-glass لا يتم إلا بموافقتين وسبب مكتوب ومدة
--   قصيرة وسجل تدقيق مع إشعار المكتب.»
--   Until now a platform admin passed public.case_visible() (its `or
--   public.is_admin()` arm, 20261125_40 / 20261129_10), so an admin session
--   calling PostgREST directly could read a RESTRICTED firm case's child rows
--   (hearings, tasks, notes, deadlines, ledger, …) through their admin read arms.
--
-- WHAT IT DOES
--   1. public.case_visible(text) is re-created from its LATEST definition
--      (20261129_10, same dynamic hearing/task-assignee arms) with exactly one
--      change: `or public.is_admin()` → `or public.restricted_case_grant_
--      active(sr.id)`. No permissive or restrictive POLICY is replaced: every
--      "restricted case…" / "firm case…" RESTRICTIVE policy already ANDs
--      case_visible() over the tables' permissive arms (including their
--      `or public.is_admin()` arms), so an admin without a live grant now reads
--      no row of a restricted case; owner / firm access is untouched (the
--      filer, lead, case team, firm owner, managing partner and the
--      trainee/secretary branch are the same text). Unrestricted cases are
--      untouched for admins too (the function only hides restricted cases and
--      the scoped members' unassigned ones).
--   2. public.restricted_case_access_grants — the break-glass record. One row
--      per request: case, firm, the requesting super admin (the grantee), a
--      written reason (20–1000 chars), a duration (15–240 minutes, default
--      60), the SECOND super admin who approved it (must differ — a CHECK and
--      the function), approval time, expiry (approval + duration), rejection /
--      revocation, the moment the firm was notified. RLS on, no policy, no
--      session privilege (service_role SELECT for the admin screen; the
--      definer functions write as the table owner). Rows are
--      never deleted; the request columns never change and a decision, once
--      taken, never changes (trigger).
--   3. Session RPCs (SECURITY DEFINER, search_path '', authenticated):
--        restricted_case_access_request(p_request, p_reason, p_minutes) → uuid
--        restricted_case_access_approve(p_grant, p_note) → timestamptz (expiry)
--        restricted_case_access_reject(p_grant, p_note) → boolean
--        restricted_case_access_revoke(p_grant) → boolean
--      Each needs public.is_admin() (which carries the admin 2FA / aal2 rule
--      of 20261127_50) AND public.is_super_admin(). A pending request expires
--      unapproved after 24 hours. Approval writes a notification to the firm
--      owner and every active managing partner IN THE SAME TRANSACTION — if
--      it cannot be written, the approval fails (the notice is the owner's
--      required control). Every step writes an admin_audit_events row.
--   4. public.restricted_case_grant_active(p_request) → boolean (internal, no
--      session EXECUTE): the caller is still an admin + super admin and holds
--      an approved, unrevoked, unexpired grant for this case. Read by
--      case_visible() at query time, so expiry needs no job.
--   5. public.restricted_case_break_glass_read(p_request) → jsonb, session RPC:
--      with a live grant, the case summary (id, title, description, status,
--      type, created_at) and its live documents list (name, type, size, date
--      — no storage path, no download), and the open is written to
--      restricted_case_open_log (20261202_80) when that table is here; 42501
--      without a grant. The case's other tables are then readable through the
--      admin's own session (their admin read arms + case_visible) until expiry.
--   Admins keep METADATA without a grant through the service-role admin API
--   (GET /api/v1/admin/restricted-cases: id, firm, status, type, dates — no
--   title, no description, no metadata).
--
-- HOW TO RUN (BEFORE the deploy is fine: no deployed code reads restricted case
--   content with an admin session; the new admin routes answer «قيد التفعيل»
--   until it runs):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_12_restricted_case_break_glass.sql
--   Expect: NOTICE  l16_breakglass verify: OK …  and a row with `t`.
--   OPERATOR: two approvals need TWO super_admin rows in public.platform_staff
--   (gap C54) — with one, every request stays pending.
--
-- RUN ORDER: after 20261129_10 (case_visible's latest text), 20261019_30
--   (is_super_admin), 20261127_50 (is_admin with aal2). Idempotent.
--   RE-RUN HAZARD: re-running 20261125_40 or 20261129_10 puts `is_admin()`
--   back into case_visible — re-run THIS file after either; _verify.sql
--   (verify:l16_breakglass) fails until then.
--
-- Docker: supabase/tests/rls/restricted_case_break_glass.test.sql
--
-- ROLLBACK (manual): re-run 20261129_10_firm_company_roles_seats.sql (the old
--   case_visible, admins read restricted cases again); then
--   drop function if exists public.restricted_case_break_glass_read(text),
--     public.restricted_case_access_revoke(uuid), public.restricted_case_access_reject(uuid, text),
--     public.restricted_case_access_approve(uuid, text), public.restricted_case_access_request(text, text, integer),
--     public.restricted_case_grant_active(text), public.restricted_case_access_grants_guard();
--   keep public.restricted_case_access_grants (it is the audit record).
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.case_visible(text)') is null
     or to_regprocedure('public.firm_case_scoped_member(uuid)') is null then
    raise exception '20261206_12: run 20261125_40 and 20261129_10 first (case_visible, firm_case_scoped_member)';
  end if;
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception '20261206_12: public.is_super_admin() is missing — run 20261019_30_platform_staff_roles.sql first';
  end if;
  if to_regclass('public.notifications') is null or to_regclass('public.admin_audit_events') is null then
    raise exception '20261206_12: public.notifications / public.admin_audit_events missing';
  end if;
end
$pre$;

-- ── 2. the grant table ───────────────────────────────────────────────────────
create table if not exists public.restricted_case_access_grants (
  id               uuid primary key default gen_random_uuid(),
  request_id       text not null,
  firm_id          uuid,
  requested_by     uuid not null,
  reason           text not null
                     constraint restricted_case_access_grants_reason_len
                     check (char_length(btrim(reason)) between 20 and 1000),
  duration_minutes integer not null default 60
                     constraint restricted_case_access_grants_duration
                     check (duration_minutes between 15 and 240),
  requested_at     timestamptz not null default now(),
  approved_by      uuid,
  approved_at      timestamptz,
  expires_at       timestamptz,
  rejected_by      uuid,
  rejected_at      timestamptz,
  revoked_by       uuid,
  revoked_at       timestamptz,
  decision_note    text,
  firm_notified_at timestamptz,
  constraint restricted_case_access_grants_two_people
    check (approved_by is null or approved_by <> requested_by),
  constraint restricted_case_access_grants_approval_shape
    check ((approved_at is null) = (approved_by is null)
           and (approved_at is null or expires_at is not null))
);

comment on table public.restricted_case_access_grants is
  'س٢١٦ (20261206_12): break-glass access of a platform super admin to ONE restricted firm case — written reason, a second super admin''s approval, ≤240 minutes from approval, firm notified on approval. No FK: the record outlives the case. Written only by the restricted_case_access_* functions; never deleted.';

create index if not exists restricted_case_access_grants_live_idx
  on public.restricted_case_access_grants (request_id, requested_by, expires_at)
  where approved_at is not null and revoked_at is null;

alter table public.restricted_case_access_grants enable row level security;
revoke all on table public.restricted_case_access_grants from public;
do $g$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.restricted_case_access_grants from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.restricted_case_access_grants from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on table public.restricted_case_access_grants from service_role;
    grant select on table public.restricted_case_access_grants to service_role;
  end if;
end
$g$;
-- request columns are fixed; a decision is taken once; nothing is deleted
create or replace function public.restricted_case_access_grants_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'restricted_case_access_grants: rows are never deleted' using errcode = '42501';
  end if;
  if new.id is distinct from old.id or new.request_id is distinct from old.request_id
     or new.firm_id is distinct from old.firm_id or new.requested_by is distinct from old.requested_by
     or new.reason is distinct from old.reason or new.duration_minutes is distinct from old.duration_minutes
     or new.requested_at is distinct from old.requested_at then
    raise exception 'restricted_case_access_grants: the request itself cannot change' using errcode = '42501';
  end if;
  if (old.approved_at is not null and (new.approved_at is distinct from old.approved_at
                                        or new.approved_by is distinct from old.approved_by
                                        or new.expires_at is distinct from old.expires_at))
     or (old.rejected_at is not null and (new.rejected_at is distinct from old.rejected_at
                                          or new.rejected_by is distinct from old.rejected_by))
     or (old.revoked_at is not null and (new.revoked_at is distinct from old.revoked_at
                                         or new.revoked_by is distinct from old.revoked_by))
     or (old.firm_notified_at is not null and new.firm_notified_at is distinct from old.firm_notified_at) then
    raise exception 'restricted_case_access_grants: a decision cannot be changed' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists trg_restricted_case_access_grants_guard on public.restricted_case_access_grants;
create trigger trg_restricted_case_access_grants_guard
  before update or delete on public.restricted_case_access_grants
  for each row execute function public.restricted_case_access_grants_guard();

-- ── 4. is there a live grant for the caller ──────────────────────────────────
create or replace function public.restricted_case_grant_active(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and p_request is not null
     and public.is_admin()
     and public.is_super_admin()
     and exists (select 1 from public.restricted_case_access_grants g
                  where g.request_id = p_request
                    and g.requested_by = auth.uid()
                    and g.approved_at is not null
                    and g.revoked_at is null
                    and g.expires_at > pg_catalog.now());
$$;

comment on function public.restricted_case_grant_active(text) is
  'س٢١٦ (20261206_12): the caller (still an admin, aal2 when enrolled, and a super admin) holds an approved, unrevoked, unexpired break-glass grant for this case. Internal — read by case_visible(); no session EXECUTE.';

-- ── 1. case_visible: is_admin() → restricted_case_grant_active(sr.id) ───────
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
    raise notice '20261206_12: hearings.assignee_user_id is not here — a hearing assignee is not a case arm';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tasks' and column_name = 'assignee_user_id')
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tasks' and column_name = 'case_request_id') then
    v_assignee := v_assignee || '
              or exists (select 1 from public.tasks tk
                          where tk.case_request_id = sr.id and tk.assignee_user_id = auth.uid())';
  else
    raise notice '20261206_12: tasks.assignee_user_id is not here — a task assignee is not a case arm';
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
          or public.restricted_case_grant_active(sr.id)
          or (not sr.is_restricted and (false' || v_assignee || '))
       ), false)
  );
$fn$';
end
$cv$;

comment on function public.case_visible(text) is
  'N01-19 (20261125_40) + owner file 15 row 2 (20261129_10) + س٢١٦ (20261206_12): false for a firm case that is restricted, or whose firm the caller belongs to only as a trainee / legal secretary, unless the caller is its filer, lead, active case-team member, the firm owner, an active managing partner, a super admin with a live break-glass grant for it (restricted_case_grant_active), or — for an unrestricted case — the assignee of one of its hearings or tasks. A platform admin without a grant no longer passes. Used by every "restricted case…" and "firm case…" RESTRICTIVE policy.';

-- ── 3. the session RPCs ──────────────────────────────────────────────────────
-- helper: the caller is an admin (aal2 when enrolled) and a super admin
create or replace function public.restricted_case_require_super_admin(p_what text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '%: sign in', p_what using errcode = '42501';
  end if;
  if not (public.is_admin() and public.is_super_admin()) then
    raise exception '%: only a platform super admin (signed in with two-factor when enrolled) may do this', p_what using errcode = '42501';
  end if;
  return v_uid;
end
$$;

create or replace function public.restricted_case_access_request(p_request text, p_reason text, p_minutes integer default 60)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public.restricted_case_require_super_admin('restricted_case_access_request');
  v_case    record;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_minutes integer := coalesce(p_minutes, 60);
  v_id      uuid;
begin
  select sr.id, sr.firm_id, sr.is_restricted into v_case
    from public.service_requests sr where sr.id = p_request;
  if not found then
    raise exception 'restricted_case_access_request: no such case' using errcode = 'P0002';
  end if;
  if v_case.firm_id is null or not coalesce(v_case.is_restricted, false) then
    raise exception 'restricted_case_access_request: the case is not a restricted firm case' using errcode = '22023';
  end if;
  if char_length(v_reason) < 20 or char_length(v_reason) > 1000 then
    raise exception 'restricted_case_access_request: a written reason of 20 to 1000 characters is required' using errcode = '22023';
  end if;
  if v_minutes < 15 or v_minutes > 240 then
    raise exception 'restricted_case_access_request: the duration must be 15 to 240 minutes' using errcode = '22023';
  end if;

  -- a request left unapproved for 24 hours lapses
  update public.restricted_case_access_grants g
     set revoked_at = pg_catalog.now(), decision_note = coalesce(g.decision_note, 'lapsed: not approved within 24 hours')
   where g.request_id = p_request and g.requested_by = v_uid
     and g.approved_at is null and g.rejected_at is null and g.revoked_at is null
     and g.requested_at <= pg_catalog.now() - interval '24 hours';

  -- one open request / live grant per (case, admin)
  select g.id into v_id
    from public.restricted_case_access_grants g
   where g.request_id = p_request and g.requested_by = v_uid
     and g.rejected_at is null and g.revoked_at is null
     and (g.approved_at is null or g.expires_at > pg_catalog.now())
   order by g.requested_at desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.restricted_case_access_grants (request_id, firm_id, requested_by, reason, duration_minutes)
  values (p_request, v_case.firm_id, v_uid, v_reason, v_minutes)
  returning id into v_id;

  insert into public.admin_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_uid, 'admin', 'restricted_case_access_requested', 'service_request', p_request,
          pg_catalog.jsonb_build_object('grant_id', v_id, 'firm_id', v_case.firm_id,
                                        'reason', v_reason, 'duration_minutes', v_minutes));
  return v_id;
end
$$;

create or replace function public.restricted_case_access_approve(p_grant uuid, p_note text default null)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public.restricted_case_require_super_admin('restricted_case_access_approve');
  v_g       public.restricted_case_access_grants;
  v_expires timestamptz;
  v_title   text;
  v_n       integer;
begin
  select * into v_g from public.restricted_case_access_grants g where g.id = p_grant for update;
  if not found then
    raise exception 'restricted_case_access_approve: no such request' using errcode = 'P0002';
  end if;
  if v_g.approved_at is not null or v_g.rejected_at is not null or v_g.revoked_at is not null then
    raise exception 'restricted_case_access_approve: the request was already decided' using errcode = '22023';
  end if;
  if v_g.requested_at <= pg_catalog.now() - interval '24 hours' then
    raise exception 'restricted_case_access_approve: the request lapsed (not approved within 24 hours)' using errcode = '22023';
  end if;
  if v_g.requested_by = v_uid then
    raise exception 'restricted_case_access_approve: the second approval must come from another super admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_staff ps join public.profiles p on p.id = ps.user_id
                  where ps.user_id = v_g.requested_by and ps.staff_role = 'super_admin' and p.user_type = 'admin') then
    raise exception 'restricted_case_access_approve: the requester is no longer a super admin' using errcode = '22023';
  end if;
  if not exists (select 1 from public.service_requests sr
                  where sr.id = v_g.request_id and sr.is_restricted and sr.firm_id is not null) then
    raise exception 'restricted_case_access_approve: the case is no longer a restricted firm case' using errcode = '22023';
  end if;

  v_expires := pg_catalog.now() + pg_catalog.make_interval(mins => v_g.duration_minutes);

  -- The firm is told FIRST and in this transaction: no notice, no access.
  select coalesce(nullif(btrim(sr.title), ''), 'بلا عنوان') into v_title
    from public.service_requests sr where sr.id = v_g.request_id;
  insert into public.notifications (user_id, title, body)
  select x.user_id,
         'وصول طارئ من إدارة المنصة إلى قضية مقيّدة',
         pg_catalog.format('وافق مسؤولان في إدارة نظامي على وصول طارئ إلى القضية المقيّدة «%s» لمدة %s دقيقة تنتهي %s (بتوقيت الرياض)، للسبب المكتوب الآتي: %s',
                           v_title, v_g.duration_minutes,
                           pg_catalog.to_char(v_expires at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
                           v_g.reason)
    from (select fp.owner_user_id as user_id from public.firm_profiles fp where fp.id = v_g.firm_id
          union
          select m.user_id from public.firm_members m
           where m.firm_id = v_g.firm_id and m.status = 'active' and m.role = 'managing_partner') x
   where x.user_id is not null;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'restricted_case_access_approve: the firm has nobody to notify — access refused' using errcode = '22023';
  end if;

  update public.restricted_case_access_grants
     set approved_by = v_uid, approved_at = pg_catalog.now(), expires_at = v_expires,
         decision_note = nullif(btrim(coalesce(p_note, '')), ''),
         firm_notified_at = pg_catalog.now()
   where id = p_grant;

  insert into public.admin_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_uid, 'admin', 'restricted_case_access_approved', 'service_request', v_g.request_id,
          pg_catalog.jsonb_build_object('grant_id', p_grant, 'firm_id', v_g.firm_id, 'grantee', v_g.requested_by,
                                        'expires_at', v_expires, 'firm_notified', v_n,
                                        'note', nullif(btrim(coalesce(p_note, '')), '')));
  return v_expires;
end
$$;

create or replace function public.restricted_case_access_reject(p_grant uuid, p_note text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.restricted_case_require_super_admin('restricted_case_access_reject');
  v_g   public.restricted_case_access_grants;
begin
  select * into v_g from public.restricted_case_access_grants g where g.id = p_grant for update;
  if not found then
    raise exception 'restricted_case_access_reject: no such request' using errcode = 'P0002';
  end if;
  if v_g.approved_at is not null or v_g.rejected_at is not null or v_g.revoked_at is not null then
    raise exception 'restricted_case_access_reject: the request was already decided' using errcode = '22023';
  end if;
  update public.restricted_case_access_grants
     set rejected_by = v_uid, rejected_at = pg_catalog.now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_grant;
  insert into public.admin_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_uid, 'admin', 'restricted_case_access_rejected', 'service_request', v_g.request_id,
          pg_catalog.jsonb_build_object('grant_id', p_grant, 'grantee', v_g.requested_by,
                                        'withdrawn', v_g.requested_by = v_uid,
                                        'note', nullif(btrim(coalesce(p_note, '')), '')));
  return true;
end
$$;

create or replace function public.restricted_case_access_revoke(p_grant uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.restricted_case_require_super_admin('restricted_case_access_revoke');
  v_g   public.restricted_case_access_grants;
begin
  select * into v_g from public.restricted_case_access_grants g where g.id = p_grant for update;
  if not found then
    raise exception 'restricted_case_access_revoke: no such grant' using errcode = 'P0002';
  end if;
  if v_g.approved_at is null or v_g.revoked_at is not null or v_g.expires_at <= pg_catalog.now() then
    raise exception 'restricted_case_access_revoke: the grant is not live' using errcode = '22023';
  end if;
  update public.restricted_case_access_grants
     set revoked_by = v_uid, revoked_at = pg_catalog.now()
   where id = p_grant;
  insert into public.admin_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_uid, 'admin', 'restricted_case_access_revoked', 'service_request', v_g.request_id,
          pg_catalog.jsonb_build_object('grant_id', p_grant, 'grantee', v_g.requested_by));
  return true;
end
$$;

-- ── 5. the break-glass read ──────────────────────────────────────────────────
create or replace function public.restricted_case_break_glass_read(p_request text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public.restricted_case_require_super_admin('restricted_case_break_glass_read');
  v_case jsonb;
  v_docs jsonb;
begin
  if not public.restricted_case_grant_active(p_request) then
    raise exception 'restricted_case_break_glass_read: no live break-glass grant for this case' using errcode = '42501';
  end if;
  select pg_catalog.jsonb_build_object(
           'id', sr.id, 'title', sr.title, 'description', sr.description, 'status', sr.status,
           'type', sr.type, 'created_at', sr.created_at, 'firm_id', sr.firm_id)
    into v_case
    from public.service_requests sr where sr.id = p_request;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', a.id, 'file_name', a.file_name, 'mime_type', a.mime_type,
           'size_bytes', a.size_bytes, 'created_at', a.created_at) order by a.created_at), '[]'::jsonb)
    into v_docs
    from public.attachments a
   where a.request_id = p_request
     and (pg_catalog.to_jsonb(a) ->> 'deleted_at') is null;
  if to_regprocedure('public.log_restricted_case_open(text)') is not null then
    perform public.log_restricted_case_open(p_request);
  end if;
  insert into public.admin_audit_events (actor_id, actor_type, action, target_type, target_id, metadata)
  values (v_uid, 'admin', 'restricted_case_break_glass_read', 'service_request', p_request, '{}'::jsonb);
  return pg_catalog.jsonb_build_object('case', v_case, 'documents', v_docs);
end
$$;

comment on function public.restricted_case_break_glass_read(text) is
  'س٢١٦ (20261206_12): with a live break-glass grant, the case summary and its live documents list (no storage path); logged in restricted_case_open_log (when installed) and admin_audit_events. 42501 without a grant.';

-- ── grants ───────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.restricted_case_access_request(text, text, integer)',
    'public.restricted_case_access_approve(uuid, text)',
    'public.restricted_case_access_reject(uuid, text)',
    'public.restricted_case_access_revoke(uuid)',
    'public.restricted_case_break_glass_read(text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('grant execute on function %s to authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('revoke all on function %s from service_role', f);
    end if;
  end loop;
  foreach f in array array[
    'public.restricted_case_grant_active(text)',
    'public.restricted_case_require_super_admin(text)',
    'public.restricted_case_access_grants_guard()'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', f);
    end if;
  end loop;
  -- case_visible keeps its grants (20261125_40): authenticated + service_role, never anon
  execute 'revoke all on function public.case_visible(text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.case_visible(text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.case_visible(text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.case_visible(text) to service_role';
  end if;
end
$grants$;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  def     text := coalesce(pg_catalog.pg_get_functiondef('public.case_visible(text)'::regprocedure), '');
  f       text;
begin
  if pg_catalog.strpos(def, 'is_admin()') > 0 then
    missing := missing || ' case_visible still lets every admin through;';
  end if;
  if pg_catalog.strpos(def, 'restricted_case_grant_active(sr.id)') = 0
     or pg_catalog.strpos(def, 'firm_case_scoped_member') = 0 then
    missing := missing || ' case_visible lacks the grant arm or the scoped-member branch;';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.case_visible(text)', 'EXECUTE') then
    missing := missing || ' anon can EXECUTE case_visible;';
  end if;
  foreach f in array array[
    'public.restricted_case_grant_active(text)', 'public.restricted_case_access_request(text, text, integer)',
    'public.restricted_case_access_approve(uuid, text)', 'public.restricted_case_access_reject(uuid, text)',
    'public.restricted_case_access_revoke(uuid)', 'public.restricted_case_break_glass_read(text)',
    'public.case_visible(text)'
  ] loop
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
                      where p.oid = to_regprocedure(f)), false) then
      missing := missing || pg_catalog.format(' %s is missing or not SECURITY DEFINER with an empty search_path;', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.restricted_case_grant_active(text)', 'EXECUTE')
          or has_table_privilege('authenticated', 'public.restricted_case_access_grants', 'SELECT')
          or has_table_privilege('authenticated', 'public.restricted_case_access_grants', 'INSERT')
          or has_table_privilege('authenticated', 'public.restricted_case_access_grants', 'UPDATE')) then
    missing := missing || ' sessions can read/write the grant table or call the internal grant check;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.restricted_case_access_grants'::regclass
                    and tgname = 'trg_restricted_case_access_grants_guard' and not tgisinternal) then
    missing := missing || ' the grant table guard trigger is missing;';
  end if;
  if missing <> '' then
    raise exception 'l16_breakglass verify:%', missing;
  end if;
  raise notice 'l16_breakglass verify: OK — admins no longer read restricted firm cases; break-glass = written reason + second super admin + ≤240 min + firm notified + audit';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261206_12 l16 س٢١٦: restricted cases — admin metadata only; break-glass with two super admins' as migration,
       pg_catalog.strpos(coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.case_visible(text)')), 'is_admin()'), 'is_admin()') = 0
       and to_regclass('public.restricted_case_access_grants') is not null as ok;
