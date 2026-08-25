#!/usr/bin/env node
/**
 * seed-blog.mjs — seed the `articles` table (Blog CMS) from ./blog_final (next to this script).
 * ─────────────────────────────────────────────────────────────────────────────
 * 30 category folders (sec_00_* … sec_29_*). Each *.md is one article: YAML
 * frontmatter (up to 31 fields, incl. lists + aeo_pairs Q/A objects) + markdown
 * body. Reads them all and UPSERTs into public.articles (conflict on slug → update),
 * so it is safe to re-run. Handles the mixed-schema corpus (12-field legacy rows
 * upgrade to 31-field over time); missing fields → null.
 *
 * Cover images: articles.cover is set to the public Supabase Storage URL of the
 * matching WebP in the `blog-covers` bucket (deterministic from slug). Run
 * `npm run blog:images` first so the files exist, but the URL is correct either way.
 *
 * USAGE  (from project root)
 *   npm run blog:seed -- --dry                       # parse + report, no DB writes
 *   npm run blog:seed                                # live upsert into Supabase
 *   npm run blog:seed -- --sections sec_04_civil     # only listed section folders
 *   node blog-toolkit/seed-blog.mjs --dry            # direct
 *
 * ENV (process.env, else auto-loaded from .env.local / .env / .env.vps)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY            # service-role — bypasses RLS
 *
 * Requires the articles table (migration 20260706_content_and_ops.sql) plus the
 * 20260716_blog_seo_aeo_geo.sql columns.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // project root — for .env loading
const BLOG_DIR = path.join(__dirname, "blog_final"); // owner drops content here
const DRY = process.argv.includes("--dry");
const BATCH = 100;
const BUCKET = "blog-covers";

// Accept both `--sections=a,b` and `--sections a,b` (the guide documents the
// space form; the equals-only parser used to swallow it and seed everything).
function argList(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  const raw = eq
    ? eq.slice(name.length + 3)
    : (() => {
        const i = process.argv.indexOf(`--${name}`);
        const next = i === -1 ? null : process.argv[i + 1];
        return next && !next.startsWith("--") ? next : null;
      })();
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

const SECTIONS = argList("sections");

// ── Category code → Arabic label (folder name is the source of truth) ──────────
// The 30 sections of the V8.2 golden spec, mapped 1:1 onto the legal library's
// subject folders (00–29). Labels are the official display names from
// `08_دليل_المطور_لهيكلة_وعرض_المقالات_برمجيا_V8.md` — keep them in sync with
// the `blog_sections` table.
const CATEGORY_AR = {
  sec_00_procedural: "أنظمة المرافعات والإجراءات القضائية والتنفيذ",
  sec_01_criminal: "الأنظمة الجزائية والجرائم الجنائية",
  sec_02_admin: "القضاء الإداري ومنازعات ديوان المظالم",
  sec_03_civil: "المعاملات المدنية والأحوال الشخصية والعقود",
  sec_04_commercial: "الأنظمة التجارية والشركات والإفلاس",
  sec_05_ip: "الملكية الفكرية وبراءات الاختراع والعلامات التجارية",
  sec_06_labor: "أنظمة العمل والعمال والخدمة المدنية",
  sec_07_real_estate_construction: "الأنظمة العقارية والبناء والمقاولات",
  sec_08_financial: "الأنظمة المالية والمصرفية والتمويل",
  sec_09_tax: "الأنظمة الضريبية والزكوية والجمركية",
  sec_10_health: "الأنظمة الصحية والدوائية ومزاولة المهن",
  sec_11_environment: "الأنظمة البيئية والأرصاد وحماية البيئة",
  sec_12_tech: "أنظمة التقنية والاتصالات والأمن السيبراني والذكاء الاصطناعي",
  sec_13_logistics: "الأنظمة اللوجستية والنقل والموانئ والطيران",
  sec_14_energy: "أنظمة الطاقة والتعدين والكهرباء والغاز",
  sec_15_media: "أنظمة الإعلام والنشر والمحتوى الإلكتروني",
  sec_16_industry: "الأنظمة الصناعية والمصانع ومناطق مدن",
  sec_17_constitutional: "الأنظمة الدستورية والإدارية والسيادية",
  sec_18_agriculture_food: "الأنظمة الغذائية والزراعية والمياه والثروة الحيوانية",
  sec_19_investment: "أنظمة الاستثمار الأجنبي والخصخصة والتنافسية",
  sec_20_education: "أنظمة التعليم والجامعات والتدريب",
  sec_21_sports: "أنظمة الرياضة والترفيه والفعاليات",
  sec_22_hajj: "أنظمة الحج والعمرة والخدمات الدينية",
  sec_23_defense: "الأنظمة العسكرية والأمنية والدفاع الوطني",
  sec_24_social: "أنظمة الرعاية الاجتماعية والأسرة والأوقاف",
  sec_25_tourism: "أنظمة السياحة والآثار والفنادق والضيافة",
  sec_26_municipal: "الأنظمة البلدية والتخطيط العمراني وتراخيص البناء",
  sec_27_culture: "الأنظمة الثقافية والتراث الوطني والفنون",
  sec_28_arbitration: "أنظمة التحكيم والوساطة وفض المنازعات البديلة",
  sec_29_international: "الأنظمة والمعاهدات والتحكيم والقضايا الدولية",
};

// Forbidden character classes (ENCODING_SAFETY.md) — hard reject.
const FORBIDDEN_RE = /[֐-׿一-鿿぀-ヿ가-힣�]/;

function loadEnv() {
  for (const f of [".env.local", ".env", ".env.vps"]) {
    try {
      const txt = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!(m[1] in process.env)) process.env[m[1]] = v;
      }
    } catch {
      /* file not present */
    }
  }
}

function storagePublicUrl(slug) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/images/${slug}.webp`;
}

// ── YAML-subset frontmatter parser ────────────────────────────────────────────
// Handles: top-level scalars (quoted or bare), list-of-scalars, and list-of-objects
// (aeo_pairs: [{question, answer}, ...]). Indented list items use "- " markers.
function parseFrontmatter(md) {
  if (!md.startsWith("---")) return { fm: {}, body: md.trim() };
  const lines = md.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") { end = i; break; }
  if (end === -1) return { fm: {}, body: md.trim() };
  const fmLines = lines.slice(1, end);
  const fm = parseYamlBlock(fmLines, 0);
  const body = lines.slice(end + 1).join("\n").trim();
  return { fm, body };
}

// Parse a YAML block at a given minimum indent. Returns an object or array.
function parseYamlBlock(lines, baseIndent) {
  const obj = {};
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === "") { i++; continue; }
    const indent = raw.length - raw.trimStart().length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) { i++; continue; } // skip stray deeper line (shouldn't happen at top)

    const trimmed = raw.trim();
    if (trimmed.startsWith("- ")) {
      // list block — collect all consecutive items at this indent
      const list = [];
      while (i < lines.length) {
        const r = lines[i];
        if (r.trim() === "") { i++; continue; }
        const ind = r.length - r.trimStart().length;
        if (ind < indent) break;
        if (ind === indent && r.trimStart().startsWith("- ")) {
          const after = r.trimStart().slice(2);
          const kv = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s?(.*)$/.exec(after);
          if (kv) {
            // list-of-objects item: gather deeper k:v lines into this object
            const item = {};
            item[kv[1]] = stripVal(kv[2]);
            let j = i + 1;
            while (j < lines.length) {
              const r2 = lines[j];
              if (r2.trim() === "") { j++; continue; }
              const ind2 = r2.length - r2.trimStart().length;
              if (ind2 <= indent) break;
              const m2 = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s?(.*)$/.exec(r2.trim());
              if (m2) item[m2[1]] = stripVal(m2[2]);
              j++;
            }
            list.push(item);
            i = j;
          } else {
            list.push(stripVal(after));
            i++;
          }
        } else if (ind === indent) {
          break; // a non-"-" key at same indent — end of list
        } else {
          i++;
        }
      }
      return list;
    }

    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s?(.*)$/.exec(trimmed);
    if (!m) { i++; continue; }
    const key = m[1];
    const rest = m[2];
    if (rest !== "") {
      obj[key] = stripVal(rest);
      i++;
    } else {
      // nested block — find its indent
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length) {
        const childIndent = lines[j].length - lines[j].trimStart().length;
        if (childIndent > indent) {
          const childLines = [];
          let k = j;
          while (k < lines.length) {
            const rk = lines[k];
            if (rk.trim() === "") { childLines.push(rk); k++; continue; }
            const ik = rk.length - rk.trimStart().length;
            if (ik < childIndent) break;
            childLines.push(rk);
            k++;
          }
          obj[key] = parseYamlBlock(childLines, childIndent);
          i = k;
        } else { obj[key] = null; i++; }
      } else { obj[key] = null; i++; }
    }
  }
  return obj;
}

function stripVal(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

// ── Walk for *.md files (optionally filtered to sections) ──────────────────────
function findMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SECTIONS.length && !SECTIONS.includes(entry.name)) continue;
      out.push(...findMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function wordCount(s) {
  return (s.trim().match(/\S+/g) || []).length;
}

function toRow(file, rejects) {
  const buf = fs.readFileSync(file);
  // BOM check
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let raw = buf.toString("utf8");
  if (hasBom) { raw = raw.replace(/^﻿/, ""); rejects.push({ file, level: "warn", reason: "BOM stripped" }); }

  const { fm, body } = parseFrontmatter(raw);
  const folder = path.basename(path.dirname(file));
  const category = CATEGORY_AR[folder] || fm.category || folder;
  const slug = (fm.slug || "").trim();
  const title = (fm.title || "").trim();

  if (!slug || !title || !body) {
    return { ok: false, file, reason: !slug ? "no slug" : !title ? "no title" : "empty body" };
  }

  // Hard reject: forbidden (Hebrew/CJK/mojibake) chars anywhere in title or body.
  if (FORBIDDEN_RE.test(title) || FORBIDDEN_RE.test(body)) {
    rejects.push({ file, level: "reject", reason: "forbidden character (Hebrew/CJK/FFFD)" });
    return { ok: false, file, reason: "forbidden character" };
  }

  // Soft warnings (logged, not rejected).
  const wc = wordCount(body);
  if (wc < 800) rejects.push({ file, level: "warn", reason: `body ${wc} words (<800)` });
  if (!body.includes("أسئلة شائعة")) rejects.push({ file, level: "warn", reason: "missing أسئلة شائعة heading" });
  if (!body.includes("السند القانوني")) rejects.push({ file, level: "warn", reason: "missing السند القانوني heading" });

  const asArr = (v) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : null);
  const aeo = Array.isArray(fm.aeo_pairs) ? fm.aeo_pairs.map((p) => ({ question: p?.question || "", answer: p?.answer || "" })) : null;

  return {
    ok: true,
    row: {
      slug,
      title,
      excerpt: fm.description || null,
      body,
      category,
      category_code: folder,
      author_name: fm.author || null,
      author_credentials: fm.author_credentials || null,
      author_url: fm.author_url || null,
      reviewer: fm.reviewer || null,
      cover: storagePublicUrl(slug),
      read_time: fm.reading_time || null,
      status: (fm.status || "published").trim(),
      featured: false,
      published_at: fm.date_published || null,
      // new SEO/AEO/GEO/authority columns:
      schema_type: fm.schema_type || null,
      date_modified: fm.date_modified || null,
      primary_keyword: fm.primary_keyword || null,
      secondary_keywords: asArr(fm.secondary_keywords),
      long_tail_keywords: asArr(fm.long_tail_keywords),
      seo_keywords: fm.seo_keywords || null,
      aeo_pairs: aeo,
      geo_coverage: fm.geo_coverage || null,
      geo_tier1: fm.geo_tier1 || null,
      geo_tier2: fm.geo_tier2 || null,
      related_laws: fm.related_laws || null,
      original_sources: fm.original_sources || null,
      pillar_page: fm.pillar_page || null,
      related_articles: asArr(fm.related_articles),
      target_persona: fm.target_persona || null,
      writing_track: fm.writing_track || null,
      content_scope: fm.content_scope || null,
      brand: fm.brand || null,
      canonical_url: fm.canonical_url || null,
      updated_at: fm.date_modified ? new Date(fm.date_modified + "T00:00:00Z").toISOString() : new Date().toISOString(),
    },
  };
}

async function main() {
  if (!fs.existsSync(BLOG_DIR)) {
    console.error(`✗ blog dir not found at ${BLOG_DIR}`);
    process.exit(1);
  }

  const files = findMarkdown(BLOG_DIR);
  const rows = [];
  const skipped = [];
  const rejects = [];
  const bySlug = new Map();
  const perCat = {};

  for (const file of files) {
    const res = toRow(file, rejects);
    if (!res.ok) { skipped.push({ file, reason: res.reason }); continue; }
    const { row } = res;
    if (bySlug.has(row.slug)) { skipped.push({ file, reason: `dup slug '${row.slug}' (first wins)` }); continue; }
    bySlug.set(row.slug, true);
    rows.push(row);
    perCat[row.category] = (perCat[row.category] || 0) + 1;
  }

  console.log(`\nScanned ${files.length} .md files → ${rows.length} valid articles, ${skipped.length} skipped.`);
  console.log("\nPer category:");
  for (const [cat, n] of Object.entries(perCat).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${cat}`);
  if (skipped.length) {
    console.log(`\nSkipped (${skipped.length}):`);
    for (const s of skipped.slice(0, 30)) console.log(`  - ${s.reason}: ${path.relative(ROOT, s.file)}`);
    if (skipped.length > 30) console.log(`  … and ${skipped.length - 30} more`);
  }
  const hardRejects = rejects.filter((r) => r.level === "reject");
  const warns = rejects.filter((r) => r.level === "warn");
  if (warns.length || hardRejects.length) {
    const logPath = path.join(__dirname, "_blog-seed-rejects.log");
    fs.writeFileSync(logPath, rejects.map((r) => `[${r.level}] ${r.reason}: ${path.relative(ROOT, r.file)}`).join("\n") + "\n");
    console.log(`\nValidation: ${hardRejects.length} hard reject(s), ${warns.length} warning(s) → logged to ${path.relative(ROOT, logPath)}`);
  }
  console.log("\nSample row:", {
    slug: rows[0]?.slug,
    title: rows[0]?.title,
    category: rows[0]?.category,
    category_code: rows[0]?.category_code,
    author_name: rows[0]?.author_name,
    author_url: rows[0]?.author_url,
    cover: rows[0]?.cover,
    aeo_pairs: rows[0]?.aeo_pairs?.length ? `${rows[0].aeo_pairs.length} pairs` : null,
    published_at: rows[0]?.published_at,
    date_modified: rows[0]?.date_modified,
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
      console.error(`  ✗ batch ${Math.floor(i / BATCH) + 1} failed: ${error.message}`);
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