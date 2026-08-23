#!/usr/bin/env node
/**
 * seed-blog-images.mjs — upload blog cover WebPs to the public `blog-covers`
 * Supabase Storage bucket, driven by the registry.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads ./blog_final/blog_images_registry.json (next to this script; shape:
 *   { articles: [{ slug, image_status: { local_path, is_rich, format } }] })
 * and uploads each `images_delivered/<slug>.webp` to `blog-covers/images/<slug>.webp`
 * with upsert:true (re-runnable). The article seeder sets articles.cover to the
 * matching public URL deterministically, so order doesn't matter — but run this
 * before `blog:seed` so covers aren't broken on first render.
 *
 * USAGE  (from project root)
 *   npm run blog:images -- --dry                    # list plan, no uploads
 *   npm run blog:images                             # live upload
 *   npm run blog:images -- --sections sec_04_civil  # filter by section folder
 *   node blog-toolkit/seed-blog-images.mjs --dry    # direct
 *
 * ENV (process.env, else auto-loaded from .env.local / .env / .env.vps)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // project root — for .env loading
const BLOG_DIR = path.join(__dirname, "blog_final"); // owner drops content here
const REGISTRY = path.join(BLOG_DIR, "blog_images_registry.json");
const BUCKET = "blog-covers";
const DRY = process.argv.includes("--dry");

// Accept both `--sections=a,b` and `--sections a,b` (the guide documents the
// space form; the equals-only parser used to swallow it and upload everything).
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

function publicUrl(slug) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${BUCKET}/images/${slug}.webp`;
}

async function main() {
  if (!fs.existsSync(REGISTRY)) {
    console.error(`✗ registry not found at ${REGISTRY}`);
    process.exit(1);
  }
  const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const articles = Array.isArray(reg.articles) ? reg.articles : [];
  let plan = articles.filter((a) => a && a.slug && a.image_status && a.image_status.is_rich && a.image_status.local_path);
  if (SECTIONS.length) {
    plan = plan.filter((a) => {
      const sec = String(a.article_file || "").split("/")[0];
      return SECTIONS.includes(sec);
    });
  }
  console.log(`\nRegistry: ${articles.length} entries → ${plan.length} rich images to upload${SECTIONS.length ? ` (sections: ${SECTIONS.join(", ")})` : ""}.`);

  const missing = plan.filter((a) => !fs.existsSync(path.join(BLOG_DIR, a.image_status.local_path)));
  if (missing.length) {
    console.log(`⚠ ${missing.length} registered image file(s) missing on disk (will skip):`);
    for (const m of missing.slice(0, 20)) console.log(`   - ${m.image_status.local_path}`);
    if (missing.length > 20) console.log(`   … and ${missing.length - 20} more`);
  }
  const uploadable = plan.filter((a) => fs.existsSync(path.join(BLOG_DIR, a.image_status.local_path)));

  console.log(`Sample: slug=${plan[0]?.slug} → ${BUCKET}/images/${plan[0]?.slug}.webp`);
  console.log(`Public URL pattern: ${publicUrl("<slug>")}`);

  if (DRY) {
    console.log(`\n--dry: no uploads. Remove --dry to upload ${uploadable.length} file(s).`);
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
  for (let i = 0; i < uploadable.length; i++) {
    const a = uploadable[i];
    const abs = path.join(BLOG_DIR, a.image_status.local_path);
    const storagePath = `images/${a.slug}.webp`;
    const buf = fs.readFileSync(abs);
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: "image/webp",
      upsert: true,
    });
    if (error) {
      failed++;
      console.error(`  ✗ ${a.slug}: ${error.message}`);
    } else {
      done++;
      if (done % 50 === 0 || done === uploadable.length) console.log(`  ✓ uploaded ${done}/${uploadable.length}`);
    }
  }
  console.log(`\nDone. Uploaded ${done}, failed ${failed}.`);
  if (failed) process.exit(1);
}

loadEnv();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});