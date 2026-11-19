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
  missingVectorsFrom,
  nextFailureBackoffMs,
  nextQuotaBackoffMs,
  runGraphSyncPass,
  runSimilarityStep,
  shouldTriggerSync,
  similarityPageFrom,
  similarityParamsFrom,
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
/** One quiet poll's share of the vector-link step; the loop re-checks the library between steps. */
const SIMILARITY_BUDGET_MS = 25_000;

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

/**
 * The owner's links (20261118_10). Read when the database has them; before
 * that migration the read falls back to the other columns and the pass goes
 * on without them. Probed again at the start of every pass, so the links are
 * read from the first pass after the SQL runs, without a restart.
 */
const LAW_COLS =
  "slug, title, type, status, parent_law_id, instrument_id, supersedes_law_slug, enabling_article, section_code, law_guid, issuing_instrument";
const LAW_OWNER_COLS = ", owner_links";
const DECREE_COLS = "id, title, type, issuer, summary, summary_brief, preamble";
const DECREE_OWNER_COLS = ", owner_links";
let ownerLinkColumns = true;
/** A select naming a column the database does not have (PostgREST passes Postgres 42703 through). */
const isMissingColumn = (error) => error?.code === "42703" || /column .* does not exist/i.test(error?.message ?? "");

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

    async abandonRunning() {
      const { data, error } = await admin.rpc("graph_rag_sync_control", {
        p_action: "abandon_running",
        p_payload: {},
      });
      if (error) {
        // The first migration has no abandon_running: a stuck run then waits out its 2 h timeout.
        console.warn(`[graph-watchdog] abandon_running unavailable (${error.message}); apply 20261114_10.`);
        return 0;
      }
      return Number(data?.abandoned ?? 0);
    },

    async finishRun(payload) {
      const { error } = await admin.rpc("graph_rag_sync_control", {
        p_action: "finish_run",
        p_payload: payload,
      });
      if (error) throw new Error(`graph_rag_sync_control(finish_run): ${error.message}`);
    },

    async *streamLawBundles() {
      ownerLinkColumns = true;
      const lawsPageSize = 20;
      let lawOffset = 0;
      for (;;) {
        const readLaws = () =>
          admin
            .schema("library")
            .from("laws")
            .select(ownerLinkColumns ? LAW_COLS + LAW_OWNER_COLS : LAW_COLS)
            .order("slug", { ascending: true })
            .range(lawOffset, lawOffset + lawsPageSize - 1);
        let { data: laws, error } = await readLaws();
        if (error && ownerLinkColumns && isMissingColumn(error)) {
          ownerLinkColumns = false;
          console.warn("[graph-watchdog] library.laws has no owner_links yet (run 20261118_10): the owner's links are skipped this pass.");
          ({ data: laws, error } = await readLaws());
        }
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
                .order("order_index", { ascending: true })
                .order("id", { ascending: true }),
            ),
            fetchAllPages(() =>
              admin
                .schema("library")
                .from("articles")
                .select("id, law_slug, chapter_id, number, number_text, title, status, text, executive_reg_text, order_index")
                .eq("law_slug", law.slug)
                .order("order_index", { ascending: true })
                .order("id", { ascending: true }),
            ),
            fetchAllPages(() =>
              admin
                .schema("library")
                .from("article_regulations")
                .select("id, article_id, text, status, sort_key, ref, reg_num")
                .eq("law_slug", law.slug)
                .order("sort_key", { ascending: true })
                .order("id", { ascending: true }),
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
                .select("id, article_id, summary, date")
                .in("article_id", ids)
                // Oldest first, so "the last summary" is the same on every pass (stable content hash).
                .order("date", { ascending: true, nullsFirst: true })
                .order("id", { ascending: true }),
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
            .order("id", { ascending: true })
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
        const readDecrees = () =>
          admin
            .schema("library")
            .from("decrees_circulars")
            .select(ownerLinkColumns ? DECREE_COLS + DECREE_OWNER_COLS : DECREE_COLS)
            .order("id", { ascending: true })
            .range(dOffset, dOffset + dPage - 1);
        let { data: decrees, error } = await readDecrees();
        if (error && ownerLinkColumns && isMissingColumn(error)) {
          ownerLinkColumns = false;
          ({ data: decrees, error } = await readDecrees());
        }
        if (error) throw new Error(`library.decrees_circulars read failed: ${error.message}`);
        if (!decrees || decrees.length === 0) break;

        const ids = decrees.map((d) => d.id);
        const pages = await fetchAllPages(() =>
          admin
            .schema("library")
            .from("decree_pages")
            .select("id, decree_id, page_number, content")
            .in("decree_id", ids)
            .lte("page_number", 6)
            .order("decree_id", { ascending: true })
            .order("page_number", { ascending: true })
            .order("id", { ascending: true }),
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
            .eq("book_id", book.id)
            .order("id", { ascending: true }),
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
              .in("chapter_id", slice)
              .order("id", { ascending: true }),
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

    async buildSimilarity(modelId, limit, params) {
      const { data, error } = await admin.rpc("graph_rag_build_similarity", {
        p_model_id: modelId,
        p_limit: limit,
        p_params: params,
      });
      if (error) {
        const err = new Error(`graph_rag_build_similarity: ${error.message}`);
        err.code = error.code;
        throw err;
      }
      return {
        processed: Number(data?.processed ?? 0),
        similar: Number(data?.similar ?? 0),
        replaced: Number(data?.replaced ?? 0),
        skipped: typeof data?.skipped === "string" ? data.skipped : undefined,
      };
    },

    async refreshReplacements() {
      const { data, error } = await admin.rpc("graph_rag_refresh_replacements");
      if (error) {
        // Before 20261118_10 the function does not exist: nothing to refresh.
        if (error.code === "PGRST202" || error.code === "42883") return { changed_laws: 0, reset: 0 };
        throw new Error(`graph_rag_refresh_replacements: ${error.message}`);
      }
      return { changed_laws: Number(data?.changed_laws ?? 0), reset: Number(data?.reset ?? 0) };
    },

    async resolveOwnerEdges() {
      const { data, error } = await admin.rpc("graph_rag_resolve_owner_edges");
      if (error) {
        // Before 20261130_40 the function does not exist: no owner edges yet.
        if (error.code === "PGRST202" || error.code === "42883") return null;
        throw new Error(`graph_rag_resolve_owner_edges: ${error.message}`);
      }
      return data ?? null;
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
      shouldStop: () => shuttingDown,
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
  // Only one daemon runs (PM2 fork mode): a `running` row left by a previous process that
  // was killed mid-pass is dead, and would otherwise block every new pass for 2 hours.
  try {
    const abandoned = await backend.abandonRunning();
    if (abandoned > 0) console.log(`[graph-watchdog] Marked ${abandoned} unfinished run(s) from a previous process as failed.`);
  } catch (err) {
    console.error("[graph-watchdog] abandon_running failed:", err instanceof Error ? err.message : err);
  }
  // Free-tier quota pause: after a 429 / RESOURCE_EXHAUSTED the daemon stops calling the
  // embedding API for 15 min (doubling up to 6 h). Library changes still rebuild the graph.
  let quotaPausedUntil = 0;
  let quotaBackoffMs = 0;
  // A failed pass (or an embed-only pass that stored nothing) waits 1 min, doubling to 1 h,
  // instead of restreaming the whole library on every poll.
  let failurePausedUntil = 0;
  let failureBackoffMs = 0;
  // Vector links (20261116_10): GRAPH_RAG_SIMILARITY=off turns the step off.
  let similarityEnabled = (process.env.GRAPH_RAG_SIMILARITY ?? "").trim().toLowerCase() !== "off";
  let lastSimilaritySkip;
  const similarityParams = similarityParamsFrom(process.env);
  const similarityPage = similarityPageFrom(process.env.GRAPH_RAG_SIMILARITY_PAGE);
  let skipSleep = false;
  while (!shuttingDown) {
    try {
      if (Date.now() < failurePausedUntil) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      const st = await backend.getStatus();
      const dbModel = st.models?.find((m) => m.is_default) ?? st.models?.[0];
      const profile = dbModel
        ? profileFromDbRow(dbModel)
        : resolveEmbeddingModelProfile(st.default_model_id);
      const missingVecs = missingVectorsFrom(st);
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
          shouldStop: () => shuttingDown,
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

        const stuck = res.status === "succeeded" && embedOnly && !res.quotaPaused && res.apiEmbedded === 0;
        if ((res.status === "failed" && !shuttingDown) || stuck) {
          failureBackoffMs = nextFailureBackoffMs(failureBackoffMs);
          failurePausedUntil = Date.now() + failureBackoffMs;
          console.log(
            `[graph-watchdog] ${stuck ? "Catch-up stored no vectors" : "Pass failed"} — next try in ${Math.round(failureBackoffMs / 60000)} min.`,
          );
        } else if (res.status === "succeeded") {
          failureBackoffMs = 0;
        }
      } else if (similarityEnabled && !st.sync_state?.dirty) {
        // Quiet poll: the vector links (similar articles and principles, the current
        // counterpart of a repealed article) for nodes whose vector is new or changed.
        // Time-boxed, so a library change is still picked up within the budget.
        try {
          const step = await runSimilarityStep(backend, {
            modelId: profile.modelId,
            timeBudgetMs: SIMILARITY_BUDGET_MS,
            pageSize: similarityPage,
            params: similarityParams,
            shouldStop: () => shuttingDown,
          });
          if (step.refreshError) {
            console.warn(`[graph-watchdog] Replacement refresh failed (retried next step): ${step.refreshError}`);
          }
          if (step.refreshed) {
            console.log(`[graph-watchdog] Laws' successors changed: ${step.refreshed} repealed articles queued to find their replacement again.`);
          }
          if (step.skipped !== lastSimilaritySkip) {
            lastSimilaritySkip = step.skipped;
            if (step.skipped === "vectors_incomplete") {
              console.log("[graph-watchdog] Vector links wait: more than 0.5% of articles/principles have no vector yet.");
            }
          }
          if (step.processed > 0) {
            console.log(
              `[graph-watchdog] Vector links: +${step.processed} nodes (similar=${step.similar}, replaced=${step.replaced})${step.done ? " — all current." : "..."}`,
            );
          }
          skipSleep = !step.done;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (err?.code === "PGRST202" || /Could not find the function|does not exist/i.test(msg)) {
            similarityEnabled = false;
            console.log("[graph-watchdog] Vector links off: apply supabase/migrations/20261116_10_library_graph_links.sql first.");
          } else {
            console.error("[graph-watchdog] Vector links error:", msg);
          }
        }
      }
    } catch (err) {
      console.error("[graph-watchdog] Poll error:", err instanceof Error ? err.message : err);
    }

    if (skipSleep) {
      skipSleep = false;
      continue;
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
