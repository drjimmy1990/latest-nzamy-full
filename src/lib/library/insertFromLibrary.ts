/**
 * insertFromLibrary.ts — N01-24 «إدراج من مسودة المكتبة / مجلداتي»: what a
 * pick from the library becomes inside a memo, contract or case editor, and
 * where it goes (at the cursor).
 *
 * Two sources, both the caller's own and both already behind his session:
 *  - «مسودة المكتبة» — the draft cart (GET /api/v1/drafts/cart): articles he
 *    added from the reader, WITH their text, so a pick inserts a quote:
 *    the citation line, then the article's words in «…».
 *  - «مجلداتي» — smart folders (GET /api/library/folders): saved documents
 *    with a title and a slug only, so a pick inserts a citation (the title
 *    and the library link). Folder notes are never read (Q480 privacy).
 *
 * Pure, no imports (node --test loads it directly).
 */

export interface InsertableItem {
  key: string;
  /** What the picker shows. */
  label: string;
  /** A second, muted line in the picker (the law name, the folder…). */
  detail: string;
  /** The text inserted at the cursor. */
  text: string;
}

/** `insert` placed between `start` and `end` of `value`, on its own line(s); the caret lands after it. */
export function insertAtCursor(value: string, start: number | null | undefined, end: number | null | undefined, insert: string): { value: string; caret: number } {
  const len = value.length;
  const s = typeof start === "number" && start >= 0 && start <= len ? start : len;
  const e = typeof end === "number" && end >= s && end <= len ? end : s;
  const before = value.slice(0, s);
  const after = value.slice(e);
  const lead = before.length === 0 || before.endsWith("\n") ? "" : "\n";
  const trail = after.length === 0 || after.startsWith("\n") ? "" : "\n";
  const next = `${before}${lead}${insert}${trail}${after}`;
  return { value: next, caret: before.length + lead.length + insert.length };
}

/** The reader URL of a saved document (same routes as «مكتبتي»'s reading history). */
export function libraryHref(entityType: unknown, slug: string): string {
  const safe = /%[0-9A-Fa-f]{2}/.test(slug) ? slug : encodeURIComponent(slug);
  if (entityType === "order") return `/laws/orders/${safe}`;
  if (entityType === "precedent") return `/precedents/${safe}`;
  return `/laws/${safe}`;
}

const KIND_AR: Record<string, string> = { law: "نظام", order: "أمر أو تعميم", precedent: "سوابق قضائية", book: "كتاب" };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** GET /api/library/folders → one item per saved document (no notes). */
export function folderItems(body: unknown, origin: string): InsertableItem[] {
  const folders = (body as { folders?: unknown } | null)?.folders;
  if (!Array.isArray(folders)) return [];
  const out: InsertableItem[] = [];
  for (const f of folders) {
    const folderName = str((f as { name?: unknown }).name);
    const items = (f as { smart_folder_items?: unknown }).smart_folder_items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const row = it as { id?: unknown; entity_type?: unknown; entity_id?: unknown; title?: unknown };
      const title = str(row.title);
      const slug = str(row.entity_id);
      if (!title || !slug) continue;
      const url = `${origin}${libraryHref(row.entity_type, slug)}`;
      out.push({
        key: `f-${str(row.id) || slug}-${folderName}`,
        label: title,
        detail: [KIND_AR[str(row.entity_type)] ?? "", folderName].filter(Boolean).join(" · "),
        text: `«${title}» — مكتبة الأنظمة: ${url}`,
      });
    }
  }
  return out;
}

/** GET /api/v1/drafts/cart → one item per article added to the draft (quote + citation). */
export function cartItems(body: unknown): InsertableItem[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  if (!Array.isArray(items)) return [];
  const out: InsertableItem[] = [];
  for (const row of items) {
    const p = ((row as { payload?: unknown }).payload ?? {}) as Record<string, unknown>;
    const lawName = str(p.lawName);
    const num = str(p.articleNum) || str((row as { article_number?: unknown }).article_number);
    const title = str(p.articleTitle);
    const text = str(p.articleText);
    if (!lawName || !num) continue;
    const head = `${lawName} — ${title || `المادة ${num}`}`;
    out.push({
      key: `c-${str(p.lawSlug)}-${num}`,
      label: title || `المادة ${num}`,
      detail: lawName,
      text: text ? `${head}:\n«${text}»` : head,
    });
  }
  return out;
}
