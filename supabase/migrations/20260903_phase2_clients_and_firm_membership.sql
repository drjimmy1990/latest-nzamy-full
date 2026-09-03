-- =============================================================================
-- Migration: 20260903_phase2_clients_and_firm_membership.sql
-- Phase:     2 — الموكلون والصلاحيات  (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §6)
-- Purpose:   A real clients table (with confidential notes), and the firm
--            membership model that Phase 1's RLS was written to consume but
--            nothing ever populated.
--
-- Closes (matrix rows): 79 · 80 · 81 · 170 · 193 (the table side; the
--                       conflict-check screen is wired in the next commit)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS REPLACES
-- ─────────────────────────────────────────────────────────────────────────────
-- «تعذّر حفظ الموكّل» has one cause: there is no clients table, so
-- POST /api/v1/lawyer/clients writes a `service_requests` row with
-- `requester_user_id: null` and `metadata.client = true`, and the only INSERT
-- policy on that table (20260518:152-154) is
-- `with check (requester_user_id = auth.uid())` → 42501, every time, for every
-- lawyer. A client is not a service request; it stops pretending to be one.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 1 — THE FIRM MEMBERSHIP MODEL, FINALLY POPULATED
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1's `can_access_case_row(owner, firm)` admits an ACTIVE `firm_members`
-- row — but a repository-wide search found NO code path that ever inserts one,
-- and the trigger that provisions `firm_profiles` on signup does not either. So
-- the firm arm has never fired for anyone, and a firm account cannot see its
-- own lawyers' work. Two additions:
--
--   • Every firm OWNER becomes a `managing_partner` member of their own firm,
--     by trigger on `firm_profiles` insert (plus a backfill for existing rows —
--     production holds zero today, so the backfill is documentation of intent).
--   • `service_requests.firm_id` (nullable) + a SELECT policy through
--     membership. A case created by a member carries the firm; the firm's other
--     active members can read it. Writers set it from the creator's membership
--     — solo lawyers keep NULL and nothing changes for them.
--
-- Adding colleagues (the invite path) is application code, not this file: the
-- existing "firm_members: firm owner can insert" policy (20260616) already
-- permits it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 2 — WHAT A CLIENT ROW MAY SAY ABOUT A PERSON
-- ─────────────────────────────────────────────────────────────────────────────
-- The national ID is stored ONLY as a SHA-256 hash of the normalised digits —
-- enough to detect the same person twice (the plan's `(firm_id,
-- national_id_hash)` uniqueness, and the conflict check), never enough to read
-- the number back. The application hashes before insert; this file never sees
-- a raw ID.
--
-- Two of the old free-text flags are NOT carried over: «bad» (صعب التعامل) and
-- «late_pay» (متأخر بالسداد). Report 2026-09-02 §32 recorded the data-
-- protection concern with keeping judgemental labels about a natural person
-- on file; lateness is a FACT the fee columns already state
-- (fee_paid_sar < fee_total_sar), not a label. The CHECK below refuses both
-- words, so an old client of the modal cannot re-introduce them.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 3 — A RECURSION BUG THIS FILE HAD TO FIX FIRST
-- ─────────────────────────────────────────────────────────────────────────────
-- Found while validating this migration against a throwaway Postgres with a
-- non-superuser role: the FIRST `select … from firm_members` by a member
-- failed with «infinite recursion detected in policy for relation
-- firm_members» (42P17). The policy "firm_members: active members can read
-- co-members" (20260616:394-402) selects `firm_members` from inside a
-- `firm_members` policy; 20260625 fixed that shape for profiles/groups and
-- never touched the four *_members tables. Nobody noticed because the table
-- has been empty — and because every Phase 1 route that looks up the caller's
-- firm through the RLS client does `const { data } = …` and drops the error,
-- so a firm_id silently came back NULL.
--
-- Fixed here for all four (firm, business, government, ngo) the same way
-- 20260625 did it: a SECURITY DEFINER helper answers «is the caller an active
-- member of this entity?» without re-entering the table's own policies.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 4 — NO DATA MIGRATION (plan §17 step 3)
-- ─────────────────────────────────────────────────────────────────────────────
-- Old `metadata.client = true` rows in `service_requests` are left exactly
-- where they are; the rewired screens stop reading them. Production's
-- transactional rows are disposable (owner-confirmed, and cleared 2026-09-02).
--
-- ⚠️ NOTHING IS DROPPED BY THIS FILE. Only `create table`, `alter table … add
--    column`, indexes, functions, triggers and policies. The legal library, the
--    accounts and the blog content are untouched.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 0. Shared helpers (idempotent repeats so this file applies on its own)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Same definition as 20260903_phase1_case_tables.sql; repeated so the policies
-- below cannot depend on the order the two files were applied in.
create or replace function public.can_access_case_row(p_owner uuid, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (p_owner is not null and p_owner = auth.uid())
    or (
      p_firm is not null
      and exists (
        select 1 from public.firm_members fm
        where fm.firm_id = p_firm
          and fm.user_id = auth.uid()
          and fm.status  = 'active'
      )
    );
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. lawyer_clients — الموكلون (matrix rows 79, 80, 81)
-- ═════════════════════════════════════════════════════════════════════════════
-- One row per client card a lawyer (or firm account) keeps. `client_user_id`
-- links the card to a platform account when the client has one; a card typed
-- in by hand has none, and that is a normal state, not a defect.
create table if not exists public.lawyer_clients (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid not null references auth.users(id) on delete cascade,
  firm_id                 uuid references public.firm_profiles(id) on delete set null,
  client_user_id          uuid references auth.users(id) on delete set null,
  client_type             text not null default 'individual'
                            check (client_type in ('individual', 'company')),
  name                    text not null check (length(btrim(name)) > 0),
  phone                   text,
  email                   text,
  city                    text,
  -- individual (row 80): هوية · وكالة · مدينة
  national_id_hash        text check (national_id_hash is null or national_id_hash ~ '^[0-9a-f]{64}$'),
  power_of_attorney_no    text,
  -- company (row 80): سجل تجاري · رقم ضريبي · رقم 700
  commercial_register_no  text,
  tax_number              text,
  unified_number_700      text,
  -- classification — see DECISION 2 for the two words deliberately absent
  flags                   text[] not null default '{}'
                            check (flags <@ array['vip','new','loyal','urgent','corporate','inactive']::text[]),
  rating                  smallint check (rating is null or rating between 1 and 5),
  -- financial position (row 81). NULL = no agreement on record, which is not 0.
  fee_total_sar           numeric(14,2) check (fee_total_sar is null or fee_total_sar >= 0),
  fee_paid_sar            numeric(14,2) check (fee_paid_sar is null or fee_paid_sar >= 0),
  first_engagement_on     date,
  status                  text not null default 'active'
                            check (status in ('active', 'inactive', 'archived')),
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- an advance without a total is unreadable on every screen (route comment,
  -- lawyer/clients/route.ts) — refuse it at the boundary that lasts
  constraint lawyer_clients_paid_needs_total
    check (fee_paid_sar is null or fee_total_sar is not null)
);

comment on table  public.lawyer_clients is 'الموكلون — one card per client a lawyer/firm keeps. Replaces service_requests rows flagged metadata.client (row 79).';
comment on column public.lawyer_clients.national_id_hash is 'SHA-256 hex of the normalised national ID. The raw number is never stored.';
comment on column public.lawyer_clients.flags is 'vip/new/loyal/urgent/corporate/inactive. «bad» and «late_pay» are refused on purpose — report 2026-09-02 §32.';

create index if not exists idx_lawyer_clients_owner  on public.lawyer_clients (owner_user_id);
create index if not exists idx_lawyer_clients_firm   on public.lawyer_clients (firm_id);
create index if not exists idx_lawyer_clients_user   on public.lawyer_clients (client_user_id);
create index if not exists idx_lawyer_clients_name   on public.lawyer_clients (lower(name));
create index if not exists idx_lawyer_clients_phone  on public.lawyer_clients (phone);

-- The plan's «قيد فريد (firm_id, national_id_hash)» — and its solo-lawyer
-- twin, because a lawyer with no firm still must not file the same person
-- twice. Partial, so cards without an ID never collide.
create unique index if not exists uq_lawyer_clients_firm_nid
  on public.lawyer_clients (firm_id, national_id_hash)
  where firm_id is not null and national_id_hash is not null;
create unique index if not exists uq_lawyer_clients_owner_nid
  on public.lawyer_clients (owner_user_id, national_id_hash)
  where firm_id is null and national_id_hash is not null;
-- Same rule for a company's commercial register.
create unique index if not exists uq_lawyer_clients_firm_cr
  on public.lawyer_clients (firm_id, commercial_register_no)
  where firm_id is not null and commercial_register_no is not null;
create unique index if not exists uq_lawyer_clients_owner_cr
  on public.lawyer_clients (owner_user_id, commercial_register_no)
  where firm_id is null and commercial_register_no is not null;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. lawyer_client_notes — الملاحظات السرية
-- ═════════════════════════════════════════════════════════════════════════════
-- `private` = the author alone. `firm` = the author's active colleagues too.
-- Nothing here is ever readable by the client the note is about.
create table if not exists public.lawyer_client_notes (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.lawyer_clients(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  firm_id         uuid references public.firm_profiles(id) on delete set null,
  body            text not null check (length(btrim(body)) > 0),
  visibility      text not null default 'private'
                    check (visibility in ('private', 'firm')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.lawyer_client_notes is 'ملاحظات المحامي السرية على موكّل — never visible to the client.';

create index if not exists idx_lawyer_client_notes_client on public.lawyer_client_notes (client_id);
create index if not exists idx_lawyer_client_notes_author on public.lawyer_client_notes (author_user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. service_requests — two nullable links
-- ═════════════════════════════════════════════════════════════════════════════
-- `lawyer_client_id`: the card a case belongs to, so «قضايا هذا الموكّل» stops
-- depending on the client having a platform account.
-- `firm_id`: the firm the creating lawyer was an active member of at creation
-- time (set by the API, never by the client). NULL for solo lawyers and for
-- every existing row — see DECISION 1.
alter table public.service_requests
  add column if not exists lawyer_client_id uuid references public.lawyer_clients(id) on delete set null;
alter table public.service_requests
  add column if not exists firm_id uuid references public.firm_profiles(id) on delete set null;

create index if not exists idx_service_requests_lawyer_client on public.service_requests (lawyer_client_id);
create index if not exists idx_service_requests_firm          on public.service_requests (firm_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. firm owner = managing_partner member of their own firm
-- ═════════════════════════════════════════════════════════════════════════════
-- (firm_id, user_id) had no uniqueness guarantee; the owner row needs one so
-- the trigger and the backfill are idempotent.
create unique index if not exists uq_firm_members_firm_user
  on public.firm_members (firm_id, user_id);

-- SECURITY DEFINER: this fires inside handle_new_user() (an auth trigger with
-- no auth.uid()), where the RLS policy "firm owner can insert" cannot pass.
create or replace function public.ensure_firm_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.firm_members (firm_id, user_id, role, status, accepted_at)
  values (new.id, new.owner_user_id, 'managing_partner', 'active', now())
  on conflict (firm_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_firm_profiles_owner_membership on public.firm_profiles;
create trigger trg_firm_profiles_owner_membership
  after insert on public.firm_profiles
  for each row execute function public.ensure_firm_owner_membership();

-- Backfill for firms created before this file. Production has zero today.
insert into public.firm_members (firm_id, user_id, role, status, accepted_at)
select fp.id, fp.owner_user_id, 'managing_partner', 'active', now()
  from public.firm_profiles fp
 where not exists (
   select 1 from public.firm_members fm
    where fm.firm_id = fp.id and fm.user_id = fp.owner_user_id
 );


-- ═════════════════════════════════════════════════════════════════════════════
-- 4b. The self-referencing "co-members" policies (DECISION 3)
-- ═════════════════════════════════════════════════════════════════════════════
-- One SECURITY DEFINER helper per member table. `stable` so the planner may
-- evaluate it once per row set; `set search_path = ''` as every helper here.
create or replace function public.is_active_firm_member(p_firm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_firm is not null and exists (
    select 1 from public.firm_members m
     where m.firm_id = p_firm and m.user_id = auth.uid() and m.status = 'active');
$$;

drop policy if exists "firm_members: active members can read co-members" on public.firm_members;
create policy "firm_members: active members can read co-members" on public.firm_members
  for select using (public.is_active_firm_member(firm_id));

-- The three sibling tables carry the identical bug. Guarded with to_regclass
-- so this file also applies on a database that never created them.
do $$
begin
  if to_regclass('public.business_members') is not null then
    create or replace function public.is_active_business_member(p_business uuid)
    returns boolean language sql stable security definer set search_path = '' as $f$
      select p_business is not null and exists (
        select 1 from public.business_members m
         where m.business_id = p_business and m.user_id = auth.uid() and m.status = 'active');
    $f$;
    drop policy if exists "business_members: active members can read co-members" on public.business_members;
    create policy "business_members: active members can read co-members" on public.business_members
      for select using (public.is_active_business_member(business_id));
  end if;

  if to_regclass('public.government_members') is not null then
    create or replace function public.is_active_government_member(p_gov uuid)
    returns boolean language sql stable security definer set search_path = '' as $f$
      select p_gov is not null and exists (
        select 1 from public.government_members m
         where m.gov_id = p_gov and m.user_id = auth.uid() and m.status = 'active');
    $f$;
    drop policy if exists "government_members: active members can read co-members" on public.government_members;
    create policy "government_members: active members can read co-members" on public.government_members
      for select using (public.is_active_government_member(gov_id));
  end if;

  if to_regclass('public.ngo_members') is not null then
    create or replace function public.is_active_ngo_member(p_ngo uuid)
    returns boolean language sql stable security definer set search_path = '' as $f$
      select p_ngo is not null and exists (
        select 1 from public.ngo_members m
         where m.ngo_id = p_ngo and m.user_id = auth.uid() and m.status = 'active');
    $f$;
    drop policy if exists "ngo_members: active members can read co-members" on public.ngo_members;
    create policy "ngo_members: active members can read co-members" on public.ngo_members
      for select using (public.is_active_ngo_member(ngo_id));
  end if;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. updated_at triggers
-- ═════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_lawyer_clients_updated_at on public.lawyer_clients;
create trigger trg_lawyer_clients_updated_at before update on public.lawyer_clients
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_lawyer_client_notes_updated_at on public.lawyer_client_notes;
create trigger trg_lawyer_client_notes_updated_at before update on public.lawyer_client_notes
  for each row execute function public.handle_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Row Level Security
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.lawyer_clients      enable row level security;
alter table public.lawyer_client_notes enable row level security;

-- ── lawyer_clients ───────────────────────────────────────────────────────────
-- The client themselves is deliberately NOT a reader: this row carries the
-- lawyer's classification of them.
drop policy if exists "lawyer clients readable by owner or firm"  on public.lawyer_clients;
create policy "lawyer clients readable by owner or firm" on public.lawyer_clients
  for select using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());

drop policy if exists "lawyer clients insertable by owner"        on public.lawyer_clients;
create policy "lawyer clients insertable by owner" on public.lawyer_clients
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "lawyer clients updatable by owner or firm" on public.lawyer_clients;
create policy "lawyer clients updatable by owner or firm" on public.lawyer_clients
  for update using (public.can_access_case_row(owner_user_id, firm_id))
          with check (public.can_access_case_row(owner_user_id, firm_id));

drop policy if exists "lawyer clients deletable by owner"         on public.lawyer_clients;
create policy "lawyer clients deletable by owner" on public.lawyer_clients
  for delete using (owner_user_id = auth.uid());

-- ── lawyer_client_notes ──────────────────────────────────────────────────────
drop policy if exists "client notes readable by author or firm" on public.lawyer_client_notes;
create policy "client notes readable by author or firm" on public.lawyer_client_notes
  for select using (
    author_user_id = auth.uid()
    or (visibility = 'firm' and public.can_access_case_row(author_user_id, firm_id))
    or public.is_admin()
  );

drop policy if exists "client notes insertable by author"        on public.lawyer_client_notes;
create policy "client notes insertable by author" on public.lawyer_client_notes
  for insert with check (
    author_user_id = auth.uid()
    -- and only on a client card the author may read
    and exists (
      select 1 from public.lawyer_clients c
       where c.id = lawyer_client_notes.client_id
         and public.can_access_case_row(c.owner_user_id, c.firm_id)
    )
  );

drop policy if exists "client notes updatable by author"         on public.lawyer_client_notes;
create policy "client notes updatable by author" on public.lawyer_client_notes
  for update using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());

drop policy if exists "client notes deletable by author"         on public.lawyer_client_notes;
create policy "client notes deletable by author" on public.lawyer_client_notes
  for delete using (author_user_id = auth.uid());

-- ── service_requests: the firm arm ───────────────────────────────────────────
-- Read-only for colleagues in this phase; requester/assignee keep the existing
-- update policy. `can_access_case_row(null, firm_id)` is exactly the firm arm
-- and nothing else.
drop policy if exists "firm members read firm service requests" on public.service_requests;
create policy "firm members read firm service requests" on public.service_requests
  for select using (firm_id is not null and public.can_access_case_row(null, firm_id));

-- ── row 170: participants may WRITE consultations / cases / contracts ────────
-- 20260518 gave these three tables a SELECT policy and nothing else, so every
-- non-service-role write was refused. Same participant test the SELECT uses.
drop policy if exists "participants insert consultations" on public.consultations;
create policy "participants insert consultations" on public.consultations
  for insert with check (requester_user_id = auth.uid() or lawyer_user_id = auth.uid());
drop policy if exists "participants update consultations" on public.consultations;
create policy "participants update consultations" on public.consultations
  for update using (requester_user_id = auth.uid() or lawyer_user_id = auth.uid())
          with check (requester_user_id = auth.uid() or lawyer_user_id = auth.uid());

drop policy if exists "participants insert cases" on public.cases;
create policy "participants insert cases" on public.cases
  for insert with check (client_user_id = auth.uid() or assigned_user_id = auth.uid());
drop policy if exists "participants update cases" on public.cases;
create policy "participants update cases" on public.cases
  for update using (client_user_id = auth.uid() or assigned_user_id = auth.uid())
          with check (client_user_id = auth.uid() or assigned_user_id = auth.uid());

drop policy if exists "participants insert contracts" on public.contracts;
create policy "participants insert contracts" on public.contracts
  for insert with check (client_user_id = auth.uid() or assigned_user_id = auth.uid());
drop policy if exists "participants update contracts" on public.contracts;
create policy "participants update contracts" on public.contracts
  for update using (client_user_id = auth.uid() or assigned_user_id = auth.uid())
          with check (client_user_id = auth.uid() or assigned_user_id = auth.uid());

COMMIT;

-- =============================================================================
-- AFTER THIS RUNS
-- =============================================================================
-- ⛔ NOTHING CHANGES ON SCREEN YET. «إضافة موكّل» still writes service_requests
--    until the next commit rewires POST/GET /api/v1/lawyer/clients, the modal,
--    the directory, the client file, the conflict check and the firm team page.
--    Deploy order: run THIS first, then deploy that code.
--
-- ── Verify it applied (safe, read-only) ──────────────────────────────────────
--
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('lawyer_clients','lawyer_client_notes')
--    order by table_name;
--   -- expect exactly 2 rows
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'service_requests'
--      and column_name in ('firm_id','lawyer_client_id');
--   -- expect exactly 2 rows
--
--   select tablename, count(*) as policies from pg_policies
--    where schemaname = 'public'
--      and tablename in ('lawyer_clients','lawyer_client_notes','service_requests',
--                        'consultations','cases','contracts')
--    group by tablename order by tablename;
--   -- expect: cases 3 · consultations 3 · contracts 3 · lawyer_client_notes 4
--   --         lawyer_clients 4 · service_requests 4
--
--   select count(*) from public.firm_members where role = 'managing_partner';
--   -- expect = number of rows in firm_profiles (0 today)
--
--   select proname from pg_proc
--    where proname in ('is_active_firm_member','is_active_business_member',
--                      'is_active_government_member','is_active_ngo_member',
--                      'ensure_firm_owner_membership')
--    order by proname;
--   -- expect exactly 5 rows — the four recursion fixes and the owner trigger
-- =============================================================================
