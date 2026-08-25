#!/usr/bin/env -S npx tsx
/**
 * check-qadha-regulation-conventions.ts
 * ──────────────────────────────────────────────────────────────────────
 * ك-11 — تصنيف كامل لملفات عائلة جمعية-قضاء (المدمجة نظام+لائحة) حسب
 * القناعة التي تُمثَّل بها اللائحة التنفيذية (ب-52). تقرير-فقط — صفر تعديل.
 *
 * ب-52 وثَّق ثلاث قناعات (أ سليمة/ب بلوك-كوت بلا مرساة/ج مادة شقيقة تحت
 * فصل مخصَّص) عبر عيّنة قسم 09 فقط (4 ملفات)، ونصّ صراحة أن الإصلاح
 * البنيوي الفعلي يحتاج "جلسة مخصَّصة منفصلة" تبدأ بحصر شامل — هذا السكربت
 * هو ذلك الحصر، ينفِّذ اختبار القبول الذي اقترحه ب-52 نفسه (نُقل من
 * Python حرفياً) على كامل عائلة *جمعية قضاء* (21 ملفاً معروفاً بالاسم،
 * لا قسم 09 وحده).
 *
 * الاستخدام:
 *   npx tsx scripts/check-qadha-regulation-conventions.ts [--json]
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const ROOT = "D:\\Data\\Data\\antigravity ai\\تجارب\\Raw_Vault\\01_المكتبة_القانونية";

const SKIP_PATH_PATTERNS = [/غير مصنف/, /deleted_backups_archive/i, /_أرشيف_خارج_البذر/, /\.backup/i, /\.pre_/];
function shouldSkip(p: string): boolean {
  return SKIP_PATH_PATTERNS.some((re) => re.test(p));
}
function findQadhaFiles(root: string): string[] {
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
      else if (entry.name.endsWith(".md") && /جمعية.?قضاء/.test(entry.name)) out.push(full);
    }
  }
  walk(root);
  return out;
}

type Conviction = "أ-سليم" | "ب-بلوك كوت بلا مرساة" | "ج-مادة شقيقة تحت فصل" | "هجين ب+ج" | "لا لائحة مكتشَفة";

interface Classification {
  file: string;
  conviction: Conviction;
  regAnchors: number;
  blockquoteLawInserts: number;
  siblingArticlesWithInstrument: number;
}

function classify(body: string): { conviction: Conviction; regAnchors: number; blockquoteLawInserts: number; siblingArticlesWithInstrument: number } {
  const regAnchors = (body.match(/<!--\s*REGULATION\b(?!_)/g) || []).length;

  // مُصحَّح بعد اختبار حقيقي: عقد المراسي §3 يُلزم بأن يتبع كل مرساة
  // REGULATION سليمة سطر تعليق `> **[اسم اللائحة]:**` مباشرة (نموذج مُتحقَّق:
  // "نظام المحاكم التجارية" — 301 مرساة REGULATION، كل واحدة تتبعها هذه
  // الكتلة حرفياً). الصيغة الأولى للكاشف عدَّت هذا السطر الشرعي كدليل على
  // النمط (ب) الخاطئ لمجرد ظهوره بالملف، بصرف النظر عن قربه من مرساة —
  // أنتج "هجين" زائفاً لملفات سليمة 100% (تطابق 1:1 REGULATION=بلوك-كوت
  // بعدة ملفات كان الدليل الحاسم). المُصحَّح: سطر الاقتباس لا يُحسَب إلا
  // إن لم تسبقه مرساة REGULATION خلال 5 أسطر (تباعد النموذج المُتحقَّق سطر
  // فارغ واحد فقط، فـ5 هامش أمان كافٍ).
  // ثانية تصحيح: نفس العيّنة (نظام المرافعات الشرعية) كشفت مصدر إنذار
  // كاذب آخر — الكابشن يظهر أيضاً داخل مطويات `📜 الإصدارات السابقة`
  // (نص تاريخي محفوظ بعد إلغاء المادة، اصطلاح صحيح ومُتَّبع بكل المكتبة)،
  // لا كنص لائحة حيّ غير مُرسًى. تحقَّق مباشرة أن نمط (ب) الحقيقي (ملف
  // ضريبة القيمة المضافة) اقتباس مسطَّح عادي **خارج** أي `<details>` —
  // فحذف كتل `<details>...</details>` كاملة قبل الفحص يُبقي (ب) الحقيقي
  // ويُسقط الإيجابيات الكاذبة التاريخية معاً.
  const bodyOutsideDetails = body.replace(/<details>[\s\S]*?<\/details>/g, "");
  const lines = bodyOutsideDetails.split("\n");
  let blockquoteLawInserts = 0;
  const captionRe = /^>\s*\*\*(اللائحة التنفيذية|الاتفاقية|نظام)[^\n]*:\*\*\s*$/;
  const regLineRe = /<!--\s*REGULATION\b(?!_)/;
  for (let i = 0; i < lines.length; i++) {
    if (!captionRe.test(lines[i])) continue;
    // نافذة 15 سطراً لا 5 — عيّنة إضافية (نظام المرافعات الشرعية) أظهرت
    // فجوة 5 أسطر فارغة بين المرساة وكابشنها بأقسام معيَّنة من نفس الملف
    // (تباين تباعد حقيقي بالمصدر، لا خطأ). الهامش الأوسع يتحمّل هذا بلا
    // المجازفة بربط كابشن بمرساة بعيدة تماماً من فقرة/مادة مختلفة.
    const windowStart = Math.max(0, i - 15);
    const precededByAnchor = lines.slice(windowStart, i).some((l) => regLineRe.test(l));
    if (!precededByAnchor) blockquoteLawInserts++;
  }

  let siblingArticlesWithInstrument = 0;
  const artRe = /<!--\s*ARTICLE_START\s+(\{.*?\})\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = artRe.exec(body)) !== null) {
    try {
      const d = JSON.parse(m[1]);
      const instr = d.instrument || "";
      if (instr && instr !== "نظام") siblingArticlesWithInstrument++;
    } catch {
      // malformed anchor JSON — not this detector's concern, skip
    }
  }

  let conviction: Conviction;
  if (regAnchors > 0) {
    conviction = blockquoteLawInserts === 0 && siblingArticlesWithInstrument === 0 ? "أ-سليم" : "هجين ب+ج";
  } else if (blockquoteLawInserts > 0 && siblingArticlesWithInstrument === 0) {
    conviction = "ب-بلوك كوت بلا مرساة";
  } else if (siblingArticlesWithInstrument > 0 && blockquoteLawInserts === 0) {
    conviction = "ج-مادة شقيقة تحت فصل";
  } else if (blockquoteLawInserts > 0 && siblingArticlesWithInstrument > 0) {
    conviction = "هجين ب+ج";
  } else {
    conviction = "لا لائحة مكتشَفة";
  }
  return { conviction, regAnchors, blockquoteLawInserts, siblingArticlesWithInstrument };
}

const files = findQadhaFiles(ROOT);
const results: Classification[] = [];

for (const filePath of files) {
  const relPath = path.relative(ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  const bodyMatch = raw.match(/^---[\s\S]*?---\r?\n([\s\S]*)$/);
  const body = bodyMatch ? bodyMatch[1] : raw;
  const c = classify(body);
  results.push({ file: relPath, ...c });
}

const byConviction: Record<string, Classification[]> = {};
for (const r of results) (byConviction[r.conviction] = byConviction[r.conviction] || []).push(r);

if (jsonMode) {
  console.log(JSON.stringify({ totalFiles: results.length, results }, null, 2));
} else {
  console.log("═".repeat(70));
  console.log("ك-11 — تصنيف عائلة جمعية-قضاء حسب قناعة تمثيل اللائحة (ب-52)");
  console.log("═".repeat(70));
  console.log(`إجمالي الملفات المفحوصة (بالاسم): ${results.length}\n`);
  for (const [conviction, list] of Object.entries(byConviction)) {
    console.log(`── ${conviction} (${list.length}) ──`);
    for (const r of list) {
      console.log(`   ${r.file}`);
      console.log(`   ↳ REGULATION=${r.regAnchors} · بلوك-كوت=${r.blockquoteLawInserts} · مادة شقيقة=${r.siblingArticlesWithInstrument}`);
    }
    console.log();
  }
  console.log("═".repeat(70));
}
