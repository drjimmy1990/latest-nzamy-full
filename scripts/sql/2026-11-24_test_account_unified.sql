-- ════════════════════════════════════════════════════════════════════════════
-- Operator script — the one «test» account is «everything open» (old item
-- 05-10; owner ١٠٩ default, file 05 #31). NOT a migration.
--
-- WHY: 20261202_20 (live since batch 12) gave public.test_accounts a `kind`:
--   'legacy'  (every row's default) — capped 5 cases / 5 consultations /
--             10 clients, all mail sunk;
--   'unified' — the one «test» account with its personas: NO demo cap, mail
--             stays in the admin's sink.
-- Nothing ever set the «test» account to 'unified', so it is still capped.
-- This marks ONE account (by its e-mail, given on the command line — never
-- written in this public file) as 'unified' — only if it is a test account
-- already (a test_accounts row, or profiles.is_demo); any other account is
-- left alone (it has no cap, and listing it would sandbox it). Staff
-- (user_type 'admin') are refused: staff are never test accounts.
--
-- RUN (replace the address; the -v value is quoted by psql):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     -v email="'<the test account e-mail>'" < scripts/sql/2026-11-24_test_account_unified.sql
-- Expect: NOTICE  test account set to unified: 1 row  — then the check row
--   below with kind = unified. Re-running is harmless (same row, same value).
--
-- ROLLBACK: update public.test_accounts set kind = 'legacy' where user_id = (that id);
-- ════════════════════════════════════════════════════════════════════════════

\if :{?email}
\else
  \echo 'usage: add  -v email=...  (the test account e-mail, see RUN above). Nothing changed.'
  \quit
\endif

begin;
set local lock_timeout = '10s';

select set_config('nzamy.test_email', lower(trim(:email)), true);

do $$
declare
  v_email text := current_setting('nzamy.test_email', true);
  v_user  uuid;
  v_type  text;
  v_n     int;
begin
  if to_regclass('public.test_accounts') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'test_accounts' and column_name = 'kind') then
    raise exception 'test_accounts.kind is missing — run 20261202_20 first';
  end if;
  if coalesce(v_email, '') = '' then
    raise exception 'pass the account e-mail with -v email=...';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is null then
    raise exception 'no account with that e-mail';
  end if;
  select p.user_type into v_type from public.profiles p where p.id = v_user;
  if coalesce(v_type, '') = 'admin' then
    raise exception 'staff account — never a test account';
  end if;

  if exists (select 1 from public.test_accounts t where t.user_id = v_user) then
    update public.test_accounts set kind = 'unified' where user_id = v_user;
    get diagnostics v_n = row_count;
  elsif exists (select 1 from public.profiles p where p.id = v_user and p.is_demo is true) then
    -- A demo-flagged account is a test account already (is_test_account), capped
    -- as 'legacy' because it has no row; the row only records its kind.
    insert into public.test_accounts (user_id, source, kind) values (v_user, 'l14_05_10', 'unified');
    get diagnostics v_n = row_count;
  else
    -- Not a test account at all: no demo cap applies to it, and making it one
    -- would also sandbox it (test-mode payments only). Nothing is changed.
    raise notice 'not a test account (no test_accounts row, not is_demo): it is not capped; nothing changed';
    return;
  end if;
  raise notice 'test account set to unified: % row', v_n;
end
$$;

-- check (masked address)
select left(split_part(u.email, '@', 1), 1) || '***@' || split_part(u.email, '@', 2) as account,
       t.kind, t.source
  from public.test_accounts t
  join auth.users u on u.id = t.user_id
 where lower(u.email) = current_setting('nzamy.test_email', true);

commit;
