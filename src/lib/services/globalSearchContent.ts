/**
 * globalSearchContent.ts — the «من محتواك الشخصي» section of the dashboard
 * search, as pure functions.
 *
 * ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
 *
 * GlobalSearch.tsx used to filter a module-level constant array of three
 * invented rows — a case «قضية الشركة المتحدة ضد محمد العمري», a lease contract
 * and a consultation — and render them as the signed-in account's own content,
 * each linking to `/dashboard/client/{cases,documents,consultations}/{1,2,3}`.
 * Every account saw the same three, and every one of those links drew a
 * fixture. That is UAT-GHOST-001, and owner decision ٤ («كل سطح ثبت أنه يعرض
 * mock أو أرقاماً/أشخاصاً مختلقين يُحجب… الرابط المباشر لا يرسم fixture… build
 * الإنتاج لا يحمل mock قابلاً للوصول») is what forbids it.
 *
 * The section now reads the account's own rows through the two client services
 * that already exist — `documentService.getDocuments()` over `/api/v1/documents`
 * (scoped `eq("owner_user_id", user.id)` in the route, on top of RLS) and
 * `serviceOrders.listMyServiceOrders()` over `/api/v1/service-requests` (RLS +
 * the route's own `requester_user_id` scoping). Neither can return another
 * account's row, so the section cannot either: the two-account property is a
 * property of those endpoints, not of a filter written here that the next
 * change could forget.
 *
 * ── WHY THE MAPPING LIVES HERE AND NOT IN THE COMPONENT ─────────────────────
 *
 * Three decisions in this file are the ones that go wrong silently, and all
 * three are decisions about truth rather than about pixels:
 *
 *   1. A row with no name is dropped, never given one. The old array's whole
 *      defect was a label the account never wrote.
 *   2. A soft-deleted document is not «محتواك» — the bin is a separate screen.
 *   3. `summarisePersonalReads` keeps «تعذّرت القراءة» and «لا توجد نتائج»
 *      apart. This is the same rule as listRead.ts, applied across two
 *      independent reads instead of one: one source failing must not blank the
 *      other, and both failing must never read as "you have nothing".
 *
 * Pure: no React, no fetch, no Supabase. Relative `.ts` imports so `node --test`
 * can load it — same spelling as serviceOrders.ts and listRead.ts.
 */

import { ORDER_STATUS_AR, type ServiceOrder } from "./serviceOrders.ts";

/** One entry of ORDER_STATUS_AR, named so an unknown status can be typed away. */
type OrderStatusLabel = (typeof ORDER_STATUS_AR)[ServiceOrder["status"]];

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonalContentKind = "doc" | "request";

export interface PersonalContentItem {
  /**
   * Stable React key. Prefixed with the kind rather than the bare row id:
   * every document row shares the one vault href, so the href cannot be the
   * key, and documents and requests come from two different tables.
   */
  key: string;
  type: PersonalContentKind;
  /** The account's own text — a file name or a request title. Never invented. */
  label: string;
  /** Arabic type/status line under the label. */
  sub: string;
  href: string;
}

/** The fields this module reads off an `attachments` row (documentService.Document). */
export interface PersonalDocumentRow {
  id: string;
  file_name?: string | null;
  deleted_at?: string | null;
}

/** The fields this module reads off a `service_requests` row (serviceOrders.ServiceOrder). */
export interface PersonalOrderRow {
  id: string;
  title?: string | null;
  status?: string | null;
}

/** One source's outcome, before the two are combined. */
export interface PersonalReadResult {
  ok: boolean;
  items: PersonalContentItem[];
}

export interface PersonalContentSummary {
  /** Every source attempted failed ⇒ the section must say «تعذّرت القراءة». */
  unreadable: boolean;
  /** At least one source answered and at least one did not. */
  partial: boolean;
  items: PersonalContentItem[];
}

/**
 * How many rows the panel shows at once. The overlay is a 600px card with a
 * 60vh scroll region shared with the tools section; an unbounded list pushes
 * the tools off screen on a phone.
 */
export const PERSONAL_CONTENT_VISIBLE_LIMIT = 6;

// ─── Documents destination ────────────────────────────────────────────────────

/**
 * The documents list route for whoever is signed in, taken from the sidebar
 * this account actually has rather than from a `userType → path` table written
 * here. Five sidebars carry one (`client`, `business`, `micro`, `lawyer`,
 * `firm`); `government`, `ngo`, `provider` and `admin` do not.
 *
 * Returning `null` for those four is the point: there is no page to send them
 * to, and a link to a route that does not exist is the same broken promise the
 * mock array made. The caller skips the documents read entirely when this is
 * null — see GlobalSearch.tsx.
 *
 * There is no per-document page anywhere in `src/app` (checked: only
 * `api/v1/documents/[id]`), so every document row links to the list.
 */
export function resolveDocumentsHref(tools: readonly { href?: string | null }[]): string | null {
  for (const tool of tools) {
    const href = tool?.href;
    if (typeof href === "string" && href.endsWith("/documents")) return href;
  }
  return null;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

export function mapDocumentsToContent(
  rows: readonly PersonalDocumentRow[] | null | undefined,
  documentsHref: string | null,
): PersonalContentItem[] {
  if (!documentsHref) return [];
  const items: PersonalContentItem[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row.id !== "string" || row.id === "") continue;
    // The bin has its own screen; a restored-or-not question is not something
    // a search hit can answer, so it is not offered as one.
    if (row.deleted_at) continue;
    const label = (row.file_name ?? "").trim();
    // No name ⇒ no row. Never «مستند بدون اسم» — that is a label the account
    // did not write, which is the whole defect this file exists to close.
    if (!label) continue;
    items.push({
      key: `doc:${row.id}`,
      type: "doc",
      label,
      sub: "مستند",
      href: documentsHref,
    });
  }
  return items;
}

export function mapServiceOrdersToContent(
  rows: readonly PersonalOrderRow[] | null | undefined,
): PersonalContentItem[] {
  const items: PersonalContentItem[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row.id !== "string" || row.id === "") continue;
    const label = (row.title ?? "").trim();
    if (!label) continue;
    // ORDER_STATUS_AR is the one status vocabulary this codebase has; a value
    // outside it (an older row, a future status) drops to the bare «طلب»
    // rather than being printed raw or guessed at.
    const statusKey = typeof row.status === "string" ? row.status : "";
    const status = (ORDER_STATUS_AR as Record<string, OrderStatusLabel | undefined>)[statusKey];
    items.push({
      key: `request:${row.id}`,
      type: "request",
      label,
      sub: status ? `طلب • ${status.label}` : "طلب",
      // A real, auth-scoped route: /ai/orders/[id] loads the row through
      // getServiceOrder() and renders its own «الطلب غير موجود» on a 404, so a
      // stale hit degrades into an honest page rather than a fixture.
      href: `/ai/orders/${encodeURIComponent(row.id)}`,
    });
  }
  return items;
}

// ─── Query matching ───────────────────────────────────────────────────────────

/**
 * Substring match on the label only — the same question the old array asked,
 * and the same text `<Highlight>` marks up. Matching `sub` too would make
 * typing «طلب» list every request with nothing highlighted.
 *
 * An empty query is not "no results": it is the section's recent list.
 */
export function matchPersonalContent(
  items: readonly PersonalContentItem[],
  query: string,
  limit: number = PERSONAL_CONTENT_VISIBLE_LIMIT,
): PersonalContentItem[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? items.filter((item) => item.label.toLowerCase().includes(needle))
    : [...items];
  return limit >= 0 ? matched.slice(0, limit) : matched;
}

// ─── Failure vs emptiness ─────────────────────────────────────────────────────

/**
 * Combine the independent reads without letting a failure turn into a fact.
 *
 * `unreadable` is deliberately "every attempted read failed", not "any read
 * failed": a client whose documents load and whose requests do not should see
 * the documents, plus a plain note that part of the section is missing —
 * blanking the section would hide rows we successfully read, and showing it
 * silently would claim the missing ones do not exist.
 */
export function summarisePersonalReads(
  reads: readonly PersonalReadResult[],
): PersonalContentSummary {
  const attempted = reads.length;
  const failed = reads.reduce((n, read) => (read.ok ? n : n + 1), 0);
  const items: PersonalContentItem[] = [];
  for (const read of reads) {
    if (read.ok) items.push(...read.items);
  }
  return {
    unreadable: attempted > 0 && failed === attempted,
    partial: failed > 0 && failed < attempted,
    items,
  };
}
