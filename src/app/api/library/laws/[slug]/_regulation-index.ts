/**
 * _regulation-index.ts — the sub-legislation index of a law, for EVERY viewer
 * (owner file 16 §2, 19 Nov 2026, screenshot 02: «فهرس التشريع الفرعي
 * (العناوين وأرقام المواد) يظهر دائماً لكل مستخدم بما فيهم غير المشترك (عناوين
 * فقط)، والنص الكامل حسب الصلاحية»).
 *
 * The regulation view's contents list used to list the PARENT law's article
 * numbers that carry regulation rows (judiciary-law: الأولى، السادسة، الحادية
 * والثمانون), and for a guest only the unlocked ones. This index lists every
 * sub-legislation by its own name and, under it, each of its articles by its
 * own number — locked or not. It carries NO text: names (cleaned of decree
 * numbers and dates for a viewer whose official data is withheld, owner ٤٢٤)
 * and numbers only. An entry whose text this viewer may read points at its
 * card in the flat view (`card`: the instrument's and the row's place in
 * `regulationInstruments`); a locked entry has `card: null` and is a lock.
 *
 * The rows are the flat view's rows, before the paywall: the same exclusions
 * (a dual-linked duplicate, a ref-less or text-less row) and the same order
 * (instruments by first appearance, rows by sort_key), so `card` lands.
 *
 * Pure: `node --test` runs _regulation-index.test.ts.
 */

export interface RegulationIndexRow {
  /** The raw instrument name (the flat view's grouping key). */
  ref: string;
  regNum: unknown;
  sortKey: unknown;
  /** The نظام article it hangs under is locked for this viewer. */
  locked: boolean;
}

export interface RegulationIndexEntry {
  label: string;
  locked: boolean;
  /** [instrument, row] in regulationInstruments; null when the text is locked. */
  card: [number, number] | null;
}

export interface RegulationIndexInstrument {
  name: string;
  entries: RegulationIndexEntry[];
}

/** Longest name or label sent (names are instrument titles, never statutory text). */
export const REGULATION_INDEX_CHARS = 160;

/** The flat view's row order (route.ts sorts regulationInstruments by it too). */
export function compareRegulationSortKey(a: unknown, b: unknown): number {
  return String(a || "99999").localeCompare(String(b || "99999"));
}

function cap(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > REGULATION_INDEX_CHARS ? `${t.slice(0, REGULATION_INDEX_CHARS)}…` : t;
}

/** «المادة 5» from a reg_num («5», «٥», «الخامسة», «المادة الخامسة»); `(n)` when there is none. */
export function regulationEntryLabel(regNum: unknown, position: number): string {
  const n = typeof regNum === "string" || typeof regNum === "number" ? String(regNum).replace(/\s+/g, " ").trim() : "";
  if (!n) return `(${position + 1})`;
  return cap(/^المادة(?:\s|$)/u.test(n) ? n : `المادة ${n}`);
}

/**
 * The index from every row of the flat view (in article order), and the name
 * each viewer may see (`nameFor` = regulationRefForViewer for this viewer).
 */
export function buildRegulationIndex(
  rows: readonly RegulationIndexRow[],
  nameFor: (ref: string) => string,
): RegulationIndexInstrument[] {
  // Every row, grouped by instrument in first-seen order.
  const all = new Map<string, Array<{ row: RegulationIndexRow; seq: number }>>();
  rows.forEach((row, seq) => {
    if (!row.ref) return;
    if (!all.has(row.ref)) all.set(row.ref, []);
    all.get(row.ref)!.push({ row, seq });
  });
  // The flat view's own places: unlocked rows only, instruments by first appearance of an unlocked row.
  const unlockedRefs: string[] = [];
  for (const row of rows) if (row.ref && !row.locked && !unlockedRefs.includes(row.ref)) unlockedRefs.push(row.ref);

  const out: RegulationIndexInstrument[] = [];
  let unnamed = 0;
  for (const [ref, list] of all) {
    const sorted = [...list].sort((a, b) => compareRegulationSortKey(a.row.sortKey, b.row.sortKey) || a.seq - b.seq);
    const unlockedSorted = sorted.filter((x) => !x.row.locked);
    const inst = unlockedRefs.indexOf(ref);
    const name = cap(nameFor(ref)) || `التشريع الفرعي ${++unnamed > 1 ? `(${unnamed})` : ""}`.trim();
    out.push({
      name,
      entries: sorted.map((x, i) => ({
        label: regulationEntryLabel(x.row.regNum, i),
        locked: x.row.locked,
        card: x.row.locked || inst === -1 ? null : [inst, unlockedSorted.indexOf(x)],
      })),
    });
  }
  return out;
}
