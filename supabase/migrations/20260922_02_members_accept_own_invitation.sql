-- ============================================================
-- Migration: 20260922_02_members_accept_own_invitation.sql
--
-- PURPOSE
-- -------
-- Give an invited person the ability to ANSWER their own invitation, which is
-- the database half of review finding A5 / F03 (CRITICAL):
-- `POST /api/v1/business/members` inserted `status = 'active'` with
-- `accepted_at = now()` for any account whose e-mail matched, so a company
-- owner could put a stranger on the roster without asking — and from that
-- moment 20260914's policy «business members read business service requests»
-- routed that person's private consultations into the company feed.
--
-- The app half (same commit) inserts `status = 'invited', accepted_at = null`
-- instead. That alone is safe — every membership read in the repo
-- (`useUser`, `resolveActiveEntityIds`, `is_active_business_member`,
-- `is_active_firm_member`, both roster routes) filters `status = 'active'`,
-- so an invited row grants nothing — but it would leave an invitation nobody
-- can accept, because 20260921_03's matrix lets ONLY the owner/admin UPDATE a
-- `*_members` row. This file adds the one missing arm.
--
-- CLOSES
-- ------
-- Review 2026-09-21 item A5 / F03 — the consent-at-entry half, on BOTH sides:
--   * the invitee gains the UPDATE arm that lets them answer (accept/decline);
--   * the owner/admin arm from 20260921_03 loses the ability to answer FOR
--     them. Writing `invited` instead of `active` at POST time closes nothing
--     on its own, because `PATCH /api/v1/{business,firm}/members/{id}
--     {"status":"active"}` — and the same PATCH sent straight to PostgREST —
--     flips the invitation without ever asking, and the row then vanishes
--     from `GET /api/v1/me/invitations` so the victim is not even shown it.
--     Section 0 (c) is the invariant that shuts that door.
-- NOT the whole finding, twice over:
--   * the new UPDATE arm is gated on `status = 'invited'`, so an ACTIVE
--     member still cannot set their own row to `removed` — self-departure
--     stays owner-only and is a separate task;
--   * nothing backfills rows the old code already wrote as `active` with
--     `accepted_at = now()` and no consent. This file is consent at ENTRY;
--     any forced membership already on production survives it.
--
-- PREREQUISITES
-- -------------
-- 20260921_03_entity_rls_recursion_fix.sql — this file ADDS a fifth policy to
-- the four-policy matrix that migration installs. Each table is guarded with
-- `to_regclass`, exactly as 20260921_03 guards its blocks, so a database
-- missing an entity pair is skipped rather than failed.
--
-- RE-APPLY HAZARD: 20260921_03 opens by dropping EVERY policy on the eight
-- entity tables, and its own verify block then asserts exactly 4 per
-- `*_members`. If 20260921_03 is ever re-run it removes this file's policy,
-- and this file must be applied again after it. That ordering is why this is a
-- separate migration and not an edit of an already-applied one.
--
-- WHAT IT REPLACES
-- ----------------
-- Nothing. No policy has ever let a member write their own membership row
-- (20260921_03's header says so explicitly), and `team_invitations` — the
-- table that was supposed to carry invitations — has never had a writer.
--
-- WHY A TRIGGER AS WELL AS A POLICY
-- ---------------------------------
-- RLS filters ROWS, not COLUMNS, and `authenticated` holds PostgREST's
-- table-level UPDATE grant (the same fact review items A6/B2/B6 are about).
-- A policy whose WITH CHECK constrains `user_id` and `status` therefore still
-- admits
--     PATCH /rest/v1/business_members?id=eq.<my invited row>
--     {"status":"active","role":"legal_manager","business_id":"<someone else>"}
-- — an invitee accepting as a role they were never offered, or moving their
-- own invitation row onto a company that never invited them, which re-opens
-- A5 from the other side. A BEFORE UPDATE trigger is the only construct that
-- can pin columns, so `entity_member_invitation_answer_guard()` takes OLD
-- wholesale on the invitee-answering path and lets exactly `status`,
-- `accepted_at` and `updated_at` through. A trigger body is not a policy
-- expression, so neither `_verify.sql`'s 42P17 regex nor 20260921_03's
-- no-subquery gate is affected by it.
--
-- ROLLBACK
-- --------
--   drop trigger if exists trg_<x>_members_invitation_answer on public.<x>_members;  -- x4
--   drop policy  if exists "<x>_members: invitee can answer own invitation" on public.<x>_members;  -- x4
--   drop function if exists public.entity_member_invitation_answer_guard();
-- That restores 20260921_03's four-policy matrix exactly, and with it the
-- state in which an invitation can never be answered.
-- ============================================================

begin;

-- -- 0. The column guard, shared by all four tables ---------------------------
--
-- Generic on purpose: `firm_members` and `business_members` carry
-- `department`, `invited_at` and `accepted_at`; `government_members` and
-- `ngo_members` carry none of the three (20260616:183-196, :234-250). Rather
-- than four near-identical functions with different column lists, this one
-- copies OLD as jsonb and overrides only the fields an answer may move —
-- which is also why a column added to any of these tables later is pinned by
-- default instead of being forgotten here.
create or replace function public.entity_member_invitation_answer_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  pinned jsonb;
  old_j  jsonb;
  new_at text;
begin
  old_j := to_jsonb(old);

  -- Not the invitee answering their own invitation -> the owner/admin UPDATE
  -- arm from 20260921_03. It keeps writing whatever it likes: cancelling an
  -- invitation (invited -> removed), re-inviting a removed member
  -- (removed -> invited), changing a role, suspending. With ONE invariant,
  -- enforced below, because without it A5 is not closed at all:
  --
  --     POST /api/v1/business/members {email, role}     -> row at `invited`
  --     PATCH /api/v1/business/members/{id} {"status":"active"}
  --
  -- is two owner-only calls that put a stranger on the roster without ever
  -- asking, exactly as before this file existed -- and the invitation then
  -- disappears from `GET /api/v1/me/invitations`, so the victim is never even
  -- shown it. The invariant is stated on the RESULTING ROW, not on the
  -- transition, so `invited -> suspended -> active` is refused too.
  if auth.uid() is null
     or old.user_id is distinct from auth.uid()
     or old.status is distinct from 'invited' then

    -- (a) Nobody authenticated is writing (the service role, a cron job, a
    --     migration backfill, or an internal SECURITY DEFINER trigger such as
    --     `ensure_business_owner_membership` (20260914:21-36), whose
    --     `on conflict do update set status = 'active', accepted_at =
    --     coalesce(...)` DOES fire this BEFORE UPDATE trigger) -- or the
    --     member is writing their own row, which is consent by definition and
    --     is how the owner's bootstrap row is kept in step. Neither is the
    --     actor A5 is about, and a service key can write both columns in two
    --     statements anyway, so guarding them buys nothing and breaks the
    --     bootstrap.
    if auth.uid() is null or old.user_id = auth.uid() then
      return new;
    end if;

    -- Only firm_members / business_members have `accepted_at`; on
    -- government_members / ngo_members there is no evidence of consent to
    -- reason about, and no invitation surface in the product either.
    if (old_j ? 'accepted_at') then
      new_at := to_jsonb(new) ->> 'accepted_at';

      -- (b) `accepted_at` is the ONLY evidence that a person said yes, so a
      --     third party may CLEAR it (that is the POST route's re-invite arm,
      --     which demotes a suspended member back to `invited`) but may never
      --     write one. Without this pin the invariant in (c) is one extra
      --     field in a raw PostgREST PATCH away from being bypassed:
      --     {"status":"active","accepted_at":"2026-09-22T00:00:00Z"}.
      if new_at is not null and new_at is distinct from (old_j ->> 'accepted_at') then
        new := jsonb_populate_record(new, jsonb_build_object('accepted_at', old_j -> 'accepted_at'));
        new_at := old_j ->> 'accepted_at';
      end if;

      -- (c) THE CONSENT INVARIANT: no active membership without an answer.
      if new.status = 'active' and new_at is null then
        raise exception
          'entity_member_invitation_answer_guard: a membership cannot be active while accepted_at is null - only the invited person may accept their own invitation (A5/F03)'
          using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  -- An answer is «accept» or «decline». Anything else — suspended, or back to
  -- invited — is not an answer, and the policy's WITH CHECK refuses it too.
  if new.status is distinct from 'active' and new.status is distinct from 'removed' then
    raise exception
      'entity_member_invitation_answer_guard: an invitee may only accept (active) or decline (removed) their own invitation, not %',
      coalesce(new.status, '<null>')
      using errcode = '42501';
  end if;

  -- OLD wholesale, then only the answer fields through. Everything else the
  -- writer may have put in the UPDATE — role, permissions, department,
  -- metadata, user_id, the entity key — is discarded here, because RLS cannot
  -- discard it.
  pinned := to_jsonb(old)
            || jsonb_build_object('status', new.status, 'updated_at', new.updated_at);

  -- Only firm_members / business_members have this column.
  if (pinned ? 'accepted_at') then
    if new.status = 'active' and (pinned ->> 'accepted_at') is null then
      pinned := jsonb_set(pinned, '{accepted_at}', to_jsonb(now()));
    end if;
  end if;

  new := jsonb_populate_record(new, pinned);
  return new;
end
$fn$;

comment on function public.entity_member_invitation_answer_guard() is
  'A5/F03: pins every column but status/accepted_at/updated_at when an invitee answers their own *_members invitation, and refuses any third-party UPDATE that would leave a row active while accepted_at is null. RLS filters rows, not columns.';

-- -- 1. One policy + one trigger per membership table --------------------------
do $do$
declare
  t    text;
  fq   text;
  pol  text;
  trg  text;
begin
  foreach t in array array['firm_members', 'business_members', 'government_members', 'ngo_members']
  loop
    fq  := 'public.' || t;
    pol := t || ': invitee can answer own invitation';
    trg := 'trg_' || t || '_invitation_answer';

    if to_regclass(fq) is null then
      raise notice '20260922_02: % absent - skipped', fq;
      continue;
    end if;

    -- Idempotent: dropped by name first, so re-running this file is a no-op
    -- rather than a 42710.
    execute format('drop policy if exists %I on %s', pol, fq);

    -- No subquery and no inline read of an entity table: the `_verify.sql`
    -- 42P17 gate and 20260921_03's belt-and-braces gate must both stay at 0.
    execute format($p$
      create policy %I on %s
        for update to authenticated
        using (user_id = auth.uid() and status = 'invited')
        with check (user_id = auth.uid() and status in ('active', 'removed'))
    $p$, pol, fq);

    execute format('drop trigger if exists %I on %s', trg, fq);
    -- Fires before trg_<t>_updated_at (alphabetical: 'i' < 'u'), so the
    -- updated_at trigger still gets the last word on that column.
    execute format(
      'create trigger %I before update on %s for each row execute function public.entity_member_invitation_answer_guard()',
      trg, fq);

    raise notice '20260922_02: % - invitee UPDATE arm + column guard installed', fq;
  end loop;
end
$do$;

-- -- 2. Read-only verification - raises, so the transaction rolls back ---------
do $$
declare
  t    text;
  n    int;
  bad  text;
begin
  foreach t in array array['firm_members', 'business_members', 'government_members', 'ngo_members']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    -- 2a. 20260921_03's four, plus this file's one. A different number means
    --     either 20260921_03 was not applied, or something wrote a policy onto
    --     these tables out of band.
    select count(*) into n from pg_policy where polrelid = ('public.' || t)::regclass;
    if n <> 5 then
      raise exception '20260922_02 verify: public.% has % policies, expected 5 (20260921_03 four + the invitee arm)', t, n;
    end if;

    -- 2b. the arm itself, by name, and it must be an UPDATE policy
    select count(*) into n
      from pg_policy
     where polrelid = ('public.' || t)::regclass
       and polname = t || ': invitee can answer own invitation'
       and polcmd = 'w';
    if n <> 1 then
      raise exception '20260922_02 verify: the invitee UPDATE policy is missing on public.%', t;
    end if;

    -- 2c. the column guard is actually attached
    select count(*) into n
      from pg_trigger
     where tgrelid = ('public.' || t)::regclass
       and tgname = 'trg_' || t || '_invitation_answer'
       and not tgisinternal;
    if n <> 1 then
      raise exception '20260922_02 verify: the invitation-answer column guard is not attached to public.%', t;
    end if;
  end loop;

  -- 2c-bis. …and the guard it points at is the version that also closes the
  --   OWNER path. An earlier draft of this file guarded only the invitee, so
  --   the function EXISTING proves nothing: the two lines below are what make
  --   `PATCH {"status":"active"}` from the owner fail. Checked on the body so
  --   a stale copy of this migration cannot satisfy the gate.
  select pg_get_functiondef(p.oid) into bad
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'entity_member_invitation_answer_guard';
  if bad is null then
    raise exception '20260922_02 verify: public.entity_member_invitation_answer_guard() is missing';
  end if;
  if bad !~ 'a membership cannot be active while accepted_at is null' then
    raise exception '20260922_02 verify: the column guard does not carry the consent invariant - the owner can still flip an invitation to active (A5/F03)';
  end if;
  if bad !~ 'jsonb_build_object\(''accepted_at''' then
    raise exception '20260922_02 verify: the column guard does not pin accepted_at against a third party - the invariant above is one PostgREST field away from being bypassed';
  end if;

  -- 2d. the 42P17 shape stays at zero across all eight entity tables - the
  --     same regex `_verify.sql` and 20260921_03 use.
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
    raise exception '20260922_02 verify: policy expression reads an entity table inline (42P17 shape): %', bad;
  end if;

  -- 2e. ...and no subquery of any kind, including in the arm this file adds
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
    raise exception '20260922_02 verify: policy expression contains a subquery: %', bad;
  end if;

  raise notice '20260922_02 verify: OK - 5 policies per membership table, the invitee arm and its column guard in place, 0 inline entity reads';
end $$;

commit;

-- Read-only re-check after applying in staging:
--   select c.relname, pol.polname, pol.polcmd,
--          pg_get_expr(pol.polqual, pol.polrelid)      as using_expr,
--          pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
--     from pg_policy pol join pg_class c on c.oid = pol.polrelid
--    where pol.polname like '%invitee can answer own invitation%';
--   select tgname, tgrelid::regclass from pg_trigger
--    where tgname like 'trg%invitation_answer' and not tgisinternal;
