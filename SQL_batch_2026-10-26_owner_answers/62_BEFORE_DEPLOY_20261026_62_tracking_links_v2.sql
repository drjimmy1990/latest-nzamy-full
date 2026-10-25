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
--        paused_at, paused_reason ('manual' | 'expired' | 'locked') — both
--                        or neither; paused_by — who paused it by hand (set
--                        only for 'manual');
--        failed_attempts, locked_until — the per-link digits limiter;
--        wrong_total     wrong tries since the last right answer, NOT reset
--                        by the 15-minute lock
--                        (only by a right answer or a resume): at 20 the link
--                        pauses itself as 'locked';
--        unlock_epoch    bumped on every pause, resume and change of the phone
--                        behind the link; the unlock cookie carries it, so an
--                        old cookie stops opening the link.
--      A BEFORE INSERT trigger computes expires_at / stage_id from lifetime and
--      forces a new link live and unlocked, whoever inserts. Sessions INSERT
--      `lifetime` (added to the column grant) and SELECT the new state
--      columns — never failed_attempts / wrong_total / unlock_epoch /
--      paused_by, never stage_id writes.
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
--      can_issue_tracking_link). A MANUAL pause is resumed only by the
--      link's maker, the one who paused it, or the case's lead
--      (service_requests.assigned_to) — an 'expired' or 'locked' pause by
--      anyone of the revoke policy (public.tracking_link_may_resume).
--      They touch only the state columns; token, case, owner and firm never
--      change; a revoked link is never resumed. Resume sets a NEW lifetime
--      (and so a new expiry / stage) and clears the digits lock and the wrong
--      count. Revoke stays the v1 column-privileged UPDATE (unchanged).
--      The UPDATE policy and grants are NOT widened.
--      A 'stage' link is paused (expired) the moment its stage ends — a
--      trigger on case_stages (insert, close / reorder, delete) — so opening
--      the stage again does not revive it; the lawyer resumes it.
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
--        case_tracking_gate(token_hash) → jsonb {state, epoch}: state 'none'
--          | 'unavailable' | 'paused' | 'expired' | 'active'; epoch (the
--          unlock_epoch) only when 'active'. No case data, no view stamp.
--          'unavailable' = revoked, or the maker may no longer issue it. An
--          expiry it sees is written down (paused_at, paused_reason
--          'expired'). A 'locked' pause answers 'paused' like a manual one.
--        case_tracking_unlock(token_hash, digits) → jsonb {result, epoch}:
--          'ok' (with the epoch the cookie must carry) | 'denied' | 'locked'.
--          ONE locked row, one statement per outcome: 5 wrong tries lock the
--          link for 15 minutes; while locked even the right digits are
--          refused (and not counted); 20 wrong since the last right answer
--          pause it ('locked');
--          success resets both counters. Unknown, malformed, paused, expired,
--          revoked and no-phone links all answer 'denied'.
--        case_tracking_snapshot(token_hash) — REPLACED with the same output
--          (keys, whitelist and every v1 check) plus: NULL unless the link's
--          state is 'active'. The digits check is the app's (a signed cookie
--          — src/lib/tracking/trackingUnlockCookie.ts) before it calls this.
--
-- DEPLOY ORDER: run BEFORE the new code. The new code FAILS CLOSED without
-- it: every /track link shows «هذا الرابط لم يعد متاحاً» until this file runs
-- (no case data, no digits skipped) — see the README.
-- !! Re-running 20261025_32 AFTER this file puts the v1 snapshot back (no
--    pause/expiry check). Re-run this file after it if that ever happens.
--
-- IDEMPOTENT: add column if not exists; drop constraint/trigger if exists;
-- create or replace; repeatable grants. Run twice in Docker by
-- supabase/tests/rls/tracking_links_v2.test.sql.
--
-- TRIGGERS ON PLATFORM TABLES: besides case_tracking_links (born, epoch),
-- this file attaches AFTER triggers to public.case_stages
-- (trg_case_stages_end_tracking_links), public.lawyer_clients
-- (trg_lawyer_clients_tracking_phone), public.profiles
-- (trg_profiles_tracking_phone) and public.service_requests
-- (trg_service_requests_tracking_phone). Each only updates
-- case_tracking_links rows of the changed case.
--
-- ROLLBACK (manual), IN THIS ORDER: re-run 20261025_32 (restores the v1
-- snapshot); drop the six triggers above FIRST (plpgsql records no column
-- dependency, so dropping a column under a live trigger succeeds and then
-- breaks every stage write, profile phone edit and card change); then the
-- functions below; then the new columns. Links keep their tokens.
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
  add column if not exists locked_until    timestamptz,
  add column if not exists wrong_total     int  not null default 0,
  add column if not exists unlock_epoch    int  not null default 0,
  add column if not exists paused_by       uuid references auth.users(id) on delete set null;

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
         and (paused_reason is null or paused_reason in ('manual', 'expired', 'locked'))
         and (paused_by is null or paused_reason = 'manual'));
alter table public.case_tracking_links drop constraint if exists case_tracking_links_attempts_check;
alter table public.case_tracking_links add constraint case_tracking_links_attempts_check
  check (failed_attempts between 0 and 5 and wrong_total between 0 and 20 and unlock_epoch >= 0);

comment on column public.case_tracking_links.lifetime is '٢٧٦: 7d | 30d | 90d | stage (حتى انتهاء المرحلة). Chosen at creation and at re-activation.';
comment on column public.case_tracking_links.paused_reason is '٢٧٦: manual (the lawyer) | expired (its lifetime or stage ended) | locked (20 wrong digit tries in a row — the link probably leaked). A paused link keeps its URL; resume re-activates it.';
comment on column public.case_tracking_links.wrong_total is '20261026_62: wrong digit tries since the last right answer or resume; the 15-minute lock does not reset it. At 20 the link pauses itself (locked).';
comment on column public.case_tracking_links.unlock_epoch is '20261026_62: bumped on every pause, resume and change of the phone behind the link; the signed unlock cookie carries it, so an older cookie no longer opens the link.';


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

-- Who may re-activate link p_link (see header §3). The revoke policy's
-- people (maker, or may issue on the case); a MANUAL pause only by the maker,
-- the one who paused it, or the case's lead — and the lead and the pauser
-- must still be allowed to issue (on a firm case assigned_to alone is not
-- trusted: tracking_link_maker_ok checks the active membership).
create or replace function public.tracking_link_may_resume(p_link uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select l.revoked_at is null
       and (l.owner_user_id = p_user or public.tracking_link_maker_ok(l.case_request_id, p_user))
       and (l.paused_reason is distinct from 'manual'
            or l.owner_user_id = p_user
            or l.paused_by = p_user
            or exists (select 1 from public.service_requests sr
                        where sr.id = l.case_request_id and sr.assigned_to = p_user))
      from public.case_tracking_links l
     where l.id = p_link and p_user is not null), false);
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
  new.paused_by       := null;
  new.failed_attempts := 0;
  new.locked_until    := null;
  new.wrong_total     := 0;
  new.unlock_epoch    := 0;
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

-- Every pause and every re-activation, whoever writes it (the RPCs, the gate,
-- the unlock's 'locked', the stage trigger), moves the unlock epoch: a cookie
-- signed before it no longer opens the link.
create or replace function public.case_tracking_links_epoch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.paused_at is distinct from old.paused_at then
    new.unlock_epoch := greatest(new.unlock_epoch, old.unlock_epoch + 1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_case_tracking_links_epoch on public.case_tracking_links;
create trigger trg_case_tracking_links_epoch
  before update on public.case_tracking_links
  for each row execute function public.case_tracking_links_epoch();


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
    update public.case_tracking_links set paused_at = now(), paused_reason = 'manual', paused_by = auth.uid() where id = v.id;
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
  -- a colleague's MANUAL pause: only the maker, the pauser or the case's lead
  if not public.tracking_link_may_resume(v.id, auth.uid()) then
    return 'not_allowed';
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
         paused_by       = null,
         failed_attempts = 0,
         wrong_total     = 0,
         locked_until    = null,
         unlock_epoch    = unlock_epoch + 1
   where id = v.id;
  return 'ok';
end;
$$;

-- The lawyer list's states, for the links the caller may see (the SELECT
-- policy's rule). Only ids, states and whether the caller may re-activate it.
-- (Its result columns changed in this file: drop before re-creating.)
drop function if exists public.case_tracking_link_states(text);
create function public.case_tracking_link_states(p_request text)
returns table (link_id uuid, state text, may_resume boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, public.tracking_link_state(l.id), public.tracking_link_may_resume(l.id, auth.uid())
    from public.case_tracking_links l
   where l.case_request_id = p_request
     and auth.uid() is not null
     and (l.owner_user_id = auth.uid() or public.is_case_worker(p_request));
$$;


-- ── 5. The public side (service role) ────────────────────────────────────────
-- Both answer jsonb since the review of 2026-10-26 (they returned text in the
-- first draft of this file): drop before re-creating. §6 grants them again.
drop function if exists public.case_tracking_gate(text);
drop function if exists public.case_tracking_unlock(text, text);

create function public.case_tracking_gate(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v record; v_state text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('state', 'none');
  end if;
  select l.id, l.case_request_id, l.owner_user_id, l.paused_at, l.unlock_epoch
    into v from public.case_tracking_links l where l.token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('state', 'none');
  end if;
  v_state := public.tracking_link_state(v.id);
  if v_state = 'revoked' or not public.tracking_link_maker_ok(v.case_request_id, v.owner_user_id) then
    return jsonb_build_object('state', 'unavailable');
  end if;
  if v_state = 'expired' and v.paused_at is null then
    update public.case_tracking_links set paused_at = now(), paused_reason = 'expired', paused_by = null
     where id = v.id and paused_at is null and revoked_at is null;
  end if;
  if v_state = 'active' then
    return jsonb_build_object('state', 'active', 'epoch', v.unlock_epoch);
  end if;
  return jsonb_build_object('state', v_state);
end;
$$;

create function public.case_tracking_unlock(p_token_hash text, p_digits text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v record; v_last4 text; v_in text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'denied');
  end if;
  select l.id, l.case_request_id, l.owner_user_id, l.failed_attempts, l.wrong_total, l.locked_until, l.unlock_epoch
    into v from public.case_tracking_links l where l.token_hash = p_token_hash for update;
  if not found then
    return jsonb_build_object('result', 'denied');
  end if;
  if v.locked_until is not null and v.locked_until > now() then
    return jsonb_build_object('result', 'locked');
  end if;
  if public.tracking_link_state(v.id) <> 'active'
     or not public.tracking_link_maker_ok(v.case_request_id, v.owner_user_id) then
    return jsonb_build_object('result', 'denied');
  end if;
  v_in    := public.tracking_phone_digits(left(coalesce(p_digits, ''), 20));
  v_last4 := public.case_client_phone_last4(v.case_request_id);
  if v_last4 is not null and v_in is not null and length(v_in) = 4 and v_in = v_last4 then
    update public.case_tracking_links set failed_attempts = 0, wrong_total = 0, locked_until = null where id = v.id;
    return jsonb_build_object('result', 'ok', 'epoch', v.unlock_epoch);
  end if;
  -- 20 wrong since the last right answer: the link has most likely reached
  -- someone other than the client. Pause it (the epoch trigger ends every
  -- cookie); the client sees the same neutral page as a manual pause.
  if v.wrong_total + 1 >= 20 then
    update public.case_tracking_links
       set failed_attempts = 0, wrong_total = 20, locked_until = null,
           paused_at = now(), paused_reason = 'locked', paused_by = null
     where id = v.id;
    return jsonb_build_object('result', 'locked');
  end if;
  if v.failed_attempts + 1 >= 5 then
    update public.case_tracking_links
       set failed_attempts = 0, wrong_total = v.wrong_total + 1, locked_until = now() + interval '15 minutes'
     where id = v.id;
    return jsonb_build_object('result', 'locked');
  end if;
  update public.case_tracking_links
     set failed_attempts = v.failed_attempts + 1, wrong_total = v.wrong_total + 1
   where id = v.id;
  return jsonb_build_object('result', 'denied');
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
  '20261026_62: the client''s 4-digit check against the case file''s mobile. {result: ok | denied | locked, epoch (ok only)}; 5 wrong → 15 min, 20 wrong since the last right answer → paused (locked). Service role only.';
comment on function public.case_tracking_gate(text) is
  '20261026_62: {state: none | unavailable | paused | expired | active, epoch (active only)} for a token hash — no case data, no view stamp; writes an expiry it sees as paused (expired). Service role only.';
comment on function public.case_client_phone_last4(text) is
  '20261026_62: last 4 digits of the client mobile on the case file (attached client card, else a non-worker requester''s account). Granted to nobody: only this file''s definer functions read it.';


-- ── 5b. Triggers outside the table: stage ends, phone changes ──────────────
-- A 'stage' link is paused (expired) as soon as its stage ends, not when the
-- page is next opened — otherwise re-opening the stage would revive it. Only
-- the case(s) of the changed row, only live stage links. A stage whose closing
-- date had already passed counts as ended even if the update now clears it.
create or replace function public.case_stages_end_tracking_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_case   text;
  v_old_case   text;
  v_old_stage  uuid;
  v_old_closed boolean := false;
begin
  if tg_op <> 'DELETE' then
    v_new_case := new.case_request_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_case  := old.case_request_id;
    v_old_stage := old.id;
  end if;
  if tg_op = 'UPDATE' then
    v_old_closed := old.closed_on is not null and old.closed_on <= (now() at time zone 'Asia/Riyadh')::date;
  end if;
  update public.case_tracking_links l
     set paused_at = now(), paused_reason = 'expired', paused_by = null
   where l.case_request_id in (v_new_case, v_old_case)
     and l.lifetime = 'stage'
     and l.revoked_at is null
     and l.paused_at is null
     and (public.tracking_link_stage_ended(l.case_request_id, l.stage_id)
          or (v_old_closed and l.stage_id = v_old_stage));
  return null;
end;
$$;

drop trigger if exists trg_case_stages_end_tracking_links on public.case_stages;
create trigger trg_case_stages_end_tracking_links
  after insert or delete or update of closed_on, position, opened_on, case_request_id, owner_user_id
  on public.case_stages
  for each row execute function public.case_stages_end_tracking_links();

-- The digits behind a link changed (the client card's phone, the requester's
-- account phone, or the card / requester attached to the case): bump the
-- epoch of the case's live links, so an unlock made with the old number ends.
create or replace function public.tracking_links_phone_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'lawyer_clients' then
    update public.case_tracking_links l set unlock_epoch = l.unlock_epoch + 1
     where l.revoked_at is null
       and l.case_request_id in (select sr.id from public.service_requests sr where sr.lawyer_client_id = new.id);
  elsif tg_table_name = 'profiles' then
    update public.case_tracking_links l set unlock_epoch = l.unlock_epoch + 1
     where l.revoked_at is null
       and l.case_request_id in (select sr.id from public.service_requests sr where sr.requester_user_id = new.id);
  elsif tg_table_name = 'service_requests' then
    update public.case_tracking_links l set unlock_epoch = l.unlock_epoch + 1
     where l.revoked_at is null and l.case_request_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_lawyer_clients_tracking_phone on public.lawyer_clients;
create trigger trg_lawyer_clients_tracking_phone
  after update of phone on public.lawyer_clients
  for each row when (old.phone is distinct from new.phone)
  execute function public.tracking_links_phone_changed();

drop trigger if exists trg_profiles_tracking_phone on public.profiles;
create trigger trg_profiles_tracking_phone
  after update of phone on public.profiles
  for each row when (old.phone is distinct from new.phone)
  execute function public.tracking_links_phone_changed();

drop trigger if exists trg_service_requests_tracking_phone on public.service_requests;
create trigger trg_service_requests_tracking_phone
  after update of lawyer_client_id, requester_user_id on public.service_requests
  for each row when (old.lawyer_client_id is distinct from new.lawyer_client_id
                     or old.requester_user_id is distinct from new.requester_user_id)
  execute function public.tracking_links_phone_changed();


-- ── 6. Privileges ────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- internal: no one but the definer functions
  foreach f in array array['public.case_client_phone_last4(text)', 'public.tracking_link_current_stage(text)',
                           'public.tracking_link_stage_ended(text, uuid)', 'public.tracking_link_state(uuid)',
                           'public.tracking_link_may_resume(uuid, uuid)',
                           'public.case_tracking_links_born()', 'public.case_tracking_links_epoch()',
                           'public.case_stages_end_tracking_links()', 'public.tracking_links_phone_changed()'] loop
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
  foreach c in array array['lifetime', 'expires_at', 'stage_id', 'paused_at', 'paused_reason', 'failed_attempts', 'locked_until',
                           'wrong_total', 'unlock_epoch', 'paused_by'] loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.case_tracking_links'::regclass and attname = c and not attisdropped) then
      raise exception '20261026_62 verify: case_tracking_links.% is missing', c;
    end if;
  end loop;
  if coalesce((select pg_get_constraintdef(oid) from pg_constraint
                where conrelid = 'public.case_tracking_links'::regclass and conname = 'case_tracking_links_paused_shape'), '')
       not like '%''locked''%' then
    raise exception '20261026_62 verify: case_tracking_links_paused_shape does not allow the ''locked'' pause';
  end if;
  foreach r in array array['public.case_tracking_gate(text)', 'public.case_tracking_unlock(text, text)'] loop
    if pg_get_function_result(to_regprocedure(r)) is distinct from 'jsonb' then
      raise exception '20261026_62 verify: % does not answer jsonb (state / result + unlock epoch)', r;
    end if;
  end loop;
  foreach c in array array['trg_case_tracking_links_epoch:public.case_tracking_links',
                           'trg_case_stages_end_tracking_links:public.case_stages',
                           'trg_lawyer_clients_tracking_phone:public.lawyer_clients',
                           'trg_profiles_tracking_phone:public.profiles',
                           'trg_service_requests_tracking_phone:public.service_requests'] loop
    if not exists (select 1 from pg_trigger where tgname = split_part(c, ':', 1)
                     and tgrelid = to_regclass(split_part(c, ':', 2)) and not tgisinternal) then
      raise exception '20261026_62 verify: trigger % is missing', c;
    end if;
  end loop;
  if (select count(*) from pg_policy where polrelid = 'public.case_tracking_links'::regclass) <> 3 then
    raise exception '20261026_62 verify: case_tracking_links no longer carries the 3 policies of 20261025_32';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach c in array array['token_hash', 'case_request_id', 'owner_user_id', 'firm_id', 'lifetime', 'expires_at', 'stage_id',
                             'paused_at', 'paused_reason', 'failed_attempts', 'locked_until', 'last_viewed_at',
                             'wrong_total', 'unlock_epoch', 'paused_by'] loop
      if has_column_privilege('authenticated', 'public.case_tracking_links', c, 'UPDATE') then
        raise exception '20261026_62 verify: sessions can UPDATE case_tracking_links.% directly (only revoked_at; state goes through the RPCs)', c;
      end if;
    end loop;
    foreach c in array array['token_hash', 'failed_attempts', 'stage_id', 'wrong_total', 'unlock_epoch'] loop
      if has_column_privilege('authenticated', 'public.case_tracking_links', c, 'SELECT') then
        raise exception '20261026_62 verify: sessions can read case_tracking_links.%', c;
      end if;
    end loop;
    foreach r in array array['public.case_client_phone_last4(text)', 'public.case_tracking_gate(text)',
                             'public.case_tracking_unlock(text, text)', 'public.tracking_link_state(uuid)',
                             'public.tracking_link_may_resume(uuid, uuid)'] loop
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
  raise notice '20261026_62 verify: OK — lifetimes 7d/30d/90d/stage (a stage link pauses when its stage ends), paused not deleted, resume by maker or issuer (a manual pause: maker, pauser or lead), revoke one-way, 4-digit unlock with a 5-try / 15-min lock and a pause at 20 wrong, unlock epoch on pause / resume / phone change, phone digits readable by no role, snapshot shows active links only';
end $$;

commit;
notify pgrst, 'reload schema';
