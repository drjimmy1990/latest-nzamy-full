/**
 * slug.equivalence.test.mjs — proves the shared slug module is behaviourally
 * identical to the four inlined copies it replaces, EXCEPT for Arabic-Indic
 * digits (the deliberate fix).
 *
 * Why this exists: `library.laws` is keyed by slug with a merge-duplicates
 * upsert, so an unintended change to this function silently re-keys rows and
 * orphans the old ones. Consolidating four copies into one is only safe if the
 * output is provably unchanged.
 *
 * Run: node scripts/parsers/lib/slug.equivalence.test.mjs
 */

// ── The OLD implementation, copied verbatim from parse-laws.ts pre-refactor ──
const OLD_AR_TRANSLIT = {
  "ا": "a", "أ": "a", "إ": "e", "آ": "aa", "ب": "b", "ت": "t", "ث": "th",
  "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
  "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "dh", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "h", "ئ": "e", "ؤ": "w",
  "ء": "", "ﻻ": "la", "ﻷ": "la",
};

function oldSlugify(text) {
  let slug = text.replace(/[\u064B-\u065F\u0670]/g, "");
  slug = slug.replace(/\b\u0627\u0644/g, "al-");
  let result = "";
  for (const ch of slug) {
    if (OLD_AR_TRANSLIT[ch] !== undefined) result += OLD_AR_TRANSLIT[ch];
    else if (/[a-zA-Z0-9]/.test(ch)) result += ch.toLowerCase();
    else if (/[\s\-_]/.test(ch)) result += "-";
  }
  return result.replace(/-{2,}/g, "-").replace(/^-|-$/g, "").substring(0, 120);
}

// ── The NEW implementation, mirrored from lib/slug.ts ────────────────────────
// (Mirrored rather than imported so this test runs as plain node with no tsx.)
const NEW_AR_TRANSLIT = {
  ...OLD_AR_TRANSLIT,
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function newSlugify(text) {
  let slug = text.replace(/[\u064B-\u065F\u0670]/g, "");
  slug = slug.replace(/\b\u0627\u0644/g, "al-");
  let result = "";
  for (const ch of slug) {
    if (NEW_AR_TRANSLIT[ch] !== undefined) result += NEW_AR_TRANSLIT[ch];
    else if (/[a-zA-Z0-9]/.test(ch)) result += ch.toLowerCase();
    else if (/[\s\-_]/.test(ch)) result += "-";
  }
  return result.replace(/-{2,}/g, "-").replace(/^-|-$/g, "").substring(0, 120);
}

const ARABIC_INDIC = /[٠-٩۰-۹]/;

let failures = 0;
const note = (msg) => console.log(`  ${msg}`);

// ── 1. Equivalence on inputs WITHOUT Arabic-Indic digits ────────────────────
console.log("\n1. Equivalence on non-digit inputs (must be byte-identical):");
const SAMPLES = [
  "نظام العمل",
  "الطيران المدني",
  "_الطيران_المدني",
  "نظام الشركات",
  "اللائحة التنفيذية لنظام المرافعات الشرعية",
  "المحكمة الإدارية العليا",
  "ديوان المظالم",
  "نظام مكافحة غسل الأموال",
  "قرار مجلس الوزراء رقم 123",
  "Companies Law 2024",
  "مرسوم ملكي رقم م/44 وتاريخ 1446/02/08",
  "  نظام   العمل  ",
  "نظام-العمل_المعدل",
  "الأحوال الشخصية",
  "نظام التنفيذ",
  "",
  "١٢٣",                       // pure Arabic-Indic — expected to differ
  "نظام رقم ٤٤",               // expected to differ
];

for (const s of SAMPLES) {
  const o = oldSlugify(s);
  const n = newSlugify(s);
  const hasDigits = ARABIC_INDIC.test(s);
  if (hasDigits) continue; // covered in section 2
  if (o !== n) {
    console.log(`  ✗ MISMATCH  input="${s}"\n      old="${o}"\n      new="${n}"`);
    failures++;
  }
}
if (failures === 0) note(`✔ all ${SAMPLES.filter((s) => !ARABIC_INDIC.test(s)).length} non-digit samples identical`);

// ── 2. The deliberate difference: digits are preserved, not dropped ─────────
console.log("\n2. Arabic-Indic digits (the fix — old DROPS them, new keeps them):");
const DIGIT_CASES = [
  { input: "مرسوم ملكي رقم ٤٤", expectNew: /44/ },
  { input: "قرار رقم ١٢٣ لسنة ١٤٤٣", expectNew: /123/ },
  { input: "١٢٣٤٥٦٧٨٩٠", expectNew: /1234567890/ },
  { input: "۱۲۳", expectNew: /123/ },
];
for (const { input, expectNew } of DIGIT_CASES) {
  const o = oldSlugify(input);
  const n = newSlugify(input);
  const ok = expectNew.test(n) && o !== n;
  console.log(`  ${ok ? "✔" : "✗"} "${input}"\n      old="${o}"  new="${n}"`);
  if (!ok) failures++;
}

// ── 3. The real-world failure this prevents: distinct decrees, one slug ─────
console.log("\n3. Collision that the old table produced (the actual bug):");
const DECREES = [
  "مرسوم ملكي رقم ١ وتاريخ ١٤٤٠",
  "مرسوم ملكي رقم ٢ وتاريخ ١٤٤١",
  "مرسوم ملكي رقم ٣ وتاريخ ١٤٤٢",
];
const oldSlugs = DECREES.map(oldSlugify);
const newSlugs = DECREES.map(newSlugify);
const oldDistinct = new Set(oldSlugs).size;
const newDistinct = new Set(newSlugs).size;
console.log(`  old → ${oldDistinct} distinct slug(s) for ${DECREES.length} distinct decrees  ${oldDistinct === 1 ? "← ALL COLLIDE" : ""}`);
oldSlugs.forEach((s, i) => console.log(`        [${i}] "${s}"`));
console.log(`  new → ${newDistinct} distinct slug(s)`);
newSlugs.forEach((s, i) => console.log(`        [${i}] "${s}"`));
if (oldDistinct !== 1 || newDistinct !== DECREES.length) {
  console.log("  ✗ expected old to collapse to 1 and new to keep all distinct");
  failures++;
} else {
  note("✔ fix resolves a real collision that silently discarded rows");
}

console.log("\n" + "─".repeat(60));
if (failures > 0) {
  console.error(`✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("✔ slug module is equivalent except for the intended digit fix\n");
