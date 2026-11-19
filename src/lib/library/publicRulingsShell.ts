/**
 * publicRulingsShell.ts — the free rulings of a judicial collection, in the
 * server HTML (owner register 14 item 13 + pending #44, 19 Nov 2026: «Server
 * rendering of ruling pages (title, H1, summary, allowed excerpt) … render the
 * 2 free rulings on the server»).
 *
 * The collection reader (/precedents/[slug]/page.tsx) is a client page behind
 * LibraryGuard: a crawler's HTML held the name and the description only. This
 * loads, with the service role, exactly the items a GUEST's API answer opens —
 * the first `collectionFreeCount(guest probe, total, setting)` of the
 * collection in the API's order (order_index, then id) — and nothing more, so
 * the HTML never holds text a visitor cannot read. The library being closed is
 * the caller's check (loadLibraryDocSeo answers "closed").
 *
 * `publicRulingCards` is pure (node --test); `loadPublicRulingCards` reads.
 */
import { withCleanCardRows } from "./lawSummaryVisibility.ts";
import { collectionFreeCount, type PublicRulingsSetting } from "./publicGuard.ts";

export interface PublicRulingCard {
  id: string;
  /** «مبدأ رقم (3) — المحكمة العليا — 1445/3/2هـ» from the row's own fields. */
  heading: string;
  /** The item's text as plain text (card rows cleaned, markdown marks off). */
  text: string;
}

export interface PublicRulingRow {
  id?: unknown;
  principle_number?: unknown;
  issuing_body?: unknown;
  session_date?: unknown;
  text?: unknown;
}

/** Never more than this many in the HTML, whatever the setting (its validator caps it at 3). */
export const PUBLIC_RULINGS_SHELL_MAX = 3;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function plainText(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/<\/?(?:details|summary)[^>]*>/gi, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The cards of the first `count` rows (the caller orders and counts them as the API does). */
export function publicRulingCards(rows: readonly PublicRulingRow[], count: number): PublicRulingCard[] {
  const n = Math.max(0, Math.min(Math.floor(count), PUBLIC_RULINGS_SHELL_MAX));
  const out: PublicRulingCard[] = [];
  for (const row of rows.slice(0, n)) {
    const text = plainText(withCleanCardRows(str(row.text)));
    const id = str(row.id);
    if (!id || !text) continue;
    const num = str(row.principle_number);
    const heading = [num ? `مبدأ رقم (${num})` : "مبدأ", str(row.issuing_body), str(row.session_date)].filter(Boolean).join(" — ");
    out.push({ id, heading, text });
  }
  return out;
}

/** How many a guest reads in full: the API's own rule (collectionFreeCount), -1 → the shell cap. */
export function guestShellCount(
  access: { freeLimit: number; freeLimitSource?: "override" | "default" },
  total: number,
  rulings: PublicRulingsSetting,
): number {
  const n = collectionFreeCount(access, total, rulings);
  return n === -1 ? Math.min(PUBLIC_RULINGS_SHELL_MAX, Math.max(0, total)) : Math.min(n, PUBLIC_RULINGS_SHELL_MAX);
}
