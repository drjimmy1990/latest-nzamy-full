-- chat_rls_fix.test.sql — proves 20261016_03 (chat policies).
-- Chain (run.sh, postgres:16; stubs.sql provides auth.uid(), profiles and
-- service_requests):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_chat_live_schema.sql \
--     $M/20261016_03_chat_rls_fix.sql $M/20261016_03_chat_rls_fix.sql \
--     $R/chat_rls_fix.test.sql
-- The prelude loads production's chat tables + policies verbatim and proves the
-- recursion (D1). Actors: C (client, requester), L (lawyer, assignee),
-- S (stranger). Room R1 = C + L, tied to req-chat-1.
-- Runs as role `authenticated` (what PostgREST uses for a signed-in request);
-- auth.uid() reads test.uid. Every assertion RAISES on failure.

-- T1 the recursion is gone: C reads the room, the members and the message
set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000c', false);
do $$
declare
  n_rooms int; n_parts int; n_msgs int;
begin
  select count(*) into n_rooms from public.chat_rooms;
  select count(*) into n_parts from public.chat_participants;
  select count(*) into n_msgs  from public.chat_messages;
  if n_rooms <> 1 or n_parts <> 2 or n_msgs <> 1 then
    raise exception 'T1 FAIL: C sees rooms=% participants=% messages=% (want 1/2/1)', n_rooms, n_parts, n_msgs;
  end if;
  raise notice 'T1 PASS: no 42P17 — C reads its room, both participants and the message';
end $$;

-- T2 C sends, marks read, edits own message; cannot impersonate the system,
--    move a message, promote itself or create a room directly
do $$
declare n int;
begin
  insert into public.chat_messages (room_id, sender_id, body)
    values ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-0000-0000-0000-00000000000c', 'رسالة ثانية');
  update public.chat_participants set last_read_at = now()
   where room_id = 'aaaaaaaa-1111-0000-0000-000000000001' and user_id = '22222222-0000-0000-0000-00000000000c';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2 FAIL: last_read_at update touched % rows', n; end if;
  update public.chat_messages set body = 'معدلة', edited_at = now()
   where sender_id = '22222222-0000-0000-0000-00000000000c' and body = 'رسالة ثانية';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2 FAIL: own-message edit touched % rows', n; end if;

  begin
    insert into public.chat_messages (room_id, sender_id, body, message_type)
      values ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-0000-0000-0000-00000000000c', 'تنبيه النظام', 'system');
    raise exception 'T2 FAIL: a participant posted a system message';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    update public.chat_participants set role = 'owner'
     where user_id = '22222222-0000-0000-0000-00000000000c';
    raise exception 'T2 FAIL: a participant changed its own role';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.chat_messages set room_id = gen_random_uuid()
     where sender_id = '22222222-0000-0000-0000-00000000000c';
    raise exception 'T2 FAIL: a sender moved a message';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chat_rooms (name) values ('غرفة مباشرة');
    raise exception 'T2 FAIL: a room was created by a direct INSERT';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chat_participants (room_id, user_id, role)
      values ('aaaaaaaa-1111-0000-0000-000000000001', '33333333-0000-0000-0000-00000000000e', 'member');
    raise exception 'T2 FAIL: the room owner added a stranger directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: send / mark read / edit work; system message, self-promotion, message move, direct room and direct member insert are refused';
end $$;

-- T3 the stranger sees nothing and cannot join (D2 stays shut)
select set_config('test.uid', '33333333-0000-0000-0000-00000000000e', false);
do $$
declare n int;
begin
  select count(*) into n from public.chat_messages;
  if n <> 0 then raise exception 'T3 FAIL: stranger reads % messages', n; end if;
  select count(*) into n from public.chat_rooms;
  if n <> 0 then raise exception 'T3 FAIL: stranger reads % rooms', n; end if;
  begin
    insert into public.chat_participants (room_id, user_id, role)
      values ('aaaaaaaa-1111-0000-0000-000000000001', '33333333-0000-0000-0000-00000000000e', 'owner');
    raise exception 'T3 FAIL: stranger joined the room';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chat_messages (room_id, sender_id, body)
      values ('aaaaaaaa-1111-0000-0000-000000000001', '33333333-0000-0000-0000-00000000000e', 'دخيل');
    raise exception 'T3 FAIL: stranger posted into the room';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_chat_room('req-chat-1', array['22222222-0000-0000-0000-00000000000c']::uuid[]);
    raise exception 'T3 FAIL: stranger opened the request''s room';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: a stranger reads nothing, cannot join, post, or open the request room';
end $$;

-- T4 create_chat_room: the lawyer gets THE existing room (no duplicate);
--    a new request gets one room with both parties; bad input is refused
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
do $$
declare
  r   public.chat_rooms;
  n   int;
begin
  r := public.create_chat_room('req-chat-1', array['22222222-0000-0000-0000-00000000000c']::uuid[], 'x');
  if r.id <> 'aaaaaaaa-1111-0000-0000-000000000001' then
    raise exception 'T4 FAIL: a second room was made for req-chat-1 (%)', r.id;
  end if;
  begin
    perform public.create_chat_room('req-chat-1', array['33333333-0000-0000-0000-00000000000e']::uuid[]);
    raise exception 'T4 FAIL: the lawyer pulled a stranger into the request room';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_chat_room(null, array['22222222-0000-0000-0000-00000000000c']::uuid[]);
    raise exception 'T4 FAIL: a room with no request was created';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_chat_room('req-chat-1', array['22222222-0000-0000-0000-00000000000c']::uuid[], '', 'service');
    raise exception 'T4 FAIL: a user chose a platform room type';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'T4 PASS: the lawyer gets the existing room; strangers, request-less rooms and platform room types are refused';
end $$;
reset role;

insert into public.service_requests (id, requester_user_id, assigned_to, title)
  values ('req-chat-2', '22222222-0000-0000-0000-00000000000c', '11111111-0000-0000-0000-00000000000a', 'طلب ثان');

set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000c', false);
do $$
declare
  r      public.chat_rooms;
  again  public.chat_rooms;
  n      int;
  owner_role text;
begin
  r := public.create_chat_room('req-chat-2', array['11111111-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000c']::uuid[], 'استشارة req-chat-2');
  select count(*) into n from public.chat_participants where room_id = r.id;
  select role into owner_role from public.chat_participants where room_id = r.id and user_id = '22222222-0000-0000-0000-00000000000c';
  if n <> 2 or owner_role <> 'owner' or r.request_id <> 'req-chat-2' then
    raise exception 'T5 FAIL: new room has % participants, caller role %, request %', n, owner_role, r.request_id;
  end if;
  again := public.create_chat_room('req-chat-2', array['11111111-0000-0000-0000-00000000000a']::uuid[]);
  if again.id <> r.id then
    raise exception 'T5 FAIL: the second call made another room';
  end if;
  raise notice 'T5 PASS: a new request room has the client as owner and the lawyer as member; calling again returns it';
end $$;
reset role;

-- T6 anon holds nothing; the helpers are not anon-callable
do $$
begin
  if has_table_privilege('anon', 'public.chat_messages', 'SELECT')
     or has_function_privilege('anon', 'public.chat_is_participant(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_chat_room(text, uuid[], text, text)', 'EXECUTE') then
    raise exception 'T6 FAIL: anon still reaches the chat';
  end if;
  raise notice 'T6 PASS: anon holds no chat privilege and cannot call the chat functions';
end $$;

-- T7 a message cannot be backdated (D5), and a reassigned lawyer leaves the room (D6)
set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000c', false);
do $$
begin
  begin
    insert into public.chat_messages (room_id, sender_id, body, created_at)
      values ('aaaaaaaa-1111-0000-0000-000000000001', '22222222-0000-0000-0000-00000000000c', 'رسالة قديمة', '2020-01-01');
    raise exception 'T7 FAIL: a participant backdated a message';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
insert into auth.users (id) values ('44444444-0000-0000-0000-00000000004a');
insert into public.profiles (id, user_type, display_name) values ('44444444-0000-0000-0000-00000000004a', 'lawyer', 'L2');
update public.service_requests set assigned_to = '44444444-0000-0000-0000-00000000004a' where id = 'req-chat-1';
do $$
begin
  if exists (select 1 from public.chat_participants
              where room_id = 'aaaaaaaa-1111-0000-0000-000000000001'
                and user_id = '11111111-0000-0000-0000-00000000000a') then
    raise exception 'T7 FAIL: the previous lawyer is still in the room after reassignment';
  end if;
  if not exists (select 1 from public.chat_participants
                  where room_id = 'aaaaaaaa-1111-0000-0000-000000000001'
                    and user_id = '22222222-0000-0000-0000-00000000000c') then
    raise exception 'T7 FAIL: the client left the room on reassignment';
  end if;
  raise notice 'T7 PASS: messages cannot be backdated; a reassigned lawyer leaves the request room, the client stays';
end $$;
