/**
 * principleLink.ts — the catalogue's principle cards open the principle inside
 * its collection (owner test 2026-09-28): /precedents/<collection>#<principle>.
 *
 * The collection page renders each principle with DOM id = the principle's
 * database id (_principle-block.tsx) and, on load, pages in windows until the
 * hashed id is present, then scrolls to it.
 *
 * Pure, no imports: `node --test src/app/laws/principleLink.test.ts`.
 */

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** The collection page URL with the principle as its anchor, or null when either id is missing. */
export function principleHref(collectionId: unknown, principleId: unknown): string | null {
  const col = text(collectionId);
  const pid = text(principleId);
  if (!col || !pid) return null;
  return `/precedents/${encodeURIComponent(col)}#${encodeURIComponent(pid)}`;
}

/**
 * `principles.principle_number` as a label value, or null when it is not a
 * real number: absent, blank, 0, «—», or text without a single digit. The
 * card never prints «مبدأ رقم 0» or «مبدأ رقم null».
 */
export function realPrincipleNumber(raw: unknown): string | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? String(raw) : null;
  const s = text(raw);
  if (!s || s.length > 24) return null;
  if (!/[0-9٠-٩۰-۹]/.test(s)) return null;
  if (/^[0٠۰]+$/.test(s)) return null;
  return s;
}

/**
 * The principle id named by a URL hash («#abc», «#%D9%85…»), or "" when there
 * is none. A malformed escape is returned raw rather than thrown.
 */
export function principleIdFromHash(hash: string | null | undefined): string {
  const raw = String(hash ?? "").replace(/^#/, "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
