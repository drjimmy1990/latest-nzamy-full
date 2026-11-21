-- ════════════════════════════════════════════════════════════════════════════
-- One-time operation — remove the 21 old test accounts (batch l12-access).
-- Owner answer ١٠٨ + file 05 #1 (register 14 #65/68): the old shared test
-- accounts are deleted; admin@nezamy.sa STAYS (new password + TOTP, done by
-- the operator separately). NOT a migration. Run by the operator only, on
-- the server, with psql (it uses psql variables — the SQL Editor cannot run it).
--
-- THE 21 (exact addresses — never a domain pattern; staff mail lives on the
-- same domain): the 11 role accounts of scripts/seed-clean-test-accounts.mjs
-- other than admin@, and lawyer1 … lawyer10 of scripts/seed-test-lawyers.mjs
-- (the same list 20261017_44 registered in public.test_accounts).
--
-- WHAT IT DOES, per account, inside ONE transaction:
--   1. DELETE FROM auth.users — GoTrue's own tables cascade, and so do the
--      public tables declared ON DELETE CASCADE / SET NULL;
--   2. if the delete is refused (a foreign key without cascade — e.g. a
--      payment or audit record — or a guard trigger), the account is BANNED
--      instead: banned_until = 2999-12-31, its sessions and refresh tokens deleted, its password hash
--      replaced by a value no password matches. Nobody can sign in to it.
--   It never touches admin@nezamy.sa, an admin account, or an address that is
--   not registered in public.test_accounts.
--
-- STEP 0 (recommended, from the admin site): «مسح دفعة الاختبار» for the
--   batch 'legacy' (/dashboard/admin/test-batches, needs a fresh TOTP code)
--   removes these accounts' tagged rows AND their stored files through the
--   Storage API first — then more of the 21 can be truly deleted, and no
--   file is left behind. This script never deletes storage files.
--
-- STEP 1 — DRY RUN (changes nothing; prints the list and the count):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < scripts/sql/2026-11-21_delete_21_old_test_accounts.sql
--   Read the table: every row «found» with user_type ≠ admin. The last line
--   says how many were found (expect 21).
--
-- STEP 2 — APPLY (typed confirmation + the count you saw in step 1):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     -v confirm=DELETE-21-OLD-TEST-ACCOUNTS -v expected=21 \
--     < scripts/sql/2026-11-21_delete_21_old_test_accounts.sql
--   It stops, changing nothing, unless the confirm text is exact AND exactly
--   `expected` accounts are found (if step 1 found fewer — some were removed
--   before — pass that number). The result table says, per account,
--   «deleted» or «banned» (and why).
--
-- STEP 3 — CHECK (read-only): run step 1 again — every row «not found» or
--   «banned»; then try one old address on /login (refused), and
--   curl -I https://nezamy.sa/lawyers/<an old slug> (404). Hand the owner the
--   list of addresses (no passwords).
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\if :{?confirm}
\else
  \set confirm ''
\endif
\if :{?expected}
\else
  \set expected 21
\endif

begin;
set local lock_timeout = '10s';
select set_config('nzamy.confirm', :'confirm', true), set_config('nzamy.expected', :'expected', true);

create temp table _targets (email text primary key) on commit drop;
insert into _targets (email) values
  ('client-free@nezamy.sa'), ('client-pro@nezamy.sa'), ('lawyer-solo@nezamy.sa'),
  ('firm-owner@nezamy.sa'), ('firm-lawyer@nezamy.sa'), ('corp-owner@nezamy.sa'),
  ('corp-legal@nezamy.sa'), ('micro-owner@nezamy.sa'), ('provider-notary@nezamy.sa'),
  ('gov-counsel@nezamy.sa'), ('ngo-director@nezamy.sa'),
  ('lawyer1@nezamy.sa'), ('lawyer2@nezamy.sa'), ('lawyer3@nezamy.sa'), ('lawyer4@nezamy.sa'),
  ('lawyer5@nezamy.sa'), ('lawyer6@nezamy.sa'), ('lawyer7@nezamy.sa'), ('lawyer8@nezamy.sa'),
  ('lawyer9@nezamy.sa'), ('lawyer10@nezamy.sa');

create temp table _result (
  email text primary key, user_id uuid, user_type text, in_test_accounts boolean,
  banned boolean, outcome text
) on commit drop;

-- the list as it stands (dry run and apply alike)
insert into _result (email, user_id, user_type, in_test_accounts, banned, outcome)
select t.email, u.id, p.user_type,
       exists (select 1 from public.test_accounts ta where ta.user_id = u.id),
       u.banned_until is not null and u.banned_until > now(),
       case when u.id is null then 'not found' else 'found' end
  from _targets t
  left join auth.users u on pg_catalog.lower(u.email) = t.email
  left join public.profiles p on p.id = u.id;

do $guard$
begin
  if (select count(*) from _targets) <> 21 then
    raise exception 'the list must hold exactly 21 addresses';
  end if;
  if exists (select 1 from _targets where email = 'admin@nezamy.sa') then
    raise exception 'admin@nezamy.sa is never a target';
  end if;
  if exists (select 1 from _result where user_type = 'admin') then
    raise exception 'an admin account is in the list — stop and check';
  end if;
end
$guard$;

do $apply$
declare
  v_confirm  text := current_setting('nzamy.confirm', true);
  v_expected int;
  v_found    int;
  r          record;
  v_err      text;
begin
  if coalesce(v_confirm, '') = '' then
    raise notice 'DRY RUN — nothing changed. % of 21 found (see the table). To apply: -v confirm=DELETE-21-OLD-TEST-ACCOUNTS -v expected=<that number>.',
      (select count(*) from _result where outcome = 'found');
    return;
  end if;
  if v_confirm <> 'DELETE-21-OLD-TEST-ACCOUNTS' then
    raise exception 'the confirm text is not exact — nothing changed';
  end if;
  begin
    v_expected := current_setting('nzamy.expected', true)::int;
  exception when others then
    raise exception 'expected must be a whole number — nothing changed';
  end;
  select count(*) into v_found from _result where outcome = 'found';
  if v_found <> v_expected then
    raise exception 'found % accounts, expected % — nothing changed (run the dry run again)', v_found, v_expected;
  end if;
  if exists (select 1 from _result where outcome = 'found' and not in_test_accounts) then
    raise exception 'an address is not registered in public.test_accounts — nothing changed: %',
      (select string_agg(email, ', ') from _result where outcome = 'found' and not in_test_accounts);
  end if;

  for r in select * from _result where outcome = 'found' order by email loop
    begin
      delete from auth.users where id = r.user_id;
      update _result set outcome = 'deleted' where email = r.email;
    exception when others then
      v_err := sqlerrm;
      update auth.users
         set banned_until = '2999-12-31 00:00:00+00',
             encrypted_password = 'disabled:' || gen_random_uuid()::text
       where id = r.user_id;
      if to_regclass('auth.refresh_tokens') is not null then
        execute 'delete from auth.refresh_tokens where user_id::text = $1' using r.user_id::text;
      end if;
      if to_regclass('auth.sessions') is not null then
        execute 'delete from auth.sessions where user_id = $1' using r.user_id;
      end if;
      update _result set outcome = 'banned (kept: ' || left(v_err, 120) || ')' where email = r.email;
    end;
  end loop;
  raise notice 'APPLIED — % deleted, % banned. Commit follows.',
    (select count(*) from _result where outcome = 'deleted'),
    (select count(*) from _result where outcome like 'banned%');
end
$apply$;

select email, coalesce(user_type, '—') as user_type,
       case when user_id is null then '—' when in_test_accounts then 'yes' else 'NO' end as in_test_accounts,
       case when banned then 'already banned' else '' end as before,
       outcome
  from _result order by email;

select 'admin@nezamy.sa still present (must be t)' as check,
       exists (select 1 from auth.users where pg_catalog.lower(email) = 'admin@nezamy.sa') as ok;

commit;
