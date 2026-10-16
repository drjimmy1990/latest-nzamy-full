-- =============================================================================
-- Migration: 20261016_09_admin_policies_is_admin.sql   (plan item N21)
-- =============================================================================
-- PURPOSE
--   Sixteen policies on twelve tables decide "is the caller an admin?" by
--   reading public.profiles INLINE, with no TO clause — so they apply to PUBLIC,
--   i.e. to anon too:
--
--     USING (EXISTS (SELECT 1 FROM public.profiles p
--                     WHERE p.id = auth.uid() AND p.user_type = 'admin'))
--
--   Postgres checks the caller's SELECT privilege on every table a policy reads.
--   So anon has had to keep table-level SELECT on public.profiles (20261016_08
--   kept it on purpose): without it, every guest read of those twelve tables —
--   platform settings, published articles, blog sections, the lawyer and
--   provider directories — fails with 42501 "permission denied for table
--   profiles" (supabase/tests/rls/profiles_anon_policy_subquery.test.sql, T2).
--
--   The policies as on production (schema dump 2026-10-10; none of them was
--   touched by the 20261016_01..08 batch):
--     public.platform_settings   "Admins can modify platform settings"   ALL     (USING only)
--     public.lawyer_profiles     "admins read all lawyer profiles"       SELECT
--                                "admins update all lawyer profiles"     UPDATE  (USING only)
--     public.provider_profiles   "admins read all provider profiles"     SELECT
--                                "admins update all provider profiles"   UPDATE  (USING only)
--     public.micro_profiles      "admins read all micro profiles"        SELECT
--     public.articles            articles_admin_read_all                 SELECT
--                                articles_admin_write                    ALL
--     public.blog_sections       blog_sections_admin_write               ALL
--     public.broadcasts          broadcasts_admin_all                    ALL
--     public.contact_messages    contact_admin_read                      SELECT
--                                contact_admin_update                    UPDATE  (USING only)
--     public.document_shares     document_shares_admin_all               ALL
--     public.invitations         invitations_admin_all                   ALL
--     public.support_tickets     tickets_admin_all                       ALL
--     public.admin_audit_events  "users read own audit events"           SELECT  (own-row arm OR admin)
--
-- WHAT IT DOES (idempotent; one transaction)
--   1. Re-creates each of the sixteen with the SAME name and command, `TO
--      authenticated`, and `public.is_admin()` (SECURITY DEFINER, reads
--      profiles as its owner — 20260625_fix_rls_recursion.sql) in place of the
--      inline EXISTS. Where the original had USING only, so does the new one
--      (for ALL/UPDATE, Postgres then uses USING as the check). The audit-events
--      policy keeps its own-row arm: `actor_id = auth.uid() OR public.is_admin()`.
--      An admin is always signed in, so `TO authenticated` loses nobody; a guest
--      now evaluates no admin policy at all.
--   2. GUARD, before the revoke: no policy anywhere in the database whose
--      expression reads public.profiles (pg_depend — every relation a policy
--      expression references is recorded there) may still apply to anon or
--      PUBLIC. A policy created after the 2026-10-10 dump, or one this list
--      missed, aborts the whole file here instead of breaking guest pages.
--   3. Takes every privilege on public.profiles away from anon (and PUBLIC) —
--      the SELECT that 20260921_01 revoked and the self-host restore gave back.
--      This finishes 20260921_01. authenticated keeps SELECT (RLS: own row,
--      admins all) and its 20261016_02 column UPDATE list; service_role keeps
--      everything.
--   4. Verify block (raises → the whole file rolls back):
--      * the sixteen exist, `TO authenticated` only, with their command, and
--        none of them reads profiles any more;
--      * the guard again;
--      * anon holds no table or column privilege on public.profiles;
--      * authenticated keeps SELECT on profiles and EXECUTE on is_admin();
--      * LIVE PROBE: as anon, `select 1 … limit 1` on every table and view in
--        `public` that anon may read. Any 42501 is a guest page this revoke
--        would break (a SECURITY INVOKER helper that reads profiles is invisible
--        to pg_depend; this catches it). Skipped with a NOTICE where the
--        session cannot `set role anon`.
--
-- APP CODE — NONE NEEDED (grep of src/, 2026-10-16)
--   Every read of public.profiles with the anon key runs behind a signed-in
--   user (`if (user)` / after getUser(): proxy.ts, auth/session, assertRole,
--   requireAdmin, useUser, the AI pages' `authUser ? … : …`), i.e. as
--   `authenticated`. Every guest-facing read of another user's profile goes
--   through the service role (api/v1/lawyers, lawyers/[id], lawyers/[slug]
--   layout, reviews, community/contributors, invite/[code]).
--
-- DEPLOY ORDER — INDEPENDENT (any time). After it, re-running
--   20260921_01_profiles_rls_lockdown.sql is safe again, and re-running
--   20261016_08 no longer expects anon to hold SELECT.
--
-- ROLLBACK
--   `grant select on public.profiles to anon;` restores the old posture (the
--   guest still reads zero rows). The policies need no rollback: they grant
--   exactly what they granted before to every signed-in caller.
-- =============================================================================

begin;

-- ── 1. The sixteen admin policies: TO authenticated, public.is_admin() ──────

drop policy if exists "Admins can modify platform settings" on public.platform_settings;
create policy "Admins can modify platform settings" on public.platform_settings
  for all to authenticated
  using (public.is_admin());

drop policy if exists "admins read all lawyer profiles" on public.lawyer_profiles;
create policy "admins read all lawyer profiles" on public.lawyer_profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins update all lawyer profiles" on public.lawyer_profiles;
create policy "admins update all lawyer profiles" on public.lawyer_profiles
  for update to authenticated
  using (public.is_admin());

drop policy if exists "admins read all provider profiles" on public.provider_profiles;
create policy "admins read all provider profiles" on public.provider_profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admins update all provider profiles" on public.provider_profiles;
create policy "admins update all provider profiles" on public.provider_profiles
  for update to authenticated
  using (public.is_admin());

drop policy if exists "admins read all micro profiles" on public.micro_profiles;
create policy "admins read all micro profiles" on public.micro_profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists articles_admin_read_all on public.articles;
create policy articles_admin_read_all on public.articles
  for select to authenticated
  using (public.is_admin());

drop policy if exists articles_admin_write on public.articles;
create policy articles_admin_write on public.articles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists blog_sections_admin_write on public.blog_sections;
create policy blog_sections_admin_write on public.blog_sections
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists broadcasts_admin_all on public.broadcasts;
create policy broadcasts_admin_all on public.broadcasts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists contact_admin_read on public.contact_messages;
create policy contact_admin_read on public.contact_messages
  for select to authenticated
  using (public.is_admin());

drop policy if exists contact_admin_update on public.contact_messages;
create policy contact_admin_update on public.contact_messages
  for update to authenticated
  using (public.is_admin());

drop policy if exists document_shares_admin_all on public.document_shares;
create policy document_shares_admin_all on public.document_shares
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists invitations_admin_all on public.invitations;
create policy invitations_admin_all on public.invitations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists tickets_admin_all on public.support_tickets;
create policy tickets_admin_all on public.support_tickets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "users read own audit events" on public.admin_audit_events;
create policy "users read own audit events" on public.admin_audit_events
  for select to authenticated
  using (actor_id = auth.uid() or public.is_admin());

-- ── 2. Guard: nothing that reads profiles may still reach a guest ───────────
do $$
declare
  offenders text;
begin
  select string_agg(format('%s on %s', pol.polname, pol.polrelid::regclass), '; '
                    order by pol.polrelid::regclass::text, pol.polname)
    into offenders
    from pg_policy pol
   where (pol.polroles = '{0}'::oid[] or 'anon'::regrole::oid = any (pol.polroles))
     and exists (select 1 from pg_depend d
                  where d.classid = 'pg_policy'::regclass
                    and d.objid = pol.oid
                    and d.refclassid = 'pg_class'::regclass
                    and d.refobjid = 'public.profiles'::regclass);
  if offenders is not null then
    raise exception '20261016_09: these policies read public.profiles and apply to anon/PUBLIC — re-create them TO authenticated USING (public.is_admin()) first, or guest reads of their tables fail with 42501 once anon loses SELECT on profiles: %', offenders;
  end if;
end $$;

-- ── 3. anon: no privilege of any kind on public.profiles ─────────────────────
revoke all on public.profiles from anon, public;
grant all on public.profiles to service_role;

-- Marker (read by _verify.sql). Replaces the 20260921_01 text, which said the
-- same thing before the self-host restore re-granted anon's SELECT.
comment on table public.profiles is
  'Extended user profile. One row per auth.users entry. Readable only by its owner and by admins (public.is_admin()). anon holds no privilege since 20261016_09 (N21): no policy that reads profiles applies to guests. See supabase/migrations/20260921_01_profiles_rls_lockdown.sql and 20261016_09_admin_policies_is_admin.sql.';

-- ── 4. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  spec       record;
  pol        record;
  t          record;
  n          int;
  can_probe  boolean := true;
  missing    text := '';
  probe_fail text := '';
begin
  for spec in
    select * from (values
      ('public.platform_settings',  'Admins can modify platform settings', '*'),
      ('public.lawyer_profiles',    'admins read all lawyer profiles',     'r'),
      ('public.lawyer_profiles',    'admins update all lawyer profiles',   'w'),
      ('public.provider_profiles',  'admins read all provider profiles',   'r'),
      ('public.provider_profiles',  'admins update all provider profiles', 'w'),
      ('public.micro_profiles',     'admins read all micro profiles',      'r'),
      ('public.articles',           'articles_admin_read_all',             'r'),
      ('public.articles',           'articles_admin_write',                '*'),
      ('public.blog_sections',      'blog_sections_admin_write',           '*'),
      ('public.broadcasts',         'broadcasts_admin_all',                '*'),
      ('public.contact_messages',   'contact_admin_read',                  'r'),
      ('public.contact_messages',   'contact_admin_update',                'w'),
      ('public.document_shares',    'document_shares_admin_all',           '*'),
      ('public.invitations',        'invitations_admin_all',               '*'),
      ('public.support_tickets',    'tickets_admin_all',                   '*'),
      ('public.admin_audit_events', 'users read own audit events',         'r')
    ) as v(tbl, name, cmd)
  loop
    select p.oid, p.polcmd, p.polroles,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
      into pol
      from pg_policy p
     where p.polrelid = spec.tbl::regclass and p.polname = spec.name;
    if not found then
      missing := missing || format(' policy "%s" on %s is missing;', spec.name, spec.tbl);
      continue;
    end if;
    if pol.polcmd::text <> spec.cmd then
      missing := missing || format(' policy "%s" on %s has command %s, expected %s;', spec.name, spec.tbl, pol.polcmd, spec.cmd);
    end if;
    if pol.polroles <> array['authenticated'::regrole::oid] then
      missing := missing || format(' policy "%s" on %s is not TO authenticated only;', spec.name, spec.tbl);
    end if;
    if position('is_admin()' in pol.expr) = 0 then
      missing := missing || format(' policy "%s" on %s does not call is_admin();', spec.name, spec.tbl);
    end if;
    if exists (select 1 from pg_depend d
                where d.classid = 'pg_policy'::regclass and d.objid = pol.oid
                  and d.refclassid = 'pg_class'::regclass
                  and d.refobjid = 'public.profiles'::regclass) then
      missing := missing || format(' policy "%s" on %s still reads public.profiles inline;', spec.name, spec.tbl);
    end if;
  end loop;

  select count(*) into n
    from pg_policy p
   where (p.polroles = '{0}'::oid[] or 'anon'::regrole::oid = any (p.polroles))
     and exists (select 1 from pg_depend d
                  where d.classid = 'pg_policy'::regclass and d.objid = p.oid
                    and d.refclassid = 'pg_class'::regclass
                    and d.refobjid = 'public.profiles'::regclass);
  if n <> 0 then
    missing := missing || format(' %s policy/policies that read public.profiles still apply to anon/PUBLIC;', n);
  end if;

  if has_table_privilege('anon', 'public.profiles', 'SELECT')
     or has_table_privilege('anon', 'public.profiles', 'INSERT')
     or has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.profiles', 'DELETE')
     or has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
     or has_table_privilege('anon', 'public.profiles', 'REFERENCES')
     or has_table_privilege('anon', 'public.profiles', 'TRIGGER')
     or has_any_column_privilege('anon', 'public.profiles', 'SELECT')
     or has_any_column_privilege('anon', 'public.profiles', 'UPDATE')
     or has_any_column_privilege('anon', 'public.profiles', 'INSERT') then
    missing := missing || ' anon still holds a privilege on public.profiles;';
  end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    missing := missing || ' authenticated lost SELECT on public.profiles (every signed-in page would fail);';
  end if;
  if not has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') then
    missing := missing || ' authenticated cannot EXECUTE public.is_admin() (every policy above would fail for signed-in users);';
  end if;
  if not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then
    missing := missing || ' service_role lost read/write on public.profiles;';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.profiles'::regclass
        and (polroles = '{0}'::oid[] or 'anon'::regrole::oid = any (polroles))) <> 0 then
    missing := missing || ' a policy on public.profiles itself reaches anon/PUBLIC;';
  end if;

  if missing <> '' then
    raise exception '20261016_09 verify:%', missing;
  end if;

  -- Live probe: every guest-readable table and view in `public`, as anon.
  begin
    execute 'set local role anon';
  exception when insufficient_privilege then
    can_probe := false;
  end;
  if can_probe then
    execute 'set local statement_timeout = ''5s''';
    for t in
      select c.oid::regclass as rel
        from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind in ('r', 'p', 'v')
         and has_any_column_privilege('anon', c.oid, 'SELECT')
       order by 1
    loop
      begin
        execute format('select 1 from %s limit 1', t.rel);
      exception
        when insufficient_privilege then
          -- Only "permission denied for table profiles" is this revoke's doing;
          -- any other 42501 was there before it (reported, not fatal).
          if sqlerrm ilike '%table profiles%' then
            probe_fail := probe_fail || format(' %s (%s);', t.rel, sqlerrm);
          else
            raise notice '20261016_09: guest read of % already fails for another reason (%) — not caused by this file', t.rel, sqlerrm;
          end if;
        when query_canceled then
          raise notice '20261016_09: guest probe of % timed out (5 s) — not a privilege error, skipped', t.rel;
        when others then
          raise notice '20261016_09: guest read of % fails for another reason (% %) — not caused by this file', t.rel, sqlstate, sqlerrm;
      end;
    end loop;
    execute 'reset statement_timeout';
    execute 'reset role';
    if probe_fail <> '' then
      raise exception '20261016_09 verify: a guest read fails without SELECT on public.profiles:%', probe_fail;
    end if;
  else
    raise notice '20261016_09: this session cannot SET ROLE anon — the live guest probe was skipped (the catalog checks above passed)';
  end if;

  raise notice '20261016_09 verify: OK — 16 admin policies TO authenticated via is_admin(); anon holds no privilege on public.profiles; every guest-readable table in public still reads as anon';
end $$;

commit;

notify pgrst, 'reload schema';
