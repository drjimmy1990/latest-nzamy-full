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

/** Extract the raw YAML block without treating an indented `---` inside a block scalar as a fence. */
function extractBlock(raw: string): { yamlStr: string; body: string; repairWarning?: string } | null {
  const src = raw.replace(/^\uFEFF/, "");
  const opening = src.match(/^---[ \t]*\r?\n/);
  if (!opening) return null;
  const rest = src.slice(opening[0].length);
  const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);

  // A known source defect glued the closing fence to a numeric total_articles
  // value (`total_articles: 0---`). Repair only that unambiguous pattern and
  // only before the first real fence. The old broad regex also matched the
  // trailing `---` of an indented review_reason paragraph, silently moving
  // later type/status fields into the document body.
  const glued = /^(total_articles:[ \t]*\d+)[ \t]*---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (glued && (!closing || glued.index < closing.index)) {
    return {
      yamlStr: rest.slice(0, glued.index) + glued[1],
      body: rest.slice(glued.index + glued[0].length).replace(/^\s*/, ""),
      repairWarning: "repaired a closing fence glued to total_articles",
    };
  }
  if (!closing) return null;
  return {
    yamlStr: rest.slice(0, closing.index),
    // Preserve the previous parser's body offset for unaffected files: its
    // closing-fence regex consumed whitespace after the fence as well.
    body: rest.slice(closing.index + closing[0].length).replace(/^\s*/, ""),
  };
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
  if (!block) {
    if (/^(?:\uFEFF)?---[ \t]*\r?\n/.test(raw)) {
      warnings.push(`${sourcePath}: opening YAML fence has no closing fence — frontmatter not parsed.`);
    }
    return { meta: {}, body: raw, warnings };
  }

  const { yamlStr, body } = block;
  if (block.repairWarning) warnings.push(`${sourcePath}: ${block.repairWarning}.`);

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
