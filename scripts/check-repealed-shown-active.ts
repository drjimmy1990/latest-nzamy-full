#!/usr/bin/env -S npx tsx
/**
 * check-repealed-shown-active.ts
 * ──────────────────────────────────────────────────────────────────────
 * ك-07 — مسح تقرير-فقط لنمط ب-44: نظام/تنظيم سابق يبقى status:active
 * رغم استبدال صريح وموثَّق بنص نظام لاحق بنفس المكتبة نفسها. **صفر تعديل
 * تلقائي على أي ملف** — هذا كاشف مرشَّحين للمراجعة البشرية فقط، تماماً
 * كما نصّ بند ك-07 بالخطة الموحَّدة.
 *
 * يعيد استخدام نمط ب-44 المُثبَت حرفياً (لا إعادة تصميم — النمط تحقَّق
 * فعلاً مقابل حالة نظام السياحة 1436هـ/1444هـ المؤكَّدة، 2026-08-11).
 *
 * الطريقة:
 *   1) لكل ملف: ابحث بالجسم عن جملة "يحل [النظام/التنظيم/هذا...] محل ...
 *      رقم (...) وتاريخ (...)" — استخرج رقم الأداة المُستبدَلة وتاريخها.
 *   2) طبِّع رقم الأداة (أرقام فقط، بلا "م/" ولا مسافات) والسنة الهجرية
 *      (4 أرقام) من كلا الطرفين: نص الاستبدال + issuing_instrument لكل
 *      ملف آخر بالمكتبة.
 *   3) تطابق رقم الأداة + السنة ⇒ مرشَّح. إن كان status الملف المُستهدَف
 *      != repealed ⇒ **مرشَّح لعطل ب-44** (يحتاج تحقُّقاً بشرياً، كما أن
 *      المطابقة نصية تقريبية لا قطعية).
 *
 * الاستخدام:
 *   npx tsx scripts/check-repealed-shown-active.ts [--json] [--input <مسار>]
 */

import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./parsers/lib/frontmatter";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const inputArgIdx = args.indexOf("--input");
const INPUT_ROOT =
  inputArgIdx !== -1 && args[inputArgIdx + 1]
    ? path.resolve(args[inputArgIdx + 1])
    : "D:\\Data\\Data\\antigravity ai\\تجارب\\Raw_Vault\\01_المكتبة_القانونية\\أنظمة ولوائح";

const SKIP_PATH_PATTERNS = [
  /غير مصنف/,
  /deleted_backups_archive/i,
  /_أرشيف_خارج_البذر/,
  /\.backup/i,
  /\.pre_/,
];
function shouldSkip(p: string): boolean {
  return SKIP_PATH_PATTERNS.some((re) => re.test(p));
}
function findMdFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (shouldSkip(full)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) out.push(full);
    }
  }
  walk(root);
  return out;
}

// نمط ب-44 المُثبَت حرفياً (2026-08-11)، مُتحقَّق مقابل حالة نظام السياحة.
const SUPERSEDE_RE =
  /يحل (?:النظام|التنظيم|هذا النظام|هذا التنظيم) محل .{0,80}?رقم\s*\(?([^)]{1,20})\)?\s*وتاريخ\s*([\d\s/]{4,20}ه)/g;

function normalizeInstrumentNumber(raw: string): string | null {
  // "م / 2" -> "2" · "(م/188)" -> "188" · يتجاهل أي شيء غير رقمي بحت آخر النص
  const m = raw.match(/(\d+)\s*$/);
  return m ? m[1] : null;
}
function extractHijriYear(raw: string): number | null {
  const m = raw.match(/(1[3-4]\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

interface LawRecord {
  relPath: string;
  status: string | null;
  instrumentRaw: string | null;
  instrumentNumber: string | null;
  instrumentYear: number | null;
}

interface SupersessionClaim {
  fromFile: string;
  claimedInstrumentRaw: string;
  claimedNumber: string | null;
  claimedYear: number | null;
}

const allLaws: LawRecord[] = [];
const claims: SupersessionClaim[] = [];

for (const filePath of findMdFiles(INPUT_ROOT)) {
  const relPath = path.relative(INPUT_ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw, relPath);
  if (!meta || Object.keys(meta).length === 0) continue;

  const instrumentRaw = typeof meta.issuing_instrument === "string" ? meta.issuing_instrument : null;
  allLaws.push({
    relPath,
    status: typeof meta.status === "string" ? meta.status : null,
    instrumentRaw,
    instrumentNumber: instrumentRaw ? normalizeInstrumentNumber(instrumentRaw) : null,
    instrumentYear: instrumentRaw ? extractHijriYear(instrumentRaw) : null,
  });

  let m: RegExpExecArray | null;
  SUPERSEDE_RE.lastIndex = 0;
  while ((m = SUPERSEDE_RE.exec(body)) !== null) {
    claims.push({
      fromFile: relPath,
      claimedInstrumentRaw: `رقم (${m[1].trim()}) وتاريخ ${m[2].trim()}`,
      claimedNumber: normalizeInstrumentNumber(m[1]),
      claimedYear: extractHijriYear(m[2]),
    });
  }
}

interface Finding {
  supersedingFile: string;
  claimedInstrument: string;
  targetFile: string;
  targetInstrument: string;
  targetStatus: string;
}

const findings: Finding[] = [];
for (const claim of claims) {
  if (!claim.claimedNumber || !claim.claimedYear) continue;
  for (const law of allLaws) {
    if (law.relPath === claim.fromFile) continue; // لا تطابق الملف مع نفسه
    if (!law.instrumentNumber || !law.instrumentYear) continue;
    if (law.instrumentNumber === claim.claimedNumber && law.instrumentYear === claim.claimedYear) {
      if (law.status !== "repealed") {
        findings.push({
          supersedingFile: claim.fromFile,
          claimedInstrument: claim.claimedInstrumentRaw,
          targetFile: law.relPath,
          targetInstrument: law.instrumentRaw || "",
          targetStatus: law.status || "(غائب)",
        });
      }
    }
  }
}

// ── التقرير ────────────────────────────────────────────────────────────
if (jsonMode) {
  console.log(
    JSON.stringify(
      { totalLaws: allLaws.length, totalSupersessionClaims: claims.length, findings },
      null,
      2,
    ),
  );
} else {
  console.log("═".repeat(70));
  console.log("مسح «ملغى معروض سارياً» — نمط ب-44 (تقرير-فقط، صفر تعديل)");
  console.log("═".repeat(70));
  console.log(`ملفات نظام/لائحة مفحوصة: ${allLaws.length}`);
  console.log(`جمل استبدال صريح ("يحل ... محل ...") مكتشَفة: ${claims.length}`);
  console.log(`مرشَّحون لعطل ب-44 (استبدال صريح + status الهدف != repealed): ${findings.length}\n`);

  if (findings.length === 0) {
    console.log("لا مرشَّحين — كل حالات الاستبدال الصريح المكتشَفة تشير لملفات مُوسَمة repealed بالفعل.");
  } else {
    for (const f of findings) {
      console.log(`🔴 ${f.supersedingFile}`);
      console.log(`   يذكر استبدال: ${f.claimedInstrument}`);
      console.log(`   ↳ يطابق (رقم+سنة): ${f.targetFile}`);
      console.log(`   ↳ issuing_instrument هناك: "${f.targetInstrument}"، status الحالي: "${f.targetStatus}"`);
      console.log();
    }
  }

  console.log("═".repeat(70));
  console.log("⚠️  مطابقة نصية تقريبية (رقم أداة + سنة هجرية فقط) — كل نتيجة");
  console.log("    مرشَّح يحتاج تحقُّقاً بشرياً مباشراً قبل أي تعديل status، لا حكماً نهائياً.");
  console.log("    صفر تغطية لصيغ استبدال أخرى غير جملة \"يحل ... محل ...\" الحرفية.");
  console.log("═".repeat(70));
}

process.exitCode = findings.length > 0 ? 1 : 0;
