/**
 * O13 (batch l11): the law's sub-legislation (l10-children: merged
 * regulations, then documents linked by parent_law_id) also in the reader's
 * sidebar and among the regulation view's chips. Source contract: the
 * components are client modules.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "src/app/laws/[slug]/_sub-legislation.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("./page.tsx");
const SIDEBAR = read("./_sidebar.tsx");
const SECTION = read("./_sub-legislation.tsx");

test("the sidebar's index panel draws the same section, merged regulations first, 3 then «عرض المزيد»", () => {
  assert.match(SIDEBAR, /import \{ SubLegislationSection \} from "\.\/_sub-legislation";/);
  const mount = SIDEBAR.slice(SIDEBAR.indexOf("<SubLegislationSection"), SIDEBAR.indexOf("/>", SIDEBAR.indexOf("<SubLegislationSection")));
  assert.match(mount, /subLegislation=\{law\.subLegislation\}/);
  assert.match(mount, /mergedNames=\{\(law\.regulationIndex \?\? \[\]\)\.map\(\(g\) => g\.name\)\}/);
  assert.match(mount, /onOpenMerged=\{onOpenMergedRegulation\}/);
  assert.match(mount, /placement="sidebar"/);
  // In renderIndex (so the phone's index sheet has it too), before the «اشترك» card.
  const index = SIDEBAR.slice(SIDEBAR.indexOf("const renderIndex"), SIDEBAR.indexOf('if (mode === "identity")'));
  assert.ok(index.includes("<SubLegislationSection"), "inside renderIndex");
  assert.ok(index.indexOf("<SubLegislationSection") < index.indexOf("viewerIsSubscriber === false"));
  assert.match(SECTION, /export const SUB_LEGISLATION_SHOWN = 3;/);
});

test("both index panels (desktop aside and phone sheet) get the handler; the main column shares it", () => {
  const uses = PAGE.match(/onOpenMergedRegulation=\{/g) ?? [];
  assert.equal(uses.length, 2);
  assert.match(PAGE, /onOpenMergedRegulation=\{\(name\) => \{ setShowIndexSheet\(false\); openMergedRegulation\(name\); \}\}/);
  assert.match(PAGE, /onOpenMerged=\{openMergedRegulation\}/);
  assert.match(PAGE, /const openMergedRegulation = useCallback\(/);
});

test("regulation view: linked children are link chips to their own page, sharing the 3-chip budget", () => {
  assert.match(PAGE, /const linkedChildren = law\.subLegislation\?\.children \?\? \[\];/);
  assert.match(PAGE, /const chipTotal = instChips\.length \+ linkedChildren\.length;/);
  // The row shows with one instrument when there are children (it needed 2 instruments before).
  assert.match(PAGE, /\{\(instruments\.length > 1 \|\| linkedChildren\.length > 0\) && \(/);
  assert.match(PAGE, /\.filter\(\(_c, j\) => showAllRegChips \|\| instChips\.length \+ j < REG_CHIPS_SHOWN\)/);
  assert.match(PAGE, /href=\{`\/laws\/\$\{encodeURIComponent\(child\.slug\)\}`\}/);
  assert.match(PAGE, /عرض المزيد \(\$\{chipTotal - REG_CHIPS_SHOWN\}\)/);
});

test("no gray-100/200 text (dark-mode trap) in the section", () => {
  assert.doesNotMatch(SECTION, /text-gray-(?:100|200)\b/);
});
