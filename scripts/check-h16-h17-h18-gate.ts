#!/usr/bin/env -S npx tsx
/**
 * check-h16-h17-h18-gate.ts
 * ──────────────────────────────────────────────────────────────────────
 * ك-10 — كواشف قياس مُتحقَّقة لثلاث حملات مشروطة (ح-16/17/18)، **بوابة
 * إلزامية قبل فتح أي منها** (الخطة الموحَّدة، القسم 4 قاعدة 6). أرقام
 * Antigravity الأصلية (267/37/32 ملفاً) **غير موثوقة** — نفس الجولة شهدت
 * سقوط 3 ادّعاءات رقمية واثقة أخرى بالفحص المباشر (ملحق_المخرب_خطة_
 * المتبقي_2026-08-23.md، القسم ج). هذا السكربت يستبدل الادّعاء بقياس حقيقي.
 *
 * تقرير-فقط بالكامل — صفر تعديل تلقائي.
 *
 * ثلاثة فحوص، كل واحد مبني على تعريف دقيق موثَّق (لا تخمين):
 *
 *   ح-16 (2-19) — التطابق الثلاثي لحالة التعديل. التعريف الحرفي: قاعدة (ط)
 *   بمهارة legal-library-seo (SKILL.md:217، حادثة نظام حماية حقوق المؤلف،
 *   2026-07-20). لكل ملف فيه مادة معدَّلة واحدة على الأقل: عدد وسوم
 *   "status":"amended" داخل ARTICLE_START = عدد كتل "📜 الإصدارات السابقة"
 *   = article_status_summary.amended بالفرونت-ماتر. حادثة موثَّقة: ملف
 *   كان amended:9 صحيحاً وله 9 توجلات صحيحة، لكن كل الوسوم كانت لا تزال
 *   "status":"active" — الثلاثة أرقام يجب أن تتطابق، لا رقمان من ثلاثة.
 *
 *   ح-17 (2-20) — تسرب ملاحظات المعالجة. التعريف الحرفي: قاعدة (ز)
 *   (SKILL.md:215، معايرة القاضي 2026-07-19). أي ملاحظة ظاهرة بالمتن أو
 *   داخل مطوية <details> (المطويات تُعرض وتُفهرَس فعلياً، لا تُعامَل
 *   كمخفية) — "تم النقل"، "تم الدمج"، أو اعتراف بنقص مصدر ("رقم القرار
 *   غير معروف"). فحص محافظ: "تم النقل"/"تم الدمج" ثقة عالية (لا يمكن أن
 *   تكون نصاً تشريعياً حقيقياً)؛ نمط "رقم/تاريخ/قرار/مرسوم ... غير معروف"
 *   ثقة أدنى (يُعلَّم مرشَّحاً منفصلاً، "غير معروف" وحدها قد ترد بنص قانوني
 *   حقيقي فتُستبعَد لتفادي إنذار كاذب).
 *
 *   ح-18 (2-21) — مراسي ملتحمة/غير مغلقة. تعليق HTML `<!--` بلا `-->`
 *   مقابلة يبتلع كل ما بعده (نفس عائلة ب-142 بنيوياً). فحص: عدّ `<!--`
 *   مقابل `-->` لكل ملف؛ فرق ⇒ تعليق غير مغلق بمكان ما.
 *
 * الاستخدام:
 *   npx tsx scripts/check-h16-h17-h18-gate.ts [--json] [--input <مسار>]
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
    : "D:\\Data\\Data\\antigravity ai\\تجارب\\Raw_Vault\\01_المكتبة_القانونية";

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

interface Finding {
  gate: "ح-16" | "ح-17" | "ح-18";
  file: string;
  detail: string;
}
const findings: Finding[] = [];
let scanned = 0;

// ── ح-17 — راجع الحاشية بأسفل الملف: "تم النقل"/"تم الدمج" أُسقِطا من
// المسح بعد اختبار حقيقي (لا افتراض) — كلاهما صيغة عربية قانونية عادية
// شائعة جداً («يتم النقل بموافقة...»، «إذا تم الدمج بين...») لا يمكن
// تمييزها عن ملاحظة معالجة مسرَّبة بمطابقة نصية بسيطة؛ أول تشغيل حقيقي
// أنتج ~100% إنذاراً كاذباً بالعيّنة المفحوصة يدوياً. النمط الوحيد المُبقى:
// اعتراف صريح بنقص مصدر (رقم/تاريخ/أداة "غير معروف") — أضيق من نطاق
// الحملة الأصلي لكنه دقيق فعلياً، لا تخميناً واسعاً غير موثوق.
const UNKNOWN_SOURCE_RE = /(رقم|تاريخ|القرار|المرسوم|الأداة)[^.؛\n]{0,15}غير معروف/;

for (const filePath of findMdFiles(INPUT_ROOT)) {
  const relPath = path.relative(INPUT_ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { meta, body } = parseFrontmatter(raw, relPath);
  if (!meta || Object.keys(meta).length === 0) continue;
  scanned++;

  // ── ح-16: التطابق الثلاثي — مُصحَّح بعد اختبار حقيقي كشف خطأ تصميم ──
  // الفحص الأصلي قارن كتل 📜 بـ article_status_summary.amended وحده. اختبار
  // حقيقي (نظام تركيز مسؤوليات القضاء الشرعي: 159 كتلة 📜 مقابل amended:1)
  // كشف أن المواد "repealed" تحمل كتلة 📜 شرعية أيضاً (نص ما-قبل-الإلغاء
  // محفوظاً) — سلوك صحيح موثَّق صراحة بقاعدة (ز) بمهارة السيو ("متن سارٍ
  // فارغ + مطوية ممتلئة في مادة ملغاة هو السلوك الصحيح"). المقارنة الآن:
  //   (أ) وسوم status:"amended" مقابل article_status_summary.amended — الزوج
  //       الأصلي من حادثة نظام حماية حقوق المؤلف، يبقى كما هو.
  //   (ب) كتل 📜 مقابل (amended + repealed) — الفولد يُتوقَّع من الاثنين معاً.
  const anchorAmendedCount = (body.match(/"status"\s*:\s*"amended"/g) || []).length;
  const historyBlockCount = (body.match(/📜\s*الإصدارات السابقة/g) || []).length;
  const summary = meta.article_status_summary as Record<string, unknown> | undefined;
  const declaredAmended = summary && typeof summary === "object" ? Number(summary.amended) || 0 : 0;
  const declaredRepealed = summary && typeof summary === "object" ? Number(summary.repealed) || 0 : 0;

  if (anchorAmendedCount > 0 || declaredAmended > 0) {
    if (anchorAmendedCount !== declaredAmended) {
      findings.push({
        gate: "ح-16",
        file: relPath,
        detail: `(أ) وسوم status:amended=${anchorAmendedCount} ≠ article_status_summary.amended=${declaredAmended}`,
      });
    }
  }
  const expectedFolds = declaredAmended + declaredRepealed;
  if (historyBlockCount > 0 || expectedFolds > 0) {
    if (historyBlockCount !== expectedFolds) {
      findings.push({
        gate: "ح-16",
        file: relPath,
        detail: `(ب) كتل 📜=${historyBlockCount} ≠ amended+repealed المُعلَنَين=${expectedFolds} (amended=${declaredAmended}، repealed=${declaredRepealed})`,
      });
    }
  }

  // ── ح-17: اعتراف صريح بنقص مصدر (نطاق مضيَّق، راجع الحاشية أعلى الحلقة) ──
  const unknownMatch = body.match(UNKNOWN_SOURCE_RE);
  if (unknownMatch) {
    findings.push({
      gate: "ح-17",
      file: relPath,
      detail: `اعتراف بنقص مصدر — سياق: "${unknownMatch[0]}"`,
    });
  }

  // ── ح-18: مراسي ملتحمة/غير مغلقة ─────────────────────────────────
  const openCount = (body.match(/<!--/g) || []).length;
  const closeCount = (body.match(/-->/g) || []).length;
  if (openCount !== closeCount) {
    findings.push({
      gate: "ح-18",
      file: relPath,
      detail: `عدم توازن تعليقات HTML: <!--×${openCount} مقابل -->×${closeCount} (فرق ${Math.abs(openCount - closeCount)}) — تعليق غير مغلق يبتلع ما بعده على الأرجح`,
    });
  }
}

// ── التقرير ────────────────────────────────────────────────────────────
const byGate: Record<string, Finding[]> = {};
for (const f of findings) (byGate[f.gate] = byGate[f.gate] || []).push(f);

if (jsonMode) {
  console.log(JSON.stringify({ scanned, totalFindings: findings.length, findings }, null, 2));
} else {
  console.log("═".repeat(70));
  console.log("بوابة ك-10 — كواشف ح-16/17/18 المُتحقَّقة (تقرير-فقط)");
  console.log("═".repeat(70));
  console.log(`ملفات مفحوصة (بفرونت-ماتر صالح، كامل 01_المكتبة_القانونية): ${scanned}\n`);

  for (const gate of ["ح-16", "ح-17", "ح-18"] as const) {
    const list = byGate[gate] || [];
    console.log(`── ${gate} (${list.length} نتيجة، عبر ${new Set(list.map((f) => f.file)).size} ملفاً فريداً) ──`);
    const capped = list.slice(0, 15);
    for (const f of capped) {
      console.log(`   ${f.file}`);
      console.log(`   ↳ ${f.detail}`);
    }
    if (list.length > capped.length) {
      console.log(`   … و${list.length - capped.length} نتيجة أخرى — راجع --json للقائمة الكاملة`);
    }
    console.log();
  }

  console.log("═".repeat(70));
  console.log("⚠️  هذا قياس، لا حكم نهائي بذاته — راجع كل حالة يدوياً قبل أي إصلاح.");
  console.log("    ح-17 'اعتراف بنقص مصدر' ثقة أدنى عمداً (تفادي إنذار كاذب على نص تشريعي حقيقي).");
  console.log("═".repeat(70));
}

process.exitCode = findings.length > 0 ? 1 : 0;
