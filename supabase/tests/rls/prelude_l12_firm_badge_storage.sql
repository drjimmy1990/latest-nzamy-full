-- prelude_l12_firm_badge_storage.sql — the live shapes 20261202_80 parts E
-- (N18) and F (N21) read, on top of the l11 community chain, plus the part-A
-- prerequisites that chain does not carry (20261129_10 is proven on its own
-- chain by l12_firm_scope.test.sql). Minimal, live column names:
--   public.service_requests.firm_id / is_restricted   (20260903 / 20261125_40)
--   public.case_team_members                          (20261017_41)
--   public.firm_case_scoped_member(uuid), public.case_visible(text) — stand-ins
--   public.subscriptions.plan_id / entity_type / entity_id (20260603_phase1_003)
--   public.platform_settings.updated_at               (20260627)
--   storage.objects (owner_id text, metadata jsonb)   (Supabase storage)
alter table public.service_requests add column if not exists firm_id uuid;
alter table public.service_requests add column if not exists is_restricted boolean not null default false;
create table if not exists public.case_team_members (
  request_id text not null,
  user_id    uuid not null,
  firm_id    uuid not null,
  added_by   uuid
);
create or replace function public.firm_case_scoped_member(p_firm uuid) returns boolean
language sql stable as $$ select false $$;
create or replace function public.case_visible(p_request text) returns boolean
language sql stable as $$ select true $$;

alter table public.subscriptions add column if not exists plan_id text;
alter table public.subscriptions add column if not exists entity_type text;
alter table public.subscriptions add column if not exists entity_id uuid;
alter table public.platform_settings add column if not exists updated_at timestamptz not null default now();

create schema if not exists storage;
create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text,
  name      text,
  owner_id  text,
  metadata  jsonb
);
-- the live grants of the two stand-ins (20261129_10: authenticated + service_role, never anon)
revoke all on function public.firm_case_scoped_member(uuid) from public, anon;
revoke all on function public.case_visible(text) from public, anon;
grant execute on function public.firm_case_scoped_member(uuid) to authenticated;
grant execute on function public.case_visible(text) to authenticated;
