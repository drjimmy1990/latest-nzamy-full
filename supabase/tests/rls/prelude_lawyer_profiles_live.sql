-- Prelude for lawyer_profiles_select_column_lock.test.sql (20261016_10, plan
-- item N2): the live shape of 2026-10-10 on top of stubs.sql, after the
-- 2026-10-16 batch's Step 0 (20260922_03's lawyer column UPDATE list) and
-- 20261016_05 (show_hourly_rate). Policies are copied from the production
-- schema dump (latest_schema_20261010.sql), including the two on OTHER tables
-- that read lawyer_profiles inline: "lawyer services public read" and
-- service_requests_select_policy. Table-level SELECT is still with anon and
-- authenticated (the self-host restore's GRANT ALL) — the defect.

-- ── public.profiles as on live before N21 (anon keeps SELECT) ───────────────
drop policy if exists "own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admins read all profiles" on public.profiles
  for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon;

-- ── lawyer_profiles: every live column (stubs.sql has a subset) ─────────────
alter table public.lawyer_profiles
  add column license_expiry date,
  add column bar_association text,
  add column bio_en text not null default '',
  add column credit_balance integer not null default 0,
  add column credit_package text,
  add column credit_expiry timestamptz,
  add column free_briefs_remaining integer not null default 1,
  add column active_roles text[] not null default '{lawyer}',
  add column display_mode text not null default 'full',
  add column is_accepting_clients boolean not null default true,
  add column city text,
  add column show_contact boolean not null default false,
  add column license_issued_on date,
  add column office_address text,
  add column slug text,
  add column education jsonb not null default '[]'::jsonb,
  add column courts text[] not null default '{}',
  add column languages text[] not null default '{ar}',
  add column headline_ar text not null default '',
  add column bar_membership_number text,
  add column show_hourly_rate boolean not null default false;

-- stubs.sql has "lawyers read own profile", "public read verified lawyers",
-- "lawyers update own profile"; the rest as on live (pre-N21 admin shape).
create policy "users insert own lawyer profile" on public.lawyer_profiles FOR INSERT WITH CHECK ((user_id = auth.uid()));
create policy "admins read all lawyer profiles" on public.lawyer_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
create policy "admins update all lawyer profiles" on public.lawyer_profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));

-- 20260922_03 (lawyer part) + 20261016_05, as Step 0 left them on live.
revoke insert, update on public.lawyer_profiles from authenticated, anon;
grant update (
  bio_ar, bio_en, specialties, years_experience, hourly_rate, license_number,
  bar_association, city, marketplace_visible, is_accepting_clients, show_contact,
  slug, education, courts, languages, headline_ar, license_issued_on,
  office_address, display_mode, updated_at
) on public.lawyer_profiles to authenticated;
grant update (show_hourly_rate) on public.lawyer_profiles to authenticated;

-- ── lawyer_services (live shape + live policies) ─────────────────────────────
create table public.lawyer_services (
  id uuid primary key default gen_random_uuid(),
  lawyer_user_id uuid not null references public.profiles(id) on delete cascade,
  title_ar text not null,
  active boolean not null default true,
  "position" integer not null default 0
);
alter table public.lawyer_services enable row level security;
CREATE POLICY "lawyer services owner read" ON public.lawyer_services FOR SELECT USING ((lawyer_user_id = auth.uid()));
CREATE POLICY "lawyer services owner write" ON public.lawyer_services USING ((lawyer_user_id = auth.uid())) WITH CHECK ((lawyer_user_id = auth.uid()));
CREATE POLICY "lawyer services public read" ON public.lawyer_services FOR SELECT USING ((active AND (EXISTS ( SELECT 1
   FROM public.lawyer_profiles lp
  WHERE ((lp.user_id = lawyer_services.lawyer_user_id) AND (lp.verification_status = 'verified'::text) AND (lp.marketplace_visible = true))))));

-- ── service_requests: the live SELECT policy that reads lawyer_profiles ──────
CREATE POLICY service_requests_select_policy ON public.service_requests FOR SELECT USING (((requester_user_id = auth.uid()) OR (assigned_to = auth.uid()) OR ((EXISTS ( SELECT 1
   FROM public.lawyer_profiles
  WHERE ((lawyer_profiles.user_id = auth.uid()) AND (lawyer_profiles.verification_status = 'verified'::text)))) AND (assigned_to IS NULL) AND (status = ANY (ARRAY['pending'::text, 'pending_assignment'::text])) AND (receiver <> 'ai_workspace'::text))));

grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ── Rows ─────────────────────────────────────────────────────────────────────
--   …b1 verified + listed lawyer · …b2 pending lawyer · …c1 client
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c1');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer', 'محامٍ موثّق'),
  ('00000000-0000-0000-0000-0000000000b2', 'lawyer', 'محامٍ قيد التوثيق'),
  ('00000000-0000-0000-0000-0000000000c1', 'client', 'عميل');
insert into public.lawyer_profiles (user_id, license_number, hourly_rate, credit_balance, slug,
                                    verification_status, marketplace_visible, show_hourly_rate)
  values ('00000000-0000-0000-0000-0000000000b1', '1448-LAW-001', 500, 40, 'verified-lawyer', 'verified', true, false),
         ('00000000-0000-0000-0000-0000000000b2', '1448-LAW-002', 300, 0, null, 'pending', false, false);
insert into public.lawyer_services (lawyer_user_id, title_ar) values
  ('00000000-0000-0000-0000-0000000000b1', 'استشارة عمالية'),
  ('00000000-0000-0000-0000-0000000000b2', 'صياغة عقد');
insert into public.service_requests (id, requester_user_id, title, status, receiver) values
  ('sr-open', '00000000-0000-0000-0000-0000000000c1', 'طلب مفتوح', 'pending', 'lawyer');
