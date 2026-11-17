/**
 * najizClassifications — «دليل ناجز» as data (owner package 13 Nov, N06-4 /
 * N06-5): the six filing steps and the najiz tree — 7 courts → 43 classes →
 * 243 claim / request types — derived from the guide's blocks
 * (guideBlocks.ts), with every PDF page reference («ص 4»، «ص 6 أسفل»،
 * «تفريغ ص 2») and the page column removed. The page shows it as a clean
 * list, never as the raw tables.
 *
 * Deterministic and pure (imports guideBlocks only): the committed
 * src/data/murshid/najiz-classifications.json is this function's output on
 * src/data/murshid/najiz-guide-2026-10-28.md, written by
 * `node scripts/murshid-najiz-classifications.mjs`; a unit test fails when the
 * two drift apart (re-run the script after scripts/murshid-import.mjs).
 */
import { plainText, type GuideBlock } from "./guideBlocks.ts";

export interface NajizStep {
  no: number;
  title: string;
  lines: string[];
}

export interface NajizNote {
  kind: string;
  lines: string[];
}

export interface NajizType {
  /** The guide's running number (1–243); the notes cite it as «الصف N». */
  no: number;
  name: string;
  description: string;
}

export interface NajizClass {
  /** «1.1», «2.7»… */
  no: string;
  title: string;
  /** The count the guide's heading states («8 أنواع»، «نوعان»). */
  count: number;
  notes: NajizNote[];
  types: NajizType[];
}

export interface NajizCourt {
  no: number;
  title: string;
  /** «تختص محاكم الأحوال الشخصية بالنظر فيما يلي:» — empty when the guide has none. */
  scopeIntro: string;
  scope: string[];
  notes: NajizNote[];
  classes: NajizClass[];
}

export interface NajizClassifications {
  steps: NajizStep[];
  courts: NajizCourt[];
}

const DIGITS = "0-9٠-٩";
/** A parenthesis that holds a page reference: «(ص 4 — 8 أنواع)»، «(تفريغ ص 2)»، «(ص 3 – 8)». */
const PAGE_PAREN = new RegExp(`\\s*\\([^()]*(?<!\\p{L})ص\\s*[${DIGITS}][^()]*\\)`, "gu");
/** Any page reference left outside a parenthesis. */
const PAGE_REF = new RegExp(`(?:تفريغ\\s+)?(?<!\\p{L})ص\\s*[${DIGITS}]+(?:\\s*[–—-]\\s*[${DIGITS}]+)?(?:\\s+(?:أعلى|وسط|أسفل))?`, "gu");

const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** Plain text without page references, spaces tidied. */
export function withoutPages(text: string): string {
  return plainText(text)
    .replace(PAGE_PAREN, "")
    .replace(PAGE_REF, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([،.:؛])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The count in a class heading: «8 أنواع»، «11 نوعاً»، «نوعان»، «نوع واحد»; null when none. */
export function headingCount(heading: string): number | null {
  const text = toLatin(plainText(heading));
  const n = /(\d+)\s*(?:أنواع|نوعاً|نوعا|نوع)/.exec(text);
  if (n) return Number(n[1]);
  if (/نوعان/.test(text)) return 2;
  if (/نوع واحد/.test(text)) return 1;
  return null;
}

/** «القسم الأول: دعاوى الأحوال الشخصية (ص 3 – 8)» → «دعاوى الأحوال الشخصية». */
const afterColon = (heading: string) => {
  const clean = withoutPages(heading);
  const at = clean.indexOf(":");
  return at >= 0 ? clean.slice(at + 1).trim() : clean;
};

const cellText = (cell: string[] | undefined) => withoutPages((cell ?? []).join(" "));
const cellLines = (cell: string[] | undefined) => (cell ?? []).map(withoutPages).filter(Boolean);
const note = (b: Extract<GuideBlock, { type: "callout" }>): NajizNote => ({ kind: b.kind, lines: b.lines.map(withoutPages).filter(Boolean) });

/**
 * The steps table under «الباب الثاني» and the courts under «الباب الثالث».
 * Throws on a shape it does not know (a row without a number, a class outside
 * a court), so a changed guide fails the test instead of serving a half tree.
 */
export function buildNajizClassifications(blocks: readonly GuideBlock[]): NajizClassifications {
  const steps: NajizStep[] = [];
  const courts: NajizCourt[] = [];
  let part: "steps" | "tree" | null = null;
  let court: NajizCourt | null = null;
  let klass: NajizClass | null = null;
  /** The depth-0 item a depth-1 item sits under: scope, the class list, or none. */
  let list: "scope" | "skip" | null = null;

  for (const b of blocks) {
    if (b.type === "heading" && b.level <= 2) {
      part = /الباب الثاني/.test(b.text) ? "steps" : /الباب الثالث/.test(b.text) ? "tree" : null;
      court = null;
      klass = null;
      continue;
    }
    if (part === "steps") {
      if (b.type === "table") {
        for (const row of b.rows) {
          const no = Number(toLatin(cellText(row[0])).replace(/\D+/g, ""));
          if (!Number.isInteger(no) || no < 1) throw new Error(`najiz steps: a row without a step number: ${cellText(row[0])}`);
          steps.push({ no, title: cellText(row[1]), lines: cellLines(row[2]) });
        }
      }
      continue;
    }
    if (part !== "tree") continue;

    if (b.type === "heading" && b.level === 3) {
      court = { no: courts.length + 1, title: afterColon(b.text), scopeIntro: "", scope: [], notes: [], classes: [] };
      courts.push(court);
      klass = null;
      list = null;
      continue;
    }
    if (b.type === "heading" && b.level >= 4) {
      if (!court) throw new Error(`najiz tree: a class outside a court: ${b.text}`);
      const count = headingCount(b.text);
      if (count === null) throw new Error(`najiz tree: a class heading without a count: ${b.text}`);
      const no = /^\s*([0-9٠-٩]+\.[0-9٠-٩]+)/.exec(plainText(b.text))?.[1] ?? `${court.no}.${court.classes.length + 1}`;
      klass = { no: toLatin(no), title: afterColon(b.text), count, notes: [], types: [] };
      court.classes.push(klass);
      continue;
    }
    if (!court) continue;
    if (b.type === "callout") {
      (klass ?? court).notes.push(note(b));
      continue;
    }
    if (b.type === "item" && !klass) {
      if (b.depth === 0) {
        if (/نطاق الاختصاص/.test(b.text)) {
          list = "scope";
          const intro = withoutPages(b.text).replace(/^نطاق الاختصاص النوعي\s*[—–-]?\s*/, "").trim();
          court.scopeIntro = intro;
        } else {
          list = "skip"; // «التصنيفات الفرعية المدرجة»: the classes below say it.
        }
        continue;
      }
      if (list !== "skip") court.scope.push(withoutPages(b.text));
      continue;
    }
    if (b.type === "table" && klass) {
      for (const row of b.rows) {
        const no = Number(toLatin(cellText(row[0])).replace(/\D+/g, ""));
        if (!Number.isInteger(no) || no < 1) throw new Error(`najiz tree: a type without its number in ${klass.no}`);
        klass.types.push({ no, name: cellText(row[2]), description: cellText(row[3]) });
      }
    }
  }
  return { steps, courts };
}
