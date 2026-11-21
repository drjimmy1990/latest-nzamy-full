import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { checkLibraryAccess, hasFullLibraryAccess, libraryAccessMemo } from "@/lib/access-control";
import { libraryGate } from "@/lib/library-gate";
import { enforceLibraryDevice } from "@/lib/library/deviceLimitServer";
import { libraryReadQuotaHit } from "@/lib/library/readQuotaServer";
import { quotaRefusal } from "@/lib/library/readQuota";
import { isSupabaseMode } from "@/lib/runtimeMode";
import { SITE_URL } from "@/lib/library/libraryMetadata";
import { blocksToBodyXml, minimalDocx, DOCX_MIME } from "@/lib/docx/ooxml";
import {
  DRAFT_LIMITS_SETTING,
  draftDocBlocks,
  draftDocKey,
  parseDraftExportBody,
  parseDraftLimits,
} from "@/lib/library/draftExport";
import {
  DRAFT_ARTICLE_COLUMNS,
  draftCarriesText,
  resolveDraftEntries,
  type DraftArticleRow,
} from "@/lib/library/draftExportResolve";

/**
 * POST /api/library/draft-export — L2 (owner file 03 ل2, batch l12): the
 * library draft as a Word file, built HERE from texts the server re-reads for
 * the viewer's own entitlement. Body: { items: [{ articleId, lawSlug, lawName,
 * label, title, withArticle, withExecReg, text }] } (draftExport.ts).
 *
 * Order of checks, each as the document routes do it:
 *   1. the library's closed switch and the account lock (libraryGate);
 *   2. signed in and not frozen (requireApiUser; a guest's draft lives in the
 *      browser and has no quota);
 *   3. the admin cap on items (platform_settings.library_draft_limits);
 *   4. the texts: a law article from library.articles — full text only with
 *      full library access or an open law, else the title; anything else from
 *      the cart, for a full subscriber only (draftExportResolve.ts);
 *   5. when the file carries any text: the device rule (owner ٤٢٧), then ONE
 *      read from the quota for the whole draft (answer أ), keyed by the
 *      draft's content so the same draft downloaded again today costs nothing
 *      more. That read is a row of full_text_reads, i.e. it counts toward the
 *      five-file refund rule (answer ب). A file of titles only counts nothing,
 *      like a preview.
 *
 * The answer is the .docx bytes, `private, no-store`, with X-Draft-Locked =
 * how many items went out as titles only (the drawer says so).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const ERR = (status: number, error: string, extra: Record<string, string> = {}) =>
  NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...extra } });

/**
 * GET — the admin's draft caps, for the drawer (items per copy / Word file,
 * share excerpt length). Two numbers, no user data; the defaults when the
 * setting is missing or unreadable.
 */
export async function GET() {
  try {
    const admin = await createServiceClient();
    const { data } = await admin.from("platform_settings").select("value").eq("key", DRAFT_LIMITS_SETTING).maybeSingle();
    const l = parseDraftLimits((data as { value?: unknown } | null)?.value);
    return NextResponse.json(
      { limits: { max_items: l.maxItems, share_excerpt_chars: l.shareExcerptChars } },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch {
    const l = parseDraftLimits(null);
    return NextResponse.json({ limits: { max_items: l.maxItems, share_excerpt_chars: l.shareExcerptChars } }, { headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  const gate = await libraryGate();
  if (gate) return gate;

  try {
    const supabase = await createClient();
    // Signed in, and not a frozen account (requireApiUser answers 401 / 403).
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لتنزيل المسودة ملفَّ Word" });
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.id;

    const admin = await createServiceClient();
    const { data: limitRow } = await admin.from("platform_settings").select("value").eq("key", DRAFT_LIMITS_SETTING).maybeSingle();
    const limits = parseDraftLimits((limitRow as { value?: unknown } | null)?.value);

    const body: unknown = await request.json().catch(() => null);
    const parsed = parseDraftExportBody(body, limits);
    if (!parsed.ok) return ERR(parsed.status, parsed.error);
    const items = parsed.items;

    const memo = libraryAccessMemo(userId);
    const isSubscriber = await hasFullLibraryAccess(userId, memo);

    const ids = [...new Set(items.map((i) => i.articleId))];
    const slugs = [...new Set(items.map((i) => i.lawSlug))];
    const { data: rowsData, error: rowsError } = await admin
      .schema("library")
      .from("articles")
      .select(DRAFT_ARTICLE_COLUMNS)
      .in("id", ids)
      .in("law_slug", slugs);
    if (rowsError) {
      console.error("[draft-export] articles read failed:", rowsError.code ?? "no-code");
      return ERR(503, "تعذّر تجهيز الملف الآن — حاول بعد قليل");
    }
    const rows = (Array.isArray(rowsData) ? rowsData : []) as unknown as DraftArticleRow[];

    // An open (whitelisted) law gives its text to everyone, as the reader does.
    const openLaws = new Set<string>();
    if (!isSubscriber) {
      const lawSlugsFound = [...new Set(rows.map((r) => r.law_slug))];
      const checks = await Promise.all(
        lawSlugsFound.map(async (slug) => [slug, (await checkLibraryAccess(userId, slug, 0, "laws", { memo })).isWhitelisted] as const),
      );
      for (const [slug, open] of checks) if (open) openLaws.add(slug);
    }

    const entries = resolveDraftEntries(items, rows, { isSubscriber, openLaws });

    if (draftCarriesText(entries) && isSupabaseMode) {
      const deviceRefusal = await enforceLibraryDevice(userId, isSubscriber);
      if (deviceRefusal) return deviceRefusal;
      const refusal = quotaRefusal(await libraryReadQuotaHit(userId, draftDocKey(items)), Date.now());
      if (refusal) {
        const headers: Record<string, string> = { ...NO_STORE };
        if (refusal.retryAfterSeconds !== null) headers["Retry-After"] = String(refusal.retryAfterSeconds);
        return NextResponse.json(refusal.body, { status: refusal.status, headers });
      }
    }

    const now = new Date();
    const bytes = minimalDocx(blocksToBodyXml(draftDocBlocks(entries, now, SITE_URL)));
    const locked = entries.filter((e) => e.text === null).length;
    const day = now.toISOString().slice(0, 10);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename="nzamy-draft-${day}.docx"`,
        "X-Draft-Locked": String(locked),
      },
    });
  } catch (err) {
    console.error("[draft-export] threw:", err instanceof Error ? err.name : "error");
    return ERR(503, "تعذّر تجهيز الملف الآن — حاول بعد قليل");
  }
}
