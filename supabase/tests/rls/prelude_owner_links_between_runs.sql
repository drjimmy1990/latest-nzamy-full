-- prelude_owner_links_between_runs.sql — runs between the two 20261118_10
-- runs of library_owner_links.test.sql: law c now replaces law b. The second
-- run must NOT seed this pair (the pairs table is no longer empty), so the
-- first refresh sees it as a change (T1, T2). Runs as the migration owner.

insert into library_graph.edges (source_key, target_key, edge_type, origin)
values ('law:c', 'law:b', 'SUPERSEDES_LAW', 'auto_watchdog');
