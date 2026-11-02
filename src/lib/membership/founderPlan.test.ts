/**
 * founderPlan.test.ts — the lawyer founder membership's constants and the
 * credit an AI run may spend (P3, Task 3).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  creditKindForRun,
  FOUNDER_CAMPAIGN_ID,
  FOUNDER_CREDITS,
  FOUNDER_DRAFT_KINDS,
  FOUNDER_LIBRARY_DAYS,
  FOUNDER_MEMBERSHIP_MONTHS,
  FOUNDER_OUTPUT_TOOLS,
  FOUNDER_PLAN_ID,
} from "./founderPlan.ts";
import { DRAFT_KIND_IDS } from "../ai/draftKinds.ts";
import { PRICE_BOOK } from "../pricing/priceBook.ts";

test("the plan and campaign ids are the manifest's", () => {
  assert.equal(FOUNDER_PLAN_ID, "lawyer-founder-2026");
  assert.equal(FOUNDER_CAMPAIGN_ID, "founder-2026");
});

test("the plan id is the price book's membership entry (one source, no import edge into the book)", () => {
  const entry = PRICE_BOOK[FOUNDER_PLAN_ID];
  assert.ok(entry, "the book sells the founder plan");
  assert.equal(entry.kind, "membership");
});

test("what activation grants mirrors 20261101_10: 12 months, 6 works + 1 output, 365 library days", () => {
  assert.equal(FOUNDER_MEMBERSHIP_MONTHS, 12);
  assert.deepEqual({ ...FOUNDER_CREDITS }, { drafting_work: 6, independent_output: 1 });
  assert.equal(FOUNDER_LIBRARY_DAYS, 365);
  assert.ok(Object.isFrozen(FOUNDER_CREDITS));
});

test("the 7 eligible drafter kinds: every draft kind except rejoinder (R3, owner ٣٩٩)", () => {
  assert.deepEqual([...FOUNDER_DRAFT_KINDS], ["claim", "reply", "supplementary", "closing", "appeal", "cassation", "petition"]);
  assert.ok(!FOUNDER_DRAFT_KINDS.includes("rejoinder"));
  for (const k of FOUNDER_DRAFT_KINDS) assert.ok(DRAFT_KIND_IDS.includes(k), k);
  assert.ok(Object.isFrozen(FOUNDER_DRAFT_KINDS));
});

test("the four independent-output tools", () => {
  assert.deepEqual([...FOUNDER_OUTPUT_TOOLS], ["contracts-pro", "legal-opinion-consult", "legal-opinion-letter", "wargaming"]);
});

test("creditKindForRun: the drafter's first turn of an eligible kind spends a work", () => {
  for (const kind of FOUNDER_DRAFT_KINDS) {
    assert.equal(creditKindForRun("legal-drafter", { kind }, 0), "drafting_work", kind);
  }
});

test("creditKindForRun: the drafter's second turn never spends a second work", () => {
  assert.equal(creditKindForRun("legal-drafter", { kind: "claim" }, 1), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "appeal" }, 2), null);
});

test("creditKindForRun: rejoinder, a missing, unknown, non-string or inherited kind spends nothing", () => {
  assert.equal(creditKindForRun("legal-drafter", { kind: "rejoinder" }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", {}, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "memo" }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: 1 }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: ["claim"] }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "constructor" }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "toString" }, 0), null);
});

test("creditKindForRun: each output tool's first turn spends the independent output; a later turn nothing", () => {
  for (const tool of FOUNDER_OUTPUT_TOOLS) {
    assert.equal(creditKindForRun(tool, {}, 0), "independent_output", tool);
    assert.equal(creditKindForRun(tool, { kind: "claim" }, 0), "independent_output", tool);
    assert.equal(creditKindForRun(tool, {}, 1), null, tool);
  }
});

test("creditKindForRun: any other tool, or an inherited key as a tool, spends nothing", () => {
  for (const tool of ["quick-answer", "contract-drafter", "brief-check", "case-brief", "", "constructor", "__proto__", "Legal-Drafter"]) {
    assert.equal(creditKindForRun(tool, { kind: "claim" }, 0), null, tool);
  }
});

test("creditKindForRun: a turn that is not a whole number ≥ 0 spends nothing", () => {
  for (const turn of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(creditKindForRun("legal-drafter", { kind: "claim" }, turn), null, String(turn));
    assert.equal(creditKindForRun("contracts-pro", {}, turn), null, String(turn));
  }
});
