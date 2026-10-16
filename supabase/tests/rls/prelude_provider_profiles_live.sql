-- Prelude for provider_profiles_guest_read_revoke.test.sql (20261016_11, N2
-- follow-up): the live shape of 2026-10-10 on top of stubs.sql, after the
-- 2026-10-16 batch's Step 0 (20260922_03's provider column UPDATE list).
-- Table, policies and grants are copied from the production schema dump
-- (latest_schema_20261010.sql). No policy on another table and no view reads
-- provider_profiles there. Table-level SELECT is still with anon and
-- authenticated (the self-host restore's GRANT ALL, reproduced here by
-- stubs.sql's default privileges) — the defect.

-- ── provider_profiles: every live column ────────────────────────────────────
create table public.provider_profiles (
  user_id uuid not null primary key references public.profiles(id) on delete cascade,
  sub_role text not null,
  license_number text,
  license_expiry date,
  service_areas text[] default '{}'::text[] not null,
  availability jsonb default '{"days": ["sun", "mon", "tue", "wed", "thu"], "hours": {"end": "17:00", "start": "08:00"}}'::jsonb not null,
  hourly_rate numeric(12,2),
  verification_status text default 'pending'::text not null,
  marketplace_visible boolean default false not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint provider_profiles_sub_role_check check ((sub_role = any (array['notary'::text, 'arbitrator'::text, 'bailiff'::text]))),
  constraint provider_profiles_verification_status_check check ((verification_status = any (array['pending'::text, 'verified'::text, 'rejected'::text, 'suspended'::text])))
);
create trigger set_provider_profiles_updated_at before update on public.provider_profiles
  for each row execute function public.handle_updated_at();
alter table public.provider_profiles enable row level security;

-- The six live policies (pre-N21 admin shape).
CREATE POLICY "admins read all provider profiles" ON public.provider_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY "admins update all provider profiles" ON public.provider_profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY "providers read own profile" ON public.provider_profiles FOR SELECT USING ((user_id = auth.uid()));
CREATE POLICY "providers update own profile" ON public.provider_profiles FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "public read verified providers" ON public.provider_profiles FOR SELECT USING (((verification_status = 'verified'::text) AND (marketplace_visible = true)));
CREATE POLICY "users insert own provider profile" ON public.provider_profiles FOR INSERT WITH CHECK ((user_id = auth.uid()));

-- 20260922_03 (provider part), as Step 0 left it on live.
revoke insert, update on public.provider_profiles from authenticated, anon;
grant update (metadata, updated_at) on public.provider_profiles to authenticated;

-- ── Rows ─────────────────────────────────────────────────────────────────────
--   …d1 verified + listed notary · …d2 pending arbitrator · …c1 client · …a1 admin
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'provider', 'موثّق معتمد'),
  ('00000000-0000-0000-0000-0000000000d2', 'provider', 'محكّم قيد التوثيق'),
  ('00000000-0000-0000-0000-0000000000c1', 'client', 'عميل'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin', 'مشرف');
insert into public.provider_profiles (user_id, sub_role, license_number, hourly_rate,
                                      verification_status, marketplace_visible, metadata)
  values ('00000000-0000-0000-0000-0000000000d1', 'notary', 'NOT-1448-001', 400, 'verified', true,
          '{"settings": {"office_hours": "٨–٤"}}'::jsonb),
         ('00000000-0000-0000-0000-0000000000d2', 'arbitrator', 'ARB-1448-002', 900, 'pending', false,
          '{}'::jsonb);
