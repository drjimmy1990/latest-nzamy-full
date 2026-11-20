import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { CASE_LIST_MAX, ownCaseFilter } from "@/lib/ai/assistantCase";
import { requestTypeLabelAr } from "@/lib/services/requestTypeLabels";

/**
 * GET /api/v1/ai/assistant-cases — T17a (batch l11): the cases the advanced
 * assistant's «قضية محددة» tab can load. The caller's OWN cases only (assigned
 * to him or opened by him), read on his RLS client: id, title and type, never
 * the facts (the run route reads those itself, again own-only, when a message
 * is sent with the case).
 *
 * → { data: [{ id, title, type }] } newest first, at most CASE_LIST_MAX.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { data, error } = await supabase
      .from("service_requests")
      .select("id, title, type, created_at")
      .or(ownCaseFilter(user.id))
      .order("created_at", { ascending: false })
      .limit(CASE_LIST_MAX);
    if (error) {
      console.error("[ai/assistant-cases] read failed:", error.code, error.message);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500, headers: NO_STORE });
    }
    const rows = (data ?? []) as Array<{ id: unknown; title: unknown; type: unknown }>;
    return NextResponse.json(
      {
        data: rows
          .filter((r) => typeof r.id === "string")
          .map((r) => ({
            id: r.id as string,
            title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 200) : "قضية بلا عنوان",
            type: requestTypeLabelAr(typeof r.type === "string" ? r.type : null),
          })),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[ai/assistant-cases] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500, headers: NO_STORE });
  }
}
