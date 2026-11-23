/**
 * caseFreeBoard.ts — the free board of a case («لوحة», owner ١٨٩ (ب), batch
 * l13): its shape, its limits and the check every save goes through.
 *
 * One board per case (public.case_free_boards, 20261203_60): cards — a title,
 * a text, a colour and a position — and the lines that connect two cards.
 * Nothing on it is generated: every card is typed by a person on the case.
 *
 * Pure and import-free on purpose: the API route checks a save with it, the
 * board component builds its payload with it, and `node --test` loads it.
 */

export const FREE_BOARD_COLORS = ["amber", "emerald", "sky", "rose", "violet", "slate"] as const;
export type FreeBoardColor = (typeof FREE_BOARD_COLORS)[number];

/** Arabic names of the colours, for the colour buttons' accessible labels. */
export const FREE_BOARD_COLOR_LABELS: Record<FreeBoardColor, string> = {
  amber: "كهرماني",
  emerald: "أخضر",
  sky: "أزرق",
  rose: "وردي",
  violet: "بنفسجي",
  slate: "رمادي",
};

export const FREE_BOARD_LIMITS = {
  cards: 300,
  links: 600,
  title: 120,
  text: 2000,
  /** a card's position is kept within ±coord on both axes */
  coord: 20000,
  /** the whole board as UTF-8 JSON — under the database's 1 MB check (20261203_60) */
  bytes: 900_000,
} as const;

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

function utf8Bytes(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return s.length * 3;
}

export interface FreeCard {
  id: string;
  title: string;
  text: string;
  color: FreeBoardColor;
  x: number;
  y: number;
}

export interface FreeLink {
  id: string;
  from: string;
  to: string;
}

export interface FreeBoardPayload {
  cards: FreeCard[];
  links: FreeLink[];
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isFreeBoardColor(v: unknown): v is FreeBoardColor {
  return typeof v === "string" && (FREE_BOARD_COLORS as readonly string[]).includes(v);
}

function coord(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const c = FREE_BOARD_LIMITS.coord;
  return Math.round(Math.min(c, Math.max(-c, v)));
}

export type CheckResult = { ok: true; board: FreeBoardPayload } | { ok: false; error: string };

/**
 * A board as sent by a client → the board that is stored, or why it is refused.
 *
 * Refused (the message is shown to the lawyer): not two lists, too many cards
 * or lines, a card without a valid id, two cards with one id, an unknown
 * colour, a title or text over its limit, a position that is not a number.
 * Normalised silently: positions rounded and kept on the board; a line that
 * points at a missing card, joins a card to itself, or repeats another line
 * (either direction) is dropped — the board's own state after a delete.
 */
export function checkFreeBoard(input: unknown): CheckResult {
  const body = input as { cards?: unknown; links?: unknown } | null;
  if (!body || typeof body !== "object" || !Array.isArray(body.cards) || !Array.isArray(body.links)) {
    return { ok: false, error: "صيغة اللوحة غير صحيحة." };
  }
  const L = FREE_BOARD_LIMITS;
  if (body.cards.length > L.cards) return { ok: false, error: `اللوحة تتسع لـ ${ar(L.cards)} بطاقة على الأكثر.` };
  if (body.links.length > L.links) return { ok: false, error: `اللوحة تتسع لـ ${ar(L.links)} خط على الأكثر.` };

  const cards: FreeCard[] = [];
  const ids = new Set<string>();
  for (const raw of body.cards) {
    const c = raw as Partial<Record<keyof FreeCard, unknown>> | null;
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !ID_RE.test(c.id)) {
      return { ok: false, error: "تعذّر حفظ إحدى البطاقات. أعد تحميل الصفحة وحاول مرة أخرى." };
    }
    if (ids.has(c.id)) return { ok: false, error: "تعذّر حفظ اللوحة: بطاقتان متطابقتان. أعد تحميل الصفحة وحاول مرة أخرى." };
    const title = typeof c.title === "string" ? c.title : "";
    const text = typeof c.text === "string" ? c.text : "";
    if (title.length > L.title) return { ok: false, error: `عنوان البطاقة حتى ${ar(L.title)} حرفًا.` };
    if (text.length > L.text) return { ok: false, error: `نص البطاقة حتى ${ar(L.text)} حرف.` };
    if (!isFreeBoardColor(c.color)) return { ok: false, error: "لون البطاقة غير معروف." };
    const x = coord(c.x);
    const y = coord(c.y);
    if (x === null || y === null) return { ok: false, error: "موضع البطاقة غير صحيح." };
    ids.add(c.id);
    cards.push({ id: c.id, title, text, color: c.color, x, y });
  }

  const links: FreeLink[] = [];
  const seenLinkIds = new Set<string>();
  const seenPairs = new Set<string>();
  for (const raw of body.links) {
    const l = raw as Partial<Record<keyof FreeLink, unknown>> | null;
    if (!l || typeof l !== "object" || typeof l.id !== "string" || !ID_RE.test(l.id)) continue;
    if (typeof l.from !== "string" || typeof l.to !== "string") continue;
    if (l.from === l.to || !ids.has(l.from) || !ids.has(l.to)) continue;
    const pair = l.from < l.to ? `${l.from}|${l.to}` : `${l.to}|${l.from}`;
    if (seenPairs.has(pair) || seenLinkIds.has(l.id)) continue;
    seenPairs.add(pair);
    seenLinkIds.add(l.id);
    links.push({ id: l.id, from: l.from, to: l.to });
  }
  if (utf8Bytes(JSON.stringify({ cards, links })) > L.bytes) {
    return { ok: false, error: "امتلأت اللوحة: اختصر نصوص بعض البطاقات أو احذف بعضها ثم تُحفظ." };
  }
  return { ok: true, board: { cards, links } };
}

/** A fresh id for a card or a line (letters, digits, `-`): unique enough within one board. */
export function newFreeBoardId(prefix: "c" | "l"): string {
  const rnd = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${rnd}`;
}

/** The colours drawn for each card colour — a strong edge and a soft fill, per theme. */
export const FREE_BOARD_PALETTE: Record<FreeBoardColor, { edge: string; light: string; dark: string }> = {
  amber:   { edge: "#d97706", light: "#fffbeb", dark: "#2a2114" },
  emerald: { edge: "#059669", light: "#ecfdf5", dark: "#12261f" },
  sky:     { edge: "#0284c7", light: "#f0f9ff", dark: "#11202b" },
  rose:    { edge: "#e11d48", light: "#fff1f2", dark: "#2a1419" },
  violet:  { edge: "#7c3aed", light: "#f5f3ff", dark: "#1f172e" },
  slate:   { edge: "#64748b", light: "#f8fafc", dark: "#1c1f24" },
};
