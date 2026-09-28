/**
 * _official-meta.ts — the law-detail response's official-publication fields,
 * read defensively (T28-22 / T28-23 / T28-26, owner test 2026-09-28).
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /api/library/laws/[slug]` carries, beside the law text:
 *   - `officialMetaLocked` — true for a non-subscriber; `issuanceDecree`,
 *     `issuanceDate` and `source` then arrive as ''.
 *   - `officialSourceUrl`  — the official page, subscribers only.
 *   - `gazette`            — {issueNumber, publicationDate, url} | null
 *                            (Umm al-Qura issue; null on every law today).
 *   - `replacedBy`         — {slug, title} | null (the law that replaced a
 *                            repealed one; null on every law today).
 *
 * Kept OUT of the `LawSystem` whitelist mapping (data.ts is shared) and held
 * as its own state on the reader, the way `paywall.freeLimit` is.
 *
 * Rules: every field is optional — an older response without them reads as
 * "not locked, nothing to show". A link is only ever a URL the server sent
 * (http/https); nothing here builds one. Pure, no imports: `node --test`.
 */

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
  gazette: LawGazette | null;
  replacedBy: { slug: string; title: string } | null;
}

export const EMPTY_OFFICIAL_META: LawOfficialMeta = {
  locked: false,
  officialSourceUrl: null,
  gazette: null,
  replacedBy: null,
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

  return {
    locked,
    officialSourceUrl: locked ? null : httpUrlOrNull(d.officialSourceUrl),
    gazette,
    replacedBy,
  };
}

/** «أم القرى، العدد 4987» — the date is rendered beside it, never inside. */
export function gazetteIssueLabel(g: Pick<LawGazette, "issueNumber">): string {
  return `أم القرى، العدد ${g.issueNumber}`;
}
