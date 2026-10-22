import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient } from "./moyasarClient.ts";
import type { BillingData, BillingOrder } from "./billingView.ts";

export const BILLING_ORDER_COLUMNS = "id,item_id,billing,net_halalas,vat_halalas,total_halalas,currency,status,receipt_number,paid_at,refunded_halalas,created_at,live";
export const BILLING_CARD_COLUMNS = "id,merchant,brand,last_four,exp_month,exp_year,status,created_at";
const LOT_COLUMNS = "id,source,points_total,points_left,expires_at,created_at";
export const BILLING_UNAVAILABLE_AR = "بيانات الفوترة غير متاحة مؤقتاً، حاول مرة أخرى بعد قليل";
export const CARD_MODE_MISMATCH_AR = "لا يمكن حذف هذه البطاقة من هنا لأنها حُفظت في وضع مختلف؛ تواصل مع الدعم";
type Reply = { status: number; body: BillingData | { error: string } | { deleted: true } };
const unavailable = (): Reply => ({ status: 503, body: { error: BILLING_UNAVAILABLE_AR } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const logged = new Set<string>();
/** Logs each distinct failure code once per process; never logs tokens or rows. */
export function logBillingError(code: string | undefined) {
  const key = code ?? "unavailable";
  if (logged.has(key)) return;
  logged.add(key);
  console.error("[billing] financial data unavailable:", key);
}
const errorName = (err: unknown) => err instanceof Error ? err.message : "unknown";

/**
 * The user's own rows, read through the user's RLS client (createClient):
 * every column here is granted to authenticated, and points_balance answers
 * for auth.uid(). The explicit owner filter stays as defence in depth.
 */
export async function getBillingWith(rls: SupabaseClient, userId: string): Promise<Reply> {
  try {
    const [orders, cards, lots, balance] = await Promise.all([
      rls.from("payment_orders").select(BILLING_ORDER_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      rls.from("payment_methods").select(BILLING_CARD_COLUMNS).eq("user_id", userId).in("status", ["active", "inactive"]).order("created_at", { ascending: false }),
      rls.from("points_lots").select(LOT_COLUMNS).eq("user_id", userId).gt("points_left", 0).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: true }),
      rls.rpc("points_balance", { p_user: userId }),
    ]);
    const failed = [orders, cards, lots, balance].find(r => r.error);
    if (failed) { logBillingError(failed.error?.code); return unavailable(); }
    if (!Number.isSafeInteger(balance.data) || balance.data < 0) { logBillingError("balance_not_integer"); return unavailable(); }
    return { status: 200, body: { orders: orders.data ?? [], cards: cards.data ?? [], lots: lots.data ?? [], pointsBalance: balance.data } };
  } catch (err) { logBillingError(`billing_exception:${errorName(err)}`); return unavailable(); }
}

interface VisibleCard { id: string; merchant: string; status: string }
interface SecretCard { token: string; live: boolean | null }
export interface CardDeleteDeps {
  /** The user's RLS client: proves the card is theirs before anything else. */
  rls: SupabaseClient;
  /** The service client: the token read and the status update only. */
  admin: SupabaseClient;
  gateway: () => Promise<Pick<MoyasarClient, "mode" | "deleteToken"> | null>;
}
/** A disabled/wrong account or unknown legacy mode refuses deletion safely. */
export async function deleteCardWith(deps: CardDeleteDeps, userId: string, cardId: string): Promise<Reply> {
  if (!UUID.test(cardId)) return { status: 404, body: { error: "البطاقة غير موجودة" } };
  let tokenDeleted = false;
  try {
    // live and token are server-only columns: the RLS read takes what is granted.
    const result = await deps.rls.from("payment_methods").select("id,merchant,status").eq("id", cardId).eq("user_id", userId).maybeSingle();
    if (result.error) { logBillingError(`card_lookup:${result.error.code}`); return unavailable(); }
    const card = result.data as VisibleCard | null;
    if (!card) return { status: 404, body: { error: "البطاقة غير موجودة" } };
    if (card.status === "deleted") return { status: 200, body: { deleted: true } };
    if (card.merchant !== "platform") return unavailable();
    const hidden = await deps.admin.from("payment_methods").select("token,live").eq("id", cardId).eq("user_id", userId).maybeSingle();
    if (hidden.error) { logBillingError(`card_token:${hidden.error.code}`); return unavailable(); }
    const secret = hidden.data as SecretCard | null;
    if (!secret) return { status: 404, body: { error: "البطاقة غير موجودة" } };
    // A legacy card of unknown mode, or one saved under the other gateway mode,
    // cannot be deleted with this account's key: a permanent refusal.
    if (typeof secret.live !== "boolean") return { status: 409, body: { error: CARD_MODE_MISMATCH_AR } };
    const gateway = await deps.gateway();
    if (!gateway) return unavailable();
    if ((gateway.mode === "live") !== secret.live) return { status: 409, body: { error: CARD_MODE_MISMATCH_AR } };
    const removed = await gateway.deleteToken(secret.token);
    // A retry after gateway success + local write failure may find it absent.
    if (!removed.ok && removed.status !== 404) {
      logBillingError(`card_gateway:${removed.status}`);
      return { status: 502, body: { error: "تعذّر حذف البطاقة لدى مزوّد الدفع، حاول مرة أخرى" } };
    }
    tokenDeleted = true;
    const saved = await deps.admin.from("payment_methods").update({ status: "deleted" }).eq("id", cardId).eq("user_id", userId).select("id");
    if (saved.error || !Array.isArray(saved.data) || saved.data.length === 0) {
      // The worst case: the token is gone at Moyasar, the card still reads active.
      // Every occurrence is logged with the card id (never the token).
      console.error("[billing] card token deleted at the gateway but the local update failed; card:", cardId, saved.error?.code ?? "no_row");
      return unavailable();
    }
    return { status: 200, body: { deleted: true } };
  } catch (err) {
    if (tokenDeleted) console.error("[billing] card token deleted at the gateway but the local update failed; card:", cardId, "exception");
    else logBillingError(`card_delete_exception:${errorName(err)}`);
    return unavailable();
  }
}

/**
 * The order through the user's RLS client; then a service read of only
 * metadata->payment_method (the masked last four). Metadata itself is never
 * granted to authenticated and never reaches React.
 */
export async function readReceiptWith(rls: SupabaseClient, admin: SupabaseClient, userId: string, orderId: string): Promise<{ order: BillingOrder | null; company: unknown; unavailable?: boolean }> {
  if (!UUID.test(orderId)) return { order: null, company: null };
  try {
    const result = await rls.from("payment_orders").select(BILLING_ORDER_COLUMNS).eq("id", orderId).eq("user_id", userId).maybeSingle();
    if (result.error) { logBillingError(`receipt_order:${result.error.code}`); return { order: null, company: null, unavailable: true }; }
    if (!result.data) return { order: null, company: null };
    const masked = await admin.from("payment_orders").select("payment_method:metadata->payment_method").eq("id", orderId).eq("user_id", userId).maybeSingle();
    // A failed read shows «تفاصيل البطاقة غير متاحة» rather than failing the receipt.
    if (masked.error) logBillingError(`receipt_payment_method:${masked.error.code}`);
    const method = (masked.data as { payment_method?: { last_four?: unknown } } | null)?.payment_method;
    const lastFour = typeof method?.last_four === "string" && /^\d{4}$/.test(method.last_four) ? method.last_four : null;
    const company = await admin.from("platform_settings").select("value").eq("key", "billing_company").maybeSingle();
    // A failed company read produces the explicit incomplete-company notice.
    if (company.error) logBillingError(`receipt_company:${company.error.code}`);
    return { order: { ...(result.data as unknown as BillingOrder), last_four: lastFour }, company: company.error ? null : company.data?.value ?? null };
  } catch (err) { logBillingError(`receipt_exception:${errorName(err)}`); return { order: null, company: null, unavailable: true }; }
}
