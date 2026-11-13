#!/usr/bin/env node
/**
 * scripts/graph-watchdog.mjs — Auto-Syncing Legal GraphRAG Watchdog CLI & Daemon
 *
 * Modes:
 *   npm run graph:status                         # Inspect node/edge/vault/model counts
 *   npm run graph:sync                           # Run one delta sync pass immediately (--once --force)
 *   npm run graph:watch                          # Long-running low-memory (<60MB) PM2 Watchdog daemon
 *
 * Extra flags:
 *   --include-feqh-vectors                       # Also embed 173k Fiqh blocks into HNSW (default: FTS+Graph only)
 *   --max-embed=500                              # Cap new API embeddings in a single pass
 *   --batch-delay-ms=400                         # Optional pacing delay between embedding batches (free-tier friendly)
 *   --interval-sec=30                            # Poll interval in --watch mode (default: 30s)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  hasEmbeddingCredentials,
  profileFromDbRow,
  resolveEmbeddingModelProfile,
} from "../src/lib/ai/embeddingClient.ts";
import {
  nextQuotaBackoffMs,
  runGraphSyncPass,
  shouldTriggerSync,
} from "../src/lib/ai/graphWatchdogCore.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadDotEnvFile(filepath) {
  if (!existsSync(filepath)) return;
  const content = readFileSync(filepath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnvFile(join(ROOT, ".env.local"));
loadDotEnvFile(join(ROOT, ".env"));

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const getOpt = (prefix, fallback) => {
  const hit = args.find((a) => a.startsWith(`${prefix}=`));
  return hit ? hit.slice(prefix.length + 1) : fallback;
};

const isStatus = hasFlag("--status");
const isWatch = hasFlag("--watch");
const isOnce = hasFlag("--once") || (!isStatus && !isWatch);
const isForce = hasFlag("--force");
const includeFeqhFlag = hasFlag("--include-feqh-vectors") ? true : undefined;
const maxEmbedOpt = getOpt("--max-embed", "");
const maxEmbedNodes = maxEmbedOpt ? Number(maxEmbedOpt) : undefined;
const batchDelayOpt = getOpt("--batch-delay-ms", "");
const batchDelayMs = batchDelayOpt ? Number(batchDelayOpt) : undefined;
const intervalSec = Math.max(10, Number(getOpt("--interval-sec", "30")) || 30);

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseUrl || !serviceKey) {
  console.error(
    "[graph-watchdog] ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local or environment.",
  );
  process.exit(1);
}

const admin = createSupabaseClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Paginates any `library.*` query cleanly in small chunks so memory never spikes. */
async function fetchAllPages(buildQuery, pageSize = 500) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/** Builds the production Supabase-backed `GraphWatchdogBackend`. */
function createSupabaseWatchdogBackend() {
  return {
    async getStatus() {
      const { data, error } = await admin.rpc("graph_rag_status");
      if (error) {
        throw new Error(
          `graph_rag_status RPC failed (${error.message}). Did you apply supabase/migrations/20261110_10_library_graph_rag.sql?`,
        );
      }
      return data;
    },

    async startRun(payload) {
      const { data, error } = await admin.rpc("graph_rag_sync_control", {
        p_action: "start_run",
        p_payload: payload,
      });
      if (error) throw new Error(`graph_rag_sync_control(start_run): ${error.message}`);
      return data;
    },

    async finishRun(payload) {
      const { error } = await admin.rpc("graph_rag_sync_control", {
        p_action: "finish_run",
        p_payload: payload,
      });
      if (error) throw new Error(`graph_rag_sync_control(finish_run): ${error.message}`);
    },

    async *streamLawBundles() {
      const lawsPageSize = 20;
      let lawOffset = 0;
      for (;;) {
        const { data: laws, error } = await admin
          .schema("library")
          .from("laws")
          .select("slug, title, type, status, parent_law_id, supersedes_law_slug, enabling_article")
          .order("slug", { ascending: true })
          .range(lawOffset, lawOffset + lawsPageSize - 1);
        if (error) throw new Error(`library.laws read failed: ${error.message}`);
        if (!laws || laws.length === 0) break;

        for (const law of laws) {
          const [chapters, articles, regs] = await Promise.all([
            fetchAllPages(() =>
              admin
                .schema("library")
                .from("chapters")
                .select("id, title")
                .eq("law_slug", law.slug)
                .order("order_index", { ascending: true }),
            ),
            fetchAllPages(() =>
              admin
                .schema("library")
                .from("articles")
                .select("id, law_slug, chapter_id, number, number_text, title, status, text, executive_reg_text, order_index")
                .eq("law_slug", law.slug)
                .order("order_index", { ascending: true }),
            ),
            fetchAllPages(() =>
              admin
                .schema("library")
                .from("article_regulations")
                .select("id, article_id, text, status, sort_key")
                .eq("law_slug", law.slug)
                .order("sort_key", { ascending: true }),
            ),
          ]);

          const chaptersById = new Map(chapters.map((c) => [String(c.id), String(c.title || "")]));
          const regulationsByArticleId = new Map();
          for (const r of regs) {
            const list = regulationsByArticleId.get(r.article_id) ?? [];
            list.push(r);
            regulationsByArticleId.set(r.article_id, list);
          }

          // Fetch amendments in 200-ID chunks for articles in this law
          const amendmentsByArticleId = new Map();
          for (let i = 0; i < articles.length; i += 200) {
            const ids = articles.slice(i, i + 200).map((a) => a.id);
            if (ids.length === 0) continue;
            const amends = await fetchAllPages(() =>
              admin
                .schema("library")
                .from("article_amendments")
                .select("article_id, summary, date")
                .in("article_id", ids),
            );
            for (const am of amends) {
              const list = amendmentsByArticleId.get(am.article_id) ?? [];
              list.push(am);
              amendmentsByArticleId.set(am.article_id, list);
            }
          }

          yield {
            law,
            chaptersById,
            articles,
            regulationsByArticleId,
            amendmentsByArticleId,
          };
        }

        if (laws.length < lawsPageSize) break;
        lawOffset += lawsPageSize;
      }
    },

    async *streamPrincipleBundles() {
      const collections = await fetchAllPages(() =>
        admin
          .schema("library")
          .from("judicial_collections")
          .select("id, title, court, year_hijri, track")
          .order("id", { ascending: true }),
      );

      for (const collection of collections) {
        let pOffset = 0;
        const pPage = 250;
        for (;;) {
          const { data: principles, error } = await admin
            .schema("library")
            .from("principles")
            .select("id, collection_id, principle_number, issuing_body, text, ruling_basis, year_hijri, order_index")
            .eq("collection_id", collection.id)
            .order("order_index", { ascending: true })
            .range(pOffset, pOffset + pPage - 1);
          if (error) throw new Error(`library.principles read failed: ${error.message}`);
          if (!principles || principles.length === 0) break;
          yield { collection, principles };
          if (principles.length < pPage) break;
          pOffset += pPage;
        }
      }
    },

    async *streamDecreeBundles() {
      let dOffset = 0;
      const dPage = 50;
      for (;;) {
        const { data: decrees, error } = await admin
          .schema("library")
          .from("decrees_circulars")
          .select("id, title, type, issuer, summary, summary_brief, preamble")
          .order("id", { ascending: true })
          .range(dOffset, dOffset + dPage - 1);
        if (error) throw new Error(`library.decrees_circulars read failed: ${error.message}`);
        if (!decrees || decrees.length === 0) break;

        const ids = decrees.map((d) => d.id);
        const pages = await fetchAllPages(() =>
          admin
            .schema("library")
            .from("decree_pages")
            .select("decree_id, page_number, content")
            .in("decree_id", ids)
            .lte("page_number", 6)
            .order("page_number", { ascending: true }),
        );
        const pagesByDecree = new Map();
        for (const pg of pages) {
          const list = pagesByDecree.get(pg.decree_id) ?? [];
          list.push(pg);
          pagesByDecree.set(pg.decree_id, list);
        }

        yield decrees.map((decree) => ({
          decree,
          pages: pagesByDecree.get(decree.id) ?? [],
        }));

        if (decrees.length < dPage) break;
        dOffset += dPage;
      }
    },

    async *streamFeqhBundles() {
      const books = await fetchAllPages(() =>
        admin
          .schema("library")
          .from("feqh_books")
          .select("id, title, author, type")
          .order("id", { ascending: true }),
      );

      for (const book of books) {
        const chapters = await fetchAllPages(() =>
          admin
            .schema("library")
            .from("feqh_chapters")
            .select("id, title")
            .eq("book_id", book.id),
        );
        const chaptersById = new Map(chapters.map((c) => [String(c.id), String(c.title || "")]));

        const sectionsById = new Map();
        const chapterIds = chapters.map((c) => c.id);
        for (let i = 0; i < chapterIds.length; i += 150) {
          const slice = chapterIds.slice(i, i + 150);
          if (slice.length === 0) continue;
          const secs = await fetchAllPages(() =>
            admin
              .schema("library")
              .from("feqh_sections")
              .select("id, chapter_id, title")
              .in("chapter_id", slice),
          );
          for (const s of secs) {
            const chTitle = chaptersById.get(String(s.chapter_id)) || "";
            sectionsById.set(String(s.id), [chTitle, String(s.title || "")].filter(Boolean).join(" — "));
          }
        }

        let bOffset = 0;
        const bPage = 350;
        for (;;) {
          const { data: blocks, error } = await admin
            .schema("library")
            .from("feqh_blocks")
            .select("id, book_id, section_id, topic, matn, sharh, order_index")
            .eq("book_id", book.id)
            .order("order_index", { ascending: true })
            .order("id", { ascending: true })
            .range(bOffset, bOffset + bPage - 1);
          if (error) throw new Error(`library.feqh_blocks read failed: ${error.message}`);
          if (!blocks || blocks.length === 0) break;
          yield { book, chaptersById, sectionsById, blocks };
          if (blocks.length < bPage) break;
          bOffset += bPage;
        }
      }
    },

    async upsertNodes(rows, touchTime) {
      const { data, error } = await admin.rpc("graph_rag_upsert_nodes", {
        p_rows: rows,
        p_touch_time: touchTime,
      });
      if (error) throw new Error(`graph_rag_upsert_nodes: ${error.message}`);
      return Number(data ?? 0);
    },

    async upsertEdges(rows, touchTime) {
      const { data, error } = await admin.rpc("graph_rag_upsert_edges", {
        p_rows: rows,
        p_touch_time: touchTime,
      });
      if (error) throw new Error(`graph_rag_upsert_edges: ${error.message}`);
      return Number(data ?? 0);
    },

    async pruneStale(syncStartedAt) {
      const { data, error } = await admin.rpc("graph_rag_prune_stale", {
        p_sync_started_at: syncStartedAt,
      });
      if (error) throw new Error(`graph_rag_prune_stale: ${error.message}`);
      return data;
    },

    async relinkVault(modelId) {
      const { data, error } = await admin.rpc("graph_rag_relink_vault", {
        p_model_id: modelId,
      });
      if (error) throw new Error(`graph_rag_relink_vault: ${error.message}`);
      return data;
    },

    async fetchMissingEmbeddings(modelId, afterKey, limit) {
      const { data, error } = await admin.rpc("graph_rag_missing_embeddings", {
        p_model_id: modelId,
        p_after_key: afterKey,
        p_limit: limit,
      });
      if (error) throw new Error(`graph_rag_missing_embeddings: ${error.message}`);
      return Array.isArray(data) ? data : [];
    },

    async storeEmbeddings(modelId, rows) {
      const { data, error } = await admin.rpc("graph_rag_store_embeddings", {
        p_model_id: modelId,
        p_rows: rows,
      });
      if (error) throw new Error(`graph_rag_store_embeddings: ${error.message}`);
      return Number(data ?? 0);
    },
  };
}

const backend = createSupabaseWatchdogBackend();

let shuttingDown = false;
process.on("SIGINT", () => {
  shuttingDown = true;
  console.log("[graph-watchdog] Received SIGINT, stopping cleanly after current step...");
});
process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log("[graph-watchdog] Received SIGTERM, stopping cleanly after current step...");
});

async function main() {
  if (isStatus) {
    const st = await backend.getStatus();
    console.log(JSON.stringify(st, null, 2));
    return;
  }

  if (isOnce) {
    const res = await runGraphSyncPass(backend, {
      triggerSource: isForce ? "cli_force" : "cli_once",
      includeFeqhVectors: includeFeqhFlag,
      maxEmbedNodes,
      batchDelayMs,
      onProgress: (m) => console.log(m),
    });
    console.log("[graph-watchdog] Sync summary:", JSON.stringify(res));
    if (res.status === "failed") process.exit(1);
    return;
  }

  console.log(`[graph-watchdog] Daemon started (poll every ${intervalSec}s, quiet window 180s)...`);
  // Free-tier quota pause: after a 429 / RESOURCE_EXHAUSTED the daemon stops calling the
  // embedding API for 15 min (doubling up to 6 h). Library changes still rebuild the graph.
  let quotaPausedUntil = 0;
  let quotaBackoffMs = 0;
  while (!shuttingDown) {
    try {
      const st = await backend.getStatus();
      const dbModel = st.models?.find((m) => m.is_default) ?? st.models?.[0];
      const profile = dbModel
        ? profileFromDbRow(dbModel)
        : resolveEmbeddingModelProfile(st.default_model_id);
      const activeVecs = Number(dbModel?.active_vectors ?? 0);
      const missingVecs = Math.max(0, Number(st.embeddable_nodes ?? 0) - activeVecs);
      const quotaPaused = Date.now() < quotaPausedUntil;

      const decision = shouldTriggerSync({
        dirty: Boolean(st.sync_state?.dirty),
        lastWriteAt: st.sync_state?.last_write_at ?? null,
        libraryLawsCount: Number(st.library_laws_count ?? 0),
        missingVectors: quotaPaused ? 0 : missingVecs,
        hasCredentials: hasEmbeddingCredentials(profile),
        force: isForce,
      });

      if (decision.trigger) {
        const embedOnly = decision.reason === "missing_embeddings";
        console.log(
          `[graph-watchdog] Triggering sync (${decision.reason}${embedOnly ? ", embed-only catch-up" : ""}${quotaPaused ? ", embedding paused" : ""})...`,
        );
        const res = await runGraphSyncPass(backend, {
          triggerSource: `watchdog_${decision.reason}`,
          includeFeqhVectors: includeFeqhFlag,
          maxEmbedNodes,
          batchDelayMs,
          embedOnly,
          skipEmbedding: quotaPaused,
          onProgress: (m) => console.log(m),
        });
        console.log("[graph-watchdog] Pass finished:", JSON.stringify(res));

        if (res.quotaPaused) {
          quotaBackoffMs = nextQuotaBackoffMs(quotaBackoffMs);
          quotaPausedUntil = Date.now() + quotaBackoffMs;
          console.log(
            `[graph-watchdog] Embedding quota reached — pausing API calls for ${Math.round(quotaBackoffMs / 60000)} min (until ${new Date(quotaPausedUntil).toISOString()}).`,
          );
        } else if (res.status === "succeeded" && !quotaPaused) {
          quotaBackoffMs = 0;
        }
      }
    } catch (err) {
      console.error("[graph-watchdog] Poll error:", err instanceof Error ? err.message : err);
    }

    for (let i = 0; i < intervalSec && !shuttingDown; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

main().catch((err) => {
  console.error("[graph-watchdog] Fatal:", err);
  process.exit(1);
});
