-- Minimal staff/audit prerequisites for the isolated refund integration test.
create table public.platform_staff (user_id uuid primary key, staff_role text not null);
create table if not exists public.admin_audit_events (id bigserial primary key, actor_id uuid, actor_type text, action text, target_type text, target_id text, before_state jsonb, after_state jsonb, metadata jsonb);
alter table public.admin_audit_events add column if not exists before_state jsonb;
alter table public.admin_audit_events add column if not exists after_state jsonb;
alter table public.admin_audit_events add column if not exists metadata jsonb;
alter table public.admin_audit_events add column if not exists actor_type text;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000f001');
insert into public.profiles (id,user_type) values ('00000000-0000-0000-0000-00000000f001','admin');
insert into public.platform_staff values ('00000000-0000-0000-0000-00000000f001','super_admin');
grant all on public.platform_staff,public.admin_audit_events to service_role;
