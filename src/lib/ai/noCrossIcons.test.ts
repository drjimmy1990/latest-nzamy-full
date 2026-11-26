/**
 * R3e (owner file 12, batch l12 P0-5): no cross-like icon on the AI tools, their
 * menus, the drafter or the case canvas. `Scales` became `Gavel` (principles,
 * the simulator, courts) or `BookOpen` (a law card). The four-point sparkle is
 * a separate open question (Q-T4) and is not touched here.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/noCrossIcons.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [rel] : [];
  });
}

const SCOPES = [
  ...walk("app/ai"),
  ...walk("components/draft"),
  ...walk("components/ai"),
  "app/dashboard/business/kanban/_graph-model.ts",
  "app/dashboard/business/kanban/CaseGraphView.tsx",
  "constants/navigation.sidebars.legal.ts",
  "constants/navigation.sidebars.business.ts",
  "constants/navigation.sidebars.ts",
  "constants/navigation.navbar.ts",
  "constants/adminNavItems.ts",
  // l14 (file 11 row 43): the principle card in the /laws results list.
  "app/laws/components/ListItems.tsx",
  // l16 (owner package 25-Nov §2.8 (1), B-18): the library reader and its lists.
  "components/laws/DraftDrawer.tsx",
  "app/laws/[slug]/_article-components.tsx",
  "app/laws/[slug]/page.tsx",
  "app/precedents/[slug]/page.tsx",
  "app/laws/components/LawsTabContent.tsx",
  "app/laws/components/PrecedentsTabContent.tsx",
  "app/laws/components/PaywallModal.tsx",
  "constants/lawsLibraryData.ts",
];

test("no Scales icon on the AI tools, their menus, the drafter or the canvas", () => {
  for (const rel of SCOPES) {
    const src = readFileSync(join(ROOT, rel), "utf8").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\bScales\b/, rel);
  }
});

test("a stray menu name still draws the gavel, and the canvas law card is a book", () => {
  assert.match(readFileSync(join(ROOT, "components/dashboard/SidebarComponents.tsx"), "utf8"), /\n\s*Scales: Gavel,/);
  assert.match(readFileSync(join(ROOT, "app/dashboard/business/kanban/_graph-model.ts"), "utf8"), /law:\s*\{ icon: BookOpen,/);
});
