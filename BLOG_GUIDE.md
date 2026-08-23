# NZAMY Blog Guide — Seeding with the `blog-toolkit/` folder
### دليل المدونة — الزرع باستخدام مجلد `blog-toolkit`

> **Supersedes** `old/BLOG_SEEDING_GUIDE.md` (the old scalar-only seeder on the old `blog_final/`).
> **Content:** 608+ articles · 31 sections · 31-field frontmatter · 614 WebP covers
> **SQL migration:** already applied in the Supabase SQL Editor (one-time — see Step 1 if you ever need to re-run it).

The blog seeding lives in a self-contained folder: **`blog-toolkit/`** (at the project root). The owner drops the blog content into it and runs one command. No paths are hardcoded — the scripts find the content relative to themselves.

---

## 0. Put the blog content into `blog-toolkit/`  (do this first)

Drop the **`blog_final/`** folder (the one with the 31 `sec_XX_*` section folders + `images_delivered/` + `blog_images_registry.json`) **inside `blog-toolkit/`**, so it looks like this:

```
nzamy-website/
└── blog-toolkit/
    ├── blog-clear.mjs              ← wipe script
    ├── seed-blog.mjs               ← article seeder
    ├── seed-blog-images.mjs        ← cover-image uploader
    └── blog_final/                 ← YOU PUT THIS HERE
        ├── sec_00_procedural/
        │   └── 001_… .md
        ├── … (31 section folders)
        ├── images_delivered/       ← 614 WebP covers (<slug>.webp)
        └── blog_images_registry.json
```

The scripts read `blog_final/` from **next to themselves** (`blog-toolkit/blog_final/`), so wherever the project lives on your machine, it just works — no absolute paths to edit. If the folder is missing you'll get `✗ blog dir not found` / `✗ registry not found`.

> ضع مجلد `blog_final` كاملاً (شامل `images_delivered` و `blog_images_registry.json`) داخل `blog-toolkit`. لا تعدّل أي مسار — السكربتات تجده تلقائياً.

The content is gitignored (`blog_final/` rule), so it stays local and is **not** committed — you (the owner) place/refresh it whenever the content updates.

---

## 1. SQL migration (already applied — skip unless re-running)

You already pasted `supabase/migrations/20260716_blog_seo_aeo_geo.sql` into the Supabase SQL Editor and ran it. It added the 23 blog columns, the `blog_sections` table, and the public `blog-covers` Storage bucket. **You only do this once.** If you ever need to verify it's there:

```sql
select count(*) from blog_sections;                       -- → 31
select id, public from storage.buckets where id='blog-covers';  -- → blog-covers | true
```

> ⚠️ If cover images ever return 403, add a public-read policy on the `blog-covers` bucket: Supabase Dashboard → **Storage** → **Policies** → `SELECT` allowed to `anon`. (A `public=true` bucket usually auto-grants this, but some projects need it set explicitly.)

---

## 2. Supabase credentials

The scripts need the **service-role key** (bypasses RLS). They auto-load from the project's `.env.local` / `.env` / `.env.vps`, or you can pass them inline. For **production**, pass them explicitly so there's no ambiguity about which database you're hitting:

- `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) — your project URL
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Project Settings → API → `service_role`

> 💡 Put them in `nzamy-website/.env.vps` once and plain `npm run blog:reseed` will auto-load them. Or pass inline (see below) to be explicit.

---

## 3. Commands — run from the project root (`nzamy-website/`)

All four commands accept `--dry` (preview, **no writes / no uploads**). Always dry-run first.

### Back up before wiping — `blog:backup`  (do this first)
Dumps every row of `articles` to JSON so a clear is reversible. `blog:clear` is destructive and there is no undo without this file.

```bash
npm run blog:backup              # → blog-toolkit/_articles-backup-<YYYYMMDD>.json
node blog-toolkit/blog-backup.mjs --out path/to/backup.json

# roll back
node blog-toolkit/blog-backup.mjs --restore blog-toolkit/_articles-backup-20260823.json --dry
node blog-toolkit/blog-backup.mjs --restore blog-toolkit/_articles-backup-20260823.json
```

The dumps are gitignored (`blog-toolkit/_articles-backup-*.json`) — they hold the full corpus and are far too large for git.

### Wipe the blog — `blog:clear`
Deletes every row in `articles` (hand-seeded + any prior bulk seed) so the new corpus starts clean.

```bash
npm run blog:clear -- --dry      # preview: "articles rows to delete: N"
npm run blog:clear               # live delete
npm run blog:clear -- --keep saudi-lease-contracts-rules-2026,company-incorporation-saudi-arabia-2026   # keep specific slugs
```

> `--keep` and `--sections` accept both `--flag a,b` and `--flag=a,b`. (Until 2026-08-23 only the `=` form parsed, so the documented space form was silently dropped — which turned `--keep` into "delete everything" and `--sections` into "seed everything". `blog:clear` now refuses to run if `--keep` is passed with no slugs.)

### Upload cover images — `blog:images`
Reads `blog_images_registry.json` and uploads each `images_delivered/<slug>.webp` to the `blog-covers` bucket (upsert — re-runnable).

```bash
npm run blog:images -- --dry     # preview: "Registry: 614 entries → 614 rich images to upload"
npm run blog:images              # live upload → "Done. Uploaded 614, failed 0."
```

### Seed articles — `blog:seed`
Parses every `.md` in `blog-toolkit/blog_final/`, maps all 31 frontmatter fields, sets `cover` to the Storage public URL, and upserts on `slug` (idempotent). Validation rejects forbidden characters (Hebrew/CJK/mojibake) and logs warnings (word count <800, missing headings) to `blog-toolkit/_blog-seed-rejects.log`.

```bash
npm run blog:seed -- --dry       # preview: per-category counts + any rejects, no writes
npm run blog:seed                # live upsert → "Done. Upserted 614, failed 0."
npm run blog:seed -- --sections sec_04_civil,sec_07_labor   # partial reseed (one section)
```

### One-shot full reseed — `blog:reseed`  (clear → images → seed)
**This is the command you'll use day-to-day.**

```bash
# preview everything
SUPABASE_URL=https://your-project.supabase.co SUPABASE_SERVICE_ROLE_KEY=your-key \
npm run blog:reseed -- --dry

# live reseed
SUPABASE_URL=https://your-project.supabase.co SUPABASE_SERVICE_ROLE_KEY=your-key \
npm run blog:reseed
# → "✔ deleted N rows" + "Done. Uploaded 614, failed 0." + "Done. Upserted 614, failed 0."
```

Or, if `.env.vps` already holds the prod key, just:
```bash
npm run blog:reseed
```

> ⚠️ `blog:clear` deletes **all** articles. Double-check you're pointed at the right DB before running live.

You can also run a script directly without npm:
```bash
node blog-toolkit/seed-blog.mjs --dry
```

---

## 4. After seeding — verify

```bash
# a cover image is publicly readable (replace <slug> with a real article slug)
curl -I "https://your-project.supabase.co/storage/v1/object/public/blog-covers/images/<slug>.webp"
# → HTTP/2 200   (403 → see Step 1 storage-policy note)

# build is green
npm run type-check   # 0 errors
npx next build       # ✓ Compiled successfully

# run the site
npm run dev
```

Then in a **fresh incognito window** (bypass any cached old build):
- `/blog` → cards show real WebP covers, real author names, dates, and category pills with counts.
- Click an article → page `<title>` and meta description are per-article; the cover shows in the header; **view-source** contains `application/ld+json` blocks: `@type:"Article"` with a `Person` author, `FAQPage` (when the article has `aeo_pairs`), and `BreadcrumbList`.
- The author CTA links to the real `author_url` (e.g. `nezamy.sa/team/ashraf-abdelrazek`).

---

## 5. Adding / editing articles later

1. Update the `.md` files inside `blog-toolkit/blog_final/<section>/` (same 31-field frontmatter).
2. Add/replace the matching WebP in `blog-toolkit/blog_final/images_delivered/` and update `blog_images_registry.json` if a slug changed.
3. Re-run:
   ```bash
   npm run blog:reseed                                 # full reseed
   # or, for one section only:
   npm run blog:images -- --sections sec_04_civil
   npm run blog:seed   -- --sections sec_04_civil
   ```
   Idempotent — only changed rows are written.

For one-off edits from the panel: `/dashboard/admin/content/articles` still edits the core fields (title, slug, excerpt, category, cover, body, status). The 24 new SEO/AEO/GEO columns are seeder-managed for now.

---

## 6. Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `✗ blog dir not found` / `✗ registry not found` | `blog_final/` (with `images_delivered/` + `blog_images_registry.json`) isn't inside `blog-toolkit/` — see Step 0. |
| `Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY` | Env not set — pass inline (Step 2) or add to `.env.vps`. |
| `blog:clear`/`blog:seed` reports "relation articles does not exist" / unknown column | Migration not applied — paste `20260716_blog_seo_aeo_geo.sql` into the SQL Editor (Step 1). |
| Cover images 403 | Public-read policy missing on `blog-covers` — Dashboard → Storage → Policies. |
| Seeded but `/blog` still shows old content | Cached tab — hard-reload / incognito. Or you seeded a different DB than the app reads. |
| `blog:seed` skips files | Missing `slug`/`title`/empty body or forbidden characters — see `blog-toolkit/_blog-seed-rejects.log`. |
| Duplicate slug | First wins; the dup is listed in `--dry` output — give it a unique `slug`. |

---

## At a glance / باختصار

```bash
# 1. put blog_final/ inside blog-toolkit/   (blog-toolkit/blog_final/ …)

# 2. (one-time, already done) SQL migration in Supabase SQL Editor

# 3. preview
npm run blog:reseed -- --dry

# 4. live reseed   (clear → upload 614 covers → upsert 614 articles)
npm run blog:reseed

# 5. verify
curl -I "https://your-project.supabase.co/storage/v1/object/public/blog-covers/images/<slug>.webp"
npm run dev   # open /blog + an article in incognito
```

**Scripts** (in `blog-toolkit/`): `blog:clear` (wipe) · `blog:images` (upload WebPs) · `blog:seed` (upsert articles) · `blog:reseed` (clear → images → seed). All accept `--dry`; `blog:seed` + `blog:images` accept `--sections sec_04_civil,sec_07_labor`.