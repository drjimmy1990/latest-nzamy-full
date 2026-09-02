import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * A nav entry is a promise about the page under it.
 *
 * The defect this pins (screenshot findings 114 and 134, and matrix rows 126
 * and 134 which ordered it for two OTHER pages): six sidebar rows pointed at a
 * page rendering `DashboardComingSoon` while the badge slot said something
 * else. Two of them said the opposite of the truth —
 *
 *     «ربعي»             badged «نشط»   — ACTIVE, over a coming-soon page
 *     «لوحة الإحصائيات»  badged «جديد»  — NEW, over a coming-soon page
 *
 * — and four carried no badge at all, so the nav read as a finished feature
 * until you clicked it.
 *
 * The matrix had already ordered this fix for two unfinished pages. It reached
 * those two and not these six, which is the shape this whole wave keeps
 * meeting: a rule applied where someone looked, not everywhere it holds.
 *
 * This test applies it everywhere, so the next coming-soon page cannot be added
 * to the nav wearing «جديد».
 */

const NAV_DIR = "src/constants";
const APP_DIR = "src/app";
const SOON = "قريباً";

/** Every route whose page renders DashboardComingSoon. */
async function comingSoonRoutes(): Promise<Set<string>> {
  const found = new Set<string>();
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name === "page.tsx") {
        const body = await readFile(full, "utf8");
        // The IMPORT, not the word: the word appears in prose all over the app,
        // and in epitaphs describing pages that are no longer coming soon.
        if (!body.includes('from "@/components/ui/DashboardComingSoon"')) continue;
        const rel = path.relative(APP_DIR, full).split(path.sep).join("/");
        const route = "/" + rel.slice(0, -"/page.tsx".length);
        found.add(route.replace(/\/\([^)]+\)/g, ""));
      }
    }
  }
  await walk(APP_DIR);
  return found;
}

/** Every `{ label, href, badge? }` row across the sidebar constants. */
async function navRows() {
  const rows: { file: string; label: string; href: string; badge: string | null }[] = [];
  for (const file of await readdir(NAV_DIR)) {
    if (!/^navigation\.sidebars\..*\.ts$/.test(file)) continue;
    const body = await readFile(path.join(NAV_DIR, file), "utf8");
    for (const line of body.split("\n")) {
      const href = /href: "([^"]+)"/.exec(line);
      const label = /label: "([^"]+)"/.exec(line);
      if (!href || !label) continue;
      const badge = /badge: "([^"]+)"/.exec(line);
      rows.push({ file, label: label[1], href: href[1], badge: badge?.[1] ?? null });
    }
  }
  return rows;
}

test("the sweep finds real pages on both sides — it is not vacuously passing", async () => {
  // A test that silently matched nothing would pass forever while the defect
  // walked back in. Assert both inputs are non-empty first.
  const soon = await comingSoonRoutes();
  const rows = await navRows();
  assert.ok(soon.size > 0, "found no DashboardComingSoon pages at all — the detector broke");
  assert.ok(rows.length > 50, `found only ${rows.length} nav rows — the parser broke`);
});

test("every nav entry pointing at a coming-soon page is badged «قريباً»", async () => {
  const soon = await comingSoonRoutes();
  const rows = await navRows();

  const wrong = rows
    .filter((r) => soon.has(r.href) && r.badge !== SOON)
    .map((r) => `${r.file}: «${r.label}» → ${r.href} is badged «${r.badge ?? "(none)"}»`);

  assert.deepEqual(wrong, [],
    "a nav entry promises something its own page disowns:\n  " + wrong.join("\n  "));
});

test("no nav entry claims a coming-soon page is active or new", async () => {
  // The two that were actively false, kept as their own assertion because they
  // are a different failure from "no badge": silence misleads, «نشط» lies.
  const soon = await comingSoonRoutes();
  const rows = await navRows();
  const LIES = ["نشط", "جديد", "مُطوَّر"];

  for (const r of rows) {
    if (!soon.has(r.href) || r.badge === null) continue;
    assert.ok(!LIES.includes(r.badge),
      `«${r.label}» (${r.href}) renders DashboardComingSoon but the nav badges it «${r.badge}»`);
  }
});
