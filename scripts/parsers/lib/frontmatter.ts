/**
 * frontmatter.ts — YAML frontmatter parsing for the legal library.
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the hand-rolled, line-by-line parser that was duplicated across all
 * four parsers. That parser matched keys with /^([\p{L}\w][\p{L}\w_]*)\s*:\s*(.*)/u
 * against each line independently, which meant:
 *
 *   • INDENTED SUB-KEYS NEVER MATCHED (leading whitespace fails `^`), so every
 *     nested block — article_status_summary, latest_update,
 *     merged_regulation_details, the seo_* lists — was silently discarded.
 *   • A malformed quoted scalar (`key: "value" trailing text`) failed the
 *     /^["'].*["']$/ strip, so the raw quote characters were stored as part of
 *     the value.
 *   • Broken YAML PASSED SILENTLY instead of being rejected.
 *
 * Now uses js-yaml with CORE_SCHEMA.
 *
 * Why CORE_SCHEMA and not DEFAULT_SCHEMA: DEFAULT_SCHEMA coerces anything that
 * looks like a date into a JS Date object. These documents carry Hijri dates as
 * strings (e.g. "1446/02/08") and Gregorian ones that must stay verbatim — rule
 * ق-1 forbids reformatting a legal value. CORE_SCHEMA leaves them as strings.
 *
 * Why NOT `json: true`: that option makes duplicate keys silently last-wins,
 * which is exactly the silent-data-loss behaviour being removed here.
 *
 * FAILURE POLICY (rule ق-3, never silently drop): a file whose YAML js-yaml
 * cannot parse is NOT discarded and NOT silently accepted. It falls back to the
 * legacy line parser so the document still seeds, and the failure is recorded in
 * `warnings` for the caller to count and report. Losing a legal document because
 * its frontmatter has a stray quote would be worse than seeding it with
 * degraded metadata — but doing so invisibly would be worse still.
 */

import * as yaml from "js-yaml";

export interface FrontmatterResult {
  meta: Record<string, unknown>;
  body: string;
  /** Non-fatal problems. Callers MUST surface these, never discard them. */
  warnings: string[];
}

/** Repairs + extracts the raw frontmatter block. Shared by both parse paths. */
function extractBlock(raw: string): { yamlStr: string; body: string } | null {
  // Strip BOM.
  let src = raw.replace(/^﻿/, "");
  // Repair a closing fence glued to the last line (e.g. `total_articles: 0---`
  // with no newline before it) — a real defect in the corpus.
  src = src.replace(/^(---\s*\r?\n[\s\S]*?\S)[ \t]*---\s*(\r?\n|$)/m, "$1\n---\n");

  const match = src.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) return null;
  return { yamlStr: match[1], body: src.slice(match[0].length) };
}

/**
 * The previous line-by-line parser, kept ONLY as a rescue path for files whose
 * YAML is genuinely malformed. Not the primary path.
 */
function legacyLineParse(yamlStr: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const line of yamlStr.split(/\r?\n/)) {
    const m = line.match(/^([\p{L}\w][\p{L}\w_]*)\s*:\s*(.*)/u);
    if (!m) continue;
    let value: unknown = m[2].trim();
    if (typeof value === "string" && /^["'].*["']$/.test(value)) {
      value = (value as string).slice(1, -1);
    }
    if (typeof value === "string" && /^\d+$/.test(value)) value = parseInt(value as string, 10);
    if (value === "true") value = true;
    if (value === "false") value = false;
    if (value === "null" || value === "~") value = null;
    meta[m[1]] = value;
  }
  return meta;
}

/**
 * Parse YAML frontmatter.
 *
 * @param raw        full file contents
 * @param sourcePath optional path, used only to make warnings actionable
 */
export function parseFrontmatter(raw: string, sourcePath = "<unknown>"): FrontmatterResult {
  const warnings: string[] = [];
  const block = extractBlock(raw);
  if (!block) return { meta: {}, body: raw, warnings };

  const { yamlStr, body } = block;

  let loaded: unknown;
  try {
    loaded = yaml.load(yamlStr, { schema: yaml.CORE_SCHEMA, filename: sourcePath });
  } catch (e) {
    // Rescue, but make it visible. See FAILURE POLICY above.
    warnings.push(
      `${sourcePath}: YAML parse failed (${(e as Error).message.split("\n")[0]}) — ` +
        `fell back to the legacy line parser; nested fields in this file are lost.`,
    );
    return { meta: normalizeMeta(legacyLineParse(yamlStr), warnings, sourcePath), body, warnings };
  }

  if (loaded == null) return { meta: {}, body, warnings };

  if (typeof loaded !== "object" || Array.isArray(loaded)) {
    warnings.push(
      `${sourcePath}: frontmatter is not a key/value mapping (got ${Array.isArray(loaded) ? "a list" : typeof loaded}) — ignored.`,
    );
    return { meta: {}, body, warnings };
  }

  return { meta: normalizeMeta(loaded as Record<string, unknown>, warnings, sourcePath), body, warnings };
}

/**
 * Apply the conventions the old parser applied inline: treat the literal
 * strings "null"/"~" as null (js-yaml already handles the unquoted forms).
 * Internal-field filtering and key canonicalization stay in manifest.ts and are
 * applied by callers, so this module has no dependency on the manifest.
 */
function normalizeMeta(
  meta: Record<string, unknown>,
  warnings: string[],
  sourcePath: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v === "null" || v === "~" ? null : v;
  }
  // Surface residual quote contamination rather than storing it. The old parser
  // stored values like: "غير_مصنف" والتعاميم  — quotes included.
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string" && /^["'].*["']\s+\S/.test(v)) {
      warnings.push(`${sourcePath}: field "${k}" looks like a malformed quoted scalar: ${v.slice(0, 60)}`);
    }
  }
  return out;
}

/**
 * Coerce a frontmatter value to a scalar string, or null.
 *
 * REQUIRED at every site that previously did `String(meta.x || "")`. With a real
 * YAML parser, nested blocks now arrive as objects/arrays instead of being
 * dropped — and `String({})` is "[object Object]", which would write that
 * literal text into the database (e.g. laws.article_status_summary, a text
 * column populated via String(...) in seed-library.ts).
 *
 * Structured values return null here. They remain available on `meta` for
 * callers that genuinely want them, but they never leak into a scalar column.
 */
export function asScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null; // objects and arrays are not scalars
}
