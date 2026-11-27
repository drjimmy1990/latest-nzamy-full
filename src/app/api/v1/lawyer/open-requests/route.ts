import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { toOpenRequestItems } from "@/lib/services/openRequestsView";
import { createServiceClient } from "@/lib/supabase/server";
import { readMarketSettings } from "@/lib/marketplace/marketSettingsServer";

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
 *
 * l12 Q130a / Q151: `market` tells the screen how an ask is accepted (admin
 * approval within N minutes, or instant) and whether the open market is on,
 * so the card's wording matches the setting (platform_settings, 20261202_70).
 *
 * l18 review (owner ٢٣٨): the owner of a VERIFIED firm reads the list too
 * (20261208_90). Asking to take a request stays a verified lawyer's act
 * (marketplace_request_accept), so `canAsk` is the lawyer's own verification
 * and `firm` says the caller owns a firm — the firm's page then shows the list
 * without the button and with its own honest line.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const rawPage = Number(request.nextUrl.searchParams.get("page") ?? "0");
    const page = Number.isInteger(rawPage) && rawPage >= 0 && rawPage < 1000 ? rawPage : 0;

    const [listResult, profileResult, firmResult, market] = await Promise.all([
      supabase.rpc("marketplace_open_requests", { p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
      supabase.from("lawyer_profiles").select("verification_status").eq("user_id", user.id).maybeSingle(),
      supabase.from("firm_profiles").select("verification_status").eq("owner_user_id", user.id),
      createServiceClient().then((admin) => readMarketSettings(admin)),
    ]);

    if (listResult.error) {
      console.error("[lawyer/open-requests] rpc failed:", listResult.error.message, listResult.error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (profileResult.error) {
      console.error("[lawyer/open-requests] profile read failed:", profileResult.error.message, profileResult.error.code);
    }
    if (firmResult.error) {
      console.error("[lawyer/open-requests] firm read failed:", firmResult.error.message, firmResult.error.code);
    }

    const items = toOpenRequestItems(listResult.data);
    const lawyerVerified = profileResult.error ? null : profileResult.data?.verification_status === "verified";
    const firms = firmResult.error ? null : ((firmResult.data ?? []) as Array<{ verification_status?: string | null }>);
    const firmVerified = firms === null ? null : firms.some((f) => f.verification_status === "verified");
    return NextResponse.json({
      data: items,
      page,
      hasMore: Array.isArray(listResult.data) && listResult.data.length === PAGE_SIZE,
      verified: lawyerVerified === true || firmVerified === true ? true : lawyerVerified === null || firmVerified === null ? null : false,
      canAsk: lawyerVerified === true,
      firm: firms !== null && firms.length > 0,
      market: {
        installed: market.installed,
        open: market.settings.open,
        acceptMode: market.settings.acceptMode,
        approvalMinutes: market.settings.approvalMinutes,
      },
    });
  } catch (err) {
    console.error("[lawyer/open-requests] unexpected:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
