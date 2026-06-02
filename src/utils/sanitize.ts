/**
 * Lightweight HTML sanitizer — allows only safe inline tags.
 * Used before dangerouslySetInnerHTML to prevent XSS injection.
 * Allowlist: <strong>, <em>, <br> only.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(\/?)\s*(strong|em)\b[^>]*>/gi, "<$1$2>")
    .replace(/<\s*br\b[^>]*\/?\s*>/gi, "<br>")
    .replace(/<\s*\/\s*br\s*>/gi, "")
    .replace(/<\/?(?!(?:strong|em|br)\b)[a-z][^>]*>/gi, "");
}

/**
 * Sanitizes richer review/document HTML while keeping only structural tags.
 * Allows class names for existing Tailwind document styling, but strips all
 * other attributes such as event handlers, inline styles, href/src, etc.
 */
export function sanitizeRichHtml(html: string): string {
  return html
    .replace(/<\s*(\/?)\s*(h2|h3|p|ul|ol|li|strong|em)\b([^>]*)>/gi, (_match, closing: string, tag: string, attrs: string) => {
      if (closing) return `</${tag.toLowerCase()}>`;

      const classMatch = attrs.match(/\sclass=(["'])(.*?)\1/i);
      const className = classMatch?.[2]
        .split(/\s+/)
        .filter((name) => /^[a-zA-Z0-9_:/\-[\].%]+$/.test(name))
        .join(" ");

      return className ? `<${tag.toLowerCase()} class="${className}">` : `<${tag.toLowerCase()}>`;
    })
    .replace(/<\s*br\b[^>]*\/?\s*>/gi, "<br>")
    .replace(/<\s*\/\s*br\s*>/gi, "")
    .replace(/<\/?(?!(?:h2|h3|p|ul|ol|li|strong|em|br)\b)[a-z][^>]*>/gi, "");
}

/**
 * Convert markdown-style bold (**text**) to <strong>text</strong>
 * then sanitize the result. Use this instead of raw replace + dangerouslySetInnerHTML.
 */
export function markdownBoldToSafeHtml(text: string): string {
  const withBold = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return sanitizeHtml(withBold);
}
