/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/sayeghV2.test.ts
 * sayegh-v2 (owner decision 21 Nov 2026): its own registry tool, staff-only until opened.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AI_TOOLS } from "./tools.ts";

const spec = AI_TOOLS["sayegh-v2"];
const facts = "وقائع القضية ".repeat(10);
const base = { kind: "appeal", client_role: "plaintiff", facts };

test("registry: staff mode, own n8n path, priced like legal-drafter's kinds, legal-drafter untouched", () => {
  assert.equal(spec.defaultMode, "staff");
  assert.equal(spec.n8nPath, "nzamy-ai/legal-drafter-v2");
  assert.equal(spec.consultantBlocked, true);
  assert.equal(spec.price({ kind: "appeal" }, { pages: null }), 800);
  assert.equal(AI_TOOLS["legal-drafter"].n8nPath, "nzamy-ai/legal-drafter");
});

test("input: the full pipeline sends no stages; draft sends stages [] ; defaults to fail on error", () => {
  const full = spec.validateInput({ ...base });
  assert.ok(full.ok);
  if (full.ok) {
    assert.equal(full.input.pipeline, "v2");
    assert.equal(full.input.on_stage_error, "fail");
    assert.ok(!("stages" in full.input));
  }
  const d = spec.validateInput({ ...base, stage: "draft", on_stage_error: "skip" });
  assert.ok(d.ok);
  if (d.ok) assert.deepEqual([d.input.stages, d.input.on_stage_error], [[], "skip"]);
});

test("input: what n8n cannot do is refused, never faked", () => {
  for (const extra of [{ stage: "extraction" }, { stage: "intake" }, { dossier_id: "x" }, { parent_run_id: "x" }, { on_stage_error: "retry" }]) {
    assert.equal(spec.validateInput({ ...base, ...extra }).ok, false, JSON.stringify(extra));
  }
  assert.equal(spec.validateInput({ ...base, facts: "قصير" }).ok, false);
  assert.equal(spec.validateInput({ ...base, kind: "nope" }).ok, false);
  assert.equal(spec.validateInput({ ...base, client_role: "مدعي" }).ok, false);
  assert.equal(spec.validateInput(null).ok, false);
});

const memo = { title: "لائحة", sections: [{ heading: "أ", body: "نص" }, { heading: "ب", body: "نص" }], requests: ["طلب"], cited: [] };

test("output: memo, lawyer report and najiz copy stay separate; unknown fields are dropped", () => {
  const out = spec.validateOutput!({ ...memo, lawyer_notes: { adversary: { verdict: "x" } }, najiz: { text: "ناجز", chars: 4, over_limit: false }, secret: "no" }, {})!;
  assert.deepEqual(out.lawyer_notes, { adversary: { verdict: "x" } });
  assert.deepEqual(out.najiz, { text: "ناجز", chars: 4, over_limit: false });
  assert.ok(!("secret" in out));
  assert.ok(!JSON.stringify(out.sections).includes("verdict"));
  assert.equal(spec.validateOutput!({ ...memo, sections: [] }, {}), null);
  assert.equal(spec.validateOutput!("x", {}), null);
});
