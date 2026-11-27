-- =============================================================================
-- Migration: 20261209_30_l19_lawyer_otp_failed_delivery.sql
--            (batch l19-email, verify id: l19_lawyer_otp_failed_delivery)
-- =============================================================================
-- PURPOSE (LIVE-18, owner package 27 Nov 2026 — «عدم حرق تبريد ٦٠ ثانية عند الفشل»)
--
--   public.lawyer_otp_issue (20261124_70) refuses a new code when the same
--   user + purpose + channel had ANY code in the last 60 seconds, and when the
--   user + purpose had 5 codes in the last hour. A code whose e-mail could not
--   be sent is stamped delivery = 'failed' (and consumed) by the server
--   (src/lib/lawyerSignup/service.ts issueAndSend) — yet it still counted:
--   while mail was down, every press of «أرسل الرمز» burned the 60-second
--   cooldown and one of the 5 hourly codes, so a lawyer was locked out for up
--   to an hour even after mail came back.
--
--   This file re-creates lawyer_otp_issue from its ONE definition
--   (20261124_70 — no later migration re-defines it) with one change:
--     - the 60-second cooldown and the 5-per-hour count skip rows with
--       delivery = 'failed' (nothing reached the user);
--     - the 24-hour per-target count (10) STILL counts every row, failed ones
--       included: it bounds how often the mail server is tried for one address
--       (a send that timed out may still have been delivered, and repeated
--       failed logins can get the mailbox blocked by its provider).
--   'pending' rows (a send in progress) still count, as before.
--   Arguments, return shape, SECURITY DEFINER, search_path, advisory lock and
--   grants are unchanged.
--
-- DATA: none. No row is read, changed or deleted by this file.
-- ORDER: any time, before or after the deploy (the app code is unchanged).
--   Re-runnable.
-- ROLLBACK: re-run section 4c + the grants of 20261124_70.
-- TESTED: supabase/tests/rls/l19_lawyer_otp_failed_delivery.test.sql
--   (Docker, postgres:16, run twice; negative control without this file).
-- =============================================================================

set lock_timeout = '10s';

begin;

set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.lawyer_otp_challenges') is null then
    raise exception '20261209_30: public.lawyer_otp_challenges is missing — run 20261124_70 first';
  end if;
end
$pre$;

create or replace function public.lawyer_otp_issue(
  p_user uuid, p_purpose text, p_channel text, p_licence_no text,
  p_target_hash text, p_target_hint text, p_code_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_last  timestamptz;
  v_n     integer;
  v_old   timestamptz;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if p_user is null or p_purpose not in ('identity', 'email') then
    raise exception 'lawyer_otp_issue: bad arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lawyer_otp:' || p_user::text || ':' || p_purpose, 0));

  -- l19: a code whose send failed (delivery = 'failed') burns no cooldown.
  select max(created_at) into v_last from public.lawyer_otp_challenges
   where user_id = p_user and purpose = p_purpose and channel = p_channel
     and delivery <> 'failed';
  if v_last is not null and v_last > pg_catalog.now() - interval '60 seconds' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'cooldown',
      'retry_after', greatest(1, pg_catalog.ceil(60 - extract(epoch from pg_catalog.now() - v_last)))::integer);
  end if;

  -- l19: nor one of the 5 codes of the hour.
  select count(*)::integer, min(created_at) into v_n, v_old from public.lawyer_otp_challenges
   where user_id = p_user and purpose = p_purpose and created_at > pg_catalog.now() - interval '1 hour'
     and delivery <> 'failed';
  if v_n >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_limit',
      'retry_after', greatest(1, pg_catalog.ceil(3600 - extract(epoch from pg_catalog.now() - v_old)))::integer);
  end if;

  -- Every row counts here, failed ones included (see the header).
  select count(*)::integer into v_n from public.lawyer_otp_challenges
   where target_hash = p_target_hash and created_at > pg_catalog.now() - interval '24 hours';
  if v_n >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'target_limit', 'retry_after', 3600);
  end if;

  insert into public.lawyer_otp_challenges (user_id, purpose, channel, licence_no, target_hash, target_hint, code_hash)
  values (p_user, p_purpose, p_channel, p_licence_no, p_target_hash, p_target_hint, p_code_hash)
  returning id, expires_at into v_id, v_exp;

  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_exp);
end
$fn$;

comment on function public.lawyer_otp_issue(uuid, text, text, text, text, text, text) is
  '20261124_70 + 20261209_30: issue a code — 60 s cooldown per channel and 5 per hour per user+purpose (codes whose send FAILED do not count), 10 per 24 h per target across all users (every code counts). Stores hashes only. service_role only.';

revoke all on function public.lawyer_otp_issue(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.lawyer_otp_issue(uuid, text, text, text, text, text, text) to service_role;

do $verify$
declare
  f constant text := 'public.lawyer_otp_issue(uuid, text, text, text, text, text, text)';
  def text := pg_catalog.pg_get_functiondef(to_regprocedure(f));
  missing text := '';
  r text;
begin
  if pg_catalog.strpos(def, 'delivery <> ''failed''') = 0 then
    missing := missing || ' lawyer_otp_issue does not skip failed deliveries;';
  end if;
  if pg_catalog.strpos(def, 'target_limit') = 0 or pg_catalog.strpos(def, 'pg_advisory_xact_lock') = 0 then
    missing := missing || ' lawyer_otp_issue lost its per-target limit or its lock;';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc where oid = to_regprocedure(f) and prosecdef and proconfig @> array['search_path=""']) then
    missing := missing || ' lawyer_otp_issue is not SECURITY DEFINER with an empty search_path;';
  end if;
  if has_function_privilege('public', f, 'EXECUTE') then
    missing := missing || ' PUBLIC may execute lawyer_otp_issue;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' %s may execute lawyer_otp_issue;', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') and not has_function_privilege('service_role', f, 'EXECUTE') then
    missing := missing || ' service_role cannot execute lawyer_otp_issue;';
  end if;
  if missing <> '' then
    raise exception 'l19_lawyer_otp_failed_delivery verify FAILED:%', missing;
  end if;
  raise notice 'l19_lawyer_otp_failed_delivery verify: OK — a failed e-mail send no longer burns the 60 s cooldown or the hourly codes; the 24 h per-target limit still counts it';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261209_30 l19 lawyer otp: failed sends burn no cooldown' as migration, true as ok;
