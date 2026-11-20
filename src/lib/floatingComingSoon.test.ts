import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * O16 (a) / S5-4, batch l11-misc: a floating-menu shortcut is a promise about
 * the page under it — the same rule src/lib/services/navComingSoon.test.ts
 * holds for the sidebars. A shortcut whose page renders DashboardComingSoon
 * (on the live site: isDemoMode is off there) carries the «قريباً» badge, never
 * a role badge or an English word that reads as a working feature.
 *
 * The constants file is .tsx (JSX icons), so it is read as text, like
 * src/lib/floatingLinks.test.ts does. Objects are split at each `key: "…"`,
 * so a multi-line object (href on one line, badge on another) is read whole.
 */

const APP_DIR = "src/app";
const FILE = "src/components/floating/constants/floatingServices.tsx";
const SOON = "قريباً";

async function comingSoonRoutes(): Promise<Set<string>> {
  const found = new Set<string>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === "page.tsx") {
        const body = await readFile(full, "utf8");
        if (!body.includes('from "@/components/ui/DashboardComingSoon"')) continue;
        const rel = path.relative(APP_DIR, full).split(path.sep).join("/");
        found.add(("/" + rel.slice(0, -"/page.tsx".length)).replace(/\/\([^)]+\)/g, ""));
      }
    }
  }
  await walk(APP_DIR);
  return found;
}

interface Shortcut {
  key: string;
  hrefs: string[];
  badge: string | null;
  badgeExpr: string | null;
}

async function shortcuts(): Promise<Shortcut[]> {
  const src = (await readFile(FILE, "utf8")).replace(/\r\n/g, "\n");
  const out: Shortcut[] = [];
  for (const chunk of src.split(/(?=\bkey: ")/).slice(1)) {
    const key = /^key: "([^"]+)"/.exec(chunk)?.[1];
    // The href expression up to the first comma outside a string (a ternary has none).
    const hrefExpr = /href:\s*((?:[^,"\n]|"[^"]*")+)/.exec(chunk)?.[1];
    if (!key || !hrefExpr) continue;
    const hrefs = [...hrefExpr.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const badgeExpr = /badge:\s*((?:[^,}\n"]|"[^"]*")+)/.exec(chunk)?.[1]?.trim() ?? null;
    const badge = badgeExpr ? (/^"([^"]*)"$/.exec(badgeExpr)?.[1] ?? null) : null;
    out.push({ key, hrefs, badge, badgeExpr });
  }
  return out;
}

const routeOf = (href: string) => href.split("?")[0].split("#")[0];

test("the sweep finds real shortcuts and real coming-soon pages", async () => {
  const soon = await comingSoonRoutes();
  const rows = await shortcuts();
  assert.ok(soon.size > 20, `only ${soon.size} coming-soon pages — the detector broke`);
  assert.ok(rows.length > 80, `only ${rows.length} shortcuts — the parser broke`);
  // A multi-line object is read whole (the gap report's example).
  const notary = rows.find((r) => r.key === "lawyer-addon-notary");
  assert.deepEqual(notary?.hrefs, ["/dashboard/provider/notary/requests"]);
});

test("every shortcut whose page is «قريباً» is badged «قريباً»", async () => {
  const soon = await comingSoonRoutes();
  const wrong = (await shortcuts())
    .filter((r) => r.hrefs.length > 0 && r.hrefs.every((h) => soon.has(routeOf(h))) && r.badge !== SOON)
    .map((r) => `${r.key} → ${r.hrefs.join(" | ")} badged ${r.badgeExpr ?? "(none)"}`);
  assert.deepEqual(wrong, [], "a floating shortcut promises a page that says «قريباً»:\n  " + wrong.join("\n  "));
});

test("the gap report's named shortcuts are badged", async () => {
  const rows = await shortcuts();
  for (const key of ["firm-finance-reports", "firm-hr-trainees", "provider-arb-cases", "provider-notary-requests", "provider-bailiff-requests"]) {
    const row = rows.find((r) => r.key === key);
    assert.ok(row, key);
    assert.equal(row.badge, SOON, key);
  }
});

test("no shortcut badge is an English word (except the «AI» tag)", async () => {
  for (const r of await shortcuts()) {
    if (r.badge === null || r.badge === "AI") continue;
    assert.doesNotMatch(r.badge, /[A-Za-z]/, `${r.key}: badge «${r.badge}»`);
  }
});
