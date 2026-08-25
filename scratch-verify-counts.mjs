// ق-03 per-domain verification gate — compares live production row counts
// against the expected counts from the verified local parse outputs.
// Usage: node scratch-verify-counts.mjs <laws|decrees|precedents|feqh|all>
// Exit 0 = all match. Exit 2 = mismatch (numbers printed).
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envRaw = fs.readFileSync(new URL("./.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const lib = supa.schema("library");

// Expected values come from the seed dry-run of the verified 2026-08-23 parse
// outputs (the exact JSONs the real seed will read).
const EXPECTED = {
  laws: { laws: 1785, chapters: 3186, articles: 44047, article_amendments: 4091, article_regulations: 14698 },
  decrees: { decrees_circulars: 2188, decree_pages: null }, // 2,190 parsed − 2 superseded-duplicates skipped; pages read from dry-run at run time
  precedents: { judicial_collections: 206, principles: null, principle_paragraphs: null },
  feqh: { feqh_books: 176, feqh_chapters: null, feqh_sections: null, feqh_blocks: null },
};
// nulls: exact insert-counts are printed by the seeder run itself; the gate then
// compares live counts to the seeder's own reported inserted counts passed here:
const overrides = {};
for (const arg of process.argv.slice(3)) {
  const m = arg.match(/^(\w+)=(\d+)$/);
  if (m) overrides[m[1]] = parseInt(m[2], 10);
}

const domain = process.argv[2] || "all";
const domains = domain === "all" ? Object.keys(EXPECTED) : [domain];

let fail = 0;
for (const d of domains) {
  for (const [table, expRaw] of Object.entries(EXPECTED[d])) {
    const exp = overrides[table] ?? expRaw;
    const { count, error } = await lib.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`🔴 ${table}: query error: ${error.message}`);
      fail++;
      continue;
    }
    if (exp === null) {
      console.log(`ℹ️  ${table}: live=${count} (no expected value passed — supply ${table}=N to enforce)`);
      continue;
    }
    const ok = count === exp;
    if (!ok) fail++;
    console.log(`${ok ? "✅" : "🔴"} ${table}: live=${count} expected=${exp}`);
  }
}
process.exit(fail ? 2 : 0);
