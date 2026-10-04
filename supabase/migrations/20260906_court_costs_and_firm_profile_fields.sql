-- Court costs, recoverable disbursements, and statutory firm profile fields.
-- Reviewed variant of the developer package migration: transactional,
-- idempotent policies, updated_at triggers, and explicit write ownership.

begin;

alter table public.firm_profiles
  add column if not exists cr_number text,
  add column if not exists unified_number_700 text,
  add column if not exists managing_partner_name text,
  add column if not exists managing_partner_license text;

alter table public.lawyer_profiles
  add column if not exists bar_membership_number text;

comment on column public.firm_profiles.license_number is
  'ترخيص شركة المحاماة المهنية الصادر من وزارة العدل.';
comment on column public.firm_profiles.cr_number is
  'رقم السجل التجاري المهني الصادر من وزارة التجارة.';
comment on column public.firm_profiles.unified_number_700 is
  'الرقم الوطني الموحد للمنشأة (700).';
comment on column public.lawyer_profiles.bar_membership_number is
  'رقم عضوية الهيئة السعودية للمحامين (SBA).';

do $$ begin
  create type public.court_cost_kind as enum
    ('judicial_costs','judicial_service','execution','appeal','expert_fee','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sadad_status as enum
    ('estimated','notice_issued','pending_verification','paid','expired','cancelled','waived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.disbursement_recovery_status as enum
    ('incurred','billable','invoiced','recovered','disputed');
exception when duplicate_object then null; end $$;

create table if not exists public.court_cost_notices (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.cases(id) on delete restrict,
  request_id text references public.service_requests(id) on delete set null,
  kind public.court_cost_kind not null default 'judicial_costs',
  biller_code text not null default '169',
  sadad_bill_number text,
  najiz_case_number text,
  claim_value numeric(14,2) check (claim_value >= 0),
  estimated_amount numeric(14,2) not null default 0 check (estimated_amount >= 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  adjudicated_amount numeric(14,2) check (adjudicated_amount >= 0),
  currency text not null default 'SAR',
  status public.sadad_status not null default 'estimated',
  liable_party text check (liable_party in ('client','opponent','shared','court','undetermined')),
  liability_source text,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  payment_proof_url text,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_court_sadad_bill unique (biller_code, sadad_bill_number),
  constraint court_cost_within_statutory_cap check (
    kind <> 'judicial_costs' or claim_value is null
    or estimated_amount <= least(claim_value * 0.05, 1000000)
  ),
  constraint paid_requires_evidence check (
    status <> 'paid' or (sadad_bill_number is not null and paid_at is not null)
  )
);

create table if not exists public.case_disbursements (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.cases(id) on delete restrict,
  request_id text references public.service_requests(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  court_cost_notice_id uuid references public.court_cost_notices(id) on delete set null,
  category text not null check (category in (
    'judicial_costs','notarization','expert_fee','translation','copies',
    'travel','courier','government_fee','other'
  )),
  description_ar text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'SAR',
  incurred_on date not null default current_date,
  invoice_issued_to text not null check (invoice_issued_to in ('client','firm')),
  markup_applied boolean not null default false,
  input_vat_deducted boolean not null default false,
  vat_treatment text generated always as (
    case when invoice_issued_to = 'client'
              and markup_applied = false
              and input_vat_deducted = false
         then 'disbursement' else 'recharge' end
  ) stored,
  receipt_document_url text,
  recovery_status public.disbursement_recovery_status not null default 'incurred',
  invoice_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_court_cost_notices_case_id
  on public.court_cost_notices (case_id);
create index if not exists idx_court_cost_notices_status
  on public.court_cost_notices (status);
create index if not exists idx_case_disbursements_case_id
  on public.case_disbursements (case_id);
create index if not exists idx_case_disbursements_status
  on public.case_disbursements (recovery_status);

drop trigger if exists trg_court_cost_notices_updated_at on public.court_cost_notices;
create trigger trg_court_cost_notices_updated_at
  before update on public.court_cost_notices
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_case_disbursements_updated_at on public.case_disbursements;
create trigger trg_case_disbursements_updated_at
  before update on public.case_disbursements
  for each row execute function public.handle_updated_at();

alter table public.court_cost_notices enable row level security;
alter table public.case_disbursements enable row level security;

drop policy if exists "participants_read_court_cost_notices" on public.court_cost_notices;
create policy "participants_read_court_cost_notices"
  on public.court_cost_notices for select
  using (
    public.is_admin() or exists (
      select 1 from public.cases c where c.id = court_cost_notices.case_id
        and (c.client_user_id = auth.uid() or c.assigned_user_id = auth.uid())
    )
  );

drop policy if exists "assigned_lawyer_write_court_cost_notices" on public.court_cost_notices;
create policy "assigned_lawyer_write_court_cost_notices"
  on public.court_cost_notices for all
  using (
    public.is_admin() or exists (
      select 1 from public.cases c where c.id = court_cost_notices.case_id
        and c.assigned_user_id = auth.uid()
    )
  )
  with check (
    public.is_admin() or (
      created_by = auth.uid() and exists (
        select 1 from public.cases c where c.id = court_cost_notices.case_id
          and c.assigned_user_id = auth.uid()
      )
    )
  );

drop policy if exists "participants_read_disbursements" on public.case_disbursements;
create policy "participants_read_disbursements"
  on public.case_disbursements for select
  using (
    public.is_admin() or exists (
      select 1 from public.cases c where c.id = case_disbursements.case_id
        and (c.client_user_id = auth.uid() or c.assigned_user_id = auth.uid())
    )
  );

drop policy if exists "assigned_lawyer_write_disbursements" on public.case_disbursements;
create policy "assigned_lawyer_write_disbursements"
  on public.case_disbursements for all
  using (
    public.is_admin() or exists (
      select 1 from public.cases c where c.id = case_disbursements.case_id
        and c.assigned_user_id = auth.uid()
    )
  )
  with check (
    public.is_admin() or (
      created_by = auth.uid() and exists (
        select 1 from public.cases c where c.id = case_disbursements.case_id
          and c.assigned_user_id = auth.uid()
      )
    )
  );

commit;

-- Verify in staging: both tables exist, RLS is enabled, each has read/write
-- policies, both updated_at triggers exist, and no statutory-cap test insert
-- above 5% / SAR 1,000,000 succeeds.
