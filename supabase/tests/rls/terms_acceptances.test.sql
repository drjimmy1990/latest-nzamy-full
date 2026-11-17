-- terms_acceptances.test.sql — proves 20261122_20 (R7, terms consent record).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20261122_20_terms_acceptances.sql \
--     $M/20261122_20_terms_acceptances.sql \
--     $T/terms_acceptances.test.sql
--
-- People: A and B, two signed-in users. Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b1');

-- app_user's privileges on the new table must come only through
-- `authenticated` (stubs.sql's default privileges hand it a direct grant).
revoke all on public.terms_acceptances from app_user;

-- ── T1 a session cannot write its own acceptance ────────────────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  insert into public.terms_acceptances (user_id, terms_version, context)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-11-18', 'signup');
  raise exception 'T1 FAIL: a session inserted an acceptance directly';
exception when insufficient_privilege then
  raise notice 'T1 PASS: a session cannot INSERT (42501)';
end $$;
reset role;

-- ── T2 anon has nothing ─────────────────────────────────────────────────────
set role anon;
do $$ begin
  perform 1 from public.terms_acceptances;
  raise exception 'T2 FAIL: anon read terms_acceptances';
exception when insufficient_privilege then
  raise notice 'T2 PASS: anon cannot SELECT (42501)';
end $$;
reset role;

-- ── T3 the service role writes; a duplicate version is a no-op ──────────────
set role service_role;
insert into public.terms_acceptances (user_id, terms_version, ip_hash, user_agent, context)
values ('00000000-0000-0000-0000-0000000000a1', '2026-11-18', repeat('a', 64), 'UA', 'signup')
on conflict (user_id, terms_version) do nothing;
insert into public.terms_acceptances (user_id, terms_version, ip_hash, user_agent, context)
values ('00000000-0000-0000-0000-0000000000a1', '2026-11-18', repeat('b', 64), 'UA2', 'relogin')
on conflict (user_id, terms_version) do nothing;
insert into public.terms_acceptances (user_id, terms_version, context)
values ('00000000-0000-0000-0000-0000000000b1', '2026-11-18', 'relogin')
on conflict (user_id, terms_version) do nothing;
do $$
declare n int; ctx text; h text;
begin
  select count(*), min(context), min(ip_hash) into n, ctx, h
    from public.terms_acceptances where user_id = '00000000-0000-0000-0000-0000000000a1';
  if n <> 1 or ctx <> 'signup' or h <> repeat('a', 64) then
    raise exception 'T3 FAIL: A has % rows (context %, hash %) — expected the first one only', n, ctx, h;
  end if;
  raise notice 'T3 PASS: service role inserts; the same version twice keeps the first row';
end $$;

-- ── T4 Riyadh time is derived by the trigger, not by the caller ─────────────
insert into public.terms_acceptances (user_id, terms_version, accepted_at, accepted_at_riyadh, context)
values ('00000000-0000-0000-0000-0000000000b1', '2026-12-01',
        '2026-12-01 21:30:00+00', '1999-01-01 00:00:00', 'relogin');
do $$
declare r timestamp;
begin
  select accepted_at_riyadh into r from public.terms_acceptances
   where user_id = '00000000-0000-0000-0000-0000000000b1' and terms_version = '2026-12-01';
  if r is distinct from '2026-12-02 00:30:00'::timestamp then
    raise exception 'T4 FAIL: accepted_at_riyadh is % — expected 2026-12-02 00:30:00', r;
  end if;
  raise notice 'T4 PASS: accepted_at_riyadh = accepted_at in Asia/Riyadh (a caller value is overwritten)';
end $$;

-- ── T5 the checks refuse a raw address, a long user agent, a bad context ────
do $$ begin
  insert into public.terms_acceptances (user_id, terms_version, ip_hash, context)
  values ('00000000-0000-0000-0000-0000000000b1', '2027-01-01', '203.0.113.7', 'signup');
  raise exception 'T5 FAIL: a raw IP was stored as ip_hash';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.terms_acceptances (user_id, terms_version, user_agent, context)
  values ('00000000-0000-0000-0000-0000000000b1', '2027-01-02', repeat('x', 257), 'signup');
  raise exception 'T5 FAIL: a 257-character user agent was stored';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.terms_acceptances (user_id, terms_version, context)
  values ('00000000-0000-0000-0000-0000000000b1', '2027-01-03', 'admin');
  raise exception 'T5 FAIL: an unknown context was stored';
exception when check_violation then
  raise notice 'T5 PASS: raw IP, overlong user agent and unknown context are refused';
end $$;
reset role;

-- ── T6 a user reads his own rows only ───────────────────────────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare n int; others int;
begin
  select count(*) into n from public.terms_acceptances;
  select count(*) into others from public.terms_acceptances
   where user_id <> '00000000-0000-0000-0000-0000000000a1';
  if n <> 1 or others <> 0 then
    raise exception 'T6 FAIL: A sees % rows, % of them not his', n, others;
  end if;
  raise notice 'T6 PASS: A reads his own row and none of B''s';
end $$;

-- ── T7 a session cannot change or delete even its own row ───────────────────
do $$ begin
  update public.terms_acceptances set terms_version = '2030-01-01';
  raise exception 'T7 FAIL: a session updated an acceptance';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  delete from public.terms_acceptances;
  raise exception 'T7 FAIL: a session deleted an acceptance';
exception when insufficient_privilege then
  raise notice 'T7 PASS: a session cannot UPDATE or DELETE (42501)';
end $$;
reset role;

-- ── T8 deleting the account deletes its rows ────────────────────────────────
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  if exists (select 1 from public.terms_acceptances where user_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'T8 FAIL: rows outlived the account';
  end if;
  raise notice 'T8 PASS: on delete cascade';
end $$;

select 'terms_acceptances: ALL PASS';
