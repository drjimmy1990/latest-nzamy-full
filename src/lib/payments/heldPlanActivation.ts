/**
 * heldPlanActivation.ts — batch l18, owner answer ٢٣٩ (27 Nov 2026): «يُسمح
 * بالدفع وحجز … أي باقة مهنية قبل اعتماد التوثيق، ولكن لا تُفعَّل الباقة ولا
 * الأدوات المهنية إلا بعد اعتماد التوثيق من الإدارة».
 *
 *   licenceHoldFor — fulfilment's question (fulfillCore deps.licenceHold) for
 *     a paid PLAN: "go" (no licence rule for this buyer / item, or the
 *     licence is verified), "hold" (pending: the order is stamped with
 *     metadata.licence_pending and NO subscription is written, so the office
 *     tools stay locked — office_features_locked reads the subscriptions —
 *     and the account stays out of the directory and the marketplace, which
 *     already list verified providers only), "review" (rejected / suspended /
 *     none: no approval will follow), null (a read failed → the sweep retries).
 *   settleHeldPlansOnVerification — the admin's decision on that licence
 *     (PATCH /api/v1/admin/verifications/[id], lawyer AND firm branches, and
 *     the instant approval of lawyerSignup/approve.ts):
 *       approve → each held order is granted through grantPurchase, keyed on
 *         the order (never twice), with `now` = the approval: the plan's period
 *         STARTS ON THE APPROVAL DAY — the buyer paid for a period of use, and
 *         the days he waited for the team must not eat into it. Then
 *         licence_pending false + licence_activated_at, and the payer is told.
 *         A higher plan running (alreadyEntitled) → the refund review
 *         (already_entitled) and an admin alert. A failed grant leaves the
 *         order held and alerts the admins.
 *       reject → the FULL refund (the founder rule, founderVerification.ts):
 *         licence_rejected + already_entitled are merged first, so a refund
 *         that cannot run now leaves the order in the admin's «بانتظار
 *         استرداد» list with an alert; refundCore accepts a held order (no
 *         subscription row is looked up for an already_entitled order).
 *   Nothing here ever fails the verification decision: every outcome is
 *   returned and logged.
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveItem, type PayableItem } from "./catalog.ts";
import { grantPurchase, type GrantPurchaseDeps } from "./grantPurchase.ts";
import { licenceGatedPurchase, licenceStanding, readLicenceFacts } from "./licenceGate.ts";

export const HELD_PLAN_ORDERS_HREF = "/dashboard/admin/subscriptions/orders";

/** fulfillCore's licenceHold for a paid plan (see the header). */
export async function licenceHoldFor(admin: SupabaseClient, userId: string, item: PayableItem): Promise<"go" | "hold" | "review" | null> {
  try {
    const { data, error } = await admin.from("profiles").select("user_type").eq("id", userId).maybeSingle();
    if (error) {
      console.error("[payments/licence-hold] reading the buyer's type failed:", error.code);
      return null;
    }
    const userType = (data as { user_type?: unknown } | null)?.user_type;
    if (typeof userType !== "string" || !licenceGatedPurchase(item, userType)) return "go";
    const standing = licenceStanding(await readLicenceFacts(admin, userId, userType));
    if (standing === null) return null;
    return standing === "verified" ? "go" : standing === "pending" ? "hold" : "review";
  } catch (err) {
    console.error("[payments/licence-hold] threw:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

export interface HeldPlanDeps extends GrantPurchaseDeps {
  /** recordNotification (src/lib/notify.ts). */
  notify: (input: { userId: string; title: string; body: string; href: string }) => Promise<void>;
  /** The in-site bell of every admin. Best-effort. */
  notifyAdmins?: (input: { title: string; body: string; href: string }) => Promise<void>;
  /** The full refund of one order (refundOrderWith with confirm = true); 200 {refunded: true} on success. */
  refund: (orderId: string) => Promise<{ status: number; body: unknown }>;
  now?: () => Date;
}

export interface HeldPlanResult {
  activated: string[];
  refunded: string[];
  /** Orders an admin must look at (a refund that did not run, a grant that failed, a higher plan running). */
  review: string[];
}

interface HeldRow {
  id: string;
  user_id: string;
  kind: string;
  item_id: string;
  billing: string;
  receipt_number: string | null;
  metadata: Record<string, unknown> | null;
}

async function merge(admin: SupabaseClient, orderId: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await admin.rpc("merge_payment_order_metadata", { p_order: orderId, p_patch: patch });
    if (error) console.error("[payments/held-plan] metadata merge failed:", orderId, error.code);
    return !error;
  } catch {
    return false;
  }
}

async function alert(deps: HeldPlanDeps, title: string, body: string): Promise<void> {
  console.error("[payments/held-plan]", title, body);
  if (!deps.notifyAdmins) return;
  try {
    await deps.notifyAdmins({ title, body, href: HELD_PLAN_ORDERS_HREF });
  } catch {
    // best-effort
  }
}

/** The buyer's paid plan orders held for the licence (metadata.licence_pending = true). */
async function heldOrders(admin: SupabaseClient, userId: string): Promise<HeldRow[] | null> {
  const { data, error } = await admin
    .from("payment_orders")
    .select("id, user_id, kind, item_id, billing, receipt_number, metadata")
    .eq("user_id", userId)
    .eq("status", "paid")
    .eq("kind", "plan")
    .eq("metadata->>licence_pending", "true")
    .limit(20);
  if (error) {
    console.error("[payments/held-plan] reading the held orders failed:", error.code);
    return null;
  }
  return (data as HeldRow[] | null) ?? [];
}

async function activate(deps: HeldPlanDeps, row: HeldRow, now: Date, result: HeldPlanResult): Promise<void> {
  const item = resolveItem(row.item_id, deps.catalog);
  const granted = await grantPurchase(
    deps,
    { id: row.id, user_id: row.user_id, kind: row.kind, item_id: row.item_id, billing: row.billing, metadata: row.metadata },
    { now },
  );
  if (!granted.ok) {
    result.review.push(row.id);
    await alert(deps, "باقة مهنية مدفوعة لم تُفعَّل بعد اعتماد التوثيق", `اعتُمد التوثيق ولم تُفعَّل الباقة المحجوزة (${granted.error.slice(0, 80)}). الطلب ${row.id}.`);
    return;
  }
  if (granted.alreadyEntitled) {
    await merge(deps.admin, row.id, { licence_pending: false, already_entitled: true });
    result.review.push(row.id);
    await alert(deps, "باقة محجوزة لم تُفعَّل لوجود باقة أعلى", `اعتُمد التوثيق، ولدى صاحب الطلب ${row.id} باقة أعلى سارية؛ راجع الاسترداد.`);
    return;
  }
  await merge(deps.admin, row.id, { licence_pending: false, licence_activated_at: now.toISOString() });
  result.activated.push(row.id);
  try {
    const receipt = row.receipt_number ? ` رقم الإيصال: ${row.receipt_number}.` : "";
    await deps.notify({
      userId: row.user_id,
      title: "تم تفعيل باقتك بعد اعتماد التوثيق",
      body: `اعتُمد توثيقك وفُعّلت باقة «${item?.labelAr ?? "الباقة"}» من اليوم.${receipt}`,
      href: "/dashboard/billing",
    });
  } catch {
    // the activation stands without the notice
  }
}

async function refundHeld(deps: HeldPlanDeps, row: HeldRow, result: HeldPlanResult): Promise<void> {
  await merge(deps.admin, row.id, { licence_pending: false, licence_rejected: true, already_entitled: true });
  let reply: { status: number; body: unknown } | null = null;
  try {
    reply = await deps.refund(row.id);
  } catch (err) {
    console.error("[payments/held-plan] the refund threw:", row.id, err instanceof Error ? err.message : err);
  }
  const body = (reply?.body ?? null) as { refunded?: unknown; error?: unknown } | null;
  if (reply?.status === 200 && body?.refunded === true) {
    result.refunded.push(row.id);
    return;
  }
  result.review.push(row.id);
  const why = typeof body?.error === "string" ? body.error.slice(0, 200) : "لم يكتمل الاسترداد";
  await alert(deps, "رُفض توثيق حساب دفع باقة مهنية — يلزم استرداد", `لم يكتمل الاسترداد الكامل تلقائيًا: ${why}. الطلب ${row.id}.`);
}

/** After the admin's decision on a lawyer's or a firm's licence. Never throws. */
export async function settleHeldPlansOnVerification(
  deps: HeldPlanDeps,
  userId: string,
  decision: "approve" | "reject",
): Promise<HeldPlanResult> {
  const result: HeldPlanResult = { activated: [], refunded: [], review: [] };
  try {
    const rows = await heldOrders(deps.admin, userId);
    if (rows === null) {
      await alert(deps, "تعذّرت قراءة الباقات المحجوزة بعد قرار التوثيق", `قرار التوثيق للمستخدم ${userId} لم يُطبَّق على باقاته المحجوزة — راجع صفحة المدفوعات.`);
      return result;
    }
    const now = deps.now?.() ?? new Date();
    for (const row of rows) {
      if (decision === "approve") await activate(deps, row, now, result);
      else await refundHeld(deps, row, result);
    }
  } catch (err) {
    console.error("[payments/held-plan] unexpected:", err instanceof Error ? err.message : err);
  }
  return result;
}
