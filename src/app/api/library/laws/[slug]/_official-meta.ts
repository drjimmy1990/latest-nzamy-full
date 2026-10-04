/**
 * Official metadata of a law — the issuing decree and its date, the official
 * source links and the Umm Al-Qura gazette reference — shaped for the viewer.
 *
 * Owner decision T28-22 (2026-09-28): these are a SUBSCRIBER feature. A
 * non-subscriber receives empty values plus `officialMetaLocked: true`, so the
 * page can say "for subscribers" instead of "unknown". The rule is keyed on
 * the viewer's tier alone (pro and above), never on the law whitelist: a
 * whitelisted law opens its TEXT to everyone, not its decree and gazette —
 * the same rule the catalogue list (/api/library/init) and the enactments
 * widget apply, so one law never shows its decree on one screen and hides it
 * on the next.
 *
 * The masking here is the route-level half. Since migration 20261004_01
 * (owner question ١٦٢) the database holds the other half: these columns of
 * library.laws (and the preamble) are column-locked for the anon key, and
 * v_laws_enactment_status is closed to it, so the routes read them with the
 * service role and mask them here. The rest of the catalogue stays public.
 *
 * Pure, no imports: `node --test` loads it (_official-meta.test.ts).
 */

/**
 * Cache-Control for every response whose body depends on the viewer's tier.
 * deploy.sh purges an nginx proxy cache and Cloudflare sits in front of it;
 * a shared cache must never hand a subscriber's body to a guest.
 */
export const TIER_SHAPED_CACHE_CONTROL = "private, no-store";

export interface GazetteRef {
  /** رقم عدد أم القرى, exactly as stored. */
  issueNumber: string | null;
  /** Gregorian publication date, YYYY-MM-DD as stored. */
  publicationDate: string | null;
  /** A stored http(s) link to the issue — never built from the number. */
  url: string | null;
}

export interface LawOfficialMeta {
  issuanceDecree: string;
  issuanceDate: string;
  /** boe_source_url (the pre-existing `source` field). */
  source: string;
  /** official_source_url. */
  officialSourceUrl: string;
  gazette: GazetteRef | null;
  officialMetaLocked: boolean;
}

/** The library.laws columns this module reads. */
export interface LawOfficialColumns {
  issuing_instrument?: unknown;
  issue_date_hijri?: unknown;
  boe_source_url?: unknown;
  official_source_url?: unknown;
  gazette_issue_number?: unknown;
  gazette_publication_date?: unknown;
  gazette_url?: unknown;
}

/** A trimmed string, or '' for null / undefined / non-string / blank. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A stored link, only when it is an absolute http(s) URL. */
function httpUrl(value: unknown): string {
  const s = text(value);
  return /^https?:\/\/\S+$/i.test(s) ? s : "";
}

/**
 * The gazette reference from the three real columns, or null when all three
 * are empty (they are empty on every law as of 2026-09-28). An empty string
 * counts as empty.
 */
export function gazetteFor(law: LawOfficialColumns): GazetteRef | null {
  const issueNumber = text(law.gazette_issue_number);
  const publicationDate = text(law.gazette_publication_date);
  const url = httpUrl(law.gazette_url);
  if (!issueNumber && !publicationDate && !url) return null;
  return {
    issueNumber: issueNumber || null,
    publicationDate: publicationDate || null,
    url: url || null,
  };
}

/** The law-detail fields, masked unless the viewer is a subscriber. */
export function lawOfficialMeta(law: LawOfficialColumns, isSubscriber: boolean): LawOfficialMeta {
  if (!isSubscriber) {
    return {
      issuanceDecree: "",
      issuanceDate: "",
      source: "",
      officialSourceUrl: "",
      gazette: null,
      officialMetaLocked: true,
    };
  }
  return {
    issuanceDecree: text(law.issuing_instrument),
    issuanceDate: text(law.issue_date_hijri),
    source: text(law.boe_source_url),
    officialSourceUrl: httpUrl(law.official_source_url),
    gazette: gazetteFor(law),
    officialMetaLocked: false,
  };
}

/**
 * A catalogue row (/api/library/init) for a non-subscriber: the decree and
 * its date are nulled, everything else — status included — is kept. Returns
 * a copy; the input row is not modified.
 */
export function maskListOfficialFields<T extends Record<string, unknown>>(row: T, isSubscriber: boolean): T {
  if (isSubscriber) return row;
  const out: Record<string, unknown> = { ...row };
  if ("issuing_instrument" in out) out.issuing_instrument = null;
  if ("issue_date_hijri" in out) out.issue_date_hijri = null;
  return out as T;
}
