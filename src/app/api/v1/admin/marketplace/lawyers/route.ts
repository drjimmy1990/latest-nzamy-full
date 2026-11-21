import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";

/**
 * GET /api/v1/admin/marketplace/lawyers?q=<name> — verified lawyers the admin
 * may assign a market request to (l12 Q130a): lawyer_profiles verified, never
 * a test or demo account. Name and id only; at most 20. orders.manage.
 * The database checks the same again when it assigns (marketplace_assign_lawyer).
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await requireStaff("orders.manage");
    if (!gate.ok) return gate.response;
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
    if (q.length < 2) return NextResponse.json({ data: [] });
    // PostgREST ilike pattern: escape the wildcard characters the admin typed.
    const pattern = `%${q.replace(/[\\%_,()]/g, " ")}%`;

    const admin = await createServiceClient();
    const { data: profs, error } = await admin
      .from("profiles")
      .select("id, display_name, is_demo")
      .in("user_type", ["lawyer", "firm"])
      .ilike("display_name", pattern)
      .limit(40);
    if (error) {
      console.error("[admin/marketplace/lawyers] profiles read failed:", error.code);
      return NextResponse.json({ error: "تعذّر البحث." }, { status: 500 });
    }
    const candidates = ((profs ?? []) as Array<{ id: string; display_name?: string | null; is_demo?: boolean | null }>).filter(
      (p) => p.is_demo !== true,
    );
    const ids = candidates.map((p) => p.id);
    if (ids.length === 0) return NextResponse.json({ data: [] });

    const [lps, tests] = await Promise.all([
      admin.from("lawyer_profiles").select("user_id, verification_status").in("user_id", ids),
      admin.from("test_accounts").select("user_id").in("user_id", ids),
    ]);
    if (lps.error) {
      console.error("[admin/marketplace/lawyers] lawyer_profiles read failed:", lps.error.code);
      return NextResponse.json({ error: "تعذّر البحث." }, { status: 500 });
    }
    const verified = new Set(
      ((lps.data ?? []) as Array<{ user_id: string; verification_status?: string }>)
        .filter((l) => l.verification_status === "verified")
        .map((l) => l.user_id),
    );
    const testIds = new Set(((tests.data ?? []) as Array<{ user_id: string }>).map((t) => t.user_id));
    return NextResponse.json({
      data: candidates
        .filter((p) => verified.has(p.id) && !testIds.has(p.id))
        .slice(0, 20)
        .map((p) => ({ id: p.id, name: (p.display_name ?? "").trim() || "محامٍ بلا اسم" })),
    });
  } catch (err) {
    console.error("[admin/marketplace/lawyers] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر البحث." }, { status: 500 });
  }
}
