/**
 * contractNegotiatorRun.test.ts — what /ai/contract-negotiator sends, what it reads back.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/contracts/contractNegotiatorRun.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AI_TOOLS, NEGOTIATOR_CLAUSES_MAX } from "../../lib/ai/tools.ts";
import { asNegotiation, contractNegotiatorInput, negotiationText, negotiatorFormProblem, type NegotiatorForm } from "./contractNegotiatorRun.ts";

const TEXT = "يلتزم المستأجر بدفع غرامة عن كل يوم تأخير بلا سقف";
const form = (over: Partial<NegotiatorForm> = {}): NegotiatorForm => ({
  ourParty: " المستأجر ",
  contractType: "",
  clauses: [{ text: `  ${TEXT} `, theirDemand: " ", ourGoal: "سقف للغرامة" }],
  ...over,
});
const alternative = (stance: string) => ({ stance, text: `صياغة ${stance}`, rationale: `سبب ${stance}` });
const stored = (over: Record<string, unknown> = {}) => ({
  summary: "بند واحد للتفاوض",
  clauses: [{ index: 0, issue: "الغرامة بلا سقف", risk: "high", alternatives: [alternative("firm"), alternative("balanced"), alternative("flexible")], fallback: "سقف بقيمة شهر" }],
  citation_check: [{ cited: "المادة ٨٠", law: "نظام العمل", article: 80, status: "not_found" }],
  ...over,
});

test("the input the form sends is the input the run accepts", () => {
  const input = contractNegotiatorInput(form());
  assert.deepEqual(input, { our_party: "المستأجر", contract_type: null, clauses: [{ text: TEXT, their_demand: null, our_goal: "سقف للغرامة" }] });
  assert.deepEqual(AI_TOOLS["contract-negotiator"].validateInput(input), { ok: true, input });
});

test("the form names what stops it, so the button never promises a run the server refuses", () => {
  assert.equal(negotiatorFormProblem(form()), null);
  assert.match(negotiatorFormProblem(form({ ourParty: "  " }))!, /الطرف/);
  assert.match(negotiatorFormProblem(form({ clauses: [] }))!, /بنداً واحداً/);
  assert.match(negotiatorFormProblem(form({ clauses: [{ text: "قصير", theirDemand: "", ourGoal: "" }] }))!, /البند ١/);
  assert.match(negotiatorFormProblem(form({ clauses: [{ text: TEXT, theirDemand: "", ourGoal: "" }, { text: "x".repeat(4001), theirDemand: "", ourGoal: "" }] }))!, /البند ٢/);
  assert.match(negotiatorFormProblem(form({ clauses: [{ text: TEXT, theirDemand: "x".repeat(1501), ourGoal: "" }] }))!, /البند ١/);
  assert.match(negotiatorFormProblem(form({ clauses: [{ text: TEXT, theirDemand: "", ourGoal: "x".repeat(1501) }] }))!, /البند ١/);
  const eleven = Array.from({ length: NEGOTIATOR_CLAUSES_MAX + 1 }, () => ({ text: TEXT, theirDemand: "", ourGoal: "" }));
  assert.match(negotiatorFormProblem(form({ clauses: eleven }))!, /حتى ١٠/);

  // Whatever the form lets through, the run accepts.
  assert.equal(AI_TOOLS["contract-negotiator"].validateInput(contractNegotiatorInput(form({ clauses: [{ text: "x".repeat(20), theirDemand: "", ourGoal: "" }] }))).ok, true);
});

test("the stored result is read with the library's verdict; a broken one is not a result", () => {
  const n = asNegotiation(stored())!;
  assert.equal(n.clauses[0].alternatives.length, 3);
  assert.equal(n.citation_check[0].status, "not_found");
  for (const bad of [null, {}, stored({ summary: 7 }), stored({ clauses: [] }), stored({ clauses: "نص" }), stored({ clauses: [{ index: 0, risk: "severe", alternatives: [] }] })]) {
    assert.equal(asNegotiation(bad as never), null);
  }
  assert.deepEqual(asNegotiation(stored({ citation_check: undefined }))!.citation_check, []);
});

test("the copied text has each stance by name, the fallback and the library's verdict, and no percentage", () => {
  const text = negotiationText(asNegotiation(stored())!);
  for (const part of ["حازم", "متوازن", "مرن", "صياغة firm", "سبب flexible", "سقف بقيمة شهر", "الغرامة بلا سقف", "المادة ٨٠", "غير موجودة في المكتبة", "مرتفعة"]) {
    assert.ok(text.includes(part), part);
  }
  assert.doesNotMatch(text, /[%٪]/);
});
