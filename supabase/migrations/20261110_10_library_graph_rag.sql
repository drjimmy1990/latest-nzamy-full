-- =============================================================================
-- Migration: 20261110_10_library_graph_rag.sql
-- =============================================================================
-- PURPOSE
--   Auto-Syncing, Model-Agnostic Legal GraphRAG storage & hybrid retrieval
--   engine for the نظامي (Nzamy) Saudi Legal Library across all 4 corpora
--   (laws/articles + inline active regulations, judicial principles, royal
--   decrees/circulars, fiqh jurisprudence, and high-level legal concept nodes).
--
-- ARCHITECTURAL INVARIANTS
--   1. ZERO FOREIGN KEYS INTO `library.*`:
--      `supabase/one-time/2026-10-04_library_clean_wipe.sql` executes `TRUNCATE`
--      WITHOUT `CASCADE` on the 14 `library.*` content tables. A foreign key
--      from outside `library.*` would block clean wipes (`0A000`). Every link
--      to `library.*` is stored as a logical `text` identifier (`source_id`,
--      `law_slug`, `collection_id`).
--   2. ZERO-COST WIPE SURVIVAL (`embedding_vault`):
--      `library_graph.embedding_vault (content_sha256, model_id)` persists
--      permanently across `library.*` clean wipes. On reload,
--      `public.graph_rag_relink_vault()` re-links unchanged SHA-256 hashes in
--      pure SQL in < 2 seconds at $0 API cost.
--   3. DIMENSION-AGNOSTIC MULTI-MODEL STORAGE (`extensions.halfvec` + Partial HNSW):
--      Uses untyped `extensions.halfvec` (16-bit float, supporting 64..4000
--      dimensions — overcoming pgvector's 2000d `vector` HNSW ceiling while
--      cutting RAM by 50%) paired with Partial Expression HNSW Indexes per
--      `model_id`: `((embedding::extensions.halfvec(D)) extensions.halfvec_cosine_ops)`.
--      Default optimal profile: `gemini-embedding-2-768` (`768d`, proven live
--      to deliver top Arabic legal recall & margin at ~180 MB HNSW RAM).
--   4. STRICT SERVER-ONLY LOCKDOWN (PostgREST-ready without docker-compose edits):
--      All tables live in private schema `library_graph` (RLS enabled + forced,
--      zero grants to `PUBLIC`, `anon`, `authenticated`). PostgREST access is
--      exposed strictly via `service_role`-only `public.graph_rag_*` RPCs
--      (following `20260919_private_precedent_details.sql`).
--
-- PRE-RUN REQUIREMENT
--   Always run `npm run db:backup-schema` (`bash scripts/backup-db-schema.sh`)
--   on the VPS BEFORE applying this migration.
--
-- IDEMPOTENT — safe to run any number of times.
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- ── 0. Preconditions & Extensions ────────────────────────────────────────────
do $$
begin
  if to_regclass('library.laws') is null or to_regclass('library.articles') is null then
    raise exception '20261110_10: library schema tables do not exist — apply the library schema chain first';
  end if;
end $$;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

-- ── 1. Private Schema `library_graph` ────────────────────────────────────────
create schema if not exists library_graph;

revoke all on schema library_graph from public, anon, authenticated;
grant usage on schema library_graph to service_role;

comment on schema library_graph is
  'Server-only Legal GraphRAG knowledge graph & multi-model halfvec embedding vault (20261110_10). Never exposed directly to PostgREST anon/authenticated.';

-- Self-contained tashkeel + tatweel folder for generated FTS column
create or replace function library_graph.fold_tashkeel(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select pg_catalog.translate(coalesce(p_text, ''), E'ًٌٍَُِّْٰٕٖٜٟٓٔٗ٘ٙٚٛٝٞـ', '')
$fn$;

revoke all on function library_graph.fold_tashkeel(text) from public, anon, authenticated;
grant execute on function library_graph.fold_tashkeel(text) to service_role;

-- ── 2. Tables (ZERO foreign keys into `library.*`) ───────────────────────────

-- 2a. Registered Embedding Model Profiles
create table if not exists library_graph.embedding_models (
  model_id      text primary key check (model_id ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  provider      text not null check (provider in ('gemini', 'openai', 'voyage', 'cohere', 'jina', 'cloudflare', 'openai-compatible')),
  api_model     text not null check (btrim(api_model) <> ''),
  dimensions    integer not null check (dimensions between 64 and 4000),
  task_document text,
  task_query    text,
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_lg_models_single_default
  on library_graph.embedding_models ((true))
  where is_default = true;

-- Pre-seed optimal default (768d Gemini Embedding 2) + leading Arabic/Legal alternatives
insert into library_graph.embedding_models
  (model_id, provider, api_model, dimensions, task_document, task_query, is_default, is_active, notes)
values
  ('gemini-embedding-2-768',  'gemini',            'models/gemini-embedding-2-preview', 768,  'RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY', true,  true, 'Default: highest Arabic legal separation margin (+0.1202) at ~180 MB HNSW RAM; free-tier friendly'),
  ('gemini-embedding-2-1536', 'gemini',            'models/gemini-embedding-2-preview', 1536, 'RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY', false, true, 'Mid-size Matryoshka slice (~360 MB HNSW RAM)'),
  ('gemini-embedding-2-3072', 'gemini',            'models/gemini-embedding-2-preview', 3072, 'RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY', false, true, 'Full native Gemini Embedding 2 dimension via halfvec(3072)'),
  ('openai-3-large-1536',     'openai',            'text-embedding-3-large',            1536, null,                 null,              false, true, 'OpenAI text-embedding-3-large shortened to 1536d'),
  ('openai-3-large-3072',     'openai',            'text-embedding-3-large',            3072, null,                 null,              false, true, 'OpenAI text-embedding-3-large full 3072d via halfvec(3072)'),
  ('voyage-3-large-1024',     'voyage',            'voyage-3-large',                    1024, 'document',           'query',           false, true, 'Voyage 3 Large (1024d, 32k context window)'),
  ('cohere-embed-v4-1024',    'cohere',            'embed-v4.0',                        1024, 'search_document',    'search_query',    false, true, 'Cohere Embed v4 multilingual (1024d)'),
  ('jina-embeddings-v3-1024', 'jina',              'jina-embeddings-v3',                1024, 'retrieval.passage',  'retrieval.query', false, true, 'Jina v3 multilingual LoRA (1024d, free 1M token trial)'),
  ('bge-m3-1024',             'openai-compatible', 'BAAI/bge-m3',                       1024, null,                 null,              false, true, 'Self-hosted Ollama / vLLM / Cloudflare Workers AI BGE-M3 (1024d)')
on conflict (model_id) do nothing;

-- Ensure at least one default exists if rows pre-existed with none marked default
update library_graph.embedding_models
   set is_default = true
 where model_id = 'gemini-embedding-2-768'
   and not exists (select 1 from library_graph.embedding_models where is_default = true);

-- 2b. Permanent Content-Addressable Embedding Vault (survives library clean wipes)
create table if not exists library_graph.embedding_vault (
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  model_id       text not null references library_graph.embedding_models(model_id) on delete cascade,
  embedding      extensions.halfvec not null,
  updated_at     timestamptz not null default now(),
  primary key (content_sha256, model_id)
);

create index if not exists idx_lg_vault_model
  on library_graph.embedding_vault (model_id);

-- 2c. Unified Legal Knowledge Graph Nodes
create table if not exists library_graph.nodes (
  node_key          text primary key check (char_length(node_key) between 3 and 260),
  node_type         text not null check (node_type in ('article', 'principle', 'decree', 'feqh', 'concept')),
  source_id         text not null check (btrim(source_id) <> ''),
  law_slug          text,
  collection_id     text,
  article_number    integer,
  doc_status        text,
  item_status       text,
  is_page_numbered  boolean not null default false,
  is_embeddable     boolean not null default true,
  title             text not null check (btrim(title) <> ''),
  url               text not null default '',
  display_text      text not null check (btrim(display_text) <> ''),
  contextual_header text not null default '',
  content_sha256    text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  fts               tsvector generated always as (
                      pg_catalog.to_tsvector(
                        'simple'::regconfig,
                        library_graph.fold_tashkeel(
                          coalesce(title, '') || ' ' || coalesce(contextual_header, '') || ' ' || coalesce(display_text, '')
                        )
                      )
                    ) stored,
  metadata          jsonb not null default '{}'::jsonb,
  updated_at        timestamptz not null default now()
);

create index if not exists idx_lg_nodes_fts
  on library_graph.nodes using gin (fts);
create index if not exists idx_lg_nodes_type
  on library_graph.nodes (node_type);
create index if not exists idx_lg_nodes_law_slug
  on library_graph.nodes (law_slug)
  where law_slug is not null;
create index if not exists idx_lg_nodes_sha256
  on library_graph.nodes (content_sha256);

-- 2d. Active Node Embeddings (Dimension-Agnostic `halfvec` + Partial HNSW per model)
create table if not exists library_graph.node_embeddings (
  node_key         text not null references library_graph.nodes(node_key) on delete cascade,
  model_id         text not null references library_graph.embedding_models(model_id) on delete cascade,
  node_type        text not null check (node_type in ('article', 'principle', 'decree', 'feqh', 'concept')),
  is_active_corpus boolean not null default true,
  embedding        extensions.halfvec not null,
  updated_at       timestamptz not null default now(),
  primary key (node_key, model_id)
);

create index if not exists idx_lg_node_embeddings_model
  on library_graph.node_embeddings (model_id, node_type)
  where is_active_corpus = true;

-- Default Partial Expression HNSW Index for `gemini-embedding-2-768` (768d)
create index if not exists idx_lg_hnsw_gemini_embedding_2_768
  on library_graph.node_embeddings
  using hnsw ((embedding::extensions.halfvec(768)) extensions.halfvec_cosine_ops)
  with (m = 16, ef_construction = 64)
  where model_id = 'gemini-embedding-2-768' and is_active_corpus = true;

-- 2e. Typed Legal Graph Edges (Auto-Watchdog + Owner-Curated Coexistence)
create table if not exists library_graph.edges (
  source_key text not null references library_graph.nodes(node_key) on delete cascade,
  target_key text not null references library_graph.nodes(node_key) on delete cascade,
  edge_type  text not null check (
               edge_type in (
                 'PARENT_LAW',
                 'SUPERSEDES_LAW',
                 'EXEMPTS_FROM',
                 'CITES_ARTICLE',
                 'AMENDS_ARTICLE',
                 'INTERPRETS_ARTICLE',
                 'ESTABLISHES_RULE',
                 'DECONSTRUCTS_CONCEPT',
                 'HAS_CONCEPT'
               )
             ),
  origin     text not null default 'auto_watchdog' check (origin in ('auto_watchdog', 'owner_curated')),
  weight     real not null default 1.0 check (weight > 0.0 and weight <= 5.0),
  evidence   text,
  metadata   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (source_key, target_key, edge_type)
);

create index if not exists idx_lg_edges_source
  on library_graph.edges (source_key);
create index if not exists idx_lg_edges_target
  on library_graph.edges (target_key);
create index if not exists idx_lg_edges_type
  on library_graph.edges (edge_type);

-- 2f. Watchdog Sync State & Audit Runs
create table if not exists library_graph.sync_state (
  id                   smallint primary key default 1 check (id = 1),
  dirty                boolean not null default true,
  dirty_tables         text[] not null default '{}',
  first_dirty_at       timestamptz default now(),
  last_write_at        timestamptz default now(),
  last_synced_at       timestamptz,
  last_sync_status     text not null default 'pending_initial_sync',
  last_error           text,
  include_feqh_vectors boolean not null default false,
  updated_at           timestamptz not null default now()
);

insert into library_graph.sync_state (id, dirty, last_sync_status)
values (1, true, 'pending_initial_sync')
on conflict (id) do nothing;

create table if not exists library_graph.sync_runs (
  id             bigserial primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  trigger_source text not null default 'watchdog',
  model_id       text,
  status         text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'skipped_wipe')),
  nodes_upserted integer not null default 0,
  nodes_deleted  integer not null default 0,
  edges_upserted integer not null default 0,
  vault_relinked integer not null default 0,
  api_embedded   integer not null default 0,
  error_message  text,
  details        jsonb not null default '{}'::jsonb
);

create index if not exists idx_lg_sync_runs_started
  on library_graph.sync_runs (started_at desc);

-- ── 3. RLS & Privilege Lockdown on All `library_graph` Tables ────────────────
alter table library_graph.embedding_models enable row level security;
alter table library_graph.embedding_models force row level security;
alter table library_graph.embedding_vault enable row level security;
alter table library_graph.embedding_vault force row level security;
alter table library_graph.nodes enable row level security;
alter table library_graph.nodes force row level security;
alter table library_graph.node_embeddings enable row level security;
alter table library_graph.node_embeddings force row level security;
alter table library_graph.edges enable row level security;
alter table library_graph.edges force row level security;
alter table library_graph.sync_state enable row level security;
alter table library_graph.sync_state force row level security;
alter table library_graph.sync_runs enable row level security;
alter table library_graph.sync_runs force row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'embedding_models',
    'embedding_vault',
    'nodes',
    'node_embeddings',
    'edges',
    'sync_state',
    'sync_runs'
  ] loop
    execute format('revoke all on table library_graph.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table library_graph.%I to service_role', t);
    -- service_role accesses private tables through SECURITY INVOKER RPCs; give
    -- explicit service_role policy since FORCE ROW LEVEL SECURITY is enabled.
    execute format('drop policy if exists lg_service_role_all on library_graph.%I', t);
    execute format(
      'create policy lg_service_role_all on library_graph.%I for all to service_role using (true) with check (true)',
      t
    );
  end loop;
end $$;

revoke all on sequence library_graph.sync_runs_id_seq from public, anon, authenticated;
grant usage, select on sequence library_graph.sync_runs_id_seq to service_role;

-- ── 4. Lightweight Statement-Level Dirty Triggers on the 14 `library.*` Tables ─
create or replace function library_graph.mark_library_dirty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into library_graph.sync_state (id, dirty, dirty_tables, first_dirty_at, last_write_at, updated_at)
  values (1, true, array[tg_table_name::text], now(), now(), now())
  on conflict (id) do update set
    dirty          = true,
    dirty_tables   = (
      select coalesce(pg_catalog.array_agg(distinct x order by x), '{}'::text[])
        from pg_catalog.unnest(library_graph.sync_state.dirty_tables || array[tg_table_name::text]) as x
    ),
    first_dirty_at = coalesce(library_graph.sync_state.first_dirty_at, now()),
    last_write_at  = now(),
    updated_at     = now();
  return null;
end;
$$;

revoke all on function library_graph.mark_library_dirty() from public, anon, authenticated;
grant execute on function library_graph.mark_library_dirty() to service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'laws', 'chapters', 'articles', 'article_amendments', 'article_regulations',
    'decrees_circulars', 'decree_pages', 'judicial_collections', 'principles',
    'principle_paragraphs', 'feqh_books', 'feqh_chapters', 'feqh_sections', 'feqh_blocks'
  ] loop
    if to_regclass('library.' || t) is not null then
      execute format('drop trigger if exists trg_library_graph_dirty on library.%I', t);
      execute format(
        'create trigger trg_library_graph_dirty after insert or update or delete or truncate on library.%I for each statement execute function library_graph.mark_library_dirty()',
        t
      );
    end if;
  end loop;
end $$;

-- ── 5. Dynamic Partial HNSW Index Builder (supports 64..4000 dims) ───────────
create or replace function library_graph.ensure_model_hnsw_index(p_model_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dims integer;
  v_idx  text;
begin
  select m.dimensions into v_dims
    from library_graph.embedding_models m
   where m.model_id = p_model_id;
  if v_dims is null then
    raise exception 'unknown embedding model_id: %', coalesce(p_model_id, 'NULL');
  end if;

  v_idx := 'idx_lg_hnsw_' || pg_catalog.regexp_replace(pg_catalog.lower(p_model_id), '[^a-z0-9_]+', '_', 'g');
  v_idx := pg_catalog.left(v_idx, 60);

  execute pg_catalog.format(
    'create index if not exists %I on library_graph.node_embeddings using hnsw ((embedding::extensions.halfvec(%s)) extensions.halfvec_cosine_ops) with (m = 16, ef_construction = 64) where model_id = %L and is_active_corpus = true',
    v_idx,
    v_dims,
    p_model_id
  );

  return v_idx;
end;
$$;

revoke all on function library_graph.ensure_model_hnsw_index(text) from public, anon, authenticated;
grant execute on function library_graph.ensure_model_hnsw_index(text) to service_role;

-- ── 6. PostgREST Service-Role Entry Points (`public.graph_rag_*`) ────────────

-- 6a. Status Summary for Admin Dashboard & CLI
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

-- 6b. Pure-SQL Instant Vault Relinker ($0 API cost after library wipe+reload)
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
    updated_at       = now();
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

-- 6c. Switch Default Model (creates Partial HNSW index + relinks vault + marks dirty if needed)
create or replace function public.graph_rag_set_default_model(p_model_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idx    text;
  v_relink jsonb;
begin
  if not exists (select 1 from library_graph.embedding_models m where m.model_id = p_model_id and m.is_active = true) then
    raise exception 'embedding model % does not exist or is inactive', coalesce(p_model_id, 'NULL');
  end if;

  v_idx := library_graph.ensure_model_hnsw_index(p_model_id);

  update library_graph.embedding_models set is_default = false where is_default = true and model_id <> p_model_id;
  update library_graph.embedding_models set is_default = true  where model_id = p_model_id and is_default = false;

  v_relink := public.graph_rag_relink_vault(p_model_id);

  if coalesce((v_relink->>'missing')::integer, 0) > 0 then
    update library_graph.sync_state
       set dirty = true,
           dirty_tables = (
             select coalesce(pg_catalog.array_agg(distinct x order by x), '{}'::text[])
               from pg_catalog.unnest(dirty_tables || array['model_switch']) as x
           ),
           last_write_at = now() - interval '5 minutes',
           updated_at = now()
     where id = 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok',         true,
    'model_id',   p_model_id,
    'hnsw_index', v_idx,
    'relink',     v_relink
  );
end;
$$;

-- 6d. Batch Upsert Graph Nodes (up to 500 rows per call)
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
    updated_at        = excluded.updated_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 6e. Batch Upsert Graph Edges (never overwrites `owner_curated` edges; skips missing target nodes cleanly)
create or replace function public.graph_rag_upsert_edges(p_rows jsonb, p_touch_time timestamptz default now())
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
  if pg_catalog.jsonb_array_length(p_rows) > 1500 then
    raise exception 'batch size exceeds 1500 edges';
  end if;

  with valid_edges as (
    select distinct on (r->>'source_key', r->>'target_key', r->>'edge_type')
      r->>'source_key' as source_key,
      r->>'target_key' as target_key,
      r->>'edge_type'  as edge_type,
      coalesce(nullif(r->>'origin', ''), 'auto_watchdog') as origin,
      coalesce((r->>'weight')::real, 1.0) as weight,
      nullif(r->>'evidence', '') as evidence,
      coalesce(r->'metadata', '{}'::jsonb) as metadata
    from pg_catalog.jsonb_array_elements(p_rows) as r
    where (r->>'source_key') <> (r->>'target_key')
      and exists (select 1 from library_graph.nodes ns where ns.node_key = (r->>'source_key'))
      and exists (select 1 from library_graph.nodes nt where nt.node_key = (r->>'target_key'))
  )
  insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence, metadata, updated_at)
  select source_key, target_key, edge_type, origin, weight, evidence, metadata, p_touch_time
    from valid_edges
  on conflict (source_key, target_key, edge_type) do update set
    weight     = excluded.weight,
    evidence   = excluded.evidence,
    metadata   = excluded.metadata,
    updated_at = excluded.updated_at
  where library_graph.edges.origin <> 'owner_curated';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 6f. Prune Stale Nodes & Auto-Edges After Full Pass (`embedding_vault` stays untouched!)
create or replace function public.graph_rag_prune_stale(p_sync_started_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted_edges integer := 0;
  v_deleted_nodes integer := 0;
begin
  delete from library_graph.edges e
   where e.origin = 'auto_watchdog'
     and e.updated_at < p_sync_started_at;
  get diagnostics v_deleted_edges = row_count;

  delete from library_graph.nodes n
   where n.updated_at < p_sync_started_at;
  get diagnostics v_deleted_nodes = row_count;

  return pg_catalog.jsonb_build_object(
    'deleted_nodes', v_deleted_nodes,
    'deleted_edges', v_deleted_edges
  );
end;
$$;

-- 6g. Cursor-Streamed Reader for Nodes Missing Active Model Embeddings
create or replace function public.graph_rag_missing_embeddings(
  p_model_id  text default null,
  p_after_key text default '',
  p_limit     integer default 100
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_model text;
begin
  select m.model_id into v_model
    from library_graph.embedding_models m
   where (p_model_id is not null and m.model_id = p_model_id)
      or (p_model_id is null and m.is_default = true)
   limit 1;

  if v_model is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'node_key',          sub.node_key,
        'node_type',         sub.node_type,
        'content_sha256',    sub.content_sha256,
        'contextual_header', sub.contextual_header,
        'display_text',      sub.display_text
      )
      order by sub.node_key asc
    )
    from (
      select n.node_key, n.node_type, n.content_sha256, n.contextual_header, n.display_text
        from library_graph.nodes n
       where n.is_embeddable = true
         and n.node_key > coalesce(p_after_key, '')
         and not exists (
           select 1 from library_graph.node_embeddings ne
            where ne.node_key = n.node_key and ne.model_id = v_model
         )
       order by n.node_key asc
       limit least(greatest(coalesce(p_limit, 100), 1), 250)
    ) sub
  ), '[]'::jsonb);
end;
$$;

-- 6h. Store Newly Computed Embeddings into BOTH `embedding_vault` & `node_embeddings`
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
  where extensions.halfvec_dims((r->>'embedding')::extensions.halfvec) = v_dims
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
  where extensions.halfvec_dims((r->>'embedding')::extensions.halfvec) = v_dims
  on conflict (node_key, model_id) do update set
    node_type        = excluded.node_type,
    is_active_corpus = excluded.is_active_corpus,
    embedding        = excluded.embedding,
    updated_at       = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 6i. Watchdog Sync State & Run Lifecycle Controller
create or replace function public.graph_rag_sync_control(p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id   bigint;
  v_started  timestamptz;
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

    v_started := now();
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

-- 6j. Hybrid Legal GraphRAG Retriever (FTS + Partial HNSW Cosine + Concept Nodes + 1-Hop Graph Walk)
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
  v_has_vec    boolean := false;
  v_vec_sql    text;
  v_result     jsonb;
begin
  select exists (select 1 from library_graph.nodes limit 1) into v_has_nodes;
  if not v_has_nodes then
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
      if extensions.halfvec_dims(p_query_embedding::extensions.halfvec) = v_dims then
        select exists (
          select 1 from library_graph.node_embeddings ne
           where ne.model_id = v_model and ne.is_active_corpus = true
           limit 1
        ) into v_has_vec;
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
             pg_catalog.greatest(coalesce(g.sim, 0), coalesce(s.sim, 0)) as sim,
             pg_catalog.least(coalesce(g.vec_rank, 999), coalesce(s.scoped_rank, 999)) as vec_rank
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
              0.012 * pg_catalog.greatest(
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

-- ── 7. Lock Down All `public.graph_rag_*` RPCs to `service_role` ONLY ────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.graph_rag_status()',
    'public.graph_rag_relink_vault(text)',
    'public.graph_rag_set_default_model(text)',
    'public.graph_rag_upsert_nodes(jsonb, timestamptz)',
    'public.graph_rag_upsert_edges(jsonb, timestamptz)',
    'public.graph_rag_prune_stale(timestamptz)',
    'public.graph_rag_missing_embeddings(text, text, integer)',
    'public.graph_rag_store_embeddings(text, jsonb)',
    'public.graph_rag_sync_control(text, jsonb)',
    'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ── 8. Self-Verification Inside Transaction (rolls back on any failure) ──────
do $$
declare
  fk_leaks integer;
  r        text;
  fn       text;
  t        text;
  missing  text := '';
begin
  -- 8a. Strictly zero foreign keys into `library.*`
  select count(*) into fk_leaks
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_namespace n on n.oid = c.connamespace
    join pg_catalog.pg_class refc on refc.oid = c.confrelid
   where n.nspname = 'library_graph'
     and c.contype = 'f'
     and refc.relnamespace = 'library'::regnamespace;
  if fk_leaks > 0 then
    missing := missing || format(' %s foreign key(s) from library_graph reference library.* (breaks clean wipe);', fk_leaks);
  end if;

  -- 8b. Schema & Table Lockdown
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      if has_schema_privilege(r, 'library_graph', 'USAGE') then
        missing := missing || format(' %s holds USAGE on schema library_graph;', r);
      end if;
      foreach t in array array['embedding_models', 'embedding_vault', 'nodes', 'node_embeddings', 'edges', 'sync_state', 'sync_runs'] loop
        if has_table_privilege(r, 'library_graph.' || t, 'SELECT, INSERT, UPDATE, DELETE') then
          missing := missing || format(' %s holds table privilege on library_graph.%s;', r, t);
        end if;
      end loop;
    end if;
  end loop;

  -- 8c. Public RPC Lockdown
  foreach fn in array array[
    'public.graph_rag_status()',
    'public.graph_rag_relink_vault(text)',
    'public.graph_rag_set_default_model(text)',
    'public.graph_rag_upsert_nodes(jsonb, timestamptz)',
    'public.graph_rag_upsert_edges(jsonb, timestamptz)',
    'public.graph_rag_prune_stale(timestamptz)',
    'public.graph_rag_missing_embeddings(text, text, integer)',
    'public.graph_rag_store_embeddings(text, jsonb)',
    'public.graph_rag_sync_control(text, jsonb)',
    'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'
  ] loop
    if to_regprocedure(fn) is null then
      missing := missing || format(' %s is missing;', fn);
    else
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
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261110_10 verify:%', missing;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ── 9. Final SQL Editor Check (expect `ok = true`) ───────────────────────────
select 'library_graph schema, halfvec(768) HNSW, zero FKs into library.*, service_role-only RPCs' as check,
       to_regnamespace('library_graph') is not null
       and to_regclass('library_graph.embedding_vault') is not null
       and to_regclass('library_graph.nodes') is not null
       and to_regclass('library_graph.node_embeddings') is not null
       and to_regclass('library_graph.edges') is not null
       and to_regclass('library_graph.idx_lg_hnsw_gemini_embedding_2_768') is not null
       and exists (select 1 from library_graph.embedding_models where model_id = 'gemini-embedding-2-768' and is_default = true and dimensions = 768)
       and not exists (
         select 1 from pg_catalog.pg_constraint c
           join pg_catalog.pg_namespace n on n.oid = c.connamespace
           join pg_catalog.pg_class refc on refc.oid = c.confrelid
          where n.nspname = 'library_graph' and c.contype = 'f' and refc.relnamespace = 'library'::regnamespace
       )
       and not has_schema_privilege('anon', 'library_graph', 'USAGE')
       and not has_schema_privilege('authenticated', 'library_graph', 'USAGE')
       and not has_function_privilege('anon', 'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)', 'EXECUTE')
       and has_function_privilege('service_role', 'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)', 'EXECUTE')
       as ok;
