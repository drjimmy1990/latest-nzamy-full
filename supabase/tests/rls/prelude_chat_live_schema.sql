-- prelude_chat_live_schema.sql — the chat tables and their policies EXACTLY as
-- production has them (schema dump 2026-10-10, latest_schema_20261010.sql
-- :6424-6499 tables, :16854 / :17165-17180 / :18510-18753 policies), plus the
-- proof of both defects 20261016_03 fixes:
--   D1  any read of chat_participants / chat_rooms / chat_messages by a
--       signed-in user raises 42P17 (the participants SELECT policy queries
--       chat_participants itself);
--   D2  a user who is in NO room can insert themselves into a stranger's room,
--       as 'owner' (the INSERT policy's `user_id = auth.uid()` branch).
-- case_id carries no FK here (public.cases is not in this chain); request_id
-- keeps its FK to the stub public.service_requests.

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  request_id text references public.service_requests(id) on delete set null,
  case_id text,
  name text not null default '',
  room_type text not null default 'direct'
    check (room_type in ('direct', 'group', 'service', 'case', 'consultation')),
  status text not null default 'active' check (status in ('active', 'archived', 'closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'observer')),
  last_read_at timestamptz,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create table public.chat_messages (
  id bigserial primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  message_type text not null default 'text'
    check (message_type in ('text', 'file', 'image', 'audio', 'system', 'ai_response')),
  file_url text,
  file_name text,
  file_size bigint,
  reply_to bigint references public.chat_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.chat_rooms enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

-- Production's grants (dump :21468-21497): ALL to anon and authenticated.
grant all on public.chat_rooms, public.chat_participants, public.chat_messages to anon, authenticated, service_role;
grant all on sequence public.chat_messages_id_seq to anon, authenticated, service_role;

-- Production's policies, verbatim.
CREATE POLICY "authenticated users create chat rooms" ON public.chat_rooms FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "chat participants read their rooms" ON public.chat_rooms FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.chat_participants cp
  WHERE ((cp.room_id = chat_rooms.id) AND (cp.user_id = auth.uid())))));
CREATE POLICY "chat participants update their rooms" ON public.chat_rooms FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.chat_participants cp
  WHERE ((cp.room_id = chat_rooms.id) AND (cp.user_id = auth.uid()) AND (cp.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY "participants read room membership" ON public.chat_participants FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.chat_participants cp2
  WHERE ((cp2.room_id = chat_participants.room_id) AND (cp2.user_id = auth.uid()))))));
CREATE POLICY "participants remove themselves" ON public.chat_participants FOR DELETE USING ((user_id = auth.uid()));
CREATE POLICY "participants update their own record" ON public.chat_participants FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "room owners add participants" ON public.chat_participants FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.chat_participants cp
  WHERE ((cp.room_id = chat_participants.room_id) AND (cp.user_id = auth.uid()) AND (cp.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));
CREATE POLICY "room participants read messages" ON public.chat_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.chat_participants cp
  WHERE ((cp.room_id = chat_messages.room_id) AND (cp.user_id = auth.uid())))));
CREATE POLICY "room participants send messages" ON public.chat_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.chat_participants cp
  WHERE ((cp.room_id = chat_messages.room_id) AND (cp.user_id = auth.uid()))))));
CREATE POLICY "senders update their own messages" ON public.chat_messages FOR UPDATE USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));

-- Actors: L (lawyer), C (client), S (stranger), and one request between C and L.
insert into auth.users (id) values
  ('11111111-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-00000000000c'),
  ('33333333-0000-0000-0000-00000000000e');
insert into public.profiles (id, user_type, display_name) values
  ('11111111-0000-0000-0000-00000000000a', 'lawyer', 'L'),
  ('22222222-0000-0000-0000-00000000000c', 'individual', 'C'),
  ('33333333-0000-0000-0000-00000000000e', 'individual', 'S');
insert into public.service_requests (id, requester_user_id, assigned_to, title)
  values ('req-chat-1', '22222222-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a', 'استشارة');

-- A room C and L already share (made as postgres, as the old route would have).
insert into public.chat_rooms (id, request_id, name) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'req-chat-1', 'استشارة req-chat-1');
insert into public.chat_participants (room_id, user_id, role) values
  ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-0000-0000-0000-00000000000c', 'owner'),
  ('aaaaaaaa-1111-0000-0000-000000000001', '11111111-0000-0000-0000-00000000000a', 'member');
insert into public.chat_messages (room_id, sender_id, body) values
  ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-0000-0000-0000-00000000000c', 'سلام');

-- D1 + D2, proved on the live policies.
set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  begin
    select count(*) into n from public.chat_participants;
    raise exception 'D1 NOT REPRODUCED: chat_participants read % rows', n;
  exception when sqlstate '42P17' then null;
  end;
  begin
    select count(*) into n from public.chat_messages;
    raise exception 'D1 NOT REPRODUCED: chat_messages read % rows', n;
  exception when sqlstate '42P17' then null;
  end;
  raise notice 'D1 REPRODUCED: every chat read raises 42P17 (infinite recursion in the participants policy)';
end $$;
select set_config('test.uid', '33333333-0000-0000-0000-00000000000e', false);
do $$
begin
  insert into public.chat_participants (room_id, user_id, role)
    values ('aaaaaaaa-1111-0000-0000-000000000001', '33333333-0000-0000-0000-00000000000e', 'owner');
  raise notice 'D2 REPRODUCED: a stranger joined someone else''s room as owner';
exception when sqlstate '42P17' then
  -- Today the recursion (D1) also breaks this INSERT's subquery, so the hole
  -- is masked; a fix of the recursion alone (the 10-06 package's
  -- 20261012_chat_participants_rls_recursion_fix.sql keeps the
  -- `user_id = auth.uid()` branch) would open it. The test proves it stays shut.
  raise notice 'D2 masked by D1 on the live policies (opens once the recursion alone is fixed)';
end $$;
reset role;
delete from public.chat_participants where user_id = '33333333-0000-0000-0000-00000000000e';
select set_config('test.uid', '', false);
