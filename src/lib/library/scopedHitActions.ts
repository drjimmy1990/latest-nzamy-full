/**
 * What «📋 نسخ النص بالتوثيق» and «➕ إضافة لمسودة التجميع» do with one hit of
 * the in-document search (N2.6). Each kind follows the reader it comes from:
 *
 *   article   — the law reader's citation (buildCitation, _citation.ts):
 *               «المادة (…) من نظام (…) ونصه:» + “text”; the cart entry has
 *               the law reader's shape (the article's own id, its label);
 *   principle — the collection reader's: the principle text, then
 *               «المرجع: …» — the source's reference line when it has one,
 *               else «مبدأ رقم (N)، صادر عن (court) … - المنشور في (title)،
 *               المجلد N»; the cart entry is the one that reader adds;
 *   block     — the book reader's: «الموضع من كتاب (title - ج 4، ص 218):»,
 *               the layers, then «المرجعية: author، title، locator».
 *
 * Only an unlocked hit (one that carries `body`) can be copied or added: a
 * locked hit returns null.
 *
 * Pure: node --test loads it (scopedHitActions.test.ts).
 */

import { buildCitation } from "../../app/laws/[slug]/_citation.ts";
import { cleanPrincipleText } from "../../app/precedents/[slug]/_principle-text.ts";
import { formatLocator } from "../../app/book/[slug]/_locator.ts";
import type { ArticleBody, BlockBody, PrincipleBody, ScopedHit } from "../../app/api/library/scoped-search/scopedSearch.ts";
import type { CartEntry } from "../../components/laws/DraftDrawer.tsx";

/** What the route returns as `scope`. */
export interface ScopeInfo {
  kind: "law" | "collection" | "book";
  id: string;
  title: string;
  /** Law type / collection court / book author. */
  detail: string | null;
  volumes: Array<{ id: string; label: string | null }>;
}

export interface CopyText {
  plain: string;
  html: string;
}

/** The cart's server key holds at most 60 characters (drafts/cart/_cartRows.ts). */
const CART_NUMBER_MAX = 60;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stripMd = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
const meta = (hit: ScopedHit, key: string): string => {
  const v = hit.meta[key];
  return v === null || v === undefined ? "" : String(v);
};

/** The line the collection reader cites a principle with. */
export function principleReference(hit: ScopedHit, scope: ScopeInfo): string {
  const body = hit.body as PrincipleBody;
  const refLine = (body.text ?? "").split("\n").find((l) => l.includes("المرجع:") || l.includes("الجهة:"));
  if (refLine) return cleanPrincipleText(refLine);
  if (body.reference) return cleanPrincipleText(body.reference);
  const court = meta(hit, "issuingBody") || scope.detail || "جهة غير محددة";
  const decision = meta(hit, "decisionNumber");
  const date = meta(hit, "sessionDate");
  return `مبدأ رقم (${meta(hit, "principleNumber")})، صادر عن (${court})${decision ? ` ذي الرقم (${decision})` : ""}${date ? ` بتاريخ ${date}` : ""}${scope.title ? ` - المنشور في (${scope.title})` : ""}${hit.volumeLabel ? `، ${hit.volumeLabel}` : ""}`;
}

function principleMainText(body: PrincipleBody): string {
  const lines = (body.text ?? "").split("\n").filter((l) => !(l.includes("المرجع:") || l.includes("الجهة:")));
  return cleanPrincipleText(lines.join("\n").trim());
}

function blockWhere(hit: ScopedHit, scope: ScopeInfo): { title: string; loc: string } {
  const title = [scope.title, hit.volumeLabel].filter(Boolean).join(" — ");
  const loc = formatLocator(
    {
      vol: hit.meta.vol as number | null,
      page: hit.meta.page as number | null,
      volLabel: hit.meta.volLabel as string | null,
      pageLabel: hit.meta.pageLabel as string | null,
    },
    true,
    "short",
  );
  return { title, loc };
}

function blockText(body: BlockBody): string {
  const parts: string[] = [];
  if (body.matn) parts.push(`المتن:\n${body.matn}`);
  if (body.sharh) parts.push(`الشرح:\n${body.sharh}`);
  if (body.hashiyah.length > 0) parts.push(`الحواشي:\n${body.hashiyah.map((h, i) => `${i + 1}- ${h}`).join("\n")}`);
  return parts.join("\n\n");
}

/** The text with its citation, for the clipboard; null for a locked hit. */
export function hitCopy(hit: ScopedHit, scope: ScopeInfo): CopyText | null {
  if (hit.locked || !hit.body) return null;

  if (hit.kind === "article") {
    const body = hit.body as ArticleBody;
    const c = buildCitation(
      { docTitle: scope.title, docType: scope.detail, numberText: meta(hit, "numberText"), displayNum: hit.place, status: meta(hit, "status") },
      true,
    );
    const reg = body.regulation ? `\n\nنص اللائحة التنفيذية تحت المادة:\n“${stripMd(body.regulation)}”` : "";
    const regHtml = body.regulation ? `<br><br><b>نص اللائحة التنفيذية تحت المادة:</b><br>“${esc(body.regulation).replace(/\n/g, "<br>")}”` : "";
    return {
      plain: `${c.plain}\n“${stripMd(body.text)}”${reg}`,
      html: `${c.html}<br>“${esc(body.text).replace(/\n/g, "<br>")}”${regHtml}`,
    };
  }

  if (hit.kind === "principle") {
    const body = hit.body as PrincipleBody;
    const main = principleMainText(body);
    const ref = principleReference(hit, scope);
    return {
      plain: `${main}\n\nالمرجع: ${ref}`,
      html: `${esc(main).replace(/\n/g, "<br>")}<br><br><b>المرجع:</b> ${esc(ref)}`,
    };
  }

  const body = hit.body as BlockBody;
  const { title, loc } = blockWhere(hit, scope);
  const where = loc ? `${title} - ${loc}` : title;
  const citation = [scope.detail, title, loc].filter(Boolean).join("، ");
  const text = blockText(body);
  const prefix = `الموضع من كتاب (${where}):`;
  return {
    plain: `${prefix}\n“${stripMd(text)}”\n\nالمرجعية: ${citation}`,
    html: `<b>${esc(prefix)}</b><br>“${esc(text).replace(/\n/g, "<br>")}”<br><br><i>المرجعية: ${esc(citation)}</i>`,
  };
}

/** The draft-cart entry for a hit; null for a locked hit. */
export function hitCartEntry(hit: ScopedHit, scope: ScopeInfo): CartEntry | null {
  if (hit.locked || !hit.body) return null;
  const base = { isArticleAdded: true, isExecRegAdded: false, principles: [], precedents: [] };

  if (hit.kind === "article") {
    const body = hit.body as ArticleBody;
    return {
      ...base,
      articleId: hit.id,
      articleNum: hit.place.slice(0, CART_NUMBER_MAX),
      articleTitle: body.title ?? "",
      articleText: body.text,
      lawName: scope.title,
      lawSlug: hit.volumeId,
    };
  }

  if (hit.kind === "principle") {
    const body = hit.body as PrincipleBody;
    const main = principleMainText(body);
    const ref = principleReference(hit, scope);
    return {
      ...base,
      articleId: hit.id,
      articleNum: `مبدأ رقم ${meta(hit, "principleNumber")}`.slice(0, CART_NUMBER_MAX),
      articleTitle: main.slice(0, 45) + (main.length > 45 ? "..." : ""),
      articleText: ref ? `${main}\n\nالمرجع: ${ref}` : main,
      // The principle's own issuing body, as the collection reader cites it.
      lawName: meta(hit, "issuingBody") || scope.detail || scope.title,
      lawSlug: hit.volumeId,
    };
  }

  const body = hit.body as BlockBody;
  const { title } = blockWhere(hit, scope);
  return blockCartEntry(
    {
      id: hit.id,
      topic: meta(hit, "topic"),
      ...body,
      vol: hit.meta.vol as number | null,
      page: hit.meta.page as number | null,
      volLabel: hit.meta.volLabel as string | null,
      pageLabel: hit.meta.pageLabel as string | null,
    },
    title,
    hit.place,
  );
}

/** A fiqh block with its text and place — a search hit's, or the book reader's open block. */
export interface CartBlock extends BlockBody {
  id: string;
  topic: string | null;
  vol: number | null;
  page: number | null;
  volLabel: string | null;
  pageLabel: string | null;
}

/**
 * The cart entry of one fiqh block (the book reader's «➕ للمسودة» and the
 * search's): its layers as the text, «ج 4، ص 218» as its number, the book
 * (with its volume) as its «law».
 */
export function blockCartEntry(b: CartBlock, citeTitle: string, fallbackPlace = ""): CartEntry {
  const loc = formatLocator({ vol: b.vol, page: b.page, volLabel: b.volLabel, pageLabel: b.pageLabel }, true, "short");
  return {
    isArticleAdded: true,
    isExecRegAdded: false,
    principles: [],
    precedents: [],
    articleId: b.id,
    articleNum: (loc || fallbackPlace || "موضع غير مرقّم").slice(0, CART_NUMBER_MAX),
    articleTitle: b.topic ?? "",
    articleText: blockText(b),
    lawName: citeTitle,
    // One key per block: two blocks on one page must not share the cart's
    // server key (law_slug, article_number).
    lawSlug: b.id,
  };
}

export interface TextSegment {
  text: string;
  hit: boolean;
}

/**
 * The text cut into plain and matching segments for <mark> (never HTML):
 * every occurrence of a search term, longest terms first, the prefix «*»
 * dropped. Terms shorter than two characters and anything past the first 20
 * terms are ignored.
 */
export function highlightSegments(text: string, terms: readonly string[]): TextSegment[] {
  const clean = [...new Set(terms.map((t) => String(t ?? "").replace(/\*+$/, "").trim()).filter((t) => t.length >= 2))]
    .slice(0, 20)
    .sort((a, b) => b.length - a.length);
  if (!text) return [];
  if (clean.length === 0) return [{ text, hit: false }];
  const re = new RegExp(clean.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const out: TextSegment[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

/**
 * The in-document search panel's heading (N2.6 review): what it searches,
 * so it reads apart from each reader's own box — the collection reader's
 * filter of the loaded principles, the book's index search and page jump,
 * the law's article jump. Those act on what is on the page; this one asks
 * the server for the whole document, every volume of a series.
 */
export function scopedPanelTitle(scope: string, volumeCount: number): string {
  const kind = scope.slice(0, Math.max(0, scope.indexOf(":")));
  if (kind === "law") return "بحث في نص النظام كاملاً";
  if ((kind === "collection" || kind === "book") && volumeCount > 1) return "بحث في كل المجلدات";
  if (kind === "collection") return "بحث في كل مبادئ المجموعة";
  if (kind === "book") return "بحث في نص الكتاب كاملاً";
  return "بحث في نص المستند كاملاً";
}
