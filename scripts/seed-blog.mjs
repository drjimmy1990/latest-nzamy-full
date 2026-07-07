#!/usr/bin/env node
/**
 * seed-blog.mjs — seed the `articles` table (Blog CMS) from blog_final/.
 * ─────────────────────────────────────────────────────────────────────────────
 * blog_final/ holds 31 category folders (sec_00_*, sec_01_*, …). Each folder is
 * one legal category; each *.md file is one article with YAML frontmatter
 * (slug/title/description/author/date_published/featured_image/reading_time/status)
 * followed by the markdown body. This reads them all and UPSERTs into the
 * `public.articles` table (conflict on `slug` → update), so it is safe to re-run.
 *
 * USAGE
 *   node scripts/seed-blog.mjs --dry     # parse + report only, no DB writes
 *   node scripts/seed-blog.mjs           # live upsert into Supabase
 *
 * ENV (read from process.env, else auto-loaded from .env.local / .env / .env.vps)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY            # service-role — bypasses RLS
 *
 * Requires the `articles` table to exist first (migration
 * supabase/migrations/20260706_content_and_ops.sql).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BLOG_DIR = path.join(ROOT, "blog_final");
const DRY = process.argv.includes("--dry");
const BATCH = 100;

// ── Category code → Arabic label (folder name is the source of truth) ──────────
const CATEGORY_AR = {
  sec_00_procedural: "الإجراءات والمرافعات",
  sec_01_criminal: "القانون الجنائي",
  sec_02_admin: "القضاء الإداري",
  sec_03_execution: "التنفيذ",
  sec_04_civil: "القانون المدني",
  sec_05_commercial: "القانون التجاري",
  sec_06_ip: "الملكية الفكرية",
  sec_07_labor: "قانون العمل",
  sec_08_real_estate: "العقار والإيجار",
  sec_09_financial: "القانون المالي والمصرفي",
  sec_10_tax: "الضرائب والزكاة",
  sec_11_health: "القانون الصحي",
  sec_12_environment: "البيئة",
  sec_13_tech: "التقنية والبيانات",
  sec_14_transport: "النقل",
  sec_15_energy: "الطاقة",
  sec_16_media: "الإعلام",
  sec_17_construction: "المقاولات والتشييد",
  sec_18_investment: "الاستثمار",
  sec_19_education: "التعليم",
  sec_20_sports: "الرياضة",
  sec_21_hajj: "الحج والعمرة",
  sec_22_defense: "الدفاع والأمن",
  sec_23_social: "الأحوال الاجتماعية",
  sec_24_tourism: "السياحة",
  sec_25_municipal: "الشؤون البلدية",
  sec_26_arbitration: "التحكيم",
  sec_27_international: "القانون الدولي",
  sec_28_industry: "الصناعة",
  sec_29_constitutional: "القانون الدستوري",
  sec_30_culture: "الثقافة",
};

// ── Minimal .env loader (only fills vars not already set) ──────────────────────
function loadEnv() {
  for (const f of [".env.local", ".env", ".env.vps"]) {
    try {
      const txt = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!(m[1] in process.env)) process.env[m[1]] = v;
      }
    } catch {
      /* file not present — fine */
    }
  }
}

// ── Frontmatter parser (top-level scalar keys only; body = after 2nd '---') ────
function parseFrontmatter(md) {
  if (!md.startsWith("---")) return { fm: {}, body: md.trim() };
  const lines = md.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { fm: {}, body: md.trim() };
  const fm = {};
  for (const line of lines.slice(1, end)) {
    // Only column-0 "key: value" pairs — indented list/nested items are skipped.
    const m = /^([A-Za-z_][A-Za-z0-9_]*):\s?(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[m[1]] = val;
  }
  const body = lines.slice(end + 1).join("\n").trim();
  return { fm, body };
}

// ── Walk blog_final for *.md files ─────────────────────────────────────────────
function findMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function toRow(file) {
  const raw = fs.readFileSync(file, "utf8");
  const { fm, body } = parseFrontmatter(raw);
  const folder = path.basename(path.dirname(file)); // sec_00_procedural
  const category = CATEGORY_AR[folder] || fm.category || folder;
  const slug = (fm.slug || "").trim();
  const title = (fm.title || "").trim();
  if (!slug || !title || !body) {
    return { ok: false, file, reason: !slug ? "no slug" : !title ? "no title" : "empty body" };
  }
  return {
    ok: true,
    row: {
      slug,
      title,
      excerpt: fm.description || null,
      body,
      category,
      author_name: fm.author || null,
      cover: fm.featured_image || null,
      read_time: fm.reading_time || null,
      status: (fm.status || "published").trim(),
      published_at: fm.date_published || null,
      updated_at: new Date().toISOString(),
    },
  };
}

async function main() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.error(`✗ blog_final/ not found at ${BLOG_DIR}`);
    process.exit(1);
  }

  const files = findMarkdown(BLOG_DIR);
  const rows = [];
  const skipped = [];
  const bySlug = new Map();
  const perCat = {};

  for (const file of files) {
    const res = toRow(file);
    if (!res.ok) {
      skipped.push(res);
      continue;
    }
    const { row } = res;
    if (bySlug.has(row.slug)) {
      skipped.push({ file, reason: `dup slug '${row.slug}' (first wins)` });
      continue;
    }
    bySlug.set(row.slug, true);
    rows.push(row);
    perCat[row.category] = (perCat[row.category] || 0) + 1;
  }

  console.log(`\nScanned ${files.length} .md files → ${rows.length} valid articles, ${skipped.length} skipped.`);
  console.log("\nPer category:");
  for (const [cat, n] of Object.entries(perCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${cat}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped (${skipped.length}):`);
    for (const s of skipped.slice(0, 30)) console.log(`  - ${s.reason}: ${path.relative(ROOT, s.file)}`);
    if (skipped.length > 30) console.log(`  … and ${skipped.length - 30} more`);
  }
  console.log("\nSample row:", {
    slug: rows[0]?.slug,
    title: rows[0]?.title,
    category: rows[0]?.category,
    author_name: rows[0]?.author_name,
    published_at: rows[0]?.published_at,
    bodyChars: rows[0]?.body.length,
  });

  if (DRY) {
    console.log("\n--dry: no database writes. Remove --dry to upsert.");
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked env + .env.local/.env/.env.vps).");
    console.error("  Set them, or run with --dry to only parse.");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let done = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("articles").upsert(batch, { onConflict: "slug" });
    if (error) {
      failed += batch.length;
      console.error(`  ✗ batch ${i / BATCH + 1} failed: ${error.message}`);
    } else {
      done += batch.length;
      console.log(`  ✓ upserted ${done}/${rows.length}`);
    }
  }
  console.log(`\nDone. Upserted ${done}, failed ${failed}.`);
  if (failed) process.exit(1);
}

loadEnv();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
