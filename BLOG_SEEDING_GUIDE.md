# Blog Seeding Guide — `blog_final/` → `articles`
### دليل زرع المدونة — من مجلد `blog_final` إلى قاعدة البيانات

**Date:** 2026-07-07 · **Script:** [`scripts/seed-blog.mjs`](scripts/seed-blog.mjs) · **Command:** `npm run seed:blog`
**Verified:** dry-run parses **608/608** files, 0 skipped.

---

## EN — What it does

`blog_final/` holds **31 category folders** (`sec_00_procedural` … `sec_30_culture`) with **608 markdown articles**. Each `.md` file is one article: YAML frontmatter + markdown body. The seeder reads every file and **upserts** it into the `public.articles` table (Blog CMS). It is **idempotent** — safe to run as many times as you like; re-running only updates changed rows (matched on `slug`).

The public blog (`/blog`, `/blog/[slug]`) and the admin CMS (`/dashboard/admin/content/articles`) read from that table, so once seeded the content is live.

### Field mapping (frontmatter → `articles` column)
| Frontmatter | Column | Notes |
|---|---|---|
| `slug` | `slug` | unique key (upsert conflict target) |
| `title` | `title` | |
| `description` | `excerpt` | |
| *(folder name)* | `category` | mapped to an Arabic label, e.g. `sec_07_labor` → **قانون العمل** |
| `author` | `author_name` | |
| `date_published` | `published_at` | |
| `featured_image` | `cover` | e.g. `/blog/images/name.webp` |
| `reading_time` | `read_time` | |
| `status` | `status` | defaults to `published` |
| *(body after frontmatter)* | `body` | markdown |

All 608 come in as **`status: published`**, so they appear on `/blog` immediately.

---

## AR — نظرة عامة

مجلد `blog_final` يحوي **31 مجلد تصنيف** (`sec_00` … `sec_30`) بإجمالي **608 مقالة** بصيغة Markdown. كل ملف = مقالة (ترويسة YAML + متن). السكربت يقرأ كل الملفات و**يُدرجها/يحدّثها (upsert)** في جدول `public.articles`. **آمن للتكرار** — إعادة التشغيل تحدّث فقط ما تغيّر (المطابقة على `slug`). بعد الزرع، تظهر المقالات مباشرة في `/blog` وفي لوحة إدارة المقالات.

---

## Prerequisites / المتطلبات

1. **The `articles` table must exist** — apply migration `supabase/migrations/20260706_content_and_ops.sql` to the target database first. If it's missing, the seeder reports every batch as failed.
2. **Supabase credentials** — the service-role key (bypasses RLS). Read from `process.env`, else auto-loaded from `.env.local` / `.env` / `.env.vps`:
   - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`
3. **`blog_final/` present locally** — it is **gitignored** (13 MB) and not shipped to GitHub, so it lives only where you cloned/placed it. Run the seeder from that machine.

---

## How to run / طريقة التشغيل

### 1) Dry run — parse only, no DB writes (اختبار بلا كتابة)
```bash
npm run seed:blog -- --dry
```
Prints total files, valid vs skipped, per-category counts, and a sample row. Use this first to confirm parsing.

### 2) Live upsert into production (الزرع الفعلي في الإنتاج)
Run from the machine that has `blog_final/`. **Passing the env explicitly guarantees you hit the right DB** (explicit env always wins over any `.env` file):
```bash
cd nzamy-website
SUPABASE_URL=https://gdqfqfcxnwrwgaphtfhu.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> \
npm run seed:blog
```
If your `.env.vps` / `.env.local` already holds the **production** service-role key, plain `npm run seed:blog` also works (it auto-loads them) — but the explicit form above removes any doubt about which database you're writing to.

Output ends with `Done. Upserted N, failed M.` — `failed 0` means success.

> ⚠️ **Which database?** `.env.local` is often a *dev* project. If you run plain `npm run seed:blog` and `.env.local` points at dev, you'll seed dev. Use the explicit `SUPABASE_URL=…` form to target production.

---

## Categories are dynamic / التصنيفات ديناميكية

The blog's category pills are built from the **real data** (`GET /api/v1/blog/categories` → distinct categories + counts), not a hardcoded list. After seeding you'll see ~29 populated categories as filterable pills with counts (e.g. **قانون العمل** 51, **القانون التجاري** 87, **القانون الجنائي** 65). Selecting one filters **server-side across the whole corpus** (paginated, 24 per page + "load more"). `sec_28_industry` and `sec_30_culture` folders are currently empty, so they won't appear until they have articles.

The folder → Arabic-label map lives in `scripts/seed-blog.mjs` (`CATEGORY_AR`); edit it there if you want to rename a category label.

---

## Cover images / صور الغلاف

Frontmatter covers point at `/blog/images/*.webp`. Those image files are **not** in the repo, so until you add them the cards show the gradient placeholder. Two ways to get real covers:
1. Drop the image files into `nzamy-website/public/blog/images/` (matching the `featured_image` paths), **or**
2. Set/replace any article's cover URL from the **admin CMS** (`/dashboard/admin/content/articles` → edit → **رابط صورة الغلاف**, with live preview). Cover, category, slug, excerpt, and the markdown body are all editable there.

---

## Adding or editing articles later / إضافة أو تعديل لاحقاً

- **Bulk / from files:** drop a new `.md` into the right `blog_final/<category>/` folder (same frontmatter shape) and re-run `npm run seed:blog` — idempotent, only the new/changed article is written.
- **One-off / from the panel:** create or edit in the admin CMS (`/dashboard/admin/content/articles`). New articles there get a generated slug and go live on publish.

Both write to the same `articles` table.

---

## Troubleshooting / حل المشكلات

| Symptom | Cause → Fix |
|---|---|
| `Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY` | Env not set/loaded → pass them explicitly (see live command) or add to `.env.local`. |
| Every batch fails with "relation \"articles\" does not exist" | Migration not applied → run `20260706_content_and_ops.sql` on the target DB. |
| Seeded but `/blog` still shows the 6 fallback articles | You seeded a *different* DB than the app reads, or the app's build predates the DB → confirm same `SUPABASE_URL`; the public list falls back to mock only when the table returns nothing. |
| A file is skipped | Missing `slug`/`title` or empty body → the `--dry` output lists which file and why. |
| Duplicate slug across files | First wins; the dup is listed in `--dry` output → give it a unique `slug` in its frontmatter. |

---

## At a glance / باختصار
```bash
# 1. ensure the articles table exists (apply 20260706_content_and_ops.sql)
# 2. preview
npm run seed:blog -- --dry
# 3. seed production
SUPABASE_URL=https://gdqfqfcxnwrwgaphtfhu.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<key> \
npm run seed:blog
# 4. open /blog — 608 articles, filterable by category, search + load-more
```
