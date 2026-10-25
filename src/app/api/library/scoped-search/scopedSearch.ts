/**
 * POST /api/library/scoped-search — the pure half (N2.6): the request rules
 * and the paywall shaping of each hit. route.ts reads the database.
 *
 * THE SCOPE. `scope` names the document the reader has open:
 *   law:<slug>          one law (its articles; the merged regulation text is
 *                        in articles.fts, so a hit there belongs to the law);
 *   collection:<id>     one judicial collection — the route widens it to every
 *                        volume of its tagged series (precedentVolumes.ts);
 *   book:<id>           one fiqh book volume — widened to its series
 *                        (bookVolumes.ts).
 * The client names the volume it has open, never a series title or a list of
 * ids: the series is resolved on the server from the catalogue.
 *
 * THE PAYWALL is the global search's (src/app/api/library/search/route.ts),
 * item for item:
 *   - articles: free when isFreeLibraryItem('laws', law slug) — a locked hit
 *     gets the article's OPENING, 100 characters, never centred on the query;
 *   - principles: free when isFreeLibraryItem('principles', id) — the same
 *     100-character opening when locked;
 *   - fiqh blocks: free when hasFullAccess or listed in free items — a locked
 *     hit carries its place and NO text (owner ١٨٣).
 * A free hit gets the 200-character highlighted snippet AND its full text
 * (`body`) — the same text the reader routes already give that viewer — so
 * the panel can stack it, copy it with its citation and add it to the draft.
 * A locked hit never carries `body`.
 *
 * Pure: node --test loads it (scopedSearch.test.ts).
 */

import { articleDisplayLabel } from "../laws/[slug]/_article-label.ts";
import { truncateWithHighlight } from "../search/snippet.ts";
import { formatLocator } from "../../../book/[slug]/_locator.ts";

export const SCOPED_KINDS = ["law", "collection", "book"] as const;
export type ScopedKind = (typeof SCOPED_KINDS)[number];

/** The longest scope id accepted (book ids are Arabic file names, ≤ 100 in the table). */
export const SCOPE_ID_MAX = 200;
/** The longest query accepted: parseSearchQuery's own budget is far below this. */
export const SCOPED_QUERY_MAX = 300;
export const SCOPED_DEFAULT_LIMIT = 20;
export const SCOPED_MAX_LIMIT = 50;
/** No window past the first 1,000 hits (as the global search's single sections). */
export const SCOPED_MAX_DEPTH = 1000;

export interface ScopedRequest {
  kind: ScopedKind;
  id: string;
  query: string;
  page: number;
  limit: number;
}

export type ScopedRequestResult =
  | { ok: true; request: ScopedRequest }
  | { ok: false; code: string; error: string };

const CONTROL = /[\u0000-\u001f\u007f]/;

export function validateScopedRequest(value: unknown): ScopedRequestResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "invalid_request", error: "جسم الطلب يجب أن يكون كائناً." };
  }
  const body = value as Record<string, unknown>;

  if (typeof body.scope !== "string" || body.scope.length > SCOPE_ID_MAX + 20) {
    return { ok: false, code: "invalid_scope", error: "نطاق البحث غير صالح." };
  }
  const m = /^(law|collection|book):([\s\S]+)$/.exec(body.scope);
  if (!m) return { ok: false, code: "invalid_scope", error: "نطاق البحث غير صالح." };
  const kind = m[1] as ScopedKind;
  // Book ids are Arabic file names: one Unicode form (NFC), as the catalogue stores them.
  const id = m[2].normalize("NFC").trim();
  if (!id || id.length > SCOPE_ID_MAX || CONTROL.test(id)) {
    return { ok: false, code: "invalid_scope", error: "نطاق البحث غير صالح." };
  }

  if (typeof body.query !== "string") {
    return { ok: false, code: "invalid_query", error: "نص البحث (query) يجب أن يكون نصاً." };
  }
  const query = body.query.trim();
  if (query.length < 2) {
    return { ok: false, code: "query_too_short", error: "اكتب حرفين على الأقل للبحث." };
  }
  if (query.length > SCOPED_QUERY_MAX) {
    return { ok: false, code: "query_too_long", error: `نص البحث أطول من ${SCOPED_QUERY_MAX} حرف. اختصره.` };
  }

  const page = body.page === undefined ? 1 : body.page;
  if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1) {
    return { ok: false, code: "invalid_page", error: "رقم الصفحة (page) يجب أن يكون عدداً صحيحاً موجباً." };
  }
  const limit = body.limit === undefined ? SCOPED_DEFAULT_LIMIT : body.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > SCOPED_MAX_LIMIT) {
    return { ok: false, code: "invalid_limit", error: `عدد النتائج (limit) بين 1 و${SCOPED_MAX_LIMIT}.` };
  }
  if ((page - 1) * limit + limit > SCOPED_MAX_DEPTH) {
    return {
      ok: false,
      code: "page_too_deep",
      error: `لا يمكن عرض ما بعد أول ${SCOPED_MAX_DEPTH} نتيجة. أضف كلمات أدق لتضييق البحث.`,
    };
  }
  return { ok: true, request: { kind, id, query, page, limit } };
}

/** One volume of the scope, in reading order. */
export interface ScopeVolume {
  id: string;
  /** «المجلد 3» / «الجزء 4»; null for a document that stands alone. */
  label: string | null;
}

export interface ViewerAccess {
  hasFullAccess: boolean;
  whitelistedSlugs: string[];
  freeItemsByType: Record<string, unknown>;
  /** isFreeLibraryItem bound to this viewer (injected: it lives in an "@/…" module). */
  isFree: (contentType: "laws" | "principles", itemId: string) => boolean;
}

export interface ArticleBody {
  title: string | null;
  text: string;
  /** The merged executive regulation's text under this article, when any. */
  regulation: string | null;
}

export interface PrincipleBody {
  reference: string | null;
  text: string;
  rulingBasis: string | null;
  facts: string | null;
  reasons: string | null;
  ruling: string | null;
}

export interface BlockBody {
  matn: string;
  sharh: string;
  hashiyah: string[];
}

export interface ScopedHit {
  id: string;
  kind: "article" | "principle" | "block";
  volumeId: string;
  volumeLabel: string | null;
  /** The location badge: «المادة 12», «المجلد 4 — مبدأ رقم 118», «الجزء 4 — المجلد 4 — الصفحة 218». */
  place: string;
  locked: boolean;
  snippet: string;
  /** Public place fields the citation needs. */
  meta: Record<string, string | number | null>;
  body: ArticleBody | PrincipleBody | BlockBody | null;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null => {
  const s = str(v).trim();
  return s ? s : null;
};
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** feqh_blocks.hashiyah is jsonb: an array of notes, one string, or nothing. */
export function hashiyahNotes(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).map((s) => s.trim()).filter(Boolean);
  const s = str(v).trim();
  return s ? [s] : [];
}

function volumeLabelOf(volumes: readonly ScopeVolume[], id: string): string | null {
  return volumes.find((v) => v.id === id)?.label ?? null;
}

export function shapeHit(
  kind: ScopedKind,
  row: Row,
  volumes: readonly ScopeVolume[],
  terms: string[],
  access: ViewerAccess,
): ScopedHit {
  const id = str(row.id);
  const volumeId = str(row.volume_id);
  const volumeLabel = volumeLabelOf(volumes, volumeId);
  const snippetLen = (isFree: boolean) => (isFree ? 200 : 100);

  if (kind === "law") {
    const isFree = access.isFree("laws", volumeId);
    const label = articleDisplayLabel(row.number_text as string | null, row.number as string | null);
    const text = str(row.text) || str(row.original_text);
    return {
      id,
      kind: "article",
      volumeId,
      volumeLabel,
      place: label || "مادة",
      locked: !isFree,
      // A locked hit shows the article's opening, never a window on the query.
      snippet: truncateWithHighlight(text, isFree ? terms : [], snippetLen(isFree)),
      meta: {
        number: strOrNull(row.number),
        numberText: strOrNull(row.number_text),
        status: strOrNull(row.status),
      },
      body: isFree
        ? { title: strOrNull(row.title), text, regulation: strOrNull(row.executive_reg_text) }
        : null,
    };
  }

  if (kind === "collection") {
    const isFree = access.isFree("principles", id);
    const number = strOrNull(row.principle_number);
    return {
      id,
      kind: "principle",
      volumeId,
      volumeLabel,
      place: [volumeLabel, number ? `مبدأ رقم ${number}` : "مبدأ"].filter(Boolean).join(" — "),
      locked: !isFree,
      snippet: truncateWithHighlight(str(row.text), isFree ? terms : [], snippetLen(isFree)),
      meta: {
        principleNumber: number,
        issuingBody: strOrNull(row.issuing_body),
        sessionDate: strOrNull(row.session_date),
        decisionNumber: strOrNull(row.decision_number),
        yearHijri: numOrNull(row.year_hijri),
      },
      body: isFree
        ? {
            reference: strOrNull(row.reference),
            text: str(row.text),
            rulingBasis: strOrNull(row.ruling_basis),
            facts: strOrNull(row.facts),
            reasons: strOrNull(row.reasons),
            ruling: strOrNull(row.ruling),
          }
        : null,
    };
  }

  // book
  const freeFeqh = Array.isArray(access.freeItemsByType.feqh) ? (access.freeItemsByType.feqh as unknown[]) : [];
  const isFree = access.hasFullAccess || freeFeqh.includes(id);
  const locator = formatLocator(
    {
      vol: numOrNull(row.volume_number),
      page: numOrNull(row.page_number),
      volLabel: strOrNull(row.volume_label),
      pageLabel: strOrNull(row.page_label),
    },
    true,
    "long",
  );
  return {
    id,
    kind: "block",
    volumeId,
    volumeLabel,
    place: [volumeLabel, locator].filter(Boolean).join(" — ") || "موضع غير مرقّم",
    locked: !isFree,
    // Owner ١٨٣: a locked fiqh hit carries its place and no text at all.
    snippet: isFree ? truncateWithHighlight(str(row.sharh) || str(row.matn), terms, snippetLen(true)) : "",
    meta: {
      topic: strOrNull(row.topic),
      chapter: strOrNull(row.chapter_title),
      section: strOrNull(row.section_title),
      vol: numOrNull(row.volume_number),
      page: numOrNull(row.page_number),
      volLabel: strOrNull(row.volume_label),
      pageLabel: strOrNull(row.page_label),
    },
    body: isFree ? { matn: str(row.matn), sharh: str(row.sharh), hashiyah: hashiyahNotes(row.hashiyah) } : null,
  };
}
