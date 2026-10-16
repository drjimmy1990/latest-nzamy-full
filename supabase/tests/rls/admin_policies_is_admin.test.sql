-- admin_policies_is_admin.test.sql — proves 20261016_09 (plan item N21) on the
-- live shape of 2026-10-10 (prelude_admin_policies_live.sql). The migration runs
-- TWICE (idempotent), with 20261016_08 re-run between the two (its verify must
-- no longer ask that anon hold SELECT on profiles). Run from the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $T/prelude_admin_policies_live.sql \
--     $M/20261016_09_admin_policies_is_admin.sql $M/20261016_08_reassert_profiles_subscriptions_revokes.sql \
--     $M/20261016_09_admin_policies_is_admin.sql \
--     $T/admin_policies_is_admin.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-16):
--   NC1 — without the migration:
--     bash $T/run.sh $T/prelude_admin_policies_live.sql $T/admin_policies_is_admin.test.sql
--     → "T1 FAIL: … is not TO authenticated only" (and anon still holds SELECT).
--   NC2 — a PUBLIC policy that reads profiles inline, created after the dump:
--     bash $T/run.sh $T/prelude_admin_policies_live.sql $T/prelude_admin_policies_stray.sql \
--       $M/20261016_09_admin_policies_is_admin.sql $T/admin_policies_is_admin.test.sql
--     → the migration's guard raises "these policies read public.profiles and
--       apply to anon/PUBLIC … stray_admin_read on guest_notes" and rolls back.
-- The file runs as the superuser; every role-scoped assertion does `set local role`.
\set ON_ERROR_STOP on

-- T1: the catalog — the sixteen are TO authenticated via is_admin(); nothing
-- that reads profiles reaches a guest; anon holds no privilege on profiles.
do $$
declare
  spec record;
  pol  record;
  n    int;
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
    select p.polcmd::text as cmd, p.polroles from pg_policy p
     where p.polrelid = spec.tbl::regclass and p.polname = spec.name into pol;
    if not found then raise exception 'T1 FAIL: policy "%" on % is missing', spec.name, spec.tbl; end if;
    if pol.cmd <> spec.cmd then
      raise exception 'T1 FAIL: policy "%" on % changed command (% → %)', spec.name, spec.tbl, spec.cmd, pol.cmd;
    end if;
    if pol.polroles <> array['authenticated'::regrole::oid] then
      raise exception 'T1 FAIL: policy "%" on % is not TO authenticated only', spec.name, spec.tbl;
    end if;
  end loop;

  select count(*) into n from pg_policy p
   where (p.polroles = '{0}'::oid[] or 'anon'::regrole::oid = any (p.polroles))
     and exists (select 1 from pg_depend d
                  where d.classid = 'pg_policy'::regclass and d.objid = p.oid
                    and d.refclassid = 'pg_class'::regclass and d.refobjid = 'public.profiles'::regclass);
  if n <> 0 then raise exception 'T1 FAIL: % policy/policies reading profiles still reach anon/PUBLIC', n; end if;

  if has_table_privilege('anon', 'public.profiles', 'SELECT') or has_any_column_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception 'T1 FAIL: anon still holds SELECT on public.profiles';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.profiles'::regclass) <> 3 then
    raise exception 'T1 FAIL: public.profiles no longer carries exactly its 3 policies';
  end if;
  raise notice 'T1 PASS: 16 admin policies TO authenticated via is_admin(); none reading profiles reaches a guest; anon holds no privilege on profiles';
end $$;

-- T2: a guest reads every one of the twelve tables (no 42501), sees only the
-- public rows, still reads zero profiles (now 42501, not []), and can still
-- send the contact form.
do $$
declare
  spec record;
  n    int;
begin
  perform set_config('test.uid', '', true);
  execute 'set local role anon';
  for spec in
    select * from (values
      ('public.platform_settings', 1), ('public.articles', 1), ('public.blog_sections', 1),
      ('public.lawyer_profiles', 1), ('public.provider_profiles', 1), ('public.micro_profiles', 0),
      ('public.broadcasts', 0), ('public.contact_messages', 0), ('public.document_shares', 0),
      ('public.invitations', 0), ('public.support_tickets', 0), ('public.admin_audit_events', 0)
    ) as v(tbl, expected)
  loop
    begin
      execute format('select count(*) from %s', spec.tbl) into n;
    exception when insufficient_privilege then
      raise exception 'T2 FAIL: a guest read of % fails (%) — the revoke broke a guest page', spec.tbl, sqlerrm;
    end;
    if n <> spec.expected then
      raise exception 'T2 FAIL: a guest reads % row(s) of %, expected %', n, spec.tbl, spec.expected;
    end if;
  end loop;

  begin
    select count(*) into n from public.profiles;
    raise exception 'T2 FAIL: a guest could query public.profiles (% rows)', n;
  exception when insufficient_privilege then null;
  end;

  insert into public.contact_messages (name) values ('زائر ثانٍ');
  reset role;
  raise notice 'T2 PASS: a guest reads the 12 tables (public rows only), is refused on profiles, and can still send the contact form';
end $$;

-- T3: an admin keeps every read and write the inline policies gave.
do $$
declare
  spec record;
  n    int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  execute 'set local role authenticated';
  for spec in
    select * from (values
      ('public.platform_settings', 1), ('public.articles', 2), ('public.blog_sections', 1),
      ('public.lawyer_profiles', 1), ('public.provider_profiles', 1), ('public.micro_profiles', 1),
      ('public.broadcasts', 1), ('public.contact_messages', 2), ('public.document_shares', 1),
      ('public.invitations', 1), ('public.support_tickets', 1), ('public.admin_audit_events', 2),
      ('public.profiles', 4)
    ) as v(tbl, expected)
  loop
    execute format('select count(*) from %s', spec.tbl) into n;
    if n <> spec.expected then
      raise exception 'T3 FAIL: the admin reads % row(s) of %, expected %', n, spec.tbl, spec.expected;
    end if;
  end loop;

  update public.platform_settings set value = '{"status":"closed"}' where key = 'library_status';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the admin could not update platform_settings'; end if;
  insert into public.articles (title, status) values ('جديد', 'draft');
  insert into public.broadcasts (title) values ('تعميم ثانٍ');
  insert into public.blog_sections (code, label_ar) values ('guides', 'أدلة');
  update public.contact_messages set status = 'read';
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'T3 FAIL: the admin updated % contact message(s), expected 2', n; end if;
  update public.lawyer_profiles set verification_status = 'suspended';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the admin could not update a lawyer row'; end if;
  update public.provider_profiles set verification_status = 'suspended';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the admin could not update a provider row'; end if;
  reset role;
  raise notice 'T3 PASS: the admin reads all rows of the 12 tables and profiles, and writes settings, articles, broadcasts, blog sections, contact messages and lawyer/provider rows';
end $$;

-- T4: a signed-in non-admin sees public and own rows only, and cannot write
-- admin-only tables.
do $$
declare
  spec record;
  n    int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  execute 'set local role authenticated';
  for spec in
    select * from (values
      ('public.platform_settings', 1), ('public.articles', 1), ('public.blog_sections', 2),
      ('public.micro_profiles', 1), ('public.broadcasts', 0), ('public.contact_messages', 0),
      ('public.document_shares', 1), ('public.invitations', 1), ('public.support_tickets', 1),
      ('public.admin_audit_events', 1), ('public.profiles', 1)
    ) as v(tbl, expected)
  loop
    execute format('select count(*) from %s', spec.tbl) into n;
    if n <> spec.expected then
      raise exception 'T4 FAIL: a client reads % row(s) of %, expected %', n, spec.tbl, spec.expected;
    end if;
  end loop;

  update public.platform_settings set value = '{}';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T4 FAIL: a client updated platform_settings'; end if;
  begin
    insert into public.broadcasts (title) values ('مزيّف');
    raise exception 'T4 FAIL: a client inserted a broadcast';
  exception when insufficient_privilege then null;  -- 42501 new row violates row-level security
  end;
  begin
    insert into public.articles (title, status) values ('مزيّف', 'published');
    raise exception 'T4 FAIL: a client inserted an article';
  exception when insufficient_privilege then null;
  end;
  update public.contact_messages set status = 'spam';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T4 FAIL: a client updated contact messages'; end if;
  reset role;
  raise notice 'T4 PASS: a client reads public and own rows only and cannot write settings, broadcasts, articles or contact messages';
end $$;

-- T5: the lawyer still reads and updates the own row ("lawyers … own profile").
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  execute 'set local role authenticated';
  select count(*) into n from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 1 then raise exception 'T5 FAIL: the lawyer cannot read the own row'; end if;
  update public.lawyer_profiles set bio_ar = 'نبذة' where user_id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T5 FAIL: the lawyer cannot update the own row'; end if;
  reset role;
  raise notice 'T5 PASS: the lawyer reads and updates the own row';
end $$;
