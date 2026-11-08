-- =============================================================================
-- Migration: 20261109_11_share_passcode_lockout.sql
-- =============================================================================
-- WHY (security review 2026-11-08, SAST-04)
--   A document share link (public.document_shares) is opened with a 6-digit
--   passcode, checked by POST /api/v1/share/[token]/verify. Like the case
--   tracking links (case_tracking_unlock, 20261026_62), a share now keeps a
--   durable count of wrong passcodes in the database and locks itself, in
--   addition to the proxy's rate limiter.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. public.document_shares gains
--        failed_attempts int not null default 0   (0..5)
--        locked_until    timestamptz null
--      Existing rows: 0 / null (nothing to backfill).
--   2. public.share_passcode_check(p_token_hash text, p_passcode_hash text)
--        → jsonb {result: 'ok' | 'denied' | 'locked' | 'none'}
--      SECURITY DEFINER, search_path = '', EXECUTE for service_role only.
--      ONE locked row, one statement per outcome:
--        no share for the token (or a malformed hash)    → 'none'
--        no passcode on the share (an open link)         → 'ok'
--        locked_until in the future                      → 'locked' — even the
--          right passcode is refused, and the attempt is not counted, so the
--          answer says nothing about the passcode
--        right passcode                                  → 'ok', counter reset
--        wrong passcode, the 5th in a row                → 'locked' for 15
--                                                          minutes, counter reset
--        wrong passcode otherwise                        → 'denied', counter + 1
--      The two hashes are compared through a second, keyed hash (a fresh
--      random key per call), so the comparison time does not depend on how
--      much of the stored hash matches.
--   The route compares in the application only while this function is
--   missing (the old behaviour).
--
-- WHO CAN WRITE THE COLUMNS
--   The function (service role). The share's owner may also update his own
--   row (policy "document_shares owner update", 20261026_66) — he knows the
--   passcode, so resetting his own counter gains him nothing.
--
-- PREREQUISITES (the file raises without them)
--   20260706 (document_shares), 20260909 (token_hash / passcode_hash).
--
-- RUN ORDER — BEFORE THE DEPLOY
--   The old code ignores the new columns. The new code calls the function and
--   falls back to the old in-app comparison while it is missing (42883 /
--   PGRST202 / 42703), so either order works; the lock exists only once both
--   are live.
--
-- ROLLBACK
--   drop function if exists public.share_passcode_check(text, text);
--   alter table public.document_shares drop constraint if exists document_shares_attempts_check;
--   alter table public.document_shares drop column if exists locked_until,
--                                      drop column if exists failed_attempts;
--   notify pgrst, 'reload schema';
--
-- Docker: supabase/tests/rls/share_passcode_lockout.test.sql
-- =============================================================================

begin;

-- ── 0. prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.document_shares') is null then
    raise exception '20261109_11: public.document_shares is missing — run 20260706_content_and_ops.sql first';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'document_shares'
         and column_name in ('token_hash', 'passcode_hash')) <> 2 then
    raise exception '20261109_11: document_shares.token_hash / passcode_hash are missing — run 20260909_document_shares_hashes.sql first';
  end if;
end $$;

-- ── 1. the counter and the lock ──────────────────────────────────────────────
alter table public.document_shares
  add column if not exists failed_attempts int not null default 0,
  add column if not exists locked_until    timestamptz;

alter table public.document_shares drop constraint if exists document_shares_attempts_check;
alter table public.document_shares add constraint document_shares_attempts_check
  check (failed_attempts between 0 and 5);

comment on column public.document_shares.failed_attempts is
  'SAST-04 (20261109_11): wrong passcodes in a row since the last right one or the last lock. The 5th locks the share for 15 minutes (locked_until) and resets this to 0. Written by public.share_passcode_check.';
comment on column public.document_shares.locked_until is
  'SAST-04 (20261109_11): while in the future the share refuses every passcode, the right one included (public.share_passcode_check).';

-- ── 2. the check, in the database ────────────────────────────────────────────
create or replace function public.share_passcode_check(p_token_hash text, p_passcode_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v       record;
  v_key   text;
  v_match boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('result', 'none');
  end if;

  select s.id, s.passcode_hash, s.failed_attempts, s.locked_until
    into v
    from public.document_shares s
   where s.token_hash = p_token_hash
     for update;
  if not found then
    return pg_catalog.jsonb_build_object('result', 'none');
  end if;
  if v.passcode_hash is null then
    return pg_catalog.jsonb_build_object('result', 'ok');
  end if;
  if v.locked_until is not null and v.locked_until > pg_catalog.now() then
    return pg_catalog.jsonb_build_object('result', 'locked');
  end if;

  -- keyed second hash: equal digests iff equal inputs, and the comparison
  -- time does not depend on a shared prefix of the stored hash
  v_key := pg_catalog.gen_random_uuid()::text;
  v_match := p_passcode_hash is not null
             and p_passcode_hash ~ '^[0-9a-f]{64}$'
             and pg_catalog.sha256(pg_catalog.convert_to(v.passcode_hash || v_key, 'UTF8'))
               = pg_catalog.sha256(pg_catalog.convert_to(p_passcode_hash || v_key, 'UTF8'));

  if v_match then
    if v.failed_attempts <> 0 or v.locked_until is not null then
      update public.document_shares set failed_attempts = 0, locked_until = null where id = v.id;
    end if;
    return pg_catalog.jsonb_build_object('result', 'ok');
  end if;

  if v.failed_attempts + 1 >= 5 then
    update public.document_shares
       set failed_attempts = 0, locked_until = pg_catalog.now() + interval '15 minutes'
     where id = v.id;
    return pg_catalog.jsonb_build_object('result', 'locked');
  end if;

  update public.document_shares set failed_attempts = v.failed_attempts + 1 where id = v.id;
  return pg_catalog.jsonb_build_object('result', 'denied');
end $$;

comment on function public.share_passcode_check(text, text) is
  'SAST-04 (20261109_11): checks a share passcode (sha256 hex of both) under a row lock, with a durable counter: 5 wrong in a row lock the share for 15 minutes; while locked every passcode is refused uncounted. Answers {result: ok | denied | locked | none}. Service role only.';

revoke all on function public.share_passcode_check(text, text) from public, anon, authenticated;
grant execute on function public.share_passcode_check(text, text) to service_role;

-- ── 3. verify (raises on a failure) ──────────────────────────────────────────
do $$
declare
  fn  constant text := 'public.share_passcode_check(text, text)';
  cfg text[];
  r   text;
  fn_owner text;
begin
  select p.proconfig into cfg from pg_proc p where p.oid = to_regprocedure(fn);
  if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(fn))
     or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception '20261109_11 verify: % is not SECURITY DEFINER with search_path = ''''', fn;
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception '20261109_11 verify: % can EXECUTE %', r, fn;
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception '20261109_11 verify: service_role cannot EXECUTE %', fn;
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'document_shares'
         and column_name in ('failed_attempts', 'locked_until')) <> 2 then
    raise exception '20261109_11 verify: document_shares.failed_attempts / locked_until are missing';
  end if;
  -- the function runs as its owner: that role must read and update the row
  -- past RLS (on self-hosted Supabase the migration role is not always a superuser)
  select pg_get_userbyid(p.proowner) into fn_owner from pg_proc p where p.oid = to_regprocedure(fn);
  if not has_table_privilege(fn_owner, 'public.document_shares', 'SELECT, UPDATE') then
    raise exception '20261109_11 verify: %, the owner of share_passcode_check, cannot read/update public.document_shares', fn_owner;
  end if;
  if not exists (select 1 from pg_roles r where r.rolname = fn_owner and (r.rolsuper or r.rolbypassrls))
     and (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.document_shares'::regclass) <> fn_owner then
    raise exception '20261109_11 verify: %, the owner of share_passcode_check, neither owns public.document_shares nor bypasses RLS — every check would answer none', fn_owner;
  end if;
  raise notice '20261109_11 verify: OK — share passcodes are checked in the database: 5 wrong lock the share for 15 minutes; service role only';
end $$;

commit;
notify pgrst, 'reload schema';

-- ── check (the SQL editor shows only this last result) ───────────────────────
select 'share_passcode_check exists, service role only' as check,
       to_regprocedure('public.share_passcode_check(text, text)') is not null
       and not has_function_privilege('anon', 'public.share_passcode_check(text, text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.share_passcode_check(text, text)', 'EXECUTE')
       and has_function_privilege('service_role', 'public.share_passcode_check(text, text)', 'EXECUTE') as ok
union all
select 'document_shares has failed_attempts + locked_until',
       (select count(*) = 2 from information_schema.columns
         where table_schema = 'public' and table_name = 'document_shares'
           and column_name in ('failed_attempts', 'locked_until'));
