/**
 * proxyRedirects.test.ts — every old tool URL lands on the right new page, with a
 * real 301 and with its query string (S3-02, S3-03, S3-04).
 *
 * proxy.ts imports next/server, so the map is read from its source. A bookmark
 * keeps working only if: the key maps to this target, the target is a page that
 * exists and does not redirect again, and the old page is gone (a page left
 * behind would never be reached, and would read as live to a later reader).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/nav/proxyRedirects.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AI_TOOL_PAGES } from "../ai/toolLabels.ts";
import { AI_TOOLS } from "../ai/tools.ts";
import { LAWYER_SIDEBAR, FIRM_SIDEBAR } from "../../constants/navigation.sidebars.legal.ts";
import { CORPORATE_SIDEBAR, MICRO_SIDEBAR, NGO_SIDEBAR } from "../../constants/navigation.sidebars.business.ts";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const pageOf = (route: string) => join(SRC, "app", ...route.split("/").filter(Boolean), "page.tsx");

function redirects(): Record<string, string> {
  const block = /const REDIRECTS: Record<string, string> = \{\n([\s\S]*?)\n\};/.exec(read("proxy.ts"));
  assert.ok(block, "REDIRECTS not found in proxy.ts");
  const map: Record<string, string> = {};
  for (const m of block[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) map[m[1]] = m[2];
  return map;
}

/** The old URLs this batch retires, and where each one goes. */
const MOVED: Record<string, string> = {
  "/ai/case-brief": "/ai/analyze",
  "/ai/research": "/ai/legal-opinion",
  "/ai/corp/contracts": "/ai/contracts",
  "/ai/ngo/volunteer-contract": "/ai/contracts",
};

for (const [from, to] of Object.entries(MOVED)) {
  test(`${from} is a 301 to ${to}`, () => {
    const map = redirects();
    assert.equal(map[from], to);
    assert.ok(existsSync(pageOf(to)), `${to} has no page`);
    assert.equal(map[to], undefined, `${to} redirects again`);
    assert.equal(existsSync(pageOf(from)), false, `${from} still has a page`);
  });
}

test("the redirect answers 301 and keeps the query string: only the path changes", () => {
  assert.match(
    read("proxy.ts"),
    /if \(REDIRECTS\[pathname\]\) \{\n\s*const url = req\.nextUrl\.clone\(\);\n\s*url\.pathname = REDIRECTS\[pathname\];\n\s*return NextResponse\.redirect\(url, 301\);/,
  );
});

// ── Nobody links the old URL any more ───────────────────────────────────────

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

test("no source outside proxy.ts names a retired URL or the retired permission", () => {
  const needles = [...Object.keys(MOVED), "ai:case-brief"];
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (file.endsWith("proxy.ts")) continue;
    const body = readFileSync(file, "utf8");
    for (const n of needles) {
      if (body.includes(`"${n}"`) || body.includes(`"${n}?`) || body.includes(`'${n}'`) || body.includes(`url: "${n}`)) hits.push(`${file}: ${n}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("the sitemap does not advertise the retired URLs", () => {
  const sitemap = read("app/sitemap.ts");
  for (const from of Object.keys(MOVED)) assert.ok(!sitemap.includes(`"${from}"`), from);
});

test("R3: a run's «افتح الأداة» link opens the page the case brief lives on, with no redirect hop", () => {
  assert.equal(AI_TOOL_PAGES["case-brief"], "/ai/analyze");
  assert.equal(redirects()[AI_TOOL_PAGES["case-brief"] as string], undefined);
});

test("corporate and NGO contract tools land on a page they may run: both roles are on contracts-pro", () => {
  assert.ok(AI_TOOLS["contracts-pro"].roles.includes("corporate"));
  assert.ok(AI_TOOLS["contracts-pro"].roles.includes("ngo"));
  assert.ok(AI_TOOLS["contracts-pro"].roles.includes("micro"), "the micro dashboard links it too");
  assert.match(read("proxy.ts"), /"\/ai\/contracts",/, "/ai/contracts stays behind sign-in (PROTECTED)");
});

test("no sidebar row points twice at /ai/contracts: the sidebar keys its rows by href", () => {
  assert.match(read("components/dashboard/SidebarComponents.tsx"), /key=\{item\.href\}/);
  for (const [name, groups] of [["corporate", CORPORATE_SIDEBAR], ["micro", MICRO_SIDEBAR], ["ngo", NGO_SIDEBAR]] as const) {
    const rows = groups.flatMap((g) => g.items).filter((r) => r.href === "/ai/contracts");
    assert.ok(rows.length <= 1, `${name}: ${rows.length} rows to /ai/contracts`);
  }
  assert.equal(NGO_SIDEBAR.flatMap((g) => g.items).filter((r) => r.href === "/ai/contracts" && r.label === "محترف العقود" && !r.badge).length, 1);
});

test("one «عصارة المرفقات» row in each sidebar, unbadged, on the plain URL", () => {
  for (const [name, sidebar] of [["lawyer", LAWYER_SIDEBAR], ["firm", FIRM_SIDEBAR]] as const) {
    const rows = sidebar.flatMap((g) => g.items).filter((r) => r.href.split("?")[0] === "/ai/analyze");
    assert.equal(rows.length, 1, `${name} sidebar: ${rows.length} rows to /ai/analyze`);
    assert.deepEqual(
      { label: rows[0].label, labelEn: rows[0].labelEn, href: rows[0].href, icon: rows[0].icon, badge: rows[0].badge },
      { label: "عصارة المرفقات", labelEn: "Attachment Analyzer", href: "/ai/analyze", icon: "Scan", badge: undefined },
      name,
    );
    assert.equal(sidebar.flatMap((g) => g.items).filter((r) => r.href === "/ai/case-brief").length, 0, name);
  }
});
