/**
 * ownerLinks.ts — the owner's own links between documents, as his library
 * files state them in their frontmatter: what replaced or repealed a document,
 * what it replaced or repealed, which laws (and articles) an instrument
 * affects, and related laws.
 *
 * The parsers normalise the many shapes the files use into one list
 * (`library.laws.owner_links` / `library.decrees_circulars.owner_links`,
 * server-only, migration 20261118_10), and the graph watchdog turns the list
 * into graph links (`src/lib/ai/graphOwnerLinks.ts`). Nothing is guessed here:
 * a reference keeps what it states (a registry id, a slug, a BOE guid, a
 * title, article texts), and the graph resolves it against the live library,
 * strictly.
 *
 * Pure: the only I/O, turning a file path into the target file's slug and id,
 * is the caller's `resolvePath`.
 */

export type OwnerLinkKind = "superseded_by" | "repealed_by" | "supersedes" | "repeals" | "affects" | "related";

export interface OwnerLink {
  kind: OwnerLinkKind;
  /** The title the owner wrote (decree details included), as written. */
  name?: string;
  /** A registry id: LAW-00-1161, NCAR-DOC-08196, … */
  id?: string;
  /** A library slug, stated or read from the target file a path names. */
  slug?: string;
  /** A BOE guid (laws.law_guid). */
  guid?: string;
  /** For `affects`: the article texts as written («46», «المادة الثالثة», «23 مكرر»). */
  articles?: string[];
}

/** Frontmatter key → the kind of link it states. Only these keys are read. */
export const OWNER_LINK_KEYS: Readonly<Record<string, OwnerLinkKind>> = {
  superseded_by: "superseded_by",
  superseded_by_registry_id: "superseded_by",
  superseded_by_slug: "superseded_by",
  superseded_by_path: "superseded_by",
  repealed_by: "repealed_by",
  repealed_by_path: "repealed_by",
  repealed_by_slug: "repealed_by",
  repealed_by_registry_id: "repealed_by",
  supersedes: "supersedes",
  supersedes_slug: "supersedes",
  supersedes_path: "supersedes",
  supersedes_registry_id: "supersedes",
  repeals: "repeals",
  repeals_slug: "repeals",
  repeals_path: "repeals",
  repeals_registry_id: "repeals",
  affected_laws: "affects",
  related_laws: "related",
};

/**
 * Caps, per FILE across every link key (OWNER_LINKS_MAX) and per link
 * (ARTICLES_MAX, NAME_MAX, ARTICLE_TEXT_MAX). Owner package 19 Nov, item 1.3:
 * 40 links cut the last `affected_laws` of a decree that amends 48 laws, with
 * no report. Raised to 500 / 300, and whatever is still cut is reported
 * through the `onCut` argument of extractOwnerLinks (the parsers print
 * «owner links cut»). `owner_links` is plain jsonb: no database limit. The
 * same cap bounds the read-back (parseOwnerLinks), so the graph sees every
 * stored link.
 */
export const OWNER_LINKS_MAX = 500;
export const NAME_MAX = 300;
export const ARTICLES_MAX = 300;
export const ARTICLE_TEXT_MAX = 80;

/** What a cap removed from one file's links. */
export type OwnerLinkCut =
  /** Links beyond OWNER_LINKS_MAX (after de-duplication), not kept. */
  | { what: "links"; kept: number; dropped: number }
  /** Article texts of one link beyond ARTICLES_MAX (after de-duplication), not kept. */
  | { what: "articles"; link: string; kept: number; dropped: number }
  /** A title longer than NAME_MAX, shortened. */
  | { what: "name"; length: number; kept: number; text: string }
  /** An article text longer than ARTICLE_TEXT_MAX, shortened. */
  | { what: "article_text"; length: number; kept: number; text: string };
export type OwnerLinkCutReporter = (cut: OwnerLinkCut) => void;

/** One report line for a cut (the parsers prefix the file name). */
export function describeOwnerLinkCut(cut: OwnerLinkCut): string {
  switch (cut.what) {
    case "links":
      return `${cut.dropped} link(s) beyond the cap of ${OWNER_LINKS_MAX} not kept (${cut.kept} kept)`;
    case "articles":
      return `link «${cut.link}»: ${cut.dropped} article(s) beyond the cap of ${ARTICLES_MAX} not kept (${cut.kept} kept)`;
    case "name":
      return `a title of ${cut.length} characters shortened to ${cut.kept}: «${cut.text.slice(0, 60)}…»`;
    case "article_text":
      return `an article text of ${cut.length} characters shortened to ${cut.kept}: «${cut.text.slice(0, 40)}…»`;
  }
}

/** Turns a library file path into the target file's slug / registry id; undefined when it names nothing safe. */
export type OwnerLinkPathResolver = (path: string) => { slug?: string; id?: string } | undefined;

const REGISTRY_ID_RE = /^([A-Z]{2,}(?:-[A-Z]{2,})*-\d+(?:-\d+)*)\b/;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
/** A library file path inside an item: «… — 01_المكتبة_القانونية/أنظمة ولوائح/…/x.md». */
const PATH_RE = /(?:01_المكتبة_القانونية\/)?(?:أنظمة ولوائح|أوامر وتعاميم)\/[^؛;\n]*?\.md/u;
/** «… ؛ ونظام …»: the «و» joining a second title. */
const LEADING_WAW_RE = /^و(?=(?:ال)?(?:نظام|لائحة|اللائحة|تنظيم|قواعد|ضوابط|الضوابط|القواعد))/u;

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && (v.trim() === "" || v.trim().toLowerCase() === "null"));

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
/** `cap`, telling `onCut` when it shortens. */
const capReported = (s: string, n: number, what: "name" | "article_text", onCut?: OwnerLinkCutReporter) => {
  if (s.length > n) onCut?.({ what, length: s.length, kept: n, text: s });
  return cap(s, n);
};

/** Words that open an editorial note inside a reference: «نظام باء (ملاحظة المحرر: …)». */
const NOTE_RE = /[\s(\[،,:؛-]*(?:ملاحظة|ملحوظة|ملاحظات|تنبيه|حاشية)[\s\S]*$/u;
/** A bracketed aside with no number in it; a number keeps «(م/164)» and «رقم (1550)», which identify the law. */
const ASIDE_RE = /[(\[][^()\[\]0-9٠-٩]*[)\]]/gu;

/**
 * The title a reference states, without editorial asides: what is stored as a
 * link's name (and so what the graph can ever show) is never a note.
 */
export function titleOnly(text: string): string {
  return cleanText(text.replace(NOTE_RE, "").replace(ASIDE_RE, " ")).replace(/[\s،,:؛—–-]+$/u, "");
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** One written reference (a string) → what it states. */
function refFromString(raw: string, resolvePath?: OwnerLinkPathResolver, onCut?: OwnerLinkCutReporter): Omit<OwnerLink, "kind"> | null {
  let text = cleanText(raw.replace(/\\/g, "/"));
  if (!text) return null;
  const out: Omit<OwnerLink, "kind"> = {};
  const path = text.match(PATH_RE)?.[0];
  if (path) {
    const hit = resolvePath?.(path);
    if (hit?.slug) out.slug = hit.slug;
    if (hit?.id) out.id = hit.id;
    text = cleanText(text.replace(path, "").replace(/[—–-]+\s*$/u, ""));
  }
  if (GUID_RE.test(text)) return { ...out, guid: text.toLowerCase() };
  if (SLUG_RE.test(text)) return { ...out, slug: out.slug ?? text };
  const id = text.match(REGISTRY_ID_RE)?.[1];
  if (id) {
    out.id = out.id ?? id;
    // «LAW-00-0114 (نظام التنفيذ …) — …»: the id is the reference; the rest is a note.
    return out;
  }
  text = titleOnly(text.replace(LEADING_WAW_RE, ""));
  if (text) out.name = capReported(text, NAME_MAX, "name", onCut);
  return out.name || out.slug || out.id || out.guid ? out : null;
}

/**
 * The article texts of one link, de-duplicated, at most ARTICLES_MAX. With
 * `onCut`, every text shortened and the count left out are reported
 * (`link` names the link in that report).
 */
function articleTexts(values: unknown[], onCut?: OwnerLinkCutReporter, link = ""): string[] {
  const out: string[] = [];
  const over = new Set<string>();
  for (const v of values) {
    const list = Array.isArray(v) ? v : isBlank(v) ? [] : [v];
    for (const a of list) {
      if (isBlank(a) || (typeof a !== "string" && typeof a !== "number")) continue;
      const full = cleanText(String(a));
      if (out.length >= ARTICLES_MAX) {
        if (!onCut) return out;
        const t = cap(full, ARTICLE_TEXT_MAX);
        if (t && !out.includes(t)) over.add(t);
        continue;
      }
      const t = capReported(full, ARTICLE_TEXT_MAX, "article_text", onCut);
      if (t && !out.includes(t)) out.push(t);
    }
  }
  if (over.size > 0) onCut?.({ what: "articles", link, kept: out.length, dropped: over.size });
  return out;
}

/** One object entry ({name, law_id, law_file, boe_guid, affected_articles, …}) → what it states. */
function refFromObject(o: Record<string, unknown>, resolvePath?: OwnerLinkPathResolver, onCut?: OwnerLinkCutReporter): Omit<OwnerLink, "kind"> | null {
  const name = [o.name, o.law_name].find((v) => typeof v === "string" && !isBlank(v)) as string | undefined;
  const base: Omit<OwnerLink, "kind"> = name ? refFromString(name, resolvePath, onCut) ?? {} : {};
  const file = [o.law_file].find((v) => typeof v === "string" && !isBlank(v)) as string | undefined;
  if (file) {
    const hit = file.match(PATH_RE) ? resolvePath?.(file.match(PATH_RE)?.[0] as string) : undefined;
    if (hit?.slug && !base.slug) base.slug = hit.slug;
    if (hit?.id && !base.id) base.id = hit.id;
  }
  // Owner file 18 («خامساً» 5): `law_id` — the target file's own registry id,
  // stated outright. It names the law exactly, so it wins over an id read
  // out of the title text. Only a registry-shaped value (LAW-00-0897) counts.
  const lawId = typeof o.law_id === "string" ? o.law_id.trim() : "";
  if (lawId) {
    const id = lawId.match(REGISTRY_ID_RE)?.[1];
    if (id && id === lawId) base.id = id;
  }
  const guid = typeof o.boe_guid === "string" && GUID_RE.test(o.boe_guid.trim()) ? o.boe_guid.trim().toLowerCase() : undefined;
  if (guid && !base.guid) base.guid = guid;
  const articles = articleTexts(
    [o.affected_articles, o.amended_articles, o.added_articles],
    onCut,
    base.name || base.id || base.slug || base.guid || "",
  );
  if (articles.length) base.articles = articles;
  return base.name || base.slug || base.id || base.guid ? base : null;
}

/** A frontmatter value (string, «؛»-separated string, list, object) → its references. */
function refsOf(value: unknown, resolvePath?: OwnerLinkPathResolver, onCut?: OwnerLinkCutReporter): Array<Omit<OwnerLink, "kind">> {
  if (isBlank(value)) return [];
  const items = Array.isArray(value) ? value : [value];
  const out: Array<Omit<OwnerLink, "kind">> = [];
  for (const item of items) {
    if (isBlank(item)) continue;
    if (typeof item === "string") {
      for (const part of item.split(/[؛;]/u)) {
        const r = refFromString(part, resolvePath, onCut);
        if (r) out.push(r);
      }
    } else if (item && typeof item === "object" && !Array.isArray(item)) {
      const r = refFromObject(item as Record<string, unknown>, resolvePath, onCut);
      if (r) out.push(r);
    }
  }
  return out;
}

const sameRef = (a: OwnerLink, b: OwnerLink) =>
  a.kind === b.kind && a.name === b.name && a.id === b.id && a.slug === b.slug && a.guid === b.guid &&
  (a.articles ?? []).join("|") === (b.articles ?? []).join("|");

/**
 * The owner's links in one file's frontmatter, in key order, de-duplicated,
 * at most OWNER_LINKS_MAX. Empty when the file states none. `onCut` (optional)
 * hears every cap that removed or shortened something: links beyond the cap
 * (one call, with the count), articles beyond the cap of a link, a title or an
 * article text shortened. The returned list is the same with or without it.
 */
export function extractOwnerLinks(
  meta: Readonly<Record<string, unknown>>,
  resolvePath?: OwnerLinkPathResolver,
  onCut?: OwnerLinkCutReporter,
): OwnerLink[] {
  const out: OwnerLink[] = [];
  const dropped: OwnerLink[] = [];
  for (const [key, kind] of Object.entries(OWNER_LINK_KEYS)) {
    if (!(key in meta)) continue;
    if (out.length >= OWNER_LINKS_MAX && !onCut) break;
    for (const ref of refsOf(meta[key], resolvePath, out.length >= OWNER_LINKS_MAX ? undefined : onCut)) {
      // Articles belong to `affects` only.
      const link: OwnerLink = { kind, ...ref };
      if (kind !== "affects") delete link.articles;
      if (out.some((x) => sameRef(x, link))) continue;
      if (out.length < OWNER_LINKS_MAX) out.push(link);
      else if (!onCut) return out;
      else if (!dropped.some((x) => sameRef(x, link))) dropped.push(link);
    }
  }
  if (dropped.length > 0) onCut?.({ what: "links", kept: out.length, dropped: dropped.length });
  return out;
}

/** Reads a stored `owner_links` value back (jsonb from the database); anything malformed is dropped. */
export function parseOwnerLinks(raw: unknown): OwnerLink[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<string>(Object.values(OWNER_LINK_KEYS));
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
  const out: OwnerLink[] = [];
  for (const r of raw.slice(0, OWNER_LINKS_MAX)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.kind !== "string" || !kinds.has(o.kind)) continue;
    const link: OwnerLink = { kind: o.kind as OwnerLinkKind };
    const name = str(o.name);
    const id = str(o.id);
    const slug = str(o.slug);
    const guid = str(o.guid);
    if (name) link.name = cap(name, NAME_MAX);
    if (id) link.id = id;
    if (slug) link.slug = slug;
    if (guid) link.guid = guid.toLowerCase();
    if (Array.isArray(o.articles)) {
      const a = articleTexts([o.articles]);
      if (a.length) link.articles = a;
    }
    if (link.name || link.id || link.slug || link.guid) out.push(link);
  }
  return out;
}
