/**
 * toolDraftEveryTool.test.ts — batch l11 pay, T8-Q511a: after a top-up the
 * buyer finds his typed input on EVERY paid AI tool, not only the two that
 * had it (analyze-strength, quick-answer).
 *
 *   - every tool id a page starts through useAiRun (`.start("<tool>"`, and
 *     the legal-opinion panel's two ids) has a useToolDraft("<tool>") that
 *     puts the input back;
 *   - useAiRun keeps the page's own form state when it passes one
 *     (draftState), else the run's input;
 *   - the restore helpers accept only what they expect.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/payments/toolDraftEveryTool.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { draftChoice, draftRows, draftTextList, draftTextMap, loadToolDraft, saveToolDraft } from "./topUpDraft.ts";

const SRC = join(import.meta.dirname, "..", "..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const ALL = [...files(join(SRC, "app")), ...files(join(SRC, "components"))];
const text = new Map(ALL.map((p) => [p, readFileSync(p, "utf8")]));

/** The admin's test console runs any tool on demand — not a customer's paid tool. */
const NOT_A_CUSTOMER_TOOL = ["app/dashboard/admin/ai-usage/page.tsx"];

test("T8-Q511a: every paid tool a page starts has a useToolDraft that restores its input", () => {
  const started = new Set<string>();
  for (const [p, src] of text) {
    const rel = relative(SRC, p).split("\\").join("/");
    if (NOT_A_CUSTOMER_TOOL.includes(rel)) continue;
    for (const m of src.matchAll(/\.start\(\s*"([a-z0-9-]+)"/g)) started.add(m[1]);
  }
  // the legal-opinion panel starts AI_OPINION_TOOL[kind]
  for (const id of ["legal-opinion-consult", "legal-opinion-letter"]) started.add(id);
  const restored = new Set<string>();
  for (const src of text.values()) for (const m of src.matchAll(/useToolDraft\(\s*"([a-z0-9-]+)"/g)) restored.add(m[1]);
  const missing = [...started].filter((t) => !restored.has(t)).sort();
  assert.deepEqual(missing, [], `tools with no restore after a top-up: ${missing.join(", ")}`);
  // the set this batch covers (a new tool must join it)
  for (const t of [
    "analyze-strength", "quick-answer", "brief-check", "communicate", "contract-drafter", "contract-negotiator",
    "contracts-pro", "contract-review", "najiz-optimizer", "wargaming", "case-brief", "legal-drafter",
    "legal-opinion-consult", "legal-opinion-letter",
  ]) {
    assert.ok(restored.has(t), t);
  }
});

test("T8-Q511a: useAiRun keeps the page's form state when given, else the input", () => {
  const hook = readFileSync(join(SRC, "hooks", "useAiRun.ts"), "utf8");
  assert.ok(hook.includes("saveToolDraft(session(), tool, draftState ?? input, Date.now());"));
  assert.match(hook, /draftState\?: Record<string, unknown>,/);
});

test("T8-Q511a: a saved form comes back whole within the window", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const form = { ourParty: "المؤجر", contractType: "إيجار", clauses: [{ text: "بند", theirDemand: "طلب", ourGoal: "هدف" }] };
  assert.equal(saveToolDraft(storage, "contract-negotiator", form, 1_000), true);
  assert.deepEqual(loadToolDraft(storage, "contract-negotiator", 2_000), form);
});

test("T8-Q511a: the restore helpers take only what they expect", () => {
  const d = {
    mode: "paste",
    bad: 7,
    list: ["أ", "", 3, "ب"],
    map: { a: "١", b: 2 },
    rows: [{ text: "x", n: 1 }, "nope", null],
  };
  assert.equal(draftChoice(d, "mode", ["file", "paste"] as const), "paste");
  assert.equal(draftChoice(d, "mode", ["file"] as const), null);
  assert.equal(draftChoice(d, "bad", ["7"] as const), null);
  assert.deepEqual(draftTextList(d, "list"), ["أ", "ب"]);
  assert.equal(draftTextList(d, "map"), null);
  assert.deepEqual(draftTextMap(d, "map"), { a: "١" });
  assert.equal(draftTextMap(d, "list"), null);
  assert.deepEqual(draftRows(d, "rows"), [{ text: "x" }]);
  assert.equal(draftRows(null, "rows"), null);
  assert.deepEqual(draftTextList({ l: ["a", "b", "c"] }, "l", 2), ["a", "b"]);
});
