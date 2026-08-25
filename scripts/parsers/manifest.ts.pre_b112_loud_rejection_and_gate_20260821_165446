/**
 * manifest.ts — loader + helpers for test/library-last/schema_manifest.json
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the library content "seed contract": enums
 * (type/status/section_code), the type_normalization_map, forbidden
 * frontmatter values, and internal fields that must not be seeded.
 *
 * Used by parse-laws.ts and parse-precedents.ts so the parsers enforce the
 * contract instead of passing raw frontmatter through.
 */
import * as fs from "fs";
import * as path from "path";

interface Manifest {
  enums: {
    type: string[];
    status: string[];
    section_code: string[];
  };
  type_normalization_map: Record<string, string>;
  conventions: {
    forbidden_in_frontmatter: string[];
    internal_fields_not_seeded?: string[];
  };
  multi_file_works?: {
    container_unbundling?: Record<string, unknown>;
  };
  [k: string]: unknown;
}

let cached: Manifest | null = null;

function resolveManifestPath(): string {
  // The vendored copy under scripts/parsers/ is the canonical one and is
  // TRACKED IN GIT. Earlier the only copy lived in test/, which .gitignore
  // excludes — so a fresh clone or CI runner had no manifest at all, every
  // parse threw, the per-file try/catch swallowed it, and the run printed
  // "Parsed 0 laws" and exited 0. Vendoring it removes that whole failure mode.
  const candidates = [
    ...(process.env.SCHEMA_MANIFEST_PATH ? [path.resolve(process.env.SCHEMA_MANIFEST_PATH)] : []),
    path.resolve(__dirname, "schema_manifest.json"),
    path.resolve(process.cwd(), "scripts/parsers/schema_manifest.json"),
    // Legacy locations, kept so an existing working checkout keeps working.
    path.resolve(process.cwd(), "test/library-last/schema_manifest.json"),
    path.resolve(__dirname, "../../test/library-last/schema_manifest.json"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(
    `schema_manifest.json not found. Looked in:\n  ${candidates.join("\n  ")}\n` +
      `Set SCHEMA_MANIFEST_PATH to override.`,
  );
}

export function getManifest(): Manifest {
  if (cached) return cached;
  const p = resolveManifestPath();
  let parsed: Manifest;
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Manifest;
  } catch (e) {
    throw new Error(`schema_manifest.json at ${p} is not valid JSON: ${(e as Error).message}`);
  }
  // Shape assertion. A manifest that loads but has no enums would silently
  // validate every value to its fallback — every law "غير_مصنف", every status
  // "active" — which looks like a successful parse and is far worse than a
  // hard failure. Check the shape once, here, rather than trusting it downstream.
  for (const key of ["type", "status", "section_code"] as const) {
    const list = parsed?.enums?.[key];
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(
        `schema_manifest.json at ${p} is missing or has an empty enums.${key} — refusing to parse ` +
          `with an incomplete contract (every value would silently fall back).`,
      );
    }
  }
  cached = parsed;
  return cached;
}

/**
 * Load and validate the manifest EAGERLY, before any file is processed.
 *
 * Call this once at the top of a parser's entry point, OUTSIDE the per-file
 * try/catch. Rule ق-3: a missing contract must stop the run loudly, not be
 * swallowed once per file and reported as a successful parse of zero records.
 */
export function assertManifestLoadable(): void {
  getManifest();
}

// ── Enums ────────────────────────────────────────────────────────────────────
export const TYPE_ENUM = (): string[] => getManifest().enums.type;
export const STATUS_ENUM = (): string[] => getManifest().enums.status;
export const SECTION_CODE_ENUM = (): string[] => getManifest().enums.section_code;

/** Validate a value against an enum; return fallback if not present. */
export function validateEnum(enumName: "type" | "status" | "section_code", value: unknown, fallback: string): string {
  const list = enumName === "type" ? TYPE_ENUM() : enumName === "status" ? STATUS_ENUM() : SECTION_CODE_ENUM();
  const v = value == null ? "" : String(value).trim();
  if (!v) return fallback;
  return list.includes(v) ? v : fallback;
}

// ── type_normalization_map ────────────────────────────────────────────────────
/** Normalize a raw `type` value to its canonical family per the manifest map.
 *  Skips `_`-prefixed meta keys in the map. Unknown values pass through (the
 *  enum validator later defaults them). */
export function normalizeType(raw: unknown): string {
  const v = raw == null ? "" : String(raw).trim();
  if (!v) return "نظام";
  const map = getManifest().type_normalization_map || {};
  // Direct map hit (skip _-prefixed meta keys).
  if (map[v] && !v.startsWith("_")) return map[v];
  return v; // unknown — let enum validation handle it
}

// ── forbidden_in_frontmatter ──────────────────────────────────────────────────
/** Return null if the value is a forbidden placeholder ("غير متوفر", "N/A", …),
 *  otherwise the trimmed string.
 *
 *  Objects and arrays return null. Since the switch to a real YAML parser,
 *  nested frontmatter blocks (article_status_summary, latest_update,
 *  merged_regulation_details, seo_* lists) arrive as structured values instead
 *  of being silently dropped. String({}) is "[object Object]", and several
 *  call-sites feed this result straight into a text column via String(...) —
 *  so a non-scalar must resolve to null here, never to that literal. Callers
 *  that want the structured value read it off `meta` directly. */
export function nullIfForbidden(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object") return null;
  const v = String(value).trim();
  if (!v) return null;
  const forbidden = getManifest().conventions?.forbidden_in_frontmatter || [];
  if (forbidden.includes(v)) return null;
  return v;
}

// ── key canonicalization + internal fields ───────────────────────────────────
// The manifest only documents ONE example (إجمالي_المبادئ → total_principles);
// keep a small explicit map for the known Arabic aliases we encounter.
const KEY_CANON_MAP: Record<string, string> = {
  "إجمالي_المبادئ": "total_principles",
};

export function canonicalizeKey(key: string): string {
  return KEY_CANON_MAP[key] || key;
}

/**
 * Apply the manifest's key conventions to a parsed frontmatter map: drop
 * internal pipeline fields that must never be seeded, and canonicalize known
 * Arabic key aliases.
 *
 * Previously this ran inline inside each parser's hand-rolled line loop. It is
 * separated out so the YAML parsing itself has no manifest dependency, and so
 * all four parsers apply identical conventions.
 */
export function filterMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(meta)) {
    if (isInternalField(rawKey)) continue;
    out[canonicalizeKey(rawKey)] = value;
  }
  return out;
}

export function isInternalField(key: string): boolean {
  const list = getManifest().conventions?.internal_fields_not_seeded || [
    "processing_pipeline", "needs_human_review", "review_reason", "tier",
    "extraction_method", "verification_status", "source_images",
    "last_page_extracted", "last_ruling_extracted", "investigator",
  ];
  return list.includes(key);
}