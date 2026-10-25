import { NextResponse, type NextRequest } from "next/server";
import { isTrackingToken } from "@/lib/tracking/trackingView";
import { normalizeUnlockDigits } from "@/lib/tracking/trackingLinkState";
import { unlockCookieFor, unlockTracking } from "@/lib/tracking/trackingSnapshot.server";

/**
 * POST /api/v1/track/[token]/unlock  { digits: "4567" }
 *
 * The client's light check before his case tracking page opens (D2, owner
 * ٢٧٦): the last 4 digits of the mobile number on the case file. Public, no
 * account. The comparison, the per-link counter and the 15-minute lock after
 * 5 wrong tries all happen in public.case_tracking_unlock (20261026_62), in
 * one locked row; this route never sees the phone. The proxy also puts this
 * path in its strict per-IP bucket (rateLimitRoutes.ts).
 *
 * Wrong digits, an unknown token and a paused / revoked link all get the same
 * answer, so the response never says whether a link exists. Success sets an
 * httpOnly, Secure, SameSite=Strict cookie scoped to /track/<token>, signed
 * with a key derived from the server's secret, for 12 hours.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;
const DENIED = "الأرقام غير صحيحة أو الرابط غير متاح. تأكد منها أو تواصل مع محاميك.";

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = (await request.json().catch(() => null)) as { digits?: unknown } | null;
  const digits = normalizeUnlockDigits(body?.digits);
  if (!digits) {
    return NextResponse.json({ error: "أدخل آخر ٤ أرقام من رقم جوالك المسجّل لدى محاميك." }, { status: 400, headers: NO_STORE });
  }
  if (!isTrackingToken(token)) return NextResponse.json({ error: DENIED }, { status: 401, headers: NO_STORE });

  // No key, no cookie: refuse before the database counts anything.
  if (!unlockCookieFor(token, Date.now())) {
    console.error("[track unlock] no signing key (SUPABASE_SERVICE_ROLE_KEY unset)");
    return NextResponse.json({ error: "تعذّر التحقق الآن. حاول بعد قليل." }, { status: 503, headers: NO_STORE });
  }

  const result = await unlockTracking(token, digits);
  if (result === "locked") {
    return NextResponse.json(
      { error: "محاولات خاطئة كثيرة. أُوقف التحقق ١٥ دقيقة، ثم حاول مجدداً أو تواصل مع محاميك." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": "900" } },
    );
  }
  if (result === "error") return NextResponse.json({ error: "تعذّر التحقق الآن. حاول بعد قليل." }, { status: 503, headers: NO_STORE });
  if (result !== "ok") return NextResponse.json({ error: DENIED }, { status: 401, headers: NO_STORE });

  const cookie = unlockCookieFor(token, Date.now());
  if (!cookie) return NextResponse.json({ error: "تعذّر التحقق الآن. حاول بعد قليل." }, { status: 503, headers: NO_STORE });
  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
