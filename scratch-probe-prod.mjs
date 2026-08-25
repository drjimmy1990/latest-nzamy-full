// Read-only production DB probe for ق-03 planning.
// - Row counts for every library table the seeder touches
// - Marker-column probes: does selecting the column error (=> migration not applied)?
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envRaw = fs.readFileSync("D:/Data/Data/antigravity ai/GIT NZAMY/latest-nzamy-full/.env.local", "utf-8");
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const lib = supa.schema("library");

const tables = [
  "laws", "chapters", "articles", "article_amendments", "article_regulations",
  "decrees_circulars", "decree_pages",
  "judicial_collections", "principles", "principle_paragraphs",
  "feqh_books", "feqh_chapters", "feqh_sections", "feqh_blocks",
];

console.log("=== ROW COUNTS (production) ===");
for (const t of tables) {
  const { count, error } = await lib.from(t).select("*", { count: "exact", head: true });
  console.log(t.padEnd(24), error ? `ERROR: ${error.message}` : count);
}

console.log("\n=== MARKER COLUMN PROBES (error => migration NOT applied) ===");
const probes = [
  ["articles", "original_text", "20260729_article_history_columns"],
  ["articles", "title_en", "20260822_articles_english_columns"],
  ["laws", "needs_human_review", "20260822_needs_human_review_columns"],
  ["laws", "status", "20260729_library_status"],
  ["laws", "publication_date_hijri", "(base/known)"],
  ["principles", "classification_keywords", "20260821_judicial_principles_missing_columns"],
  ["judicial_collections", "series_id", "20260821_judicial_principles_missing_columns"],
  ["feqh_blocks", "is_synthetic_page", "20260821_feqh_blocks_is_synthetic_page"],
  ["decrees_circulars", "instrument_ar", "20260729_decree_instrument_taxonomy"],
  ["article_regulations", "id", "20260730_article_regulations (table)"],
];
for (const [t, col, mig] of probes) {
  const { error } = await lib.from(t).select(col).limit(1);
  console.log(`${t}.${col}`.padEnd(42), error ? `MISSING (${mig}) :: ${error.message}` : `OK (${mig})`);
}
