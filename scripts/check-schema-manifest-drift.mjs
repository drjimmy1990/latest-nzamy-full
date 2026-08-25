#!/usr/bin/env node
/**
 * check-schema-manifest-drift.mjs
 * ──────────────────────────────────────────────────────────────────────
 * مرقاب انجراف هاشي (Hash Drift Monitor) — لتزامن schema_manifest.json الثلاثي.
 *
 * المشكلة التي يحلّها: schema_manifest.json له 3 نسخ يجب أن تبقى متطابقة
 * بايتياً (قاعدة دائمة أُقرَّت 2026-08-23): النسخة التشغيلية (يقرؤها الكود
 * الحي)، النسخة الحاكمة (المرجع بعقل القوانين)، ونسخة مهارة السيو. أي
 * تعديل يطال واحدة منها بلا تزامن الثلاث يخلق انجرافاً صامتاً — لا أداة
 * كانت تكتشفه آلياً قبل هذا السكربت (ك-05، بند #5، 2026-08-24).
 *
 * ما يفعله: يحسب SHA256 للنسخ الثلاث المعروفة، يقارنها، ويقرر PASS/FAIL.
 * لا يصلح الانجراف تلقائياً — فقط يكتشفه ويقرّر أي نسخة الأحدث (mtime)
 * لمساعدة المراجعة البشرية/الوكيل على تحديد اتجاه المزامنة الصحيح.
 *
 * الاستخدام:
 *   node scripts/check-schema-manifest-drift.mjs [--json]
 *
 * القيمة العملية: شغّله بعد أي تعديل على schema_manifest.json بأي نسخة،
 * أو دورياً كبوابة صحة سريعة قبل أي حملة استخراج/بذر كبرى.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VAULT_ROOT = path.resolve(
  "D:\\Data\\Data\\antigravity ai\\تجارب\\Raw_Vault"
);

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");

// ── النسخ الثلاث المعتمدة (قاعدة 2026-08-23) ──────────────────────────
const COPIES = [
  {
    label: "التشغيلية (يقرؤها الكود الحي)",
    path: path.join(REPO_ROOT, "scripts", "parsers", "schema_manifest.json"),
  },
  {
    label: "الحاكمة (عقل القوانين، المرجع)",
    path: path.join(
      VAULT_ROOT,
      "00_عقل_القوانين",
      "10_عقد_الاسكيما_والبذرة",
      "schema_manifest.json"
    ),
  },
  {
    label: "السيو (مهارة legal-library-seo)",
    path: path.join(
      VAULT_ROOT,
      ".agents",
      "skills",
      "legal-library-seo",
      "references",
      "schema_manifest.json"
    ),
  },
];

function sha256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── التنفيذ ────────────────────────────────────────────────────────────
const results = COPIES.map((copy) => {
  if (!fs.existsSync(copy.path)) {
    return { ...copy, exists: false, hash: null, mtime: null, size: null };
  }
  const stat = fs.statSync(copy.path);
  return {
    ...copy,
    exists: true,
    hash: sha256(copy.path),
    mtime: stat.mtime.toISOString(),
    size: stat.size,
  };
});

const missing = results.filter((r) => !r.exists);
const present = results.filter((r) => r.exists);
const distinctHashes = new Set(present.map((r) => r.hash));
const drifted = missing.length > 0 || distinctHashes.size > 1;

if (jsonMode) {
  console.log(JSON.stringify({ drifted, results }, null, 2));
} else {
  console.log("═".repeat(70));
  console.log("مرقاب انجراف هاشي — schema_manifest.json (ثلاث نسخ)");
  console.log("═".repeat(70));

  for (const r of results) {
    if (!r.exists) {
      console.log(`🔴 مفقودة  — ${r.label}\n   ${r.path}`);
      continue;
    }
    console.log(`   ${r.label}`);
    console.log(`   ↳ ${r.path}`);
    console.log(`   ↳ SHA256: ${r.hash}  (${r.size} bytes، آخر تعديل ${r.mtime})`);
  }

  console.log();
  if (!drifted) {
    console.log(`✅ متطابقة تماماً — هاش واحد عبر النسخ الثلاث: ${present[0].hash}`);
  } else {
    console.log("🔴 انجراف مكتشَف!");
    if (missing.length > 0) {
      console.log(`   نسخ مفقودة: ${missing.map((m) => m.label).join("، ")}`);
    }
    if (distinctHashes.size > 1) {
      console.log("   النسخ الموجودة ليست كلها بنفس الهاش:");
      const byHash = {};
      for (const r of present) {
        (byHash[r.hash] = byHash[r.hash] || []).push(r);
      }
      for (const [hash, group] of Object.entries(byHash)) {
        console.log(`   • ${hash} ← ${group.map((g) => g.label).join("، ")}`);
      }
      const newest = present.reduce((a, b) => (a.mtime > b.mtime ? a : b));
      console.log(`   الأحدث تعديلاً (مرشَّح كمصدر الحقيقة، يحتاج تأكيداً بشرياً): ${newest.label} (${newest.mtime})`);
    }
    console.log("\n   الإجراء المطلوب: زامن الثلاث يدوياً (نسخ الأحدث/الصحيح فوق الباقي)");
    console.log("   ثم أعد تشغيل هذا السكربت للتأكد من PASS قبل أي بذر/استخراج.");
  }
  console.log("═".repeat(70));
}

process.exitCode = drifted ? 1 : 0;
