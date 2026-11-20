/**
 * topUpDraft.ts — the in-tool top-up (owner TODO, TopUpModal row): when an AI
 * tool refuses a run for insufficient points (runCore: 402
 * code "insufficient_points"), the tool's typed input is kept and a top-up
 * modal opens in place (src/components/payments/TopUpModalHost.tsx). After a
 * successful top-up — Moyasar's 3-D Secure leaves the page for
 * /payments/result — the buyer returns to the tool and finds his input still
 * there.
 *
 *   - The draft: the run's input, in sessionStorage under
 *     `nzamy:tool-draft:<tool>` with the time it was saved. It is read back
 *     once when the tool's page mounts (useToolDraft), never after
 *     DRAFT_MAX_AGE_MS (a stale draft is dropped), and cleared as soon as a
 *     run of that tool is accepted (running / done) — never on an error, so
 *     the insufficient-points refusal keeps it.
 *   - The way back: the tool's path in sessionStorage
 *     (`nzamy:topup-return`), shown on /payments/result as «العودة إلى
 *     الأداة» once the payment is confirmed. Only a relative /ai/… path is
 *     accepted (safeToolReturnPath): never another origin, never `//`.
 *     Nothing is added to the payment's callback URL.
 *   - The packs: the top-ups the price book sells to this account type
 *     (buyerAllowed), cheapest first; the prices come from the book, and the
 *     charge (founder discount included) from the server's checkout.
 *
 * Every storage access is wrapped: a private window or blocked storage
 * simply keeps nothing. Pure (storage injected), so `node --test` loads it.
 */

import { buyerAllowed, PAYABLE_ITEMS, type PayableItem } from "./catalog.ts";

export const TOOL_DRAFT_PREFIX = "nzamy:tool-draft:";
export const TOPUP_RETURN_KEY = "nzamy:topup-return";
/** The window event the AI run hook sends on an insufficient-points refusal: detail { tool }. */
export const INSUFFICIENT_POINTS_EVENT = "nzamy:insufficient-points";
export const INSUFFICIENT_POINTS_CODE = "insufficient_points";
/** A draft older than this is dropped (a top-up round trip takes minutes, not hours). */
export const DRAFT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_DRAFT_CHARS = 200_000;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function toolDraftKey(tool: string): string | null {
  return TOOL_ID.test(tool) ? `${TOOL_DRAFT_PREFIX}${tool}` : null;
}

export function saveToolDraft(storage: DraftStorage | null | undefined, tool: string, input: Record<string, unknown>, nowMs: number): boolean {
  const key = toolDraftKey(tool);
  if (!storage || !key || !input || typeof input !== "object" || Array.isArray(input)) return false;
  try {
    const raw = JSON.stringify({ savedAt: nowMs, input });
    if (raw.length > MAX_DRAFT_CHARS) return false;
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function loadToolDraft(storage: DraftStorage | null | undefined, tool: string, nowMs: number): Record<string, unknown> | null {
  const key = toolDraftKey(tool);
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; input?: unknown };
    const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : Number.NaN;
    const input = parsed?.input;
    if (!Number.isFinite(savedAt) || nowMs - savedAt > DRAFT_MAX_AGE_MS || nowMs < savedAt - 60_000) {
      storage.removeItem(key);
      return null;
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    return input as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function clearToolDraft(storage: DraftStorage | null | undefined, tool: string): void {
  const key = toolDraftKey(tool);
  if (!storage || !key) return;
  try {
    storage.removeItem(key);
  } catch {
    // nothing kept, nothing to clear
  }
}

/** A string field of a restored draft, or null. */
export function draftText(input: Record<string, unknown> | null, field: string): string | null {
  const v = input?.[field];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** l11 (T8-Q511a): one of `allowed`, or null — for a select / tab the page restores. */
export function draftChoice<T extends string>(input: Record<string, unknown> | null, field: string, allowed: readonly T[]): T | null {
  const v = input?.[field];
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

/** l11: a list of non-empty strings (at most `max`), or null. */
export function draftTextList(input: Record<string, unknown> | null, field: string, max = 50): string[] | null {
  const v = input?.[field];
  if (!Array.isArray(v)) return null;
  const out = v.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, max);
  return out.length > 0 ? out : null;
}

/** l11: a { key: string } map (a wizard's form fields), or null. Non-string values are dropped. */
export function draftTextMap(input: Record<string, unknown> | null, field: string): Record<string, string> | null {
  const v = input?.[field];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, s] of Object.entries(v as Record<string, unknown>)) if (typeof s === "string") out[k] = s;
  return Object.keys(out).length > 0 ? out : null;
}

/** l11: a list of { key: string } maps (repeated form rows), or null. */
export function draftRows(input: Record<string, unknown> | null, field: string, max = 50): Array<Record<string, string>> | null {
  const v = input?.[field];
  if (!Array.isArray(v)) return null;
  const rows = v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    .slice(0, max)
    .map((r) => {
      const out: Record<string, string> = {};
      for (const [k, s] of Object.entries(r)) if (typeof s === "string") out[k] = s;
      return out;
    });
  return rows.length > 0 ? rows : null;
}

/** Only a relative /ai/… path (letters, digits, - _ / and a query) — never another origin. */
export function safeToolReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  if (!raw.startsWith("/ai/") && raw !== "/ai") return null;
  if (raw.includes("//") || raw.includes("\\") || raw.includes("..")) return null;
  if (!/^\/ai(\/[A-Za-z0-9_\-/]*)?(\?[A-Za-z0-9_\-=&%.]*)?$/.test(raw)) return null;
  return raw;
}

export function saveTopUpReturn(storage: DraftStorage | null | undefined, path: string): boolean {
  const safe = safeToolReturnPath(path);
  if (!storage || !safe) return false;
  try {
    storage.setItem(TOPUP_RETURN_KEY, safe);
    return true;
  } catch {
    return false;
  }
}

export function readTopUpReturn(storage: DraftStorage | null | undefined): string | null {
  if (!storage) return null;
  try {
    return safeToolReturnPath(storage.getItem(TOPUP_RETURN_KEY));
  } catch {
    return null;
  }
}

export function clearTopUpReturn(storage: DraftStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(TOPUP_RETURN_KEY);
  } catch {
    // nothing kept
  }
}

/** The top-ups on sale to `userType` (buyerAllowed), cheapest first. */
export function topUpPacksFor(
  userType: string | null | undefined,
  catalog: Readonly<Record<string, PayableItem>> = PAYABLE_ITEMS,
): PayableItem[] {
  return Object.values(catalog)
    .filter((it) => it.kind === "topup" && it.onSale && typeof it.prices.once === "number" && buyerAllowed(it, userType))
    .sort((a, b) => (a.prices.once ?? 0) - (b.prices.once ?? 0));
}
