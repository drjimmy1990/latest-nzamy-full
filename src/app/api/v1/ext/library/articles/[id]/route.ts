import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer";
import { libraryQuotaTarget, quotaRefusal } from "@/lib/library/readQuota";
import { mayReadLawText, toExtArticle, type ArticleRow, type LockReason } from "@/lib/ext/extLibrary";
import { extError, extJson, requireExtCaller } from "../../../_extAuth";
import { extReadGate } from "../../../_extReadAccess";

/**
 * GET /api/v1/ext/library/articles/<id>[?excerpt=1] — one article, entitlement first.
 *
 * Order: library closed switch, then the reader's entitlement (full access or a whitelisted law;
 * no free preview through a token), then for a full read the same per-document quota and
 * security lock the website spends (library_read_quota_hit, key `law:<slug>`, the key opening the
 * law page uses), then the text. A refusal is a 200 with `locked: true` and a `lock_reason`,
 * no text. `?excerpt=1` serves at most 240 chars and spends nothing.
 *
 * Not applied here yet: the per-device limit (a token is not a browser device); the per-document
 * quota and the MCP server's own daily cap bound it meanwhile. `amended_by` is empty until the
 * amendment link is read here.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_.:\-]{1,200}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireExtCaller(request, "library:read");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const { id } = await params;
    if (!ID.test(id)) return extError(404, "not_found", "لم يُعثر على هذه المادة.", rid);
    const excerpt = request.nextUrl.searchParams.get("excerpt") === "1";

    const gate = await extReadGate(caller.userId, rid);
    if (gate instanceof NextResponse) return gate;

    const admin = await createServiceClient();
    const art = await admin
      .schema("library")
      .from("articles")
      .select("id, law_slug, number, number_text, title, text, original_text, status")
      .eq("id", id)
      .maybeSingle();
    if (art.error) return extError(503, "unavailable", "تعذّر تحميل المادة الآن — حاول بعد قليل.", rid);
    if (!art.data) return extError(404, "not_found", "لم يُعثر على هذه المادة.", rid);
    const row = art.data as ArticleRow;
    const law = await admin.schema("library").from("laws").select("title").eq("slug", row.law_slug).maybeSingle();
    const lawTitle = typeof (law.data as { title?: unknown } | null)?.title === "string" ? (law.data as { title: string }).title : "";

    const mayRead = mayReadLawText(gate.access, row.law_slug);
    let refusal: LockReason | null = null;
    let remaining: number | null = null;
    if (mayRead && !excerpt) {
      const target = libraryQuotaTarget("GET", `/api/library/laws/${encodeURIComponent(row.law_slug)}`);
      if (!target || target.kind !== "doc") {
        refusal = "plan"; // no document key = no way to count it: closed, never open
      } else {
        const hit = await libraryReadQuotaHit(caller.userId, target.docKey);
        const refused = quotaRefusal(hit, Date.now());
        if (refused) {
          const code = String(refused.body.code ?? "");
          refusal = code === "library_security_lock" ? "library_lock" : code === "library_hourly_limit" ? "hourly_quota" : "daily_quota";
        }
        if (hit && typeof hit.dayLimit === "number" && typeof hit.usedToday === "number") remaining = Math.max(0, hit.dayLimit - hit.usedToday);
      }
    }
    return extJson(200, toExtArticle(row, lawTitle, { mayRead, refusal, excerptOnly: excerpt, remainingToday: remaining }, [], rid), rid);
  } catch (err) {
    console.error("[ext/library/articles/:id] failed:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر تحميل المادة الآن — حاول بعد قليل.", rid);
  }
}
