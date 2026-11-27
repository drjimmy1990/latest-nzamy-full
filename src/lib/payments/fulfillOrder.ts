/**
 * fulfillOrder.ts — the server entry to fulfilment (Moyasar payments B1,
 * Task 5). SERVER-ONLY: it wires the service role, the platform Moyasar key,
 * the library grant, the tier ranking and the notifier into ./fulfillCore.ts,
 * where the logic lives (and is tested with fakes). P3 adds the founder
 * membership RPCs (20261101_10): founder_activate (the grant),
 * founder_release_order (a failed / voided / cancelled payment's seat) and the admin bell
 * (library_monitor_notify_admins, 20261031_10 — the one helper that writes a
 * notification to every admin).
 *
 *   fulfillOrder(input)            — the callback page, the webhook, the sweep
 *   findPaidPaymentForOrder(id)    — the sweep's intent-only orders
 *   mergePaymentOrderMetadata(…)   — the sweep's attempt counter
 */

import { createServiceClient } from "@/lib/supabase/server";
import { getMoyasarConfig, TIER_RANK } from "@/lib/access-control";
import { recordNotification } from "@/lib/notify";
import { grantLibraryAccess } from "@/lib/libraryAccessServer";
import { licenceHoldFor } from "./heldPlanActivation.ts";
import { settleHeldPlansAfterDecision } from "./heldPlanActivationServer.ts";
import { createMoyasarClient } from "./moyasarClient.ts";
import { sendPurchaseEvent } from "@/lib/analytics/analytics";
import {
  findPaidPaymentWith,
  fulfillOrderWith,
  mergeOrderMetadata,
  type FulfilDeps,
  type FulfillOrderInput,
  type FulfillResult,
  type GatewayClient,
} from "./fulfillCore.ts";

export type { FulfillOrderInput, FulfillOutcome, FulfillResult } from "./fulfillCore.ts";

/** The platform Moyasar client, or null while the gateway is off or misconfigured. */
async function platformGateway(): Promise<GatewayClient | null> {
  const cfg = await getMoyasarConfig();
  if (!cfg.enabled) return null;
  try {
    return createMoyasarClient(cfg);
  } catch {
    return null;
  }
}

async function serverDeps(): Promise<FulfilDeps> {
  const admin = await createServiceClient();
  return {
    admin,
    gateway: platformGateway,
    grantLibrary: grantLibraryAccess,
    ranks: TIER_RANK,
    notify: (n) => recordNotification(n),
    activateFounder: async (orderId) => {
      const { data, error } = await admin.rpc("founder_activate", { p_order: orderId });
      return { data, error };
    },
    releaseFounderSeat: async (orderId) => {
      const { error } = await admin.rpc("founder_release_order", { p_order: orderId });
      if (error) throw new Error(`founder_release_order ${error.code ?? "error"}`);
    },
    notifyAdmins: async (n) => {
      const { error } = await admin.rpc("library_monitor_notify_admins", { p_title: n.title, p_body: n.body, p_href: n.href });
      if (error) throw new Error(`library_monitor_notify_admins ${error.code ?? "error"}`);
    },
    // l18 (owner ٢٣٩): a professional plan paid before the licence approval is held until it
    licenceHold: (userId, item) => licenceHoldFor(admin, userId, item),
    // l18 review: an approval that landed while the order was being held — the approval's own release
    // (no admin acted here: a lower held plan is left to the admin's refund review, never refunded under the buyer's id)
    activateHeldPlans: (userId) => settleHeldPlansAfterDecision(admin, userId, userId, "approve", false),
    // l7-analytics: GA4 Measurement Protocol; "off" unless NEXT_PUBLIC_GA4_ID
    // AND GA4_API_SECRET are set, "skipped" unless the buyer consented.
    reportPurchase: (p) =>
      sendPurchaseEvent({ ga4Id: process.env.NEXT_PUBLIC_GA4_ID, apiSecret: process.env.GA4_API_SECRET }, p),
  };
}

export async function fulfillOrder(input: FulfillOrderInput): Promise<FulfillResult> {
  try {
    return await fulfillOrderWith(await serverDeps(), input);
  } catch (err) {
    console.error("[payments] fulfillOrder setup failed:", err instanceof Error ? err.message : err);
    return { outcome: "pending", reason: "error" };
  }
}

export async function findPaidPaymentForOrder(orderId: string) {
  return findPaidPaymentWith({ gateway: platformGateway }, orderId);
}

export async function mergePaymentOrderMetadata(orderId: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    return await mergeOrderMetadata(await createServiceClient(), orderId, patch);
  } catch {
    return false;
  }
}
