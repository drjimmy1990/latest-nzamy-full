-- prelude_service_requests_live.sql — production's service_requests on top of
-- stubs.sql (schema dump 2026-10-10 :1042-1066): the four later columns, and
-- the functions that write the table, each with its LIVE security mode and its
-- live column writes (bodies reduced to those writes):
--   cancel_own_service_request        SECURITY INVOKER  status, updated_at
--   edit_service_request_description  SECURITY DEFINER  description, updated_at
--   request_service_order_revision    SECURITY DEFINER  metadata, status, updated_at
--   claim_service_request             SECURITY INVOKER  assigned_to, status, updated_at (called by the service role)
-- Created by the superuser, so the DEFINER ones are owned by postgres, as live.
-- Actors: C a client, L the assigned lawyer, X another lawyer.

alter table public.service_requests
  add column if not exists lawyer_client_id uuid,
  add column if not exists firm_id uuid,
  add column if not exists source_consultation_id text,
  add column if not exists business_id uuid;

create or replace function public.cancel_own_service_request(p_request_id text) returns void
language plpgsql set search_path = '' as $$
begin
  update public.service_requests set status = 'cancelled', updated_at = now()
   where id = p_request_id and requester_user_id = auth.uid();
end $$;

create or replace function public.edit_service_request_description(p_request_id text, p_description text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.service_requests where id = p_request_id and requester_user_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  update public.service_requests set description = p_description, updated_at = now() where id = p_request_id;
end $$;

create or replace function public.request_service_order_revision(p_request_id text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.service_requests where id = p_request_id and requester_user_id = auth.uid()) then
    raise exception 'not_found';
  end if;
  update public.service_requests
     set metadata = metadata || jsonb_build_object('revision_note', p_note), status = 'in_review', updated_at = now()
   where id = p_request_id;
end $$;

create or replace function public.claim_service_request(p_request_id text, p_actor_id uuid, p_now timestamptz)
returns setof public.service_requests
language sql security invoker set search_path = '' as $$
  update public.service_requests
     set assigned_to = p_actor_id, status = 'in_review', updated_at = p_now
   where id = p_request_id and receiver = 'ai_workspace'
     and status not in ('completed', 'cancelled')
     and (assigned_to is null or assigned_to = p_actor_id)
  returning *;
$$;

grant execute on function public.cancel_own_service_request(text),
  public.edit_service_request_description(text, text),
  public.request_service_order_revision(text, text) to app_user, authenticated;
grant execute on function public.claim_service_request(text, uuid, timestamptz) to service_role;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000c001', 'client', 'C'),
  ('00000000-0000-0000-0000-00000000a001', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-00000000a002', 'lawyer', 'X');
insert into public.service_requests (id, requester_user_id, type, title, receiver, assigned_to, status) values
  ('R1', '00000000-0000-0000-0000-00000000c001', 'service', 'غير مُسنَد', 'ai_workspace', null, 'pending'),
  ('R2', '00000000-0000-0000-0000-00000000c001', 'service', 'مُسنَد إلى L', 'ai_workspace', '00000000-0000-0000-0000-00000000a001', 'assigned'),
  ('R3', '00000000-0000-0000-0000-00000000c001', 'service', 'للإلغاء', 'ai_workspace', null, 'pending');
