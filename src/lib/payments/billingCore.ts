import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient } from "./moyasarClient.ts";
import { CREDIT_NOTE_COLUMNS, type BillingCreditNote, type BillingData, type BillingLot, type BillingOrder } from "./billingView.ts";

export const BILLING_ORDER_COLUMNS = "id,item_id,billing,net_halalas,vat_halalas,total_halalas,currency,status,receipt_number,paid_at,refunded_halalas,created_at,live";
export const BILLING_CARD_COLUMNS = "id,merchant,brand,last_four,exp_month,exp_year,status,created_at";
const LOT_COLUMNS = "id,source,points_total,points_left,expires_at,created_at";
/** l7 (20261127_40): with the wallet, so the page can say which lots are the library assistant's only. */
const LOT_COLUMNS_WALLET = `${LOT_COLUMNS},wallet_scope`;

/**
 * The user's unexpired lots with points, nearest expiry first. Before
 * 20261127_40 runs the wallet column does not exist (42703 / PGRST204): read
 * again without it, so the billing page never fails for it.
 */
async function readLots(rls: SupabaseClient, userId: string) {
  const read = (columns: string) =>
    rls.from("points_lots").select(columns).eq("user_id", userId).gt("points_left", 0).gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: true });
  const first = await read(LOT_COLUMNS_WALLET);
  if (first.error && (first.error.code === "42703" || first.error.code === "PGRST204")) return read(LOT_COLUMNS);
  return first;
}

/**
 * Task F fix round 1: the points each purchase lot credited, by order id —
 * a receipt names what the buyer actually got, not today's top-up grant.
 * Best-effort: any error (or a throw) is an empty map, and the label falls
 * back to the book's. order_id and points_total are granted to authenticated
 * (20261022_20).
 */
async function creditedByOrder(rls: SupabaseClient, userId: string, orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderIds.length === 0) return out;
  try {
    const { data, error } = await rls.from("points_lots").select("order_id,points_total")
      .eq("user_id", userId).eq("source", "purchase").in("order_id", orderIds);
    if (error) { logBillingError(`credited_points:${error.code}`); return out; }
    for (const row of (data ?? []) as Array<{ order_id?: unknown; points_total?: unknown }>) {
      if (typeof row.order_id === "string" && Number.isSafeInteger(row.points_total)) out.set(row.order_id, row.points_total as number);
    }
  } catch (err) { logBillingError(`credited_points_exception:${errorName(err)}`); }
  return out;
}
/**
 * l7: the credit-note number of each reversed order, by order id. Best-effort
 * like creditedByOrder: before 20261127_30 runs (42P01 / PGRST205) or on any
 * error the map is empty and the page simply shows no credit-note link.
 */
async function creditNotesByOrder(client: SupabaseClient, orderIds: string[], userId: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (orderIds.length === 0) return out;
  try {
    let query = client.from("payment_credit_notes").select("order_id,number").in("order_id", orderIds);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) { logBillingError(`credit_notes:${error.code}`); return out; }
    for (const row of (data ?? []) as Array<{ order_id?: unknown; number?: unknown }>) {
      if (typeof row.order_id === "string" && typeof row.number === "string") out.set(row.order_id, row.number);
    }
  } catch (err) { logBillingError(`credit_notes_exception:${errorName(err)}`); }
  return out;
}
const REVERSED = new Set(["refunded", "voided"]);
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
      readLots(rls, userId),
      rls.rpc("points_balance", { p_user: userId }),
    ]);
    const failed = [orders, cards, lots, balance].find(r => r.error);
    if (failed) { logBillingError(failed.error?.code); return unavailable(); }
    if (!Number.isSafeInteger(balance.data) || balance.data < 0) { logBillingError("balance_not_integer"); return unavailable(); }
    const orderRows = (orders.data ?? []) as unknown as BillingOrder[];
    const credited = await creditedByOrder(rls, userId, orderRows.filter(o => o.item_id?.startsWith("topup-")).map(o => o.id));
    const notes = await creditNotesByOrder(rls, orderRows.filter(o => REVERSED.has(o.status)).map(o => o.id), userId);
    const withPoints = orderRows.map(o => {
      const row = credited.has(o.id) ? { ...o, credited_points: credited.get(o.id) } : o;
      return notes.has(o.id) ? { ...row, credit_note_number: notes.get(o.id) } : row;
    });
    return { status: 200, body: { orders: withPoints, cards: cards.data ?? [], lots: (lots.data ?? []) as unknown as BillingLot[], pointsBalance: balance.data } };
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
    // merchant (granted to authenticated): only a platform order is the platform's tax invoice (l7)
    const result = await rls.from("payment_orders").select(`${BILLING_ORDER_COLUMNS},merchant`).eq("id", orderId).eq("user_id", userId).maybeSingle();
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
    const row = result.data as unknown as BillingOrder;
    const credited = row.item_id?.startsWith("topup-") ? await creditedByOrder(rls, userId, [row.id]) : new Map<string, number>();
    const notes = REVERSED.has(row.status) ? await creditNotesByOrder(rls, [row.id], userId) : new Map<string, string>();
    return {
      order: { ...row, last_four: lastFour, ...(credited.has(row.id) ? { credited_points: credited.get(row.id) } : {}), ...(notes.has(row.id) ? { credit_note_number: notes.get(row.id) } : {}) },
      company: company.error ? null : company.data?.value ?? null,
    };
  } catch (err) { logBillingError(`receipt_exception:${errorName(err)}`); return { order: null, company: null, unavailable: true }; }
}

async function readCompany(admin: SupabaseClient): Promise<unknown> {
  const company = await admin.from("platform_settings").select("value").eq("key", "billing_company").maybeSingle();
  if (company.error) { logBillingError(`company:${company.error.code}`); return null; }
  return company.data?.value ?? null;
}

/**
 * l7: an order's credit note. The user's own through his RLS client
 * (`userId` set), or any order's for staff through the service client
 * (`userId` null — the admin page gates with requireStaff first).
 * `missing` = no note yet (or the SQL has not run); `unavailable` = a read error.
 */
export async function readCreditNoteWith(client: SupabaseClient, admin: SupabaseClient, userId: string | null, orderId: string): Promise<{ note: BillingCreditNote | null; company: unknown; unavailable?: boolean }> {
  if (!UUID.test(orderId)) return { note: null, company: null };
  try {
    let query = client.from("payment_credit_notes").select(CREDIT_NOTE_COLUMNS).eq("order_id", orderId);
    if (userId) query = query.eq("user_id", userId);
    const result = await query.maybeSingle();
    if (result.error) {
      // 42P01 / PGRST205: 20261127_30 has not run — no note exists yet, not an outage
      if (result.error.code === "42P01" || result.error.code === "PGRST205") return { note: null, company: null };
      logBillingError(`credit_note:${result.error.code}`);
      return { note: null, company: null, unavailable: true };
    }
    if (!result.data) return { note: null, company: null };
    return { note: result.data as unknown as BillingCreditNote, company: await readCompany(admin) };
  } catch (err) { logBillingError(`credit_note_exception:${errorName(err)}`); return { note: null, company: null, unavailable: true }; }
}

/** l7: any order's invoice for staff (service client; the page gates with requireStaff first). */
export async function readOrderAsStaffWith(admin: SupabaseClient, orderId: string): Promise<{ order: BillingOrder | null; company: unknown; unavailable?: boolean }> {
  if (!UUID.test(orderId)) return { order: null, company: null };
  try {
    const result = await admin.from("payment_orders").select(`${BILLING_ORDER_COLUMNS},merchant,payment_method:metadata->payment_method`).eq("id", orderId).maybeSingle();
    if (result.error) { logBillingError(`staff_receipt:${result.error.code}`); return { order: null, company: null, unavailable: true }; }
    if (!result.data) return { order: null, company: null };
    const { payment_method: method, ...row } = result.data as unknown as BillingOrder & { payment_method?: { last_four?: unknown } | null };
    const lastFour = typeof method?.last_four === "string" && /^\d{4}$/.test(method.last_four) ? method.last_four : null;
    const notes = REVERSED.has(row.status) ? await creditNotesByOrder(admin, [row.id], null) : new Map<string, string>();
    return { order: { ...row, last_four: lastFour, ...(notes.has(row.id) ? { credit_note_number: notes.get(row.id) } : {}) }, company: await readCompany(admin) };
  } catch (err) { logBillingError(`staff_receipt_exception:${errorName(err)}`); return { order: null, company: null, unavailable: true }; }
}
