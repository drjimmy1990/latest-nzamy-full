-- =============================================================================
-- Migration: 20261025_30_hearing_reminders.sql
-- Plan: docs/plans/2026-10-25-owner-free-phases-plan.md, P4 item N3.2.
-- Owner intent: package 2026-10-22 §٤٥ axis 2 («منبهات ذكية متعددة المراحل
-- للجلسات»: قبل ٧ أيام، قبل ٣ أيام، مساء اليوم السابق ٨:٠٠م، صباح الجلسة
-- ٧:٠٠ص) and multi-recipient routing (المستشار المسؤول، صاحب المكتب). The
-- client is not a recipient here: in-platform channel, platform accounts only.
-- =============================================================================
--
-- WHAT CHANGES
--   1. public.notification_outbox.hearing_id uuid → public.hearings(id)
--      ON DELETE CASCADE. A deleted hearing takes its reminders with it, the
--      same way deadline_id already does.
--
--   2. The once-only key is widened to hearings WITHOUT touching the deadline
--      one: a second, FULL (non-partial) unique constraint
--        uq_notification_outbox_hearing_once (hearing_id, recipient_user_id, channel, kind)
--      next to the untouched uq_notification_outbox_once (deadline_id, …).
--      With the default NULLS DISTINCT a deadline row (hearing_id NULL) never
--      collides with a hearing row (deadline_id NULL) on either key. Full, not
--      partial, on purpose: PostgREST's `on_conflict=` cannot name a partial
--      index's predicate, and Postgres refuses to infer one without it (42P10).
--
--   3. CHECK notification_outbox_one_source: a row belongs to a deadline OR to
--      a hearing, never both. Existing rows carry no hearing_id, so none can
--      violate it. It also shuts the one door a session had: the deadline
--      insert policy below would otherwise let a deadline owner attach any
--      hearing_id to a row for his own deadline.
--
--   4. public.hearing_reminder_targets(p_from date, p_to date) — the ONE
--      definition of who is reminded of a hearing. For every SCHEDULED hearing
--      dated p_from..p_to it returns one row per recipient:
--        owner       hearings.owner_user_id — the lawyer who keeps the entry;
--        lead        the case's service_requests.assigned_to, only while an
--                    ACTIVE member of the case's firm (assigned_to is free
--                    text on insert, so an unverified id would be handed the
--                    case title and court);
--        consultant  a case_team_members row of that case (20261017_41) who is
--                    an ACTIVE member of the case's firm in a consultant role
--                    (legal_consultant, in_house_counsel, external_of_counsel)
--                    or whose lawyer_profiles.practice_kind = 'consultant'
--                    (20261019_20) — «المستشار المسؤول»;
--        firm_owner  firm_profiles.owner_user_id of the case's firm, or of the
--                    hearing's own firm_id when it has no case.
--      The lead, consultant and firm_owner arms apply only when the hearing's
--      OWNER belongs to that firm (an active member, or its owner): the owner
--      writes case_request_id and firm_id himself, the hearings insert policy
--      checks only owner_user_id, and a foreign key ignores RLS — without this
--      an outsider's own hearing would put his text in a firm's bells.
--      One row per (hearing, recipient), first arm wins. The client is never a
--      recipient (no arm reads requester_user_id outside the firm-membership
--      test). SECURITY INVOKER, search_path ''; EXECUTE for service_role only
--      — the scheduler (/api/v1/cron/deadlines) is its only caller, and a
--      session must not be able to list another lawyer's hearings through it.
--
--   5. The UPDATE policy of 20260904_phase5 («outbox cancellable by deadline
--      owner») is recreated with a WITH CHECK that re-tests the NEW row: still
--      no hearing_id, and still a deadline the writer may access. Its USING
--      was evaluated on the old row only and its WITH CHECK tested only the
--      status, so a deadline owner could UPDATE his own row into a hearing row
--      (deadline_id → null, hearing_id → anyone's hearing, recipient → anyone)
--      and the scheduler would deliver that hearing's title, date and court;
--      the same gap let him move a row onto another user's deadline. Legit
--      cancels and re-arms of one's own deadline rows still pass (Docker T6f).
--
-- NOT CHANGED: the select and insert outbox policies of 20260904_phase5. A
-- session can still read the rows addressed to it (the recipient arm), and can
-- neither insert nor update a hearing row: both write policies require a
-- deadline the caller may access, the update policy (5) forbids a hearing_id
-- on the new row, and the CHECK forbids a row with both. Hearing reminders
-- are queued and delivered by the service-role scheduler only.
--
-- WHEN THE REMINDERS FIRE — src/lib/calendar/hearingReminderStages.ts (one
-- constant, owner question ٢٦٥ pending) and src/lib/hearingReminders.ts. A
-- hearing's wall-clock date and time are read as Asia/Riyadh (UTC+3, no DST),
-- the convention the deadline reminders already use (06:00 Riyadh).
--
-- IDEMPOTENT: add column if not exists; each constraint is added only when a
-- constraint of that name is absent; create index if not exists; create or
-- replace function; revoke/grant are repeatable; drop policy if exists before
-- create policy. Run twice in Docker by
-- supabase/tests/rls/hearing_reminders.test.sql.
--
-- ROLLBACK (manual): drop function public.hearing_reminder_targets(date, date);
-- recreate the phase5 update policy with `with check (status in ('pending',
-- 'cancelled'))` only (not recommended: that reopens the gap in 5);
-- alter table public.notification_outbox drop constraint
-- uq_notification_outbox_hearing_once, drop constraint
-- notification_outbox_one_source, drop column hearing_id. Rows queued for
-- hearings go with the column.
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.notification_outbox') is null then
    raise exception '20261025_30: public.notification_outbox is missing — apply 20260904_phase5_deadline_radar.sql first';
  end if;
  if to_regclass('public.hearings') is null then
    raise exception '20261025_30: public.hearings is missing — apply 20260903_phase1_case_tables.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'service_requests' and column_name = 'firm_id') then
    raise exception '20261025_30: service_requests.firm_id is missing — apply 20260903_phase2 first';
  end if;
  if to_regclass('public.case_team_members') is null then
    raise exception '20261025_30: public.case_team_members is missing — apply 20261017_41_notes_visibility_case_team.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = 'practice_kind') then
    raise exception '20261025_30: lawyer_profiles.practice_kind is missing — apply 20261019_20_lawyer_practice_kind.sql first';
  end if;
end $$;


-- ── 1. The column ────────────────────────────────────────────────────────────
alter table public.notification_outbox
  add column if not exists hearing_id uuid references public.hearings(id) on delete cascade;

comment on column public.notification_outbox.hearing_id is
  'The hearing this reminder is for (20261025_30). NULL on deadline reminders; a row has a deadline_id or a hearing_id, never both.';

create index if not exists idx_notification_outbox_hearing
  on public.notification_outbox (hearing_id) where hearing_id is not null;


-- ── 2 + 3. The hearing once-only key and the one-source rule ────────────────
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass
                    and conname = 'uq_notification_outbox_hearing_once') then
    alter table public.notification_outbox
      add constraint uq_notification_outbox_hearing_once
      unique (hearing_id, recipient_user_id, channel, kind);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass
                    and conname = 'notification_outbox_one_source') then
    alter table public.notification_outbox
      add constraint notification_outbox_one_source
      check (not (deadline_id is not null and hearing_id is not null));
  end if;
end $$;

comment on table public.notification_outbox is
  'Reminders waiting to be delivered. A row is for a deadline (UNIQUE deadline, recipient, channel, kind) or a hearing (UNIQUE hearing, recipient, channel, kind — 20261025_30), never both: a second scheduler run cannot queue the same reminder twice.';


-- ── 4. Who is reminded of a hearing ──────────────────────────────────────────
create or replace function public.hearing_reminder_targets(p_from date, p_to date)
returns table (
  hearing_id        uuid,
  recipient_user_id uuid,
  via               text,
  case_request_id   text,
  title             text,
  hearing_date      date,
  hearing_time      time,
  court_name        text,
  location          text,
  created_at        timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select h.id, h.owner_user_id, h.case_request_id, h.title, h.hearing_date,
           h.hearing_time, h.court_name, h.location, h.created_at,
           sr.firm_id                      as case_firm_id,
           sr.assigned_to                  as lead_user_id,
           coalesce(sr.firm_id, h.firm_id) as owner_firm_id
      from public.hearings h
      left join public.service_requests sr on sr.id = h.case_request_id
     where h.status = 'scheduled'
       and h.hearing_date between p_from and p_to
  ), h as (
    -- The hearing's case_request_id and firm_id are written by its owner, and
    -- the only insert rule on hearings is owner_user_id = auth.uid() (a foreign
    -- key ignores RLS). So a firm's people are reminded only when the OWNER of
    -- the hearing belongs to that firm — an active member, or its owner.
    -- Otherwise an outsider could put a title of his choosing in their bells.
    select b.*,
           (b.case_firm_id is not null and (
              exists (select 1 from public.firm_members m
                       where m.firm_id = b.case_firm_id and m.user_id = b.owner_user_id and m.status = 'active')
              or exists (select 1 from public.firm_profiles fp
                          where fp.id = b.case_firm_id and fp.owner_user_id = b.owner_user_id)
           )) as owner_in_case_firm,
           (b.owner_firm_id is not null and (
              exists (select 1 from public.firm_members m
                       where m.firm_id = b.owner_firm_id and m.user_id = b.owner_user_id and m.status = 'active')
              or exists (select 1 from public.firm_profiles fp
                          where fp.id = b.owner_firm_id and fp.owner_user_id = b.owner_user_id)
           )) as owner_in_owner_firm
      from base b
  ), arms as (
    select h.id, h.owner_user_id as uid, 'owner'::text as via, 1 as rank from h
    union all
    select h.id, h.lead_user_id, 'lead', 2
      from h
     where h.lead_user_id is not null
       and h.owner_in_case_firm
       and exists (select 1 from public.firm_members m
                    where m.firm_id = h.case_firm_id
                      and m.user_id = h.lead_user_id
                      and m.status  = 'active')
    union all
    select h.id, t.user_id, 'consultant', 3
      from h
      join public.case_team_members t
        on t.request_id = h.case_request_id and t.firm_id = h.case_firm_id
      join public.firm_members m
        on m.firm_id = t.firm_id and m.user_id = t.user_id and m.status = 'active'
     where h.owner_in_case_firm
       and (m.role in ('legal_consultant', 'in_house_counsel', 'external_of_counsel')
            or exists (select 1 from public.lawyer_profiles lp
                        where lp.user_id = t.user_id and lp.practice_kind = 'consultant'))
    union all
    select h.id, fp.owner_user_id, 'firm_owner', 4
      from h
      join public.firm_profiles fp on fp.id = h.owner_firm_id
     where h.owner_in_owner_firm
  )
  select distinct on (a.id, a.uid)
         a.id, a.uid, a.via, h.case_request_id, h.title, h.hearing_date,
         h.hearing_time, h.court_name, h.location, h.created_at
    from arms a
    join h on h.id = a.id
   where a.uid is not null
   order by a.id, a.uid, a.rank;
$$;

comment on function public.hearing_reminder_targets(date, date) is
  '20261025_30: one row per (scheduled hearing dated p_from..p_to, recipient). Recipients: the hearing owner; and, only when that owner belongs to the firm (active member or owner): the case lead (assigned_to) while an active member of the case firm, case-team consultants (consultant firm role or practice_kind) while active members, the firm owner (case firm, else the hearing firm). Never the client. Service role only.';

revoke all on function public.hearing_reminder_targets(date, date) from public;
revoke all on function public.hearing_reminder_targets(date, date) from anon;
revoke all on function public.hearing_reminder_targets(date, date) from authenticated;
grant execute on function public.hearing_reminder_targets(date, date) to service_role;


-- ── 5. The outbox UPDATE policy re-tests the new row ─────────────────────────
drop policy if exists "outbox cancellable by deadline owner" on public.notification_outbox;
create policy "outbox cancellable by deadline owner" on public.notification_outbox
  for update using (
    exists (select 1 from public.deadlines d
             where d.id = notification_outbox.deadline_id
               and public.can_access_case_row(d.owner_user_id, d.firm_id))
  ) with check (
    status in ('pending', 'cancelled')
    and hearing_id is null
    and exists (select 1 from public.deadlines d
                 where d.id = notification_outbox.deadline_id
                   and public.can_access_case_row(d.owner_user_id, d.firm_id))
  );

commit;
