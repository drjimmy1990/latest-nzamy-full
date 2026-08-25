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
