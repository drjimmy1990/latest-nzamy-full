-- =============================================================================
-- 20261026_50_smart_folders_grants.sql — «مجلداتي» (library.smart_folders,
-- library.smart_folder_items): privileges, the missing UPDATE policy, and
-- length/shape limits.
-- =============================================================================
-- Based on the owner's 20261025_01_smart_folders_authenticated_grants.sql
-- (أ. أشرف ويح, «ملحق إصلاح مشكلات المكتبة الثلاث», 2026-10-25), reworked:
--
--   His fix moved every folder write in /api/library/folders and
--   /api/library/folders/items to the service client, with the owner check in
--   the route and the input limits in src/app/api/library/folders/validate.ts.
--   His migration ALSO granted INSERT / UPDATE / DELETE to `authenticated`.
--   That grant is NOT kept: with it, any signed-in user could write these
--   tables straight through PostgREST with the public anon key and his own
--   JWT, around the route's limits (a 10 MB folder name, any entity_type).
--   The code does not need it — the routes never write as `authenticated`.
--
-- What this does (idempotent; safe to run again):
--   1. RLS on both tables (already on since 20260626; asserted).
--   2. anon and PUBLIC hold NO privilege on either table. Guests keep their
--      folders in localStorage; 20260922_01's `grant select on all tables in
--      schema library to anon` had given anon SELECT here (no anon policy, so
--      0 rows — but no reason to hold it).
--   3. authenticated holds SELECT only (owner-only read policies of
--      20260626:804-855 still guard it); every write privilege is revoked,
--      including a GRANT ALL left by a self-host restore or by running the
--      owner's original file.
--   4. service_role holds ALL (the routes' writes).
--   5. The "Users can update own folder items" UPDATE policy (from his file):
--      completes the owner-only set for smart_folder_items. Harmless while
--      authenticated has no UPDATE privilege.
--   6. CHECK constraints mirroring validate.ts, added NOT VALID: they hold for
--      every new or updated row, but the rows already there are not scanned
--      (this migration cannot see prod data). A legacy row that breaks a limit
--      stays readable; an UPDATE of that row (pin, rename, recolour) fails
--      until it is fixed. Prod started clean on 2026-09-25 and every client
--      since sends hex colours and «📁», so none is expected. To check, then
--      validate:  alter table … validate constraint <name>;
--
-- The code works without this file (the routes use the service client); run it
-- any time. SQL_batch_2026-10-26_owner_answers/50_ANY_TIME_… is a copy.
-- Docker: supabase/tests/rls/smart_folders_grants.test.sql.
-- =============================================================================

begin;

alter table library.smart_folders      enable row level security;
alter table library.smart_folder_items enable row level security;

-- 2. no guest / PUBLIC access
revoke all on library.smart_folders      from anon, public;
revoke all on library.smart_folder_items from anon, public;

-- 3. signed-in users: read only (writes go through the routes)
revoke insert, update, delete, truncate, references, trigger
  on library.smart_folders, library.smart_folder_items from authenticated;
grant select on library.smart_folders, library.smart_folder_items to authenticated;

-- 4. the routes' writer
grant all on library.smart_folders, library.smart_folder_items to service_role;

-- 5. the missing owner-only UPDATE policy on items
drop policy if exists "Users can update own folder items" on library.smart_folder_items;
create policy "Users can update own folder items"
  on library.smart_folder_items
  for update
  to authenticated
  using (
    exists (select 1 from library.smart_folders f
             where f.id = smart_folder_items.folder_id and f.user_id = auth.uid())
  )
  with check (
    exists (select 1 from library.smart_folders f
             where f.id = smart_folder_items.folder_id and f.user_id = auth.uid())
  );

-- 6. limits (validate.ts), NOT VALID — see the header
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('library.smart_folders'::regclass, 'smart_folders_name_length',
       'char_length(name) between 1 and 80'),
      ('library.smart_folders'::regclass, 'smart_folders_color_hex',
       'color is null or color ~ ''^#[0-9A-Fa-f]{6}$'''),
      ('library.smart_folders'::regclass, 'smart_folders_icon_length',
       'icon is null or char_length(icon) between 1 and 8'),
      ('library.smart_folder_items'::regclass, 'smart_folder_items_entity_type',
       'entity_type in (''law'', ''order'', ''precedent'', ''book'')'),
      ('library.smart_folder_items'::regclass, 'smart_folder_items_entity_id_length',
       'char_length(entity_id) between 1 and 200'),
      ('library.smart_folder_items'::regclass, 'smart_folder_items_title_length',
       'title is null or char_length(title) <= 300'),
      ('library.smart_folder_items'::regclass, 'smart_folder_items_title_en_length',
       'title_en is null or char_length(title_en) <= 300')
    ) as t(tbl, name, expr)
  loop
    if not exists (select 1 from pg_constraint where conrelid = c.tbl and conname = c.name) then
      execute format('alter table %s add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
    end if;
  end loop;
end $$;

-- verify (raises → the transaction rolls back)
do $$
declare
  t   text;
  p   text;
begin
  foreach t in array array['library.smart_folders', 'library.smart_folder_items'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception '20261026_50 verify: RLS is off on %', t;
    end if;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', t, p) then
        raise exception '20261026_50 verify: anon still holds % on %', p, t;
      end if;
      if p <> 'SELECT' and has_table_privilege('authenticated', t, p) then
        raise exception '20261026_50 verify: authenticated still holds % on % (signed-in users could write around the route)', p, t;
      end if;
      if p in ('SELECT', 'INSERT', 'UPDATE', 'DELETE') and not has_table_privilege('service_role', t, p) then
        raise exception '20261026_50 verify: service_role lacks % on % (the folder routes would fail)', p, t;
      end if;
    end loop;
    -- column-level grants count too
    if has_any_column_privilege('anon', t, 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception '20261026_50 verify: anon holds a column privilege on %', t;
    end if;
    if has_any_column_privilege('authenticated', t, 'INSERT, UPDATE, REFERENCES') then
      raise exception '20261026_50 verify: authenticated holds a column-level write on %', t;
    end if;
  end loop;
  raise notice '20261026_50 verify: OK — smart folders: anon none, authenticated SELECT only, service_role writes, UPDATE policy and 7 limits in place';
end $$;

notify pgrst, 'reload schema';

commit;
