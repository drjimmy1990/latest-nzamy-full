/**
 * runOutputBlocks.ts — a stored run's output as headed blocks, for the one
 * viewer that must show every tool (/ai/runs/[id]). Each tool has its own rich
 * screen; this is the plain reading, so it knows no tool's shape:
 *
 *   a string or number          → a paragraph
 *   an array of strings/numbers → items
 *   an array of objects         → items, each the object's values joined by « — »
 *   an object                   → its keys, each a block of its own
 *
 * A known key gets a heading; an unknown one gets none, but its content is still
 * shown, never dropped. Three levels of nesting under the output are read and a
 * fourth is ignored; at most 200 blocks. Booleans and nulls are flags, not
 * content, and are left out.
 *
 * Pure and import-free, so a page may import it and `node --test` runs it.
 */

export interface RunOutputBlock {
  heading: string | null;
  paragraphs: string[];
  items: string[];
}

const MAX_DEPTH = 3;
const MAX_BLOCKS = 200;

const OUTPUT_KEY_LABELS_AR: Readonly<Record<string, string>> = {
  summary: "الخلاصة",
  findings: "الملاحظات",
  sections: "الأقسام",
  answer: "الإجابة",
  reply: "الرد",
  text: "النص",
  conclusion: "الخلاصة",
  citation_check: "التحقق من الإحالات",
  options: "الخيارات",
  questions: "أسئلة",
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const heading = (key: string): string | null =>
  Object.prototype.hasOwnProperty.call(OUTPUT_KEY_LABELS_AR, key) ? OUTPUT_KEY_LABELS_AR[key] : null;

/** A scalar worth showing, trimmed; null for a blank string, a boolean or a null. */
function scalar(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Every scalar under a container at `depth`, in order. */
function leaves(v: unknown, depth: number): string[] {
  const one = scalar(v);
  if (one !== null) return [one];
  if (depth > MAX_DEPTH) return [];
  if (Array.isArray(v)) return v.flatMap((x) => leaves(x, depth + 1));
  if (isPlainObject(v)) return Object.values(v).flatMap((x) => leaves(x, depth + 1));
  return [];
}

function walk(key: string, value: unknown, depth: number, out: RunOutputBlock[]): void {
  if (out.length >= MAX_BLOCKS) return;
  const one = scalar(value);
  if (one !== null) {
    out.push({ heading: heading(key), paragraphs: [one], items: [] });
    return;
  }
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(value)) {
    const items = value.map((el) => leaves(el, depth + 1).join(" — ")).filter(Boolean);
    if (items.length > 0) out.push({ heading: heading(key), paragraphs: [], items });
    return;
  }
  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) walk(k, v, depth + 1, out);
  }
}

export function runOutputBlocks(output: unknown): RunOutputBlock[] {
  if (!isPlainObject(output)) return [];
  const out: RunOutputBlock[] = [];
  for (const [key, value] of Object.entries(output)) walk(key, value, 1, out);
  return out;
}
