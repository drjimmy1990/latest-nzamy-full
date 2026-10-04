/**
 * entity-prescan.ts — cross-domain identity lookup for superseded_duplicate
 * verification (أولوية 2، خطة_المتبقي_الشاملة_2026-08-22.md, EntityPreScanner).
 * ─────────────────────────────────────────────────────────────────────────────
 * ب-133 (parse-laws.ts) and ب-137 (parse-decrees.ts) each verify a
 * `superseded_duplicate` tag's `superseded_by` pointer against a real,
 * untagged survivor — but only within their OWN corpus. Neither parser ever
 * sees the other's files, so a decree superseded by a LAW (or vice versa) can
 * never be verified by either parser alone — confirmed live: قرار سامي دعم
 * مراكز الوثائق (`أوامر وتعاميم`) is tagged superseded_by a instrument whose
 * survivor is a LAW, and parse-decrees.ts has had no way to check that.
 *
 * This module does one cheap, FRONTMATTER-ONLY pass across both category
 * roots (no article/body parsing — id/status/superseded_by all sit in the
 * first few hundred bytes of any file in this corpus) and hands back a
 * read-only index either parser can consult as a second, independent lookup
 * AFTER its own in-domain resolution has already failed. The two parsers run
 * as separate `npx tsx` subprocesses (library-parse.mjs invokes each one
 * independently — there is no shared process to hold one index for both), so
 * "شارك بلا دمج الكود" means: same module, called independently by each
 * process, not a value passed between them.
 *
 * Never a source of truth for content, and never a general-purpose id
 * lookup — only for "does this exact id exist somewhere, as a real untagged
 * file, right now". A miss here is not an error: the caller's existing
 * "unverified, refuse to guess" path is unchanged, so this can only turn a
 * false negative (a real cross-domain reference wrongly flagged unverified)
 * into a true positive — it can never manufacture a false positive, because
 * `resolveCrossDomain` only ever returns an UNTAGGED survivor.
 */
import * as fs from "fs";
import * as path from "path";
import { parseFrontmatter } from "./frontmatter";
import { applyExclusions } from "./exclusions";
import { resolveCorpusScope } from "../corpus-scope";

export type EntityKind = "law" | "decree";

export interface EntityRef {
  kind: EntityKind;
  path: string;
  isSupersededDuplicate: boolean;
}

export type EntityIndex = Map<string, EntityRef>;

const CATEGORY_FOLDERS: Record<EntityKind, string> = {
  law: "أنظمة ولوائح",
  decree: "أوامر وتعاميم",
};

// Frontmatter blocks in this corpus — even elaborate merged-regulation ones —
// run to a few KB at most, and id/status/superseded_by sit near the top
// regardless. 32KB is a generous multiple of that, kept small deliberately:
// this scan touches ~4,000 files every run and must stay cheap. A file whose
// frontmatter genuinely exceeds this cap is simply not indexed (parseFrontmatter
// finds no closing `---` in the truncated buffer and returns empty meta) — a
// missed opportunity, never a wrong answer.
const PRESCAN_READ_CAP = 32 * 1024;

function readFrontmatterCheap(file: string): Record<string, unknown> | null {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const buf = Buffer.alloc(PRESCAN_READ_CAP);
    const bytesRead = fs.readSync(fd, buf, 0, PRESCAN_READ_CAP, 0);
    const raw = buf.subarray(0, bytesRead).toString("utf-8");
    return parseFrontmatter(raw, file).meta;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function walkMd(dir: string, out: string[] = []): string[] {
  let ents: fs.Dirent[];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(full, out);
    else if (e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * Build the cross-domain identity index from both category roots' frontmatter
 * alone. Either root may not exist (a narrower/test input) — that side of the
 * index is then simply empty, never an error.
 */
export function buildEntityIndex(roots: Partial<Record<EntityKind, string>>): EntityIndex {
  const index: EntityIndex = new Map();

  function scan(kind: EntityKind, root: string | undefined) {
    if (!root || !fs.existsSync(root)) return;
    const { kept } = applyExclusions(walkMd(root));
    for (const file of kept) {
      const meta = readFrontmatterCheap(file);
      if (!meta) continue;
      const declaredId = String(meta.id ?? meta.law_guid ?? meta.instrument_id ?? "").trim();
      if (!declaredId) continue;
      const statusVal = String(meta.status ?? "").trim();
      const isSupersededDuplicate = statusVal === "superseded_duplicate" || statusVal === "merged";
      const existing = index.get(declaredId);
      // Prefer a real, untagged survivor over a tagged one for the same id —
      // mirrors the "verify against a real untagged survivor" discipline
      // ب-133/ب-137 already apply within their own domain.
      if (!existing || (existing.isSupersededDuplicate && !isSupersededDuplicate)) {
        index.set(declaredId, { kind, path: file, isSupersededDuplicate });
      }
    }
  }

  scan("law", roots.law);
  scan("decree", roots.decree);
  return index;
}

/**
 * `anyInputPath` is a parser's own --input, already resolved to ITS category
 * root (e.g. ".../01_المكتبة_القانونية/أنظمة ولوائح" or "…/أوامر وتعاميم").
 * Derives the shared parent and scans both known category subfolders beneath
 * it, so either parser gets the SAME full index regardless of which one it
 * is. If `anyInputPath` isn't one of the two known category folders (a
 * narrower/custom test input), it's tried as the parent directly — safe
 * either way, since a nonexistent subfolder just yields an empty side.
 */
export function buildEntityIndexFromCategoryInput(anyInputPath: string): EntityIndex {
  const resolved = path.resolve(anyInputPath);
  const basename = path.basename(resolved);
  const isKnownCategory = Object.values(CATEGORY_FOLDERS).includes(basename);
  const parent = isKnownCategory ? path.dirname(resolved) : resolved;
  return buildEntityIndex({
    law: path.join(parent, CATEGORY_FOLDERS.law),
    decree: path.join(parent, CATEGORY_FOLDERS.decree),
  });
}

/**
 * Resolve a `superseded_by` reference against the OTHER domain only. Callers
 * have already exhausted their own in-domain resolution before reaching this
 * — a match in the caller's OWN domain is that parser's own job, not this
 * module's, so it is deliberately ignored here even if present. Returns a
 * verified survivor, or undefined if there is nothing safe to accept.
 */
export function resolveCrossDomain(index: EntityIndex, ref: string, selfKind: EntityKind): EntityRef | undefined {
  const hit = index.get(ref);
  if (!hit) return undefined;
  if (hit.kind === selfKind) return undefined;
  if (hit.isSupersededDuplicate) return undefined; // never verify against another dangling tag
  return hit;
}

// ── superseded_by written as the survivor's SLUG ─────────────────────────────
// The owner's 2026-10-03 export names the survivor by its slug in 98 of its
// 162 superseded_by pointers (e.g. "law-m-43-1443-05-26-law-00-1161" for
// نظام الإثبات). The contract (schema_manifest → superseded_by) asks for the
// instrument id or the file path, and neither lookup above matches a slug, so
// every one of those real duplicates stopped the parse as "unverified". The
// slug is the laws table's own primary key, so it names the survivor at least
// as strictly as an id. The manifest is NOT edited (it is the owner's contract,
// hash-checked against his vault); this lookup is an extra, stricter path.
//
// Index: EXPLICIT frontmatter `slug` only (a filename-derived slug is the laws
// parser's own business — it checks its parsed output first). Two untagged
// files declaring the same slug make it ambiguous: never pick one.

export const AMBIGUOUS_SLUG = "ambiguous" as const;
export type SlugIndex = Map<string, EntityRef | typeof AMBIGUOUS_SLUG>;

export function buildSlugIndex(roots: Partial<Record<EntityKind, string>>): SlugIndex {
  const index: SlugIndex = new Map();

  function scan(kind: EntityKind, root: string | undefined) {
    if (!root || !fs.existsSync(root)) return;
    const { kept } = applyExclusions(walkMd(root));
    for (const file of kept) {
      const meta = readFrontmatterCheap(file);
      if (!meta) continue;
      const slug = String(meta.slug ?? "").trim();
      if (!slug) continue;
      const statusVal = String(meta.status ?? "").trim();
      const isSupersededDuplicate = statusVal === "superseded_duplicate" || statusVal === "merged";
      const ref: EntityRef = { kind, path: file, isSupersededDuplicate };
      const existing = index.get(slug);
      if (!existing) {
        index.set(slug, ref);
      } else if (existing !== AMBIGUOUS_SLUG) {
        // A tagged copy never competes with an untagged survivor; two of the
        // same kind (both tagged or both untagged) leave the slug undecidable.
        if (existing.isSupersededDuplicate && !isSupersededDuplicate) index.set(slug, ref);
        else if (existing.isSupersededDuplicate === isSupersededDuplicate) index.set(slug, AMBIGUOUS_SLUG);
      }
    }
  }

  scan("law", roots.law);
  scan("decree", roots.decree);
  return index;
}

/** Same parent derivation as buildEntityIndexFromCategoryInput. */
export function buildSlugIndexFromCategoryInput(anyInputPath: string): SlugIndex {
  const resolved = path.resolve(anyInputPath);
  const isKnownCategory = Object.values(CATEGORY_FOLDERS).includes(path.basename(resolved));
  const parent = isKnownCategory ? path.dirname(resolved) : resolved;
  return buildSlugIndex({
    law: path.join(parent, CATEGORY_FOLDERS.law),
    decree: path.join(parent, CATEGORY_FOLDERS.decree),
  });
}

/**
 * Will this file really be published? The same corpus-scope decision the
 * parsers make, on the same bytes. A survivor the gate keeps out (institutional,
 * pending review, gate zero) must not verify a drop: both copies would vanish.
 */
function isPublishedSurvivor(file: string): boolean {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const { meta } = parseFrontmatter(raw, file);
    return resolveCorpusScope(meta, file, raw).corpus_scope === "public_corpus";
  } catch {
    return false;
  }
}

/**
 * Resolve a slug-valued `superseded_by` to an untagged, unambiguous, published
 * survivor of one of `allowKinds`, never the tagged file itself. Undefined when
 * there is nothing safe to accept — the caller's "unverified, refuse to guess"
 * path then applies unchanged.
 */
export function resolveSlugSurvivor(
  index: SlugIndex,
  ref: string,
  allowKinds: readonly EntityKind[],
  selfPath?: string,
): EntityRef | undefined {
  const hit = index.get(ref);
  if (!hit || hit === AMBIGUOUS_SLUG) return undefined;
  if (!allowKinds.includes(hit.kind)) return undefined;
  if (hit.isSupersededDuplicate) return undefined;
  if (selfPath && path.resolve(hit.path) === path.resolve(selfPath)) return undefined;
  if (!isPublishedSurvivor(hit.path)) return undefined;
  return hit;
}

// ── superseded_by written as the survivor's FILE PATH ────────────────────────
// The contract's second form ("مسار الملف الناجي نسبةً للمستودع"). The laws
// parser matches law paths in its own output, but nothing matched a path into
// the OTHER folder, and parse-decrees had no path lookup at all: 39 of the
// owner's 2026-10-03 pointers stayed "unverified" although every target file
// exists. Same acceptance rules as the slug lookup.

/** One path segment, matched by its NFC form (macOS may store names NFD). */
function findEntry(dir: string, name: string): string | undefined {
  const direct = path.join(dir, name);
  if (fs.existsSync(direct)) return direct;
  let ents: string[];
  try {
    ents = fs.readdirSync(dir);
  } catch {
    return undefined;
  }
  const want = name.normalize("NFC");
  const hit = ents.find((e) => e.normalize("NFC") === want);
  return hit === undefined ? undefined : path.join(dir, hit);
}

/**
 * Resolve a path-valued `superseded_by` ("01_المكتبة_القانونية/أوامر وتعاميم/…/x.md"
 * or "أوامر وتعاميم/…/x.md") against the library that holds `anyInputPath`, to
 * an existing, not-excluded, untagged, published survivor of `allowKinds` that
 * is not the tagged file itself.
 */
export function resolvePathSurvivor(
  anyInputPath: string,
  ref: string,
  allowKinds: readonly EntityKind[],
  selfPath?: string,
): EntityRef | undefined {
  if (!/\.md$/i.test(ref.trim())) return undefined;
  const resolved = path.resolve(anyInputPath);
  const isKnownCategory = Object.values(CATEGORY_FOLDERS).includes(path.basename(resolved));
  const parent = isKnownCategory ? path.dirname(resolved) : resolved;

  // Written from various depths ("01_المكتبة_القانونية/أوامر وتعاميم/…",
  // "أوامر وتعاميم/…"): start at the first category folder.
  const all = ref.trim().replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
  const categoryOf = (seg: string | undefined) => (Object.keys(CATEGORY_FOLDERS) as EntityKind[])
    .find((k) => CATEGORY_FOLDERS[k].normalize("NFC") === seg?.normalize("NFC"));
  const start = all.findIndex((seg) => categoryOf(seg) !== undefined);
  if (start < 0) return undefined;
  const segments = all.slice(start);
  const kind = categoryOf(segments[0]);
  if (!kind || !allowKinds.includes(kind)) return undefined;

  let current: string | undefined = parent;
  for (const seg of segments) {
    current = current === undefined ? undefined : findEntry(current, seg);
    if (current === undefined) return undefined;
  }
  const file = current as string;
  if (!fs.statSync(file).isFile()) return undefined;
  if (applyExclusions([file]).kept.length === 0) return undefined;
  if (selfPath && path.resolve(file) === path.resolve(selfPath)) return undefined;
  const meta = readFrontmatterCheap(file);
  if (!meta) return undefined;
  const statusVal = String(meta.status ?? "").trim();
  if (statusVal === "superseded_duplicate" || statusVal === "merged") return undefined;
  if (!isPublishedSurvivor(file)) return undefined;
  return { kind, path: file, isSupersededDuplicate: false };
}
