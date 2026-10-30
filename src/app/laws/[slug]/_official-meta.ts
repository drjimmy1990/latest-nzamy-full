/**
 * _official-meta.ts — the law-detail response's official-publication fields,
 * read defensively (T28-22 / T28-23 / T28-26, owner test 2026-09-28).
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /api/library/laws/[slug]` carries, beside the law text:
 *   - `officialMetaLocked` — true for a non-subscriber; `issuanceDecree`,
 *     `issuanceDate` and `source` then arrive as ''.
 *   - `officialSourceUrl`  — the official page, subscribers only.
 *   - `officialLink`       — the official page beside «الجهة المصدرة» (owner
 *                            ٢٩٧) — SUBSCRIBERS only since owner ٣١٨
 *                            (28-Oct, reversing ٢٩٧'s public link).
 *   - `officialLinks`      — [{label, url}] every official link by Arabic
 *                            name (note ٠١ item ٣), subscribers only.
 *   - `gazette`            — {issueNumber, publicationDate, url} | null
 *                            (Umm al-Qura issue; null on every law today).
 *   - `replacedBy`         — {slug, title} | null (the law that replaced a
 *                            repealed one; null on every law today).
 *   - `latest_legislative_update` — «1448/01/08هـ», the ONE public date
 *                            (owner ٣١٨), every viewer.
 *   - `latestUpdate`       — «آخر تعديل» from latest_update with its event
 *                            (note ٠١ item ٢), subscribers only.
 *   - `articleCounts`, `hasMergedRegulation`, `regulation_card` — the
 *                            sidebar's two-layer card (note ٠١ items ٥–٦,
 *                            note ١٢ item ٧).
 *
 * Kept OUT of the `LawSystem` whitelist mapping (data.ts is shared) and held
 * as its own state on the reader, the way `paywall.freeLimit` is — so the
 * page's loadLaw mapping needs no change for any of them.
 *
 * Rules: every field is optional — an older response without them reads as
 * "not locked, nothing to show". A link is only ever a URL the server sent
 * (http/https); nothing here builds one. Pure: `node --test`; its imports
 * are the pure lawCardFields.ts / lawPreambleBlocks.ts (names, types).
 */

import {
  officialSourceName,
  type ArticleTally,
  type LawArticleCounts,
  type OfficialSourceLink,
} from "../../../lib/library/lawCardFields.ts";
import type { LawCardField, LawMetadataCard } from "../../../lib/library/lawPreambleBlocks.ts";

export interface LawGazette {
  /** The Umm al-Qura issue number as the source states it. */
  issueNumber: string;
  /** The issue's date as the source states it (Hijri or Gregorian), or null. */
  publicationDate: string | null;
  /** The issue's own page, only when the server sent a real http(s) URL. */
  url: string | null;
}

export interface LawOfficialMeta {
  /** True when the viewer is not a subscriber and the official fields were withheld. */
  locked: boolean;
  officialSourceUrl: string | null;
  /**
   * Owner ٢٩٧: the law's page at its official source, beside «الجهة المصدرة»
   * — a subscriber's since ٣١٨, so dropped when `locked` (fail closed). http(s) only.
   */
  officialLink: string | null;
  /** Note ٠١ item ٣: every official link with its Arabic name; [] when locked. */
  officialLinks: OfficialSourceLink[];
  gazette: LawGazette | null;
  replacedBy: { slug: string; title: string } | null;
  /** Owner ٣١٨: «آخر تحديث تشريعي», the date alone («1448/01/08هـ»), for every viewer. */
  latestLegislativeUpdate: string | null;
  /** Note ٠١ item ٢: «آخر تعديل» with its event — subscribers only (null when locked). */
  latestUpdate: string | null;
  /** Note ٠١ item ٦ / note ١٢ item ٧: tallies per container, or null (older response). */
  articleCounts: LawArticleCounts | null;
  hasMergedRegulation: boolean;
  /** Note ٠١ item ٥: the merged regulation's own card rows (as the server shaped them for this viewer). */
  regulationCard: LawMetadataCard | null;
}

export const EMPTY_OFFICIAL_META: LawOfficialMeta = {
  locked: false,
  officialSourceUrl: null,
  officialLink: null,
  officialLinks: [],
  gazette: null,
  replacedBy: null,
  latestLegislativeUpdate: null,
  latestUpdate: null,
  articleCounts: null,
  hasMergedRegulation: false,
  regulationCard: null,
};

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** The value when it is an absolute http(s) URL, else null — never a guess. */
export function httpUrlOrNull(v: unknown): string | null {
  const s = text(v);
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).protocol.startsWith("http") ? s : null;
  } catch {
    return null;
  }
}

/** A link's visible text: the host alone, like the reader's «المصدر» link. */
export function urlHostname(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function parseOfficialMeta(data: unknown): LawOfficialMeta {
  if (!data || typeof data !== "object") return EMPTY_OFFICIAL_META;
  const d = data as Record<string, unknown>;
  const locked = d.officialMetaLocked === true;

  let gazette: LawGazette | null = null;
  if (!locked && d.gazette && typeof d.gazette === "object") {
    const g = d.gazette as Record<string, unknown>;
    const issueNumber = text(g.issueNumber);
    if (issueNumber) {
      gazette = {
        issueNumber,
        publicationDate: text(g.publicationDate) || null,
        url: httpUrlOrNull(g.url),
      };
    }
  }

  let replacedBy: LawOfficialMeta["replacedBy"] = null;
  if (d.replacedBy && typeof d.replacedBy === "object") {
    const r = d.replacedBy as Record<string, unknown>;
    const slug = text(r.slug);
    if (slug) replacedBy = { slug, title: text(r.title) };
  }

  // Owner ٣١٨: nothing official reaches a locked reader, even if a response slipped it through.
  const officialLinks: OfficialSourceLink[] = [];
  if (!locked && Array.isArray(d.officialLinks)) {
    for (const l of d.officialLinks as unknown[]) {
      if (!l || typeof l !== "object") continue;
      const url = httpUrlOrNull((l as Record<string, unknown>).url);
      if (!url || officialLinks.some((o) => o.url === url)) continue;
      // The server's name, else the host's Arabic name — never the raw host.
      const label = text((l as Record<string, unknown>).label);
      officialLinks.push({ label: label && /\p{Script=Arabic}/u.test(label) ? label : officialSourceName(url), url });
    }
  }

  const latestLegislativeUpdate = text(d.latest_legislative_update);
  const latestUpdate = locked ? "" : text(d.latestUpdate);

  return {
    locked,
    officialSourceUrl: locked ? null : httpUrlOrNull(d.officialSourceUrl),
    officialLink: locked ? null : httpUrlOrNull(d.officialLink),
    officialLinks,
    gazette,
    replacedBy,
    // A date alone, or nothing: «1448/01/08هـ», «1446/02هـ», «1446هـ».
    latestLegislativeUpdate: PUBLIC_DATE.test(latestLegislativeUpdate) ? latestLegislativeUpdate : null,
    latestUpdate: latestUpdate || null,
    articleCounts: parseArticleCounts(d.articleCounts),
    hasMergedRegulation: d.hasMergedRegulation === true,
    regulationCard: parseCard(d.regulation_card),
  };
}

const PUBLIC_DATE = /^1[34][0-9]{2}(?:\/[0-9]{2}){0,2}هـ$/;

function count(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

function tally(v: unknown): ArticleTally {
  const t = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { total: count(t.total), amended: count(t.amended), repealed: count(t.repealed) };
}

/** The route's articleCounts, or null when absent / malformed (an older response). */
export function parseArticleCounts(v: unknown): LawArticleCounts | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (!c.law || typeof c.law !== "object") return null;
  const regulations = Array.isArray(c.regulations)
    ? (c.regulations as unknown[])
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map((r) => ({ name: text(r.name) || "اللائحة التنفيذية", ...tally(r) }))
        .filter((r) => r.total > 0)
    : [];
  return { law: tally(c.law), regulations, annexes: count(c.annexes) };
}

function parseRows(v: unknown): LawCardField[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({ key: text(f.key), value: text(f.value) }))
    .filter((f) => f.key && f.value);
}

function parseCard(v: unknown): LawMetadataCard | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const main = parseRows(c.main);
  const more = parseRows(c.more);
  return main.length || more.length ? { main, more } : null;
}

/** «أم القرى، العدد 4987» — the date is rendered beside it, never inside. */
export function gazetteIssueLabel(g: Pick<LawGazette, "issueNumber">): string {
  return `أم القرى، العدد ${g.issueNumber}`;
}

/**
 * N2.1 — what the sidebar adds under the FILE's identity card from the
 * database (subscribers, T28-26): the official link unless a card row already
 * links that site, and the Umm al-Qura issue unless a card row already cites
 * the gazette. Keys are not matched loosely: «الجهة المصدرة» (the issuer, on
 * nearly every V2 card) contains «المصدر» and once hid the link everywhere.
 * Nor is the link repeated when the card already shows it beside «الجهة
 * المصدرة» (`shownLink`, owner ٢٩٧).
 */
export function dbOfficialRowsUnderCard(
  rows: ReadonlyArray<{ key: string; value: string }>,
  meta: Pick<LawOfficialMeta, "officialSourceUrl" | "gazette">,
  shownLink: string | null = null,
): { sourceUrl: string; gazette: LawGazette | null } {
  const url = meta.officialSourceUrl ?? "";
  const host = url ? urlHostname(url) : "";
  const cardLinksSite = !!url && (url === shownLink || rows.some((f) => f.value.includes(url) || (host !== url && f.value.includes(`//${host}`))));
  const cardCitesGazette = rows.some((f) => f.value.includes("أم القرى") || f.key.includes("الجريدة"));
  return {
    sourceUrl: url && !cardLinksSite ? url : "",
    gazette: meta.gazette && !cardCitesGazette ? meta.gazette : null,
  };
}
