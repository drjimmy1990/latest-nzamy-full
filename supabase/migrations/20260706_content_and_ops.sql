-- 20260706_content_and_ops.sql
-- Tables backing the content system (Blog CMS) + admin-ops surfaces that were
-- previously mock-only (support tickets, broadcasts) + content-page writes
-- (contact messages, invitations, document shares).
-- coupons / promo_links / admin_audit_events already exist in earlier
-- migrations and are NOT recreated here.
--
-- RLS conventions (match existing migrations):
--   user-own   : using (user_id = auth.uid())
--   admin-all  : exists (select 1 from public.profiles p
--                        where p.id = auth.uid() and p.user_type = 'admin')

-- ─── Blog CMS ──────────────────────────────────────────────────────────────────
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  title_en     text,
  excerpt      text,
  excerpt_en   text,
  body         text,                  -- markdown
  category     text,
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text,
  cover        text,
  status       text not null default 'draft' check (status in ('draft','published','archived')),
  featured     boolean not null default false,
  views        integer not null default 0,
  read_time    text,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists articles_status_published_idx on public.articles (status, published_at desc);
create index if not exists articles_slug_idx on public.articles (slug);
alter table public.articles enable row level security;
create policy "articles_public_read_published" on public.articles
  for select using (status = 'published');
create policy "articles_admin_read_all" on public.articles
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
create policy "articles_admin_write" on public.articles
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

-- ─── Contact / partner messages ────────────────────────────────────────────────
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text,
  phone      text,
  subject    text,
  message    text,
  kind       text not null default 'contact' check (kind in ('contact','partner')),
  status     text not null default 'new' check (status in ('new','read','archived')),
  metadata   jsonb,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);
alter table public.contact_messages enable row level security;
-- Anyone (incl. anonymous) may submit; admin reads/updates. Server route uses
-- service-role, but this policy also lets the anon key insert directly.
create policy "contact_insert_any" on public.contact_messages
  for insert with check (true);
create policy "contact_admin_read" on public.contact_messages
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
create policy "contact_admin_update" on public.contact_messages
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

-- ─── Support tickets ───────────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  subject     text not null,
  body        text,
  category    text,
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status      text not null default 'open' check (status in ('open','pending','resolved','closed')),
  assignee_id uuid references auth.users(id) on delete set null,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;
create policy "tickets_insert_own" on public.support_tickets
  for insert with check (user_id = auth.uid());
create policy "tickets_select_own" on public.support_tickets
  for select using (user_id = auth.uid());
create policy "tickets_admin_all" on public.support_tickets
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

-- ─── Broadcasts / announcements ────────────────────────────────────────────────
create table if not exists public.broadcasts (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text,
  audience     text not null default 'all',
  status       text not null default 'draft' check (status in ('draft','scheduled','sent')),
  scheduled_at timestamptz,
  sent_at      timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists broadcasts_status_idx on public.broadcasts (status, created_at desc);
alter table public.broadcasts enable row level security;
create policy "broadcasts_admin_all" on public.broadcasts
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

-- ─── Invitations (colleague / trial invites) ───────────────────────────────────
create table if not exists public.invitations (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  inviter_id    uuid references auth.users(id) on delete set null,
  invitee_email text,
  invitee_phone text,
  trial_days    integer not null default 14,
  tier          text,
  status        text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  accepted_by   uuid references auth.users(id) on delete set null,
  accepted_at   timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists invitations_code_idx on public.invitations (code);
alter table public.invitations enable row level security;
-- Validation/accept happens server-side (service-role). Inviter reads own,
-- admin reads all. No public select (codes are looked up via the server route).
create policy "invitations_select_own" on public.invitations
  for select using (inviter_id = auth.uid());
create policy "invitations_admin_all" on public.invitations
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));

-- ─── Document shares (secure share/[token] links) ──────────────────────────────
create table if not exists public.document_shares (
  id          uuid primary key default gen_random_uuid(),
  token       text unique not null,
  owner_id    uuid references auth.users(id) on delete cascade,
  document_id text,
  title       text,
  passcode    text,                  -- verified server-side (service-role)
  expires_at  timestamptz,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists document_shares_token_idx on public.document_shares (token);
alter table public.document_shares enable row level security;
-- No public select (passcode verification is done by the server route via
-- service-role). Owner reads own; admin reads all.
create policy "document_shares_select_own" on public.document_shares
  for select using (owner_id = auth.uid());
create policy "document_shares_owner_write" on public.document_shares
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "document_shares_admin_all" on public.document_shares
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
