import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { toOpenRequestItems } from "@/lib/services/openRequestsView";

const PAGE_SIZE = 30;

/**
 * GET /api/v1/lawyer/open-requests?page=0 — the open requests a VERIFIED
 * lawyer may browse (owner decision ١٠): case type, city, one summary line.
 *
 * Reads public.marketplace_open_requests (20261124_30) with the caller's own
 * session: the function itself returns rows only to a verified lawyer and
 * never returns the title, the description, the requester or the metadata.
 * `verified` lets the screen say WHY a list is empty (not verified yet vs. no
 * open request) instead of guessing.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const rawPage = Number(request.nextUrl.searchParams.get("page") ?? "0");
    const page = Number.isInteger(rawPage) && rawPage >= 0 && rawPage < 1000 ? rawPage : 0;

    const [listResult, profileResult] = await Promise.all([
      supabase.rpc("marketplace_open_requests", { p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
      supabase.from("lawyer_profiles").select("verification_status").eq("user_id", user.id).maybeSingle(),
    ]);

    if (listResult.error) {
      console.error("[lawyer/open-requests] rpc failed:", listResult.error.message, listResult.error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (profileResult.error) {
      console.error("[lawyer/open-requests] profile read failed:", profileResult.error.message, profileResult.error.code);
    }

    const items = toOpenRequestItems(listResult.data);
    return NextResponse.json({
      data: items,
      page,
      hasMore: Array.isArray(listResult.data) && listResult.data.length === PAGE_SIZE,
      verified: profileResult.error ? null : profileResult.data?.verification_status === "verified",
    });
  } catch (err) {
    console.error("[lawyer/open-requests] unexpected:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
