/**
 * PUT /api/v1/drafts/cart — the rows a cart replacement inserts, validated.
 * Pure, so it is unit-tested (the route imports next/server).
 *
 * public.law_draft_carts (production schema 2026-10-10) has: user_id,
 * law_slug, article_number, article_text, is_exec_reg_added, exec_reg_text,
 * position, metadata, payload — and NO `article_title`. The route used to
 * write `article_title`, so every save failed with 42703 (verified on
 * production 2026-10-16), and because it deleted the old cart FIRST, every
 * save also emptied the user's cart. The title lives inside `payload` (the
 * full CartEntry), which is what the client reads back.
 */

export const MAX_CART_ITEMS = 200;
/** One CartEntry carries the article text and its picked principles. */
export const MAX_PAYLOAD_CHARS = 200_000;
const MAX_SLUG = 300;
const MAX_ARTICLE_NUMBER = 60;

export type CartRow = {
  user_id: string;
  law_slug: string;
  article_number: string;
  position: number;
  payload: Record<string, unknown> | null;
};

export type BuiltCartRows = { ok: true; rows: CartRow[] } | { ok: false; error: string };

export function buildCartRows(userId: string, items: unknown): BuiltCartRows {
  if (!Array.isArray(items)) return { ok: false, error: "items must be an array" };
  if (items.length > MAX_CART_ITEMS) return { ok: false, error: `the cart holds at most ${MAX_CART_ITEMS} articles` };

  const rows: CartRow[] = [];
  // One row per article: the upsert key is (user_id, law_slug, article_number),
  // and one statement cannot touch the same key twice. The first occurrence
  // keeps its place; a later duplicate is dropped.
  const seen = new Set<string>();
  for (const [i, raw] of items.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: `item ${i} is not an object` };
    const item = raw as Record<string, unknown>;

    const slug = typeof item.law_slug === "string" ? item.law_slug.trim() : "";
    if (!slug || slug.length > MAX_SLUG) return { ok: false, error: `item ${i}: law_slug is required` };

    const num = typeof item.article_number === "number" ? String(item.article_number)
      : typeof item.article_number === "string" ? item.article_number.trim() : "";
    if (!num || num.length > MAX_ARTICLE_NUMBER) return { ok: false, error: `item ${i}: article_number is required` };

    let payload: Record<string, unknown> | null = null;
    if (item.payload !== undefined && item.payload !== null) {
      if (typeof item.payload !== "object" || Array.isArray(item.payload)) {
        return { ok: false, error: `item ${i}: payload must be an object` };
      }
      if (JSON.stringify(item.payload).length > MAX_PAYLOAD_CHARS) {
        return { ok: false, error: `item ${i}: payload is too large` };
      }
      payload = item.payload as Record<string, unknown>;
    }

    const key = `${slug}\u0000${num}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ user_id: userId, law_slug: slug, article_number: num, position: rows.length, payload });
  }
  return { ok: true, rows };
}
