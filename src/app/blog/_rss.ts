/**
 * _rss.ts — the RSS 2.0 document of /blog/rss.xml (P1-39). Pure: no Next.js
 * or Supabase import, so `node --test` loads it; the route
 * (./rss.xml/route.ts) reads the rows and hands them here.
 *
 *   - newest first, at most RSS_MAX_ITEMS items (the route asks for that many);
 *   - every link absolute on the base URL, the slug percent-encoded (Arabic
 *     slugs are common), guid = that link;
 *   - text escaped for XML, and characters XML 1.0 forbids dropped;
 *   - lastBuildDate is the newest item's date, never "now": the feed is cached
 *     (a "now" stamped at build time would read as a stale date for hours).
 */

export const RSS_MAX_ITEMS = 30;

export interface RssArticle {
  slug: string;
  title: string;
  excerpt?: string | null;
  /** already a display label (never a raw sec_* code), or null to omit */
  category?: string | null;
  author?: string | null;
  published_at?: string | null;
}

export interface RssChannel {
  baseUrl: string;
  title: string;
  description: string;
  /** the page the feed belongs to, e.g. "/blog" */
  path: string;
  /** the feed's own path, e.g. "/blog/rss.xml" */
  selfPath: string;
  language?: string;
}

// XML 1.0 allows #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF].
const ILLEGAL_XML = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

/** Escapes text for an XML element or attribute value. */
export function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 date for RSS, or null when the value is missing or not a date. */
export function rssDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toUTCString();
}

export function articleUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/blog/${encodeURIComponent(slug)}`;
}

const time = (value: string | null | undefined) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? -Infinity : t;
};

export function buildRssXml(channel: RssChannel, articles: readonly RssArticle[]): string {
  const base = channel.baseUrl.replace(/\/+$/, "");
  const items = articles
    .filter((a) => a && typeof a.slug === "string" && a.slug.trim() && typeof a.title === "string" && a.title.trim())
    .slice()
    .sort((a, b) => time(b.published_at) - time(a.published_at))
    .slice(0, RSS_MAX_ITEMS);

  const newest = items.map((a) => rssDate(a.published_at)).find((d): d is string => d !== null) ?? null;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    `<title>${xmlEscape(channel.title)}</title>`,
    `<link>${xmlEscape(base + channel.path)}</link>`,
    `<description>${xmlEscape(channel.description)}</description>`,
    `<language>${xmlEscape(channel.language ?? "ar")}</language>`,
    `<atom:link href="${xmlEscape(base + channel.selfPath)}" rel="self" type="application/rss+xml"/>`,
  ];
  if (newest) lines.push(`<lastBuildDate>${newest}</lastBuildDate>`);

  for (const a of items) {
    const url = articleUrl(base, a.slug.trim());
    const date = rssDate(a.published_at);
    lines.push("<item>");
    lines.push(`<title>${xmlEscape(a.title.trim())}</title>`);
    lines.push(`<link>${xmlEscape(url)}</link>`);
    lines.push(`<guid isPermaLink="true">${xmlEscape(url)}</guid>`);
    if (a.excerpt && a.excerpt.trim()) lines.push(`<description>${xmlEscape(a.excerpt.trim())}</description>`);
    if (a.category && a.category.trim()) lines.push(`<category>${xmlEscape(a.category.trim())}</category>`);
    if (a.author && a.author.trim()) lines.push(`<dc:creator>${xmlEscape(a.author.trim())}</dc:creator>`);
    if (date) lines.push(`<pubDate>${date}</pubDate>`);
    lines.push("</item>");
  }

  lines.push("</channel>", "</rss>");
  return lines.join("\n") + "\n";
}
