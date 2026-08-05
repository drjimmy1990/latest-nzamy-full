/**
 * exclusions.test.mjs — regression test for the folder-name matching rules.
 *
 * WHY THIS EXISTS
 * The first version of these rules used `path.includes("/name/")`. The
 * maintainers prefix these folder names freely, so the same archive appears as
 * `deleted_backups_archive` in one section and `_deleted_backups_archive` in
 * another. The `/name/` form silently failed on every prefixed variant, and 232
 * backup snapshots sat inside the parser corpus inflating every count derived
 * from it — while the parser cheerfully reported "0 files excluded".
 *
 * A rule that silently matches nothing is worse than no rule: it looks like
 * proof the artefacts are absent. These cases pin the real on-disk spellings.
 *
 * Run: node scripts/parsers/lib/exclusions.test.mjs
 */

// Mirrored from exclusions.ts so this runs as plain node with no tsx.
const norm = (p) => p.replace(/\\/g, "/");
const hasSegmentContaining = (p, needle) => norm(p).split("/").some((s) => s.includes(needle));

const RULES = [
  { id: "deleted_backups_archive", test: (p) => hasSegmentContaining(p, "deleted_backups_archive") },
  { id: "extraction_report", test: (p) => /\/(PDF_)?EXTRACTION_REPORT[^/]*\.md$/i.test(norm(p)) },
  { id: "folder_index", test: (p) => /\/INDEX\.md$/.test(norm(p)) },
  { id: "extraction_memory", test: (p) => /\/EXTRACTION_MEMORY[^/]*\.md$/i.test(norm(p)) },
  { id: "tooling_report", test: (p) => /_report\.md$/i.test(norm(p)) },
  { id: "empty_stub_folder", test: (p) => hasSegmentContaining(p, "ملفات_قوالب_فارغة") },
  { id: "no_real_content_folder", test: (p) => hasSegmentContaining(p, "ملفات_بلا_محتوى_حقيقي") },
  { id: "non_legislative", test: (p) => hasSegmentContaining(p, "غير_تشريعي_مؤكد_لا_يُصنف") },
];
const match = (p) => (RULES.find((r) => r.test(p)) || {}).id ?? null;

// Real on-disk spellings, both prefixed and bare. Every one of these paths
// exists (or existed) in the delivered corpus.
const MUST_EXCLUDE = [
  ["أوامر وتعاميم/30 - تعاميم/_deleted_backups_archive/x/y.md", "deleted_backups_archive"],
  ["مبادئ وسوابق قضائية/97 - السوابق القضائية/_deleted_backups_archive/a.md", "deleted_backups_archive"],
  ["أنظمة ولوائح/13 - القسم اللوجستي/deleted_backups_archive/b.md", "deleted_backups_archive"],
  ["أوامر وتعاميم/30 - تعاميم/_deleted_backups_archive/تدقيق/ف106_ملفات_بلا_محتوى_حقيقي/c.md", "deleted_backups_archive"],
  ["97 - السوابق القضائية/تدقيق/ملفات_بلا_محتوى_حقيقي_97/socpa_no_content.md", "no_real_content_folder"],
  ["97 - السوابق القضائية/تدقيق/ملفات_قوالب_فارغة_crsd_97/crsd_stub_4055.md", "empty_stub_folder"],
  ["أنظمة ولوائح/_غير_تشريعي_مؤكد_لا_يُصنف/13/form.md", "non_legislative"],
  ["x/PDF_EXTRACTION_REPORT.md", "extraction_report"],
  ["x/PDF_EXTRACTION_REPORT_المجلد_26.md", "extraction_report"],
  ["x/EXTRACTION_MEMORY_1437_إداري_V1.md", "extraction_memory"],
  ["x/98 - المبادئ القضائية/INDEX.md", "folder_index"],
  ["x/وزارة_العدل_المجموعة_1434_المجلد_29_report.md", "tooling_report"],
];

// Real legal documents — none of these may ever be excluded.
const MUST_KEEP = [
  "أنظمة ولوائح/00 - القسم الإجرائي والقضائي/نظام القضاء/نظام القضاء_هيئة_الخبراء.md",
  "أوامر وتعاميم/30 - تعاميم/المراسيم وقرارات مجلس الوزراء/مرسوم ملكي م-6.md",
  "مبادئ وسوابق قضائية/97 - السوابق القضائية/2- ديوان المظالم/x.md",
  "فقه ومراجع/99 - الكتب الفقهية والقانونية/المغني/المغني - الجزء 01.md",
  // Contains the word "report" but is not a tooling report.
  "أنظمة ولوائح/04 - القسم التجاري/نظام_reporting_standards.md",
];

let failures = 0;

console.log("\n1. Paths that MUST be excluded (real on-disk spellings):");
for (const [p, expected] of MUST_EXCLUDE) {
  const got = match(p);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`   ${ok ? "✔" : "✗"} ${expected.padEnd(24)} ${ok ? "" : `got=${got ?? "NONE"}  `}${p.slice(0, 78)}`);
}

console.log("\n2. Real legal documents that must NOT be excluded:");
for (const p of MUST_KEEP) {
  const got = match(p);
  const ok = got === null;
  if (!ok) failures++;
  console.log(`   ${ok ? "✔" : "✗"} ${ok ? "kept" : `WRONGLY EXCLUDED by ${got}`}  ${p.slice(0, 70)}`);
}

console.log("\n3. The specific regression: prefixed folder names.");
const prefixed = "a/_deleted_backups_archive/b.md";
const bare = "a/deleted_backups_archive/b.md";
const oldStyle = (p) => norm(p).includes("/deleted_backups_archive/");
console.log(`   old rule on bare     : ${oldStyle(bare)}   (worked)`);
console.log(`   old rule on prefixed : ${oldStyle(prefixed)}   ← the bug: silently matched nothing`);
console.log(`   new rule on prefixed : ${RULES[0].test(prefixed)}`);
if (oldStyle(prefixed) || !RULES[0].test(prefixed)) {
  console.log("   ✗ regression check failed");
  failures++;
} else {
  console.log("   ✔ prefixed variant now caught");
}

console.log("\n" + "─".repeat(64));
if (failures) {
  console.error(`✗ ${failures} check(s) failed\n`);
  process.exit(1);
}
console.log("✔ all exclusion rules match the real on-disk folder spellings\n");
