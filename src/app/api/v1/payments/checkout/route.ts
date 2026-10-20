import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig } from "@/lib/access-control";
import { MOYASAR_DISABLED_MESSAGE_AR } from "@/lib/payments/moyasarConfig";
import { createMoyasarClient, type MoyasarClient } from "@/lib/payments/moyasarClient";
import { quote } from "@/lib/payments/catalog";
import { isMissingPaymentsObject } from "@/lib/payments/fulfillDecision";
import {
  callbackUrlFor,
  cancelOrderAfterIntentCancel,
  intentDescription,
  ordersToSupersede,
  parseCheckoutBody,
  resolveCallbackOrigin,
  SUPERSEDE_WINDOW_MS,
  type CheckoutResponse,
  type SupersedeCandidateRow,
} from "@/lib/payments/checkoutRules";

/**
 * POST /api/v1/payments/checkout — starts one online payment (Moyasar
 * payments B1, Task 6). Body `{ itemId, billing }`; signed-in only.
 *
 *   1. 401 without a session; 400 for a body that is not {itemId, billing}.
 *   2. The gateway switch (getMoyasarConfig: platform_settings + the env
 *      keys): disabled → 503 «الدفع الإلكتروني غير متاح حالياً».
 *   3. The callback origin is NEXT_PUBLIC_SITE_URL, never the Host header;
 *      unset, or not https in live mode → 503 (logged).
 *   4. The price is quote(itemId, billing, profiles.user_type) — the catalog,
 *      never the body. An unknown item or billing → 400.
 *   5. The buyer's earlier open orders for the same item that no payment has
 *      reached are superseded: their intent is cancelled at Moyasar first and
 *      the order closed only when that worked (checkoutRules.ts says why).
 *   6. A new payment_orders row (status 'created', metadata {user_email} — the
 *      row's user_id is set null if the account is ever deleted), then the
 *      intent: amount = the quote's total, description «NEZAMY — <labelAr>»,
 *      callback_url <origin>/payments/result?order=<id>. The row then gets
 *      moyasar_intent_id and status 'initiated'.
 *   7. 200 CheckoutResponse (checkoutRules.ts). The browser must put
 *      `orderId` into the payment's metadata.order_id (Task 7).
 *
 * Deploy order: before 20261022_10 runs, the orders table is missing → 503
 * with the Arabic copy, logged once; never 500.
 */

const INTENT_FAILED_AR = "تعذّر بدء عملية الدفع، حاول مرة أخرى بعد قليل";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const unavailable = () => reply({ error: MOYASAR_DISABLED_MESSAGE_AR }, 503);

const missingLogged = new Set<string>();

/** A B1 table missing: logged once per step and process. */
function logMissingOnce(step: string, code: string | undefined): void {
  if (missingLogged.has(step)) return;
  missingLogged.add(step);
  console.warn(`[payments/checkout] ${step}: a B1 migration is not applied yet (${code ?? "?"}); answering 503`);
}

type Admin = Awaited<ReturnType<typeof createServiceClient>>;

/** Step 5 — best-effort: a failure here never blocks the new checkout. */
async function supersedeEarlierOrders(admin: Admin, client: MoyasarClient, userId: string, itemId: string) {
  const since = new Date(Date.now() - SUPERSEDE_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("payment_orders")
    .select("id, item_id, status, moyasar_intent_id, moyasar_payment_id")
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .in("status", ["created", "initiated"])
    .is("moyasar_payment_id", null)
    .gt("created_at", since)
    .limit(10);
  if (error) return { missing: isMissingPaymentsObject(error.code), code: error.code };

  const targets = ordersToSupersede(data as SupersedeCandidateRow[] | null, itemId);
  await Promise.all(
    targets.map(async (target) => {
      const cancelled = target.intentId ? await client.cancelIntent(target.intentId) : null;
      if (!cancelOrderAfterIntentCancel(target, cancelled)) return;
      const { error: closeErr } = await admin
        .from("payment_orders")
        .update({ status: "cancelled" })
        .eq("id", target.id)
        .eq("user_id", userId)
        .in("status", ["created", "initiated"])
        .is("moyasar_payment_id", null);
      if (closeErr) console.warn("[payments/checkout] closing a superseded order failed:", target.id, closeErr.code);
    }),
  );
  return { missing: false, code: undefined };
}

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

  // The settings read resolves to "disabled" on a query error, but building
  // the service client can still throw (a missing env value): that is a 503
  // too, never an unhandled 500.
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

  let admin: Admin;
  try {
    admin = await createServiceClient();
  } catch {
    console.error("[payments/checkout] the service client could not be created");
    return unavailable();
  }

  // The buyer's account type decides the library's VAT mode (catalog.ts).
  // A failed read is a 503, never a guess: a business buyer priced as an
  // individual would pay too little VAT.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("user_type")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) {
    console.error("[payments/checkout] reading the buyer's profile failed:", profileErr.code);
    return reply({ error: INTENT_FAILED_AR }, 503);
  }
  const userType = typeof profile?.user_type === "string" ? profile.user_type : null;

  const q = quote(parsed.itemId, parsed.billing, userType);
  if (!q.ok) {
    return reply(
      { error: q.error === "unknown_item" ? "هذا المنتج غير متاح للدفع الإلكتروني" : "مدة الاشتراك هذه غير متاحة لهذا المنتج" },
      400,
    );
  }

  const superseded = await supersedeEarlierOrders(admin, client, user.id, q.item.id);
  if (superseded.missing) {
    logMissingOnce("open orders read", superseded.code);
    return unavailable();
  }
  if (superseded.code) console.warn("[payments/checkout] reading earlier open orders failed:", superseded.code);

  const { data: inserted, error: insertErr } = await admin
    .from("payment_orders")
    .insert({
      user_id: user.id,
      merchant: "platform",
      kind: q.item.kind,
      item_id: q.item.id,
      billing: parsed.billing,
      net_halalas: q.netHalalas,
      vat_halalas: q.vatHalalas,
      total_halalas: q.totalHalalas,
      vat_mode: q.vatMode,
      currency: "SAR",
      status: "created",
      source: "checkout",
      metadata: { user_email: user.email ?? null },
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    if (insertErr && isMissingPaymentsObject(insertErr.code)) {
      logMissingOnce("order insert", insertErr.code);
      return unavailable();
    }
    console.error("[payments/checkout] creating the order failed:", insertErr?.code, insertErr?.message);
    return reply({ error: INTENT_FAILED_AR }, 503);
  }
  const orderId = (inserted as { id: string }).id;
  const descriptionAr = intentDescription(q.item.labelAr);

  const intent = await client.createIntent({
    amountHalalas: q.totalHalalas,
    description: descriptionAr,
    callbackUrl: callbackUrlFor(origin.origin, orderId),
    metadata: { order_id: orderId },
  });
  if (!intent.ok) {
    console.error("[payments/checkout] Moyasar refused the intent:", orderId, intent.status, intent.type);
    // no client secret left the server: close the order so nothing waits on it
    await admin
      .from("payment_orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "created");
    return reply({ error: INTENT_FAILED_AR }, 503);
  }

  // Zero rows means a concurrent checkout of the same item superseded this
  // order while its intent was being made: the secret must not go out for a
  // closed order, so it is treated like a failed stamp.
  const { data: stamped, error: stampErr } = await admin
    .from("payment_orders")
    .update({ moyasar_intent_id: intent.data.id, status: "initiated" })
    .eq("id", orderId)
    .eq("status", "created")
    .select("id");
  if (stampErr || !Array.isArray(stamped) || stamped.length !== 1) {
    console.error("[payments/checkout] saving the intent on the order failed:", orderId, stampErr?.code ?? "no row");
    // The secret is never handed out, so the intent is cancelled and the order closed.
    await client.cancelIntent(intent.data.id);
    await admin.from("payment_orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "created");
    return reply({ error: INTENT_FAILED_AR }, 503);
  }

  const response: CheckoutResponse = {
    orderId,
    intentId: intent.data.id,
    clientSecret: intent.data.clientSecret,
    publishableKey: cfg.publishableKey,
    amountHalalas: q.totalHalalas,
    descriptionAr,
    saveCard: q.item.saveCard,
    quote: { net: q.netHalalas, vat: q.vatHalalas, total: q.totalHalalas, vatMode: q.vatMode },
  };
  return reply({ ...response });
}
