/**
 * _shared.ts — validation + Postgres-error mapping for `research_items`.
 * ─────────────────────────────────────────────────────────
 * Shared by the routes in this directory (items/route.ts, items/[id]/route.ts)
 * AND imported by the two sibling routes that also insert into
 * `research_items` — research/desktop/route.ts and
 * research/sessions/[id]/items/route.ts — so the title rule lives in exactly
 * one place instead of three copies of the same length check.
 *
 * `research_items` (20260603_phase1_004_community_features.sql) carries no
 * owner column of its own — only `session_id`, a FK to `research_sessions`.
 * Every RLS policy on it (select/insert/update/delete, same migration,
 * lines 610-648) requires
 *   exists (select 1 from research_sessions rs
 *           where rs.id = research_items.session_id and rs.user_id = auth.uid())
 * so the RLS-scoped client from `createClient()` is sufficient on its own for
 * every route here — no explicit ownership query is needed on top of it. An
 * update/delete that does not match a row this caller owns (wrong id, or
 * someone else's item) simply affects 0 rows, and the [id] route reads that
 * as "not found" rather than trusting anything the client claims.
 *
 * `title` (added by 20260906_phase6_settings_out_of_browser.sql) has no
 * length CHECK at the DB layer — the ≤300 cap enforced here is app-level
 * only, per the phase 6 task spec.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is shaped like a Postgres uuid. */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type TitleValidation = { ok: true; value: string } | { ok: false; error: string };

/**
 * `title` is optional everywhere it appears (POST defaults it to `""`, PATCH
 * simply omits the key to leave it unchanged) — `undefined`/`null` are valid
 * and resolve to `""` so callers can always write `updates.title = value`.
 */
export function validateTitle(value: unknown): TitleValidation {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string" || value.length > 300) {
    return { ok: false, error: "العنوان يجب أن يكون نصاً بحد أقصى 300 حرف" };
  }
  return { ok: true, value };
}

/**
 * Postgres error → HTTP status + Arabic message.
 * 23514 CHECK (item_type outside the widened list) · 23503 FK (session_id
 * points nowhere — cannot actually happen through these routes, since none
 * of them let the caller set session_id, but mapped for completeness) ·
 * 42501 RLS denial · 22P02 malformed uuid.
 */
export function dbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23514") return { status: 400, message: "بيانات العنصر غير صالحة." };
  if (code === "23503") return { status: 400, message: "العنصر يشير إلى جلسة غير موجودة." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  if (code === "22P02") return { status: 400, message: "معرّف غير صالح." };
  return { status: 500, message: "تعذّر حفظ العنصر." };
}
