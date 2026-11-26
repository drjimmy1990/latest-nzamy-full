import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import type { SummaryStatusCount } from "@/lib/library/summaryStatusCounts";

/**
 * GET /api/v1/admin/library-summary-status — the readiness count beside the
 * admin switch «إخفاء كل موجز غير مراجَع» (batch l16, B-50): how many law and
 * decree summaries are reviewed, draft, or have no status. Read-only, any
 * staff role, counts only (no text). Head-count queries on library.laws and
 * library.decrees_circulars; a table whose summary_status cannot be read
 * answers null for that kind (the card says so).
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

type Admin = Awaited<ReturnType<typeof createServiceClient>>;

async function countFor(admin: Admin, table: "laws" | "decrees_circulars"): Promise<SummaryStatusCount | null> {
  const base = () => admin.schema("library").from(table).select("summary_status", { count: "exact", head: true });
  const [reviewed, draft, none] = await Promise.all([
    base().eq("summary_status", "reviewed"),
    base().eq("summary_status", "draft"),
    base().is("summary_status", null),
  ]);
  for (const r of [reviewed, draft, none]) {
    if (r.error) {
      console.error(`[admin/library-summary-status] ${table}:`, r.error.code ?? "no-code", r.error.message);
      return null;
    }
  }
  return { reviewed: reviewed.count ?? 0, draft: draft.count ?? 0, none: none.count ?? 0 };
}

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  try {
    const admin = await createServiceClient();
    const [laws, decrees] = await Promise.all([countFor(admin, "laws"), countFor(admin, "decrees_circulars")]);
    return NextResponse.json({ ok: true, laws, decrees }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/library-summary-status] failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "تعذّر تحميل حالات الموجزات" }, { status: 500, headers: NO_STORE });
  }
}
