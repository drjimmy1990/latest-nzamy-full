import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  LAWYER_QUICK_TOOLS,
  DEFAULT_QUICK_TOOLS,
  QUICK_TOOLS_MIN,
  QUICK_TOOLS_MAX,
  validateQuickToolIds,
  resolveQuickToolIds,
  quickToolsFor,
  isKnownQuickToolId,
} from "./lawyerQuickTools.ts";
import { LAWYER_AI_TOOLS } from "../constants/lawyerAiCatalog.ts";

// ── The registry only offers real pages ────────────────────────────────────

test("every quick tool points at an existing page that is not «قريباً»", async () => {
  const problems: string[] = [];
  for (const tool of LAWYER_QUICK_TOOLS) {
    const file = path.join(process.cwd(), "src", "app", ...tool.href.split("/").filter(Boolean), "page.tsx");
    let body: string;
    try {
      body = await readFile(file, "utf8");
    } catch {
      problems.push(`${tool.id} → ${tool.href}: no page.tsx`);
      continue;
    }
    // Same detector as src/lib/services/navComingSoon.test.ts — the import,
    // not the word, which appears in prose all over the app.
    if (body.includes('from "@/components/ui/DashboardComingSoon"')) {
      problems.push(`${tool.id} → ${tool.href}: renders DashboardComingSoon`);
    }
  }
  assert.deepEqual(problems, []);
});

test("every AI quick tool is a catalogued lawyer AI tool that is not coming soon", () => {
  // ai/layout.tsx and the permission keys come from LAWYER_AI_TOOLS; a tile
  // for a tool outside it could be refused to the very lawyer it is shown to.
  const byHref = new Map(LAWYER_AI_TOOLS.map((t) => [t.href, t]));
  for (const tool of LAWYER_QUICK_TOOLS.filter((t) => t.group === "ai")) {
    const entry = byHref.get(tool.href);
    assert.ok(entry, `${tool.href} is not in LAWYER_AI_TOOLS`);
    assert.notEqual(entry!.comingSoon, true, `${tool.href} is marked comingSoon`);
  }
});

test("the excluded pages stay excluded", () => {
  const hrefs = new Set(LAWYER_QUICK_TOOLS.map((t) => t.href));
  for (const href of ["/ai/direction-support", "/ai/secretary", "/ai/research"]) {
    assert.equal(hrefs.has(href), false, `${href} must not be offered`);
  }
});

test("ids and hrefs are unique, and both groups are populated", () => {
  const ids = LAWYER_QUICK_TOOLS.map((t) => t.id);
  const hrefs = LAWYER_QUICK_TOOLS.map((t) => t.href);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(LAWYER_QUICK_TOOLS.some((t) => t.group === "operational"));
  assert.ok(LAWYER_QUICK_TOOLS.some((t) => t.group === "ai"));
  assert.ok(LAWYER_QUICK_TOOLS.length >= QUICK_TOOLS_MAX, "the registry must offer at least the maximum");
});

// ── Defaults ────────────────────────────────────────────────────────────────

test("the default is the owner's four: cases, draft, brief review, calculator", () => {
  assert.deepEqual([...DEFAULT_QUICK_TOOLS], ["cases", "draft", "brief-check", "calculator"]);
  assert.ok(!("error" in (validateQuickToolIds([...DEFAULT_QUICK_TOOLS]) as object)));
});

// ── validateQuickToolIds ────────────────────────────────────────────────────

test("3..8 unique known ids are accepted, order kept", () => {
  assert.deepEqual(validateQuickToolIds(["draft", "cases", "tasks"]), ["draft", "cases", "tasks"]);
  const eight = LAWYER_QUICK_TOOLS.slice(0, 8).map((t) => t.id);
  assert.deepEqual(validateQuickToolIds(eight), eight);
});

test("fewer than 3 or more than 8 is rejected with an Arabic message", () => {
  for (const bad of [[], ["cases"], ["cases", "draft"], LAWYER_QUICK_TOOLS.slice(0, 9).map((t) => t.id)]) {
    const result = validateQuickToolIds(bad);
    assert.ok(!Array.isArray(result), `expected ${bad.length} ids to be rejected`);
    if (!Array.isArray(result)) assert.match(result.error, new RegExp(`${QUICK_TOOLS_MIN}.*${QUICK_TOOLS_MAX}`));
  }
});

test("unknown ids, duplicates and non-arrays are rejected", () => {
  assert.ok(!Array.isArray(validateQuickToolIds(["cases", "draft", "direction-support"])));
  assert.ok(!Array.isArray(validateQuickToolIds(["cases", "draft", "draft"])));
  assert.ok(!Array.isArray(validateQuickToolIds(["cases", "draft", 3])));
  for (const bad of [null, undefined, "cases", { 0: "cases" }]) {
    assert.ok(!Array.isArray(validateQuickToolIds(bad)), `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

// ── resolveQuickToolIds / quickToolsFor ─────────────────────────────────────

test("resolve: nothing stored or garbage → the defaults", () => {
  for (const stored of [undefined, null, "cases", 7, {}]) {
    assert.deepEqual(resolveQuickToolIds(stored), [...DEFAULT_QUICK_TOOLS]);
  }
});

test("resolve: a valid stored choice is shown as saved", () => {
  assert.deepEqual(resolveQuickToolIds(["tasks", "draft", "clients"]), ["tasks", "draft", "clients"]);
});

test("resolve: ids the registry no longer knows are dropped; under 3 left → defaults", () => {
  assert.deepEqual(resolveQuickToolIds(["tasks", "gone", "draft", "clients"]), ["tasks", "draft", "clients"]);
  assert.deepEqual(resolveQuickToolIds(["tasks", "gone", "draft"]), [...DEFAULT_QUICK_TOOLS]);
  assert.deepEqual(resolveQuickToolIds(["tasks", "tasks", "draft"]), [...DEFAULT_QUICK_TOOLS]);
});

test("resolve always returns something the validator accepts", () => {
  for (const stored of [undefined, ["tasks", "draft", "clients"], ["x", "y", "z"], LAWYER_QUICK_TOOLS.map((t) => t.id)]) {
    assert.ok(Array.isArray(validateQuickToolIds(resolveQuickToolIds(stored))));
  }
});

test("quickToolsFor maps ids to entries in order and skips unknown ones", () => {
  assert.deepEqual(quickToolsFor(["draft", "nope", "cases"]).map((t) => t.href), ["/ai/draft", "/dashboard/lawyer/cases"]);
  assert.equal(isKnownQuickToolId("cases"), true);
  assert.equal(isKnownQuickToolId("secretary"), false);
});
