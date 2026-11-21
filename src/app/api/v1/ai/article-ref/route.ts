import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { libraryGate } from "@/lib/library-gate";
import { rateLimit } from "@/lib/rateLimit";
import {
  ARTICLE_REF_READ_ROWS,
  articleRefLawPattern,
  articleRefNumber,
  articleRefSlug,
  rankArticleRefLaws,
} from "@/lib/ai/articleRefLookup";

/**
 * GET /api/v1/ai/article-ref — N11 (batch l12; the owner's RAW[55]): the
 * «@مادة» helper of the drafter, contracts and case notes
 * (src/components/ai/ArticleRefAssist.tsx).
 *
 *   ?q=<law words>       up to 6 laws whose title matches: { laws: [{slug, title, lawType}] }
 *   ?law=<slug>&n=<n>    does that law have article n: { articles: [{number}] } ([] = no)
 *
 * Titles and article NUMBERS only — never a text — for a signed-in account.
 * Unlike the library's own autocomplete / citations routes, the per-account
 * library lock does NOT apply (the tool decided who may use it) and nothing
 * is counted against any reading cap; the library's closed switch does
 * (libraryGate accountLock: false, as ai/runs for every tool but the library
 * assistant). 60 requests a minute per account.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const BAD = () => NextResponse.json({ error: "طلب غير صالح" }, { status: 400, headers: NO_STORE });
const UNAVAILABLE = () => NextResponse.json({ error: "تعذّر البحث الآن — حاول بعد قليل" }, { status: 503, headers: NO_STORE });

export async function GET(request: NextRequest) {
  const gate = await libraryGate({ accountLock: false });
  if (gate) return gate;
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لاستخدام هذه الأداة" });
    if (auth instanceof NextResponse) return auth;

    const limited = rateLimit(`ai-article-ref:${auth.user.id}`, { limit: 60, windowMs: 60_000 });
    if (!limited.ok) {
      return NextResponse.json(
        { error: "طلبات كثيرة — انتظر دقيقة" },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited.retryAfterSec || 60) } },
      );
    }

    const params = request.nextUrl.searchParams;
    const service = await createServiceClient();

    if (params.has("law")) {
      const slug = articleRefSlug(params.get("law"));
      const number = articleRefNumber(params.get("n"));
      if (!slug || number === null) return BAD();
      // Numbers only: library.articles is server-only (20260929_01); its text is never read here.
      const { data, error } = await service
        .schema("library")
        .from("articles")
        .select("number")
        .eq("law_slug", slug)
        .eq("number", number)
        .limit(1);
      if (error) {
        console.error("[ai/article-ref] article check failed:", error.code);
        return UNAVAILABLE();
      }
      const found = Array.isArray(data) && data.length > 0;
      return NextResponse.json({ articles: found ? [{ number }] : [] }, { headers: NO_STORE });
    }

    const query = params.get("q") ?? "";
    const pattern = articleRefLawPattern(query);
    if (!pattern) return NextResponse.json({ laws: [] }, { headers: NO_STORE });
    const { data, error } = await service
      .schema("library")
      .from("laws")
      .select("slug, title, type")
      .ilike("title", pattern)
      .order("title")
      .limit(ARTICLE_REF_READ_ROWS);
    if (error) {
      console.error("[ai/article-ref] law search failed:", error.code);
      return UNAVAILABLE();
    }
    return NextResponse.json({ laws: rankArticleRefLaws(data, query.trim()) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/article-ref] threw:", err instanceof Error ? err.name : "error");
    return UNAVAILABLE();
  }
}
