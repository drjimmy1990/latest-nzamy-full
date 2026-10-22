import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig } from "@/lib/access-control";
import { MOYASAR_DISABLED_MESSAGE_AR } from "@/lib/payments/moyasarConfig";
import { createMoyasarClient, type MoyasarClient } from "@/lib/payments/moyasarClient";
import { parseCheckoutBody, resolveCallbackOrigin } from "@/lib/payments/checkoutRules";
import { startCheckoutWith } from "@/lib/payments/checkoutCore";
import { checkoutModeAllowed } from "@/lib/payments/testModeAccess";

/**
 * POST /api/v1/payments/checkout — starts one online payment (Moyasar
 * payments B1, Task 6). Body `{ itemId, billing }`; signed-in only.
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

  try {
    const result = await startCheckoutWith(
      { admin, client },
      {
        user: { id: user.id, email: user.email ?? null },
        itemId: parsed.itemId,
        billing: parsed.billing,
        origin: origin.origin,
        publishableKey: cfg.publishableKey,
      },
    );
    return reply(result.body, result.status);
  } catch (err) {
    console.error("[payments/checkout] the checkout threw:", err instanceof Error ? err.message : "unknown");
    return unavailable();
  }
}
