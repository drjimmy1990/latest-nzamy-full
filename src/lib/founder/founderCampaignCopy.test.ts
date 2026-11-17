/**
 * The founder campaign's materials must not carry the phrases the owner
 * removed on 17 Nov 2026 (TEST-PLAN أ.4–5, README «محذوف»): the Najiz
 * illustrated index, the library's old «251», the academy, «مستشار» as a
 * product word, the absolute «لن يتكرر أبداً», and the prototype's
 * «عيّنة توضيحية» / preview bar. Comments are stripped first — only what
 * can reach the page counts.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

const CAMPAIGN_FILES = [
  ...files(join(SRC, "app", "founder")),
  ...files(join(SRC, "app", "founder-terms")),
  ...files(join(SRC, "lib", "founder")),
  join(SRC, "app", "dashboard", "lawyer", "_components", "FounderCampaignNotice.tsx"),
];

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const BANNED: Array<[RegExp, string]> = [
  [/الفهرس المصو[ّ]?ر لناجز/, "the Najiz illustrated index"],
  [/(?<![0-9])251(?![0-9])|٢٥١/, "the library's old 251"],
  [/الأكاديمية|أكاديمية/, "the academy"],
  [/مستشار/, "«مستشار» as a product word"],
  [/لن يتكرر أبد/, "an absolute «never again»"],
  [/توضيحي|توضيحية/, "a prototype «illustrative» label"],
  [/className="dev"|class="dev"/, "the prototype's preview bar"],
  [/25\s*يناير|٢٥\s*يناير|2027-01/, "the superseded end date"],
];

test("campaign files exist", () => {
  assert.ok(CAMPAIGN_FILES.length >= 10, CAMPAIGN_FILES.join("\n"));
});

test("no removed phrase reaches the founder campaign pages", () => {
  for (const path of CAMPAIGN_FILES) {
    const text = code(path);
    for (const [re, what] of BANNED) {
      assert.doesNotMatch(text, re, `${path}: ${what}`);
    }
  }
});

test("the landing page keeps the owner's required lines", () => {
  const page = code(join(SRC, "app", "founder", "page.tsx"));
  for (const s of ["ستة أعمال قضائية كاملة بالصائغ القانوني", "FOUNDER_ADVOCATE_ONLY_LINE", "FOUNDER_ONCE_LINE", "<s ", "LibraryGifs", "SampleMemos"]) {
    assert.ok(page.includes(s), s);
  }
  assert.doesNotMatch(page, /<Navbar|<Footer/, "the site-wide navbar/footer name removed products");
});
