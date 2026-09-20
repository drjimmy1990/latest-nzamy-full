#!/usr/bin/env node
/**
 * check-schema-manifest-drift.mjs
 * ──────────────────────────────────────────────────────────────────────
 * Fail-closed hash guard for the operational and governing schema manifests.
 *
 * Compare the manifest actually read by the parsers with the governing copy.
 * A developer ZIP has spec/10_... beside web/; a source checkout can pass
 * --vault-root or --canonical. The optional SEO copy is checked when supplied
 * or present, but its absence from a portable ZIP is not concealed as a
 * failure of the two-copy contract. This tool never chooses a winner by mtime,
 * never rewrites a manifest, and exits nonzero if required copies differ.
 *
 *   node scripts/check-schema-manifest-drift.mjs [--json]
 *   node scripts/check-schema-manifest-drift.mjs --vault-root <Raw_Vault>
 *   node scripts/check-schema-manifest-drift.mjs --canonical <manifest.json>
 *   node scripts/check-schema-manifest-drift.mjs --canonical <manifest.json> --seo-copy <manifest.json>
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
function optionValue(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a path`);
  }
  return path.resolve(value);
}

const vaultRoot = optionValue("--vault-root") ||
  (process.env.NZAMY_VAULT_ROOT ? path.resolve(process.env.NZAMY_VAULT_ROOT) : null);
const explicitCanonical = optionValue("--canonical");
if (explicitCanonical && vaultRoot) {
  throw new Error("Choose --canonical or --vault-root, not both");
}
const packagedCanonical = path.resolve(REPO_ROOT, "..", "spec", "10_عقد_الاسكيما_والبذرة", "schema_manifest.json");
const governingCanonical = explicitCanonical || (vaultRoot
  ? path.join(vaultRoot, "00_عقل_القوانين", "10_عقد_الاسكيما_والبذرة", "schema_manifest.json")
  : packagedCanonical);
const operationalPath = path.join(REPO_ROOT, "scripts", "parsers", "schema_manifest.json");
if (path.resolve(governingCanonical) === path.resolve(operationalPath) ||
    (fs.existsSync(governingCanonical) && fs.existsSync(operationalPath) &&
     fs.realpathSync(governingCanonical) === fs.realpathSync(operationalPath))) {
  throw new Error("The governing and operational paths must be different files; self-comparison cannot prove alignment");
}
const explicitSeo = optionValue("--seo-copy");
const vaultSeo = vaultRoot && path.join(vaultRoot, ".agents", "skills", "legal-library-seo", "references", "schema_manifest.json");
const seoPath = explicitSeo || (vaultSeo && fs.existsSync(vaultSeo) ? vaultSeo : null);

const COPIES = [
  {
    label: "التشغيلية (يقرؤها الكود الحي)",
    path: operationalPath,
  },
  {
    label: "الحاكمة (عقل القوانين، المرجع)",
    path: governingCanonical,
  },
];
if (seoPath) COPIES.push({ label: "السيو (إن أُرفقت)", path: seoPath });

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
  console.log("مرقاب انجراف هاشي — schema_manifest.json (التشغيلية والحاكمة)");
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
    console.log(`✅ متطابقة بايتياً — SHA256: ${present[0].hash}`);
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
    }
    console.log("\n   الإجراء المطلوب: صالِح العقد الحاكم والتشغيلي دلالياً قبل مزامنتهما؛ لا تنسخ حسب mtime.");
    console.log("   ثم أعد تشغيل هذا السكربت قبل أي بذر أو تسليم نهائي.");
  }
  console.log("═".repeat(70));
}

process.exitCode = drifted ? 1 : 0;
