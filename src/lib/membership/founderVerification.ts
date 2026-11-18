/**
 * founderVerification.ts — batch l7, decision 1 (18 Nov 2026; launch gap
 * item 13): a lawyer may pay for the founder seat BEFORE his licence is
 * verified. His paid seat waits in founder_seats.status
 * 'pending_verification' (20261127_10: counted, never released by the
 * sweep). When the admin decides his verification
 * (PATCH /api/v1/admin/verifications/[id], the lawyer branch):
 *
 *   approve → founder_activate(order) again: the seat becomes active (12
 *             months from today), credits, library, badge; metadata
 *             already_entitled is cleared; the lawyer is told «تم تفعيل
 *             عضويتك المؤسِّسة».
 *   reject  → the FULL refund (VAT included) through the existing refund
 *             path (refundCore.refundOrderWith with confirm = true, which
 *             revokes the seat with founder_revoke and notifies the payer).
 *             BEFORE it, metadata { founder: 'not_verified',
 *             already_entitled: true } is merged, so a refund that cannot
 *             run now (gateway off, mode mismatch, a provider error) leaves
 *             the order in the admin's «بانتظار استرداد» list; every admin is
 *             alerted then.
 *
 * Nothing here ever fails the verification decision itself: every outcome is
 * returned, logged, and an admin alert covers the ones that need a person.
 * A database before 20261127_10 has no pending seat → 'none'.
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FOUNDER_CAMPAIGN_ID } from "./founderPlan.ts";
import { resolveItem } from "../payments/catalog.ts";
import { fulfilmentNoticeAr, isMissingPaymentsObject } from "../payments/fulfillDecision.ts";

/** The admin's orders page, where a refund that did not run is finished. */
export const FOUNDER_VERIFICATION_REFUND_HREF = "/dashboard/admin/subscriptions/orders";

export type FounderVerificationOutcome =
  /** no seat waiting for this lawyer (the usual case) */
  | "none"
  /** approve: the seat is active */
  | "activated"
  /** reject: the refund ran (the seat is revoked) */
  | "refunded"
  /** reject: the refund did not run — the order waits in «بانتظار استرداد» */
  | "refund_pending"
  /** a read or the activation failed — an admin was alerted */
  | "failed";

export interface FounderVerificationResult {
  outcome: FounderVerificationOutcome;
  orderId?: string;
}

export interface FounderVerificationDeps {
  admin: SupabaseClient;
  /**
   * The full refund of one order — the route binds refundOrderWith(deps,
   * orderId, actorId, true). Its reply: 200 { refunded: true } on success.
   */
  refund: (orderId: string) => Promise<{ status: number; body: unknown }>;
  /** recordNotification (src/lib/notify.ts). */
  notify: (input: { userId: string; title: string; body: string; href: string }) => Promise<void>;
  /** The in-site bell of every admin (library_monitor_notify_admins). Best-effort. */
  notifyAdmins?: (input: { title: string; body: string; href: string }) => Promise<void>;
}

async function alertAdmins(deps: FounderVerificationDeps, title: string, body: string): Promise<void> {
  console.error("[founder/verification]", title, body);
  if (!deps.notifyAdmins) return;
  try {
    await deps.notifyAdmins({ title, body, href: FOUNDER_VERIFICATION_REFUND_HREF });
  } catch (err) {
    console.error("[founder/verification] the admin alert failed:", err instanceof Error ? err.message : err);
  }
}

async function mergeMetadata(admin: SupabaseClient, orderId: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await admin.rpc("merge_payment_order_metadata", { p_order: orderId, p_patch: patch });
    if (error) console.error("[founder/verification] metadata merge failed:", orderId, error.code);
    return !error;
  } catch (err) {
    console.error("[founder/verification] metadata merge threw:", orderId, err instanceof Error ? err.message : err);
    return false;
  }
}

/** The order behind the user's pending_verification seat, null for none, or "error". */
async function pendingSeatOrder(admin: SupabaseClient, userId: string): Promise<string | null | "error"> {
  const { data, error } = await admin
    .from("founder_seats")
    .select("order_id")
    .eq("user_id", userId)
    .eq("campaign_id", FOUNDER_CAMPAIGN_ID)
    .eq("status", "pending_verification")
    .maybeSingle();
  if (error) {
    // 42P01 / 42703 …: the founder migrations are not there; 23514 cannot
    // happen on a read. A value outside the old status check simply matches
    // nothing on a database before 20261127_10.
    if (isMissingPaymentsObject(error.code)) return null;
    console.error("[founder/verification] reading the pending seat failed:", error.code);
    return "error";
  }
  const orderId = (data as { order_id?: unknown } | null)?.order_id;
  return typeof orderId === "string" && orderId ? orderId : null;
}

async function approve(deps: FounderVerificationDeps, userId: string, orderId: string): Promise<FounderVerificationResult> {
  const { data, error } = await deps.admin.rpc("founder_activate", { p_order: orderId });
  if (error || (data !== "activated" && data !== "already")) {
    await alertAdmins(
      deps,
      "عضوية مؤسس مدفوعة لم تُفعَّل بعد اعتماد المحامي",
      `اعتُمد المحامي ولم يُفعَّل مقعده المدفوع (${error ? error.code ?? "error" : String(data).slice(0, 40)}). الطلب ${orderId}. أعد محاولة التفعيل من «حملة المؤسس».`,
    );
    return { outcome: "failed", orderId };
  }
  // no longer a refund review, if an earlier call marked it so
  await mergeMetadata(deps.admin, orderId, { already_entitled: false });
  if (data === "activated") {
    try {
      const { data: row } = await deps.admin
        .from("payment_orders")
        .select("item_id, receipt_number")
        .eq("id", orderId)
        .maybeSingle();
      const order = row as { item_id?: string; receipt_number?: string | null } | null;
      const item = order?.item_id ? resolveItem(order.item_id) : null;
      const notice = fulfilmentNoticeAr({
        kind: "membership",
        labelAr: item?.labelAr ?? "باقة المحامي المؤسس",
        receiptNumber: order?.receipt_number ?? null,
        alreadyEntitled: false,
      });
      await deps.notify({ userId, title: notice.title, body: notice.body, href: notice.href });
    } catch (err) {
      console.error("[founder/verification] the activation notice failed:", orderId, err instanceof Error ? err.message : err);
    }
  }
  return { outcome: "activated", orderId };
}

async function reject(deps: FounderVerificationDeps, orderId: string): Promise<FounderVerificationResult> {
  // first the refund-review marks: if the refund cannot run now, the order is
  // in the admin's «بانتظار استرداد» list with the reason «not verified»
  await mergeMetadata(deps.admin, orderId, { founder: "not_verified", already_entitled: true });
  let reply: { status: number; body: unknown } | null = null;
  try {
    reply = await deps.refund(orderId);
  } catch (err) {
    console.error("[founder/verification] the refund threw:", orderId, err instanceof Error ? err.message : err);
  }
  const body = (reply?.body ?? null) as { refunded?: unknown; error?: unknown } | null;
  if (reply?.status === 200 && body?.refunded === true) return { outcome: "refunded", orderId };
  const why = typeof body?.error === "string" ? body.error.slice(0, 200) : "لم يكتمل الاسترداد";
  await alertAdmins(
    deps,
    "رُفض توثيق محامٍ دفع مقعد المؤسس — يلزم استرداد",
    `رُفض توثيق المحامي ولم يكتمل الاسترداد الكامل تلقائيًا: ${why}. الطلب ${orderId}. أكمله من صفحة المدفوعات.`,
  );
  return { outcome: "refund_pending", orderId };
}

/**
 * Settles the founder seat a lawyer paid for while his licence was pending,
 * after the admin's decision on that licence. Never throws.
 */
export async function settleFounderSeatOnVerification(
  deps: FounderVerificationDeps,
  userId: string,
  decision: "approve" | "reject",
): Promise<FounderVerificationResult> {
  try {
    const orderId = await pendingSeatOrder(deps.admin, userId);
    if (orderId === null) return { outcome: "none" };
    if (orderId === "error") {
      await alertAdmins(
        deps,
        "تعذّرت قراءة مقعد المؤسس بعد قرار التوثيق",
        `قرار التوثيق (${decision === "approve" ? "اعتماد" : "رفض"}) للمستخدم ${userId} لم يُطبَّق على مقعد المؤسس — راجع «حملة المؤسس».`,
      );
      return { outcome: "failed" };
    }
    return decision === "approve" ? await approve(deps, userId, orderId) : await reject(deps, orderId);
  } catch (err) {
    console.error("[founder/verification] unexpected:", err instanceof Error ? err.message : err);
    return { outcome: "failed" };
  }
}
