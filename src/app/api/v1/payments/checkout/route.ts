import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig, TIER_RANK } from "@/lib/access-control";
import { MOYASAR_DISABLED_MESSAGE_AR } from "@/lib/payments/moyasarConfig";
import { createMoyasarClient, type MoyasarClient } from "@/lib/payments/moyasarClient";
import { parseCheckoutBody, resolveCallbackOrigin } from "@/lib/payments/checkoutRules";
import { startCheckoutWith } from "@/lib/payments/checkoutCore";
import { parseFounderConsent } from "@/lib/payments/founderConsent";
import { checkoutModeAllowed } from "@/lib/payments/testModeAccess";
import { frozenAccountResponse } from "@/lib/auth/apiAuth";
import { clientIpFrom } from "@/lib/rateLimit";
import { checkoutCaptchaPasses, checkoutCaptchaPolicy, parseCheckoutTurnstileToken } from "@/lib/payments/checkoutCaptcha";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/attribution/utmAttribution";
import { orderAnalyticsFromCookies } from "@/lib/analytics/analytics";
import { readLibraryAccountAccess } from "@/lib/library/accountAccessServer";

/**
 * POST /api/v1/payments/checkout — starts one online payment (Moyasar
 * payments B1, Task 6). Body `{ itemId, billing, couponCode? }` (the coupon:
 * P7, applied inside the order by startCheckoutWith); signed-in only. The
 * founder membership also needs `acceptFounderTerms: true` and the current
 * `founderTermsVersion` (owner ١٦, src/lib/payments/founderConsent.ts):
 * without them startCheckoutWith answers 400 before anything is written.
 *
 * This file does the request-bound checks and builds the clients:
 *   1. 401 without a session; 400 for a body that is not {itemId, billing}.
 *   2. The gateway switch (getMoyasarConfig: platform_settings + the env
 *      keys): disabled → 503 «الدفع الإلكتروني غير متاح حالياً». A throw
 *      while reading it, or building a client, is the same 503.
 *   3. The callback origin is NEXT_PUBLIC_SITE_URL, never the Host header;
 *      unset, or not https in live mode → 503 (logged).
 *   4. Test mode is for platform staff and the accounts in
 *      public.test_accounts only (checkoutModeAllowed,
 *      src/lib/payments/testModeAccess.ts): anyone else gets the same 503 as
 *      a disabled gateway. Live is not gated.
 * The rest — the audience check (403), the quote, superseding earlier orders,
 * the order, the intent, the guarded stamp and the CheckoutResponse — is
 * startCheckoutWith in src/lib/payments/checkoutCore.ts, tested there.
 * The browser must put the response's `orderId` into the payment's
 * metadata.order_id (Task 7).
 * P3: a founder membership's seat is reserved through the
 * founder_reserve_seat RPC (20261101_10, service role only) — the
 * reserveFounderSeat dependency below; an RPC error throws into
 * startCheckoutWith, which cancels the order and answers 503.
 *
 * S6b (owner package 17 Nov): the founder membership also needs a Cloudflare
 * Turnstile token (`turnstileToken`, parseCheckoutTurnstileToken). The
 * verifyHuman dependency below runs it through checkoutCaptchaPasses
 * (src/lib/payments/checkoutCaptcha.ts) BEFORE founder_reserve_seat — inside
 * startCheckoutWith, step 0d, before any read or write; a refusal is 403
 * {code: "captcha"} «تعذّر اجتياز التحقق الأمني — أكمله مرة أخرى». Policy:
 * TURNSTILE_SECRET_KEY (server) + NEXT_PUBLIC_TURNSTILE_SITE_KEY (build).
 * DELIBERATE: in production a missing key ('misconfigured') does NOT stop the
 * sale — it is logged loudly on every founder checkout and the buyer goes on,
 * because a lost env line must never stop paying customers (the registry
 * lookup, which reads personal data for guests, refuses instead). Every other
 * item is never checked.
 *
 * F13: the first-touch utm cookie (ATTRIBUTION_COOKIE, set by src/proxy.ts)
 * is re-validated here (parseAttributionCookie) and stored on the order as
 * metadata.attribution — for every item.
 */

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const unavailable = () => reply({ error: MOYASAR_DISABLED_MESSAGE_AR }, 503);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return reply({ error: "سجّل الدخول لإتمام الدفع" }, 401);
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const parsed = parseCheckoutBody(raw);
  if (!parsed.ok) return reply({ error: "طلب الدفع غير صالح" }, 400);

  let cfg: Awaited<ReturnType<typeof getMoyasarConfig>>;
  try {
    cfg = await getMoyasarConfig();
  } catch {
    console.error("[payments/checkout] reading the gateway settings threw");
    return unavailable();
  }
  if (!cfg.enabled) {
    return reply({ error: MOYASAR_DISABLED_MESSAGE_AR }, 503);
  }

  const origin = resolveCallbackOrigin(process.env.NEXT_PUBLIC_SITE_URL, cfg.mode);
  if (!origin.ok) {
    console.error("[payments/checkout] the callback origin is not usable:", origin.reason);
    return reply({ error: MOYASAR_DISABLED_MESSAGE_AR }, 503);
  }

  let client: MoyasarClient;
  try {
    client = createMoyasarClient(cfg);
  } catch {
    console.error("[payments/checkout] the Moyasar client could not be created");
    return unavailable();
  }

  let admin: Awaited<ReturnType<typeof createServiceClient>>;
  try {
    admin = await createServiceClient();
  } catch {
    console.error("[payments/checkout] the service client could not be created");
    return unavailable();
  }

  if (!(await checkoutModeAllowed(admin, cfg.mode, user.id))) {
    return reply({ error: MOYASAR_DISABLED_MESSAGE_AR }, 503);
  }

  // S6b: one token per attempt; used for the founder membership only (step 0d)
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const captchaPolicy = checkoutCaptchaPolicy(
    turnstileSecret,
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    process.env.NODE_ENV,
  );
  const turnstileToken = parseCheckoutTurnstileToken(raw);

  try {
    const result = await startCheckoutWith(
      {
        admin,
        client,
        // l6-pay (Q511): a plan checkout refuses a downgrade and credits an upgrade
        ranks: TIER_RANK,
        // l8 (owner item 9): a library plan is refused while the library is locked for the account
        libraryAccountAllowed: async (userId) => (await readLibraryAccountAccess(userId)).allowed,
        reserveFounderSeat: async (userId, orderId) => {
          const { data, error } = await admin.rpc("founder_reserve_seat", { p_user: userId, p_order: orderId });
          if (error) throw new Error(`founder_reserve_seat ${error.code ?? "error"}`);
          return typeof data === "string" ? data : "";
        },
        releaseFounderSeat: async (orderId) => {
          const { error } = await admin.rpc("founder_release_order", { p_order: orderId });
          if (error) throw new Error(`founder_release_order ${error.code ?? "error"}`);
        },
        verifyHuman: () =>
          checkoutCaptchaPasses({
            policy: captchaPolicy,
            secret: turnstileSecret,
            token: turnstileToken,
            remoteIp: clientIpFrom(request),
            fetchImpl: fetch,
          }),
      },
      {
        user: { id: user.id, email: user.email ?? null },
        itemId: parsed.itemId,
        billing: parsed.billing,
        couponCode: parsed.couponCode ?? null,
        founderConsent: parseFounderConsent(raw),
        attribution: parseAttributionCookie(request.cookies.get(ATTRIBUTION_COOKIE)?.value),
        // l7-analytics: the GA client id, only when the buyer consented (analytics.ts)
        analytics: orderAnalyticsFromCookies((name) => request.cookies.get(name)?.value, process.env.NEXT_PUBLIC_GA4_ID),
        origin: origin.origin,
        publishableKey: cfg.publishableKey,
        // l7 decision 3: a test account's order is accepted in test mode only
        gatewayMode: cfg.mode,
      },
    );
    return reply(result.body, result.status);
  } catch (err) {
    console.error("[payments/checkout] the checkout threw:", err instanceof Error ? err.message : "unknown");
    return unavailable();
  }
}
