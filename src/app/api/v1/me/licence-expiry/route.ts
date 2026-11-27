import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import {
  LICENCE_EXPIRY_HORIZON_DAYS,
  bannerLicence,
  licenceExpiryNotice,
  type LicenceExpiryBannerReply,
  type LicenceExpiryRow,
} from "@/lib/licence/licenceExpiry";

/**
 * GET /api/v1/me/licence-expiry — owner ٢٤١ (batch l19): the dashboard banner
 * «تنبيه: رخصتك المهنية تنتهي خلال X يومًا / انتهت — يرجى رفع تجديد الرخصة…»
 * for the CALLER's own licence (src/components/dashboard/LicenceExpiryBanner.tsx).
 *
 * 200 { alert: null } — nothing to show: not a licensed account type, no
 *     verified licence dated within 30 days or past, the function not
 *     deployed yet (20261209_10), or the read failed (a banner is a reminder:
 *     a failed read shows nothing rather than an error).
 * 200 { alert: { title, body, href, hrefLabel, daysLeft, stage } } — the most
 *     urgent of the caller's licences.
 *
 * The licences come from public.licence_expiry_alerts (service role only),
 * asked for the session's own user id and nothing else.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const LICENSED_TYPES = new Set(["lawyer", "firm", "provider"]);

export async function GET() {
  const auth = await assertRole();
  if (!auth.ok) return auth.response;
  const none: LicenceExpiryBannerReply = { alert: null };
  if (!LICENSED_TYPES.has(auth.userType)) return NextResponse.json(none, { headers: NO_STORE });

  try {
    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("licence_expiry_alerts", {
      p_user_ids: [auth.user.id],
      p_horizon_days: LICENCE_EXPIRY_HORIZON_DAYS,
    });
    if (error) {
      console.error("[me/licence-expiry] read failed:", error.code ?? "no-code");
      return NextResponse.json(none, { headers: NO_STORE });
    }
    // the function was asked for this id only; keep to it all the same
    const rows = ((Array.isArray(data) ? data : []) as LicenceExpiryRow[]).filter((r) => r?.user_id === auth.user.id);
    const pick = bannerLicence(rows, new Date());
    if (!pick) return NextResponse.json(none, { headers: NO_STORE });
    const reply: LicenceExpiryBannerReply = {
      alert: { ...licenceExpiryNotice(pick.row.holder, pick.daysLeft), daysLeft: pick.daysLeft, stage: pick.stage },
    };
    return NextResponse.json(reply, { headers: NO_STORE });
  } catch (err) {
    console.error("[me/licence-expiry] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json(none, { headers: NO_STORE });
  }
}
