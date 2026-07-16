---
name: blog-system-newblog-migration
description: "New blog CMS — 31-field articles, Supabase Storage covers, clear/seed/images scripts, server JSON-LD"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7131e1e4-67f9-4ec3-8aa8-bce38389e0a9
---

Blog migrated to the owner's `test/newblog` content (608 articles, 31 sections, 31-field frontmatter, 614 WebP covers). Implemented 2026-07-16.

**Schema** (`supabase/migrations/20260716_blog_seo_aeo_geo.sql`): 23 nullable columns added to `articles` (schema_type, author_credentials, author_url, reviewer, date_modified, primary_keyword, secondary_keywords text[], long_tail_keywords text[], seo_keywords, aeo_pairs jsonb, geo_coverage/tier1/tier2, related_laws, original_sources, pillar_page, related_articles text[], target_persona, writing_track, content_scope, brand, canonical_url, category_code) + `blog_sections` table (31 rows, code↔Arabic label) + public Storage bucket `blog-covers`. `category` column still stores the Arabic label (so `/api/v1/blog/categories` is unchanged); `category_code` holds the `sec_XX_name` code.

**Scripts** (mirror `seed-blog.mjs` conventions: .mjs, loadEnv, --dry, service role): `scripts/blog-clear.mjs` (DELETE articles), `scripts/seed-blog.mjs` (REWRITE — nested YAML parser for lists + aeo_pairs objects, 31-field mapping, validation per ENCODING_SAFETY, points at `test/newblog/blog_final`, cover=Storage public URL), `scripts/seed-blog-images.mjs` (registry-driven WebP upload to `blog-covers`, upsert). npm: `blog:clear` / `blog:images` / `blog:seed` / `blog:reseed` (= clear && images && seed).

**Render**: `next.config.ts` added `images.remotePatterns` for `*.supabase.co`. `PlatformBlogArticle` gained `cover` + the 23 optional fields. `src/app/blog/page.tsx` renders covers via next/image (gradient fallback) + real author/date. `src/app/blog/[slug]/page.tsx` refactored client→server: `generateMetadata` (per-article title/desc/OG/canonical), `src/components/ArticleJsonLd.tsx` (Article + FAQPage from aeo_pairs + Person from author_credentials/url + BreadcrumbList), client `ArticleView.tsx` child (cover banner, author_url CTA, GFM-alert markdown renderer, key points from aeo_pairs). Admin articles UI unchanged (fixed allowlists ignore new columns — safe because nullable).

**Status**: code+scripts+migration written, `tsc --noEmit` 0 errors, `next build` green. NOT yet applied/run: migration must be applied to Supabase, then `npm run blog:reseed` with explicit prod env (`SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...`). If Storage public reads 403, add a public-read policy via Dashboard (bucket public=true usually auto-grants). `test/newblog/blog_final/images_delivered/` gitignored. Related: [[master-priority-list-2026-07-16]].