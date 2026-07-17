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
  // Parsers run from the project root via `npx tsx`, so cwd is the repo root.
  const candidates = [
    path.resolve(process.cwd(), "test/library-last/schema_manifest.json"),
    path.resolve(__dirname, "../../test/library-last/schema_manifest.json"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`schema_manifest.json not found (looked in ${candidates.join(", ")})`);
}

export function getManifest(): Manifest {
  if (cached) return cached;
  const p = resolveManifestPath();
  cached = JSON.parse(fs.readFileSync(p, "utf-8")) as Manifest;
  return cached;
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
 *  otherwise the trimmed string. */
export function nullIfForbidden(value: unknown): string | null {
  if (value == null) return null;
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

export function isInternalField(key: string): boolean {
  const list = getManifest().conventions?.internal_fields_not_seeded || [
    "processing_pipeline", "needs_human_review", "review_reason", "tier",
    "extraction_method", "verification_status", "source_images",
    "last_page_extracted", "last_ruling_extracted", "investigator",
  ];
  return list.includes(key);
}