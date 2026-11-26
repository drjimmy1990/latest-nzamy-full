-- NEGATIVE CONTROL for l18_phone_login.test.sql (never a migration): replaces
-- phone_sign_in_target with a version that drops the exactly-one rule and
-- hands out the FIRST account holding the confirmed number, so the test must
-- FAIL at Q2 («a number confirmed on two accounts signs nobody in»).
create or replace function public.phone_sign_in_target(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_id    uuid;
  v_email text;
begin
  select p.id, u.email into v_id, v_email
    from public.profiles p join auth.users u on u.id = p.id
   where p.phone_verified_at is not null and p.phone in (pg_catalog.btrim(p_phone),
                       pg_catalog.substr(pg_catalog.btrim(p_phone), 2),
                       '0' || pg_catalog.substr(pg_catalog.btrim(p_phone), 5))
   order by p.id
   limit 1;
  if v_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'user_id', v_id, 'email', v_email);
end
$fn$;
