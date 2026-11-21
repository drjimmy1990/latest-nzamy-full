/**
 * researchCart — «حفظ للتجميع» from the researcher's side panel (owner file 11
 * item 3, the BookmarkSimple button): a cited article or principle goes into
 * the same draft cart the reader pages fill (useDraftCart), as their own entry
 * shape.
 *
 * Only a COMPLETE text is saved: the preview must be unlocked and not cut. A
 * non-subscriber's 100-character excerpt, or a long text the preview cut,
 * never becomes a draft entry — the panel offers the library link instead.
 *
 * Pure (type-only imports), so `node --test` runs it.
 */
import type { CartEntry } from "../../../../components/laws/DraftDrawer";
import type { Citation, Preview } from "../../../../components/ai/CitedAnswer";

/** The slug of a /laws/<slug> or /precedents/<slug> link, or null. */
export function slugFromSourceUrl(url: string): string | null {
  const m = /^\/(?:laws|precedents)\/([^/?#]+)/.exec(String(url ?? ""));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Why the panel cannot save this source, or null when it can. */
export function cartRefusal(cite: Citation, preview: Preview | null): string | null {
  if (cite.kind !== "article" && cite.kind !== "principle") return "هذا النوع من المصادر يُحفظ من صفحته في المكتبة.";
  if (!cite.id || !slugFromSourceUrl(cite.url)) return "افتح المصدر في المكتبة لحفظه.";
  if (!preview) return "انتظر تحميل النص.";
  if (preview.locked) return "الحفظ للتجميع للنص الكامل، وهو لمشتركي المكتبة القانونية.";
  if (preview.truncated) return "النص طويل: احفظه من صفحته في المكتبة.";
  if (!preview.excerpt.trim()) return "لا نص محفوظاً لهذا المصدر.";
  return null;
}

/** The draft-cart entry for a cited source, or null when cartRefusal says no. */
export function citationCartEntry(cite: Citation, preview: Preview | null): CartEntry | null {
  if (cartRefusal(cite, preview) !== null || !preview || !cite.id) return null;
  const text = preview.excerpt.trim();
  const label = (preview.label ?? "").trim();
  const lawName = (preview.lawTitle ?? "").trim() || cite.title;
  return {
    articleId: cite.id,
    articleNum: label || cite.title,
    articleTitle: cite.title,
    articleText: text,
    lawName,
    lawSlug: slugFromSourceUrl(cite.url) as string,
    isArticleAdded: true,
    isExecRegAdded: false,
    principles: [],
    precedents: [],
  };
}
