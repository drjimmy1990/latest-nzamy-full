-- =============================================================================
-- Migration: 20261122_50_academy_certificates_private.sql
-- =============================================================================
-- PURPOSE (owner package 13 Nov, file 05, N05-A1)
--   20260820_academy_schema.sql lets ANYONE read every row of
--   academy.certificates («Public verify certificates», `using (true)`):
--   names, scores and verification numbers of every holder. This file:
--     1. drops that policy and lets a signed-in holder read only his own rows;
--     2. adds academy_verify_certificate(p_verify_id, p_holder_name), a
--        SECURITY DEFINER lookup that answers ONE certificate only when the
--        verification number AND the holder's name both match (spacing and
--        case ignored), and returns no user id. Callable by service_role only:
--        a future public verify page calls it from a rate-limited server route.
--   The app does not read schema academy today (the academy pages use the
--   bundled question bank), so no screen changes.
--
-- RUN ORDER: ANY TIME (independent of the deploy). Does nothing where the
--   academy schema is absent.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261122_50_academy_certificates_private.sql
--   Expect: NOTICE  20261122_50 verify: OK  and a row with `t`.
--
-- ROLLBACK
--   drop function if exists public.academy_verify_certificate(text, text);
--   drop policy if exists "Holder reads own certificates" on academy.certificates;
--   create policy "Public verify certificates" on academy.certificates for select using (true);
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $mig$
begin
  if to_regclass('academy.certificates') is null then
    raise notice '20261122_50: academy.certificates does not exist here — nothing to do';
    return;
  end if;

  execute 'drop policy if exists "Public verify certificates" on academy.certificates';
  execute 'drop policy if exists "Holder reads own certificates" on academy.certificates';
  execute $p$create policy "Holder reads own certificates" on academy.certificates
             for select to authenticated using (user_id = (select auth.uid()))$p$;

  execute $f$
    create or replace function public.academy_verify_certificate(p_verify_id text, p_holder_name text)
    returns table (verify_id text, user_name text, course_title text, category_name text,
                   score numeric, issued_date_hijri text, issued_date_gregorian text)
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select c.verify_id, c.user_name, c.course_title, c.category_name, c.score,
             c.issued_date_hijri, c.issued_date_gregorian
        from academy.certificates c
       where c.verify_id = btrim(p_verify_id)
         and length(btrim(coalesce(p_holder_name, ''))) >= 3
         and lower(regexp_replace(c.user_name, '\s+', ' ', 'g'))
             = lower(regexp_replace(btrim(p_holder_name), '\s+', ' ', 'g'))
       limit 1
    $body$
  $f$;
  execute 'comment on function public.academy_verify_certificate(text, text) is '
       || quote_literal('N05-A1 (20261122_50): one certificate by verification number AND holder name; no user id. Service role only (a rate-limited server route calls it).');
  execute 'revoke all on function public.academy_verify_certificate(text, text) from public, anon, authenticated';
  execute 'grant execute on function public.academy_verify_certificate(text, text) to service_role';
end
$mig$;

do $verify$
begin
  if to_regclass('academy.certificates') is null then
    raise notice '20261122_50 verify: OK (no academy schema here)';
    return;
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'academy' and tablename = 'certificates' and cmd = 'SELECT'
                and (qual is null or qual = 'true')
                and roles && array['public', 'anon', 'authenticated']::name[]) then
    raise exception '20261122_50 verify: a SELECT policy on academy.certificates still reads every row';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'academy' and tablename = 'certificates'
                    and policyname = 'Holder reads own certificates') then
    raise exception '20261122_50 verify: the holder policy is missing';
  end if;
  if has_function_privilege('anon', 'public.academy_verify_certificate(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.academy_verify_certificate(text, text)', 'EXECUTE') then
    raise exception '20261122_50 verify: academy_verify_certificate is callable by anon/authenticated';
  end if;
  raise notice '20261122_50 verify: OK';
end
$verify$;

commit;

select '20261122_50 academy certificates: own rows only + verify by number and name' as step,
       to_regclass('academy.certificates') is null
       or not exists (select 1 from pg_policies
                       where schemaname = 'academy' and tablename = 'certificates'
                         and policyname = 'Public verify certificates') as ok;
