import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BLOG_CATEGORY_AR, BLOG_CATEGORY_FALLBACK, blogCategoryLabel, groupCategoryPills } from "./_categories.ts";

test("the label map is seed-blog.mjs's CATEGORY_AR, key for key and word for word", async () => {
  const seeder = await readFile(path.resolve(process.cwd(), "blog-toolkit/seed-blog.mjs"), "utf8");
  const block = /const CATEGORY_AR = \{([\s\S]*?)\};/.exec(seeder);
  assert.ok(block, "CATEGORY_AR found in the seeder");
  const fromSeeder = Object.fromEntries(
    [...block[1].matchAll(/(sec_\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
  );
  assert.deepEqual(BLOG_CATEGORY_AR, fromSeeder);
});

test("codes from either numbering resolve to an Arabic label, never to the code", () => {
  assert.equal(blogCategoryLabel("sec_04_commercial"), "الأنظمة التجارية والشركات والإفلاس");
  // blog_sections numbering — the corpus frontmatter
  assert.equal(blogCategoryLabel("sec_05_commercial"), "الأنظمة التجارية والشركات والإفلاس");
  assert.equal(blogCategoryLabel("sec_04_civil"), "المعاملات المدنية والأحوال الشخصية والعقود");
  assert.equal(blogCategoryLabel("sec_07_labor"), "أنظمة العمل والعمال والخدمة المدنية");
  assert.equal(blogCategoryLabel("sec_03_execution"), "أنظمة المرافعات والإجراءات القضائية والتنفيذ");
  assert.equal(blogCategoryLabel("sec_08_real_estate"), "الأنظمة العقارية والبناء والمقاولات");
  assert.equal(blogCategoryLabel("sec_14_transport"), "الأنظمة اللوجستية والنقل والموانئ والطيران");
  assert.equal(blogCategoryLabel("sec_30_culture"), "الأنظمة الثقافية والتراث الوطني والفنون");
});

test("every code the corpus and the blog_sections table use has a label", async () => {
  const sql = await readFile(path.resolve(process.cwd(), "supabase/migrations/20260716_blog_seo_aeo_geo.sql"), "utf8");
  const codes = [...sql.matchAll(/\('(sec_\d+_\w+)'/g)].map((m) => m[1]);
  assert.ok(codes.length >= 30);
  for (const code of codes) assert.ok(blogCategoryLabel(code), code);
});

test("an Arabic label passes through; unknown codes and blanks print nothing", () => {
  assert.equal(blogCategoryLabel("الدفاع والأمن"), "الدفاع والأمن");
  assert.equal(blogCategoryLabel("sec_99_unknown"), null);
  assert.equal(blogCategoryLabel("sec_"), null);
  assert.equal(blogCategoryLabel(""), null);
  assert.equal(blogCategoryLabel(null), null);
  assert.equal(BLOG_CATEGORY_FALLBACK, "مقالات قانونية");
});

test("pills merge a label and its code into one, drop unprintable values, sort by count", () => {
  const pills = groupCategoryPills([
    { category: "sec_05_commercial", count: 7 },
    { category: "الأنظمة التجارية والشركات والإفلاس", count: 3 },
    { category: "sec_99_unknown", count: 50 },
    { category: "الدفاع والأمن", count: 9 },
  ]);
  assert.deepEqual(pills, [
    { id: "الأنظمة التجارية والشركات والإفلاس", label: "الأنظمة التجارية والشركات والإفلاس", values: ["sec_05_commercial", "الأنظمة التجارية والشركات والإفلاس"], count: 10 },
    { id: "الدفاع والأمن", label: "الدفاع والأمن", values: ["الدفاع والأمن"], count: 9 },
  ]);
});
