-- Prelude for admin_policies_is_admin.test.sql (20261016_09, plan item N21):
-- the live shape of 2026-10-10 on top of stubs.sql. Every policy on the twelve
-- tables is copied from the production schema dump (latest_schema_20261010.sql)
-- — the sixteen inline admin policies with no TO clause, and the public / own-row
-- policies next to them that guests and users rely on. Table shapes are minimal
-- (only the columns a policy or an assertion touches). Grants follow live: the
-- self-host restore's GRANT ALL to anon/authenticated (stubs.sql's default
-- privileges give every table below the same), and on public.profiles what
-- 20261016_02/_08 left: anon SELECT only, authenticated SELECT + column UPDATE.

-- ── public.profiles: the three live policies, all TO authenticated ──────────
drop policy if exists "own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admins read all profiles" on public.profiles
  for select to authenticated using (public.is_admin());
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated, public;
grant select on public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ── lawyer_profiles (stubs.sql has the table + own/public policies) ─────────
create policy "admins read all lawyer profiles" on public.lawyer_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
create policy "admins update all lawyer profiles" on public.lawyer_profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));

-- ── admin_audit_events (stubs.sql has the table, no policy) ─────────────────
CREATE POLICY "users read own audit events" ON public.admin_audit_events FOR SELECT USING (((actor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text))))));

-- ── platform_settings ────────────────────────────────────────────────────────
create table public.platform_settings (key text primary key, value jsonb not null default '{}'::jsonb, description text);
alter table public.platform_settings enable row level security;
CREATE POLICY "Admins can modify platform settings" ON public.platform_settings USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'admin'::text)))));
CREATE POLICY "Anyone can read platform settings" ON public.platform_settings FOR SELECT USING (true);

-- ── provider_profiles / micro_profiles ───────────────────────────────────────
create table public.provider_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  verification_status text not null default 'pending',
  marketplace_visible boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);
alter table public.provider_profiles enable row level security;
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

create table public.micro_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb
);
alter table public.micro_profiles enable row level security;
CREATE POLICY "admins read all micro profiles" ON public.micro_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY "micro owners read own profile" ON public.micro_profiles FOR SELECT USING ((user_id = auth.uid()));
CREATE POLICY "micro owners update own profile" ON public.micro_profiles FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

-- ── articles / blog_sections (blog) ──────────────────────────────────────────
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  status text not null default 'draft'
);
alter table public.articles enable row level security;
CREATE POLICY articles_admin_read_all ON public.articles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY articles_admin_write ON public.articles USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY articles_public_read_published ON public.articles FOR SELECT USING ((status = 'published'::text));

create table public.blog_sections (code text primary key, label_ar text not null default '');
alter table public.blog_sections enable row level security;
CREATE POLICY blog_sections_admin_write ON public.blog_sections USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY blog_sections_public_read ON public.blog_sections FOR SELECT USING (true);

-- ── broadcasts / contact_messages / document_shares / invitations / tickets ──
create table public.broadcasts (id bigserial primary key, title text not null default '');
alter table public.broadcasts enable row level security;
CREATE POLICY broadcasts_admin_all ON public.broadcasts USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));

create table public.contact_messages (id bigserial primary key, name text not null default '', status text not null default 'new');
alter table public.contact_messages enable row level security;
CREATE POLICY contact_admin_read ON public.contact_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY contact_admin_update ON public.contact_messages FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY contact_insert_any ON public.contact_messages FOR INSERT WITH CHECK (true);

create table public.document_shares (id uuid primary key default gen_random_uuid(), owner_id uuid not null);
alter table public.document_shares enable row level security;
CREATE POLICY document_shares_admin_all ON public.document_shares USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY document_shares_owner_write ON public.document_shares USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY document_shares_select_own ON public.document_shares FOR SELECT USING ((owner_id = auth.uid()));

create table public.invitations (id uuid primary key default gen_random_uuid(), inviter_id uuid not null);
alter table public.invitations enable row level security;
CREATE POLICY invitations_admin_all ON public.invitations USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY invitations_select_own ON public.invitations FOR SELECT USING ((inviter_id = auth.uid()));

create table public.support_tickets (id uuid primary key default gen_random_uuid(), user_id uuid not null, subject text not null default '');
alter table public.support_tickets enable row level security;
CREATE POLICY tickets_admin_all ON public.support_tickets USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'admin'::text)))));
CREATE POLICY tickets_insert_own ON public.support_tickets FOR INSERT WITH CHECK ((user_id = auth.uid()));
CREATE POLICY tickets_select_own ON public.support_tickets FOR SELECT USING ((user_id = auth.uid()));

-- is_admin() as on live: executable by the API roles.
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ── Rows ─────────────────────────────────────────────────────────────────────
--   …a1 admin · …c1 client · …b1 verified + listed lawyer · …d1 verified provider
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000d1');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin',    'المشرف'),
  ('00000000-0000-0000-0000-0000000000c1', 'client',   'عميل'),
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer',   'محامٍ'),
  ('00000000-0000-0000-0000-0000000000d1', 'provider', 'مقدّم خدمة');
insert into public.lawyer_profiles (user_id, license_number, verification_status, marketplace_visible)
  values ('00000000-0000-0000-0000-0000000000b1', '1448-LAW-001', 'verified', true);
insert into public.provider_profiles (user_id, verification_status, marketplace_visible)
  values ('00000000-0000-0000-0000-0000000000d1', 'verified', true);
insert into public.micro_profiles (user_id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.platform_settings (key, value) values ('library_status', '{"status":"open"}');
insert into public.articles (title, status) values ('منشور', 'published'), ('مسودة', 'draft');
insert into public.blog_sections (code, label_ar) values ('news', 'الأخبار');
insert into public.broadcasts (title) values ('تعميم');
insert into public.contact_messages (name) values ('زائر');
insert into public.document_shares (owner_id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.invitations (inviter_id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.support_tickets (user_id, subject) values ('00000000-0000-0000-0000-0000000000c1', 'تذكرة');
insert into public.admin_audit_events (actor_id, action) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin.action'),
  ('00000000-0000-0000-0000-0000000000c1', 'user.action');

-- subscriptions / credit_transactions (minimal) so the chain can re-run
-- 20261016_08 after 20261016_09 and prove its verify no longer needs anon's
-- SELECT on profiles.
create table public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), tier text not null default 'free', status text not null default 'active');
alter table public.subscriptions enable row level security;
create policy "users read own subscriptions" on public.subscriptions for select using (user_id = auth.uid());
create table public.credit_transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), amount int not null);
alter table public.credit_transactions enable row level security;
create policy "users read own credit transactions" on public.credit_transactions for select using (user_id = auth.uid());
