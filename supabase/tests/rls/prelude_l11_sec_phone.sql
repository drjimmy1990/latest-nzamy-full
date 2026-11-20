-- prelude_l11_sec_phone.sql — chain step for l11_sec_phone.test.sql
-- (20261201_10 part D, R6). stubs.sql has no provider_profiles; the live
-- table (20260603_phase1_001) carries user_id + verification_status like
-- lawyer_profiles. Two VERIFIED lawyers already share one mobile BEFORE
-- 20261201_10 runs: the file must count them in a NOTICE, leave them alone and
-- not fail. Synthetic fixtures only (0500000… numbers, invented names).
create table if not exists public.provider_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  sub_role text not null default 'notary',
  license_number text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','suspended')),
  updated_at timestamptz not null default now()
);
alter table public.provider_profiles enable row level security;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000cd1'), ('00000000-0000-0000-0000-000000000cd2')
on conflict do nothing;
insert into public.profiles (id, user_type, display_name, phone) values
  ('00000000-0000-0000-0000-000000000cd1', 'lawyer', 'مكرر أول',  '+966500000099'),
  ('00000000-0000-0000-0000-000000000cd2', 'lawyer', 'مكرر ثان', '+966500000099')
on conflict do nothing;
insert into public.lawyer_profiles (user_id, license_number, verification_status) values
  ('00000000-0000-0000-0000-000000000cd1', '99091', 'verified'),
  ('00000000-0000-0000-0000-000000000cd2', '99092', 'verified')
on conflict do nothing;
