-- =============================================================================
-- Migration: 20261109_14_academy_certificates_policy_service_role.sql
-- =============================================================================
-- WHY (security review 2026-11-08, X-4 — latent)
--   20260820_academy_schema.sql creates the policy
--   «Service role manage certificates» on academy.certificates as
--   `for all using (true)` with NO `to service_role`, so it applies to every
--   role. Certificates are written by the server only; the policy should say
--   so itself rather than rely on the API roles holding no write grant on the
--   academy schema.
--
-- WHAT IT DOES (idempotent; does nothing where the academy schema is absent)
--   Re-creates that policy `for all to service_role using (true) with check
--   (true)`. The service role bypasses RLS anyway, so nothing the server does
--   changes. The public read policy «Public verify certificates» (SELECT,
--   certificate verification by verify_id) is left as it is.
--   The app does not read or write schema academy through the API today (the
--   academy pages use the bundled question bank, src/data/academy), so no
--   caller is affected.
--
-- RUN ORDER — ANY TIME (independent of the deploy).
--
-- ROLLBACK
--   drop policy if exists "Service role manage certificates" on academy.certificates;
--   create policy "Service role manage certificates" on academy.certificates for all using (true);
-- =============================================================================

begin;

do $$
begin
  if to_regclass('academy.certificates') is null then
    raise notice '20261109_14: academy.certificates does not exist here (20260820_academy_schema.sql not applied) — nothing to do';
    return;
  end if;

  drop policy if exists "Service role manage certificates" on academy.certificates;
  create policy "Service role manage certificates" on academy.certificates
    for all to service_role
    using (true)
    with check (true);

  if exists (select 1 from pg_policies
              where schemaname = 'academy' and tablename = 'certificates'
                and cmd <> 'SELECT'
                and roles && array['public', 'anon', 'authenticated']::name[]) then
    raise exception '20261109_14 verify: a write-capable policy on academy.certificates still admits public / anon / authenticated';
  end if;
  raise notice '20261109_14 verify: OK — «Service role manage certificates» is TO service_role';
end $$;

commit;

-- ── check (the SQL editor shows only this last result) ───────────────────────
select 'no write-capable policy on academy.certificates admits public / anon / authenticated' as check,
       not exists (select 1 from pg_policies
                    where schemaname = 'academy' and tablename = 'certificates'
                      and cmd <> 'SELECT'
                      and roles && array['public', 'anon', 'authenticated']::name[]) as ok;
