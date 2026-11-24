/**
 * libraryRedirects.test.ts — N02-1 / N02-2 (owner, 13-Nov package): the legal
 * library is /laws. The old /erp/library mock and the guessed /library answer
 * a permanent redirect there, and the footer and the floating services menu
 * link to /laws directly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("next.config redirects /erp/library and /library (and their sub-paths) permanently to /laws", () => {
  const config = read("next.config.ts");
  for (const source of ["/erp/library", "/erp/library/:path*", "/library", "/library/:path*"]) {
    assert.ok(
      config.includes(`{ source: "${source}", destination: "/laws", permanent: true }`),
      `${source} → /laws (308)`,
    );
  }
});

test("no link in src points at /erp/library any more", () => {
  for (const rel of ["src/components/Footer.tsx", "src/components/floating/constants/floatingServices.tsx"]) {
    const source = read(rel);
    assert.doesNotMatch(source, /href: "\/erp\/library"/, rel);
  }
  assert.match(read("src/components/Footer.tsx"), /\{ label: "المكتبة القانونية", href: "\/laws" \}/);
  assert.match(
    read("src/components/floating/constants/floatingServices.tsx"),
    /key: "firm-trainee-library"[^\n]*href: "\/laws" \}/,
  );
});

// Live check of 13 Nov, row 48: the old /erp/library mock had a «نسخ» button that
// copied nothing (and «معاينة» / download buttons with no handler). The redirect
// above already made it unreachable, so the page file is gone rather than patched.
test("the unreachable /erp/library mock page is deleted, not left behind the redirect", () => {
  assert.equal(existsSync(join(ROOT, "src/app/erp/library/page.tsx")), false);
});
