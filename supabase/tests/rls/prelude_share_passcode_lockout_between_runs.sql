-- prelude_share_passcode_lockout_between_runs.sql — runs BETWEEN the two
-- 20261109_11 runs in share_passcode_lockout.test.sql's chain: asserts the
-- first run left the function service-role-only, then grants EXECUTE to
-- PUBLIC, anon and authenticated (a self-host restore's default privileges).
-- The second run must take it back (T5 of the test).
do $$
begin
  if to_regprocedure('public.share_passcode_check(text, text)') is null then
    raise exception 'BETWEEN FAIL: the first 20261109_11 run did not create share_passcode_check';
  end if;
  if has_function_privilege('anon', 'public.share_passcode_check(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.share_passcode_check(text, text)', 'EXECUTE') then
    raise exception 'BETWEEN FAIL: after the first run a session can EXECUTE share_passcode_check';
  end if;
  raise notice 'BETWEEN PASS: the first run left share_passcode_check service role only';
end $$;

grant execute on function public.share_passcode_check(text, text) to public, anon, authenticated;
