// ق-03 gate watcher — polls production every 60s until ALL five migration
// markers are present (i.e., the judge has run the SQL bundle), then exits 0.
// Exits 3 on timeout (6 hours). Read-only.
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

const PROBES = [
  ["articles", "title_en"],
  ["laws", "needs_human_review"],
  ["principles", "classification_keywords"],
  ["feqh_blocks", "is_synthetic_page"],
  ["article_regulations", "id"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEADLINE = Date.now() + 6 * 3600 * 1000;

while (Date.now() < DEADLINE) {
  const missing = [];
  for (const [t, col] of PROBES) {
    const { error } = await lib.from(t).select(col).limit(1);
    if (error) missing.push(`${t}.${col}`);
  }
  if (missing.length === 0) {
    console.log("ALL MIGRATION MARKERS PRESENT — judge has applied the SQL bundle. Proceed to seeding.");
    process.exit(0);
  }
  console.log(`${new Date().toISOString()} still missing: ${missing.join(", ")}`);
  await sleep(60_000);
}
console.log("TIMEOUT: 6h elapsed without migrations being applied.");
process.exit(3);
