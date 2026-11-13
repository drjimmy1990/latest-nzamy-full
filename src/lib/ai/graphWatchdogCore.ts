/**
 * graphWatchdogCore.ts — Low-Memory (<60MB RAM) Auto-Syncing Legal GraphRAG
 * Watchdog Pipeline & Debounce Engine.
 *
 * Pure module (relative `.ts` imports only) so `node --test` runs it natively.
 */
import {
  embedTexts,
  formatHalfvecLiteral,
  hasEmbeddingCredentials,
  profileFromDbRow,
  resolveEmbeddingModelProfile,
  type EmbeddingModelProfile,
} from "./embeddingClient.ts";
import {
  buildArticleGraphNodes,
  buildCuratedConceptNodes,
  buildDecreeGraphNodes,
  buildFeqhGraphNodes,
  buildPrincipleGraphNodes,
  extractArticleEdges,
  extractConceptEdges,
  extractDecreeAmendmentEdges,
  extractPrincipleInterpretationEdges,
  normalizeArabicKey,
  type GraphEdgePayload,
  type GraphNodePayload,
  type LawIndexMap,
  type RawAmendmentRow,
  type RawArticleRow,
  type RawCollectionRow,
  type RawDecreePageRow,
  type RawDecreeRow,
  type RawFeqhBlockRow,
  type RawFeqhBookRow,
  type RawLawRow,
  type RawPrincipleRow,
  type RawRegulationRow,
} from "./graphBuilder.ts";

export const DEFAULT_QUIET_WINDOW_MS = 180_000; // 3 minutes settle time after last library write
export const MIN_SAFE_LAWS_COUNT = 10; // Mid-wipe safety guard

/** Free-tier quota pause: first wait 15 min, doubling up to 6 h (daily quotas reset once a day). */
export const QUOTA_BACKOFF_MIN_MS = 15 * 60_000;
export const QUOTA_BACKOFF_MAX_MS = 6 * 60 * 60_000;

/** True for a provider rate-limit / quota failure (HTTP 429, RESOURCE_EXHAUSTED, "exceeded your quota"). */
export function isEmbeddingQuotaError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /Embedding HTTP 429\b|RESOURCE_EXHAUSTED|exceeded (?:your )?(?:current )?quota|rate limit/i.test(msg);
}

/** The next pause after a quota error: 15 min, then doubling, capped at 6 h. */
export function nextQuotaBackoffMs(previousMs: number): number {
  if (!Number.isFinite(previousMs) || previousMs <= 0) return QUOTA_BACKOFF_MIN_MS;
  return Math.min(QUOTA_BACKOFF_MAX_MS, Math.max(QUOTA_BACKOFF_MIN_MS, previousMs * 2));
}

export interface SyncDecisionInput {
  dirty: boolean;
  lastWriteAt: string | null;
  libraryLawsCount: number;
  missingVectors: number;
  hasCredentials: boolean;
  nowMs?: number;
  quietWindowMs?: number;
  force?: boolean;
  allowEmptyCorpus?: boolean;
}

export interface SyncDecision {
  trigger: boolean;
  reason:
    | "mid_wipe_guard"
    | "quiet_window_debounce"
    | "forced"
    | "dirty_settled"
    | "missing_embeddings"
    | "up_to_date";
}

export function shouldTriggerSync(input: SyncDecisionInput): SyncDecision {
  const nowMs = input.nowMs ?? Date.now();
  const quietMs = input.quietWindowMs ?? DEFAULT_QUIET_WINDOW_MS;

  if (!input.allowEmptyCorpus && input.libraryLawsCount < MIN_SAFE_LAWS_COUNT) {
    return { trigger: false, reason: "mid_wipe_guard" };
  }

  if (input.force) {
    return { trigger: true, reason: "forced" };
  }

  if (input.dirty) {
    const lastWriteMs = input.lastWriteAt ? Date.parse(input.lastWriteAt) : 0;
    if (Number.isFinite(lastWriteMs) && lastWriteMs > 0 && nowMs - lastWriteMs < quietMs) {
      return { trigger: false, reason: "quiet_window_debounce" };
    }
    return { trigger: true, reason: "dirty_settled" };
  }

  if (input.missingVectors > 0 && input.hasCredentials) {
    return { trigger: true, reason: "missing_embeddings" };
  }

  return { trigger: false, reason: "up_to_date" };
}

export interface MissingEmbeddingRow {
  node_key: string;
  node_type: string;
  content_sha256: string;
  contextual_header: string;
  display_text: string;
}

export interface GraphStatusSnapshot {
  default_model_id: string | null;
  library_laws_count: number;
  embeddable_nodes: number;
  sync_state: {
    dirty?: boolean;
    include_feqh_vectors?: boolean;
    last_write_at?: string | null;
  } | null;
  models: Array<{
    model_id: string;
    provider: string;
    api_model: string;
    dimensions: number;
    task_document?: string | null;
    task_query?: string | null;
    is_default?: boolean;
    active_vectors?: number;
  }>;
}

export interface GraphWatchdogBackend {
  getStatus(): Promise<GraphStatusSnapshot>;
  startRun(payload: { trigger_source: string; model_id: string }): Promise<{
    ok: boolean;
    reason?: string;
    run_id?: number;
    started_at?: string;
  }>;
  finishRun(payload: Record<string, unknown>): Promise<void>;
  streamLawBundles(): AsyncIterable<{
    law: RawLawRow;
    chaptersById: ReadonlyMap<string, string>;
    articles: readonly RawArticleRow[];
    regulationsByArticleId: ReadonlyMap<string, readonly RawRegulationRow[]>;
    amendmentsByArticleId: ReadonlyMap<string, readonly RawAmendmentRow[]>;
  }>;
  streamPrincipleBundles(): AsyncIterable<{
    collection: RawCollectionRow;
    principles: readonly RawPrincipleRow[];
  }>;
  streamDecreeBundles(): AsyncIterable<readonly { decree: RawDecreeRow; pages: readonly RawDecreePageRow[] }[]>;
  streamFeqhBundles(): AsyncIterable<{
    book: RawFeqhBookRow;
    chaptersById: ReadonlyMap<string, string>;
    sectionsById: ReadonlyMap<string, string>;
    blocks: readonly RawFeqhBlockRow[];
  }>;
  upsertNodes(rows: readonly GraphNodePayload[], touchTime: string): Promise<number>;
  upsertEdges(rows: readonly GraphEdgePayload[], touchTime: string): Promise<number>;
  pruneStale(syncStartedAt: string): Promise<{ deleted_nodes: number; deleted_edges: number }>;
  relinkVault(modelId: string): Promise<{ relinked: number; pruned: number; missing: number }>;
  fetchMissingEmbeddings(modelId: string, afterKey: string, limit: number): Promise<MissingEmbeddingRow[]>;
  storeEmbeddings(
    modelId: string,
    rows: readonly { node_key: string; content_sha256: string; embedding: string }[],
  ): Promise<number>;
}

export interface SyncRunSummary {
  status: "succeeded" | "skipped_wipe" | "already_running" | "failed";
  modelId: string;
  nodesUpserted: number;
  nodesDeleted: number;
  edgesUpserted: number;
  vaultRelinked: number;
  apiEmbedded: number;
  errorMessage?: string;
  /** The embedding provider's quota/rate limit stopped this pass; stored vectors were kept. */
  quotaPaused?: true;
}

const NODE_BATCH_LIMIT = 350;
const EDGE_BATCH_LIMIT = 900;
const EMBED_CURSOR_PAGE = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runGraphSyncPass(
  backend: GraphWatchdogBackend,
  options: {
    triggerSource?: string;
    includeFeqhVectors?: boolean;
    allowSmallCorpus?: boolean;
    maxEmbedNodes?: number;
    batchDelayMs?: number;
    /** Catch-up mode: the graph is current, so skip every library stream and only embed missing vectors. */
    embedOnly?: boolean;
    /** Quota pause: rebuild the graph (+ $0 vault relink) but call no embedding API. */
    skipEmbedding?: boolean;
    env?: Record<string, string | undefined>;
    embedFn?: (texts: readonly string[], profile: EmbeddingModelProfile) => Promise<number[][]>;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<SyncRunSummary> {
  const env = options.env ?? process.env;
  const log = options.onProgress ?? (() => {});
  const status = await backend.getStatus();

  const dbDefault = status.models?.find((m) => m.is_default) ?? status.models?.[0];
  const profile: EmbeddingModelProfile = dbDefault
    ? profileFromDbRow(dbDefault)
    : resolveEmbeddingModelProfile(status.default_model_id, env);

  if (!options.allowSmallCorpus && status.library_laws_count < MIN_SAFE_LAWS_COUNT) {
    log(
      `[graph-watchdog] Skipping sync: library.laws has ${status.library_laws_count} rows (< ${MIN_SAFE_LAWS_COUNT} mid-wipe guard).`,
    );
    return {
      status: "skipped_wipe",
      modelId: profile.modelId,
      nodesUpserted: 0,
      nodesDeleted: 0,
      edgesUpserted: 0,
      vaultRelinked: 0,
      apiEmbedded: 0,
    };
  }

  const started = await backend.startRun({
    trigger_source: options.triggerSource ?? "watchdog",
    model_id: profile.modelId,
  });
  if (!started.ok || !started.run_id || !started.started_at) {
    return {
      status: "already_running",
      modelId: profile.modelId,
      nodesUpserted: 0,
      nodesDeleted: 0,
      edgesUpserted: 0,
      vaultRelinked: 0,
      apiEmbedded: 0,
    };
  }

  const touchTime = started.started_at;
  const includeFeqhVectors =
    options.includeFeqhVectors ?? Boolean(status.sync_state?.include_feqh_vectors);

  let nodesUpserted = 0;
  let nodesDeleted = 0;
  let edgesUpserted = 0;
  let vaultRelinked = 0;
  let apiEmbedded = 0;

  let nodeBuffer: GraphNodePayload[] = [];
  let edgeBuffer: GraphEdgePayload[] = [];

  const flushNodes = async () => {
    while (nodeBuffer.length > 0) {
      const slice = nodeBuffer.slice(0, NODE_BATCH_LIMIT);
      nodeBuffer = nodeBuffer.slice(NODE_BATCH_LIMIT);
      nodesUpserted += await backend.upsertNodes(slice, touchTime);
    }
  };

  const flushEdges = async () => {
    while (edgeBuffer.length > 0) {
      const slice = edgeBuffer.slice(0, EDGE_BATCH_LIMIT);
      edgeBuffer = edgeBuffer.slice(EDGE_BATCH_LIMIT);
      edgesUpserted += await backend.upsertEdges(slice, touchTime);
    }
  };

  try {
    // embedOnly (catch-up): the graph is already current, so embed until the missing-vector cursor is empty.
    let missingAfterRelink = Number.POSITIVE_INFINITY;
    let quotaPaused = false;

    if (options.embedOnly) {
      log(`[graph-watchdog] Catch-up mode: graph is current, embedding missing vectors only...`);
    } else {
      // ── Pass 1: Stream Laws, Articles, Active Regulations & Amendments ────────
      const lawMap: LawIndexMap = new Map();
      const articleEdgeStubs: Array<{
        node_key: string;
        law_slug: string | null;
        is_page_numbered: boolean;
        display_text: string;
      }> = [];

      log(`[graph-watchdog] Streaming laws & articles...`);
      for await (const bundle of backend.streamLawBundles()) {
        const built = buildArticleGraphNodes(bundle);
        const artKeyByNumber = new Map<number, string>();
        for (const n of built) {
          if (n.article_number !== null && !artKeyByNumber.has(n.article_number)) {
            artKeyByNumber.set(n.article_number, n.node_key);
          }
        }
        const rootNodeKey = artKeyByNumber.get(1) ?? built[0]?.node_key ?? null;
        lawMap.set(bundle.law.slug, {
          slug: bundle.law.slug,
          title: bundle.law.title,
          normalizedTitle: normalizeArabicKey(bundle.law.title),
          parentLawId: bundle.law.parent_law_id ?? null,
          supersedesLawSlug: bundle.law.supersedes_law_slug ?? null,
          enablingArticle: bundle.law.enabling_article ?? null,
          articleKeyByNumber: artKeyByNumber,
          rootNodeKey,
        });

        for (const n of built) {
          nodeBuffer.push(n);
          if (
            !n.is_page_numbered &&
            (n.node_key === rootNodeKey || /الماد(?:ة|تين)/.test(n.display_text))
          ) {
            articleEdgeStubs.push({
              node_key: n.node_key,
              law_slug: n.law_slug,
              is_page_numbered: n.is_page_numbered,
              display_text: n.display_text,
            });
          }
        }
        if (nodeBuffer.length >= NODE_BATCH_LIMIT) {
          await flushNodes();
        }
      }
      await flushNodes();

      // ── Pass 2: Stream Judicial Principles & Extract `INTERPRETS_ARTICLE` ─────
      log(`[graph-watchdog] Streaming judicial principles...`);
      for await (const bundle of backend.streamPrincipleBundles()) {
        const pNodes = buildPrincipleGraphNodes(bundle);
        for (const p of pNodes) {
          nodeBuffer.push(p);
          if (p.display_text.includes("الماد")) {
            edgeBuffer.push(...extractPrincipleInterpretationEdges(p, lawMap));
          }
        }
        if (nodeBuffer.length >= NODE_BATCH_LIMIT) await flushNodes();
      }
      await flushNodes();

      // ── Pass 3: Stream Royal Decrees & Extract `AMENDS_ARTICLE` ───────────────
      log(`[graph-watchdog] Streaming decrees & circulars...`);
      for await (const batch of backend.streamDecreeBundles()) {
        const dNodes = buildDecreeGraphNodes(batch);
        for (const d of dNodes) {
          nodeBuffer.push(d);
          if (d.display_text.includes("الماد")) {
            edgeBuffer.push(...extractDecreeAmendmentEdges(d, lawMap));
          }
        }
        if (nodeBuffer.length >= NODE_BATCH_LIMIT) await flushNodes();
      }
      await flushNodes();

      // ── Pass 4: Stream Fiqh Jurisprudence Blocks (bounded RAM) ────────────────
      log(`[graph-watchdog] Streaming fiqh jurisprudence blocks (embedVectors=${includeFeqhVectors})...`);
      for await (const bundle of backend.streamFeqhBundles()) {
        const fNodes = buildFeqhGraphNodes({
          ...bundle,
          includeFeqhVectors,
        });
        for (const f of fNodes) {
          nodeBuffer.push(f);
          if (nodeBuffer.length >= NODE_BATCH_LIMIT) {
            await flushNodes();
          }
        }
      }
      await flushNodes();

      // ── Pass 5: Curated Saudi Legal Concept Bridge Nodes ──────────────────────
      const conceptNodes = buildCuratedConceptNodes();
      nodeBuffer.push(...conceptNodes);
      await flushNodes();

      // ── Pass 6: Upsert All Typed Legal Graph Edges (after all target nodes exist!) ─
      log(`[graph-watchdog] Extracting & upserting typed legal graph edges...`);
      for (const stub of articleEdgeStubs) {
        edgeBuffer.push(...extractArticleEdges(stub, lawMap));
        if (edgeBuffer.length >= EDGE_BATCH_LIMIT) {
          await flushEdges();
        }
      }
      edgeBuffer.push(...extractConceptEdges(lawMap));
      await flushEdges();

      // ── Pass 7: Prune Stale Nodes/Auto-Edges & Instant SQL Vault Relink ($0) ──
      const pruned = await backend.pruneStale(touchTime);
      nodesDeleted = pruned.deleted_nodes;
      const relink = await backend.relinkVault(profile.modelId);
      vaultRelinked = relink.relinked;
      missingAfterRelink = relink.missing;
      log(
        `[graph-watchdog] Graph synced: upserted=${nodesUpserted}, pruned=${nodesDeleted}, edges=${edgesUpserted}, vaultRelinked=${vaultRelinked}, missingVectors=${relink.missing}`,
      );
    }

    // ── Pass 8: Incremental Delta Embedding (deduplicated by content_sha256) ──
    // A provider quota/rate-limit error pauses here: every vector already stored is kept,
    // the graph stays valid, and the daemon backs off before retrying (catch-up mode).
    const canEmbed = Boolean(options.embedFn) || hasEmbeddingCredentials(profile, env);
    if (options.skipEmbedding) {
      if (missingAfterRelink > 0) {
        log(`[graph-watchdog] Embedding paused (quota backoff): ${missingAfterRelink} nodes await vectors. Graph + FTS retrieval remain active.`);
      }
    } else if (missingAfterRelink > 0 && canEmbed) {
      const maxEmbed = options.maxEmbedNodes ?? Number.POSITIVE_INFINITY;
      const delayMs = options.batchDelayMs ?? Number(env.GRAPH_RAG_BATCH_DELAY_MS ?? 0);
      // Texts per embedding call. Free tiers cap tokens/minute (~30k), so ~20–25 Arabic
      // articles per call fits; paid tiers can use the provider maximum of 100.
      const rawPage = Math.trunc(Number(env.GRAPH_RAG_EMBED_BATCH_SIZE));
      const pageSize = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, EMBED_CURSOR_PAGE) : EMBED_CURSOR_PAGE;
      let cursor = "";

      try {
        while (apiEmbedded < maxEmbed) {
          const take = Math.min(pageSize, maxEmbed - apiEmbedded);
          const missingBatch = await backend.fetchMissingEmbeddings(profile.modelId, cursor, take);
          if (missingBatch.length === 0) break;
          cursor = missingBatch[missingBatch.length - 1].node_key;

          // Deduplicate identical content_sha256 within the batch so duplicate texts embed once!
          const uniqueShaList: string[] = [];
          const textBySha = new Map<string, string>();
          for (const row of missingBatch) {
            if (!textBySha.has(row.content_sha256)) {
              uniqueShaList.push(row.content_sha256);
              textBySha.set(
                row.content_sha256,
                [row.contextual_header.trim(), row.display_text.trim()].filter(Boolean).join("\n"),
              );
            }
          }

          const uniqueTexts = uniqueShaList.map((sha) => textBySha.get(sha) ?? " ");
          const vectors = options.embedFn
            ? await options.embedFn(uniqueTexts, profile)
            : await embedTexts(uniqueTexts, { profile, mode: "document", env });

          const literalBySha = new Map<string, string>();
          uniqueShaList.forEach((sha, idx) => {
            literalBySha.set(sha, formatHalfvecLiteral(vectors[idx]));
          });

          const toStore = missingBatch
            .map((row) => ({
              node_key: row.node_key,
              content_sha256: row.content_sha256,
              embedding: literalBySha.get(row.content_sha256) ?? "",
            }))
            .filter((r) => r.embedding !== "");

          apiEmbedded += await backend.storeEmbeddings(profile.modelId, toStore);
          log(`[graph-watchdog] Embedded +${toStore.length} vectors (total apiEmbedded=${apiEmbedded})...`);

          if (delayMs > 0) {
            await sleep(delayMs);
          }
        }
      } catch (embedErr) {
        if (!isEmbeddingQuotaError(embedErr)) throw embedErr;
        quotaPaused = true;
        log(`[graph-watchdog] Embedding quota reached after +${apiEmbedded} vectors; pausing (stored vectors are kept).`);
      }
    } else if (missingAfterRelink > 0 && !canEmbed) {
      log(
        `[graph-watchdog] Note: nodes await vectors, but no API key is set for ${profile.modelId}. Graph + FTS retrieval remain active.`,
      );
    }

    await backend.finishRun({
      run_id: started.run_id,
      started_at: touchTime,
      status: "succeeded",
      nodes_upserted: nodesUpserted,
      nodes_deleted: nodesDeleted,
      edges_upserted: edgesUpserted,
      vault_relinked: vaultRelinked,
      api_embedded: apiEmbedded,
      ...(quotaPaused
        ? { error_message: "Embedding quota/rate limit reached; vectors so far are kept and embedding resumes automatically." }
        : {}),
      details: {
        include_feqh_vectors: includeFeqhVectors,
        model_id: profile.modelId,
        embed_only: Boolean(options.embedOnly),
        quota_paused: quotaPaused,
      },
    });

    return {
      status: "succeeded",
      modelId: profile.modelId,
      nodesUpserted,
      nodesDeleted,
      edgesUpserted,
      vaultRelinked,
      apiEmbedded,
      ...(quotaPaused ? { quotaPaused: true as const } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await backend
      .finishRun({
        run_id: started.run_id,
        started_at: touchTime,
        status: "failed",
        nodes_upserted: nodesUpserted,
        nodes_deleted: nodesDeleted,
        edges_upserted: edgesUpserted,
        vault_relinked: vaultRelinked,
        api_embedded: apiEmbedded,
        error_message: msg.slice(0, 500),
      })
      .catch(() => {});

    return {
      status: "failed",
      modelId: profile.modelId,
      nodesUpserted,
      nodesDeleted,
      edgesUpserted,
      vaultRelinked,
      apiEmbedded,
      errorMessage: msg,
    };
  }
}
