#!/usr/bin/env -S npx tsx
/**
 * check-frontmatter-contract-drift.ts
 * ──────────────────────────────────────────────────────────────────────
 * ك-06 — لينتر عقد آلي شامل لأربعة حقول: has_preamble / issuing_instrument /
 * article_status_summary / latest_update. عدّادات آلية بكل تشغيلة بدل حملة
 * يدوية (كالحملة الـ18-وكيلاً 2026-08-15 لب-111).
 *
 * تقرير-فقط بالكامل — صفر تعديل تلقائي على أي ملف. كل ما يفعله هذا السكربت
 * هو تحديد المرشَّحين لمراجعة بشرية، ليس البتّ فيهم (نفس فلسفة ب-111: الفحص
 * الآلي "محافظ جداً بطبيعته").
 *
 * يعيد استخدام parseFrontmatter المشتركة (lib/frontmatter.ts) — نفس ما
 * يقرؤه المحلّل الحي فعلياً، لا إعادة تنفيذ منطق تحليل مستقل قد ينحرف عنه.
 *
 * الفحوص الأربعة:
 *   أ) has_preamble — للأنظمة/اللوائح فقط (schema_manifest has_preamble_applies_to):
 *      true بلا كتلة <summary>ديباجة...</summary> بالجسم ⇒ MISSING_PREAMBLE_BLOCK
 *      false مع وجود كتلة كهذه بالجسم ⇒ UNEXPECTED_PREAMBLE_BLOCK (مخالفة صريحة
 *      لقاعدة "لا يُنشأ قسم ديباجة مزيف" — راجع has_preamble_note بالمانيفست)
 *      غائب كلياً عن نوع مؤهَّل ⇒ MISSING_FIELD
 *   ب) issuing_instrument — مطلوب، سلسلة غير فارغة (للأنظمة/اللوائح)
 *   ج) article_status_summary — الحقول الستة حاضرة + مجموع الحالات = total_articles
 *      + total_articles يطابق عدد مراسي ARTICLE_START الفعلي بالجسم
 *   د) latest_update — فحص شكلي (كائن بمفاتيحه الثلاثة) + فحص عمقي لب-111:
 *      لملفات has_merged_regulation:true فقط، يقارن سنة latest_update.date_hijri
 *      بأقصى سنة هجرية مذكورة داخل merged_regulation_details[].issuing_instrument
 *      (حقل مُهيكل، لا نص <details> حر — يتفادى فخّي ب-111 الموثَّقين: التعشيش
 *      والحواشي التسموية). أي سنة مجاورة لـ"أُعيد تسمية"/"أُعيدت تسمية"/"لاحقاً إلى"
 *      تُستبعَد صراحة (القاعدة المُلزِمة، ب-111 تحديث 2026-08-16).
 *
 * الاستخدام:
 *   npx tsx scripts/check-frontmatter-contract-drift.ts [--json] [--input <مسار>]
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

// «غير مصنف» مستبعد بقرار قائم — محجوز لدورة عمل لاحقة (راجع الذاكرة التشغيلية).
// مجلدات الأرشيف/النسخ الاحتياطية مستبعدة لأنها ليست ملفات حية بالمكتبة.
const SKIP_PATH_PATTERNS = [
  /غير مصنف/,
  /deleted_backups_archive/i,
  /_أرشيف_خارج_البذر/,
  /\.backup/i,
  /\.pre_/,
];

const APPLIES_TO_PREAMBLE = new Set(["نظام", "لائحة تنفيذية"]);

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
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

// ── استخراج سنوات هجرية من نص حر، باستبعاد حواشي إعادة التسمية (ب-111) ──
const HIJRI_YEAR_RE = /(1[3-4]\d{2})\s*ه[ـ]?/g;
const RENAME_TRAP_RE = /(أُعيد(?:ت)?\s+تسمي|لاحقاً\s+إلى)/;

function extractHijriYears(text: string | null | undefined): number[] {
  if (!text) return [];
  const years: number[] = [];
  // امسح جملة-جملة تقريبياً (بفواصل/نقاط) لتطبيق فخّ إعادة التسمية بسياق محلي
  // لا بالنص كله — فقرة تحوي حاشية تسمية وسنة نظامية حقيقية معاً لا تُسقِط الاثنتين.
  const segments = text.split(/(?<=[.؛])\s+/);
  for (const seg of segments) {
    if (RENAME_TRAP_RE.test(seg)) continue;
    let m: RegExpExecArray | null;
    HIJRI_YEAR_RE.lastIndex = 0;
    while ((m = HIJRI_YEAR_RE.exec(seg)) !== null) {
      years.push(parseInt(m[1], 10));
    }
  }
  return years;
}

interface Finding {
  check: string;
  severity: "MISSING_FIELD" | "STRUCTURE" | "MISMATCH" | "CANDIDATE_REVIEW";
  file: string;
  detail: string;
}

const findings: Finding[] = [];
let scanned = 0;
let applicableToPreamble = 0;
let mergedRegulationFiles = 0;

const files = findMdFiles(INPUT_ROOT);

for (const filePath of files) {
  const relPath = path.relative(INPUT_ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw, relPath);
  if (!meta || Object.keys(meta).length === 0) continue; // لا فرونت-ماتر أصلاً، خارج نطاق هذا اللينتر
  scanned++;

  const type = typeof meta.type === "string" ? meta.type : null;
  const isPreambleApplicable = type != null && APPLIES_TO_PREAMBLE.has(type);

  // ── أ) has_preamble ──────────────────────────────────────────────────
  if (isPreambleApplicable) {
    applicableToPreamble++;
    const hasPreambleField = meta.has_preamble;
    const bodyHasPreambleBlock = /<summary>[^<]*ديباجة[^<]*<\/summary>/.test(body);

    if (hasPreambleField === undefined) {
      findings.push({
        check: "has_preamble",
        severity: "MISSING_FIELD",
        file: relPath,
        detail: `النوع "${type}" مؤهَّل لكن حقل has_preamble غائب كلياً من الفرونت-ماتر.`,
      });
    } else if (hasPreambleField === true && !bodyHasPreambleBlock) {
      findings.push({
        check: "has_preamble",
        severity: "MISMATCH",
        file: relPath,
        detail: `has_preamble: true لكن لا كتلة <summary>ديباجة...</summary> موجودة بالجسم.`,
      });
    } else if (hasPreambleField === false && bodyHasPreambleBlock) {
      findings.push({
        check: "has_preamble",
        severity: "MISMATCH",
        file: relPath,
        detail: `has_preamble: false لكن كتلة ديباجة موجودة فعلياً بالجسم — مخالفة لقاعدة "لا يُنشأ قسم ديباجة مزيف".`,
      });
    }

    // ── ب) issuing_instrument ─────────────────────────────────────────
    const instrument = meta.issuing_instrument;
    if (instrument == null || (typeof instrument === "string" && instrument.trim() === "")) {
      findings.push({
        check: "issuing_instrument",
        severity: "MISSING_FIELD",
        file: relPath,
        detail: `issuing_instrument مطلوب (سلسلة غير فارغة) للنوع "${type}" — غائب أو فارغ.`,
      });
    }

    // ── ج) article_status_summary ───────────────────────────────────────
    const summary = meta.article_status_summary as Record<string, unknown> | undefined;
    if (!summary || typeof summary !== "object") {
      findings.push({
        check: "article_status_summary",
        severity: "MISSING_FIELD",
        file: relPath,
        detail: `article_status_summary مطلوب ككائن — غائب أو نوعه خاطئ.`,
      });
    } else {
      const keys = ["total_articles", "active", "amended", "repealed", "added", "suspended"];
      const missingKeys = keys.filter((k) => !(k in summary));
      if (missingKeys.length > 0) {
        findings.push({
          check: "article_status_summary",
          severity: "STRUCTURE",
          file: relPath,
          detail: `مفاتيح ناقصة: ${missingKeys.join("، ")}`,
        });
      } else {
        const total = Number(summary.total_articles) || 0;
        const sumStates =
          (Number(summary.active) || 0) +
          (Number(summary.amended) || 0) +
          (Number(summary.repealed) || 0) +
          (Number(summary.added) || 0) +
          (Number(summary.suspended) || 0);
        if (sumStates !== total) {
          findings.push({
            check: "article_status_summary",
            severity: "MISMATCH",
            file: relPath,
            detail: `مجموع الحالات (${sumStates}) ≠ total_articles (${total}).`,
          });
        }
        const actualAnchors = (body.match(/<!--\s*ARTICLE_START\b/g) || []).length;
        if (actualAnchors > 0 && actualAnchors !== total) {
          findings.push({
            check: "article_status_summary",
            severity: "MISMATCH",
            file: relPath,
            detail: `total_articles المُعلَن (${total}) ≠ مراسي ARTICLE_START الفعلية بالجسم (${actualAnchors}).`,
          });
        }
      }
    }
  }

  // ── د) latest_update ─────────────────────────────────────────────────
  const latestUpdate = meta.latest_update;
  if (latestUpdate !== null && latestUpdate !== undefined) {
    if (typeof latestUpdate !== "object" || Array.isArray(latestUpdate)) {
      findings.push({
        check: "latest_update",
        severity: "STRUCTURE",
        file: relPath,
        detail: `latest_update موجود لكن نوعه ليس كائناً (${typeof latestUpdate}).`,
      });
    } else {
      const lu = latestUpdate as Record<string, unknown>;
      const missingKeys = ["instrument", "date_hijri", "attachment_pdf"].filter((k) => !(k in lu));
      if (missingKeys.length > 0) {
        findings.push({
          check: "latest_update",
          severity: "STRUCTURE",
          file: relPath,
          detail: `مفاتيح ناقصة بكائن latest_update: ${missingKeys.join("، ")}`,
        });
      }

      // فحص ب-111 العمقي — فقط للملفات المدمجة
      if (meta.has_merged_regulation === true) {
        mergedRegulationFiles++;
        const details = Array.isArray(meta.merged_regulation_details)
          ? (meta.merged_regulation_details as Record<string, unknown>[])
          : [];
        let maxRegYear = 0;
        let maxRegSource = "";
        for (const d of details) {
          const candidates = [d.issuing_instrument, d.note].filter(
            (v): v is string => typeof v === "string",
          );
          for (const c of candidates) {
            for (const y of extractHijriYears(c)) {
              if (y > maxRegYear) {
                maxRegYear = y;
                maxRegSource = String(d.title ?? "").slice(0, 60);
              }
            }
          }
        }
        const dateHijriRaw = typeof lu.date_hijri === "string" ? lu.date_hijri : "";
        const lawYearMatch = dateHijriRaw.match(/(1[3-4]\d{2})/);
        const lawYear = lawYearMatch ? parseInt(lawYearMatch[1], 10) : 0;

        if (maxRegYear > 0 && lawYear > 0 && maxRegYear > lawYear) {
          findings.push({
            check: "latest_update",
            severity: "CANDIDATE_REVIEW",
            file: relPath,
            detail: `latest_update.date_hijri (${lawYear}هـ) أقدم من أحدث سنة مذكورة بملحق مدمج (${maxRegYear}هـ، "${maxRegSource}") — مرشَّح لفجوة ب-111، يحتاج تحقُّقاً بشرياً (ليس دليلاً قاطعاً).`,
          });
        }
      }
    }
  }
}

// ── التقرير ────────────────────────────────────────────────────────────
const byCheck: Record<string, Finding[]> = {};
for (const f of findings) {
  (byCheck[f.check] = byCheck[f.check] || []).push(f);
}

if (jsonMode) {
  console.log(
    JSON.stringify(
      { scanned, applicableToPreamble, mergedRegulationFiles, totalFindings: findings.length, findings },
      null,
      2,
    ),
  );
} else {
  console.log("═".repeat(70));
  console.log("لينتر عقد الفرونت-ماتر — has_preamble / issuing_instrument /");
  console.log("article_status_summary / latest_update (ك-06)");
  console.log("═".repeat(70));
  console.log(`ملفات مفحوصة (بفرونت-ماتر صالح): ${scanned}`);
  console.log(`مؤهَّلة لفحص has_preamble/issuing_instrument (نظام|لائحة تنفيذية): ${applicableToPreamble}`);
  console.log(`ملفات has_merged_regulation:true (نطاق فحص latest_update العمقي): ${mergedRegulationFiles}`);
  console.log(`إجمالي النتائج: ${findings.length}\n`);

  for (const [check, list] of Object.entries(byCheck)) {
    console.log(`── ${check} (${list.length}) ──`);
    const capped = list.slice(0, 15);
    for (const f of capped) {
      console.log(`   [${f.severity}] ${f.file}`);
      console.log(`   ↳ ${f.detail}`);
    }
    if (list.length > capped.length) {
      console.log(`   … و${list.length - capped.length} أخرى — راجع --json للقائمة الكاملة`);
    }
    console.log();
  }

  console.log("═".repeat(70));
  console.log("⚠️  تذكير: CANDIDATE_REVIEW بفحص latest_update مرشَّح لا حكم نهائي —");
  console.log("    يحتاج تحقُّقاً بشرياً لكل حالة (نفس تحذير ب-111: الفحص محافظ لكن ليس معصوماً).");
  console.log("═".repeat(70));
}

process.exitCode = findings.length > 0 ? 1 : 0;
