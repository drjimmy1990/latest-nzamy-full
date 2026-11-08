/**
 * Source contract for the murshid tabs on /ai/procedures (batch 2026-11-08, A2).
 *
 * - No client file of the page imports src/data/murshid (≈3.8 MB) or the
 *   fs-backed server store; the tabs read /api/v1/murshid/* instead.
 * - No file of the page, nor the murshid modules, uses dangerouslySetInnerHTML.
 * - The five routes exist and only read (GET) — nothing a guest can write.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(src, rel), "utf8");
/** Code without comments, so a comment that names a forbidden thing is not a hit. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");

const pageFiles = fs
  .readdirSync(here)
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
  .map((f) => path.join("app/ai/procedures", f));

test("no page file imports the murshid data or the server store", () => {
  assert.ok(pageFiles.length >= 9);
  for (const f of pageFiles) {
    const body = code(f);
    assert.doesNotMatch(body, /data\/murshid|sector_\d+_|unified_channels|najiz-guide-2026/, f);
    assert.doesNotMatch(body, /murshidStore/, f);
  }
  for (const f of ["_MurshidGrievances.tsx", "_MurshidChannels.tsx", "_MurshidNajizGuide.tsx"]) {
    assert.match(read(`app/ai/procedures/${f}`), /\/api\/v1\/murshid\//, f);
  }
});

test("no dangerouslySetInnerHTML in the page or the murshid modules", () => {
  const files = [...pageFiles, "lib/murshid/murshidData.ts", "lib/murshid/guideBlocks.ts", "lib/murshid/murshidStore.ts"];
  for (const f of files) assert.doesNotMatch(code(f), /dangerouslySetInnerHTML|innerHTML\s*=/, f);
});

test("the page renders the three murshid tabs", () => {
  const page = read("app/ai/procedures/page.tsx");
  for (const c of ["MurshidGrievances", "MurshidChannels", "MurshidNajizGuide"]) {
    assert.match(page, new RegExp(`<${c} isDark=\\{isDark\\} />`), c);
  }
});

test("the murshid routes are GET-only and use the server store", () => {
  const routes = ["sectors/route.ts", "sectors/[n]/route.ts", "search/route.ts", "channels/route.ts", "najiz-guide/route.ts"];
  for (const r of routes) {
    const code = read(`app/api/v1/murshid/${r}`);
    assert.match(code, /export async function GET\(/, r);
    assert.doesNotMatch(code, /export async function (POST|PUT|PATCH|DELETE)\(/, r);
    assert.match(code, /@\/lib\/murshid\/murshidStore/, r);
  }
});
