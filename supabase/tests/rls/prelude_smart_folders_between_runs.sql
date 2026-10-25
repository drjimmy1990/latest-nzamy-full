-- prelude_smart_folders_between_runs.sql — runs between the two 20261026_50
-- runs in smart_folders_grants.test.sql: a 20260922_01 re-run plus the owner's
-- original 20261025_01 grants (what a later restore or a re-run of his file
-- would put back). The second 20261026_50 run must take every one back.
grant select on all tables in schema library to anon, authenticated;
grant select, insert, update, delete on library.smart_folders to authenticated;
grant select, insert, update, delete on library.smart_folder_items to authenticated;
