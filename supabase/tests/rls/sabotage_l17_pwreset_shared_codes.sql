-- NEGATIVE CONTROL for l17_pwreset.test.sql (never a migration): replaces
-- pw_reset_verify with a version that also accepts a SIGN-UP code
-- (public.phone_otp_challenges), so the test must FAIL at Q3
-- («a sign-up code cannot reset a password»).
create or replace function public.pw_reset_verify(
  p_user uuid, p_target_hash text, p_phone text, p_code_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
begin
  if exists (select 1 from public.password_reset_challenges c
              where c.user_id = p_user and c.code_hash = p_code_hash and c.consumed_at is null)
     or exists (select 1 from public.phone_otp_challenges c
                 where c.user_id = p_user and c.code_hash = p_code_hash and c.consumed_at is null) then
    update public.password_reset_challenges set consumed_at = pg_catalog.now()
     where user_id = p_user and consumed_at is null;
    return pg_catalog.jsonb_build_object('ok', true);
  end if;
  return pg_catalog.jsonb_build_object('ok', false, 'reason', 'wrong');
end
$fn$;
