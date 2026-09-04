-- =============================================================================
-- Migration: 20260905_phase3_consultations_and_contracts.sql
-- Phase:     3 — الاستشارات والعقود  (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §7)
-- Purpose:   One real record per consultation (lifecycle, private notes, the
--            delivered opinion, convert-to-case exactly once) and a real
--            contract manager (the contract, its file versions, its parties,
--            its obligations that become radar deadlines, and its payment
--            schedule) — all firm-shareable through the Phase 1 access test.
--
-- Closes (matrix rows): 108 · 110 · 111 (table side) · 113 · 114 · 116 · 117
--                       (109 — video cockpit — has no infrastructure; not here)
--
-- REQUIRES (run before this file): 20260903_phase2_clients_and_firm_membership
--                                  (lawyer_clients, service_requests.firm_id /
--                                  lawyer_client_id) and 20260904_phase5
--                                  (deadlines). Both are on production.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WE FOUND (2026-09-04, read-only against production)
-- ─────────────────────────────────────────────────────────────────────────────
-- • public.consultations and public.contracts exist since 20260518 and hold
--   0 rows. Nothing writes contracts at all; the only writer of consultations
--   (casesService.createConsultation) has zero call sites. The PATCH route
--   allow-lists a `notes` column that does not exist.
-- • Every consultation/contract screen actually reads service_requests, keyed
--   by `type` — and three screens disagree on what a contract is
--   (lawyer manager: 'business_case'; client «عقودي»: 'ai_draft'; the AI
--   intake: 'ai_contracts'). A lawyer's contract is invisible to its client.
-- • production service_requests: 0 rows today. No backfill has anything to do.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 1 — ADOPT THE TWO DEAD TABLES, DO NOT DROP THEM
-- ─────────────────────────────────────────────────────────────────────────────
-- Their `text` ids anchor to service_requests.id (text). Rebuilding them as
-- uuid tables would put a type seam between a consultation and the request it
-- came from. So: keep `text` ids (with a server-side default), add the columns
-- the screens need, replace the 20260518 participant policies with the Phase 1
-- test (owner OR active firm member), and give every child table a uuid id.
-- Nothing is dropped, truncated or deleted.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 2 — A CONSULTATION ROW IS BORN WITH ITS REQUEST (TRIGGER)
-- ─────────────────────────────────────────────────────────────────────────────
-- Three code paths create consultation requests (client wizard, lawyer booking
-- modal, admin). A trigger on service_requests guarantees each gets exactly one
-- consultations row, whoever wrote it — the table can never be "dead" again.
-- The trigger only reads what the writers already put in metadata (mode,
-- day + time, duration, specialty); it invents nothing.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 3 — THE LAWYER'S NOTES ARE NOT A COLUMN THE CLIENT CAN SELECT
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS is row-level. A client who can read their own consultation row could
-- read any column of it through PostgREST. So the lawyer's private notes live
-- in consultation_notes (author-or-firm only, like lawyer_client_notes), and
-- `opinion_text` on the row is BY DEFINITION the delivered opinion
-- (`opinion_delivered_at` set in the same write). Drafts are notes.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 4 — CONVERT-TO-CASE HAPPENS ONCE, ENFORCED BY THE DATABASE
-- ─────────────────────────────────────────────────────────────────────────────
-- The case anchor on this platform is a service_requests row (Phase 1
-- decision). `service_requests.source_consultation_id` is UNIQUE: a second
-- conversion of the same consultation is a 23505, not a duplicate case.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 5 — CONTRACT DATES BECOME RADAR DEADLINES IN THE APPLICATION
-- ─────────────────────────────────────────────────────────────────────────────
-- contract_obligations.due_on is a date; the API creates the matching
-- public.deadlines row (kind 'contract', contract_id set) and links it back
-- through obligation.deadline_id — the same engine, reminders and outbox as
-- every other deadline. Renewal notices are just obligations of kind
-- 'renewal'. Nothing here computes a date.
--
-- Idempotent: every statement is IF NOT EXISTS / OR REPLACE / DROP-IF-EXISTS.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. helpers (same bodies as Phase 1/2/5 — re-declared so this file stands alone)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.can_access_case_row(p_owner uuid, p_firm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_owner is not null and p_owner = auth.uid())
      or (p_firm is not null and exists (
            select 1 from public.firm_members fm
             where fm.firm_id = p_firm and fm.user_id = auth.uid() and fm.status = 'active'));
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. consultations — adopt (0 rows) and complete
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.consultations alter column id set default gen_random_uuid()::text;

-- (columns the 20260518 table already has, restated so a partial database
--  such as the RLS harness cannot fail half-way; no-ops on production)
alter table public.consultations
  add column if not exists specialty    text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists metadata     jsonb not null default '{}'::jsonb,
  add column if not exists created_at   timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now();

alter table public.consultations
  add column if not exists firm_id                   uuid references public.firm_profiles(id) on delete set null,
  add column if not exists lawyer_client_id          uuid references public.lawyer_clients(id) on delete set null,
  add column if not exists duration_minutes          int check (duration_minutes between 5 and 480),
  add column if not exists ended_at                  timestamptz,
  add column if not exists outcome                   text,
  add column if not exists opinion_text              text,
  add column if not exists opinion_delivered_at      timestamptz,
  add column if not exists opinion_attachment_path   text,
  add column if not exists converted_case_request_id text references public.service_requests(id) on delete set null,
  add column if not exists fee_sar                   numeric(12,2) check (fee_sar is null or fee_sar >= 0),
  add column if not exists fee_paid                  boolean not null default false,
  add column if not exists cancelled_reason          text;

-- lifecycle: one vocabulary, checked. (The free-text status the 20260518 table
-- had was never written by anything; 0 rows on production.)
update public.consultations set status = 'requested'
 where status not in ('requested','scheduled','completed','cancelled','no_show');
alter table public.consultations alter column status set default 'requested';
alter table public.consultations drop constraint if exists consultations_status_check;
alter table public.consultations add constraint consultations_status_check
  check (status in ('requested','scheduled','completed','cancelled','no_show'));

alter table public.consultations drop constraint if exists consultations_outcome_check;
alter table public.consultations add constraint consultations_outcome_check
  check (outcome is null or outcome in ('advice_given','opinion_delivered','converted_to_case','no_action','referred'));

-- the delivered opinion is delivered — no half state
alter table public.consultations drop constraint if exists consultations_opinion_pair_check;
alter table public.consultations add constraint consultations_opinion_pair_check
  check ((opinion_text is null and opinion_attachment_path is null) or opinion_delivered_at is not null);

create index if not exists idx_consultations_lawyer_status on public.consultations (lawyer_user_id, status);
create index if not exists idx_consultations_firm          on public.consultations (firm_id) where firm_id is not null;
create index if not exists idx_consultations_requester     on public.consultations (requester_user_id);
create index if not exists idx_consultations_scheduled     on public.consultations (scheduled_at) where scheduled_at is not null;

drop trigger if exists trg_consultations_updated_at on public.consultations;
create trigger trg_consultations_updated_at before update on public.consultations
  for each row execute function public.handle_updated_at();

-- ── 1b. private notes (DECISION 3) ───────────────────────────────────────────
create table if not exists public.consultation_notes (
  id               uuid primary key default gen_random_uuid(),
  consultation_id  text not null references public.consultations(id) on delete cascade,
  author_user_id   uuid not null references auth.users(id) on delete cascade,
  visibility       text not null default 'private' check (visibility in ('private','firm')),
  body             text not null check (length(btrim(body)) > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_consultation_notes_consultation on public.consultation_notes (consultation_id, created_at desc);
drop trigger if exists trg_consultation_notes_updated_at on public.consultation_notes;
create trigger trg_consultation_notes_updated_at before update on public.consultation_notes
  for each row execute function public.handle_updated_at();

-- ── 1c. born with the request (DECISION 2) ──────────────────────────────────
create or replace function public.consultation_from_service_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_mode      text;
  v_sched     timestamptz;
  v_duration  int;
begin
  if new.type <> 'consultation' then return new; end if;

  v_mode := coalesce(nullif(new.metadata->>'mode',''), 'text');
  if v_mode not in ('ai','video','voice','text','in-person') then v_mode := 'text'; end if;

  -- lawyer booking modal: metadata.day (YYYY-MM-DD) + metadata.time (HH:MM), Riyadh wall clock
  begin
    if nullif(new.metadata->>'day','') is not null and nullif(new.metadata->>'time','') is not null then
      v_sched := ((new.metadata->>'day') || ' ' || (new.metadata->>'time'))::timestamp at time zone 'Asia/Riyadh';
    elsif nullif(new.metadata->>'scheduledAt','') is not null then
      v_sched := (new.metadata->>'scheduledAt')::timestamptz;
    end if;
  exception when others then
    v_sched := null;
  end;

  begin
    v_duration := nullif(new.metadata->>'duration','')::int;
  exception when others then
    v_duration := null;
  end;
  if v_duration is not null and (v_duration < 5 or v_duration > 480) then v_duration := null; end if;

  insert into public.consultations
    (request_id, requester_user_id, lawyer_user_id, firm_id, lawyer_client_id,
     mode, specialty, scheduled_at, duration_minutes, status)
  values
    (new.id, new.requester_user_id, new.assigned_to, new.firm_id, new.lawyer_client_id,
     v_mode, nullif(new.metadata->>'specialty',''), v_sched, v_duration,
     case when new.assigned_to is not null and v_sched is not null then 'scheduled' else 'requested' end)
  on conflict (request_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_service_requests_consultation_insert on public.service_requests;
create trigger trg_service_requests_consultation_insert
  after insert on public.service_requests
  for each row execute function public.consultation_from_service_request();

-- assignment / cancellation on the request follow through to the working record
create or replace function public.consultation_follow_service_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type <> 'consultation' then return new; end if;
  update public.consultations c
     set lawyer_user_id = coalesce(new.assigned_to, c.lawyer_user_id),
         firm_id        = coalesce(c.firm_id, new.firm_id),
         status         = case
                            when new.status = 'cancelled' and c.status in ('requested','scheduled') then 'cancelled'
                            when c.status = 'requested' and new.assigned_to is not null and c.scheduled_at is not null then 'scheduled'
                            else c.status
                          end
   where c.request_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_service_requests_consultation_update on public.service_requests;
create trigger trg_service_requests_consultation_update
  after update of assigned_to, status, firm_id on public.service_requests
  for each row execute function public.consultation_follow_service_request();

-- existing consultation requests (0 on production today; harmless elsewhere)
insert into public.consultations (request_id, requester_user_id, lawyer_user_id, firm_id, lawyer_client_id, mode, specialty, status)
select sr.id, sr.requester_user_id, sr.assigned_to, sr.firm_id, sr.lawyer_client_id,
       case when coalesce(sr.metadata->>'mode','') in ('ai','video','voice','text','in-person') then sr.metadata->>'mode' else 'text' end,
       nullif(sr.metadata->>'specialty',''),
       case when sr.status = 'cancelled' then 'cancelled' when sr.status = 'completed' then 'completed' else 'requested' end
  from public.service_requests sr
 where sr.type = 'consultation'
   and not exists (select 1 from public.consultations c where c.request_id = sr.id);

-- ── 1d. convert once (DECISION 4) ───────────────────────────────────────────
alter table public.service_requests
  add column if not exists source_consultation_id text references public.consultations(id) on delete set null;
create unique index if not exists uq_service_requests_source_consultation
  on public.service_requests (source_consultation_id) where source_consultation_id is not null;

-- ── 1e. RLS — Phase 1 test on the lawyer side, the requester on theirs ──────
alter table public.consultations enable row level security;
drop policy if exists "participants read consultations"   on public.consultations;
drop policy if exists "participants insert consultations" on public.consultations;
drop policy if exists "participants update consultations" on public.consultations;
drop policy if exists "consultations select"              on public.consultations;
drop policy if exists "consultations insert"              on public.consultations;
drop policy if exists "consultations update"              on public.consultations;

create policy "consultations select" on public.consultations for select
  using (requester_user_id = auth.uid() or public.can_access_case_row(lawyer_user_id, firm_id));
create policy "consultations insert" on public.consultations for insert
  with check (requester_user_id = auth.uid() or public.can_access_case_row(lawyer_user_id, firm_id));
-- only the lawyer side changes the working record; a client cancels through the
-- request (the trigger above carries it over)
create policy "consultations update" on public.consultations for update
  using (public.can_access_case_row(lawyer_user_id, firm_id))
  with check (public.can_access_case_row(lawyer_user_id, firm_id));

alter table public.consultation_notes enable row level security;
drop policy if exists "consultation notes select" on public.consultation_notes;
drop policy if exists "consultation notes insert" on public.consultation_notes;
drop policy if exists "consultation notes update" on public.consultation_notes;
drop policy if exists "consultation notes delete" on public.consultation_notes;

create policy "consultation notes select" on public.consultation_notes for select
  using (
    author_user_id = auth.uid()
    or (visibility = 'firm' and exists (
          select 1 from public.consultations c
           where c.id = consultation_id
             and c.firm_id is not null
             and public.can_access_case_row(null, c.firm_id)))
  );
-- a note is written by its author on a consultation the author can work on
create policy "consultation notes insert" on public.consultation_notes for insert
  with check (
    author_user_id = auth.uid()
    and exists (select 1 from public.consultations c
                 where c.id = consultation_id
                   and public.can_access_case_row(c.lawyer_user_id, c.firm_id))
  );
create policy "consultation notes update" on public.consultation_notes for update
  using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());
create policy "consultation notes delete" on public.consultation_notes for delete
  using (author_user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. contracts — adopt (0 rows) and complete
-- ═════════════════════════════════════════════════════════════════════════════
-- the 20260518 participant policies name assigned_user_id; drop before renaming
drop policy if exists "participants read contracts"   on public.contracts;
drop policy if exists "participants insert contracts" on public.contracts;
drop policy if exists "participants update contracts" on public.contracts;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'contracts' and column_name = 'assigned_user_id')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'contracts' and column_name = 'owner_user_id') then
    alter table public.contracts rename column assigned_user_id to owner_user_id;
  end if;
end $$;

alter table public.contracts alter column id set default gen_random_uuid()::text;

-- (20260518 columns restated for a partial database; no-ops on production)
alter table public.contracts
  add column if not exists document_path text,
  add column if not exists metadata      jsonb not null default '{}'::jsonb,
  add column if not exists created_at    timestamptz not null default now(),
  add column if not exists updated_at    timestamptz not null default now();

alter table public.contracts
  add column if not exists owner_user_id        uuid references auth.users(id) on delete set null,
  add column if not exists firm_id              uuid references public.firm_profiles(id) on delete set null,
  add column if not exists lawyer_client_id     uuid references public.lawyer_clients(id) on delete set null,
  add column if not exists title               text not null default '',
  add column if not exists counterparty_name   text,
  add column if not exists value_sar           numeric(14,2) check (value_sar is null or value_sar >= 0),
  add column if not exists currency            text not null default 'SAR',
  add column if not exists starts_on           date,
  add column if not exists ends_on             date,
  add column if not exists auto_renew          boolean not null default false,
  add column if not exists renewal_notice_days int not null default 30 check (renewal_notice_days between 0 and 365),
  add column if not exists signed_on           date,
  add column if not exists current_version_id  uuid,
  add column if not exists notes               text not null default '';

alter table public.contracts alter column contract_type set default 'other';
update public.contracts set contract_type = 'other'
 where contract_type not in ('service_agreement','fee_agreement','power_of_attorney','nda','employment','lease','supply','partnership','other');
alter table public.contracts drop constraint if exists contracts_contract_type_check;
alter table public.contracts add constraint contracts_contract_type_check
  check (contract_type in ('service_agreement','fee_agreement','power_of_attorney','nda','employment','lease','supply','partnership','other'));

update public.contracts set status = 'draft'
 where status not in ('draft','under_review','pending_signature','active','expired','terminated','cancelled');
alter table public.contracts drop constraint if exists contracts_status_check;
alter table public.contracts add constraint contracts_status_check
  check (status in ('draft','under_review','pending_signature','active','expired','terminated','cancelled'));

alter table public.contracts drop constraint if exists contracts_dates_check;
alter table public.contracts add constraint contracts_dates_check
  check (starts_on is null or ends_on is null or ends_on >= starts_on);

create index if not exists idx_contracts_owner_status on public.contracts (owner_user_id, status);
create index if not exists idx_contracts_firm         on public.contracts (firm_id) where firm_id is not null;
create index if not exists idx_contracts_client       on public.contracts (client_user_id) where client_user_id is not null;
create index if not exists idx_contracts_ends_on      on public.contracts (ends_on) where ends_on is not null;

drop trigger if exists trg_contracts_updated_at on public.contracts;
create trigger trg_contracts_updated_at before update on public.contracts
  for each row execute function public.handle_updated_at();

-- ── 2a. access helpers (SECURITY DEFINER — the recursion-safe pattern) ──────
create or replace function public.can_access_contract(p_contract text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and (public.can_access_case_row(c.owner_user_id, c.firm_id)
            or (c.client_user_id is not null and c.client_user_id = auth.uid())));
$$;

create or replace function public.can_manage_contract(p_contract text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contracts c
     where c.id = p_contract
       and public.can_access_case_row(c.owner_user_id, c.firm_id));
$$;

-- ── 2b. versions — one row per file (item 114) ──────────────────────────────
create table if not exists public.contract_versions (
  id            uuid primary key default gen_random_uuid(),
  contract_id   text not null references public.contracts(id) on delete cascade,
  version_no    int  not null check (version_no >= 1),
  label         text not null default 'draft' check (label in ('draft','revised','final','signed')),
  file_name     text not null,
  storage_path  text not null,          -- object key in the existing `documents` bucket
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by   uuid references auth.users(id) on delete set null,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  constraint uq_contract_versions_no unique (contract_id, version_no)
);
create index if not exists idx_contract_versions_contract on public.contract_versions (contract_id, version_no desc);

alter table public.contracts drop constraint if exists contracts_current_version_fk;
alter table public.contracts add constraint contracts_current_version_fk
  foreign key (current_version_id) references public.contract_versions(id) on delete set null;

-- ── 2c. parties — no national ids here (Phase 2 rule: hash-only, and only on
--        lawyer_clients); link the card instead ──────────────────────────────
create table if not exists public.contract_parties (
  id                      uuid primary key default gen_random_uuid(),
  contract_id             text not null references public.contracts(id) on delete cascade,
  role                    text not null default 'second_party'
                            check (role in ('first_party','second_party','guarantor','witness','other')),
  party_kind              text not null default 'counterparty'
                            check (party_kind in ('client','counterparty','firm')),
  name                    text not null check (length(btrim(name)) > 0),
  entity_type             text not null default 'company'
                            check (entity_type in ('individual','company','government','other')),
  lawyer_client_id        uuid references public.lawyer_clients(id) on delete set null,
  commercial_register_no  text check (commercial_register_no is null or commercial_register_no ~ '^[0-9]{10}$'),
  contact_phone           text,
  contact_email           text,
  position                int not null default 0,
  created_at              timestamptz not null default now()
);
create index if not exists idx_contract_parties_contract on public.contract_parties (contract_id, position);

-- ── 2d. obligations — dates that become deadlines (items 116 · 117) ────────
create table if not exists public.contract_obligations (
  id                    uuid primary key default gen_random_uuid(),
  contract_id           text not null references public.contracts(id) on delete cascade,
  title                 text not null check (length(btrim(title)) > 0),
  kind                  text not null default 'other'
                          check (kind in ('delivery','payment','notice','renewal','termination','other')),
  due_on                date not null,
  responsible_party_id  uuid references public.contract_parties(id) on delete set null,
  status                text not null default 'pending' check (status in ('pending','done','missed','cancelled')),
  deadline_id           uuid,                 -- FK added below, deadlines may be absent on a partial database
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_contract_obligations_contract on public.contract_obligations (contract_id, due_on);
drop trigger if exists trg_contract_obligations_updated_at on public.contract_obligations;
create trigger trg_contract_obligations_updated_at before update on public.contract_obligations
  for each row execute function public.handle_updated_at();

-- ── 2e. payment schedule (item 117) — a schedule, not a charge ─────────────
create table if not exists public.contract_payments (
  id           uuid primary key default gen_random_uuid(),
  contract_id  text not null references public.contracts(id) on delete cascade,
  label        text not null check (length(btrim(label)) > 0),
  stage        text not null default 'milestone' check (stage in ('advance','milestone','final','other')),
  amount_sar   numeric(14,2) not null check (amount_sar > 0),
  due_on       date,
  status       text not null default 'pending' check (status in ('pending','paid','overdue','cancelled')),
  paid_on      date,
  position     int not null default 0,
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint contract_payments_paid_pair_check check (status <> 'paid' or paid_on is not null)
);
create index if not exists idx_contract_payments_contract on public.contract_payments (contract_id, position, due_on);
drop trigger if exists trg_contract_payments_updated_at on public.contract_payments;
create trigger trg_contract_payments_updated_at before update on public.contract_payments
  for each row execute function public.handle_updated_at();

-- ── 2f. the radar link (DECISION 5) ─────────────────────────────────────────
do $$ begin
  if to_regclass('public.deadlines') is not null then
    alter table public.deadlines add column if not exists contract_id text references public.contracts(id) on delete cascade;
    create index if not exists idx_deadlines_contract on public.deadlines (contract_id) where contract_id is not null;
    alter table public.contract_obligations drop constraint if exists contract_obligations_deadline_fk;
    alter table public.contract_obligations add constraint contract_obligations_deadline_fk
      foreign key (deadline_id) references public.deadlines(id) on delete set null;
  end if;
end $$;

-- ── 2g. RLS ─────────────────────────────────────────────────────────────────
alter table public.contracts enable row level security;
drop policy if exists "contracts select" on public.contracts;
drop policy if exists "contracts insert" on public.contracts;
drop policy if exists "contracts update" on public.contracts;
drop policy if exists "contracts delete" on public.contracts;
create policy "contracts select" on public.contracts for select
  using (public.can_access_case_row(owner_user_id, firm_id)
         or (client_user_id is not null and client_user_id = auth.uid()));
create policy "contracts insert" on public.contracts for insert
  with check (public.can_access_case_row(owner_user_id, firm_id));
create policy "contracts update" on public.contracts for update
  using (public.can_access_case_row(owner_user_id, firm_id))
  with check (public.can_access_case_row(owner_user_id, firm_id));
create policy "contracts delete" on public.contracts for delete
  using (owner_user_id = auth.uid());

alter table public.contract_versions enable row level security;
drop policy if exists "contract versions select" on public.contract_versions;
drop policy if exists "contract versions insert" on public.contract_versions;
drop policy if exists "contract versions delete" on public.contract_versions;
create policy "contract versions select" on public.contract_versions for select
  using (public.can_access_contract(contract_id));
create policy "contract versions insert" on public.contract_versions for insert
  with check (public.can_manage_contract(contract_id) and (uploaded_by is null or uploaded_by = auth.uid()));
create policy "contract versions delete" on public.contract_versions for delete
  using (public.can_manage_contract(contract_id));

alter table public.contract_parties enable row level security;
drop policy if exists "contract parties select" on public.contract_parties;
drop policy if exists "contract parties write"  on public.contract_parties;
create policy "contract parties select" on public.contract_parties for select
  using (public.can_access_contract(contract_id));
create policy "contract parties write" on public.contract_parties for all
  using (public.can_manage_contract(contract_id))
  with check (public.can_manage_contract(contract_id));

alter table public.contract_obligations enable row level security;
drop policy if exists "contract obligations select" on public.contract_obligations;
drop policy if exists "contract obligations write"  on public.contract_obligations;
create policy "contract obligations select" on public.contract_obligations for select
  using (public.can_access_contract(contract_id));
create policy "contract obligations write" on public.contract_obligations for all
  using (public.can_manage_contract(contract_id))
  with check (public.can_manage_contract(contract_id));

alter table public.contract_payments enable row level security;
drop policy if exists "contract payments select" on public.contract_payments;
drop policy if exists "contract payments write"  on public.contract_payments;
create policy "contract payments select" on public.contract_payments for select
  using (public.can_access_contract(contract_id));
create policy "contract payments write" on public.contract_payments for all
  using (public.can_manage_contract(contract_id))
  with check (public.can_manage_contract(contract_id));

-- =============================================================================
-- NOT DONE HERE, ON PURPOSE
-- • No video/meeting infrastructure (item 109) — nothing to store for it.
-- • No invoice/ledger: contract_payments is a schedule the lawyer tracks by
--   hand; money movement is Phase 4 (blocked by owner question 3).
-- • Nothing computes a renewal or obligation deadline in SQL — the API does,
--   through deadlineEngine.ts, and writes public.deadlines (DECISION 5).
-- • The three legacy service_requests.type values for "contract" are left in
--   place; the rebuilt screens read public.contracts and nothing else.
-- =============================================================================
