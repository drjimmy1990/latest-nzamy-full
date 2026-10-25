-- prelude_smart_folders_live.sql — the live shape of «مجلداتي» before
-- 20261026_50, for smart_folders_grants.test.sql.
--   * 20260906's pin column (that migration's other tables are not needed).
--   * 20260922_01's `grant select on all tables in schema library to anon,
--     authenticated` (20260626 already did the same).
--   * The worst stray grants a restore — or the owner's original
--     20261025_01 file — could leave: table-level writes and a column-level
--     UPDATE for authenticated, a column-level SELECT for anon.
--   * Two legacy rows that break the new limits (a 90-character name, a
--     non-hex colour, an «article» item), to prove NOT VALID keeps them.
--   * stubs.sql already made a minimal library.smart_folders (so 20260626's
--     `create table if not exists` skipped it): the colour / icon columns of
--     the real 20260626 table are added here.
-- People: …a1 owns a folder, …a2 owns another.
alter table library.smart_folders
  add column if not exists color varchar(30),
  add column if not exists icon  varchar(50);
alter table library.smart_folders add column if not exists is_pinned boolean not null default false;

grant select on all tables in schema library to anon, authenticated;
grant insert, update, delete, truncate on library.smart_folders, library.smart_folder_items to authenticated;
grant update (name) on library.smart_folders to authenticated;
grant select (id, name) on library.smart_folders to anon;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2')
on conflict do nothing;

insert into library.smart_folders (id, user_id, name, color, icon) values
  ('00000000-0000-0000-0000-0000000f00a1', '00000000-0000-0000-0000-0000000000a1', 'أنظمة العمل', '#10b981', '📁'),
  ('00000000-0000-0000-0000-0000000f00a2', '00000000-0000-0000-0000-0000000000a2', repeat('ن', 90), 'red', '📁')
on conflict do nothing;

insert into library.smart_folder_items (id, folder_id, entity_type, entity_id, title) values
  ('00000000-0000-0000-0000-00000001e0a1', '00000000-0000-0000-0000-0000000f00a1', 'law', 'labor-law', 'نظام العمل'),
  ('00000000-0000-0000-0000-00000001e0a2', '00000000-0000-0000-0000-0000000f00a2', 'article', 'x', null)
on conflict do nothing;
