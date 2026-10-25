/**
 * Seeder value rules (N2.7, the owner's «الميثاق» commandments ٢ and ٣):
 *
 *   - an integer column takes an integer, never the first number of a range.
 *     `parseInt("1439-1441")` is 1439, which reduced a span of years to its
 *     first year without a word. parseStrictInt() accepts only a whole
 *     integer (ASCII or Arabic-Indic digits, an optional «هـ» / «ه»); anything
 *     else is REJECTED: the column gets the caller's fallback and the raw
 *     value is reported, so the span stays visible instead of turning into
 *     one year;
 *   - no silent truncation. A varchar cap still cuts exactly as the seeder
 *     always did (`.substring(0, max)`: the loaded data and every id stay
 *     byte-identical), but every cut is reported with its table, field, row
 *     key and lengths. Cuts of identity fields (ids, slugs) are flagged.
 *
 * scripts/seed-library.ts writes the report into seed-result.json and
 * seed-value-report.json, and prints the counts.
 *
 * Pure and import-free: node:test and the seeder both load it.
 */

export const INT4_MIN = -2147483648;
export const INT4_MAX = 2147483647;

export interface StrictInt {
  /** The integer, or null (empty input, or rejected). */
  value: number | null;
  /** Why the input was refused; null when it was accepted or empty. */
  rejected: string | null;
}

function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const WHOLE_INT = /^[+-]?\d+$/;
const HIJRI_SUFFIX = /\s*(?:هـ|ه)$/;

export function parseStrictInt(v: unknown): StrictInt {
  if (v === null || v === undefined) return { value: null, rejected: null };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { value: null, rejected: "not a finite number" };
    if (!Number.isInteger(v)) return { value: null, rejected: "not a whole number" };
    if (v < INT4_MIN || v > INT4_MAX) return { value: null, rejected: "outside the int4 range" };
    return { value: v, rejected: null };
  }
  if (typeof v !== "string") return { value: null, rejected: `not a number (${typeof v})` };
  const t = toAsciiDigits(v).trim().replace(HIJRI_SUFFIX, "").trim();
  if (t === "") return { value: null, rejected: null };
  if (!WHOLE_INT.test(t)) {
    return { value: null, rejected: /^\d+\s*[-–—/]\s*\d+$/.test(t) ? "a range, not one integer" : "not a whole integer" };
  }
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < INT4_MIN || n > INT4_MAX) return { value: null, rejected: "outside the int4 range" };
  return { value: n, rejected: null };
}

/** Fields whose value is (part of) a row's identity: a cut there can merge or rename rows. */
export const IDENTITY_FIELDS: ReadonlySet<string> = new Set([
  "id", "slug", "law_slug", "collection_id", "book_id",
]);

export interface TruncationEntry {
  table: string;
  field: string;
  key: string;
  /** Length before the cut (UTF-16 units, what `.substring` counts). */
  length: number;
  max: number;
  identity: boolean;
}

export interface IntRejection {
  table: string;
  field: string;
  key: string;
  raw: string;
  reason: string;
  /** What the column got instead. */
  stored: number | null;
}

export interface SeedValueReport {
  truncated: TruncationEntry[];
  intRejected: IntRejection[];
}

export function createSeedValueReport() {
  const truncated = new Map<string, TruncationEntry>();
  const intRejected = new Map<string, IntRejection>();
  return {
    /**
     * `value.substring(0, max)` — exactly the seeder's old cut — and a report
     * entry when it cut anything. One entry per table/field/key (the id
     * helpers run more than once per row).
     */
    cap(table: string, field: string, key: unknown, value: string, max: number): string {
      if (value.length > max) {
        const k = `${table}\u0000${field}\u0000${String(key)}`;
        if (!truncated.has(k)) {
          truncated.set(k, { table, field, key: String(key), length: value.length, max, identity: IDENTITY_FIELDS.has(field) });
        }
      }
      return value.substring(0, max);
    },
    /**
     * parseStrictInt with the caller's fallback for empty input; a refused
     * value stores `onRefused` (default: the same fallback) and is reported.
     * A column whose empty-input default is a guess (feqh_chapters.volume_number
     * = 1) passes null here, so a refused «3-4» is not stored as volume 1.
     */
    int(
      table: string,
      field: string,
      key: unknown,
      raw: unknown,
      fallback: number | null,
      onRefused: number | null = fallback,
    ): number | null {
      const p = parseStrictInt(raw);
      if (p.rejected !== null) {
        const k = `${table}\u0000${field}\u0000${String(key)}`;
        if (!intRejected.has(k)) {
          intRejected.set(k, { table, field, key: String(key), raw: String(raw), reason: p.rejected, stored: onRefused });
        }
        return onRefused;
      }
      return p.value ?? fallback;
    },
    /**
     * The verbatim twin of an integer column (feqh_blocks.page_label /
     * volume_label): the source's own label when it has one; else, when the
     * integer was refused («12-13», «7-1»), the raw value — so a page range
     * keeps showing as written («ص 12-13») instead of vanishing with the
     * number. Never a guess: with no refusal the label is returned as it came.
     */
    label(table: string, field: string, key: unknown, label: unknown, raw: unknown, max: number): string | null {
      const own = typeof label === "string" ? label.trim() : label === null || label === undefined ? "" : String(label).trim();
      if (own) return this.cap(table, field, key, String(label), max);
      // Nothing refused: the label exactly as before («» stays «», absent stays null).
      if (parseStrictInt(raw).rejected === null) return typeof label === "string" ? label : null;
      const verbatim = String(raw).trim();
      return verbatim ? this.cap(table, field, key, verbatim, max) : null;
    },
    reset(): void {
      truncated.clear();
      intRejected.clear();
    },
    snapshot(): SeedValueReport {
      return { truncated: [...truncated.values()], intRejected: [...intRejected.values()] };
    },
  };
}

export type SeedValueRecorder = ReturnType<typeof createSeedValueReport>;

/** Counts per table.field, identity cuts first — what the seeder prints. */
export function summarizeSeedValueReport(report: SeedValueReport): string[] {
  const lines: string[] = [];
  const count = <T extends { table: string; field: string }>(rows: T[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(`${r.table}.${r.field}`, (m.get(`${r.table}.${r.field}`) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const identity = report.truncated.filter((t) => t.identity);
  lines.push(`Truncated values: ${report.truncated.length} (identity fields: ${identity.length})`);
  for (const [f, n] of count(identity)) lines.push(`  ⚠ ${f}: ${n} id/slug value(s) cut`);
  for (const [f, n] of count(report.truncated.filter((t) => !t.identity))) lines.push(`  • ${f}: ${n}`);
  lines.push(`Integer values refused (ranges / non-integers): ${report.intRejected.length}`);
  for (const [f, n] of count(report.intRejected)) lines.push(`  • ${f}: ${n}`);
  for (const r of report.intRejected.slice(0, 5)) lines.push(`    e.g. ${r.table}.${r.field} ${r.key}: «${r.raw}» (${r.reason})`);
  return lines;
}

/** The JSON report body: the totals and every entry. */
export function seedValueReportJson(report: SeedValueReport, generatedAt: string) {
  return {
    generated_at: generatedAt,
    truncated_total: report.truncated.length,
    truncated_identity_total: report.truncated.filter((t) => t.identity).length,
    int_rejected_total: report.intRejected.length,
    truncated: report.truncated,
    int_rejected: report.intRejected,
  };
}
