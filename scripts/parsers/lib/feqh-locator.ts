/**
 * feqh-locator.ts — parse a page/volume locator from a feqh source line.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * parse-feqh.ts recognised exactly one page-header shape:
 *
 *     /^#{1,5}\s*صفحة\s+(\d+)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*)/
 *
 * i.e. a FOUR-part Shamela header. Measured over the 144-book corpus, that shape
 * occurs on **10 lines, in 1 book**. The dominant shape —
 * `#### الجزء 10 - صفحة 3 - title - author` — occurs on **57,975 lines across
 * 117 books** and was not recognised at all.
 *
 * Consequences in production today:
 *   • Real volume/page numbers are discarded for almost every book; flushPage
 *     synthesises a sequential page counter instead, and hardcodes volume 1.
 *     A citation to "page 5" of a book whose source says الجزء 3 صفحة 47 is
 *     simply wrong.
 *   • 810 of 17,687 `PAGE_START` anchors are invisible because the anchor regex
 *     is pinned to column 0 and those lines begin with whitespace (798) or a
 *     literal "\n" (12).
 *
 * DESIGN
 * One parser for every shape actually measured. It returns the NUMERIC volume
 * and page where the source gives them, and ALWAYS returns the verbatim label
 * text so a non-numeric locator ("صفحة None", "الجزء مقدمة") can be displayed
 * exactly as written instead of being coerced to a number that was never there.
 */

export interface Locator {
  /** Numeric page, or null when the source's page token is not a number. */
  page: number | null;
  /** Numeric volume, or null when the source states none. NEVER defaulted to 1. */
  volume: number | null;
  /** Verbatim page token as written (e.g. "3", "None"). */
  pageLabel: string | null;
  /** Verbatim volume token as written (e.g. "10", "مقدمة"). */
  volumeLabel: string | null;
  /** Which shape matched — makes results auditable and lets callers count. */
  kind: "anchor" | "vol-page" | "bracket" | "shamela4" | "shamela3";
}

/** Arabic-Indic → ASCII digits, so "٥" parses as 5. */
const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};
const toAscii = (s: string): string => s.replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] ?? d);

/** Numeric value of a locator token, or null when it is not a plain number. */
function num(tok: string | null | undefined): number | null {
  if (!tok) return null;
  const a = toAscii(tok).trim();
  // Compound volumes such as "7-1" keep their label but have no single number.
  if (!/^\d+$/.test(a)) return null;
  const n = parseInt(a, 10);
  return Number.isFinite(n) ? n : null;
}

// ── Shapes, most specific first ─────────────────────────────────────────────

/**
 * `<!-- PAGE_START {"vol": 1, "page": 5} -->`
 * NOT pinned to column 0: 798 of these lines start with whitespace and 12 with a
 * literal "\n", which the old column-0 regex could not see.
 */
const RE_ANCHOR = /<!--\s*PAGE_START\s*(\{[\s\S]*?\})\s*-->/;

/** `#### الجزء 10 - صفحة 3 - title - author`  (the dominant shape, 117 books) */
const RE_VOL_PAGE =
  /^\s*#{1,6}\s*الجزء\s+([^\s\-–—]+)\s*[-–—]\s*صفحة\s+([^\s\-–—]+)/;

/** `#### [الجزء 1 - صفحة 5]`  (bracketed locator, 20 books) */
const RE_BRACKET =
  /^\s*#{1,6}\s*\[\s*الجزء\s+([^\s\-–—\]]+)\s*[-–—]\s*صفحة\s+([^\s\]]+)\s*\]/;

/** `#### صفحة 63 - title - author - source`  (4-part Shamela) */
const RE_SHAMELA4 =
  /^\s*#{1,6}\s*صفحة\s+([^\s\-–—]+)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*)/;

/** `#### صفحة 3 - title - author`  (3-part Shamela) */
const RE_SHAMELA3 =
  /^\s*#{1,6}\s*صفحة\s+([^\s\-–—]+)\s*[-–—]\s*([^-–—]+)[-–—]\s*([^-–—]+)$/;

/**
 * Parse a locator from one line, or null if the line carries none.
 *
 * Order matters: the volume-bearing shapes are tried before the صفحة-only ones,
 * because `الجزء N - صفحة M - …` also satisfies a naive صفحة match and would
 * otherwise lose its volume.
 */
export function parseLocator(line: string): Locator | null {
  const anchor = line.match(RE_ANCHOR);
  if (anchor) {
    try {
      const o = JSON.parse(anchor[1]) as Record<string, unknown>;
      const pRaw = o.page ?? o.p ?? null;
      const vRaw = o.vol ?? o.volume ?? null;
      const pageLabel = pRaw == null ? null : String(pRaw);
      const volumeLabel = vRaw == null ? null : String(vRaw);
      return {
        page: num(pageLabel),
        volume: num(volumeLabel),
        pageLabel,
        volumeLabel,
        kind: "anchor",
      };
    } catch {
      // Malformed JSON in the anchor — the caller counts it; we do not guess.
      return null;
    }
  }

  const vp = line.match(RE_VOL_PAGE);
  if (vp) {
    return {
      page: num(vp[2]), volume: num(vp[1]),
      pageLabel: vp[2], volumeLabel: vp[1], kind: "vol-page",
    };
  }

  const br = line.match(RE_BRACKET);
  if (br) {
    return {
      page: num(br[2]), volume: num(br[1]),
      pageLabel: br[2], volumeLabel: br[1], kind: "bracket",
    };
  }

  const s4 = line.match(RE_SHAMELA4);
  if (s4) {
    return {
      page: num(s4[1]), volume: null,
      pageLabel: s4[1], volumeLabel: null, kind: "shamela4",
    };
  }

  const s3 = line.match(RE_SHAMELA3);
  if (s3) {
    return {
      page: num(s3[1]), volume: null,
      pageLabel: s3[1], volumeLabel: null, kind: "shamela3",
    };
  }

  return null;
}

/** True when the line carries a locator — used to keep it out of body text. */
export const isLocatorLine = (line: string): boolean => parseLocator(line) !== null;
