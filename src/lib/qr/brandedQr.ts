/**
 * brandedQr.ts — the platform's "smart QR" for printed paper (owner decision
 * ٢٥٦, 25 Oct): a level-H code in royal green on white, with the gold «نظامي»
 * wordmark in a gold-ringed white circle at its centre — the design of the
 * approved preview «nezamy_qr_with_arabic_logo_preview.png».
 *
 * Vector, not a canvas PNG (src/lib/qr/qrWithLogo.ts is the share modal's
 * raster version and is unchanged): a letterhead is printed, and an SVG stays
 * sharp at any size the printer chooses.
 *
 * Pure: the caller hands in the module matrix (`QRCode.create(text,
 * { errorCorrectionLevel: "H" }).modules` from the `qrcode` package), so
 * brandedQr.test.ts can prove — codeword by codeword — that the badge never
 * covers more than level H can repair.
 */

export const QR_GREEN = "#0B3D2E";
export const QR_GOLD = "#C8A762";
export const QR_WORDMARK_SRC = "/brand/nezamy-wordmark.png";
/** public/brand/nezamy-wordmark.png is 511×497. */
export const QR_WORDMARK_RATIO = 511 / 497;

/**
 * Diameter of the badge (its outer gold edge) as a share of the code's width,
 * quiet zone excluded: 0.30 → about 7% of the code's area, close to the
 * approved preview (≈ 0.33). brandedQr.test.ts counts the damaged codewords
 * per Reed–Solomon block: 0.30 and 0.33 stay within level H's budget for every
 * sample URL, 0.40 does not (version 3-H: 13 damaged > 11 correctable). 0.30
 * keeps a margin for print blur and worn paper, which the count cannot see.
 */
export const QR_BADGE_FRACTION = 0.3;
/** Modules of white around the code (the spec's minimum is 4). */
export const QR_QUIET_ZONE = 4;

/** What `qrcode`'s BitMatrix offers that this file reads. */
export interface QrMatrix {
  size: number;
  get(row: number, col: number): number | boolean;
}

export interface BrandedQrModel {
  /** Modules per side, without the quiet zone. */
  modules: number;
  /** viewBox side, quiet zone included (module units). */
  viewBox: number;
  /** One SVG path for every dark module, module units. */
  path: string;
  badge: {
    cx: number;
    cy: number;
    /** Radius of the white disc, out to the ring's outer edge. */
    r: number;
    /** Width of the gold ring (drawn inside r). */
    ring: number;
  };
  /** Where the wordmark image goes, fitted inside the disc. */
  logo: { x: number; y: number; width: number; height: number };
}

/** The geometry of the badge on a code `modules` wide (quiet zone `quiet`). */
export function badgeGeometry(modules: number, quiet: number = QR_QUIET_ZONE, fraction: number = QR_BADGE_FRACTION) {
  const c = quiet + modules / 2;
  const r = (modules * fraction) / 2;
  const ring = Math.max(0.35, r * 0.07);
  // The wordmark fills ~68% of the inner diameter, at its own aspect ratio.
  const inner = (r - ring) * 2 * 0.68;
  const width = QR_WORDMARK_RATIO >= 1 ? inner : inner * QR_WORDMARK_RATIO;
  const height = QR_WORDMARK_RATIO >= 1 ? inner / QR_WORDMARK_RATIO : inner;
  return {
    badge: { cx: c, cy: c, r, ring },
    logo: { x: c - width / 2, y: c - height / 2, width, height },
  };
}

/**
 * True when the badge's disc touches module (row, col) at all — a module
 * partly under the disc counts as lost. Coordinates without the quiet zone.
 */
export function moduleUnderBadge(row: number, col: number, modules: number, fraction: number = QR_BADGE_FRACTION): boolean {
  const c = modules / 2;
  const r = (modules * fraction) / 2;
  const nx = Math.max(col, Math.min(c, col + 1));
  const ny = Math.max(row, Math.min(c, row + 1));
  return (nx - c) ** 2 + (ny - c) ** 2 < r * r;
}

export function brandedQrModel(matrix: QrMatrix, quiet: number = QR_QUIET_ZONE): BrandedQrModel {
  const n = matrix.size;
  const parts: string[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      // Modules under the badge are not drawn: the disc covers them anyway,
      // and a printer's bleed then cannot show them at its edge.
      if (matrix.get(row, col) && !moduleUnderBadge(row, col, n)) {
        parts.push(`M${col + quiet} ${row + quiet}h1v1h-1z`);
      }
    }
  }
  return { modules: n, viewBox: n + quiet * 2, path: parts.join(""), ...badgeGeometry(n, quiet) };
}
