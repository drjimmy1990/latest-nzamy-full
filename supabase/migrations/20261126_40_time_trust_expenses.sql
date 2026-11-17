-- =============================================================================
-- Migration: 20261126_40_time_trust_expenses.sql
-- =============================================================================
-- PURPOSE (owner TODO 2026-11-17, row 10 F3/F4; batch l6-ledger)
--   «time_entries → fee statement; client_trust_ledger; lawyer_expenses;
--   void-with-reason». Three NEW finance tables. Nothing existing holds the
--   same data:
--     * public.work_sessions (20260906) is the pomodoro log — per user, per
--       task, no case, no client, no rate, no billable flag. It is NOT
--       changed; a time entry may point at the session it was made from
--       (time_entries.work_session_id, one live entry per session).
--     * public.legal_ledger_entries (20261025_33) is the outgoing/incoming
--       DOCUMENT register, not money.
--     * public.payments holds issued invoices (l6-invoice's area). A time
--       entry or an expense that went into an invoice carries its id
--       (billed_payment_id) — the invoice tables are not touched.
--
--   1. public.time_entries — work done for a case and/or a client card:
--        work_date, duration_min (1..1440), description, hourly_rate_halalas,
--        amount_halalas = round(duration_min × rate / 60) (generated, stored),
--        billable, work_session_id (the pomodoro session it came from).
--   2. public.lawyer_expenses — money the office spent for a case/client:
--        spent_on, category, description, amount_halalas, billable,
--        receipt_path (an object in the private `documents` bucket, under the
--        writer's own uid folder).
--   3. public.client_trust_ledger — «أمانات العميل»: money received on behalf
--      of a client card (deposit) and paid out of it (disbursement). The
--      running balance is public.client_trust_balance(card) — a disbursement
--      that takes it below zero is allowed only after the writer confirmed the
--      warning (negative_ack = true; the API asks first).
--   4. VOID WITH REASON instead of delete, on all three: no DELETE / TRUNCATE
--      for sessions; voided_at + void_reason (3..500 characters) are set
--      together, voided_by is stamped by the guard trigger, and a voided row
--      never changes again. Trust rows cannot be edited at all — only voided.
--      Time and expense rows are editable by their writer while not voided and
--      not billed.
--
-- WHO SEES WHAT (RLS, TO authenticated — ticket S3 «fees only for author,
--   partners, finance manager», src/lib/services/clientFeeVisibility.ts):
--   * public.can_read_firm_finance(firm): the caller owns the firm, or is an
--     ACTIVE member with role managing_partner, partner or finance_manager.
--     NOT can_access_case_row (every active member — secretaries, trainees).
--   * time_entries / lawyer_expenses: the writer, or a finance role of the
--     row's firm. Insert: created_by = caller and finance_target_ok(case,
--     client, firm) — a case the caller works on (case_row_scope_ok, firm =
--     the case's firm) and/or a client card he owns or that belongs to a firm
--     he is active in (firm = the card's firm). Case and card must share the
--     firm. No row can be planted into another firm or case.
--   * client_trust_ledger: the writer, the card's owner, or a finance role of
--     the row's firm (trust_reader_ok). Written only by the card's owner or a
--     finance role of the card's firm (trust_target_ok); firm = the card's.
--   * Restricted cases (20261125_40): each table gets the RESTRICTIVE SELECT
--     policy «restricted case rows: case team only» —
--     (case_request_id is null or case_visible(case_request_id)). A finance
--     manager outside a restricted case's team does not see its rows, so firm
--     totals exclude them. client_trust_balance() counts every live row of
--     the card (the balance is the client's, not the case's).
--
-- HOW TO RUN (BEFORE the deploy — the new routes read these tables; the old
--   code never touches them, so running it early is safe):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261126_40_time_trust_expenses.sql
--   Expect: NOTICE  20261126_40 verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261125_40_restricted_cases.sql (case_visible) and
--   20261025_31_dashboard_notes.sql (case_row_scope_ok). Re-runnable
--   (if not exists / create or replace / drop policy if exists).
--
-- ROLLBACK (manual; drops the three registers and their data):
--   drop table if exists public.time_entries, public.lawyer_expenses, public.client_trust_ledger;
--   drop function if exists public.finance_row_guard(), public.client_trust_balance(uuid),
--     public.trust_target_ok(uuid, text, uuid), public.trust_reader_ok(uuid, uuid),
--     public.finance_target_ok(text, uuid, uuid), public.can_read_firm_finance(uuid);
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $pre$
begin
  if to_regprocedure('public.case_row_scope_ok(text,uuid)') is null
     or to_regprocedure('public.case_worker_ok(text,uuid)') is null then
    raise exception '20261126_40: case_row_scope_ok / case_worker_ok missing — run 20261025_31_dashboard_notes.sql first';
  end if;
  if to_regprocedure('public.case_visible(text)') is null then
    raise exception '20261126_40: public.case_visible(text) missing — run 20261125_40_restricted_cases.sql first';
  end if;
  if to_regclass('public.lawyer_clients') is null or to_regclass('public.firm_members') is null
     or to_regclass('public.firm_profiles') is null or to_regclass('public.service_requests') is null then
    raise exception '20261126_40: lawyer_clients / firm_members / firm_profiles / service_requests missing — run 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
end
$pre$;


-- ── 1. Who may read a firm's money ──────────────────────────────────────────
create or replace function public.can_read_firm_finance(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_firm is not null and auth.uid() is not null and (
    exists (select 1 from public.firm_profiles fp where fp.id = p_firm and fp.owner_user_id = auth.uid())
    or exists (select 1 from public.firm_members m
                where m.firm_id = p_firm and m.user_id = auth.uid() and m.status = 'active'
                  and m.role in ('managing_partner', 'partner', 'finance_manager')));
$$;

comment on function public.can_read_firm_finance(uuid) is
  'l6-ledger (20261126_40): the CALLER owns firm p_firm or is its ACTIVE managing_partner / partner / finance_manager (ticket S3: fees for the author, partners and the finance manager only).';

-- A time entry / expense target: a case the caller works on and/or a client
-- card he may use; p_firm must be the case's firm and the card's firm.
create or replace function public.finance_target_ok(p_case text, p_client uuid, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and (p_case is not null or p_client is not null)
     and (p_case is null or public.case_row_scope_ok(p_case, p_firm))
     and (p_client is null or exists (
            select 1 from public.lawyer_clients c
             where c.id = p_client
               and c.firm_id is not distinct from p_firm
               and (c.owner_user_id = auth.uid()
                    or (c.firm_id is not null and (
                          exists (select 1 from public.firm_members m
                                   where m.firm_id = c.firm_id and m.user_id = auth.uid() and m.status = 'active')
                          or exists (select 1 from public.firm_profiles fp
                                      where fp.id = c.firm_id and fp.owner_user_id = auth.uid()))))));
$$;

comment on function public.finance_target_ok(text, uuid, uuid) is
  'l6-ledger (20261126_40): WITH CHECK of time_entries / lawyer_expenses. Case: case_row_scope_ok (caller works on it, firm = the case firm). Card: the caller owns it or is active in its firm, and firm = the card firm. At least one of the two.';

-- Who reads a client card's trust account.
create or replace function public.trust_reader_ok(p_client uuid, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.can_read_firm_finance(p_firm)
    or exists (select 1 from public.lawyer_clients c where c.id = p_client and c.owner_user_id = auth.uid()));
$$;

comment on function public.trust_reader_ok(uuid, uuid) is
  'l6-ledger (20261126_40): the caller owns client card p_client, or holds a finance role in firm p_firm.';

-- Who writes into a client card's trust account (and on which case).
create or replace function public.trust_target_ok(p_client uuid, p_case text, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and p_client is not null
     and exists (
       select 1 from public.lawyer_clients c
        where c.id = p_client
          and c.firm_id is not distinct from p_firm
          and (c.owner_user_id = auth.uid() or public.can_read_firm_finance(c.firm_id)))
     and (p_case is null or exists (
       select 1 from public.service_requests sr
        where sr.id = p_case
          and sr.firm_id is not distinct from p_firm
          and (public.case_worker_ok(p_case, auth.uid()) or public.can_read_firm_finance(p_firm))));
$$;

comment on function public.trust_target_ok(uuid, text, uuid) is
  'l6-ledger (20261126_40): WITH CHECK of client_trust_ledger. The card''s owner or a finance role of the card''s firm; firm = the card firm; an optional case of that same firm the caller works on (or reads as finance).';


-- ── 2. The tables ────────────────────────────────────────────────────────────
create table if not exists public.time_entries (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid references auth.users(id) on delete set null,
  firm_id              uuid references public.firm_profiles(id) on delete set null,
  case_request_id      text references public.service_requests(id) on delete set null,
  lawyer_client_id     uuid references public.lawyer_clients(id) on delete set null,
  work_date            date not null default ((now() at time zone 'Asia/Riyadh')::date),
  duration_min         int not null check (duration_min between 1 and 1440),
  description          text not null check (length(btrim(description)) > 0 and length(description) <= 1000),
  hourly_rate_halalas  bigint not null default 0 check (hourly_rate_halalas between 0 and 100000000),
  amount_halalas       bigint generated always as (round(duration_min::numeric * hourly_rate_halalas / 60)::bigint) stored,
  billable             boolean not null default true,
  work_session_id      uuid,
  billed_payment_id    text,
  billed_at            timestamptz,
  voided_at            timestamptz,
  voided_by            uuid references auth.users(id) on delete set null,
  void_reason          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint time_entries_void_pair check ((voided_at is null) = (void_reason is null)),
  constraint time_entries_void_reason check (void_reason is null or length(btrim(void_reason)) between 3 and 500)
);

comment on table public.time_entries is
  'سجل الوقت (l6-ledger، المالك F3/F4): عمل على قضية و/أو موكل، بالمدة والسعر بالساعة، قابل للفوترة أو لا. يدخل «بيان الأتعاب». لا حذف — إلغاء بسبب (voided_at + void_reason). firm_id = مكتب القضية/البطاقة.';

create table if not exists public.lawyer_expenses (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid references auth.users(id) on delete set null,
  firm_id              uuid references public.firm_profiles(id) on delete set null,
  case_request_id      text references public.service_requests(id) on delete set null,
  lawyer_client_id     uuid references public.lawyer_clients(id) on delete set null,
  spent_on             date not null default ((now() at time zone 'Asia/Riyadh')::date),
  category             text not null check (category in ('court_fees', 'government_fees', 'travel', 'translation',
                                                         'notary', 'expert', 'printing_courier', 'other')),
  description          text not null check (length(btrim(description)) > 0 and length(description) <= 1000),
  amount_halalas       bigint not null check (amount_halalas between 1 and 99999999999),
  billable             boolean not null default true,
  receipt_path         text check (receipt_path is null or (length(receipt_path) between 3 and 500 and receipt_path !~ '\.\.')),
  billed_payment_id    text,
  billed_at            timestamptz,
  voided_at            timestamptz,
  voided_by            uuid references auth.users(id) on delete set null,
  void_reason          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint lawyer_expenses_void_pair check ((voided_at is null) = (void_reason is null)),
  constraint lawyer_expenses_void_reason check (void_reason is null or length(btrim(void_reason)) between 3 and 500)
);

comment on table public.lawyer_expenses is
  'مصروفات المكتب على قضية/موكل (l6-ledger، المالك F3/F4): تصنيف، مبلغ بالهللة، إيصال في مخزن documents الخاص، قابل للفوترة. لا حذف — إلغاء بسبب.';

create table if not exists public.client_trust_ledger (
  id                   uuid primary key default gen_random_uuid(),
  created_by           uuid references auth.users(id) on delete set null,
  firm_id              uuid references public.firm_profiles(id) on delete set null,
  lawyer_client_id     uuid references public.lawyer_clients(id) on delete set null,
  case_request_id      text references public.service_requests(id) on delete set null,
  kind                 text not null check (kind in ('deposit', 'disbursement')),
  amount_halalas       bigint not null check (amount_halalas between 1 and 99999999999),
  occurred_on          date not null default ((now() at time zone 'Asia/Riyadh')::date),
  description          text not null check (length(btrim(description)) > 0 and length(description) <= 1000),
  reference            text not null default '' check (length(reference) <= 200),
  negative_ack         boolean not null default false,
  voided_at            timestamptz,
  voided_by            uuid references auth.users(id) on delete set null,
  void_reason          text,
  created_at           timestamptz not null default now(),
  constraint client_trust_ledger_void_pair check ((voided_at is null) = (void_reason is null)),
  constraint client_trust_ledger_void_reason check (void_reason is null or length(btrim(void_reason)) between 3 and 500)
);

comment on table public.client_trust_ledger is
  'أمانات العميل (l6-ledger، المالك F3/F4): مبالغ مستلمة لحساب موكل (deposit) ومصروفة منها (disbursement). الرصيد = client_trust_balance(). لا تعديل ولا حذف — إلغاء بسبب فقط.';

-- billed_payment_id → payments(id) when the invoices table is installed.
do $fk$
begin
  if to_regclass('public.payments') is not null then
    if not exists (select 1 from pg_constraint where conname = 'time_entries_billed_payment_fk') then
      alter table public.time_entries add constraint time_entries_billed_payment_fk
        foreign key (billed_payment_id) references public.payments(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'lawyer_expenses_billed_payment_fk') then
      alter table public.lawyer_expenses add constraint lawyer_expenses_billed_payment_fk
        foreign key (billed_payment_id) references public.payments(id) on delete set null;
    end if;
  else
    raise notice '20261126_40: public.payments missing — billed_payment_id kept without a foreign key';
  end if;
end
$fk$;

create index if not exists idx_time_entries_creator on public.time_entries (created_by, work_date desc);
create index if not exists idx_time_entries_firm    on public.time_entries (firm_id, work_date desc) where firm_id is not null;
create index if not exists idx_time_entries_case    on public.time_entries (case_request_id, work_date desc) where case_request_id is not null;
create index if not exists idx_time_entries_client  on public.time_entries (lawyer_client_id, work_date desc) where lawyer_client_id is not null;
create unique index if not exists uq_time_entries_work_session
  on public.time_entries (work_session_id) where work_session_id is not null and voided_at is null;

create index if not exists idx_lawyer_expenses_creator on public.lawyer_expenses (created_by, spent_on desc);
create index if not exists idx_lawyer_expenses_firm    on public.lawyer_expenses (firm_id, spent_on desc) where firm_id is not null;
create index if not exists idx_lawyer_expenses_case    on public.lawyer_expenses (case_request_id, spent_on desc) where case_request_id is not null;
create index if not exists idx_lawyer_expenses_client  on public.lawyer_expenses (lawyer_client_id, spent_on desc) where lawyer_client_id is not null;

create index if not exists idx_client_trust_client  on public.client_trust_ledger (lawyer_client_id, occurred_on desc);
create index if not exists idx_client_trust_firm    on public.client_trust_ledger (firm_id, occurred_on desc) where firm_id is not null;
create index if not exists idx_client_trust_creator on public.client_trust_ledger (created_by, occurred_on desc);


-- ── 3. The guard: void with reason, voided rows are final, writer-only edits ─
create or replace function public.finance_row_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reason text;
  v_uid    uuid := auth.uid();
  -- columns anyone allowed to UPDATE may change without being the writer
  -- (amount_halalas is GENERATED: NULL in NEW inside a BEFORE trigger)
  v_free   text[] := array['billed_payment_id', 'billed_at', 'updated_at', 'voided_at', 'voided_by', 'void_reason',
                           'amount_halalas'];
begin
  if old.voided_at is not null then
    raise exception 'this row was voided on % — a voided row never changes', old.voided_at
      using errcode = '55000';
  end if;

  -- Voiding: only the void columns move, whatever else the statement carried.
  if new.voided_at is not null then
    v_reason := btrim(coalesce(new.void_reason, ''));
    if length(v_reason) < 3 or length(v_reason) > 500 then
      raise exception 'a void needs a reason of 3..500 characters' using errcode = '23514';
    end if;
    new := old;
    new.voided_at := now();
    new.voided_by := v_uid;
    new.void_reason := v_reason;
    return new;
  end if;

  if tg_table_name = 'client_trust_ledger' then
    raise exception 'a trust ledger entry cannot be edited — void it with a reason and record a new one'
      using errcode = '42501';
  end if;

  if new.void_reason is not null then
    raise exception 'void_reason is set only together with voided_at' using errcode = '23514';
  end if;

  -- Content edits: the writer only, and only while the row is not billed.
  -- An operator (no session uid) is not limited here.
  if v_uid is not null
     and (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free)
     and (old.created_by is distinct from v_uid or old.billed_payment_id is not null) then
    raise exception 'only the writer edits this row, and only before it is billed'
      using errcode = '42501';
  end if;

  if tg_table_name = 'lawyer_expenses' and v_uid is not null
     and (to_jsonb(new) ->> 'receipt_path') is distinct from (to_jsonb(old) ->> 'receipt_path')
     and (to_jsonb(new) ->> 'receipt_path') is not null
     and split_part(to_jsonb(new) ->> 'receipt_path', '/', 1) <> v_uid::text then
    raise exception 'a receipt must be stored under the writer''s own folder' using errcode = '42501';
  end if;

  if new.billed_payment_id is distinct from old.billed_payment_id then
    new.billed_at := case when new.billed_payment_id is null then null else now() end;
  else
    new.billed_at := old.billed_at;
  end if;
  return new;
end;
$$;

comment on function public.finance_row_guard() is
  'l6-ledger (20261126_40): BEFORE UPDATE on time_entries / lawyer_expenses / client_trust_ledger. A voided row is final; a void needs a 3..500-character reason and changes nothing else (voided_by = the caller); trust rows are void-only; content edits by the writer only and only before billing; a receipt path stays in the writer''s folder.';

drop trigger if exists trg_00_time_entries_guard on public.time_entries;
create trigger trg_00_time_entries_guard before update on public.time_entries
  for each row execute function public.finance_row_guard();
drop trigger if exists trg_time_entries_updated_at on public.time_entries;
create trigger trg_time_entries_updated_at before update on public.time_entries
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_00_lawyer_expenses_guard on public.lawyer_expenses;
create trigger trg_00_lawyer_expenses_guard before update on public.lawyer_expenses
  for each row execute function public.finance_row_guard();
drop trigger if exists trg_lawyer_expenses_updated_at on public.lawyer_expenses;
create trigger trg_lawyer_expenses_updated_at before update on public.lawyer_expenses
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_00_client_trust_ledger_guard on public.client_trust_ledger;
create trigger trg_00_client_trust_ledger_guard before update on public.client_trust_ledger
  for each row execute function public.finance_row_guard();


-- ── 4. The trust balance (authorizes first; counts every live row) ──────────
create or replace function public.client_trust_balance(p_client uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_firm uuid;
  v_owner uuid;
begin
  select c.firm_id, c.owner_user_id into v_firm, v_owner
    from public.lawyer_clients c where c.id = p_client;
  if not found or auth.uid() is null
     or not (v_owner = auth.uid() or public.can_read_firm_finance(v_firm)) then
    raise exception 'not allowed to read this client''s trust account' using errcode = '42501';
  end if;
  return coalesce((
    select sum(case when t.kind = 'deposit' then t.amount_halalas else -t.amount_halalas end)
      from public.client_trust_ledger t
     where t.lawyer_client_id = p_client and t.voided_at is null), 0)::bigint;
end;
$$;

comment on function public.client_trust_balance(uuid) is
  'l6-ledger (20261126_40): deposits − disbursements (halalas) of every non-voided trust row of client card p_client. For the card''s owner or a finance role of its firm; 42501 otherwise.';


-- ── 4b. A voided invoice frees the lines it billed (merge fix, batch 6) ────
-- void_lawyer_invoice (20261126_30) sets payments.status = 'void'. The time
-- and expense lines that statement covered go back to «غير مفوتر» so they can
-- be billed again; the guard lets billed_payment_id/billed_at move (v_free).
create or replace function public.release_billed_lines_on_void()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.time_entries set billed_payment_id = null
   where billed_payment_id = new.id and voided_at is null;
  update public.lawyer_expenses set billed_payment_id = null
   where billed_payment_id = new.id and voided_at is null;
  return null;
end;
$$;
revoke all on function public.release_billed_lines_on_void() from public, anon, authenticated;

do $void$
begin
  if to_regclass('public.payments') is not null then
    drop trigger if exists trg_release_billed_lines_on_void on public.payments;
    create trigger trg_release_billed_lines_on_void
      after update of status on public.payments
      for each row
      when (new.status = 'void' and old.status is distinct from 'void')
      execute function public.release_billed_lines_on_void();
  end if;
end
$void$;


-- ── 5. RLS ───────────────────────────────────────────────────────────────────
alter table public.time_entries        enable row level security;
alter table public.lawyer_expenses     enable row level security;
alter table public.client_trust_ledger enable row level security;

-- time_entries
drop policy if exists "time entries readable by writer or firm finance" on public.time_entries;
create policy "time entries readable by writer or firm finance" on public.time_entries
  for select to authenticated
  using (created_by = auth.uid() or public.can_read_firm_finance(firm_id));
drop policy if exists "restricted case rows: case team only" on public.time_entries;
create policy "restricted case rows: case team only" on public.time_entries
  as restrictive for select to authenticated
  using (case_request_id is null or public.case_visible(case_request_id));
drop policy if exists "time entries insertable by case or client workers" on public.time_entries;
create policy "time entries insertable by case or client workers" on public.time_entries
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and voided_at is null
    and billed_payment_id is null
    and public.finance_target_ok(case_request_id, lawyer_client_id, firm_id)
  );
drop policy if exists "time entries updatable by writer or firm finance" on public.time_entries;
create policy "time entries updatable by writer or firm finance" on public.time_entries
  for update to authenticated
  using (created_by = auth.uid() or public.can_read_firm_finance(firm_id))
  with check (
    (created_by = auth.uid() and public.finance_target_ok(case_request_id, lawyer_client_id, firm_id))
    or public.can_read_firm_finance(firm_id)
  );

-- lawyer_expenses
drop policy if exists "expenses readable by writer or firm finance" on public.lawyer_expenses;
create policy "expenses readable by writer or firm finance" on public.lawyer_expenses
  for select to authenticated
  using (created_by = auth.uid() or public.can_read_firm_finance(firm_id));
drop policy if exists "restricted case rows: case team only" on public.lawyer_expenses;
create policy "restricted case rows: case team only" on public.lawyer_expenses
  as restrictive for select to authenticated
  using (case_request_id is null or public.case_visible(case_request_id));
drop policy if exists "expenses insertable by case or client workers" on public.lawyer_expenses;
create policy "expenses insertable by case or client workers" on public.lawyer_expenses
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and voided_at is null
    and billed_payment_id is null
    and (receipt_path is null or split_part(receipt_path, '/', 1) = auth.uid()::text)
    and public.finance_target_ok(case_request_id, lawyer_client_id, firm_id)
  );
drop policy if exists "expenses updatable by writer or firm finance" on public.lawyer_expenses;
create policy "expenses updatable by writer or firm finance" on public.lawyer_expenses
  for update to authenticated
  using (created_by = auth.uid() or public.can_read_firm_finance(firm_id))
  with check (
    (created_by = auth.uid() and public.finance_target_ok(case_request_id, lawyer_client_id, firm_id))
    or public.can_read_firm_finance(firm_id)
  );

-- client_trust_ledger
drop policy if exists "trust rows readable by writer, card owner or firm finance" on public.client_trust_ledger;
create policy "trust rows readable by writer, card owner or firm finance" on public.client_trust_ledger
  for select to authenticated
  using (created_by = auth.uid() or public.trust_reader_ok(lawyer_client_id, firm_id));
drop policy if exists "restricted case rows: case team only" on public.client_trust_ledger;
create policy "restricted case rows: case team only" on public.client_trust_ledger
  as restrictive for select to authenticated
  using (case_request_id is null or public.case_visible(case_request_id));
drop policy if exists "trust rows insertable by card owner or firm finance" on public.client_trust_ledger;
create policy "trust rows insertable by card owner or firm finance" on public.client_trust_ledger
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and voided_at is null
    and public.trust_target_ok(lawyer_client_id, case_request_id, firm_id)
  );
drop policy if exists "trust rows voidable by writer, card owner or firm finance" on public.client_trust_ledger;
create policy "trust rows voidable by writer, card owner or firm finance" on public.client_trust_ledger
  for update to authenticated
  using (created_by = auth.uid() or public.trust_reader_ok(lawyer_client_id, firm_id))
  with check (created_by = auth.uid() or public.trust_reader_ok(lawyer_client_id, firm_id));


-- ── 6. Privileges (no DELETE for sessions; firm/case/client/writer immovable) ─
revoke all on public.time_entries, public.lawyer_expenses, public.client_trust_ledger from public;
revoke all on function public.can_read_firm_finance(uuid) from public;
revoke all on function public.finance_target_ok(text, uuid, uuid) from public;
revoke all on function public.trust_reader_ok(uuid, uuid) from public;
revoke all on function public.trust_target_ok(uuid, text, uuid) from public;
revoke all on function public.client_trust_balance(uuid) from public;
revoke all on function public.finance_row_guard() from public;
do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.time_entries, public.lawyer_expenses, public.client_trust_ledger from anon;
    revoke all on function public.can_read_firm_finance(uuid) from anon;
    revoke all on function public.finance_target_ok(text, uuid, uuid) from anon;
    revoke all on function public.trust_reader_ok(uuid, uuid) from anon;
    revoke all on function public.trust_target_ok(uuid, text, uuid) from anon;
    revoke all on function public.client_trust_balance(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.time_entries, public.lawyer_expenses, public.client_trust_ledger from authenticated;

    grant select on public.time_entries to authenticated;
    grant insert (id, created_by, firm_id, case_request_id, lawyer_client_id, work_date, duration_min,
                  description, hourly_rate_halalas, billable, work_session_id)
      on public.time_entries to authenticated;
    grant update (work_date, duration_min, description, hourly_rate_halalas, billable,
                  billed_payment_id, voided_at, void_reason)
      on public.time_entries to authenticated;

    grant select on public.lawyer_expenses to authenticated;
    grant insert (id, created_by, firm_id, case_request_id, lawyer_client_id, spent_on, category,
                  description, amount_halalas, billable, receipt_path)
      on public.lawyer_expenses to authenticated;
    grant update (spent_on, category, description, amount_halalas, billable, receipt_path,
                  billed_payment_id, voided_at, void_reason)
      on public.lawyer_expenses to authenticated;

    grant select on public.client_trust_ledger to authenticated;
    grant insert (id, created_by, firm_id, lawyer_client_id, case_request_id, kind, amount_halalas,
                  occurred_on, description, reference, negative_ack)
      on public.client_trust_ledger to authenticated;
    grant update (voided_at, void_reason) on public.client_trust_ledger to authenticated;

    grant execute on function public.can_read_firm_finance(uuid) to authenticated;
    grant execute on function public.finance_target_ok(text, uuid, uuid) to authenticated;
    grant execute on function public.trust_reader_ok(uuid, uuid) to authenticated;
    grant execute on function public.trust_target_ok(uuid, text, uuid) to authenticated;
    grant execute on function public.client_trust_balance(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.time_entries, public.lawyer_expenses, public.client_trust_ledger to service_role;
    grant execute on function public.can_read_firm_finance(uuid) to service_role;
    grant execute on function public.finance_target_ok(text, uuid, uuid) to service_role;
    grant execute on function public.trust_reader_ok(uuid, uuid) to service_role;
    grant execute on function public.trust_target_ok(uuid, text, uuid) to service_role;
    grant execute on function public.client_trust_balance(uuid) to service_role;
  end if;
end
$grants$;


-- ── 7. Verify (raises) ───────────────────────────────────────────────────────
do $verify$
declare
  t   text;
  n   int;
  col text;
  f   text;
begin
  foreach t in array array['time_entries', 'lawyer_expenses', 'client_trust_ledger'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception '20261126_40 verify: RLS is off on public.%', t;
    end if;
    select count(*) into n from pg_policy where polrelid = ('public.' || t)::regclass and polpermissive;
    if n <> 3 then
      raise exception '20261126_40 verify: public.% carries % permissive policies, expected 3 (select, insert, update)', t, n;
    end if;
    if exists (select 1 from pg_policy where polrelid = ('public.' || t)::regclass and polcmd in ('d', '*')) then
      raise exception '20261126_40 verify: a DELETE (or ALL) policy exists on public.%', t;
    end if;
    if not exists (select 1 from pg_policy
                    where polrelid = ('public.' || t)::regclass and polname = 'restricted case rows: case team only'
                      and not polpermissive and polcmd = 'r'
                      and pg_get_expr(polqual, polrelid) ~ 'case_visible') then
      raise exception '20261126_40 verify: public.% has no restrictive case_visible SELECT policy', t;
    end if;
    if exists (select 1 from pg_policy p
                where p.polrelid = ('public.' || t)::regclass
                  and (p.polroles = '{0}'::oid[] or not ('authenticated'::regrole::oid = any (p.polroles)))) then
      raise exception '20261126_40 verify: a policy on public.% is not scoped to authenticated', t;
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass
                    and tgname = 'trg_00_' || t || '_guard' and not tgisinternal and tgenabled <> 'D') then
      raise exception '20261126_40 verify: the guard trigger is missing on public.%', t;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      if has_table_privilege('authenticated', 'public.' || t, 'DELETE')
         or has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE') then
        raise exception '20261126_40 verify: authenticated can DELETE/TRUNCATE public.%', t;
      end if;
      foreach col in array array['created_by', 'firm_id', 'case_request_id', 'lawyer_client_id', 'voided_by'] loop
        if has_column_privilege('authenticated', 'public.' || t, col, 'UPDATE') then
          raise exception '20261126_40 verify: authenticated can UPDATE public.%.%', t, col;
        end if;
      end loop;
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon')
       and has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception '20261126_40 verify: anon can read public.%', t;
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach col in array array['kind', 'amount_halalas', 'occurred_on', 'description', 'negative_ack'] loop
      if has_column_privilege('authenticated', 'public.client_trust_ledger', col, 'UPDATE') then
        raise exception '20261126_40 verify: authenticated can UPDATE client_trust_ledger.% (trust rows are void-only)', col;
      end if;
    end loop;
  end if;

  -- insert policies carry their scope check
  if exists (select 1 from pg_policy p
              where p.polrelid in ('public.time_entries'::regclass, 'public.lawyer_expenses'::regclass)
                and p.polcmd = 'a'
                and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'finance_target_ok') then
    raise exception '20261126_40 verify: a time/expense insert policy lacks finance_target_ok';
  end if;
  if exists (select 1 from pg_policy p
              where p.polrelid = 'public.client_trust_ledger'::regclass and p.polcmd = 'a'
                and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'trust_target_ok') then
    raise exception '20261126_40 verify: the trust insert policy lacks trust_target_ok';
  end if;

  foreach f in array array['public.can_read_firm_finance(uuid)', 'public.finance_target_ok(text, uuid, uuid)',
                           'public.trust_reader_ok(uuid, uuid)', 'public.trust_target_ok(uuid, text, uuid)',
                           'public.client_trust_balance(uuid)'] loop
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                       from pg_proc p where p.oid = to_regprocedure(f)), false) then
      raise exception '20261126_40 verify: % is not SECURITY DEFINER with an empty search_path', f;
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon')
       and has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '20261126_40 verify: anon can EXECUTE %', f;
    end if;
  end loop;
  if position('finance_manager' in pg_get_functiondef('public.can_read_firm_finance(uuid)'::regprocedure)) = 0
     or position('partner' in pg_get_functiondef('public.can_read_firm_finance(uuid)'::regprocedure)) = 0 then
    raise exception '20261126_40 verify: can_read_firm_finance does not name the finance roles';
  end if;

  raise notice '20261126_40 verify: OK — time_entries, lawyer_expenses, client_trust_ledger: RLS on, 3 authenticated policies + restricted-case policy each, finance roles only for colleagues, void-with-reason guard, no session DELETE, no guest privilege';
end
$verify$;

commit;
notify pgrst, 'reload schema';

select '20261126_40 time entries, client trust ledger, lawyer expenses (l6-ledger)' as step,
       to_regclass('public.time_entries') is not null
       and to_regclass('public.lawyer_expenses') is not null
       and to_regclass('public.client_trust_ledger') is not null
       and to_regprocedure('public.client_trust_balance(uuid)') is not null as ok;
