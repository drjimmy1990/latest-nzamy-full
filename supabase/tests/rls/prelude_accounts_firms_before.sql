-- prelude_accounts_firms_before.sql — the state 20261030_12 finds on prod:
-- 20261026_70 has run, a member was removed from a firm and his notes already
-- moved to the firm owner (a firm_asset_transfers trail exists), and the notes
-- carry an old «آخر تعديل». Runs as postgres, BEFORE 20261030_12.
-- Chain: see accounts_firms_owner_answers.test.sql.

alter table auth.users add column if not exists email text;
-- 20261017_10 is not in this chain; the column the snapshot reads
alter table public.profiles add column if not exists national_address text;

-- ٣١١ / ٣٠٧: the corporate entity tables (shape of 20260603_phase1_002)
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name_ar text not null default ''
);
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
);

insert into auth.users (id) values
  ('c3000000-0000-0000-0000-000000000001'),  -- O2 firm owner (a firm account)
  ('c3000000-0000-0000-0000-000000000002'),  -- L2 lawyer, removed before 20261030_12
  ('c3000000-0000-0000-0000-000000000003'),  -- S2 legal secretary, active
  ('c3000000-0000-0000-0000-000000000004'),  -- C2 client (buyer of an invoice)
  ('c3000000-0000-0000-0000-000000000005'),  -- Q2 consulting office owner (practice_kind consultant)
  ('c3000000-0000-0000-0000-000000000006'),  -- R2 lawyer, member of Q2's office
  ('c3000000-0000-0000-0000-000000000007'),  -- B2 company owner
  ('c3000000-0000-0000-0000-000000000008'),  -- BM member of B2's legal team
  ('c3000000-0000-0000-0000-000000000009');  -- L3 lawyer, member of O2's firm (removed in the test)
insert into public.profiles (id, user_type, display_name, email) values
  ('c3000000-0000-0000-0000-000000000001', 'firm',       'O2 صاحب المكتب', 'o2@example.test'),
  ('c3000000-0000-0000-0000-000000000002', 'lawyer',     'L2 محامٍ',       'l2@example.test'),
  ('c3000000-0000-0000-0000-000000000003', 'individual', 'S2 سكرتير',      's2@example.test'),
  ('c3000000-0000-0000-0000-000000000004', 'individual', 'C2 موكل',        'c2@example.test'),
  ('c3000000-0000-0000-0000-000000000005', 'firm',       'Q2 مكتب استشارات', 'q2@example.test'),
  ('c3000000-0000-0000-0000-000000000006', 'lawyer',     'R2 محامٍ',       'r2@example.test'),
  ('c3000000-0000-0000-0000-000000000007', 'corporate',  'B2 شركة',        'b2@example.test'),
  ('c3000000-0000-0000-0000-000000000008', 'lawyer',     'BM مستشار الشركة', 'bm@example.test'),
  ('c3000000-0000-0000-0000-000000000009', 'lawyer',     'L3 محامٍ',       'l3@example.test');

insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('c3f00000-0000-0000-0000-0000000000f2', 'c3000000-0000-0000-0000-000000000001', 'مكتب O2');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('c3f00000-0000-0000-0000-0000000000f2', 'c3000000-0000-0000-0000-000000000002', 'lawyer',          'active', now()),
  ('c3f00000-0000-0000-0000-0000000000f2', 'c3000000-0000-0000-0000-000000000003', 'legal_secretary', 'active', now()),
  ('c3f00000-0000-0000-0000-0000000000f2', 'c3000000-0000-0000-0000-000000000009', 'lawyer',          'active', now());

insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-l2', 'c3000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000002', 'قضية L2 في المكتب', 'c3f00000-0000-0000-0000-0000000000f2');

insert into public.case_notes (id, request_id, author_user_id, firm_id, visibility, body, created_at, updated_at) values
  ('c3b00000-0000-0000-0000-000000000001', 'case-l2', 'c3000000-0000-0000-0000-000000000002', 'c3f00000-0000-0000-0000-0000000000f2', 'private', 'ملاحظة L2 الخاصة', '2026-01-01', '2026-01-01'),
  ('c3b00000-0000-0000-0000-000000000002', 'case-l2', 'c3000000-0000-0000-0000-000000000002', 'c3f00000-0000-0000-0000-0000000000f2', 'firm',    'مذكرة L2 للمكتب', '2026-01-01', '2026-01-01'),
  ('c3b00000-0000-0000-0000-000000000003', 'case-l2', 'c3000000-0000-0000-0000-000000000001', 'c3f00000-0000-0000-0000-0000000000f2', 'private', 'ملاحظة O2 نفسه',  '2026-01-01', '2026-01-01');

-- L2 is removed under 20261026_70: his notes move to O2, with a trail row each
update public.firm_members set status = 'removed'
 where firm_id = 'c3f00000-0000-0000-0000-0000000000f2' and user_id = 'c3000000-0000-0000-0000-000000000002';

-- the move bumped updated_at; put back the date a user last edited them
alter table public.case_notes disable trigger trg_case_notes_updated_at;
update public.case_notes set updated_at = '2026-01-01' where request_id = 'case-l2';
alter table public.case_notes enable trigger trg_case_notes_updated_at;

do $$
begin
  if (select author_user_id from public.case_notes where id = 'c3b00000-0000-0000-0000-000000000001')
     <> 'c3000000-0000-0000-0000-000000000001' then
    raise exception 'prelude: 20261026_70 did not move L2''s private note to O2';
  end if;
  if not exists (select 1 from public.firm_asset_transfers where row_id = 'c3b00000-0000-0000-0000-000000000001') then
    raise exception 'prelude: no trail row for the moved note';
  end if;
end $$;
