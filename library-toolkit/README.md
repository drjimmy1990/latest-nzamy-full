# 📚 Library Toolkit — owner's guide
### دليل صندوق أدوات المكتبة القانونية

This folder is everything you need to **parse**, **seed**, **clear**, **verify**, and check **status** of the Legal Library. Run the commands from the project root (`nzamy-website/`), not from inside this folder.

> المجلد يحوي كل ما تحتاجه لتحليل، زرع، مسح، والتحقق من المكتبة القانونية. نفّذ الأوامر من جذر المشروع `nzamy-website/`.

---

## 📂 What's in here / ماذا يوجد هنا

```
library-toolkit/
├── README.md                ← this guide (هذا الدليل)
├── library-clear.mjs        ← wipe library tables (مسح جداول المكتبة)
├── library-parse.mjs        ← parse raw .md → JSON (تحليل الملفات)
├── library-seed.mjs         ← insert parsed data into DB (زرع البيانات)
├── library-verify.mjs       ← post-deployment checks (التحقق بعد الزرع)
├── library-status.mjs       ← show row counts (عرض عدد الصفوف)
└── output/                  ← parsed JSON files (auto-created)
```

---

## ✅ Prerequisites / المتطلبات

1. **Supabase keys** are in `nzamy-website/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (for verify only)
2. **Library schema** exists in Supabase (migrations applied). ✅
3. **Raw content** available at a known path (for parsing).

---

## 🚀 Day-to-day commands / الأوامر اليومية

Run from `nzamy-website/` (the project root).

### Full pipeline: clear → seed → verify
```bash
npm run library:reseed          # clear + seed + verify (all types)
```

### Individual steps / خطوات منفردة
```bash
npm run library:status                              # show row counts
npm run library:clear                               # wipe all library tables
npm run library:clear -- --dry                      # preview (no deletes)
npm run library:clear -- --type laws                # clear only laws group
npm run library:parse -- --input ./content/library  # parse all types
npm run library:parse -- --input ./content/library --type feqh  # parse one type
npm run library:seed                                # seed all from output/
npm run library:seed -- --dry-run                   # preview inserts
npm run library:seed -- --type laws                 # seed one type only
npm run library:verify                              # run verification checks
```

> 💡 دائماً شغّل `-- --dry` أو `-- --dry-run` أولاً إذا لم تكن متأكداً. لن تُكتب أي بيانات.

---

## 📁 Content structure / هيكل المحتوى

The `--input` path should point to a directory containing Arabic-named subdirectories:

```
content/library/
├── أنظمة ولوائح/           → laws parser (أنظمة ولوائح)
├── أوامر وتعاميم/           → decrees parser (أوامر وتعاميم)
├── مبادئ وسوابق قضائية/     → precedents parser (مبادئ وسوابق قضائية)
└── فقه ومراجع/              → feqh parser (فقه ومراجع)
```

If a specific Arabic subdirectory is not found, the parser uses the input root directly.

---

## 🗃️ Database tables / جداول قاعدة البيانات

All tables live in the `library` schema (not `public`).

| Group | Tables (FK order: parent → child) |
|---|---|
| **Laws** أنظمة | `laws` → `chapters` → `articles` → `article_amendments` |
| **Decrees** أوامر | `decrees_circulars` → `decree_pages` |
| **Precedents** سوابق | `judicial_collections` → `principles` → `principle_paragraphs` |
| **Feqh** فقه | `feqh_books` → `feqh_chapters` → `feqh_sections` → `feqh_blocks` |
| **User** مستخدم | `smart_folders`, `smart_folder_items`, `issue_reports`, `invitations` |

Clearing happens in **reverse** FK order (children first) to avoid constraint violations.

---

## 📝 Quick reference / مرجع سريع

| Command | What it does | Writes? |
|---|---|---|
| `npm run library:status` | Show row counts for all tables | No |
| `npm run library:clear -- --dry` | Preview what would be deleted | No |
| `npm run library:clear` | **Wipe all library tables** | ✅ Yes |
| `npm run library:clear -- --type laws` | Wipe only laws tables | ✅ Yes |
| `npm run library:parse -- --input <path>` | Parse .md → JSON | Writes to `output/` |
| `npm run library:seed -- --dry-run` | Preview seed inserts | No |
| `npm run library:seed` | **Insert parsed data** | ✅ Yes |
| `npm run library:verify` | Run all verification checks | No |
| `npm run library:reseed` | **Clear → Seed → Verify** | ✅ Yes |

---

## 🧯 Troubleshooting / استكشاف الأخطاء

| Symptom | Fix |
|---|---|
| `Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY` | Add them to `nzamy-website/.env.local`. |
| `Input directory not found` | Check the `--input` path exists and is correct. |
| `Parser not found` | Ensure `scripts/parsers/parse-{type}.ts` files exist. |
| `delete failed` | Check Supabase connection and service role key permissions. |
| `Seeder failed` | Run with `--dry-run` first to see what's failing. Check JSON in `output/`. |
| `Verification failed` | Ensure the dev server is running (`npm run dev`) for API checks. |
| Arabic subdir not detected | Ensure the folder names match exactly: `أنظمة ولوائح`, `أوامر وتعاميم`, `مبادئ وسوابق قضائية`, `فقه ومراجع`. |

---

## 🔗 Related scripts / سكريبتات ذات صلة

- **Parsers:** `scripts/parsers/parse-{laws,decrees,precedents,feqh}.ts`
- **Seeder:** `scripts/seed-library.ts`
- **Verifier:** `scripts/verify-library.ts`
- **Blog Toolkit:** `blog-toolkit/` (same pattern, different domain)
