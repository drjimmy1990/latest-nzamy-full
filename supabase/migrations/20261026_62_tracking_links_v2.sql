-- =============================================================================
-- Migration: 20261026_62_tracking_links_v2.sql
-- Plan: docs/plans/2026-10-25-owner-answers-10-25-phases-plan.md, phase D2.
-- Owner decision ٢٧٦: the lawyer picks the link's lifetime (7 / 30 / 90 days /
-- «حتى انتهاء المرحلة»); on expiry or by hand the link is PAUSED, not deleted,
-- and one click re-activates the SAME link; revoking stays. The client opens
-- it with the last 4 digits of the mobile number on the case file.
-- Builds on 20261025_32_case_tracking_links.sql (apply that first).
-- =============================================================================
--
-- WHAT CHANGES
--   1. public.case_tracking_links gains
--        lifetime        '7d' | '30d' | '90d' | 'stage', NOT NULL DEFAULT '30d'
--                        (rows made before this file get '30d' from now: no
--                        link lives forever any more);
--        expires_at      the end of a day-lifetime; NULL exactly when 'stage';
--        stage_id        the stage a 'stage' link lives through;
--        paused_at, paused_reason ('manual' | 'expired') — both or neither;
--        failed_attempts, locked_until — the per-link digits limiter.
--      A BEFORE INSERT trigger computes expires_at / stage_id from lifetime and
--      forces a new link live and unlocked, whoever inserts. Sessions INSERT
--      `lifetime` (added to the column grant) and SELECT the new state
--      columns — never failed_attempts, never stage_id writes.
--
--   2. The state, computed — public.tracking_link_effective_state(…) (pure)
--      and public.tracking_link_state(link id):
--        revoked > paused ('manual') > expired (paused 'expired', past
--        expires_at, or its stage ended) > active.
--      A 'stage' link's stage has ended when the pinned stage is deleted,
--      closed (closed_on on or before today, Asia/Riyadh), or no longer the
--      current stage. "Current" is the snapshot's own rule: the highest
--      position among stages WRITTEN BY A CASE WORKER (case_worker_ok) — a
--      stranger can insert a stage row carrying this case id (20261025_32 T1),
--      and must not be able to pause a client's link with it.
--      src/lib/tracking/trackingLinkState.ts is the same function in TS.
--
--   3. Pause / resume — public.tracking_link_pause(link) and
--      public.tracking_link_resume(link, lifetime), SECURITY DEFINER, callable
--      by sessions, allowed to exactly those the revoke policy allows (the
--      link's maker, or anyone who may issue a link on the case —
--      can_issue_tracking_link). They touch only the state columns; token,
--      case, owner and firm never change; a revoked link is never resumed.
--      Resume sets a NEW lifetime (and so a new expiry / stage) and clears the
--      digits lock. Revoke stays the v1 column-privileged UPDATE (unchanged).
--      The UPDATE policy and grants are NOT widened.
--
--   4. The phone — public.case_client_phone_last4(case), no session or
--      service grant (only the definer functions here read it). Source, first
--      that has ≥ 4 digits:
--        a. the client card attached to the case (service_requests.
--           lawyer_client_id → lawyer_clients.phone) — what the lawyer keeps;
--        b. the requester's account phone (profiles.phone), ONLY when the
--           requester is not a case worker — on a solo case a lawyer can be
--           the requester, and his own number must not open his client's link.
--      Digits are normalised (Arabic-Indic ٠–٩ and Persian ۰–۹ → 0–9, every
--      other character dropped) by public.tracking_phone_digits. The number
--      itself is never returned by anything a session or the app can call.
--      public.case_tracking_has_phone(case) → boolean, for the lawyer's
--      warning, true only for those who may issue a link.
--
--   5. The public side (service_role only):
--        case_tracking_gate(token_hash) → 'none' | 'unavailable' | 'paused'
--          | 'expired' | 'active'. No case data, no view stamp. 'unavailable'
--          = revoked, or the maker may no longer issue it. An expiry it sees
--          is written down (paused_at, paused_reason 'expired').
--        case_tracking_unlock(token_hash, digits) → 'ok' | 'denied' |
--          'locked'. ONE locked row, one statement per outcome: 5 wrong tries
--          lock the link for 15 minutes; while locked even the right digits
--          are refused; success resets the counter. Unknown, malformed,
--          paused, expired, revoked and no-phone links all answer 'denied'.
--        case_tracking_snapshot(token_hash) — REPLACED with the same output
--          (keys, whitelist and every v1 check) plus: NULL unless the link's
--          state is 'active'. The digits check is the app's (a signed cookie
--          — src/lib/tracking/trackingUnlockCookie.ts) before it calls this.
--
-- DEPLOY ORDER: run BEFORE the new code ideally; the code also works before
-- it (v1 behaviour: no digits, no lifetime) — see the README.
-- !! Re-running 20261025_32 AFTER this file puts the v1 snapshot back (no
--    pause/expiry check). Re-run this file after it if that ever happens.
--
-- IDEMPOTENT: add column if not exists; drop constraint/trigger if exists;
-- create or replace; repeatable grants. Run twice in Docker by
-- supabase/tests/rls/tracking_links_v2.test.sql.
--
-- ROLLBACK (manual): re-run 20261025_32 (restores the v1 snapshot), then drop
-- the functions below and the new columns. Links keep their tokens.
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.case_tracking_links') is null
     or to_regprocedure('public.tracking_link_maker_ok(text,uuid)') is null
     or to_regprocedure('public.case_tracking_snapshot(text)') is null then
    raise exception '20261026_62: public.case_tracking_links is missing — apply 20261025_32_case_tracking_links.sql first';
  end if;
  if to_regclass('public.lawyer_clients') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.service_requests'::regclass
                     and attname = 'lawyer_client_id' and not attisdropped) then
    raise exception '20261026_62: lawyer_clients / service_requests.lawyer_client_id are missing — apply 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
end $$;


-- ── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.case_tracking_links
  add column if not exists lifetime        text not null default '30d',
  add column if not exists expires_at      timestamptz,
  add column if not exists stage_id        uuid references public.case_stages(id) on delete set null,
  add column if not exists paused_at       timestamptz,
  add column if not exists paused_reason   text,
  add column if not exists failed_attempts int  not null default 0,
  add column if not exists locked_until    timestamptz;

-- Links made before this file: 30 days from now (re-run: nothing matches).
update public.case_tracking_links
   set expires_at = now() + interval '30 days'
 where lifetime in ('7d', '30d', '90d') and expires_at is null;

alter table public.case_tracking_links drop constraint if exists case_tracking_links_lifetime_check;
alter table public.case_tracking_links add constraint case_tracking_links_lifetime_check
  check (lifetime in ('7d', '30d', '90d', 'stage'));
alter table public.case_tracking_links drop constraint if exists case_tracking_links_expiry_shape;
alter table public.case_tracking_links add constraint case_tracking_links_expiry_shape
  check ((lifetime = 'stage') = (expires_at is null));
alter table public.case_tracking_links drop constraint if exists case_tracking_links_paused_shape;
alter table public.case_tracking_links add constraint case_tracking_links_paused_shape
  check ((paused_at is null) = (paused_reason is null)
         and (paused_reason is null or paused_reason in ('manual', 'expired')));
alter table public.case_tracking_links drop constraint if exists case_tracking_links_attempts_check;
alter table public.case_tracking_links add constraint case_tracking_links_attempts_check
  check (failed_attempts between 0 and 5);

comment on column public.case_tracking_links.lifetime is '٢٧٦: 7d | 30d | 90d | stage (حتى انتهاء المرحلة). Chosen at creation and at re-activation.';
comment on column public.case_tracking_links.paused_reason is '٢٧٦: manual (the lawyer) | expired (its lifetime ended). A paused link keeps its URL; resume re-activates it.';


-- ── 2. Helpers: digits, interval, current stage, stage end, state ───────────
create or replace function public.tracking_phone_digits(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(translate(coalesce(p_text, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
                               '[^0-9]', '', 'g'), '');
$$;

create or replace function public.tracking_lifetime_interval(p_lifetime text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_lifetime when '7d' then interval '7 days' when '30d' then interval '30 days'
                         when '90d' then interval '90 days' end;
$$;

-- The snapshot's "current stage": highest position among stages written by a
-- case worker (same order as case_tracking_snapshot).
create or replace function public.tracking_link_current_stage(p_request text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
    from public.case_stages s
   where s.case_request_id = p_request
     and public.case_worker_ok(p_request, s.owner_user_id)
   order by s.position desc, s.opened_on desc nulls last, s.created_at desc
   limit 1;
$$;

create or replace function public.tracking_link_stage_ended(p_request text, p_stage uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_stage is null
      or not exists (select 1 from public.case_stages s
                      where s.id = p_stage and s.case_request_id = p_request
                        and (s.closed_on is null or s.closed_on > (now() at time zone 'Asia/Riyadh')::date))
      or public.tracking_link_current_stage(p_request) is distinct from p_stage;
$$;

-- Pure: the same rule as trackingLinkState.ts effectiveTrackingState.
create or replace function public.tracking_link_effective_state(
  p_revoked_at timestamptz, p_paused_at timestamptz, p_paused_reason text,
  p_expires_at timestamptz, p_stage_ended boolean, p_now timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_revoked_at is not null then 'revoked'
           when p_paused_at is not null then case when p_paused_reason = 'expired' then 'expired' else 'paused' end
           when coalesce(p_stage_ended, false) then 'expired'
           when p_expires_at is not null and p_expires_at <= p_now then 'expired'
           else 'active'
         end;
$$;

create or replace function public.tracking_link_state(p_link uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.tracking_link_effective_state(
           l.revoked_at, l.paused_at, l.paused_reason, l.expires_at,
           l.lifetime = 'stage' and l.revoked_at is null and l.paused_at is null
             and public.tracking_link_stage_ended(l.case_request_id, l.stage_id),
           now())
    from public.case_tracking_links l
   where l.id = p_link;
$$;

-- The last 4 digits of the client's mobile on the case file (see header §4).
create or replace function public.case_client_phone_last4(p_request text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select right(d, 4)
    from (
      select coalesce(
               (select x.d from (select public.tracking_phone_digits(c.phone) as d
                                   from public.lawyer_clients c where c.id = sr.lawyer_client_id) x
                 where length(x.d) >= 4),
               (select x.d from (select public.tracking_phone_digits(p.phone) as d
                                   from public.profiles p
                                  where p.id = sr.requester_user_id
                                    and not public.case_worker_ok(sr.id, sr.requester_user_id)) x
                 where length(x.d) >= 4)
             ) as d
        from public.service_requests sr
       where sr.id = p_request
    ) q
   where q.d is not null;
$$;

create or replace function public.case_tracking_has_phone(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_issue_tracking_link(p_request)
     and public.case_client_phone_last4(p_request) is not null;
$$;


-- ── 3. A new link: lifetime → expiry / stage, born live and unlocked ────────
create or replace function public.case_tracking_links_born()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.lifetime        := coalesce(new.lifetime, '30d');
  new.paused_at       := null;
  new.paused_reason   := null;
  new.failed_attempts := 0;
  new.locked_until    := null;
  if new.lifetime = 'stage' then
    new.stage_id := public.tracking_link_current_stage(new.case_request_id);
    if new.stage_id is null or public.tracking_link_stage_ended(new.case_request_id, new.stage_id) then
      raise exception 'tracking_link_no_stage: the case has no open current stage for a «حتى انتهاء المرحلة» link'
        using errcode = '22023';
    end if;
    new.expires_at := null;
  else
    new.stage_id   := null;
    new.expires_at := now() + public.tracking_lifetime_interval(new.lifetime);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_case_tracking_links_born on public.case_tracking_links;
create trigger trg_case_tracking_links_born
  before insert on public.case_tracking_links
  for each row execute function public.case_tracking_links_born();


-- ── 4. Pause / resume (sessions; the revoke policy's people) ────────────────
create or replace function public.tracking_link_pause(p_link uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v record;
begin
  select l.id, l.case_request_id, l.owner_user_id, l.revoked_at, l.paused_at
    into v from public.case_tracking_links l where l.id = p_link for update;
  if not found or auth.uid() is null
     or not (v.owner_user_id = auth.uid() or public.can_issue_tracking_link(v.case_request_id)) then
    return 'not_found';
  end if;
  if v.revoked_at is not null then
    return 'revoked';
  end if;
  if v.paused_at is null then
    update public.case_tracking_links set paused_at = now(), paused_reason = 'manual' where id = v.id;
  end if;
  return 'ok';
end;
$$;

create or replace function public.tracking_link_resume(p_link uuid, p_lifetime text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v record; v_stage uuid;
begin
  if p_lifetime is null or p_lifetime not in ('7d', '30d', '90d', 'stage') then
    return 'bad_lifetime';
  end if;
  select l.id, l.case_request_id, l.owner_user_id, l.revoked_at
    into v from public.case_tracking_links l where l.id = p_link for update;
  if not found or auth.uid() is null
     or not (v.owner_user_id = auth.uid() or public.can_issue_tracking_link(v.case_request_id)) then
    return 'not_found';
  end if;
  if v.revoked_at is not null then
    return 'revoked';
  end if;
  if p_lifetime = 'stage' then
    v_stage := public.tracking_link_current_stage(v.case_request_id);
    if v_stage is null or public.tracking_link_stage_ended(v.case_request_id, v_stage) then
      return 'no_stage';
    end if;
  end if;
  update public.case_tracking_links
     set lifetime        = p_lifetime,
         expires_at      = case when p_lifetime = 'stage' then null else now() + public.tracking_lifetime_interval(p_lifetime) end,
         stage_id        = v_stage,
         paused_at       = null,
         paused_reason   = null,
         failed_attempts = 0,
         locked_until    = null
   where id = v.id;
  return 'ok';
end;
$$;

-- The lawyer list's states, for the links the caller may see (the SELECT
-- policy's rule). Only ids and states.
create or replace function public.case_tracking_link_states(p_request text)
returns table (link_id uuid, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, public.tracking_link_state(l.id)
    from public.case_tracking_links l
   where l.case_request_id = p_request
     and auth.uid() is not null
     and (l.owner_user_id = auth.uid() or public.is_case_worker(p_request));
$$;


-- ── 5. The public side (service role) ────────────────────────────────────────
create or replace function public.case_tracking_gate(p_token_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v record; v_state text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'none';
  end if;
  select l.id, l.case_request_id, l.owner_user_id, l.paused_at
    into v from public.case_tracking_links l where l.token_hash = p_token_hash;
  if not found then
    return 'none';
  end if;
  v_state := public.tracking_link_state(v.id);
  if v_state = 'revoked' or not public.tracking_link_maker_ok(v.case_request_id, v.owner_user_id) then
    return 'unavailable';
  end if;
  if v_state = 'expired' and v.paused_at is null then
    update public.case_tracking_links set paused_at = now(), paused_reason = 'expired'
     where id = v.id and paused_at is null and revoked_at is null;
  end if;
  return v_state;
end;
$$;

create or replace function public.case_tracking_unlock(p_token_hash text, p_digits text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v record; v_last4 text; v_in text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'denied';
  end if;
  select l.id, l.case_request_id, l.owner_user_id, l.failed_attempts, l.locked_until
    into v from public.case_tracking_links l where l.token_hash = p_token_hash for update;
  if not found then
    return 'denied';
  end if;
  if v.locked_until is not null and v.locked_until > now() then
    return 'locked';
  end if;
  if public.tracking_link_state(v.id) <> 'active'
     or not public.tracking_link_maker_ok(v.case_request_id, v.owner_user_id) then
    return 'denied';
  end if;
  v_in    := public.tracking_phone_digits(left(coalesce(p_digits, ''), 20));
  v_last4 := public.case_client_phone_last4(v.case_request_id);
  if v_last4 is not null and v_in is not null and length(v_in) = 4 and v_in = v_last4 then
    update public.case_tracking_links set failed_attempts = 0, locked_until = null where id = v.id;
    return 'ok';
  end if;
  if v.failed_attempts + 1 >= 5 then
    update public.case_tracking_links set failed_attempts = 0, locked_until = now() + interval '15 minutes' where id = v.id;
    return 'locked';
  end if;
  update public.case_tracking_links set failed_attempts = v.failed_attempts + 1 where id = v.id;
  return 'denied';
end;
$$;

-- The v1 snapshot, unchanged but for one gate: the link must be 'active'.
create or replace function public.case_tracking_snapshot(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link   record;
  v_case   record;
  v_stage  record;
  v_today  date := (now() at time zone 'Asia/Riyadh')::date;
  v_hear   jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select l.id, l.case_request_id, l.owner_user_id
    into v_link
    from public.case_tracking_links l
   where l.token_hash = p_token_hash
     and l.revoked_at is null;
  if not found then
    return null;
  end if;
  if not public.tracking_link_maker_ok(v_link.case_request_id, v_link.owner_user_id) then
    return null;
  end if;
  -- 20261026_62: a paused or expired link shows nothing.
  if public.tracking_link_state(v_link.id) is distinct from 'active' then
    return null;
  end if;

  select sr.id, sr.title, nullif(btrim(sr.metadata ->> 'court'), '') as meta_court
    into v_case
    from public.service_requests sr
   where sr.id = v_link.case_request_id;
  if not found then
    return null;
  end if;

  select s.degree, nullif(btrim(s.court_name), '') as court_name, nullif(btrim(s.court_case_no), '') as court_case_no
    into v_stage
    from public.case_stages s
   where s.case_request_id = v_case.id
     and public.case_worker_ok(v_case.id, s.owner_user_id)
   order by s.position desc, s.opened_on desc nulls last, s.created_at desc
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date',  to_char(h.hearing_date, 'YYYY-MM-DD'),
           'time',  to_char(h.hearing_time, 'HH24:MI'),
           'court', coalesce(nullif(btrim(h.court_name), ''), nullif(btrim(h.location), ''))
         ) order by h.hearing_date, h.hearing_time nulls last), '[]'::jsonb)
    into v_hear
    from (
      select hh.hearing_date, hh.hearing_time, hh.court_name, hh.location
        from public.hearings hh
       where hh.case_request_id = v_case.id
         and hh.kind = 'judicial'
         and hh.status = 'scheduled'
         and hh.hearing_date >= v_today
         and public.case_worker_ok(v_case.id, hh.owner_user_id)
       order by hh.hearing_date, hh.hearing_time nulls last
       limit 20
    ) h;

  update public.case_tracking_links set last_viewed_at = now() where id = v_link.id;

  return jsonb_build_object(
    'title',       v_case.title,
    'case_number', v_stage.court_case_no,
    'court',       coalesce(v_stage.court_name, v_case.meta_court),
    'stage',       v_stage.degree,
    'hearings',    v_hear
  );
end;
$$;

comment on function public.case_tracking_snapshot(text) is
  '20261025_32 + 20261026_62: the client tracking page''s ONE read. Live, ACTIVE (not paused / expired) link + maker still allowed to issue it → {title, case_number, court, stage, hearings[{date,time,court}]} from rows written by case workers only; else NULL. Stamps last_viewed_at. Service role only.';
comment on function public.case_tracking_unlock(text, text) is
  '20261026_62: the client''s 4-digit check against the case file''s mobile. ok | denied | locked (5 wrong → 15 min). Service role only.';
comment on function public.case_tracking_gate(text) is
  '20261026_62: none | unavailable | paused | expired | active for a token hash — no case data, no view stamp; writes an expiry it sees as paused (expired). Service role only.';
comment on function public.case_client_phone_last4(text) is
  '20261026_62: last 4 digits of the client mobile on the case file (attached client card, else a non-worker requester''s account). Granted to nobody: only this file''s definer functions read it.';


-- ── 6. Privileges ────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- internal: no one but the definer functions
  foreach f in array array['public.case_client_phone_last4(text)', 'public.tracking_link_current_stage(text)',
                           'public.tracking_link_stage_ended(text, uuid)', 'public.tracking_link_state(uuid)',
                           'public.case_tracking_links_born()'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('revoke all on function %s from service_role', f); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.tracking_link_state(uuid) to service_role;
  end if;
  -- service role only: the public side
  foreach f in array array['public.case_tracking_gate(text)', 'public.case_tracking_unlock(text, text)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
  -- sessions (each checks auth.uid() itself)
  foreach f in array array['public.tracking_link_pause(uuid)', 'public.tracking_link_resume(uuid, text)',
                           'public.case_tracking_link_states(text)', 'public.case_tracking_has_phone(text)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', f); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;
  -- pure helpers: harmless, but nobody needs them over REST
  foreach f in array array['public.tracking_phone_digits(text)', 'public.tracking_lifetime_interval(text)',
                           'public.tracking_link_effective_state(timestamptz, timestamptz, text, timestamptz, boolean, timestamptz)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', f); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke all on function %s from authenticated', f); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', f); end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select (lifetime, expires_at, paused_at, paused_reason, locked_until) on public.case_tracking_links to authenticated;
    grant insert (lifetime) on public.case_tracking_links to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.case_tracking_links to service_role;
  end if;
end $$;


-- ── 7. Verify (raises) ───────────────────────────────────────────────────────
do $$
declare r text; c text;
begin
  foreach c in array array['lifetime', 'expires_at', 'stage_id', 'paused_at', 'paused_reason', 'failed_attempts', 'locked_until'] loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.case_tracking_links'::regclass and attname = c and not attisdropped) then
      raise exception '20261026_62 verify: case_tracking_links.% is missing', c;
    end if;
  end loop;
  if (select count(*) from pg_policy where polrelid = 'public.case_tracking_links'::regclass) <> 3 then
    raise exception '20261026_62 verify: case_tracking_links no longer carries the 3 policies of 20261025_32';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach c in array array['token_hash', 'case_request_id', 'owner_user_id', 'firm_id', 'lifetime', 'expires_at', 'stage_id',
                             'paused_at', 'paused_reason', 'failed_attempts', 'locked_until', 'last_viewed_at'] loop
      if has_column_privilege('authenticated', 'public.case_tracking_links', c, 'UPDATE') then
        raise exception '20261026_62 verify: sessions can UPDATE case_tracking_links.% directly (only revoked_at; state goes through the RPCs)', c;
      end if;
    end loop;
    foreach c in array array['token_hash', 'failed_attempts', 'stage_id'] loop
      if has_column_privilege('authenticated', 'public.case_tracking_links', c, 'SELECT') then
        raise exception '20261026_62 verify: sessions can read case_tracking_links.%', c;
      end if;
    end loop;
    foreach r in array array['public.case_client_phone_last4(text)', 'public.case_tracking_gate(text)',
                             'public.case_tracking_unlock(text, text)', 'public.tracking_link_state(uuid)'] loop
      if has_function_privilege('authenticated', r, 'EXECUTE') then
        raise exception '20261026_62 verify: sessions can EXECUTE %', r;
      end if;
    end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and has_function_privilege('service_role', 'public.case_client_phone_last4(text)', 'EXECUTE') then
    raise exception '20261026_62 verify: the service role can read the phone digits — only this file''s definer functions may';
  end if;
  foreach r in array array['public.case_tracking_gate(text)', 'public.case_tracking_unlock(text, text)', 'public.tracking_link_pause(uuid)',
                           'public.tracking_link_resume(uuid, text)', 'public.case_tracking_link_states(text)',
                           'public.case_tracking_has_phone(text)', 'public.case_client_phone_last4(text)'] loop
    if has_function_privilege('public', r, 'EXECUTE')
       or (exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', r, 'EXECUTE')) then
      raise exception '20261026_62 verify: % is executable by PUBLIC/anon', r;
    end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(r))
       or not exists (select 1 from pg_proc where oid = to_regprocedure(r) and proconfig @> array['search_path=""']) then
      raise exception '20261026_62 verify: % is not SECURITY DEFINER with search_path ''''', r;
    end if;
  end loop;
  if coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.case_tracking_snapshot(text)')), '')
       not like '%tracking_link_state(v_link.id)%'
     or coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.case_tracking_snapshot(text)')), '')
       not like '%tracking_link_maker_ok(v_link.case_request_id, v_link.owner_user_id)%' then
    raise exception '20261026_62 verify: case_tracking_snapshot lost the state or maker gate (was 20261025_32 re-run after this file?)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_case_tracking_links_born'
                   and tgrelid = 'public.case_tracking_links'::regclass and not tgisinternal) then
    raise exception '20261026_62 verify: the born trigger is missing — a link could be inserted paused, locked or without an expiry';
  end if;
  raise notice '20261026_62 verify: OK — lifetimes 7d/30d/90d/stage, paused not deleted, resume by maker or issuer only, revoke one-way, 4-digit unlock with a 5-try / 15-min lock, phone digits readable by no role, snapshot shows active links only';
end $$;

commit;
notify pgrst, 'reload schema';
