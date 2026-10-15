-- =============================================================================
-- Migration: 20261016_03_chat_rls_fix.sql
-- =============================================================================
-- PURPOSE
--   The in-platform chat (client ⇄ lawyer, /dashboard/client/consultation/[id]
--   and the messages pages) cannot work on production, and its policies hide
--   three holes that open the moment the first defect is fixed naively.
--
--   D1  RECURSION. "participants read room membership" on chat_participants
--       queries chat_participants itself (schema dump 2026-10-10 :18510), so
--       EVERY read or write that touches chat_participants — and through it
--       chat_rooms and chat_messages — raises 42P17 «infinite recursion
--       detected in policy». GET /api/v1/chat/rooms answers 500.
--   D2  JOIN ANY ROOM. "room owners add participants" lets a user insert
--       `user_id = auth.uid()` into ANY room, with ANY role ('owner'
--       included), then read every message. Masked today only because D1
--       breaks the same INSERT; the owner's 10-06 package fix
--       (20261012_chat_participants_rls_recursion_fix.sql) removes D1 and
--       keeps this branch — it must NOT be applied; this file replaces it.
--   D3  SELF-PROMOTION. "participants update their own record" checks only
--       `user_id = auth.uid()`, so a member can set their own `role` to
--       'owner' and then add people and rename / close the room.
--   D4  MESSAGE MOVE. "senders update their own messages" checks only
--       `sender_id = auth.uid()`, so a sender can change `room_id` and drop a
--       message into a room they are not in; a participant can also post
--       message_type 'system' / 'ai_response' and impersonate the platform.
--   D5  BACKDATED MESSAGES. chat_messages INSERT was table-level, so a
--       participant could set created_at (or the id) on their own message —
--       backdate a line in a legal consultation.
--   D6  STALE MEMBERS. When a request is reassigned, the previous lawyer
--       stayed in its room and kept reading new messages.
--   Plus: GRANT ALL to anon on all three tables and the sequence.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. Two SECURITY DEFINER helpers that read chat_participants without RLS
--      (so no policy recursion), for the CALLER only — auth.uid() inside, no
--      user-id parameter, so nobody can probe another user's membership:
--        public.chat_is_participant(room uuid)   boolean
--        public.chat_is_room_admin(room uuid)    boolean  (owner / admin)
--      EXECUTE revoked from PUBLIC and anon; granted to authenticated and
--      service_role. search_path = ''.
--   2. Every existing policy on the three tables is dropped (catalogue lookup,
--      not by name) and these are created, all `to authenticated`:
--        chat_rooms         SELECT  participant
--                           UPDATE  room owner/admin   (columns: name, status)
--                           (no INSERT — see 4)
--        chat_participants  SELECT  own row or co-participant
--                           (no INSERT — participants are added by
--                            create_chat_room only: a room owner adding a
--                            stranger would show them the other party's
--                            messages)
--                           UPDATE  own row            (columns: last_read_at, muted)
--                           DELETE  own row            (leave the room)
--        chat_messages      SELECT  participant
--                           INSERT  sender = caller, participant, message_type
--                                   text / file / image / audio
--                           UPDATE  own message        (columns: body, edited_at, deleted_at)
--   3. Grants: anon and PUBLIC lose everything on the three tables and the
--      sequence; authenticated keeps exactly what the policies above use
--      (column-level UPDATE as listed); service_role keeps ALL.
--   4. Rooms are created by ONE function, public.create_chat_room(request_id,
--      participant_ids, name, room_type), SECURITY DEFINER:
--        * the caller must be signed in and a party of the service request
--          (its requester or its assignee);
--        * every other participant must be the other party of that request;
--        * one room per request: a second call returns the existing room (and
--          puts the caller in it if they were missing) — serialized with an
--          advisory lock per request;
--        * the caller becomes 'owner', the others 'member'.
--      It is also the only way a participant is added (no INSERT policy).
--      A room NOT tied to a service request cannot be created by a user — no
--      screen needs one today; opening chat between arbitrary users is a
--      product decision (see the plan of 2026-10-16).
--   5. Verify block — RAISES (the transaction rolls back) on a recursive
--      policy, a surviving INSERT branch for self-join, a write grant wider
--      than listed, an anon privilege, or a helper executable by anon.
--   6. notify pgrst to reload its schema cache.
--
-- CODE THAT GOES WITH IT (same commit)
--   src/app/api/v1/chat/rooms/route.ts — POST calls create_chat_room (it used
--   to insert the room and participants itself, which D1 and the room
--   SELECT-after-INSERT both broke, and it rejected the `type` field the
--   client sends); GET returns `related_id` (= request_id) so the consultation
--   page finds its room instead of creating a new one on every visit.
--
-- DEPLOY ORDER — THIS MIGRATION FIRST, THEN THE CODE
--   The new POST calls the function this file creates. Old code on the new
--   database: room creation fails as it already does today (the old POST is
--   broken by D1); reading and sending work again at once.
--
-- ROLLBACK
--   There is no safe rollback to the production policies (they are the
--   defect). To disable chat instead: revoke all on the three tables from
--   authenticated.
-- =============================================================================

begin;

-- ── 1. Non-recursive membership helpers (caller only) ───────────────────────
create or replace function public.chat_is_participant(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_participants cp
     where cp.room_id = p_room_id
       and cp.user_id = auth.uid()
  );
$$;

create or replace function public.chat_is_room_admin(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_participants cp
     where cp.room_id = p_room_id
       and cp.user_id = auth.uid()
       and cp.role in ('owner', 'admin')
  );
$$;

comment on function public.chat_is_participant(uuid) is
  'Is the CALLER (auth.uid()) a participant of this chat room? SECURITY DEFINER so the chat policies need not query chat_participants under RLS (that recursed: 42P17). 20261016_03.';
comment on function public.chat_is_room_admin(uuid) is
  'Is the CALLER an owner/admin of this chat room? See chat_is_participant. 20261016_03.';

revoke all on function public.chat_is_participant(uuid) from public, anon;
revoke all on function public.chat_is_room_admin(uuid) from public, anon;
grant execute on function public.chat_is_participant(uuid) to authenticated, service_role;
grant execute on function public.chat_is_room_admin(uuid) to authenticated, service_role;

-- ── 2. Policies: drop every one, recreate the set ────────────────────────────
do $$
declare
  p record;
begin
  for p in
    select pol.tablename, pol.policyname
      from pg_policies pol
     where pol.schemaname = 'public'
       and pol.tablename in ('chat_rooms', 'chat_participants', 'chat_messages')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    raise notice '20261016_03: dropped policy "%" on public.%', p.policyname, p.tablename;
  end loop;
end $$;

alter table public.chat_rooms        enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages     enable row level security;

create policy "chat rooms: participants read" on public.chat_rooms
  for select to authenticated
  using (public.chat_is_participant(id));
create policy "chat rooms: room admins update" on public.chat_rooms
  for update to authenticated
  using (public.chat_is_room_admin(id))
  with check (public.chat_is_room_admin(id));

create policy "chat participants: own row or co-participant reads" on public.chat_participants
  for select to authenticated
  using (user_id = auth.uid() or public.chat_is_participant(room_id));
create policy "chat participants: update own read state" on public.chat_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "chat participants: leave a room" on public.chat_participants
  for delete to authenticated
  using (user_id = auth.uid());

create policy "chat messages: participants read" on public.chat_messages
  for select to authenticated
  using (public.chat_is_participant(room_id));
create policy "chat messages: participants send" on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.chat_is_participant(room_id)
    and message_type in ('text', 'file', 'image', 'audio')
  );
create policy "chat messages: senders edit their own" on public.chat_messages
  for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- ── 3. Grants ────────────────────────────────────────────────────────────────
revoke all on public.chat_rooms, public.chat_participants, public.chat_messages from anon, public;
revoke all on sequence public.chat_messages_id_seq from anon, public;
revoke insert, update, delete, truncate, references, trigger
  on public.chat_rooms, public.chat_participants, public.chat_messages from authenticated;

grant select on public.chat_rooms to authenticated;
grant update (name, status) on public.chat_rooms to authenticated;

grant select, delete on public.chat_participants to authenticated;
grant update (last_read_at, muted) on public.chat_participants to authenticated;

grant select on public.chat_messages to authenticated;
-- D5: no created_at / id / edited_at / deleted_at on insert.
grant insert (room_id, sender_id, body, message_type, file_url, file_name, file_size, reply_to, metadata)
  on public.chat_messages to authenticated;
grant update (body, edited_at, deleted_at) on public.chat_messages to authenticated;
grant usage, select on sequence public.chat_messages_id_seq to authenticated;

grant all on public.chat_rooms, public.chat_participants, public.chat_messages to service_role;
grant all on sequence public.chat_messages_id_seq to service_role;

-- ── 4. Room creation: one function, request parties only ────────────────────
create or replace function public.create_chat_room(
  p_request_id      text,
  p_participant_ids uuid[],
  p_name            text default '',
  p_room_type       text default 'direct'
)
returns public.chat_rooms
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_req    record;
  v_others uuid[];
  v_room   public.chat_rooms;
begin
  if v_uid is null then
    raise exception 'create_chat_room: not signed in' using errcode = '42501';
  end if;
  if p_room_type is null or p_room_type not in ('direct', 'group') then
    raise exception 'create_chat_room: room_type must be direct or group' using errcode = '22023';
  end if;
  if p_request_id is null or btrim(p_request_id) = '' then
    raise exception 'create_chat_room: a chat room is opened from a service request' using errcode = '22023';
  end if;

  select sr.requester_user_id, sr.assigned_to
    into v_req
    from public.service_requests sr
   where sr.id = p_request_id;
  if not found or v_uid is distinct from v_req.requester_user_id and v_uid is distinct from v_req.assigned_to then
    raise exception 'create_chat_room: not a party to this request' using errcode = '42501';
  end if;

  v_others := array(
    select distinct x from unnest(coalesce(p_participant_ids, '{}'::uuid[])) as x
     where x is not null and x <> v_uid
  );
  if cardinality(v_others) = 0 then
    raise exception 'create_chat_room: no other participant' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_others) as x
              where x is distinct from v_req.requester_user_id
                and x is distinct from v_req.assigned_to) then
    raise exception 'create_chat_room: participants must be the parties of the request' using errcode = '42501';
  end if;
  if p_room_type = 'direct' and cardinality(v_others) <> 1 then
    raise exception 'create_chat_room: a direct room has exactly one other participant' using errcode = '22023';
  end if;

  -- One room per request, also under two parties opening it at once.
  perform pg_advisory_xact_lock(hashtextextended('chat_room:' || p_request_id, 0));

  select r.* into v_room
    from public.chat_rooms r
   where r.request_id = p_request_id
   order by r.created_at, r.id
   limit 1;

  if not found then
    insert into public.chat_rooms (room_type, name, request_id)
    values (p_room_type, left(coalesce(btrim(p_name), ''), 200), p_request_id)
    returning * into v_room;
    insert into public.chat_participants (room_id, user_id, role)
    values (v_room.id, v_uid, 'owner');
  else
    insert into public.chat_participants (room_id, user_id, role)
    values (v_room.id, v_uid, 'member')
    on conflict (room_id, user_id) do nothing;
  end if;

  insert into public.chat_participants (room_id, user_id, role)
  select v_room.id, x, 'member' from unnest(v_others) as x
  on conflict (room_id, user_id) do nothing;

  return v_room;
end;
$$;

comment on function public.create_chat_room(text, uuid[], text, text) is
  'Opens (or returns) THE chat room of a service request, for its two parties only. The only way a user creates a chat room. 20261016_03.';

revoke all on function public.create_chat_room(text, uuid[], text, text) from public, anon;
grant execute on function public.create_chat_room(text, uuid[], text, text) to authenticated, service_role;

-- D6: a reassigned request's previous lawyer leaves its room.
create or replace function public.chat_drop_previous_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.assigned_to is not null
     and old.assigned_to is distinct from new.assigned_to
     and old.assigned_to is distinct from new.requester_user_id then
    delete from public.chat_participants cp
     using public.chat_rooms r
     where r.id = cp.room_id
       and r.request_id = new.id
       and cp.user_id = old.assigned_to;
  end if;
  return null;
end;
$$;
revoke all on function public.chat_drop_previous_assignee() from public, anon, authenticated;

drop trigger if exists trg_chat_drop_previous_assignee on public.service_requests;
create trigger trg_chat_drop_previous_assignee
  after update of assigned_to on public.service_requests
  for each row execute function public.chat_drop_previous_assignee();

-- ── 5. Verify — raises, so a half-applied fix cannot look successful ─────────
do $$
declare
  t       text;
  missing text := '';
begin
  -- No policy on a chat table may query a chat table directly (the recursion).
  if exists (
    select 1 from pg_policies pol
     where pol.schemaname = 'public'
       and pol.tablename in ('chat_rooms', 'chat_participants', 'chat_messages')
       and (coalesce(pol.qual, '') ~ 'FROM\s+(public\.)?chat_participants'
            or coalesce(pol.with_check, '') ~ 'FROM\s+(public\.)?chat_participants')
  ) then
    missing := missing || ' a chat policy still queries chat_participants directly (42P17);';
  end if;
  -- No self-join: nobody inserts participants directly (create_chat_room does).
  if exists (
    select 1 from pg_policies pol
     where pol.schemaname = 'public' and pol.tablename = 'chat_participants'
       and pol.cmd in ('INSERT', 'ALL')
  ) or has_table_privilege('authenticated', 'public.chat_participants', 'INSERT') then
    missing := missing || ' chat_participants can be inserted into directly (self-join);';
  end if;
  if exists (select 1 from pg_policies pol
              where pol.schemaname = 'public' and pol.tablename = 'chat_rooms' and pol.cmd in ('INSERT', 'ALL')) then
    missing := missing || ' chat_rooms still has an INSERT policy (rooms are created by create_chat_room);';
  end if;

  foreach t in array array['public.chat_rooms', 'public.chat_participants', 'public.chat_messages']
  loop
    if has_any_column_privilege('anon', t, 'SELECT') or has_any_column_privilege('anon', t, 'INSERT')
       or has_any_column_privilege('anon', t, 'UPDATE') or has_table_privilege('anon', t, 'DELETE') then
      missing := missing || format(' anon holds a privilege on %s;', t);
    end if;
    if has_table_privilege('authenticated', t, 'UPDATE') then
      missing := missing || format(' authenticated holds table-level UPDATE on %s;', t);
    end if;
    if not has_table_privilege('service_role', t, 'INSERT') or not has_table_privilege('service_role', t, 'DELETE') then
      missing := missing || format(' service_role lost write on %s;', t);
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.chat_rooms', 'INSERT') then
    missing := missing || ' authenticated can INSERT chat_rooms directly;';
  end if;
  if has_column_privilege('authenticated', 'public.chat_participants', 'role', 'UPDATE')
     or has_column_privilege('authenticated', 'public.chat_participants', 'room_id', 'UPDATE') then
    missing := missing || ' a participant can change their role / room;';
  end if;
  if has_table_privilege('authenticated', 'public.chat_messages', 'INSERT')
     or has_column_privilege('authenticated', 'public.chat_messages', 'created_at', 'INSERT')
     or not has_column_privilege('authenticated', 'public.chat_messages', 'body', 'INSERT') then
    missing := missing || ' message INSERT is not limited to its content columns (created_at forgeable, or body not insertable);';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_chat_drop_previous_assignee') then
    missing := missing || ' the reassignment trigger is missing;';
  end if;
  if has_column_privilege('authenticated', 'public.chat_messages', 'room_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.chat_messages', 'sender_id', 'UPDATE') then
    missing := missing || ' a sender can move a message or change its sender;';
  end if;
  if not has_column_privilege('authenticated', 'public.chat_participants', 'last_read_at', 'UPDATE') then
    missing := missing || ' authenticated cannot mark a room read (last_read_at);';
  end if;
  if has_function_privilege('anon', 'public.chat_is_participant(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_chat_room(text, uuid[], text, text)', 'EXECUTE') then
    missing := missing || ' anon can execute a chat function;';
  end if;
  if not has_function_privilege('authenticated', 'public.create_chat_room(text, uuid[], text, text)', 'EXECUTE') then
    missing := missing || ' authenticated cannot execute create_chat_room;';
  end if;

  if missing <> '' then
    raise exception '20261016_03 verify:%', missing;
  end if;

  raise notice '20261016_03 verify: OK — chat policies non-recursive; no self-join, no self-promotion, no message move; anon out; rooms only through create_chat_room';
end $$;

commit;

-- ── 6. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';
