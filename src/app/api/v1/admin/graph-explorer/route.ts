import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { hasEmbeddingCredentials, resolveEmbeddingModelProfile } from "@/lib/ai/embeddingClient";
import { embedQueryWithin } from "@/lib/ai/graphRagSwitch";
import { deriveLabQueries, isExplorerNodeType, parseExplorerRequest, type LabHit } from "@/lib/ai/graphExplorerCore";
import { parseSearchQuery } from "@/utils/normalizeArabic";

/**
 * GET /api/v1/admin/graph-explorer — data for «مستكشف الجراف القانوني»
 * (/dashboard/admin/graph-explorer). Read-only; any staff role (requireStaff("read")).
 *
 *   ?action=overview                               corpus stats, coverage, hubs, concepts
 *   ?action=search&q=&types=&limit=                node search
 *   ?action=neighborhood&key=&depth=&edges=&limit= 1–2 hop neighbourhood
 *   ?action=node&key=                              one node in full
 *   ?action=retrieve&q=&keywords=                  the retrieval lab: runs the
 *       same hybrid graph_rag_retrieve the AI tools use (one query embedding
 *       when a key is set), so staff can see what a question would cite.
 *
 * Service client: library_graph is server-only. Before 20261113_10 is applied
 * the explorer RPCs do not exist; that answers { schemaMissing: true }.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const EXPLORER_MIGRATION = "20261113_10_library_graph_explorer.sql";

type RpcError = { code?: string; message?: string } | null;

/** The explorer (or the base graph) migration is not applied yet. */
function explorerSchemaMissing(error: RpcError): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "3F000") return true;
  return /graph_rag_explore|library_graph/i.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? "");
}

function missing() {
  return NextResponse.json({ schemaMissing: true, migration: EXPLORER_MIGRATION }, { headers: NO_STORE });
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
      return NextResponse.json({ ok: true, overview: data }, { headers: NO_STORE });
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
        p_edge_types: req.edges.length > 0 ? req.edges : null,
        p_limit: req.limit,
      });
      if (error) return explorerSchemaMissing(error) ? missing() : failed("neighborhood", error);
      return NextResponse.json({ ok: true, neighborhood: data }, { headers: NO_STORE });
    }

    if (req.action === "node") {
      const { data, error } = await admin.rpc("graph_rag_explore_node", { p_node_key: req.key });
      if (error) return explorerSchemaMissing(error) ? missing() : failed("node", error);
      return NextResponse.json({ ok: true, node: data }, { headers: NO_STORE });
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

    const { data, error } = await admin.rpc("graph_rag_retrieve", {
      p_tsqueries: tsqueries,
      p_query_embedding: literal,
      p_model_id: literal ? modelId : null,
      p_law_slug: null,
      p_limit_laws: 8,
      p_limit_principles: 4,
      p_limit_decrees: 2,
      p_limit_feqh: 2,
      p_enable_graph_hop: true,
    });
    if (error) return explorerSchemaMissing(error) ? missing() : failed("retrieve", error);

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
          law_slug: typeof h.law_slug === "string" ? h.law_slug : null,
          status: typeof h.status === "string" ? h.status : null,
          url: typeof h.url === "string" ? h.url : "",
          text: typeof h.text === "string" ? h.text.slice(0, 600) : "",
        });
      }
    }
    hits.sort((a, b) => b.score - a.score);

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
  return NextResponse.json({ error: "تعذّر تحميل بيانات الجراف" }, { status: 503, headers: NO_STORE });
}
