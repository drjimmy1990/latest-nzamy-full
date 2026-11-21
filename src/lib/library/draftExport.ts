/**
 * draftExport.ts — L2 (owner file 03, batch l12): the pure half of the draft's
 * «تنزيل Word» and «مشاركة», and the admin limits both obey.
 *
 * His rules (file 03 ل2 «ضوابط»), each in one place here:
 *   - the Word file carries the «استرشادي» header, the source of every text and
 *     the download date (draftDocBlocks);
 *   - the Word download counts in the read limit as a full open, and the whole
 *     draft counts ONCE (answer أ): one quota document per draft and Riyadh
 *     day (draftDocKey), the same row the five-file refund rule reads (ب);
 *   - the texts are re-read by the server for the viewer's own entitlement —
 *     the cart's text is never written into the file for a law article; a
 *     locked article gives its title and a line saying the text is for
 *     subscribers (the route, POST /api/library/draft-export);
 *   - «نسخ المسودة كاملة» and the Word file stop at an admin cap, and a share
 *     carries the title, a short excerpt and the page link only (ج):
 *     platform_settings.library_draft_limits (parseDraftLimits).
 *
 * Pure: no I/O, relative imports only — `node --test` loads it.
 */
import { stripCitationMarkers } from "../ai/citationMarkers.ts";
import type { DocBlock } from "../docx/ooxml.ts";

// ─── the admin limits (answer ج) ──────────────────────────────────────────────

export const DRAFT_LIMITS_SETTING = "library_draft_limits";

export interface DraftLimits {
  /** Items one copy-all or one Word file may hold. */
  maxItems: number;
  /** Characters of the excerpt a share carries (title and link come on top). */
  shareExcerptChars: number;
}

export const DRAFT_LIMITS_DEFAULT: Readonly<DraftLimits> = Object.freeze({ maxItems: 30, shareExcerptChars: 200 });
export const DRAFT_MAX_ITEMS_RANGE = Object.freeze({ min: 1, max: 200 });
export const DRAFT_EXCERPT_RANGE = Object.freeze({ min: 50, max: 500 });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intIn = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** The stored value, field by field; a missing or bad field takes its default. Never throws. */
export function parseDraftLimits(value: unknown): DraftLimits {
  const v = isObj(value) ? value : {};
  return {
    maxItems: intIn(v.max_items, DRAFT_MAX_ITEMS_RANGE.min, DRAFT_MAX_ITEMS_RANGE.max) ?? DRAFT_LIMITS_DEFAULT.maxItems,
    shareExcerptChars:
      intIn(v.share_excerpt_chars, DRAFT_EXCERPT_RANGE.min, DRAFT_EXCERPT_RANGE.max) ?? DRAFT_LIMITS_DEFAULT.shareExcerptChars,
  };
}

/** PATCH /api/v1/admin/settings validator: null = acceptable. */
export function draftLimitsIssue(value: unknown): string | null {
  if (!isObj(value)) return 'قيمة library_draft_limits يجب أن تكون كائناً بالشكل {"max_items":30,"share_excerpt_chars":200}';
  const extra = Object.keys(value).filter((k) => k !== "max_items" && k !== "share_excerpt_chars");
  if (extra.length) return `مفاتيح غير معروفة في library_draft_limits: ${extra.join(", ")}`;
  if (intIn(value.max_items, DRAFT_MAX_ITEMS_RANGE.min, DRAFT_MAX_ITEMS_RANGE.max) === null) {
    return `max_items عدد صحيح من ${DRAFT_MAX_ITEMS_RANGE.min} إلى ${DRAFT_MAX_ITEMS_RANGE.max}`;
  }
  if (intIn(value.share_excerpt_chars, DRAFT_EXCERPT_RANGE.min, DRAFT_EXCERPT_RANGE.max) === null) {
    return `share_excerpt_chars عدد صحيح من ${DRAFT_EXCERPT_RANGE.min} إلى ${DRAFT_EXCERPT_RANGE.max}`;
  }
  return null;
}

// ─── the request ─────────────────────────────────────────────────────────────

/** One cart entry as the drawer sends it. `text` is read only where the route says so. */
export interface DraftExportItem {
  articleId: string;
  lawSlug: string;
  lawName: string;
  /** «المادة ٧٧» / «الصفحة ٣» / «المبدأ ١٢». */
  label: string;
  title: string;
  withArticle: boolean;
  withExecReg: boolean;
  /** The cart's own text: used only for an item that is not a law article, and only for a full subscriber. */
  text: string;
}

const ID_RE = /^[\p{L}\p{N}_.:\-/]{1,200}$/u;
const TEXT_MAX = 20_000;
const SHORT_MAX = 300;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export type ParsedDraftExport =
  | { ok: true; items: DraftExportItem[] }
  | { ok: false; status: 400 | 413; error: string };

/** The body `{ items: [...] }`: shapes checked, ids bounded, never more than the admin cap. */
export function parseDraftExportBody(json: unknown, limits: DraftLimits): ParsedDraftExport {
  const raw = isObj(json) && Array.isArray(json.items) ? json.items : null;
  if (!raw || raw.length === 0) return { ok: false, status: 400, error: "المسودة فارغة" };
  if (raw.length > limits.maxItems) {
    return { ok: false, status: 413, error: `يتسع ملف Word لـ ${limits.maxItems} عنصراً على الأكثر؛ حدّد بعض العناصر ثم نزّلها` };
  }
  const items: DraftExportItem[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isObj(r)) return { ok: false, status: 400, error: "عنصر غير صالح في المسودة" };
    const articleId = str(r.articleId, 201).trim();
    const lawSlug = str(r.lawSlug, 201).trim();
    if (!ID_RE.test(articleId) || !ID_RE.test(lawSlug)) return { ok: false, status: 400, error: "عنصر غير صالح في المسودة" };
    const key = `${lawSlug}\u0000${articleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      articleId,
      lawSlug,
      lawName: str(r.lawName, SHORT_MAX).trim(),
      label: str(r.label, SHORT_MAX).trim(),
      title: str(r.title, SHORT_MAX).trim(),
      withArticle: r.withArticle === true,
      withExecReg: r.withExecReg === true,
      text: str(r.text, TEXT_MAX),
    });
  }
  return { ok: true, items };
}

/**
 * The quota document of one download (answer أ: the whole draft counts once).
 * Stable for the same set of items whatever their order, so downloading the
 * same draft again the same day is not a second document; a changed draft is.
 * FNV-1a over the sorted keys, two 32-bit lanes → 16 hex characters.
 */
export function draftDocKey(items: ReadonlyArray<Pick<DraftExportItem, "lawSlug" | "articleId" | "withArticle" | "withExecReg">>): string {
  const keys = items
    .map((i) => `${i.lawSlug}|${i.articleId}|${i.withArticle ? 1 : 0}${i.withExecReg ? 1 : 0}`)
    .sort()
    .join("\n");
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ keys.length;
  for (let i = 0; i < keys.length; i += 1) {
    const c = keys.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return `draft:${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

// ─── the Word file ───────────────────────────────────────────────────────────

/** One item as the server resolved it. `text` null = locked for this viewer (title only). */
export interface ResolvedDraftEntry {
  lawName: string;
  lawSlug: string;
  label: string;
  title: string;
  /** Full text, or null when the viewer may not have it. */
  text: string | null;
  execReg: { ref: string; text: string } | null;
  /** «النص الرسمي» (re-read by the server) or «من المسودة» (a subscriber's own cart text, not a law article). */
  source: "library" | "cart";
}

export const DRAFT_DOC_TITLE = "مسودة التجميع — مكتبة نظامي";
export const DRAFT_GUIDANCE_LINE = "استرشادي: هذا الملف للاطلاع والبحث، والمرجع عند الاختلاف هو النص الرسمي المنشور.";
export const DRAFT_LOCKED_LINE = "النص الكامل لهذه المادة متاح لمشتركي باقة المكتبة.";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (s: string): string => s.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);

/** «٢٠٢٦/١١/٢١» in Riyadh time, from the server clock. */
export function riyadhDateAr(now: Date): string {
  const r = new Date(now.getTime() + 3 * 3600 * 1000);
  const y = r.getUTCFullYear();
  const m = String(r.getUTCMonth() + 1).padStart(2, "0");
  const d = String(r.getUTCDate()).padStart(2, "0");
  return ar(`${y}/${m}/${d}`);
}

function textParas(text: string): DocBlock[] {
  return stripCitationMarkers(text)
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/\*\*([^*]+)\*\*/g, "$1").trim())
    .filter(Boolean)
    .map((t) => ({ kind: "para", text: t }) as DocBlock);
}

/**
 * The document body: the «استرشادي» header and the download date first, then
 * one heading per law (in the cart's order), and under it each item with its
 * label, its text (or the locked line), its regulation and its source line.
 */
export function draftDocBlocks(entries: ReadonlyArray<ResolvedDraftEntry>, now: Date, siteOrigin: string): DocBlock[] {
  const blocks: DocBlock[] = [
    { kind: "title", text: DRAFT_DOC_TITLE },
    { kind: "para", text: DRAFT_GUIDANCE_LINE },
    { kind: "para", text: `تاريخ التنزيل: ${riyadhDateAr(now)}` },
  ];
  const order: string[] = [];
  const byLaw = new Map<string, ResolvedDraftEntry[]>();
  for (const e of entries) {
    const k = e.lawName || e.lawSlug;
    if (!byLaw.has(k)) {
      byLaw.set(k, []);
      order.push(k);
    }
    byLaw.get(k)!.push(e);
  }
  const origin = siteOrigin.replace(/\/+$/, "");
  for (const k of order) {
    blocks.push({ kind: "heading", text: k });
    for (const e of byLaw.get(k)!) {
      const head = [e.label, e.title && e.title !== e.label ? e.title : ""].filter(Boolean).join(" — ");
      if (head) blocks.push({ kind: "heading", text: head });
      if (e.text === null) blocks.push({ kind: "para", text: DRAFT_LOCKED_LINE });
      else if (e.text.trim()) blocks.push(...textParas(e.text));
      if (e.execReg && e.execReg.text.trim()) {
        blocks.push({ kind: "para", text: e.execReg.ref ? `اللائحة: ${e.execReg.ref}` : "اللائحة التنفيذية" });
        blocks.push(...textParas(e.execReg.text));
      }
      const where = `${origin}/laws/${e.lawSlug.split("/").map(encodeURIComponent).join("/")}`;
      blocks.push({ kind: "para", text: `المصدر: ${[e.lawName, e.label].filter(Boolean).join(" — ")} — ${where}` });
    }
  }
  return blocks;
}

// ─── the share (answer ج: title + short excerpt + link, never the full text) ─

/** At most `max` characters of the text, cut at a word, with «…» when cut. */
export function shareExcerpt(text: string, max: number): string {
  const clean = stripCitationMarkers(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(max * 0.6)) cut = cut.slice(0, space);
  return `${cut.replace(/[\s،,.؛:]+$/u, "")}…`;
}

/** The page of a cart entry: `/laws/<slug>` (a royal order's slug is already `orders/<id>`). */
export function draftEntryPath(lawSlug: string): string {
  return `/laws/${lawSlug.split("/").map(encodeURIComponent).join("/")}`;
}

/** The message a share sends: title, excerpt, link — three lines, nothing else. */
export function draftShareMessage(input: { title: string; text: string; url: string }, limits: DraftLimits): string {
  const excerpt = input.text ? shareExcerpt(input.text, limits.shareExcerptChars) : "";
  return [input.title.trim(), excerpt, input.url].filter(Boolean).join("\n");
}

/** The three share targets. Only the message (already title + excerpt + link) and the link travel. */
export function draftShareLinks(message: string, url: string): { whatsapp: string; x: string; linkedin: string } {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    x: `https://x.com/intent/post?text=${encodeURIComponent(message)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  };
}

/** The text «نسخ المسودة كاملة» copies stops at the admin cap of items; the rest is named, not dropped silently. */
export function capForCopy<T>(entries: ReadonlyArray<T>, limits: DraftLimits): { kept: T[]; left: number } {
  return { kept: entries.slice(0, limits.maxItems), left: Math.max(0, entries.length - limits.maxItems) };
}
