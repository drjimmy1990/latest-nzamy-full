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
 *     already list verified providers only) for a pending licence or one not
 *     submitted yet (l18 review ruling: its approval releases the hold),
 *     "review" (rejected / suspended: no approval will follow), null (a read
 *     failed → the sweep retries). l19 (owner ٢٤١): a verified licence goes
 *     whatever its recorded expiry date.
 *   settleHeldPlansOnVerification — the admin's decision on that licence
 *     (PATCH /api/v1/admin/verifications/[id], lawyer AND firm branches, and
 *     the instant approval of lawyerSignup/approve.ts):
 *       approve → the held orders, highest plan first (tier rank, then the
 *         larger total, then the earlier payment — l18 review): the FIRST is
 *         granted through grantPurchase, keyed on the order (never twice),
 *         and only once it is active every other held order is refunded in
 *         full (licence_superseded + already_entitled merged first, so a refund
 *         that cannot run stays in the admin's refund review) with an admin
 *         note; if the first grant fails, the rest stay held. `now` = the
 *         approval: the plan's period
 *         STARTS ON THE APPROVAL DAY — the buyer paid for a period of use, and
 *         the days he waited for the team must not eat into it. Then
 *         licence_pending false + licence_activated_at, and already_entitled /
 *         licence_review false (l18 review: an order first held for review
 *         leaves the refund queue once its plan is active), and the payer is
 *         told.
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
 *   settleHeldPlansOfFirmMembers — owner ٢٤٢ (27 Nov, batch l19; reverses
 *     l18's «approving a firm does not release its members' plans»): when the
 *     admin APPROVES a firm's verification, the held professional plans of its
 *     ACTIVE member lawyers are released too, each through the same
 *     settlement as above, keyed on that member (his own orders, his own
 *     notice «اعتُمد توثيق مكتبك…»). A member whose OWN licence was rejected or
 *     suspended stays as is; the firm's owner is settled by the firm's own
 *     call. A firm REJECTION touches no member: their held orders stay held,
 *     and each may still be released by the approval of his own licence.
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveItem, type PayableItem } from "./catalog.ts";
import { grantPurchase, type GrantPurchaseDeps } from "./grantPurchase.ts";
import { licenceDetail, licenceGatedPurchase, readLicenceFacts } from "./licenceGate.ts";

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
    const detail = licenceDetail(await readLicenceFacts(admin, userId, userType));
    if (detail === null) return null;
    if (detail === "verified") return "go";
    return detail === "pending" || detail === "none" ? "hold" : "review";
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
  total_halalas?: number | null;
  paid_at?: string | null;
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

async function alert(deps: Pick<HeldPlanDeps, "notifyAdmins">, title: string, body: string): Promise<void> {
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
    .select("id, user_id, kind, item_id, billing, receipt_number, total_halalas, paid_at, metadata")
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

/** Highest plan first: tier rank, then the larger total, then the earlier payment (l18 review). */
export function heldOrdersByRank(rows: readonly HeldRow[], deps: Pick<HeldPlanDeps, "catalog" | "ranks">): HeldRow[] {
  const rank = (r: HeldRow) => {
    const tier = resolveItem(r.item_id, deps.catalog)?.tier;
    const n = tier ? (deps.ranks as Record<string, number | undefined>)[tier] : undefined;
    return typeof n === "number" ? n : -1;
  };
  const paid = (r: HeldRow) => {
    const t = typeof r.paid_at === "string" ? Date.parse(r.paid_at) : NaN;
    return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
  };
  return [...rows].sort(
    (a, b) => rank(b) - rank(a) || (b.total_halalas ?? 0) - (a.total_halalas ?? 0) || paid(a) - paid(b) || a.id.localeCompare(b.id),
  );
}

/** Whose verification released the plan: the buyer's own (default), or (l19, ٢٤٢) the firm he works in. */
export type HeldPlanRelease = "own" | "firm";

async function activate(deps: HeldPlanDeps, row: HeldRow, now: Date, result: HeldPlanResult, via: HeldPlanRelease = "own"): Promise<boolean> {
  const item = resolveItem(row.item_id, deps.catalog);
  const granted = await grantPurchase(
    deps,
    { id: row.id, user_id: row.user_id, kind: row.kind, item_id: row.item_id, billing: row.billing, metadata: row.metadata },
    { now },
  );
  if (!granted.ok) {
    result.review.push(row.id);
    await alert(deps, "باقة مهنية مدفوعة لم تُفعَّل بعد اعتماد التوثيق", `اعتُمد التوثيق ولم تُفعَّل الباقة المحجوزة (${granted.error.slice(0, 80)}). الطلب ${row.id}.`);
    return false;
  }
  if (granted.alreadyEntitled) {
    await merge(deps.admin, row.id, { licence_pending: false, already_entitled: true });
    result.review.push(row.id);
    await alert(deps, "باقة محجوزة لم تُفعَّل لوجود باقة أعلى", `اعتُمد التوثيق، ولدى صاحب الطلب ${row.id} باقة أعلى سارية؛ راجع الاسترداد.`);
    return false;
  }
  // l18 review: an order first held for review (already_entitled) leaves the
  // refund queue now that its plan is active — a refund would cancel it
  const cleared = await merge(deps.admin, row.id, {
    licence_pending: false,
    already_entitled: false,
    licence_review: false,
    licence_activated_at: now.toISOString(),
  });
  if (!cleared) {
    await alert(deps, "فُعّلت باقة محجوزة ولم يُحدَّث طلبها", `فُعّلت الباقة بعد اعتماد التوثيق، لكن لم تُحدَّث حالة الطلب ${row.id}؛ لا تسترده قبل مراجعته.`);
  }
  result.activated.push(row.id);
  try {
    const receipt = row.receipt_number ? ` رقم الإيصال: ${row.receipt_number}.` : "";
    await deps.notify({
      userId: row.user_id,
      title: "تم تفعيل باقتك بعد اعتماد التوثيق",
      body:
        via === "firm"
          ? `اعتُمد توثيق مكتبك وفُعّلت باقة «${item?.labelAr ?? "الباقة"}» من اليوم.${receipt}`
          : `اعتُمد توثيقك وفُعّلت باقة «${item?.labelAr ?? "الباقة"}» من اليوم.${receipt}`,
      href: "/dashboard/billing",
    });
  } catch {
    // the activation stands without the notice
  }
  return true;
}

/** l18 review: a lower held plan of the same buyer, once the highest is active — refunded in full, with an admin note. */
async function refundSuperseded(deps: HeldPlanDeps, row: HeldRow, keptId: string, result: HeldPlanResult): Promise<void> {
  await merge(deps.admin, row.id, { licence_pending: false, licence_superseded: true, licence_superseded_by: keptId, already_entitled: true });
  let reply: { status: number; body: unknown } | null = null;
  try {
    reply = await deps.refund(row.id);
  } catch (err) {
    console.error("[payments/held-plan] the refund threw:", row.id, err instanceof Error ? err.message : err);
  }
  const body = (reply?.body ?? null) as { refunded?: unknown; error?: unknown } | null;
  if (reply?.status === 200 && body?.refunded === true) {
    result.refunded.push(row.id);
    await alert(deps, "استُردّت باقة محجوزة أدنى تلقائيًا", `اعتُمد التوثيق وفُعّلت الباقة الأعلى (الطلب ${keptId})، فرُدّ مبلغ الباقة الأدنى كاملاً: الطلب ${row.id}.`);
    return;
  }
  result.review.push(row.id);
  const why = typeof body?.error === "string" ? body.error.slice(0, 200) : "لم يكتمل الاسترداد";
  await alert(deps, "باقة محجوزة أدنى تنتظر الاسترداد", `فُعّلت الباقة الأعلى (الطلب ${keptId})، ولم يكتمل الاسترداد التلقائي للباقة الأدنى: ${why}. الطلب ${row.id}.`);
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

/**
 * After the admin's decision on a lawyer's or a firm's licence. Never throws.
 * `opts.via` "firm" (l19, ٢٤٢): the member of a firm whose verification was
 * approved — only the activation notice's wording changes.
 */
export async function settleHeldPlansOnVerification(
  deps: HeldPlanDeps,
  userId: string,
  decision: "approve" | "reject",
  opts: { via?: HeldPlanRelease } = {},
): Promise<HeldPlanResult> {
  const result: HeldPlanResult = { activated: [], refunded: [], review: [] };
  try {
    const rows = await heldOrders(deps.admin, userId);
    if (rows === null) {
      await alert(deps, "تعذّرت قراءة الباقات المحجوزة بعد قرار التوثيق", `قرار التوثيق للمستخدم ${userId} لم يُطبَّق على باقاته المحجوزة — راجع صفحة المدفوعات.`);
      return result;
    }
    const now = deps.now?.() ?? new Date();
    if (decision === "approve") {
      // l18 review: only the highest plan is activated; the others are refunded once it is active
      const [first, ...rest] = heldOrdersByRank(rows, deps);
      if (first && (await activate(deps, first, now, result, opts.via ?? "own"))) {
        for (const row of rest) await refundSuperseded(deps, row, first.id, result);
      } else if (rest.length > 0) {
        await alert(deps, "باقات محجوزة لم تُفعَّل بعد اعتماد التوثيق", `لم تُفعَّل الباقة الأعلى (الطلب ${first?.id ?? "—"})، فبقيت الطلبات الأخرى محجوزة: ${rest.map((r) => r.id).join("، ")}.`);
      }
    } else {
      for (const row of rows) await refundHeld(deps, row, result);
    }
  } catch (err) {
    console.error("[payments/held-plan] unexpected:", err instanceof Error ? err.message : err);
  }
  return result;
}

// ── l19, owner ٢٤٢: approving a firm releases its member lawyers' held plans ──

/** At most this many active members are looked at per approval (a firm's seats are far fewer). */
export const FIRM_MEMBER_RELEASE_LIMIT = 500;
const MEMBER_CHUNK = 150;

export interface FirmMembersRelease {
  /** Per member whose held plans were settled. */
  members: Array<{ userId: string; result: HeldPlanResult }>;
  /** Active members with held plans left as they are: their own licence was rejected or suspended. */
  skipped: string[];
  /** A read failed: nothing was settled for the members, the admins were alerted. */
  readFailed: boolean;
}

/**
 * After the admin APPROVED the firm `firmId` (owned by `ownerUserId`): the
 * active members (firm_members.status 'active', the owner excluded — the
 * firm's own call settles him) who hold a paid plan order waiting for the
 * licence (metadata.licence_pending) are settled one by one through `settle`
 * (settleHeldPlansAfterDecision(…, member, "approve", …, { via: "firm" })),
 * except a member whose OWN lawyer_profiles.verification_status is
 * 'rejected' or 'suspended'. Any failed read settles no member and alerts the
 * admins. Never throws.
 */
export async function settleHeldPlansOfFirmMembers(
  deps: Pick<HeldPlanDeps, "admin" | "notifyAdmins">,
  firmId: string,
  ownerUserId: string,
  settle: (memberId: string) => Promise<HeldPlanResult>,
): Promise<FirmMembersRelease> {
  const out: FirmMembersRelease = { members: [], skipped: [], readFailed: false };
  const failed = async (what: string, code: unknown) => {
    console.error("[payments/held-plan] firm members:", what, code ?? "no-code");
    out.readFailed = true;
    await alert(
      deps,
      "تعذّرت مراجعة باقات أعضاء المكتب بعد اعتماده",
      `اعتُمد توثيق المكتب ${firmId}، ولم تُفعَّل الباقات المحجوزة لأعضائه (${what}) — راجع صفحة المدفوعات.`,
    );
    return out;
  };
  try {
    const { data: rows, error } = await deps.admin
      .from("firm_members")
      .select("user_id")
      .eq("firm_id", firmId)
      .eq("status", "active")
      .limit(FIRM_MEMBER_RELEASE_LIMIT);
    if (error) return await failed("firm_members", error.code);
    const memberIds = Array.from(
      new Set(
        ((rows ?? []) as Array<{ user_id?: unknown }>)
          .map((r) => r.user_id)
          .filter((id): id is string => typeof id === "string" && id !== "" && id !== ownerUserId),
      ),
    );
    // only the members who hold a plan order waiting for the licence
    const holders = new Set<string>();
    const ownStatus = new Map<string, unknown>();
    for (let i = 0; i < memberIds.length; i += MEMBER_CHUNK) {
      const part = memberIds.slice(i, i + MEMBER_CHUNK);
      const held = await deps.admin
        .from("payment_orders")
        .select("user_id")
        .in("user_id", part)
        .eq("status", "paid")
        .eq("kind", "plan")
        .eq("metadata->>licence_pending", "true")
        .limit(1000);
      if (held.error) return await failed("payment_orders", held.error.code);
      for (const h of (held.data ?? []) as Array<{ user_id?: unknown }>) if (typeof h.user_id === "string") holders.add(h.user_id);
    }
    const toSettle = memberIds.filter((id) => holders.has(id));
    for (let i = 0; i < toSettle.length; i += MEMBER_CHUNK) {
      const part = toSettle.slice(i, i + MEMBER_CHUNK);
      const own = await deps.admin.from("lawyer_profiles").select("user_id, verification_status").in("user_id", part);
      if (own.error) return await failed("lawyer_profiles", own.error.code);
      for (const p of (own.data ?? []) as Array<{ user_id?: unknown; verification_status?: unknown }>) {
        if (typeof p.user_id === "string") ownStatus.set(p.user_id, p.verification_status);
      }
    }
    for (const memberId of toSettle) {
      const status = ownStatus.get(memberId);
      if (status === "rejected" || status === "suspended") {
        out.skipped.push(memberId);
        continue;
      }
      out.members.push({ userId: memberId, result: await settle(memberId) });
    }
  } catch (err) {
    return await failed("unexpected", err instanceof Error ? err.message : "error");
  }
  return out;
}
