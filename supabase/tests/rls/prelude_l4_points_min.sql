-- prelude_l4_points_min.sql — the minimal shapes of points_lots, points_ledger,
-- ai_runs and membership_credit_uses that public.firm_member_points_usage
-- (20261108_30) and public.firm_points_overview (20261125_40) read. Column
-- names as in 20261022_20 / 20261027_10 / 20261101_10; constraints the counter
-- does not touch are left out. Used by firm_points_overview_l4.test.sql.
create table if not exists public.points_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'grant',
  points_total int not null,
  points_left int not null,
  expires_at timestamptz not null
);
create table if not exists public.points_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lot_id uuid,
  delta int not null,
  reason text not null,
  tool text,
  ref text,
  created_at timestamptz not null default now()
);
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null default 'drafter',
  created_at timestamptz not null default now()
);
create table if not exists public.membership_credit_uses (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid,
  run_id uuid not null unique references public.ai_runs(id) on delete cascade,
  tool text not null default 'drafter',
  used_at timestamptz not null default now(),
  restored_at timestamptz
);
alter table public.points_lots enable row level security;
alter table public.points_ledger enable row level security;
alter table public.ai_runs enable row level security;
alter table public.membership_credit_uses enable row level security;
revoke all on public.points_lots, public.points_ledger, public.ai_runs, public.membership_credit_uses from authenticated, anon;
