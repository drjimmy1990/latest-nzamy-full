-- prelude_l9_read.sql — state that exists BEFORE 20261129_40 runs, to prove its
-- one-time backfill: one user (BF) with one allowed and one refused document
-- in library_read_quota_docs today. Only the allowed one must reach
-- full_text_reads.
insert into auth.users (id) values ('9a000000-0000-0000-0000-0000000000bf') on conflict do nothing;
insert into public.profiles (id, user_type, display_name)
values ('9a000000-0000-0000-0000-0000000000bf', 'lawyer', 'BF') on conflict do nothing;
insert into public.library_read_quota_docs (user_id, day, doc_key, allowed) values
  ('9a000000-0000-0000-0000-0000000000bf', (now() at time zone 'Asia/Riyadh')::date, 'law:backfilled', true),
  ('9a000000-0000-0000-0000-0000000000bf', (now() at time zone 'Asia/Riyadh')::date, 'law:refused', false);
