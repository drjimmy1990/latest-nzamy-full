import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { hasEmbeddingCredentials, resolveEmbeddingModelProfile } from "@/lib/ai/embeddingClient";
import { embedQueryWithin } from "@/lib/ai/graphRagSwitch";
import {
  labLimits,
  deriveLabQueries,
  explorerEdgeFilter,
  hideUnreviewedLinks,
  isExplorerNodeType,
  shownEdgeCounts,
  parseExplorerRequest,
  parseExplorerStatus,
  parseLabRouting,
  type LabHit,
} from "@/lib/ai/graphExplorerCore";
import { graphFunctionMissing, graphSeedKeys, pinnedArticle, questionRefLookups } from "@/lib/ai/retrieval";
import { logGraphCall, parseExplorerLiveStats, type GraphCallRow } from "@/lib/ai/graphCallLog";
import { parseSearchQuery } from "@/utils/normalizeArabic";

/**
 * GET /api/v1/admin/graph-explorer — data for «مستكشف الجراف القانوني»
 * (/dashboard/admin/graph-explorer). Read-only; any staff role (requireStaff("read")).
 *
 *   ?action=overview                               corpus stats, coverage, hubs, concepts
 *   ?action=status                                 sync, passes, owner links, vector links (20261119_10)
 *   ?action=live&hours=                            the graph's live numbers: answered / fallbacks / time; lab failures (20261121_10)
 *   ?action=search&q=&types=&limit=                node search
 *   ?action=neighborhood&key=&depth=&edges=&limit= 1–2 hop neighbourhood
 *   ?action=node&key=                              one node in full
 *   ?action=retrieve&q=&keywords=&scope=&law=&article=&wide=
 *       the retrieval lab: runs the same hybrid graph retrieve the AI tools
 *       use (one query embedding when a key is set; the articles the question
 *       names, and the open article, as seeds; its named law, or the page's
 *       law, as the pinned law, 20261117_10), with the AI's own limits unless
 *       `wide=1` asks for decrees and fiqh too, so staff can see what a
 *       question would cite.
 *
 * Service client: library_graph is server-only. Before 20261113_10 is applied
 * the explorer RPCs do not exist; that answers { schemaMissing: true }.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const EXPLORER_MIGRATION = "20261113_10_library_graph_explorer.sql";
/** The lab's "section only" / "all sections" scopes call graph_rag_retrieve_scoped. */
const ROUTING_MIGRATION = "20261116_10_library_graph_links.sql";
/** The status tab's function. */
const STATUS_MIGRATION = "20261119_10_library_graph_explorer_parity.sql";
/** The live numbers in the status tab. */
const LIVE_MIGRATION = "20261121_10_library_graph_call_log.sql";
/** The articles a question names — like a live AI run's. */
const NAMED_LOOKUP_MS = 2000;

type RpcError = { code?: string; message?: string } | null;

/** The explorer (or the base graph) migration is not applied yet. */
function explorerSchemaMissing(error: RpcError): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "3F000") return true;
  return /graph_rag_explore|library_graph/i.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? "");
}

/** An overview / node answer whose `edge_counts` lists only the shown link types (owner decision ٦٠). */
function withShownEdgeCounts(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  return "edge_counts" in d ? { ...d, edge_counts: shownEdgeCounts(d.edge_counts) } : d;
}

function missing(migration: string = EXPLORER_MIGRATION) {
  return NextResponse.json({ schemaMissing: true, migration }, { headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;

  const parsed = parseExplorerRequest(request.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  }
  const req = parsed.value;

  try {
    const admin = await createServiceClient();

    if (req.action === "overview") {
      const { data, error } = await admin.rpc("graph_rag_explore_overview");
      if (error) return explorerSchemaMissing(error) ? missing() : failed("overview", error);
      return NextResponse.json({ ok: true, overview: withShownEdgeCounts(data) }, { headers: NO_STORE });
    }

    if (req.action === "status") {
      const { data, error } = await admin.rpc("graph_rag_explore_status");
      if (error) return explorerSchemaMissing(error) ? missing(STATUS_MIGRATION) : failed("status", error);
      return NextResponse.json({ ok: true, status: parseExplorerStatus(data) }, { headers: NO_STORE });
    }

    if (req.action === "live") {
      const { data, error } = await admin.rpc("graph_rag_explore_live_stats", { p_hours: req.hours });
      if (error) return explorerSchemaMissing(error) ? missing(LIVE_MIGRATION) : failed("live", error);
      return NextResponse.json({ ok: true, live: parseExplorerLiveStats(data) }, { headers: NO_STORE });
    }

    if (req.action === "search") {
      const { data, error } = await admin.rpc("graph_rag_explore_search", {
        p_query: req.q,
        p_types: req.types.length > 0 ? req.types : null,
        p_limit: req.limit,
      });
      if (error) return explorerSchemaMissing(error) ? missing() : failed("search", error);
      return NextResponse.json({ ok: true, results: Array.isArray(data) ? data : [] }, { headers: NO_STORE });
    }

    if (req.action === "neighborhood") {
      const { data, error } = await admin.rpc("graph_rag_explore_neighborhood", {
        p_node_key: req.key,
        p_depth: req.depth,
        // Owner decision ٦٠: only the link types matching his graph file (and the outline).
        p_edge_types: explorerEdgeFilter(req.edges),
        p_limit: req.limit,
      });
      if (error) return explorerSchemaMissing(error) ? missing() : failed("neighborhood", error);
      return NextResponse.json({ ok: true, neighborhood: hideUnreviewedLinks(data) }, { headers: NO_STORE });
    }

    if (req.action === "node") {
      const { data, error } = await admin.rpc("graph_rag_explore_node", { p_node_key: req.key });
      if (error) return explorerSchemaMissing(error) ? missing() : failed("node", error);
      return NextResponse.json({ ok: true, node: withShownEdgeCounts(data) }, { headers: NO_STORE });
    }

    // ── retrieval lab ────────────────────────────────────────────────────────
    const started = Date.now();
    const queries = deriveLabQueries(req.q, req.keywords);
    const tsqueries = queries
      .map((q) => {
        try {
          return parseSearchQuery(q).tsquery;
        } catch {
          return "";
        }
      })
      .filter(Boolean);

    const profile = resolveEmbeddingModelProfile();
    let embedding: "used" | "no_key" | "failed" = "no_key";
    let literal: string | null = null;
    let modelId: string | null = null;
    if (hasEmbeddingCredentials(profile)) {
      // Same 2.5 s, no-retry budget as a live AI run, so the lab shows what a run would get.
      const q = await embedQueryWithin(req.q);
      literal = q?.literal ?? null;
      modelId = q?.modelId ?? null;
      embedding = literal ? "used" : "failed";
    }

    // What the question names outright, looked up as a live run does: the
    // articles become seeds, the named law (or the page's law) the pinned
    // law; the open article leads the seeds (retrieval.ts, Path A).
    const lookup = new AbortController();
    const lookupTimer = setTimeout(() => lookup.abort(), NAMED_LOOKUP_MS);
    const named = questionRefLookups(admin, req.q, req.lawSlug ?? undefined, true, lookup.signal);
    const pinnedP = req.articleId ? pinnedArticle(admin, req.articleId, lookup.signal) : Promise.resolve(null);
    const [pinned, directRows, scopeSlug] = await Promise.all([pinnedP, named.direct, named.scopeSlug()]).finally(() =>
      clearTimeout(lookupTimer),
    );
    const seeds = graphSeedKeys([pinned, ...directRows]);
    const limits = labLimits(req.wide, req.size);

    const args = {
      p_tsqueries: tsqueries,
      p_query_embedding: literal,
      p_model_id: literal ? modelId : null,
      p_law_slug: scopeSlug,
      p_limit_laws: limits.laws,
      p_limit_principles: limits.principles,
      p_limit_decrees: limits.decrees,
      p_limit_feqh: limits.feqh,
      p_enable_graph_hop: req.links,
    };
    // `auto` with no seeds is exactly the nine-argument call; seeds need
    // 20261117_10 (before it the lab drops them, as a live run does), the
    // other scopes 20261116_10.
    let graphFn = "graph_rag_retrieve";
    const scoped = (withSeeds: boolean) => {
      graphFn = "graph_rag_retrieve_scoped";
      return admin.rpc("graph_rag_retrieve_scoped", { ...args, p_scope: req.scope, ...(withSeeds ? { p_seed_keys: seeds } : {}) });
    };
    const plain = () => {
      graphFn = "graph_rag_retrieve";
      return admin.rpc("graph_rag_retrieve", args);
    };
    const graphStarted = Date.now();
    let seedsUsed = seeds.length > 0;
    let { data, error } = seedsUsed || req.scope !== "auto" ? await scoped(seedsUsed) : await plain();
    if (error && seedsUsed && graphFunctionMissing(error.code)) {
      seedsUsed = false;
      ({ data, error } = req.scope === "auto" ? await plain() : await scoped(false));
    }
    // One row in library_graph.call_log per lab run (20261121_10): its options,
    // time and failure code, so a lab timeout can be traced to what was on.
    // Never the question. Not awaited.
    const labRow = (path: GraphCallRow["path"], miss: string | null, routing: ReturnType<typeof parseLabRouting>): GraphCallRow => ({
      source: "lab",
      path,
      graph_fn: graphFn,
      graph_ms: Date.now() - graphStarted,
      graph_miss: miss,
      seed_count: seedsUsed ? seeds.length : 0,
      vector_used: Boolean(literal),
      scope: req.scope,
      decrees: limits.decrees > 0,
      feqh: limits.feqh > 0,
      size: String(req.size),
      links: req.links,
      route_section: routing?.section ?? null,
      route_source: routing?.source ?? null,
      route_confident: routing ? routing.confident : null,
    });
    if (error) {
      if (!explorerSchemaMissing(error)) {
        void logGraphCall(admin, labRow("error", error.code ?? "error", null));
        return failed("retrieve", error);
      }
      return missing(req.scope === "auto" ? EXPLORER_MIGRATION : ROUTING_MIGRATION);
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    const hits: LabHit[] = [];
    for (const section of ["articles", "principles", "decrees", "feqh"]) {
      const list = Array.isArray(payload[section]) ? (payload[section] as Array<Record<string, unknown>>) : [];
      for (const h of list) {
        const kind = h.kind;
        if (typeof h.node_key !== "string" || !isExplorerNodeType(kind)) continue;
        hits.push({
          node_key: h.node_key,
          kind,
          title: String(h.title ?? h.node_key),
          score: Number(h.score ?? 0),
          via_edge_type: typeof h.via_edge_type === "string" ? h.via_edge_type : null,
          via_from_title: typeof h.via_from_title === "string" ? h.via_from_title : null,
          hop: typeof h.hop === "number" ? h.hop : undefined,
          seed: h.seed === true,
          law_slug: typeof h.law_slug === "string" ? h.law_slug : null,
          status: typeof h.status === "string" ? h.status : null,
          url: typeof h.url === "string" ? h.url : "",
          text: typeof h.text === "string" ? h.text.slice(0, 600) : "",
        });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    const routing = parseLabRouting(payload.routing);
    void logGraphCall(admin, labRow("graph", payload.ready !== true ? "not_ready" : hits.length === 0 ? "no_hits" : null, routing));

    return NextResponse.json(
      {
        ok: true,
        lab: {
          question: req.q,
          queries,
          ready: payload.ready === true,
          vector_used: payload.vector_used === true,
          model_id: literal ? modelId : null,
          embedding,
          elapsed_ms: Date.now() - started,
          routing,
          law_slug: scopeSlug,
          seeds: seedsUsed ? seeds : [],
          // The open article as asked for and as found (null: not found or not asked).
          article_id: req.articleId,
          article_found: req.articleId ? pinned !== null : null,
          wide: req.wide,
          links: req.links,
          size: req.size,
          hits,
        },
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[admin/graph-explorer] threw:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل بيانات الجراف" }, { status: 503, headers: NO_STORE });
  }
}

function failed(what: string, error: { code?: string; message?: string }) {
  console.error(`[admin/graph-explorer] ${what} failed:`, error.code, error.message);
  // 57014: the function's own statement_timeout (4 s for the lab's search).
  // Usually a cold cache: the same request right after is much faster.
  if (error.code === "57014") {
    return NextResponse.json(
      { error: "انتهت مهلة البحث في قاعدة البيانات. أعد المحاولة: الطلب الثاني أسرع عادةً." },
      { status: 503, headers: NO_STORE },
    );
  }
  return NextResponse.json({ error: "تعذّر تحميل بيانات الجراف" }, { status: 503, headers: NO_STORE });
}
