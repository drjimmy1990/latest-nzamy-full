#!/usr/bin/env node
/**
 * owner-fixes-2026-10-05.mjs — the 12 edits the owner's 2026-10-03 library export
 * needs before it parses (إصلاحات_المكتبة_للمالك_٢٠٢٦-١٠-٠٥.md).
 * ─────────────────────────────────────────────────────────────────────────────
 * Touches ONLY files in the owner's own vault on his machine. Never the website,
 * never the database. DRY by default: prints every change and writes nothing.
 *
 *   node library-toolkit/owner-fixes-2026-10-05.mjs --vault "$VAULT"           # look
 *   node library-toolkit/owner-fixes-2026-10-05.mjs --vault "$VAULT" --apply   # do it
 *
 * Each header edit replaces exactly ONE front-matter line and refuses when that
 * line is missing or appears more than once. A file not found at its path is
 * looked up by its exact name anywhere in the library (it may have moved); two
 * files with that name → refused. Re-running after --apply reports "already done".
 * Nothing is deleted: the three company charters are MOVED to
 * $VAULT/02_بانتظار_قرار_النطاق/ (outside the parsed library) until the owner
 * decides their scope (question ١٠٥).
 *
 * Exit: 0 = every item done or ready, 1 = something needs a hand edit, 2 = bad args.
 */
import fs from "node:fs";
import path from "node:path";

const USAGE = `Usage: node library-toolkit/owner-fixes-2026-10-05.mjs --vault <Raw_Vault folder> [--apply]`;
const args = process.argv.slice(2);
let vault = null;
let apply = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--vault" && args[i + 1] && !args[i + 1].startsWith("--")) vault = args[++i];
  else if (args[i] === "--apply") apply = true;
  else if (args[i] === "--help" || args[i] === "-h") { console.log(USAGE); process.exit(0); }
  else { console.error(`✗ Unknown option "${args[i]}". Nothing was changed.\n${USAGE}`); process.exit(2); }
}
if (!vault) { console.error(`✗ --vault is required. Nothing was changed.\n${USAGE}`); process.exit(2); }
const LIB = path.join(path.resolve(vault), "01_المكتبة_القانونية");
const HOLD = path.join(path.resolve(vault), "02_بانتظار_قرار_النطاق");
if (!fs.existsSync(LIB)) { console.error(`✗ Not found: ${LIB}\n  --vault must be the folder that contains 01_المكتبة_القانونية.`); process.exit(2); }

const LAWS = "أنظمة ولوائح";
const DECREES = "أوامر وتعاميم";
const FIXES = [
  { what: "SOCPA — not legislation: say it in the new field (agrees with the scope registry; stays unpublished)",
    rel: `${LAWS}/08 - القسم المالي والمصرفي/الهيئة السعودية للمراجعين والمحاسبين (SOCPA)/سياسة الجودة.md`,
    from: /^gate_zero_status:/, to: "corpus_scope: institutional_reference" },
  { what: "SOCPA — not legislation: say it in the new field (agrees with the scope registry; stays unpublished)",
    rel: `${LAWS}/08 - القسم المالي والمصرفي/الهيئة السعودية للمراجعين والمحاسبين (SOCPA)/معايير واستفسارات تحت الدراسة.md`,
    from: /^gate_zero_status:/, to: "corpus_scope: institutional_reference" },
  { what: "company charter — set aside until question ١٠٥ is answered", move: true,
    rel: `${DECREES}/30 - تعاميم/أنظمة أساسية للشركات/04 - القسم التجاري/NCAR-DOC-01618_مرسوم-م-20_1431-04-15_النظام الأساس لشركة وادي جدة (شركة سعودية مساهمة).md` },
  { what: "company charter — set aside until question ١٠٥ is answered", move: true,
    rel: `${DECREES}/30 - تعاميم/أنظمة أساسية للشركات/04 - القسم التجاري/NCAR-DOC-02996_قرار_مجلس_الوزراء_النظام_الأساس_لشركة_الصحة_القابضة_1443.md` },
  { what: "company charter — set aside until question ١٠٥ is answered", move: true,
    rel: `${DECREES}/30 - تعاميم/أنظمة أساسية للشركات/08 - القسم المالي والمصرفي/مرسوم_ملكي_م-15_1428-03-01_النظام_الأساس_لشركة_السوق_المالية_السعودية_تداول.md` },
  { what: "type «مدونة» is not in the allowed list",
    rel: `${LAWS}/02 - القسم الإداري/قرار-555_1437-12-25_مدونة قواعد السلوك الوظيفي وأخلاقيات الوظيفة العامة لعام 1437هـ.md`,
    from: /^type:\s*["']?مدونة["']?\s*$/, to: 'type: "لائحة تنفيذية"' },
  { what: "type «مدونة» is not in the allowed list",
    rel: `${LAWS}/10 - القسم الصحي والدوائي/مدونة_ممارسة_التوزيع_والتخزين_الجيدة_الهيئة_العامة_للغذاء_والدواء.md`,
    from: /^type:\s*["']?مدونة["']?\s*$/, to: 'type: "لائحة تنفيذية"' },
  { what: "type «مدونة» is not in the allowed list",
    rel: `${LAWS}/10 - القسم الصحي والدوائي/مدونة_نقل_وتخزين_المنتجات_الخاضعة_لإشراف_قطاع_الدواء_عن_طريق_المنافذ_الجمركية.md`,
    from: /^type:\s*["']?مدونة["']?\s*$/, to: 'type: "لائحة تنفيذية"' },
  { what: "type «مدونة» is not in the allowed list",
    rel: `${LAWS}/20 - القسم التعليمي/مدونة قواعد السلوك الوظيفي واخلاقيات الوظيفة لشاغلي الوظايف التعليمية النسخة المعتمدة 14-10-1447_وزارة_التعليم.md`,
    from: /^type:\s*["']?مدونة["']?\s*$/, to: 'type: "لائحة تنفيذية"' },
  { what: "type «برنامج» is not in the allowed list",
    rel: `${LAWS}/13 - القسم اللوجستي/البرنامج الوطني لتسهيلات النقل الجوي (Air Transport Facilitation Programme)_الطيران_المدني.md`,
    from: /^type:\s*["']?برنامج["']?\s*$/, to: 'type: "لائحة تنفيذية"' },
  { what: "duplicate points to the survivor's `id`; the parser knows it by its instrument_id",
    rel: `${LAWS}/09 - القسم الضريبي/أدلة إرشادية/40_الحكومة.md`,
    from: /^superseded_by:\s*["']?LAW-09-0258["']?\s*$/, to: 'superseded_by: "LAW-09-0231"' },
  { what: "duplicate points to NCAR-DOC-00618, which no file declares; the same-title file, by path",
    rel: `${DECREES}/30 - تعاميم/قرارات وأوامر دار الوثائق/قرار_وزاري_تعديل_جدول_وقواعد_المخالفات_والعقوبات_للأنشطة_السياحية_دار_الوثائق.md`,
    from: /^superseded_by:\s*["']?NCAR-DOC-00618["']?\s*$/, to: `superseded_by: "${LAWS}/25 - القسم السياحي/NCAR-DOC-00618.md"` },
];

// ── locate a file: its path (NFC-tolerant per segment), else its unique name ──
function entry(dir, name) {
  const direct = path.join(dir, name);
  if (fs.existsSync(direct)) return direct;
  let ents;
  try { ents = fs.readdirSync(dir); } catch { return null; }
  const hit = ents.find((e) => e.normalize("NFC") === name.normalize("NFC"));
  return hit === undefined ? null : path.join(dir, hit);
}
function byPath(root, rel) {
  let cur = root;
  for (const seg of rel.split("/")) { cur = entry(cur, seg); if (!cur) return null; }
  return cur;
}
let allFiles = null;
function byName(root, name) {
  if (!allFiles) {
    allFiles = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith(".md")) allFiles.push(p);
      }
    })(root);
  }
  return allFiles.filter((p) => path.basename(p).normalize("NFC") === name.normalize("NFC"));
}
function locate(fix) {
  const exact = byPath(LIB, fix.rel);
  if (exact) return { file: exact };
  const same = byName(LIB, path.basename(fix.rel));
  if (same.length === 1) return { file: same[0], moved: true };
  return { error: same.length ? `${same.length} files share this name — edit by hand` : "file not found in the library" };
}

let pending = 0;
let problems = 0;
console.log(`Vault: ${path.resolve(vault)}`);
console.log(`Mode : ${apply ? "⚠️  APPLY (edits your files)" : "DRY — shows the changes, writes nothing"}\n`);
FIXES.forEach((fix, i) => {
  const n = String(i + 1).padStart(2, " ");
  const name = path.basename(fix.rel);
  if (fix.move) {
    const done = entry(HOLD, name);
    const loc = locate(fix);
    if (loc.error && done) { console.log(`${n} ✔ already set aside: ${name}`); return; }
    if (loc.error) { console.log(`${n} ✗ ${loc.error}: ${name}`); problems++; return; }
    console.log(`${n} ${apply ? "→" : "•"} move ${path.relative(LIB, loc.file)}\n      to 02_بانتظار_قرار_النطاق/   (${fix.what})`);
    if (apply) { fs.mkdirSync(HOLD, { recursive: true }); fs.renameSync(loc.file, path.join(HOLD, path.basename(loc.file))); }
    else pending++;
    return;
  }
  const loc = locate(fix);
  if (loc.error) { console.log(`${n} ✗ ${loc.error}: ${name}`); problems++; return; }
  const text = fs.readFileSync(loc.file, "utf8");
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(nl);
  const close = lines.findIndex((l, j) => j > 0 && l.trim() === "---");
  if (!/^﻿?---\s*$/.test(lines[0] ?? "") || close < 0) { console.log(`${n} ✗ no front matter: ${name}`); problems++; return; }
  const head = lines.slice(1, close);
  if (head.some((l) => l === fix.to)) { console.log(`${n} ✔ already done: ${name}`); return; }
  const at = head.map((l, j) => (fix.from.test(l) ? j + 1 : -1)).filter((j) => j > 0);
  if (at.length !== 1) {
    console.log(`${n} ✗ expected line ${at.length ? "appears " + at.length + " times" : "not found"} — edit by hand: ${name}`);
    problems++;
    return;
  }
  console.log(`${n} ${apply ? "→" : "•"} ${path.relative(LIB, loc.file)}${loc.moved ? "   (found under a new folder)" : ""}\n      ${lines[at[0]]}\n   →  ${fix.to}`);
  if (apply) { lines[at[0]] = fix.to; fs.writeFileSync(loc.file, lines.join(nl)); }
  else pending++;
});

console.log("");
if (problems) console.log(`✗ ${problems} item(s) need a hand edit — see إصلاحات_المكتبة_للمالك_٢٠٢٦-١٠-٠٥.md.`);
if (!apply && pending) console.log(`DRY RUN — ${pending} change(s) ready. Nothing was written. Add --apply to make them.`);
if (apply) console.log(`Done. Now run the parse again (guide step 2) with a NEW output folder.`);
if (!problems && !pending && !apply) console.log("✔ All 12 already done.");
process.exitCode = problems ? 1 : 0;
