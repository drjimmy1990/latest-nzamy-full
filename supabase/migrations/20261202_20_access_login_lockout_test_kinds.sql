-- =============================================================================
-- Migration: 20261202_20_access_login_lockout_test_kinds.sql
-- =============================================================================
-- PURPOSE (batch l12-access; owner package of 20 Nov 2026)
--
--   A. PER-ACCOUNT PASSWORD LOCKOUT (file 10 ب23; 06 ش2/ح3). After
--      max_failures wrong passwords inside window_minutes the sign-in is
--      refused for lock_minutes (default 5 / 15 / 15 — platform_settings
--      'auth_login_lockout', admin-editable). Two counters, one rule:
--        * 'i:<sha256 of the typed e-mail / mobile>' — kept by the new
--          server route POST /api/v1/auth/sign-in (the login page now signs
--          in through it). The identifier is counted whether or not an
--          account exists, so the lock says nothing about existence.
--        * 'u:<user id>' — kept by public.hook_password_verification_attempt,
--          GoTrue's «password verification attempt» hook. It is INERT until
--          the operator switches the hook on in the auth container
--          (GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED=true and
--          ..._URI=pg-functions://postgres/public/hook_password_verification_attempt).
--          Once on, a script calling GoTrue directly is locked too.
--      The route sends one e-mail per lock to the account (if one exists):
--      public.auth_login_claim_notice hands the address out once.
--      Tables: public.auth_login_attempts (append, pruned after a day) and
--      public.auth_login_locks — hashes and ids only, never a typed e-mail or
--      an IP. RLS on, no policy, nothing for anon / authenticated.
--
--   B. TEST ACCOUNT KINDS (owner ١٠٩ default «يسري ما لم تعترض», file 05 #31).
--      public.test_accounts.kind:
--        'legacy'     (default — every row today): exactly as before — capped
--                     5 cases / 5 consultations / 10 clients, all mail sunk;
--        'unified'    the one «test» account with its personas: NO cap; its
--                     mail stays in the admin's sink (codes read there);
--        'standalone' an independent test account with a real mailbox: NO
--                     demo cap (its plan's own limits), and mail TO ITS OWN
--                     address is really sent (sign-up / verification codes).
--                     Mail it causes to anyone else is still sunk, and a
--                     reserved test domain is always sunk.
--      The two functions are patched IN PLACE from their live definition
--      (pg_get_functiondef + one anchored replacement each), so nothing else
--      in them changes; a missing anchor stops the file.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261202_20_access_login_lockout_test_kinds.sql
--   Expect: NOTICE  l12_access verify: OK  and a row with `t`.
--
-- RUN ORDER: BEFORE the l12 deploy is safest (the new sign-in route then
--   counts from the first request); after works too — until it runs the route
--   finds no function, logs it once and signs in exactly as before (fail
--   open). Part B needs 20261127_80 and 20261129_90 (both live). Idempotent.
--
-- OPS (optional, after this file): switch the GoTrue hook on (see A) and
--   restart the auth container; check a wrong password 5× locks, and that
--   the right one works again after lock_minutes.
--
-- ROLLBACK:
--   drop function if exists public.hook_password_verification_attempt(jsonb),
--     public.auth_login_record(text, text, text, boolean), public.auth_login_lock_status(text, text, text),
--     public.auth_login_claim_notice(text, text, text), public.auth_login_fail(text, uuid, text),
--     public.auth_login_lockout_config(), public.auth_login_user(text, text);
--   drop table if exists public.auth_login_attempts, public.auth_login_locks;
--   delete from public.platform_settings where key = 'auth_login_lockout';
--   Part B: update public.test_accounts set kind = 'legacy'; (behaviour = before)
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261202_20: public.platform_settings is missing';
  end if;
  if to_regclass('public.test_accounts') is null
     or to_regprocedure('public.is_test_account(uuid)') is null
     or to_regprocedure('public.demo_guard_sandbox_row()') is null
     or to_regprocedure('public.test_mail_sink_check(text, uuid[], text, text, text)') is null then
    raise exception '20261202_20: run 20261127_80 and 20261129_90 first';
  end if;
end
$pre$;

-- ═══ A. login lockout ═════════════════════════════════════════════════════════

insert into public.platform_settings (key, value, description) values
  ('auth_login_lockout',
   '{"max_failures": 5, "window_minutes": 15, "lock_minutes": 15}'::jsonb,
   'قفل الدخول بعد محاولات خاطئة: عدد المحاولات، ونافذتها بالدقائق، ومدة القفل بالدقائق (20261202_20)')
on conflict (key) do nothing;

create table if not exists public.auth_login_attempts (
  id       bigint generated always as identity primary key,
  key_hash text        not null,
  source   text        not null default 'route',
  at       timestamptz not null default now()
);
create index if not exists auth_login_attempts_key_at on public.auth_login_attempts (key_hash, at desc);
create index if not exists auth_login_attempts_at on public.auth_login_attempts (at);
alter table public.auth_login_attempts drop constraint if exists auth_login_attempts_source_check;
alter table public.auth_login_attempts add constraint auth_login_attempts_source_check check (source in ('route', 'hook'));

create table if not exists public.auth_login_locks (
  key_hash     text primary key,
  user_id      uuid,
  failures     int         not null,
  locked_until timestamptz not null,
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.auth_login_attempts is
  'l12-access (20261202_20): failed sign-ins, keyed by a hash of the typed identifier (route) or the user id (GoTrue hook). No e-mail, no IP. Service role only; rows older than a day are pruned.';
comment on table public.auth_login_locks is
  'l12-access (20261202_20): a sign-in lock per key until locked_until. notified_at = the lock e-mail was handed out. Service role only.';

alter table public.auth_login_attempts enable row level security;
alter table public.auth_login_locks enable row level security;

do $gr$
declare r text;
begin
  revoke all on public.auth_login_attempts, public.auth_login_locks from public;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.auth_login_attempts, public.auth_login_locks from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.auth_login_attempts, public.auth_login_locks to service_role;
  end if;
end
$gr$;

-- The three numbers, bounded; a missing or bad row reads as 5 / 15 / 15.
create or replace function public.auth_login_lockout_config(
  out max_failures int, out window_minutes int, out lock_minutes int)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v jsonb;
begin
  select s.value into v from public.platform_settings s where s.key = 'auth_login_lockout';
  max_failures   := 5;
  window_minutes := 15;
  lock_minutes   := 15;
  if v is null or pg_catalog.jsonb_typeof(v) <> 'object' then
    return;
  end if;
  if pg_catalog.jsonb_typeof(v -> 'max_failures') = 'number' and (v ->> 'max_failures') ~ '^\d{1,3}$'
     and (v ->> 'max_failures')::int between 1 and 100 then
    max_failures := (v ->> 'max_failures')::int;
  end if;
  if pg_catalog.jsonb_typeof(v -> 'window_minutes') = 'number' and (v ->> 'window_minutes') ~ '^\d{1,4}$'
     and (v ->> 'window_minutes')::int between 1 and 1440 then
    window_minutes := (v ->> 'window_minutes')::int;
  end if;
  if pg_catalog.jsonb_typeof(v -> 'lock_minutes') = 'number' and (v ->> 'lock_minutes') ~ '^\d{1,4}$'
     and (v ->> 'lock_minutes')::int between 1 and 1440 then
    lock_minutes := (v ->> 'lock_minutes')::int;
  end if;
end
$fn$;

-- The account behind a typed e-mail / mobile, or null. GoTrue keeps the
-- mobile without its '+'. auth.users columns are read dynamically, so the
-- function compiles on a database whose auth.users lacks one of them.
create or replace function public.auth_login_user(p_email text, p_phone text,
  out user_id uuid, out email text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_phone text := pg_catalog.ltrim(pg_catalog.btrim(coalesce(p_phone, '')), '+');
begin
  if v_email <> '' and exists (select 1 from information_schema.columns
                                where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
    execute 'select u.id, u.email from auth.users u where pg_catalog.lower(u.email) = $1 limit 1'
      into user_id, email using v_email;
  elsif v_phone <> '' and exists (select 1 from information_schema.columns
                                   where table_schema = 'auth' and table_name = 'users' and column_name = 'phone') then
    execute 'select u.id from auth.users u where pg_catalog.ltrim(u.phone, ''+'') = $1 limit 1'
      into user_id using v_phone;
    if user_id is not null and exists (select 1 from information_schema.columns
                                        where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
      execute 'select u.email from auth.users u where u.id = $1' into email using user_id;
    end if;
  end if;
end
$fn$;

-- One failure on one key: counted, and the key locked once it reaches the
-- maximum inside the window (the count then starts again). Internal.
create or replace function public.auth_login_fail(p_key text, p_user uuid, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  c       record;
  v_n     int;
  v_until timestamptz;
begin
  select * into c from public.auth_login_lockout_config();
  select l.locked_until into v_until from public.auth_login_locks l
   where l.key_hash = p_key and l.locked_until > now();
  if v_until is not null then
    return jsonb_build_object('locked', true, 'locked_until', v_until, 'just_locked', false);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('auth_login:' || p_key));
  insert into public.auth_login_attempts (key_hash, source) values (p_key, p_source);
  delete from public.auth_login_attempts where at < now() - interval '1 day';
  select pg_catalog.count(*) into v_n from public.auth_login_attempts a
   where a.key_hash = p_key and a.at > now() - pg_catalog.make_interval(mins => c.window_minutes);
  if v_n < c.max_failures then
    return jsonb_build_object('locked', false, 'failures', v_n, 'max_failures', c.max_failures);
  end if;
  v_until := now() + pg_catalog.make_interval(mins => c.lock_minutes);
  insert into public.auth_login_locks (key_hash, user_id, failures, locked_until, notified_at)
  values (p_key, p_user, v_n, v_until, null)
  on conflict (key_hash) do update
     set user_id = excluded.user_id, failures = excluded.failures,
         locked_until = excluded.locked_until, notified_at = null, created_at = now();
  delete from public.auth_login_attempts a where a.key_hash = p_key;
  return jsonb_build_object('locked', true, 'locked_until', v_until, 'just_locked', true);
end
$fn$;

-- Is this sign-in locked? The identifier's key, or (when it names an
-- account) the account's own GoTrue-hook key.
create or replace function public.auth_login_lock_status(p_key text, p_email text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user  uuid;
  v_until timestamptz;
begin
  select u.user_id into v_user from public.auth_login_user(p_email, p_phone) u;
  select pg_catalog.max(l.locked_until) into v_until from public.auth_login_locks l
   where l.locked_until > now()
     and (l.key_hash = p_key or (v_user is not null and l.key_hash = 'u:' || v_user::text));
  return jsonb_build_object('locked', v_until is not null, 'locked_until', v_until);
end
$fn$;

-- The route's record of one attempt. A success clears the identifier's
-- counter (and the account's hook counter); a failure is counted.
create or replace function public.auth_login_record(p_key text, p_email text, p_phone text, p_ok boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid;
begin
  if p_key is null or pg_catalog.length(p_key) < 10 or pg_catalog.length(p_key) > 200 then
    raise exception 'auth_login_record: bad key' using errcode = '22023';
  end if;
  select u.user_id into v_user from public.auth_login_user(p_email, p_phone) u;
  if p_ok then
    delete from public.auth_login_attempts a
     where a.key_hash = p_key or (v_user is not null and a.key_hash = 'u:' || v_user::text);
    return jsonb_build_object('locked', false);
  end if;
  return public.auth_login_fail(p_key, v_user, 'route');
end
$fn$;

-- The lock e-mail, handed out ONCE per lock: the address of the account
-- behind the identifier when it (or the account's hook key) is locked and
-- not yet notified; null otherwise. The caller sends it (sendEmail).
create or replace function public.auth_login_claim_notice(p_key text, p_email text, p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user  uuid;
  v_email text;
  v_n     int;
begin
  select u.user_id, u.email into v_user, v_email from public.auth_login_user(p_email, p_phone) u;
  if v_user is null or coalesce(v_email, '') = '' then
    return null;
  end if;
  update public.auth_login_locks l set notified_at = now()
   where l.notified_at is null and l.locked_until > now()
     and (l.key_hash = p_key or l.key_hash = 'u:' || v_user::text);
  get diagnostics v_n = row_count;
  return case when v_n > 0 then v_email end;
end
$fn$;

-- GoTrue «password verification attempt» hook (inert until switched on in
-- the auth container). A locked account is refused even with the right
-- password; a wrong one is counted. Any error answers «continue» — the hook
-- must never stop every sign-in (fail open; the route still holds).
create or replace function public.hook_password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid;
  v_key  text;
begin
  begin
    v_user := (event ->> 'user_id')::uuid;
  exception when others then
    return jsonb_build_object('decision', 'continue');
  end;
  if v_user is null then
    return jsonb_build_object('decision', 'continue');
  end if;
  v_key := 'u:' || v_user::text;
  begin
    if exists (select 1 from public.auth_login_locks l where l.key_hash = v_key and l.locked_until > now()) then
      return jsonb_build_object(
        'decision', 'reject',
        'message', 'أُوقف الدخول إلى هذا الحساب مؤقتاً بعد محاولات دخول غير صحيحة متتالية. حاول لاحقاً، أو أعد تعيين كلمة المرور.',
        'should_logout_user', false);
    end if;
    if coalesce((event ->> 'valid')::boolean, false) then
      delete from public.auth_login_attempts a where a.key_hash = v_key;
    else
      perform public.auth_login_fail(v_key, v_user, 'hook');
    end if;
  exception when others then
    return jsonb_build_object('decision', 'continue');
  end;
  return jsonb_build_object('decision', 'continue');
end
$fn$;

comment on function public.hook_password_verification_attempt(jsonb) is
  'l12-access (20261202_20): GoTrue password-verification hook — refuses a locked account, counts a wrong password (auth_login_fail, key u:<id>). Inert until GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED=true. EXECUTE for supabase_auth_admin only.';

do $fg$
declare
  fn text;
  r  text;
begin
  foreach fn in array array[
    'public.auth_login_lockout_config()',
    'public.auth_login_user(text, text)',
    'public.auth_login_fail(text, uuid, text)',
    'public.auth_login_lock_status(text, text, text)',
    'public.auth_login_record(text, text, text, boolean)',
    'public.auth_login_claim_notice(text, text, text)',
    'public.hook_password_verification_attempt(jsonb)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on function %s from %I', fn, r);
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.auth_login_lock_status(text, text, text) to service_role;
    grant execute on function public.auth_login_record(text, text, text, boolean) to service_role;
    grant execute on function public.auth_login_claim_notice(text, text, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
  end if;
end
$fg$;

-- ═══ B. test account kinds (owner ١٠٩) ════════════════════════════════════════

alter table public.test_accounts add column if not exists kind text not null default 'legacy';
alter table public.test_accounts drop constraint if exists test_accounts_kind_check;
alter table public.test_accounts add constraint test_accounts_kind_check check (kind in ('legacy', 'unified', 'standalone'));
comment on column public.test_accounts.kind is
  'l12 (owner ١٠٩, 20261202_20): legacy = capped + all mail sunk (as before); unified = the one «test» account, no demo cap, mail sunk; standalone = no demo cap, mail to its own real address is sent.';

create or replace function public.test_account_kind(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce((select t.kind from public.test_accounts t where t.user_id = p_user), 'legacy');
$fn$;

do $fg2$
declare r text;
begin
  revoke all on function public.test_account_kind(uuid) from public;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.test_account_kind(uuid) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.test_account_kind(uuid) to service_role;
  end if;
end
$fg2$;

-- Patch the live definitions in place (one anchored change each).
do $patch$
declare
  v_def text;
  v_new text;
  c_cap_old constant text := 'continue when v_u is null or not public.is_test_account(v_u);';
  c_cap_new constant text := 'continue when v_u is null or not public.is_test_account(v_u) or public.test_account_kind(v_u) in (''unified'', ''standalone''); -- l12 (20261202_20): owner 109';
  c_decl_old constant text := '  v_masked   text;';
  c_decl_new constant text := '  v_masked   text;' || chr(10) || '  v_own      uuid; -- l12 (20261202_20): a standalone test account''s own mailbox';
  c_to_old  constant text := '  if v_to_user is not null and not public.is_test_account(v_to_user) then';
  c_to_new  constant text :=
       '  -- l12 (20261202_20, owner 109 / file 05 #31): mail to a STANDALONE test account''s own address is really sent' || chr(10)
    || '  if v_to_user is not null and public.is_test_account(v_to_user) and public.test_account_kind(v_to_user) = ''standalone'' then' || chr(10)
    || '    v_own := v_to_user;' || chr(10)
    || '    v_to_user := null;' || chr(10)
    || '  end if;' || chr(10)
    || '  if v_to_user is not null and not public.is_test_account(v_to_user) then';
  c_act_old constant text := '   where public.is_test_account(u)';
  c_act_new constant text := '   where public.is_test_account(u) and u is distinct from v_own';
begin
  -- the caps
  v_def := pg_catalog.pg_get_functiondef('public.demo_guard_sandbox_row()'::regprocedure);
  if pg_catalog.strpos(v_def, 'test_account_kind(v_u)') = 0 then
    if pg_catalog.strpos(v_def, c_cap_old) = 0 then
      raise exception '20261202_20: demo_guard_sandbox_row has no cap anchor — the live function changed; stop';
    end if;
    v_new := pg_catalog.replace(v_def, c_cap_old, c_cap_new);
    execute v_new;
  end if;

  -- the mail sink
  v_def := pg_catalog.pg_get_functiondef('public.test_mail_sink_check(text, uuid[], text, text, text)'::regprocedure);
  if pg_catalog.strpos(v_def, 'v_own') = 0 then
    if pg_catalog.strpos(v_def, c_decl_old) = 0 or pg_catalog.strpos(v_def, c_to_old) = 0 or pg_catalog.strpos(v_def, c_act_old) = 0 then
      raise exception '20261202_20: test_mail_sink_check has no anchor — the live function changed; stop';
    end if;
    v_new := pg_catalog.replace(v_def, c_decl_old, c_decl_new);
    v_new := pg_catalog.replace(v_new, c_to_old, c_to_new);
    v_new := pg_catalog.replace(v_new, c_act_old, c_act_new);
    execute v_new;
  end if;
end
$patch$;

-- ── verify ──────────────────────────────────────────────────────────────────
do $verify$
declare
  c record;
begin
  if not exists (select 1 from public.platform_settings where key = 'auth_login_lockout') then
    raise exception 'l12_access verify: auth_login_lockout row missing';
  end if;
  select * into c from public.auth_login_lockout_config();
  if c.max_failures is null or c.window_minutes is null or c.lock_minutes is null then
    raise exception 'l12_access verify: lockout config unreadable';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.auth_login_attempts'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.auth_login_locks'::regclass) then
    raise exception 'l12_access verify: RLS off on the lockout tables';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and (has_table_privilege('anon', 'public.auth_login_locks', 'SELECT')
          or has_function_privilege('anon', 'public.auth_login_record(text, text, text, boolean)', 'EXECUTE')
          or has_function_privilege('anon', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')) then
    raise exception 'l12_access verify: anon reaches the lockout';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.auth_login_attempts', 'SELECT')
          or has_function_privilege('authenticated', 'public.auth_login_claim_notice(text, text, text)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.test_account_kind(uuid)', 'EXECUTE')) then
    raise exception 'l12_access verify: authenticated reaches the lockout / kinds';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.demo_guard_sandbox_row()'::regprocedure), 'test_account_kind(v_u)') = 0 then
    raise exception 'l12_access verify: the cap patch is missing';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.test_mail_sink_check(text, uuid[], text, text, text)'::regprocedure), 'u is distinct from v_own') = 0 then
    raise exception 'l12_access verify: the sink patch is missing';
  end if;
  if exists (select 1 from public.test_accounts where kind is null) then
    raise exception 'l12_access verify: a test account without a kind';
  end if;
  raise notice 'l12_access verify: OK';
end
$verify$;

commit;

select '20261202_20 l12-access: login lockout (route + GoTrue hook, 5/15/15 setting) and test account kinds (legacy/unified/standalone)' as migration,
       exists (select 1 from public.platform_settings where key = 'auth_login_lockout')
       and to_regprocedure('public.hook_password_verification_attempt(jsonb)') is not null
       and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.demo_guard_sandbox_row()'::regprocedure), 'test_account_kind(v_u)') > 0 as ok;
