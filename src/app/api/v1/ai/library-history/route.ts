import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  groupLibraryConversations,
  LIBRARY_HISTORY_COLUMNS,
  LIBRARY_HISTORY_ROWS,
  LIBRARY_HISTORY_SLUG,
  LIBRARY_HISTORY_TOOL,
} from "@/lib/ai/libraryHistory";

/**
 * GET /api/v1/ai/library-history?law=<slug> — the signed-in user's last
 * library-assistant conversations on that law (owner L3: the chat history in
 * the cloud, readable from a second device). Own rows only: the read runs as
 * the service role because ai_runs.input is column-locked from the session
 * roles (20261027_10), so the user filter below IS the access rule — it is
 * pinned by library-history-route.test.ts. Nothing but the question, the
 * answer, the citations' links and the time leaves.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لعرض محادثاتك" });
    if (auth instanceof NextResponse) return auth;

    const law = (request.nextUrl.searchParams.get("law") ?? "").trim();
    if (!LIBRARY_HISTORY_SLUG.test(law)) {
      return NextResponse.json({ error: "النظام غير صالح" }, { status: 422, headers: NO_STORE });
    }

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("ai_runs")
      .select(LIBRARY_HISTORY_COLUMNS)
      .eq("user_id", auth.user.id)
      .eq("tool", LIBRARY_HISTORY_TOOL)
      .eq("status", "succeeded")
      .eq("input->>law_slug", law)
      .order("created_at", { ascending: false })
      .limit(LIBRARY_HISTORY_ROWS);
    if (error) {
      console.error("[ai/library-history] read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل المحادثات" }, { status: 503, headers: NO_STORE });
    }
    const rows = (Array.isArray(data) ? data : []) as unknown as Array<Record<string, unknown>>;
    return NextResponse.json({ conversations: groupLibraryConversations(rows) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/library-history] threw:", err);
    return NextResponse.json({ error: "تعذّر تحميل المحادثات" }, { status: 503, headers: NO_STORE });
  }
}
