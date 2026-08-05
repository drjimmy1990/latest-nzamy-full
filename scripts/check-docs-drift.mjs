#!/usr/bin/env node
/**
 * check-docs-drift.mjs
 * ──────────────────────────────────────────────────────────────────────
 * فاحص انحراف التوثيق (Docs Drift Checker) — أداة دفاعية ضد التقادم الصامت.
 *
 * المشكلة التي يحلّها: وثائق 13_دليل_المبرمج تستشهد بمئات المواضع بصيغة
 * `ملف:سطر` (مثال: `parse-laws.ts:314`). الكود يتحرك، الوثيقة لا تتحرك،
 * والفجوة لا تُكتشف إلا بمراجعة يدوية مكلفة (كما حدث 2026-07-28).
 *
 * ما يفعله هذا السكربت: يمسح كل ملفات .md في مجلد دليل المبرمج، يستخرج كل
 * استشهاد `ملف:سطر`، يبحث عن الملف المذكور في المستودع الحي، ويتحقق:
 *   1. هل الملف موجود أصلاً؟ (لا = FILE_NOT_FOUND — الحالة الأخطر، رصدت
 *      3 ملفات كاملة تستشهد بملفات محذوفة: law-schema.ts، md_to_platform_json.py،
 *      SITE MAPS NZAMY/*)
 *   2. هل رقم السطر المذكور لا يزال داخل حدود الملف؟ (لا = LINE_OUT_OF_BOUNDS)
 *   3. طباعة السياق الفعلي حول السطر المذكور — لمراجعة بشرية سريعة (لا يثبت
 *      صحة الادّعاء الدلالي، فقط يوفّر عليك فتح الملف يدوياً)
 *
 * ما لا يفعله: لا يتحقق من *صحة* الادّعاء دلالياً (هل الدالة لا تزال تفعل
 * ما تصفه الوثيقة) — هذا يحتاج قراءة بشرية/وكيل. لكنه يقلّص نطاق المراجعة
 * من "مئات الاستشهادات" إلى "الاستشهادات المشبوهة فقط" في ثوانٍ.
 *
 * الاستخدام:
 *   node scripts/check-docs-drift.mjs [--docs <مسار مجلد الوثائق>] [--json]
 *
 * القيمة العملية: شغّله بعد أي تعديل كبير على scripts/parsers أو src/app/laws
 * أو قبل تسليم أي وثيقة لمبرمج جديد — ثوانٍ بدل ساعات.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const docsArgIdx = args.indexOf("--docs");
const DOCS_ROOT =
  docsArgIdx !== -1 && args[docsArgIdx + 1]
    ? path.resolve(args[docsArgIdx + 1])
    : path.resolve(
        "D:\\Data\\Data\\antigravity ai\\تجارب\\Raw_Vault\\00_عقل_القوانين\\13_دليل_المبرمج"
      );

// ── إعدادات المسح ─────────────────────────────────────────────────────
const SKIP_DIR_NAMES = new Set(["node_modules", ".git", ".next", "dist", "build"]);
const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx", ".py", ".sql"]);

// نمط الاستشهاد: اسم_ملف.امتداد:رقم (أو رقم-رقم)
// أمثلة تُطابَق: parse-laws.ts:314 · _article-components.tsx:516-518 ·
//               20260626_legal_library_schema.sql:203 · manifest.ts:33-40
const CITATION_RE =
  /([A-Za-z0-9_\-\u0600-\u06FF]+\.(?:ts|tsx|mjs|js|jsx|py|sql))\s*[:：]\s*(\d+)(?:\s*[-–]\s*(\d+))?/g;

// ── بناء فهرس الملفات الحيّة (basename → [مسارات كاملة]) مرة واحدة ────
function buildLiveFileIndex(root) {
  const index = new Map();
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const ext = path.extname(entry.name);
        if (CODE_EXTENSIONS.has(ext)) {
          const list = index.get(entry.name) || [];
          list.push(full);
          index.set(entry.name, list);
        }
      }
    }
  }
  walk(root);
  return index;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.split(/\r\n|\r|\n/).length;
}

function getContext(filePath, lineNum, span = 1) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r\n|\r|\n/);
  const start = Math.max(0, lineNum - 1 - span);
  const end = Math.min(lines.length, lineNum + span);
  return lines
    .slice(start, end)
    .map((l, i) => `${start + i + 1}: ${l}`)
    .join("\n");
}

function findMarkdownFiles(dir) {
  const results = [];
  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) walk(full);
      } else if (entry.name.endsWith(".md")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ── التنفيذ ────────────────────────────────────────────────────────────
console.error(`📂 مجلد الوثائق: ${DOCS_ROOT}`);
console.error(`📂 المستودع الحي: ${REPO_ROOT}`);
console.error("⏳ بناء فهرس الملفات الحيّة...");

const liveIndex = buildLiveFileIndex(REPO_ROOT);
console.error(`✅ فُهرس ${liveIndex.size} اسم ملف فريد.\n`);

const mdFiles = findMarkdownFiles(DOCS_ROOT);
const findings = [];
let totalCitations = 0;

for (const mdFile of mdFiles) {
  const relMd = path.relative(DOCS_ROOT, mdFile);
  const content = fs.readFileSync(mdFile, "utf8");
  const lines = content.split(/\r\n|\r|\n/);

  lines.forEach((lineText, idx) => {
    let match;
    CITATION_RE.lastIndex = 0;
    while ((match = CITATION_RE.exec(lineText)) !== null) {
      const [, fileName, lineStr, lineEndStr] = match;
      const citedLine = parseInt(lineStr, 10);
      const citedLineEnd = lineEndStr ? parseInt(lineEndStr, 10) : citedLine;
      totalCitations++;

      const candidates = liveIndex.get(fileName);
      if (!candidates || candidates.length === 0) {
        findings.push({
          severity: "FILE_NOT_FOUND",
          mdFile: relMd,
          mdLine: idx + 1,
          citation: `${fileName}:${lineStr}${lineEndStr ? "-" + lineEndStr : ""}`,
          detail: "الملف المستشهَد به غير موجود في المستودع الحي إطلاقاً.",
        });
        continue;
      }

      // لو فيه أكتر من ملف بنفس الاسم، افحص كلهم وسجّل الأنظف
      let bestStatus = null;
      for (const candidatePath of candidates) {
        const totalLines = countLines(candidatePath);
        const relCode = path.relative(REPO_ROOT, candidatePath);
        if (citedLineEnd > totalLines) {
          const status = {
            severity: "LINE_OUT_OF_BOUNDS",
            mdFile: relMd,
            mdLine: idx + 1,
            citation: `${fileName}:${lineStr}${lineEndStr ? "-" + lineEndStr : ""}`,
            detail: `الملف الحي (${relCode}) فيه ${totalLines} سطراً فقط — السطر المستشهَد به يتجاوز نهاية الملف.`,
          };
          if (!bestStatus) bestStatus = status;
        } else {
          bestStatus = {
            severity: "OK_IN_BOUNDS",
            mdFile: relMd,
            mdLine: idx + 1,
            citation: `${fileName}:${lineStr}${lineEndStr ? "-" + lineEndStr : ""}`,
            detail: `داخل حدود الملف (${relCode}، ${totalLines} سطراً). راجع المحتوى يدوياً — الأداة لا تتحقق من الدلالة.`,
            context: getContext(candidatePath, citedLine),
          };
          break; // لقينا نسخة سليمة، مفيش داعي نكمل
        }
      }
      findings.push(bestStatus);
    }
  });
}

// ── التقرير ────────────────────────────────────────────────────────────
const bad = findings.filter((f) => f.severity !== "OK_IN_BOUNDS");
const ok = findings.filter((f) => f.severity === "OK_IN_BOUNDS");

if (jsonMode) {
  console.log(JSON.stringify({ totalCitations, okCount: ok.length, badCount: bad.length, findings }, null, 2));
} else {
  console.log("═".repeat(70));
  console.log("تقرير انحراف التوثيق — 13_دليل_المبرمج مقابل المستودع الحي");
  console.log("═".repeat(70));
  console.log(`إجمالي الاستشهادات المكتشَفة: ${totalCitations}`);
  console.log(`✅ داخل الحدود (يحتاج مراجعة دلالية بشرية):  ${ok.length}`);
  console.log(`🔴 مشبوهة (ملف مفقود / سطر خارج الحدود):     ${bad.length}\n`);

  if (bad.length > 0) {
    console.log("── التفاصيل المشبوهة (أولوية المراجعة) ──\n");
    const grouped = {};
    for (const f of bad) {
      grouped[f.mdFile] = grouped[f.mdFile] || [];
      grouped[f.mdFile].push(f);
    }
    for (const [file, items] of Object.entries(grouped)) {
      console.log(`📄 ${file}`);
      for (const it of items) {
        console.log(`   سطر ${it.mdLine} · [${it.severity}] ${it.citation}`);
        console.log(`   ↳ ${it.detail}`);
      }
      console.log();
    }
  } else {
    console.log("لا استشهادات مشبوهة — كل الملفات والأسطر المذكورة موجودة داخل حدودها.");
  }

  console.log("═".repeat(70));
  console.log("⚠️  تذكير: 'داخل الحدود' لا يعني 'الادّعاء صحيح' — فقط يعني أن");
  console.log("    الملف والسطر موجودان. المراجعة الدلالية تبقى مسؤولية بشرية/وكيل.");
  console.log("═".repeat(70));
}

process.exitCode = bad.length > 0 ? 1 : 0;
