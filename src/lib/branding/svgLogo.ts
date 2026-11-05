/**
 * svgLogo.ts — q346: what an uploaded SVG logo may contain, and at what size it
 * is drawn. Pure, so svgLogo.test.ts pins every rule; the drawing itself is
 * src/components/letterhead/rasterizeSvgLogo.ts (browser only).
 *
 * THE DESIGN: an SVG is rasterised IN THE BROWSER into a PNG before upload. No
 * SVG is ever stored or served: the server still accepts image bytes only
 * (sniffLogoImage), and the `branding` bucket's MIME list and logo_path CHECK
 * are unchanged. An <img> drawn on a canvas runs no script and fetches nothing,
 * so these checks are a second wall: they refuse the hostile file with a clear
 * message instead of drawing it.
 */

const NOT_SVG = "الملف ليس SVG";
const NOT_ALLOWED = "الشعار يحتوي عناصر غير مسموحة";
const TOO_BIG = "حجم ملف SVG أكبر من ٥٠٠ ك.ب";

export const SVG_LOGO_MAX_BYTES = 512_000;

// BOM, XML declaration, comments and a doctype may come before the root.
const SVG_ROOT = /^﻿?\s*(?:<\?xml[^>]*\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>)\s*)*<svg[\s/>]/i;

const FORBIDDEN: readonly RegExp[] = [
  /<!ENTITY/i,
  /<!DOCTYPE/i,
  /<\?xml-stylesheet/i,
  // Any namespace prefix: <x:script> is a script when x is the SVG namespace.
  /<(?:[a-z0-9_.-]+:)?(?:script|foreignObject|iframe|embed|object|audio|video|link|meta|base)[\s/>]/i,
  // \b, not a space: <svg/onload=…> and x="1"onload=… have no space before it.
  /\bon[a-z]+\s*=/i,
  /(?:javascript|vbscript):/i,
  /@import/i,
  /attributeName\s*=\s*["']?(?:[a-z0-9_.-]+:)?href/i,
];

// href in any namespace (xlink:href, or a prefix the file made up), and src.
const LINK_ATTR = /(?:^|[\s"'/])(?:[a-z0-9_.-]+:)?(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SAFE_LINK = /^(?:#|data:image\/(?:png|jpeg|webp)[;,])/i;
// A CSS url() may only name a fragment of this same file.
const FOREIGN_CSS_URL = /url\(\s*["']?\s*(?!#)/i;

export function svgLogoRejectReason(text: string): string | null {
  if (!SVG_ROOT.test(text)) return NOT_SVG;
  if (FORBIDDEN.some((re) => re.test(text)) || FOREIGN_CSS_URL.test(text)) return NOT_ALLOWED;
  for (const m of text.matchAll(LINK_ATTR)) {
    if (!SAFE_LINK.test((m[1] ?? m[2] ?? m[3] ?? "").trim())) return NOT_ALLOWED;
  }
  if (new TextEncoder().encode(text).length > SVG_LOGO_MAX_BYTES) return TOO_BIG;
  return null;
}

const rootTag = (text: string): RegExpExecArray | null => /<svg(?=[\s/>])([^>]*)>/i.exec(text);

// (?:^|\s), so stroke-width= is not width=.
const rootAttr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return m ? (m[1] ?? m[2] ?? "") : null;
};

const pixels = (raw: string | null): number | null => {
  const m = raw === null ? null : /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/i.exec(raw);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The root's own width and height (unitless or px), else the viewBox's, else null. */
export function svgIntrinsicSize(text: string): { width: number; height: number } | null {
  const root = rootTag(text);
  if (!root) return null;
  const attrs = root[1];
  const w = pixels(rootAttr(attrs, "width"));
  const h = pixels(rootAttr(attrs, "height"));
  if (w !== null && h !== null) return { width: w, height: h };
  const parts = (rootAttr(attrs, "viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return { width: parts[2], height: parts[3] };
  return null;
}

/** The drawn size: the longest side scaled to `maxSide`, the shape kept. Nonsense sizes draw square. */
export function rasterSize(w: number, h: number, maxSide = 1600): { width: number; height: number } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: maxSide, height: maxSide };
  const scale = maxSide / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * The file with its root sized to the target. Some browsers report no natural
 * size for a viewBox-only SVG and refuse to draw it; the old size moves to the
 * viewBox when there was none, or the drawing would not scale with the root.
 */
export function svgForRaster(text: string, target: { width: number; height: number }, intrinsic: { width: number; height: number }): string {
  const root = rootTag(text);
  if (!root) return text;
  const stripped = root[1].replace(/(^|\s)(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
  const viewBox = rootAttr(stripped, "viewBox") === null ? ` viewBox="0 0 ${intrinsic.width} ${intrinsic.height}"` : "";
  const open = `<svg width="${target.width}" height="${target.height}"${viewBox}${stripped}>`;
  return text.slice(0, root.index) + open + text.slice(root.index + root[0].length);
}
