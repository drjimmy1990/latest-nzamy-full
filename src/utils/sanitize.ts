/**
 * HTML sanitisers for strings that reach dangerouslySetInnerHTML.
 *
 * HOW THEY WORK (one pass, left to right, never re-scanned):
 *   - the input is split into tag-shaped tokens (`<`, optional `/`, a tag
 *     name, anything up to the next `>` with no `<` inside) and text between
 *     them;
 *   - an ALLOWED tag is written out again from a fixed string built here —
 *     its own attributes are never copied, only re-built from the one value
 *     each tag may carry (an `href` checked against the rules below, or class
 *     names from a safe character set);
 *   - any other tag token is dropped, as before;
 *   - in the text, every `<` and `>` becomes `&lt;` / `&gt;`.
 * So every `<` in the output is one this file wrote: the output holds no
 * markup but the allowed tags in their fixed form. Entities (`&amp;` …) and
 * quotes in the text are left as they are: in text they only ever decode to
 * characters.
 *
 * Pure (no imports): `node --test` loads it directly (sanitize.test.ts,
 * src/app/laws/[slug]/_highlight-html.test.ts).
 */

/** `<` [space] [/] [space] name rest `>` — `rest` holds no `<` or `>`. */
const TAG_TOKEN = /<(\s*)(\/?)(\s*)([A-Za-z][A-Za-z0-9]*)([^<>]*)>/g;
/** A complete HTML comment; dropped (it was invisible before too). */
const COMMENT = /<!--[\s\S]*?-->/g;

/** Rebuilds one allowed tag, or returns null when the tag is not allowed. */
type TagRenderer = (name: string, closing: boolean, attrs: string) => string | null;

function escapeText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeWith(html: string, render: TagRenderer): string {
  const input = String(html ?? "").replace(COMMENT, "");
  let out = "";
  let last = 0;
  TAG_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_TOKEN.exec(input)) !== null) {
    const [token, spaceBefore, slash, spaceAfter, rawName, attrs] = m;
    out += escapeText(input.slice(last, m.index));
    last = m.index + token.length;
    // `<strongx>` / `<a-b>`: the name runs on, so it is not that tag.
    const nameEnds = attrs === "" || /^[\s/]/.test(attrs);
    const rendered = nameEnds ? render(rawName.toLowerCase(), slash === "/", attrs) : null;
    if (rendered !== null) {
      out += rendered;
    } else if (spaceBefore === "" && spaceAfter === "") {
      // A real tag that is not allowed: dropped.
    } else {
      // `< p>` is not a tag in HTML; it stays visible text.
      out += escapeText(token);
    }
  }
  out += escapeText(input.slice(last));
  return out;
}

/* ── <a href> ──────────────────────────────────────────────────────────── */

const LINK_STYLE = "color:#C8A762;text-decoration:underline";
const HREF_ATTR = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const NAMED_REFS: Readonly<Record<string, string>> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function decodeAttrEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#[xX]([0-9A-Fa-f]+)|(amp|quot|apos|lt|gt));?/g, (whole, dec, hex, named) => {
    if (named) return whole.endsWith(";") ? NAMED_REFS[named] : whole;
    const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "\uFFFD";
    return String.fromCodePoint(code);
  });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The href as it may be written back, or null. Allowed: `#…` anchors,
 * `https://…`, and same-site paths `/…` — but not `//…` or `/\…` (another
 * host). Checked on the value the browser will actually use: entities decoded
 * and tab/newline removed first; any other control character refuses it.
 */
export function safeHref(raw: string): string | null {
  const href = decodeAttrEntities(raw).replace(/[\t\n\r]/g, "");
  if (href === "" || /[\u0000-\u001f\u007f]/.test(href)) return null;
  const ok =
    href.startsWith("#") ||
    href.startsWith("https://") ||
    (href.startsWith("/") && !/^\/[/\\&]/.test(href));
  return ok ? href : null;
}

function renderInlineTag(name: string, closing: boolean, attrs: string): string | null {
  switch (name) {
    case "strong":
    case "em":
      return closing ? `</${name}>` : `<${name}>`;
    case "br":
      return closing ? "" : "<br>";
    case "a": {
      if (closing) return "</a>";
      const m = attrs.match(HREF_ATTR);
      const href = m ? safeHref(m[1] ?? m[2] ?? "") : null;
      return href === null ? "<a>" : `<a href="${escapeAttr(href)}" style="${LINK_STYLE}">`;
    }
    default:
      return null;
  }
}

/**
 * Inline sanitiser. Allowlist: <strong>, <em>, <br>, and <a> with a safe
 * href (see safeHref) and the brand link style. Every other attribute is
 * dropped; every other tag is removed.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeWith(html, renderInlineTag);
}

/* ── Rich (review / document) ─────────────────────────────────────────── */

const RICH_TAGS = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em"]);
const CLASS_ATTR = /\sclass=(["'])(.*?)\1/i;
const SAFE_CLASS_NAME = /^[a-zA-Z0-9_:/\-[\].%]+$/;

function renderRichTag(name: string, closing: boolean, attrs: string): string | null {
  if (name === "br") return closing ? "" : "<br>";
  if (!RICH_TAGS.has(name)) return null;
  if (closing) return `</${name}>`;
  const className = attrs
    .match(CLASS_ATTR)?.[2]
    .split(/\s+/)
    .filter((n) => SAFE_CLASS_NAME.test(n))
    .join(" ");
  return className ? `<${name} class="${className}">` : `<${name}>`;
}

/**
 * Sanitizes richer review/document HTML while keeping only structural tags.
 * Allows class names for existing Tailwind document styling, but strips all
 * other attributes such as event handlers, inline styles, href/src, etc.
 */
export function sanitizeRichHtml(html: string): string {
  return sanitizeWith(html, renderRichTag);
}

/**
 * Convert markdown-style bold (**text**) to <strong>text</strong>
 * then sanitize the result. Use this instead of raw replace + dangerouslySetInnerHTML.
 */
export function markdownBoldToSafeHtml(text: string): string {
  let html = text;
  // Inline code marks: `text` → text. The corpus uses them around status
  // words («`[ملغاة]`») and they rendered as literal backticks (owner test
  // 2026-09-28). Legal text has no code, so the marks are dropped.
  html = html.replace(/`([^`\n]+)`/g, "$1");
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* (but not ** which is bold)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  // Links: [text](url) — styled inline so they're visible in dark mode
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#C8A762;text-decoration:underline">$1</a>');
  return sanitizeHtml(html);
}
