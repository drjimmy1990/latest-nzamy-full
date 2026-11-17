import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { checkLibraryAccess, hasFullLibraryAccess } from "@/lib/access-control";
import { enforceLibraryDevice } from "@/lib/library/deviceLimitServer";
import { libraryGate } from "@/lib/library-gate";
import { articleDisplayLabel } from "@/app/api/library/laws/[slug]/_article-label";
import { citedStatus } from "@/lib/ai/citationStatus";
import { citedByFilter, parsePreviewQuery, previewExcerpt } from "@/lib/ai/sourcePreview";
import { apiSlug } from "@/utils/apiSlug";

/**
 * GET /api/v1/ai/source-preview?kind=article|principle&id=<library id>
 *
 * The citation sheet (owner N06-34): one text an AI answer cited, shown in
 * place of a new tab — its title, article label, live status and the excerpt
 * this viewer may read (src/lib/ai/sourcePreview.ts has the rules).
 *
 *   - signed in, and the text must be cited in one of the caller's OWN runs
 *     (ai_runs read through RLS, jsonb containment on `citations`): else 404;
 *   - full text only with full library access (or a whitelisted law), and only
 *     on an authorised device (owner ٤٢٧) — a refused device gets the preview,
 *     never an error that hides the title;
 *   - not counted against the daily document cap (owner ٤٤٧): it is one
 *     article the caller's own paid run already cited, not a document opened.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const NOT_FOUND = () => NextResponse.json({ error: "المصدر غير موجود" }, { status: 404, headers: NO_STORE });
const UNAVAILABLE = () => NextResponse.json({ error: "تعذّر تحميل المصدر" }, { status: 503, headers: NO_STORE });

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export async function GET(request: NextRequest) {
  const gate = await libraryGate();
  if (gate) return gate;
  try {
    const ref = parsePreviewQuery(request.nextUrl.searchParams);
    if (!ref) return NOT_FOUND();

    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لعرض المصدر" });
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.id;

    const cited = await supabase
      .from("ai_runs")
      .select("id")
      .eq("user_id", userId)
      .contains("citations", citedByFilter(ref.kind, ref.id))
      .limit(1);
    if (cited.error) {
      console.error("[ai/source-preview] run lookup failed:", cited.error.code, cited.error.message);
      return UNAVAILABLE();
    }
    if (!cited.data || cited.data.length === 0) return NOT_FOUND();

    // Article and principle text is server-only (20260929_01): this read is the paywall.
    const serverOnly = await createServiceClient();
    const isSubscriber = await hasFullLibraryAccess(userId);

    if (ref.kind === "article") {
      const { data: a, error } = await serverOnly
        .schema("library")
        .from("articles")
        .select("id, number, number_text, status, text, original_text, law_slug")
        .eq("id", ref.id)
        .maybeSingle();
      if (error) {
        console.error("[ai/source-preview] article read failed:", error.code, error.message);
        return UNAVAILABLE();
      }
      if (!a) return NOT_FOUND();
      const slug = str((a as Row).law_slug);
      const [law, access] = await Promise.all([
        serverOnly.schema("library").from("laws").select("title").eq("slug", slug).maybeSingle(),
        isSubscriber ? Promise.resolve(null) : checkLibraryAccess(userId, slug, 0),
      ]);
      const entitled = isSubscriber || access?.isWhitelisted === true;
      const deviceRefused = entitled && (await enforceLibraryDevice(userId, isSubscriber)) !== null;
      const full = entitled && !deviceRefused;
      const { excerpt, truncated } = previewExcerpt(a as Row, full);
      const label = articleDisplayLabel((a as Row).number_text as string | null, (a as Row).number as number | null);
      return NextResponse.json(
        {
          kind: "article",
          id: ref.id,
          lawTitle: str(law.data?.title) || null,
          label: label || null,
          status: citedStatus((a as Row).status) ?? null,
          excerpt,
          truncated,
          locked: !full,
          deviceRefused,
          url: `/laws/${apiSlug(slug)}#${encodeURIComponent(ref.id)}`,
        },
        { headers: NO_STORE },
      );
    }

    const { data: p, error } = await serverOnly
      .schema("library")
      .from("principles")
      .select("id, principle_number, issuing_body, text, collection_id")
      .eq("id", ref.id)
      .maybeSingle();
    if (error) {
      console.error("[ai/source-preview] principle read failed:", error.code, error.message);
      return UNAVAILABLE();
    }
    if (!p) return NOT_FOUND();
    const deviceRefused = isSubscriber && (await enforceLibraryDevice(userId, true)) !== null;
    const full = isSubscriber && !deviceRefused;
    const { excerpt, truncated } = previewExcerpt(p as Row, full);
    return NextResponse.json(
      {
        kind: "principle",
        id: ref.id,
        lawTitle: str((p as Row).issuing_body) || null,
        label: str((p as Row).principle_number) ? `مبدأ رقم ${str((p as Row).principle_number)}` : null,
        status: null,
        excerpt,
        truncated,
        locked: !full,
        deviceRefused,
        url: `/precedents/${apiSlug(str((p as Row).collection_id))}#${encodeURIComponent(ref.id)}`,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[ai/source-preview] threw:", err);
    return UNAVAILABLE();
  }
}
