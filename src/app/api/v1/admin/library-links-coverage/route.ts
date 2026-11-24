import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { readerLinkTypes } from "@/lib/library/graphLinkTypes";
import { parseLinkCoverage, type LinkCoverage } from "@/lib/library/linkCoverage";

/**
 * GET /api/v1/admin/library-links-coverage — «تغطية الإحالات» (batch l14,
 * owner file 07 §2 / §12.8, approved 23 Nov §15): per law, the share of
 * articles with at least one legal link, links per article, similar-meaning
 * coverage apart, the owner's links on the whole law and the gone anchors;
 * and the anomalies (more than five links of one type between one article and
 * one other document). Read-only, any staff role. Titles and counts only.
 *
 * One heavy read over the whole graph: kept five minutes in this process
 * (?fresh=1 reads again). Before 20261204_40: { schemaMissing: true, migration }.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const KEEP_MS = 5 * 60 * 1000;
let kept: { at: number; data: LinkCoverage } | null = null;

export async function GET(request: Request) {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  if (!fresh && kept && Date.now() - kept.at < KEEP_MS) {
    return NextResponse.json({ ok: true, checkedAt: new Date(kept.at).toISOString(), coverage: kept.data }, { headers: NO_STORE });
  }
  const admin = await createServiceClient();
  // Every reader link type; the function counts SIMILAR_TO apart, never as a legal link.
  const { data, error } = await admin.rpc("graph_rag_link_coverage", { p_types: readerLinkTypes(true), p_anomaly_min: 6, p_sample: 50 });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      return NextResponse.json({ schemaMissing: true, migration: "20261204_40_library_link_coverage.sql" }, { headers: NO_STORE });
    }
    console.error("[admin/library-links-coverage] failed:", error.code ?? "no-code", error.message);
    return NextResponse.json({ error: "تعذّر تحميل تغطية الإحالات" }, { status: 500, headers: NO_STORE });
  }
  kept = { at: Date.now(), data: parseLinkCoverage(data) };
  return NextResponse.json({ ok: true, checkedAt: new Date(kept.at).toISOString(), coverage: kept.data }, { headers: NO_STORE });
}
