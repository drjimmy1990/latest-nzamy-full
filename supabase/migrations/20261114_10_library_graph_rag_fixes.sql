-- =============================================================================
-- Migration: 20261114_10_library_graph_rag_fixes.sql
-- =============================================================================
-- PURPOSE
--   Fixes found in the 2026-11-13 review of 20261110_10_library_graph_rag.sql
--   (already applied on production; this file changes functions only, no
--   table, column, index, row or grant):
--
--   1. graph_rag_store_embeddings / graph_rag_retrieve called
--      extensions.halfvec_dims(), which pgvector does not have (its halfvec
--      dimension function is vector_dims(halfvec)): no vector could ever be
--      stored or searched.
--   1b. graph_rag_retrieve called pg_catalog.greatest() / pg_catalog.least():
--      GREATEST and LEAST are SQL syntax, not functions, so every call failed
--      with 42883 before returning anything.
--   2. graph_rag_retrieve answered ready:true as soon as ONE node existed: the
--      first batch of the first sync, a half-reloaded library after a clean
--      wipe, or a graph still holding deleted text. Ready now also needs a
--      finished pass (last_synced_at) and no library write since (dirty =
--      false). It also raises hnsw.ef_search to 100 for its 65-row vector leg.
--   3. library_graph.mark_library_dirty: statement time (clock_timestamp)
--      instead of transaction start, a 3 s lock wait, and an exception handler
--      so a graph bookkeeping error never undoes a library write.
--   4. graph_rag_prune_stale does nothing when the library changed during the
--      pass (a partial read must not delete real nodes) and says so (skipped).
--   5. graph_rag_upsert_nodes / graph_rag_relink_vault rewrite only rows whose
--      content changed (no full GIN / HNSW rewrite on every pass).
--   6. graph_rag_status adds missing_vectors (embeddable nodes without a
--      default-model vector) and stored_vectors per model: active_vectors
--      leaves out repealed texts, so the watchdog's old "embeddable minus
--      active" never reached zero and started a catch-up pass every 30 s.
--   7. graph_rag_sync_control adds 'abandon_running' (the watchdog clears a
--      run its killed predecessor left 'running', instead of a 2 h block) and
--      dates a pass with clock_timestamp().
--
-- RUN ORDER
--   After 20261110_10 (required) and in any order with 20261113_10. Deploy the
--   code that ships with this file BEFORE starting the watchdog; the AI search
--   stays on the keyword path until NZAMY_GRAPH_RAG=on.
--
-- IDEMPOTENT — create or replace only, same signatures as 20261110_10, so the
-- service_role-only grants stay as they are. Safe to run any number of times.
-- =============================================================================

begin;

set local lock_timeout = '10s';

do $$
begin
  if to_regclass('library_graph.nodes') is null
     or to_regprocedure('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)') is null then
    raise exception '20261114_10: apply 20261110_10_library_graph_rag.sql first';
  end if;
  if to_regprocedure('extensions.vector_dims(extensions.halfvec)') is null then
    raise exception '20261114_10: pgvector has no vector_dims(halfvec) here — pgvector 0.7+ is required';
  end if;
end $$;

-- ── 1. Dirty trigger (statement time, never aborts a library write) ─────────
create or replace function library_graph.mark_library_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
begin
  -- clock_timestamp(), not now(): now() is the writer's TRANSACTION start, so a
  -- write whose transaction began before a sync pass but ran during it looked
  -- older than the pass, and finish_run cleared `dirty` over it.
  insert into library_graph.sync_state (id, dirty, dirty_tables, first_dirty_at, last_write_at, updated_at)
  values (1, true, array[tg_table_name::text], pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
  on conflict (id) do update set
    dirty          = true,
    dirty_tables   = (
      select coalesce(pg_catalog.array_agg(distinct x order by x), '{}'::text[])
        from pg_catalog.unnest(library_graph.sync_state.dirty_tables || array[tg_table_name::text]) as x
    ),
    first_dirty_at = coalesce(library_graph.sync_state.first_dirty_at, pg_catalog.clock_timestamp()),
    last_write_at  = pg_catalog.clock_timestamp(),
    updated_at     = pg_catalog.clock_timestamp();
  return null;
exception when others then
  -- A graph bookkeeping problem (a lock wait past 3 s, a permission slip) must
  -- never undo the owner's library write. The graph catches up on the next mark.
  raise warning 'library_graph.mark_library_dirty skipped on %: % (%)', tg_table_name, sqlerrm, sqlstate;
  return null;
end;
$$;

-- ── 2. Status: missing_vectors + stored_vectors ──────────────────────────────
create or replace function public.graph_rag_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_default_model text;
begin
  select m.model_id into v_default_model
    from library_graph.embedding_models m
   where m.is_default = true
   limit 1;

  return pg_catalog.jsonb_build_object(
    'default_model_id', v_default_model,
    'library_laws_count', (select pg_catalog.count(*)::integer from library.laws),
    'vault_total_vectors', (select pg_catalog.count(*)::integer from library_graph.embedding_vault),
    'sync_state', (
      select pg_catalog.to_jsonb(s)
        from library_graph.sync_state s
       where s.id = 1
    ),
    'node_counts', coalesce((
      select pg_catalog.jsonb_object_agg(node_type, cnt)
        from (
          select n.node_type, pg_catalog.count(*)::integer as cnt
            from library_graph.nodes n
           group by n.node_type
        ) sub
    ), '{}'::jsonb),
    'embeddable_nodes', (
      select pg_catalog.count(*)::integer
        from library_graph.nodes n
       where n.is_embeddable = true
    ),
    -- Embeddable nodes with no vector for the default model. Vectors of nodes
    -- that stopped being embeddable are removed by relink, so the plain counts
    -- suffice (no anti-join on every watchdog poll). `active_vectors` below
    -- leaves out repealed texts, so it can never reach `embeddable_nodes`.
    'missing_vectors', greatest(0,
      (select pg_catalog.count(*)::integer from library_graph.nodes n where n.is_embeddable = true)
      - (select pg_catalog.count(*)::integer
           from library_graph.node_embeddings ne
          where ne.model_id = v_default_model)
    ),
    'edge_counts', coalesce((
      select pg_catalog.jsonb_object_agg(edge_type, cnt)
        from (
          select e.edge_type, pg_catalog.count(*)::integer as cnt
            from library_graph.edges e
           group by e.edge_type
        ) sub
    ), '{}'::jsonb),
    'models', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'model_id',      m.model_id,
          'provider',      m.provider,
          'api_model',     m.api_model,
          'dimensions',    m.dimensions,
          'task_document', m.task_document,
          'task_query',    m.task_query,
          'is_default',    m.is_default,
          'is_active',     m.is_active,
          'notes',         m.notes,
          'active_vectors', (
            select pg_catalog.count(*)::integer
              from library_graph.node_embeddings ne
             where ne.model_id = m.model_id and ne.is_active_corpus = true
          ),
          'stored_vectors', (
            select pg_catalog.count(*)::integer
              from library_graph.node_embeddings ne
             where ne.model_id = m.model_id
          ),
          'vault_vectors', (
            select pg_catalog.count(*)::integer
              from library_graph.embedding_vault ev
             where ev.model_id = m.model_id
          )
        )
        order by m.is_default desc, m.model_id asc
      )
      from library_graph.embedding_models m
      where m.is_active = true
    ), '[]'::jsonb),
    'recent_runs', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.started_at desc)
        from (
          select id, started_at, finished_at, trigger_source, model_id, status,
                 nodes_upserted, nodes_deleted, edges_upserted, vault_relinked, api_embedded, error_message
            from library_graph.sync_runs
           order by started_at desc
           limit 10
        ) r
    ), '[]'::jsonb)
  );
end;
$$;

-- ── 3. Vault relink: only changed vectors ───────────────────────────────────
create or replace function public.graph_rag_relink_vault(p_model_id text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_model      text;
  v_dims       integer;
  v_relinked   integer := 0;
  v_pruned     integer := 0;
  v_missing    integer := 0;
begin
  select m.model_id, m.dimensions into v_model, v_dims
    from library_graph.embedding_models m
   where (p_model_id is not null and m.model_id = p_model_id)
      or (p_model_id is null and m.is_default = true)
   limit 1;

  if v_model is null then
    raise exception 'no matching embedding model found for relink';
  end if;

  -- Remove stale embeddings for nodes whose SHA-256 changed or are no longer embeddable
  delete from library_graph.node_embeddings ne
   where ne.model_id = v_model
     and not exists (
       select 1
         from library_graph.nodes n
         join library_graph.embedding_vault ev
           on ev.content_sha256 = n.content_sha256 and ev.model_id = v_model
        where n.node_key = ne.node_key
          and n.is_embeddable = true
     );
  get diagnostics v_pruned = row_count;

  -- Relink matching SHA-256 vectors straight from embedding_vault
  insert into library_graph.node_embeddings (node_key, model_id, node_type, is_active_corpus, embedding, updated_at)
  select n.node_key,
         v_model,
         n.node_type,
         coalesce(n.doc_status, 'active') <> 'repealed' and coalesce(n.item_status, 'active') <> 'repealed',
         ev.embedding,
         now()
    from library_graph.nodes n
    join library_graph.embedding_vault ev
      on ev.content_sha256 = n.content_sha256 and ev.model_id = v_model
   where n.is_embeddable = true
  on conflict (node_key, model_id) do update set
    node_type        = excluded.node_type,
    is_active_corpus = excluded.is_active_corpus,
    embedding        = excluded.embedding,
    updated_at       = now()
  -- Unchanged rows are left alone: rewriting every vector on every pass churned
  -- the HNSW index and the WAL for nothing.
  -- (halfvec's = lives in schema extensions; search_path is empty, so name it)
  where library_graph.node_embeddings.node_type is distinct from excluded.node_type
     or library_graph.node_embeddings.is_active_corpus is distinct from excluded.is_active_corpus
     or not (library_graph.node_embeddings.embedding operator(extensions.=) excluded.embedding);
  get diagnostics v_relinked = row_count;

  select pg_catalog.count(*)::integer into v_missing
    from library_graph.nodes n
   where n.is_embeddable = true
     and not exists (
       select 1 from library_graph.node_embeddings ne
        where ne.node_key = n.node_key and ne.model_id = v_model
     );

  return pg_catalog.jsonb_build_object(
    'model_id',   v_model,
    'dimensions', v_dims,
    'relinked',   v_relinked,
    'pruned',     v_pruned,
    'missing',    v_missing
  );
end;
$$;

-- ── 4. Node upsert: only changed rows rewritten ─────────────────────────────
create or replace function public.graph_rag_upsert_nodes(p_rows jsonb, p_touch_time timestamptz default now())
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if pg_catalog.jsonb_array_length(p_rows) > 500 then
    raise exception 'batch size exceeds 500 nodes';
  end if;

  insert into library_graph.nodes (
    node_key, node_type, source_id, law_slug, collection_id, article_number,
    doc_status, item_status, is_page_numbered, is_embeddable,
    title, url, display_text, contextual_header, content_sha256, metadata, updated_at
  )
  select
    r->>'node_key',
    r->>'node_type',
    r->>'source_id',
    nullif(r->>'law_slug', ''),
    nullif(r->>'collection_id', ''),
    case when r ? 'article_number' and pg_catalog.jsonb_typeof(r->'article_number') = 'number'
         then (r->>'article_number')::integer else null end,
    nullif(r->>'doc_status', ''),
    nullif(r->>'item_status', ''),
    coalesce((r->>'is_page_numbered')::boolean, false),
    coalesce((r->>'is_embeddable')::boolean, true),
    r->>'title',
    coalesce(r->>'url', ''),
    r->>'display_text',
    coalesce(r->>'contextual_header', ''),
    r->>'content_sha256',
    coalesce(r->'metadata', '{}'::jsonb),
    p_touch_time
  from pg_catalog.jsonb_array_elements(p_rows) as r
  on conflict (node_key) do update set
    node_type         = excluded.node_type,
    source_id         = excluded.source_id,
    law_slug          = excluded.law_slug,
    collection_id     = excluded.collection_id,
    article_number    = excluded.article_number,
    doc_status        = excluded.doc_status,
    item_status       = excluded.item_status,
    is_page_numbered  = excluded.is_page_numbered,
    is_embeddable     = excluded.is_embeddable,
    title             = excluded.title,
    url               = excluded.url,
    display_text      = excluded.display_text,
    contextual_header = excluded.contextual_header,
    content_sha256    = excluded.content_sha256,
    metadata          = excluded.metadata,
    updated_at        = excluded.updated_at
  -- A node whose content did not change is not rewritten (the generated FTS
  -- column and its GIN index were recomputed for ~400k rows on every pass).
  where (library_graph.nodes.node_type, library_graph.nodes.source_id, library_graph.nodes.law_slug,
         library_graph.nodes.collection_id, library_graph.nodes.article_number, library_graph.nodes.doc_status,
         library_graph.nodes.item_status, library_graph.nodes.is_page_numbered, library_graph.nodes.is_embeddable,
         library_graph.nodes.title, library_graph.nodes.url, library_graph.nodes.display_text,
         library_graph.nodes.contextual_header, library_graph.nodes.content_sha256, library_graph.nodes.metadata)
        is distinct from
        (excluded.node_type, excluded.source_id, excluded.law_slug,
         excluded.collection_id, excluded.article_number, excluded.doc_status,
         excluded.item_status, excluded.is_page_numbered, excluded.is_embeddable,
         excluded.title, excluded.url, excluded.display_text,
         excluded.contextual_header, excluded.content_sha256, excluded.metadata);

  get diagnostics v_count = row_count;

  -- The unchanged rows still belong to this pass: stamp them so prune keeps
  -- them (only `updated_at` changes, which no index covers: a cheap HOT update).
  update library_graph.nodes n
     set updated_at = p_touch_time
    from pg_catalog.jsonb_array_elements(p_rows) as r
   where n.node_key = (r->>'node_key')
     and n.updated_at < p_touch_time;

  return v_count;
end;
$$;

-- ── 5. Prune: skipped after a pass the library changed under ───────────────
create or replace function public.graph_rag_prune_stale(p_sync_started_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted_edges integer := 0;
  v_deleted_nodes integer := 0;
  v_last_write    timestamptz;
begin
  -- A library write during the pass (a load in progress, a clean wipe) means
  -- the pass may have read only part of a table: deleting "unseen" nodes would
  -- delete real ones. Keep everything; `dirty` stays set and the next pass,
  -- after the quiet window, prunes from a complete read.
  select s.last_write_at into v_last_write from library_graph.sync_state s where s.id = 1;
  if v_last_write is not null and v_last_write > p_sync_started_at then
    return pg_catalog.jsonb_build_object('deleted_nodes', 0, 'deleted_edges', 0, 'skipped', true);
  end if;

  delete from library_graph.edges e
   where e.origin = 'auto_watchdog'
     and e.updated_at < p_sync_started_at;
  get diagnostics v_deleted_edges = row_count;

  -- Note: an `owner_curated` edge goes with its node (foreign key cascade). No
  -- code writes curated edges yet; a curator UI must re-attach them by key.
  delete from library_graph.nodes n
   where n.updated_at < p_sync_started_at;
  get diagnostics v_deleted_nodes = row_count;

  return pg_catalog.jsonb_build_object(
    'deleted_nodes', v_deleted_nodes,
    'deleted_edges', v_deleted_edges,
    'skipped', false
  );
end;
$$;

-- ── 6. Store embeddings: vector_dims(halfvec) ───────────────────────────────
create or replace function public.graph_rag_store_embeddings(p_model_id text, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dims  integer;
  v_count integer := 0;
begin
  select m.dimensions into v_dims
    from library_graph.embedding_models m
   where m.model_id = p_model_id;
  if v_dims is null then
    raise exception 'unknown embedding model_id: %', coalesce(p_model_id, 'NULL');
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' or pg_catalog.jsonb_array_length(p_rows) = 0 then
    return 0;
  end if;
  if pg_catalog.jsonb_array_length(p_rows) > 250 then
    raise exception 'embedding batch exceeds 250 vectors';
  end if;

  -- 1. Permanent SHA-256 vault (deduplicated on content_sha256)
  insert into library_graph.embedding_vault (content_sha256, model_id, embedding, updated_at)
  select distinct on (r->>'content_sha256')
    r->>'content_sha256',
    p_model_id,
    (r->>'embedding')::extensions.halfvec,
    now()
  from pg_catalog.jsonb_array_elements(p_rows) as r
  where extensions.vector_dims((r->>'embedding')::extensions.halfvec) = v_dims
  on conflict (content_sha256, model_id) do update set
    embedding  = excluded.embedding,
    updated_at = now();

  -- 2. Active HNSW search table
  insert into library_graph.node_embeddings (node_key, model_id, node_type, is_active_corpus, embedding, updated_at)
  select
    n.node_key,
    p_model_id,
    n.node_type,
    coalesce(n.doc_status, 'active') <> 'repealed' and coalesce(n.item_status, 'active') <> 'repealed',
    (r->>'embedding')::extensions.halfvec,
    now()
  from pg_catalog.jsonb_array_elements(p_rows) as r
  join library_graph.nodes n on n.node_key = (r->>'node_key')
  where extensions.vector_dims((r->>'embedding')::extensions.halfvec) = v_dims
  on conflict (node_key, model_id) do update set
    node_type        = excluded.node_type,
    is_active_corpus = excluded.is_active_corpus,
    embedding        = excluded.embedding,
    updated_at       = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── 7. Sync control: abandon_running + statement-time start ────────────────
create or replace function public.graph_rag_sync_control(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id    bigint;
  v_started   timestamptz;
  v_abandoned integer := 0;
begin
  if p_action = 'mark_dirty_now' then
    update library_graph.sync_state
       set dirty = true,
           dirty_tables = (
             select coalesce(pg_catalog.array_agg(distinct x order by x), '{}'::text[])
               from pg_catalog.unnest(dirty_tables || array[coalesce(p_payload->>'reason', 'manual_admin')]) as x
           ),
           first_dirty_at = coalesce(first_dirty_at, now()),
           -- Backdate last_write_at so Watchdog's quiet-window debounce runs immediately
           last_write_at = now() - interval '10 minutes',
           updated_at = now()
     where id = 1;
    return pg_catalog.jsonb_build_object('ok', true);
  end if;

  if p_action = 'set_feqh_vectors' then
    update library_graph.sync_state
       set include_feqh_vectors = coalesce((p_payload->>'enabled')::boolean, false),
           dirty = true,
           last_write_at = now() - interval '10 minutes',
           updated_at = now()
     where id = 1;
    return pg_catalog.jsonb_build_object('ok', true);
  end if;

  if p_action = 'abandon_running' then
    -- The watchdog runs as ONE process: at its start, any `running` row is a
    -- pass a killed process never finished. Fail them now instead of blocking
    -- every new pass for 2 hours.
    update library_graph.sync_runs
       set status = 'failed',
           finished_at = now(),
           error_message = 'abandoned: the watchdog restarted before this pass finished'
     where status = 'running';
    get diagnostics v_abandoned = row_count;
    if v_abandoned > 0 then
      update library_graph.sync_state
         set last_sync_status = 'failed',
             last_error = 'a pass was interrupted by a watchdog restart',
             updated_at = now()
       where id = 1 and last_sync_status = 'running';
    end if;
    return pg_catalog.jsonb_build_object('ok', true, 'abandoned', v_abandoned);
  end if;

  if p_action = 'start_run' then
    -- Fail any stale `running` sync_runs older than 2 hours (process restart)
    update library_graph.sync_runs
       set status = 'failed',
           finished_at = now(),
           error_message = 'superseded after stale running timeout'
     where status = 'running' and started_at < now() - interval '2 hours';

    if exists (select 1 from library_graph.sync_runs where status = 'running') then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'already_running');
    end if;

    -- Statement time, matching the dirty trigger. A library write already made
    -- holds the sync_state row until it commits, so the update below waits for
    -- it and the pass reads it; a later write is dated after this and keeps dirty.
    v_started := pg_catalog.clock_timestamp();
    insert into library_graph.sync_runs (started_at, trigger_source, model_id, status)
    values (
      v_started,
      coalesce(nullif(p_payload->>'trigger_source', ''), 'watchdog'),
      nullif(p_payload->>'model_id', ''),
      'running'
    )
    returning id into v_run_id;

    update library_graph.sync_state
       set last_sync_status = 'running',
           updated_at = now()
     where id = 1;

    return pg_catalog.jsonb_build_object('ok', true, 'run_id', v_run_id, 'started_at', v_started);
  end if;

  if p_action = 'finish_run' then
    v_run_id := (p_payload->>'run_id')::bigint;
    v_started := coalesce((p_payload->>'started_at')::timestamptz, now());

    update library_graph.sync_runs
       set finished_at    = now(),
           status         = coalesce(nullif(p_payload->>'status', ''), 'succeeded'),
           nodes_upserted = coalesce((p_payload->>'nodes_upserted')::integer, 0),
           nodes_deleted  = coalesce((p_payload->>'nodes_deleted')::integer, 0),
           edges_upserted = coalesce((p_payload->>'edges_upserted')::integer, 0),
           vault_relinked = coalesce((p_payload->>'vault_relinked')::integer, 0),
           api_embedded   = coalesce((p_payload->>'api_embedded')::integer, 0),
           error_message  = nullif(p_payload->>'error_message', ''),
           details        = coalesce(p_payload->'details', '{}'::jsonb)
     where id = v_run_id;

    if coalesce(p_payload->>'status', 'succeeded') = 'succeeded' then
      -- Clear `dirty` ONLY if no newer write landed in `library.*` after `v_started`!
      update library_graph.sync_state
         set dirty            = (last_write_at > v_started),
             dirty_tables     = case when last_write_at > v_started then dirty_tables else '{}'::text[] end,
             first_dirty_at   = case when last_write_at > v_started then last_write_at else null end,
             last_synced_at   = now(),
             last_sync_status = 'succeeded',
             last_error       = null,
             updated_at       = now()
       where id = 1;
    else
      update library_graph.sync_state
         set last_sync_status = coalesce(nullif(p_payload->>'status', ''), 'failed'),
             last_error       = nullif(p_payload->>'error_message', ''),
             updated_at       = now()
       where id = 1;
    end if;

    return pg_catalog.jsonb_build_object('ok', true);
  end if;

  raise exception 'unknown graph_rag_sync_control action: %', coalesce(p_action, 'NULL');
end;
$$;

-- ── 8. Retrieve: vector_dims, readiness, ef_search ──────────────────────────
create or replace function public.graph_rag_retrieve(
  p_tsqueries        text[]  default '{}'::text[],
  p_query_embedding  text    default null,
  p_model_id         text    default null,
  p_law_slug         text    default null,
  p_limit_laws       integer default 8,
  p_limit_principles integer default 4,
  p_limit_decrees    integer default 0,
  p_limit_feqh       integer default 0,
  p_enable_graph_hop boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $$
declare
  v_model      text;
  v_dims       integer;
  v_has_nodes  boolean;
  v_in_sync    boolean;
  v_has_vec    boolean := false;
  v_vec_sql    text;
  v_result     jsonb;
begin
  select exists (select 1 from library_graph.nodes limit 1) into v_has_nodes;
  -- Ready = a full pass has finished AND no library write landed since. Before
  -- the first sync, during a load or a clean wipe, and until the next pass after
  -- any edit, the caller uses the keyword search instead of a partial or stale graph.
  select s.last_synced_at is not null and s.dirty = false
    into v_in_sync
    from library_graph.sync_state s
   where s.id = 1;
  if not v_has_nodes or not coalesce(v_in_sync, false) then
    return pg_catalog.jsonb_build_object(
      'ready', false,
      'model_id', null,
      'vector_used', false,
      'articles', '[]'::jsonb,
      'principles', '[]'::jsonb,
      'decrees', '[]'::jsonb,
      'feqh', '[]'::jsonb
    );
  end if;

  select m.model_id, m.dimensions into v_model, v_dims
    from library_graph.embedding_models m
   where (p_model_id is not null and m.model_id = p_model_id)
      or (p_model_id is null and m.is_default = true)
   limit 1;

  if p_query_embedding is not null and btrim(p_query_embedding) <> '' and v_model is not null then
    begin
      if extensions.vector_dims(p_query_embedding::extensions.halfvec) = v_dims then
        select exists (
          select 1 from library_graph.node_embeddings ne
           where ne.model_id = v_model and ne.is_active_corpus = true
           limit 1
        ) into v_has_vec;
        -- HNSW returns at most ef_search rows (default 40); the global leg asks for 65.
        if v_has_vec then
          perform pg_catalog.set_config('hnsw.ef_search', '100', true);
        end if;
      end if;
    exception when others then
      v_has_vec := false;
    end;
  end if;

  -- Create a session-temp staging table? NO: function is STABLE (read-only)!
  -- Execute a single dynamic CTE query parameterized with `v_dims` and `v_model`
  -- so PostgreSQL's planner binds the exact Partial Expression HNSW Index
  -- `((embedding::extensions.halfvec(v_dims)) extensions.halfvec_cosine_ops) WHERE model_id = v_model AND is_active_corpus = true`!
  v_vec_sql := pg_catalog.format($q$
    with
    -- Leg 1: Lexical FTS across cleaned tsquery strings (GIN-indexed, capped per query)
    clean_q as (
      select q, ord::integer
        from pg_catalog.unnest(coalesce($1::text[], '{}'::text[])) with ordinality as t(q, ord)
       where btrim(q) <> ''
       limit 6
    ),
    fts_raw as materialized (
      select n.node_key,
             n.node_type,
             n.law_slug,
             pg_catalog.row_number() over (
               partition by cq.ord, n.node_type
               order by
                 case when $3::text is not null and n.law_slug = $3::text then 0 else 1 end,
                 pg_catalog.ts_rank_cd(n.fts, pg_catalog.to_tsquery('simple'::regconfig, cq.q), 1) desc,
                 n.node_key asc
             ) as rnk
        from clean_q cq
        join lateral (
          select cand.node_key, cand.node_type, cand.law_slug, cand.fts
            from library_graph.nodes cand
           where cand.fts @@ pg_catalog.to_tsquery('simple'::regconfig, cq.q)
           limit 1500
        ) n on true
    ),
    fts_hits as (
      select node_key, pg_catalog.min(rnk)::integer as fts_rank
        from fts_raw
       where rnk <= 40
       group by node_key
    ),
    -- Leg 2: Dense Semantic HNSW Vector Search (Partial Expression Index on halfvec(%1$s))
    vec_global as materialized (
      select ne.node_key,
             ne.node_type,
             1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s))) as sim,
             pg_catalog.row_number() over (
               order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
             )::integer as vec_rank
        from library_graph.node_embeddings ne
       where %2$L::boolean = true
         and ne.model_id = %3$L
         and ne.is_active_corpus = true
       order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
       limit 65
    ),
    vec_scoped as materialized (
      select n.node_key,
             n.node_type,
             1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s))) as sim,
             pg_catalog.row_number() over (
               order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
             )::integer as scoped_rank
        from library_graph.nodes n
        join library_graph.node_embeddings ne
          on ne.node_key = n.node_key and ne.model_id = %3$L and ne.is_active_corpus = true
       where %2$L::boolean = true
         and $3::text is not null
         and n.law_slug = $3::text
       order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
       limit 15
    ),
    vec_hits as (
      select coalesce(g.node_key, s.node_key) as node_key,
             greatest(coalesce(g.sim, 0), coalesce(s.sim, 0)) as sim,
             least(coalesce(g.vec_rank, 999), coalesce(s.scoped_rank, 999)) as vec_rank
        from vec_global g
        full outer join vec_scoped s on s.node_key = g.node_key
    ),
    -- Leg 3: High-Level Legal Concept Bridge (Dual-Level Retrieval)
    matched_concepts as (
      select n.node_key,
             coalesce(1.0 / (50.0 + f.fts_rank), 0.0) +
             case when v.sim >= 0.52 then coalesce(1.2 / (50.0 + v.vec_rank), 0.0) else 0.0 end as concept_score
        from library_graph.nodes n
        left join fts_hits f on f.node_key = n.node_key
        left join vec_hits v on v.node_key = n.node_key
       where n.node_type = 'concept'
         and (f.node_key is not null or (v.node_key is not null and v.sim >= 0.52))
       order by concept_score desc
       limit 5
    ),
    concept_targets as (
      select case when e.source_key = mc.node_key then e.target_key else e.source_key end as node_key,
             pg_catalog.max(mc.concept_score * e.weight) as concept_boost
        from matched_concepts mc
        join library_graph.edges e
          on (e.source_key = mc.node_key or e.target_key = mc.node_key)
         and e.edge_type in ('HAS_CONCEPT', 'DECONSTRUCTS_CONCEPT', 'ESTABLISHES_RULE')
       group by 1
    ),
    -- Leg 4: Reciprocal Rank Fusion (RRF) over Primary Candidates
    candidate_keys as (
      select node_key from fts_hits
      union
      select node_key from vec_hits where sim >= 0.42
      union
      select node_key from concept_targets
    ),
    rrf_primary as materialized (
      select n.node_key,
             n.node_type,
             n.law_slug,
             (
               coalesce(1.0 / (60.0 + f.fts_rank), 0.0) +
               coalesce(1.15 / (60.0 + v.vec_rank), 0.0) +
               coalesce(0.75 * ct.concept_boost, 0.0) +
               case when $3::text is not null and n.law_slug = $3::text then 0.025 else 0.0 end +
               case when coalesce(n.doc_status, 'active') <> 'repealed'
                     and coalesce(n.item_status, 'active') <> 'repealed' then 0.004 else 0.0 end
             ) as score,
             null::text as via_edge_type,
             null::text as via_from_title
        from candidate_keys ck
        join library_graph.nodes n on n.node_key = ck.node_key
        left join fts_hits f on f.node_key = n.node_key
        left join vec_hits v on v.node_key = n.node_key
        left join concept_targets ct on ct.node_key = n.node_key
       where n.node_type in ('article', 'principle', 'decree', 'feqh')
    ),
    -- Leg 5: Query-Conditioned 1-Hop Legal Graph Walk (Exceptions, Amendments, Judicial Interpretations, Enabling Laws)
    top_seeds as (
      select rp.node_key, rp.score, n.title as seed_title
        from rrf_primary rp
        join library_graph.nodes n on n.node_key = rp.node_key
       order by rp.score desc
       limit 8
    ),
    hop_candidates as (
      select
        case when e.source_key = ts.node_key then e.target_key else e.source_key end as neighbor_key,
        e.edge_type,
        ts.seed_title,
        ts.score as seed_score,
        e.weight * (
          case e.edge_type
            when 'EXEMPTS_FROM'       then 0.58
            when 'AMENDS_ARTICLE'     then 0.55
            when 'INTERPRETS_ARTICLE' then 0.52
            when 'ESTABLISHES_RULE'   then 0.48
            when 'PARENT_LAW'         then 0.36
            when 'CITES_ARTICLE'      then 0.32
            else 0.28
          end
        ) as transfer_factor
      from top_seeds ts
      join library_graph.edges e
        on (e.source_key = ts.node_key or e.target_key = ts.node_key)
       and e.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'ESTABLISHES_RULE', 'PARENT_LAW', 'CITES_ARTICLE')
      where $8::boolean = true
    ),
    hop_scored as (
      select distinct on (hc.neighbor_key)
        n.node_key,
        n.node_type,
        n.law_slug,
        (
          hc.seed_score * hc.transfer_factor +
          case
            when %2$L::boolean = true and ne.embedding is not null then
              0.012 * greatest(
                0.0,
                1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))
              )
            else 0.004
          end
        ) as score,
        hc.edge_type as via_edge_type,
        hc.seed_title as via_from_title
      from hop_candidates hc
      join library_graph.nodes n on n.node_key = hc.neighbor_key
      left join library_graph.node_embeddings ne
        on ne.node_key = n.node_key and ne.model_id = %3$L and ne.is_active_corpus = true
      where n.node_type in ('article', 'principle', 'decree', 'feqh')
        and coalesce(n.doc_status, 'active') <> 'repealed'
        and coalesce(n.item_status, 'active') <> 'repealed'
        and not exists (select 1 from rrf_primary rp where rp.node_key = n.node_key)
        -- Hub-pollution guard: CITES_ARTICLE / PARENT_LAW hops must show minimum query semantic affinity (>= 0.38) when vectors are active
        and (
          hc.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE')
          or %2$L::boolean = false
          or ne.embedding is null
          or (1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))) >= 0.38
        )
      order by hc.neighbor_key, score desc
    ),
    combined as (
      select * from rrf_primary
      union all
      select * from hop_scored
    ),
    deduped as (
      select distinct on (c.node_key)
        c.node_key, c.node_type, c.score, c.via_edge_type, c.via_from_title
      from combined c
      order by c.node_key, c.score desc
    ),
    enriched as (
      select
        d.node_type,
        d.score,
        pg_catalog.row_number() over (partition by d.node_type order by d.score desc, d.node_key asc) as section_rank,
        pg_catalog.jsonb_build_object(
          'node_key',       n.node_key,
          'kind',           n.node_type,
          'id',             n.source_id,
          'law_slug',       n.law_slug,
          'collection_id',  n.collection_id,
          'article_number', n.article_number,
          'status',         coalesce(n.item_status, n.doc_status, 'active'),
          'title',          n.title,
          'url',            n.url,
          'text',           n.display_text,
          'score',          pg_catalog.round(d.score::numeric, 6),
          'via_edge_type',  d.via_edge_type,
          'via_from_title', d.via_from_title
        ) as item
      from deduped d
      join library_graph.nodes n on n.node_key = d.node_key
    )
    select pg_catalog.jsonb_build_object(
      'ready',       true,
      'model_id',    %3$L,
      'vector_used', %2$L::boolean,
      'articles', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'article' and e.section_rank <= greatest(coalesce($4::integer, 0), 0)
      ), '[]'::jsonb),
      'principles', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'principle' and e.section_rank <= greatest(coalesce($5::integer, 0), 0)
      ), '[]'::jsonb),
      'decrees', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'decree' and e.section_rank <= greatest(coalesce($6::integer, 0), 0)
      ), '[]'::jsonb),
      'feqh', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'feqh' and e.section_rank <= greatest(coalesce($7::integer, 0), 0)
      ), '[]'::jsonb)
    )
  $q$,
    coalesce(v_dims, 768),
    v_has_vec,
    coalesce(v_model, 'gemini-embedding-2-768')
  );

  execute v_vec_sql
    into v_result
    using p_tsqueries,
          case when v_has_vec then p_query_embedding else null end,
          p_law_slug,
          p_limit_laws,
          p_limit_principles,
          p_limit_decrees,
          p_limit_feqh,
          coalesce(p_enable_graph_hop, true);

  return v_result;
end;
$$;

-- ── Verify inside the transaction (rolls back on any failure) ───────────────
do $$
declare
  fn       text;
  r        text;
  fn_owner text;
  missing  text := '';
begin
  -- No function may still name the dimension function pgvector does not have.
  if exists (
    select 1 from pg_catalog.pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'library_graph'::regnamespace)
       and p.prosrc like '%halfvec_dims(%'
  ) then
    missing := missing || ' a graph function still calls halfvec_dims();';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'library_graph'::regnamespace)
       and p.proname like 'graph_rag_%'
       and (p.prosrc like '%pg_catalog.greatest(%' or p.prosrc like '%pg_catalog.least(%')
  ) then
    missing := missing || ' a graph function still calls pg_catalog.greatest/least();';
  end if;
  if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'::regprocedure)
       not like '%last_synced_at is not null and s.dirty = false%' then
    missing := missing || ' graph_rag_retrieve has no readiness check;';
  end if;

  -- The grants of 20261110_10 still hold (create or replace keeps them).
  foreach fn in array array[
    'public.graph_rag_status()',
    'public.graph_rag_relink_vault(text)',
    'public.graph_rag_upsert_nodes(jsonb, timestamptz)',
    'public.graph_rag_prune_stale(timestamptz)',
    'public.graph_rag_store_embeddings(text, jsonb)',
    'public.graph_rag_sync_control(text, jsonb)',
    'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'
  ] loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r)
         and has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s;', fn);
    end if;
  end loop;

  -- The dirty trigger writes sync_state (RLS forced, service_role policy only):
  -- its owner must bypass RLS, or every mark is a warning and the graph never syncs.
  select pg_catalog.pg_get_userbyid(p.proowner) into fn_owner
    from pg_catalog.pg_proc p
   where p.oid = 'library_graph.mark_library_dirty()'::regprocedure;
  if not exists (select 1 from pg_catalog.pg_roles x where x.rolname = fn_owner and (x.rolsuper or x.rolbypassrls)) then
    missing := missing || format(' %s, the owner of mark_library_dirty, neither is superuser nor bypasses RLS;', fn_owner);
  end if;

  if missing <> '' then
    raise exception '20261114_10 verify:%', missing;
  end if;
  raise notice '20261114_10 verify: OK';
end $$;

notify pgrst, 'reload schema';

commit;

-- ── Final check for the SQL editor (it hides NOTICEs): expect ok = true ─────
select '20261114_10 graph fixes: vector_dims, readiness, missing_vectors, abandon_running' as check,
       not exists (
         select 1 from pg_catalog.pg_proc p
          where p.pronamespace in ('public'::regnamespace, 'library_graph'::regnamespace)
            and p.prosrc like '%halfvec_dims(%'
       )
       and pg_catalog.pg_get_functiondef('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'::regprocedure)
           like '%last_synced_at is not null and s.dirty = false%'
       and pg_catalog.pg_get_functiondef('public.graph_rag_sync_control(text, jsonb)'::regprocedure) like '%abandon_running%'
       and public.graph_rag_status() ? 'missing_vectors'
       as ok;
