-- prelude_l18_shared_phone.sql — chain step (NOT a migration) for
-- l18_review_indexes.test.sql RUN B: two accounts confirmed with the same
-- stored number, and a third holding it in another spelling (unconfirmed).
-- Synthetic numbers only.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000051b1'), ('00000000-0000-0000-0000-0000000051b2'), ('00000000-0000-0000-0000-0000000051b3');
insert into public.profiles (id, user_type, display_name, phone, phone_verified_at) values
  ('00000000-0000-0000-0000-0000000051b1', 'individual', 'b1', '+966500000051', now()),
  ('00000000-0000-0000-0000-0000000051b2', 'individual', 'b2', '+966500000051', now()),
  ('00000000-0000-0000-0000-0000000051b3', 'individual', 'b3', '0500000051', null);
-- production's auth.users has it (the report 20261208_51 reads it)
alter table auth.users add column if not exists last_sign_in_at timestamptz;
