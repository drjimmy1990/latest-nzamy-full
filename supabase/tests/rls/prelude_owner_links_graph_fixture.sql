-- prelude_owner_links_graph_fixture.sql — a settled graph that exists BEFORE
-- 20261118_10 runs (library_owner_links.test.sql): three laws, law b already
-- replaces law a, and four similarity states (two repealed articles).
-- Runs as the migration owner.

insert into library_graph.nodes (node_key, node_type, source_id, law_slug, is_embeddable, title, display_text, content_sha256)
values
  ('law:a', 'law', 'a', 'a', false, 'نظام أ', 'نظام أ', repeat('a', 64)),
  ('law:b', 'law', 'b', 'b', false, 'نظام ب', 'نظام ب', repeat('b', 64)),
  ('law:c', 'law', 'c', 'c', false, 'نظام ج', 'نظام ج', repeat('c', 64)),
  ('article:a1', 'article', 'a1', 'a', true, 'نظام أ — 1', 'نص ملغى', repeat('1', 64)),
  ('article:a2', 'article', 'a2', 'a', true, 'نظام أ — 2', 'نص ساري', repeat('2', 64)),
  ('article:b1', 'article', 'b1', 'b', true, 'نظام ب — 1', 'نص ساري', repeat('3', 64)),
  ('article:c1', 'article', 'c1', 'c', true, 'نظام ج — 1', 'نص ملغى', repeat('4', 64));

insert into library_graph.edges (source_key, target_key, edge_type, origin, metadata)
values ('law:b', 'law:a', 'SUPERSEDES_LAW', 'auto_watchdog', '{"source":"owner_links"}'::jsonb);

insert into library_graph.similarity_state (node_key, model_id, content_sha256, params_key, was_active)
values
  ('article:a1', 'test-model', repeat('1', 64), 'v2', false),
  ('article:a2', 'test-model', repeat('2', 64), 'v2', true),
  ('article:b1', 'test-model', repeat('3', 64), 'v2', true),
  ('article:c1', 'test-model', repeat('4', 64), 'v2', false);

update library_graph.sync_state
   set dirty = false, dirty_tables = '{}', last_synced_at = now(), last_sync_status = 'succeeded'
 where id = 1;
