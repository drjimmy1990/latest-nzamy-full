/**
 * P2-3 / R3b (owner file 12, batch l12): a tool keeps its step and typed fields
 * for this tab when the user goes back; nothing is kept that is not JSON, a
 * stale or broken value is dropped, and a restored screen never runs a tool.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/toolStepState.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearStepState, loadStepValue, sameShape, saveStepValue, stepStateKey,
  MAX_STEP_VALUE_CHARS, STEP_STATE_MAX_AGE_MS,
} from "./toolStepState.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function memory() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const NOW = 1_800_000_000_000;

test("keys: one per tool and field, nothing odd accepted", () => {
  assert.equal(stepStateKey("legal-drafter", "step"), "nzamy:tool-step:legal-drafter:step");
  assert.equal(stepStateKey("../x", "step"), null);
  assert.equal(stepStateKey("contracts-pro", "a:b"), null);
});

test("a value comes back as saved, within its age", () => {
  const s = memory();
  assert.equal(saveStepValue(s, "contracts-pro", "party1Data", { name: "أ" }, NOW), true);
  assert.deepEqual(loadStepValue(s, "contracts-pro", "party1Data", NOW + 1000), { name: "أ" });
  assert.equal(saveStepValue(s, "contracts-pro", "contractMode", null, NOW), true);
  assert.equal(loadStepValue(s, "contracts-pro", "contractMode", NOW), null);
});

test("stale, broken, missing or blocked → nothing (the tool starts fresh)", () => {
  const s = memory();
  saveStepValue(s, "wargaming", "step", "targets", NOW);
  assert.equal(loadStepValue(s, "wargaming", "step", NOW + STEP_STATE_MAX_AGE_MS + 1), undefined);
  assert.equal(s.m.size, 0, "a stale value is dropped");
  s.setItem("nzamy:tool-step:wargaming:ctx", "{not json");
  assert.equal(loadStepValue(s, "wargaming", "ctx", NOW), undefined);
  assert.equal(loadStepValue(s, "wargaming", "none", NOW), undefined);
  assert.equal(loadStepValue(null, "wargaming", "step", NOW), undefined);
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
  assert.equal(loadStepValue(throwing, "wargaming", "step", NOW), undefined);
  assert.equal(saveStepValue(throwing, "wargaming", "step", "setup", NOW), false);
});

test("too large or not JSON is not kept", () => {
  const s = memory();
  assert.equal(saveStepValue(s, "legal-drafter", "caseText", "س".repeat(MAX_STEP_VALUE_CHARS), NOW), false);
  assert.equal(saveStepValue(s, "legal-drafter", "x", undefined, NOW), false);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(saveStepValue(s, "legal-drafter", "x", cyclic, NOW), false);
  clearStepState(s, "legal-drafter", ["x", "caseText"]);
  assert.equal(s.m.size, 0);
});

test("a kept value of another shape is ignored", () => {
  assert.equal(sameShape("", "abc"), true);
  assert.equal(sameShape("", 3), false);
  assert.equal(sameShape(1, 3), true);
  assert.equal(sameShape({ a: 1 }, [1]), false);
  assert.equal(sameShape([], [1]), true);
  assert.equal(sameShape(null, "draft"), true);
  assert.equal(sameShape(null, { x: 1 }), false);
  assert.equal(sameShape("x", undefined), false);
});

test("the hook restores in an effect (no hydration mismatch) and only allowed steps", () => {
  const hook = src("hooks/useSessionState.ts");
  assert.match(hook, /const \[value, setValue\] = useState<T>\(initial\);/);
  assert.match(hook, /useEffect\(\(\) => \{\s*if \(enabled\) \{\s*const kept = loadStepValue/);
  assert.match(hook, /\(!allowed \|\| allowed\.includes\(kept as T\)\)/);
});

test("wired on the live wizards: drafter, محترف العقود, the legal opinion, the contract drafter, the simulator", () => {
  const draft = src("hooks/useDraftState.ts");
  assert.match(draft, /useSessionState<StepKey \| VisibleStepKey>\(DRAFT_STEP_TOOL, "step", "identify", \{ \.\.\.keep, allowed: DRAFT_STEP_KEYS \}\)/);
  assert.match(draft, /const keep = \{ enabled: !initialMode && !prefill \};/);
  assert.match(src("app/ai/draft/page.tsx"), /useSessionState<"pre" \| "draft">\("legal-drafter", "preMode"/);
  const contracts = src("hooks/useContractsState.ts");
  assert.match(contracts, /useSessionState<StepKey>\(CONTRACTS_STEP_TOOL, "step", "parties", \{ allowed: CONTRACT_STEP_KEYS \}\)/);
  assert.match(contracts, /useSessionState<"draft" \| "review" \| null>\(CONTRACTS_STEP_TOOL, "contractMode"/);
  const opinion = src("app/ai/legal-opinion/page.tsx");
  assert.match(opinion, /const OPINION_STEP_KEYS: readonly StepKey\[\] = \["type", "context", "settings", "submit"\];/);
  assert.match(opinion, /useSessionState<StepKey>\(OPINION_STEP_TOOL, "currentStep", "type", \{ allowed: OPINION_STEP_KEYS \}\)/);
  const cd = src("app/ai/contract-drafter/page.tsx");
  assert.match(cd, /useSessionState<Step>\("contract-drafter", "step", 1, \{ allowed: \[1, 2, 3, 5\] \}\)/);
  assert.match(cd, /if \(mode === "draft" && step > 1 && !selectedType && !keptTypeId\) setStep\(1\);/);
  assert.match(src("app/ai/wargaming/page.tsx"), /useSessionState<PageStep>\("wargaming", "step", "setup"/);
  // No File, Set or run result is ever kept.
  for (const rel of ["hooks/useDraftState.ts", "hooks/useContractsState.ts", "app/ai/legal-opinion/page.tsx", "app/ai/contract-drafter/page.tsx", "app/ai/wargaming/page.tsx"]) {
    assert.doesNotMatch(src(rel), /useSessionState<Set|useSessionState<File|useSessionState\([^)]*"(?:caseFile|supportDocs|targets|output|result)"/, rel);
  }
});
