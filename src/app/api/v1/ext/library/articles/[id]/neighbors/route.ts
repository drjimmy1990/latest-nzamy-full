import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { explorerEdgeFilter, hideUnreviewedLinks } from "@/lib/ai/graphExplorerCore";
import { EXT_EDGE_TYPES, EXT_USAGE_NOTICE_AR, explorerTypesFor, nodeKeyForArticle, toExtEdges } from "@/lib/ext/extLibrary";
import { extError, extJson, requireExtCaller } from "../../../../_extAuth";
import { extReadGate } from "../../../../_extReadAccess";

/**
 * GET /api/v1/ext/library/articles/<id>/neighbors?edge=&depth=&limit= — the article's legal links.
 *
 * The graph explorer's own neighbourhood RPC (graph_rag_explore_neighborhood), unreviewed links
 * hidden as on the admin explorer, the explorer's types folded into the contract's eight and
 * outline links dropped (extLibrary.toExtEdges). Snippets follow the same entitlement rule as
 * search. Needs the graph:read scope.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_.:\-]{1,200}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireExtCaller(request, "graph:read");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const { id } = await params;
    if (!ID.test(id)) return extError(404, "not_found", "لم يُعثر على هذه المادة.", rid);
    const p = request.nextUrl.searchParams;
    const edge = p.get("edge");
    if (edge && !(EXT_EDGE_TYPES as readonly string[]).includes(edge)) return extError(400, "validation", "نوع رابط غير معروف.", rid);
    const depth = Number(p.get("depth") ?? 1) === 2 ? 2 : 1;
    const limitRaw = Number(p.get("limit") ?? 12);
    const limit = Number.isInteger(limitRaw) ? Math.min(30, Math.max(1, limitRaw)) : 12;

    const gate = await extReadGate(caller.userId, rid);
    if (gate instanceof NextResponse) return gate;

    const admin = await createServiceClient();
    const rootKey = nodeKeyForArticle(id);
    const { data, error } = await admin.rpc("graph_rag_explore_neighborhood", {
      p_node_key: rootKey,
      p_depth: depth,
      p_edge_types: edge ? explorerEdgeFilter(explorerTypesFor(edge)) : null,
      // Outline links are dropped after the call, so ask for more than the lawyer wants.
      p_limit: Math.min(100, limit * 3),
    });
    if (error) {
      console.error("[ext/library/neighbors] rpc failed:", error.code);
      return extError(503, "unavailable", "تعذّر تحميل الروابط الآن — حاول بعد قليل.", rid);
    }
    const edges = toExtEdges(hideUnreviewedLinks(data), rootKey, gate.access, limit);
    return extJson(200, { request_id: rid, root_id: id, edges, usage_notice: EXT_USAGE_NOTICE_AR }, rid);
  } catch (err) {
    console.error("[ext/library/neighbors] failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر تحميل الروابط الآن — حاول بعد قليل.", rid);
  }
}
