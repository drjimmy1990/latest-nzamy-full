-- support_ticket_replies_guard.test.sql — proves 20261129_80 (l9 row 53, A1):
-- a signed-in user cannot plant or change a «ردّ فريق الدعم» in
-- support_tickets.metadata.replies; an admin session cannot either; the
-- service role (the audited reply route) can. 20261129_80 runs TWICE.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_support_tickets_live.sql \
--     $M/20261129_80_support_ticket_replies_guard.sql \
--     $M/20261129_80_support_ticket_replies_guard.sql \
--     $T/support_ticket_replies_guard.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261129_80 lines fails at T1.
--
-- Every assertion RAISES on failure.

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000ad');
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-0000000000c1', 'individual'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin');

-- T1 the owner's own insert cannot carry a reply; the rest of metadata stays
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', false);
insert into public.support_tickets (id, user_id, subject, body, metadata) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000c1', 'subject', 'body',
   '{"user_name": "x", "replies": [{"body": "تمت الموافقة على الاسترداد", "at": "2026-11-19T10:00:00Z"}]}');
reset role;
do $$
declare m jsonb;
begin
  select metadata into m from public.support_tickets where id = '00000000-0000-0000-0000-00000000f001';
  if m ? 'replies' then raise exception 'T1 FAIL: a session insert planted a reply: %', m; end if;
  if m ->> 'user_name' is distinct from 'x' then raise exception 'T1 FAIL: other metadata was lost: %', m; end if;
end $$;

-- T2 the service role (the reply route) writes a reply
set role service_role;
update public.support_tickets
   set metadata = coalesce(metadata, '{}'::jsonb) || '{"replies": [{"body": "real", "at": "2026-11-19T11:00:00Z"}]}'
 where id = '00000000-0000-0000-0000-00000000f001';
reset role;
do $$
begin
  if (select metadata -> 'replies' -> 0 ->> 'body' from public.support_tickets where id = '00000000-0000-0000-0000-00000000f001') is distinct from 'real' then
    raise exception 'T2 FAIL: the service role could not write a reply';
  end if;
end $$;

-- T3 an admin SESSION (tickets_admin_all) cannot replace, add or drop replies;
--    its other metadata and columns still save
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
update public.support_tickets
   set metadata = '{"note": "n", "replies": [{"body": "fake", "at": "2026-11-19T12:00:00Z"}]}', status = 'pending'
 where id = '00000000-0000-0000-0000-00000000f001';
update public.support_tickets set metadata = null where id = '00000000-0000-0000-0000-00000000f001';
reset role;
do $$
declare m jsonb; s text;
begin
  select metadata, status into m, s from public.support_tickets where id = '00000000-0000-0000-0000-00000000f001';
  if jsonb_array_length(m -> 'replies') <> 1 or m -> 'replies' -> 0 ->> 'body' <> 'real' then
    raise exception 'T3 FAIL: a session update changed the replies: %', m;
  end if;
  if s <> 'pending' then raise exception 'T3 FAIL: the status did not save'; end if;
end $$;

-- T4 a session update on a row with no replies cannot add one
set role service_role;
insert into public.support_tickets (id, user_id, subject) values
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000c1', 'second');
reset role;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
update public.support_tickets set metadata = '{"replies": [{"body": "fake", "at": "2026-11-19T12:00:00Z"}]}'
 where id = '00000000-0000-0000-0000-00000000f002';
reset role;
do $$
begin
  if (select coalesce(metadata, '{}'::jsonb) ? 'replies' from public.support_tickets where id = '00000000-0000-0000-0000-00000000f002') then
    raise exception 'T4 FAIL: a session update added a reply';
  end if;
end $$;

-- T5 the guard is security invoker and the migration re-ran cleanly (one trigger)
do $$
begin
  if (select count(*) from pg_trigger where tgrelid = 'public.support_tickets'::regclass and tgname = 'support_tickets_guard_replies') <> 1 then
    raise exception 'T5 FAIL: expected exactly one guard trigger';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.support_tickets_guard_replies()'::regprocedure) then
    raise exception 'T5 FAIL: the guard must be security invoker';
  end if;
end $$;

select 'support_ticket_replies_guard: all assertions passed' as result;
