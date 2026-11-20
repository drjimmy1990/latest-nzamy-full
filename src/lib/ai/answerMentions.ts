/**
 * answerMentions.ts — N06-34..39 remainder (batch l11): the article references
 * an AI answer writes in its own words («المادة الثمانين من نظام العمل»,
 * «المادتين (٧٧) و(٨٠)») become chips, beside the [S1] markers that were
 * already chips (CitedAnswer.tsx).
 *
 * ONE PARSER. The references are read by the law reader's scanCitations
 * (app/laws/[slug]/_cite-links.ts, itself on lib/library/articleMentions.ts —
 * the graph watchdog's parser), used read-only here, so a chip in an answer,
 * a chip in the reader and the graph agree on what a text cites.
 *
 * A chip resolves on click only, through the reader's own lookup
 * (GET /api/library/laws/[slug]/citations ?name= / ?law=, which answers titles,
 * numbers and statuses — never article text). Only article references are
 * chipped:
 *   - «… من نظام العمل» (scope "other"): looked up by the law's name;
 *   - a bare «المادة (٨٠)» (scope "self"): only when every article the answer
 *     cites is from ONE law, which it then means; otherwise it stays text —
 *     a wrong law is worse than no chip.
 *
 * Pure: `node --test` runs answerMentions.test.ts.
 */
import { scanCitations } from "../../app/laws/[slug]/_cite-links.ts";

export type AnswerPart =
  | { type: "text"; text: string }
  | { type: "marker"; sid: string }
  | { type: "mention"; text: string; numbers: number[]; docName: string; lawSlug: string | null };

const MARKER_SPLIT = /(\[S\d{1,3}\])/g;
const MARKER = /^\[(S\d{1,3})\]$/;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The law slug of a cited article from its library link (`/laws/<slug>#<id>`), or null. */
export function citedLawSlug(cite: { kind?: string; url?: string }): string | null {
  if (cite.kind !== "article" || typeof cite.url !== "string") return null;
  const m = /^\/laws\/([^/#?]+)/.exec(cite.url);
  return m ? safeDecode(m[1]) : null;
}

/** The one law every cited article belongs to, or null (none, or more than one). */
export function soleCitedLaw(cites: ReadonlyArray<{ kind?: string; url?: string }>): string | null {
  const slugs = new Set(cites.map(citedLawSlug).filter((s): s is string => !!s));
  return slugs.size === 1 ? [...slugs][0] : null;
}

/** The answer as text runs, [S…] markers and article mentions, in order. */
export function splitAnswer(text: string, cites: ReadonlyArray<{ kind?: string; url?: string }>): AnswerPart[] {
  const sole = soleCitedLaw(cites);
  const out: AnswerPart[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.type === "text") last.text += t;
    else out.push({ type: "text", text: t });
  };
  for (const part of String(text ?? "").split(MARKER_SPLIT)) {
    const marker = MARKER.exec(part);
    if (marker) {
      out.push({ type: "marker", sid: marker[1] });
      continue;
    }
    let at = 0;
    for (const m of scanCitations(part)) {
      if (m.kind !== "article" || m.numbers.length === 0) continue;
      const named = m.scope === "other" && m.docName.split(" ").length >= 2;
      const own = m.scope === "self" && !!sole;
      if (!named && !own) continue;
      pushText(part.slice(at, m.start));
      out.push({
        type: "mention",
        text: part.slice(m.start, m.end),
        numbers: m.numbers,
        docName: named ? m.docName : "",
        lawSlug: named ? null : sole,
      });
      at = m.end;
    }
    pushText(part.slice(at));
  }
  return out;
}

/** The reader's lookup for one mention (titles, numbers, statuses; never text). */
export function mentionLookupUrl(m: { numbers: number[]; docName: string; lawSlug: string | null }): string | null {
  const n = m.numbers.filter((x) => Number.isInteger(x) && x > 0).slice(0, 8).join(",");
  if (!n) return null;
  if (m.lawSlug) {
    const slug = encodeURIComponent(m.lawSlug);
    return `/api/library/laws/${slug}/citations?law=${slug}&n=${n}`;
  }
  if (m.docName) return `/api/library/laws/ref/citations?name=${encodeURIComponent(m.docName)}&n=${n}`;
  return null;
}

export interface MentionArticle {
  id: string;
  number: number;
  title: string;
  status: string;
  url: string;
}

export interface MentionLookup {
  lawTitle: string | null;
  lawUrl: string | null;
  articles: MentionArticle[];
}

/** The lookup's answer, checked: only well-formed rows, each with its library link. */
export function readMentionLookup(body: unknown): MentionLookup {
  const b = (body ?? {}) as { law?: { slug?: unknown; title?: unknown } | null; articles?: unknown };
  const slug = typeof b.law?.slug === "string" && b.law.slug ? b.law.slug : null;
  const lawTitle = typeof b.law?.title === "string" && b.law.title ? b.law.title : null;
  if (!slug) return { lawTitle: null, lawUrl: null, articles: [] };
  const lawUrl = `/laws/${encodeURIComponent(slug)}`;
  const articles: MentionArticle[] = [];
  for (const a of Array.isArray(b.articles) ? b.articles : []) {
    const r = (a ?? {}) as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || typeof r.number !== "number") continue;
    articles.push({
      id: r.id,
      number: r.number,
      title: typeof r.title === "string" && r.title ? r.title : `المادة ${r.number}`,
      status: typeof r.status === "string" ? r.status : "",
      url: `${lawUrl}#${encodeURIComponent(r.id)}`,
    });
  }
  return { lawTitle, lawUrl, articles };
}
