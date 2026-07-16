# 🧰 Blog Toolkit — owner's guide
### دليل صندوق أدوات المدونة

This folder is everything you need to **clear**, **upload covers**, and **seed** the blog. Run the commands from the project root (`nzamy-website/`), not from inside this folder.

> المجلد يحوي كل ما تحتاجه لمسح، رفع صور، وزرع المدونة. نفّذ الأوامر من جذر المشروع `nzamy-website/`.

---

## 📂 What's in here

```
blog-toolkit/
├── README.md              ← this guide
├── blog-clear.mjs         ← wipe all articles
├── seed-blog-images.mjs   ← upload cover WebPs to Supabase Storage
├── seed-blog.mjs          ← insert/update articles from the .md files
└── blog_final/            ← the content (you place/refresh this)
    ├── sec_00_procedural/ … sec_30_culture/   (31 section folders, .md articles)
    ├── images_delivered/                       (614 WebP covers)
    └── blog_images_registry.json               (slug → image map)
```

The scripts find `blog_final/` **automatically** (it's next to them). No paths to edit.

---

## ✅ One-time setup (already done — skip)

1. **SQL migration** `20260716_blog_seo_aeo_geo.sql` was applied in the Supabase SQL Editor (adds the blog columns + `blog_sections` table + `blog-covers` Storage bucket). One-time. ✅
2. **Supabase keys** are in `nzamy-website/.env.local` (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). The scripts auto-read them. ✅

If you ever move to a fresh machine, just make sure those two keys are in `.env.local` and that `blog_final/` is placed inside this folder.

---

## 🚀 Day-to-day commands

Run from `nzamy-website/` (the project root).

### Full reseed = clear → upload covers → seed articles
```bash
npm run blog:reseed -- --dry      # PREVIEW first (changes nothing)
npm run blog:reseed               # DO IT: wipes old, uploads 614 covers, inserts 614 articles
```

### Just one step
```bash
npm run blog:clear                # wipe all articles
npm run blog:images               # upload cover WebPs only
npm run blog:seed                 # insert/update articles only
```
Each accepts `--dry` (preview, no changes):
```bash
npm run blog:seed -- --dry
```

### Reseed only one section (after editing articles in one folder)
```bash
npm run blog:images -- --sections sec_04_civil
npm run blog:seed   -- --sections sec_04_civil
```

> 💡 Always run `-- --dry` first if you're unsure. `--dry` never writes to the database and never uploads anything.

---

## 🆕 "I updated some articles — what do I run?"

1. Replace the changed `.md` files inside `blog-toolkit/blog_final/<section>/`.
2. If a cover changed, put the new `.webp` in `blog-toolkit/blog_final/images_delivered/` and update `blog_images_registry.json` if the slug changed.
3. Run:
   ```bash
   npm run blog:reseed             # full reseed (safest)
   # or, for one section only:
   npm run blog:images -- --sections sec_04_civil
   npm run blog:seed   -- --sections sec_04_civil
   ```
   It's idempotent — only changed rows are written (matched on `slug`).

---

## 🌐 After seeding — update the live site (`nezamy.sa`)

Seeding puts the **data** (articles + covers) into Supabase from your laptop. The live site only shows the **new blog design** (covers, per-article titles, JSON-LD) after you update the server code. SSH into the VPS and run:

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full
git pull origin main
npm run build
pm2 reload nzamy
pm2 logs nzamy --lines 20 --nostream    # look for "✓ Ready"
```

No SQL / no migrations on the server — the SQL was applied in the Supabase SQL Editor, and seeding runs from your laptop.

Then open `https://nezamy.sa/blog` in a **fresh incognito window** → 614 articles with cover images.

---

## ✔️ Verify it worked

```bash
# a cover image is publicly readable (use any real slug)
curl -I "https://gdqfqfcxnwrwgaphtfhu.supabase.co/storage/v1/object/public/blog-covers/images/saudi-procedural-law-lawsuits-najiz.webp"
# → HTTP/2 200
```

Locally:
```bash
npm run dev      # open http://localhost:3000/blog in incognito
```

You should see: cards with WebP covers, real author names, dates, category pills with counts. Click an article → per-article title + cover; view-source contains `application/ld+json` (Article + FAQPage + Breadcrumb).

---

## 🧯 Troubleshooting

| Symptom | Fix |
|---|---|
| `✗ blog dir not found` / `✗ registry not found` | `blog_final/` (with `images_delivered/` + `blog_images_registry.json`) isn't inside `blog-toolkit/`. |
| `✗ delete failed: DELETE requires a WHERE clause` | Fixed in current `blog-clear.mjs`. If it returns, update this file. |
| `Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY` | Add them to `nzamy-website/.env.local`. |
| Cover images 403 on the live site | Add a public-read policy on the `blog-covers` bucket: Supabase Dashboard → Storage → Policies → `SELECT` for `anon`. |
| Live site still shows old blog after deploy | Hard-reload / incognito (cached). Or the VPS build didn't finish — re-run `npm run build` and check `pm2 logs`. |
| `blog:seed` skips a file | Missing `slug`/`title`/empty body, or forbidden characters. See `blog-toolkit/_blog-seed-rejects.log`. |
| Duplicate slug | First wins; the duplicate is listed in `--dry`. Give it a unique `slug` in its frontmatter. |

> ملاحظة: `README_IMAGES.md` داخل `blog_final/` يتم تخطيه عمداً (ليس مقالاً). هذا طبيعي.

---

## 📝 Quick reference

| Command | What it does | Writes? |
|---|---|---|
| `npm run blog:reseed -- --dry` | Preview clear + images + seed | No |
| `npm run blog:reseed` | **Clear → upload 614 covers → upsert 614 articles** | ✅ Yes (prod) |
| `npm run blog:clear` | Wipe all articles | ✅ Yes |
| `npm run blog:images` | Upload cover WebPs | ✅ Yes (Storage) |
| `npm run blog:seed` | Insert/update articles | ✅ Yes |
| `npm run blog:seed -- --sections sec_04_civil` | One section only | ✅ Yes |

Full guide with all details: [`BLOG_GUIDE.md`](../BLOG_GUIDE.md) in the project root.