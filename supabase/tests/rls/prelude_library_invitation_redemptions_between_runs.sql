-- prelude_library_invitation_redemptions_between_runs.sql — runs BETWEEN the
-- two 20261109_10 runs in library_invitation_redemptions.test.sql's chain.
--   * asserts the first run left the function service-role-only;
--   * then grants EXECUTE on it, and ALL on the table, to PUBLIC, anon and
--     authenticated (the shape a self-host restore leaves behind). The second
--     run must take all of it back (T7 of the test).
do $$
begin
  if to_regprocedure('public.redeem_library_invitation(uuid, text)') is null then
    raise exception 'BETWEEN FAIL: the first 20261109_10 run did not create redeem_library_invitation';
  end if;
  if has_function_privilege('anon', 'public.redeem_library_invitation(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.redeem_library_invitation(uuid, text)', 'EXECUTE') then
    raise exception 'BETWEEN FAIL: after the first run a session can EXECUTE redeem_library_invitation';
  end if;
  raise notice 'BETWEEN PASS: the first run left redeem_library_invitation service role only';
end $$;

grant execute on function public.redeem_library_invitation(uuid, text) to public, anon, authenticated;
grant all on public.library_invitation_redemptions to public, anon, authenticated;
