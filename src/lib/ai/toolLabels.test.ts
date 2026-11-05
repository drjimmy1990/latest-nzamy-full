/**
 * toolLabels.test.ts — every registry tool has an Arabic label and a page
 * entry, and every page named exists. Pinned to AI_TOOLS, never to a count: a
 * unit that adds a tool adds its two entries in the same commit.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/toolLabels.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { AI_TOOLS } from "./tools.ts";
import { AI_TOOL_LABELS_AR, AI_TOOL_PAGES, aiToolLabelAr } from "./toolLabels.ts";

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

test("toolLabels: every registry tool has a label and a page entry", () => {
  for (const id of Object.keys(AI_TOOLS)) {
    assert.equal(typeof AI_TOOL_LABELS_AR[id], "string", `${id} has a label`);
    assert.ok(AI_TOOL_LABELS_AR[id].trim(), `${id}'s label is not blank`);
    assert.ok(own(AI_TOOL_PAGES, id), `${id} has a page entry (null when the tool has no page)`);
  }
});

test("toolLabels: no entry for a tool the registry does not have", () => {
  for (const id of [...Object.keys(AI_TOOL_LABELS_AR), ...Object.keys(AI_TOOL_PAGES)]) {
    assert.ok(own(AI_TOOLS, id), `${id} is a registry tool`);
  }
});

test("toolLabels: every page named exists, so the «افتح الأداة» link is never dead", () => {
  for (const [id, page] of Object.entries(AI_TOOL_PAGES)) {
    if (page === null) continue;
    const file = join(process.cwd(), "src", "app", ...page.split("/").filter(Boolean), "page.tsx");
    assert.ok(existsSync(file), `${id} → ${page} has ${file}`);
  }
});

test("aiToolLabelAr: the fallback, and no inherited key taken for a label", () => {
  assert.equal(aiToolLabelAr("x"), "أداة ذكاء اصطناعي");
  assert.equal(aiToolLabelAr("constructor"), "أداة ذكاء اصطناعي");
  assert.equal(aiToolLabelAr("brief-check"), "مراجعة وتدقيق مذكرة");
});
