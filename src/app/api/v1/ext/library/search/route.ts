import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { graphRagEnabled } from "@/lib/ai/graphRagSwitch";
import { searchLegalGraph } from "@/lib/ai/graphService";
import { EXT_USAGE_NOTICE_AR, toExtHits, type ArticleMeta, type RetrievedHit } from "@/lib/ext/extLibrary";
import { extError, extJson, requireExtCaller } from "../../_extAuth";
import { extReadGate } from "../../_extReadAccess";

/**
 * GET /api/v1/ext/library/search?q=&type=&law=&limit= — search the library for a token caller.
 *
 * The same retrieval the AI tools use (searchLegalGraph: graph when NZAMY_GRAPH_RAG is on,
 * keyword otherwise). Every hit is listed (number, title, the library's own status); its snippet
 * (up to 240 chars) is filled only for a reader entitled to that text (extLibrary.toExtHits),
 * else `locked: true` and an empty snippet. Never the full text.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set(["law", "article", "principle", "decree", "fiqh"]);
const SAFE_SLUG = /^[\p{L}\p{N}_.\-]{1,200}$/u;

export async function GET(request: NextRequest) {
  const caller = await requireExtCaller(request, "library:read");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const p = request.nextUrl.searchParams;
    const q = (p.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 400) return extError(400, "validation", "اكتب كلمة بحث من حرفين إلى ٤٠٠ حرف.", rid);
    const type = p.get("type");
    if (type && !KINDS.has(type)) return extError(400, "validation", "نوع غير معروف.", rid);
    const law = p.get("law");
    if (law && !SAFE_SLUG.test(law)) return extError(400, "validation", "معرّف النظام غير صالح.", rid);
    const limitRaw = Number(p.get("limit") ?? 8);
    const limit = Number.isInteger(limitRaw) ? Math.min(20, Math.max(1, limitRaw)) : 8;

    const gate = await extReadGate(caller.userId, rid);
    if (gate instanceof NextResponse) return gate;

    const admin = await createServiceClient();
    const found = await searchLegalGraph(admin, {
      question: q,
      queries: [q.slice(0, 300)],
      lawSlug: law,
      limits: { laws: limit, principles: Math.max(2, Math.ceil(limit / 2)) },
    });
    const hits: RetrievedHit[] = [];
    for (const s of found.sources) {
      const ref = found.map[s.sid];
      if (ref) hits.push({ kind: ref.kind, id: ref.id, title: ref.title, url: ref.url, text: s.text });
    }
    const wanted = type ? hits.filter((h) => h.kind === type) : hits;

    const ids = wanted.filter((h) => h.kind === "article").map((h) => h.id);
    const meta = new Map<string, ArticleMeta>();
    const titles = new Map<string, string>();
    if (ids.length > 0) {
      const arts = await admin.schema("library").from("articles").select("id, law_slug, number, status").in("id", ids);
      if (arts.error) return extError(503, "unavailable", "تعذّر البحث الآن — حاول بعد قليل.", rid);
      for (const a of (arts.data ?? []) as Array<{ id: string; law_slug: string; number: number | null; status: string | null }>) meta.set(a.id, a);
      const slugs = [...new Set([...meta.values()].map((m) => m.law_slug))];
      if (slugs.length > 0) {
        const laws = await admin.schema("library").from("laws").select("slug, title").in("slug", slugs);
        for (const l of (laws.data ?? []) as Array<{ slug: string; title: string }>) titles.set(l.slug, l.title);
      }
    }
    return extJson(
      200,
      {
        request_id: rid,
        hits: toExtHits(wanted, meta, titles, gate.access, limit),
        routing: { source: graphRagEnabled() ? "graph" : "keyword" },
        usage_notice: EXT_USAGE_NOTICE_AR,
      },
      rid,
    );
  } catch (err) {
    console.error("[ext/library/search] failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر البحث الآن — حاول بعد قليل.", rid);
  }
}
