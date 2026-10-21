import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient } from "./moyasarClient.ts";
import type { BillingData, BillingOrder } from "./billingView.ts";

export const BILLING_ORDER_COLUMNS = "id,item_id,billing,net_halalas,vat_halalas,total_halalas,currency,status,receipt_number,paid_at,refunded_halalas,created_at,live";
export const BILLING_CARD_COLUMNS = "id,merchant,brand,last_four,exp_month,exp_year,status,created_at";
const LOT_COLUMNS = "id,source,points_total,points_left,expires_at,created_at";
export const BILLING_UNAVAILABLE_AR = "بيانات الفوترة غير متاحة مؤقتاً، حاول مرة أخرى بعد قليل";
type Reply = { status: number; body: BillingData | { error: string } | { deleted: true } };
const unavailable = (): Reply => ({ status: 503, body: { error: BILLING_UNAVAILABLE_AR } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const logged = new Set<string>();
function logBillingError(code: string | undefined) {
  const key = code ?? "unavailable";
  if (logged.has(key)) return;
  logged.add(key);
  console.error("[billing] financial data unavailable:", key);
}

/** Service-role reads still carry the authenticated owner on every query. */
export async function getBillingWith(admin: SupabaseClient, userId: string): Promise<Reply> {
  try {
    const [orders, cards, lots, balance] = await Promise.all([
      admin.from("payment_orders").select(BILLING_ORDER_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      admin.from("payment_methods").select(BILLING_CARD_COLUMNS).eq("user_id", userId).in("status", ["active", "inactive"]).order("created_at", { ascending: false }),
      admin.from("points_lots").select(LOT_COLUMNS).eq("user_id", userId).gt("points_left", 0).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: true }),
      admin.rpc("points_balance", { p_user: userId }),
    ]);
    const failed = [orders, cards, lots, balance].find(r => r.error);
    if (failed) { logBillingError(failed.error?.code); return unavailable(); }
    if (!Number.isSafeInteger(balance.data) || balance.data < 0) return unavailable();
    return { status: 200, body: { orders: orders.data ?? [], cards: cards.data ?? [], lots: lots.data ?? [], pointsBalance: balance.data } };
  } catch { return unavailable(); }
}

interface CardRow { id: string; user_id: string; merchant: string; token: string; live: boolean | null; status: string }
export interface CardDeleteDeps {
  admin: SupabaseClient;
  gateway: () => Promise<Pick<MoyasarClient, "mode" | "deleteToken"> | null>;
}
/** A disabled/wrong account or unknown legacy mode refuses deletion safely. */
export async function deleteCardWith(deps: CardDeleteDeps, userId: string, cardId: string): Promise<Reply> {
  if (!UUID.test(cardId)) return { status: 404, body: { error: "البطاقة غير موجودة" } };
  try {
    const result = await deps.admin.from("payment_methods").select("id,user_id,merchant,token,live,status").eq("id", cardId).eq("user_id", userId).maybeSingle();
    if (result.error) return unavailable();
    const card = result.data as CardRow | null;
    if (!card || card.user_id !== userId) return { status: 404, body: { error: "البطاقة غير موجودة" } };
    if (card.status === "deleted") return { status: 200, body: { deleted: true } };
    if (card.merchant !== "platform" || typeof card.live !== "boolean") return unavailable();
    const gateway = await deps.gateway();
    if (!gateway || (gateway.mode === "live") !== card.live) return unavailable();
    const removed = await gateway.deleteToken(card.token);
    // A retry after gateway success + local write failure may find it absent.
    if (!removed.ok && removed.status !== 404) return { status: 502, body: { error: "تعذّر حذف البطاقة لدى مزوّد الدفع، حاول مرة أخرى" } };
    const saved = await deps.admin.from("payment_methods").update({ status: "deleted" }).eq("id", cardId).eq("user_id", userId).select("id");
    if (saved.error || !Array.isArray(saved.data) || saved.data.length === 0) return unavailable();
    return { status: 200, body: { deleted: true } };
  } catch { return unavailable(); }
}

/** Project masked details out of server-only metadata; never pass metadata to React. */
export async function readReceiptWith(admin: SupabaseClient, userId: string, orderId: string): Promise<{ order: BillingOrder | null; company: unknown; unavailable?: boolean }> {
  if (!UUID.test(orderId)) return { order: null, company: null };
  try {
    const result = await admin.from("payment_orders").select(`${BILLING_ORDER_COLUMNS},metadata`).eq("id", orderId).eq("user_id", userId).maybeSingle();
    if (result.error) return { order: null, company: null, unavailable: true };
    if (!result.data) return { order: null, company: null };
    const { metadata, ...safe } = result.data;
    const method = metadata?.payment_method;
    const lastFour = typeof method?.last_four === "string" && /^\d{4}$/.test(method.last_four) ? method.last_four : null;
    const company = await admin.from("platform_settings").select("value").eq("key", "billing_company").maybeSingle();
    // A failed company read produces the explicit incomplete-company notice.
    return { order: { ...safe, last_four: lastFour } as BillingOrder, company: company.error ? null : company.data?.value ?? null };
  } catch { return { order: null, company: null, unavailable: true }; }
}
