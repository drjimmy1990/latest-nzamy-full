/**
 * Q481 / P1-26 — the assistant's two answer modes, and P1-27 — the «يفكّر…»
 * stage on the four routes that lacked it.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/assistantModes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_WORKFLOWS } from "../../../n8n/ai/workflows.mjs";
import { AI_TOOLS, ASSISTANT_MODES } from "./tools.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("mode: absent or direct → today's input exactly; grill is carried; anything else is refused", () => {
  const v = AI_TOOLS.assistant.validateInput!;
  assert.deepEqual([...ASSISTANT_MODES], ["direct", "grill"]);
  assert.deepEqual(v({ message: "سؤال" }), { ok: true, input: { context: "general", message: "سؤال" } });
  assert.deepEqual(v({ message: "سؤال", mode: "direct" }), { ok: true, input: { context: "general", message: "سؤال" } });
  assert.deepEqual(v({ message: "سؤال", mode: "grill", context: "case" }), { ok: true, input: { context: "case", message: "سؤال", mode: "grill" } });
  assert.equal(v({ message: "سؤال", mode: "other" }).ok, false);
  assert.equal(v({ message: "سؤال", mode: 1 }).ok, false);
  // A grill turn is still a library answer: no citationsOptional escape.
  assert.equal(AI_TOOLS.assistant.citationsOptional, undefined);
});

type Item = { json: Record<string, string> };
function build(input: Record<string, unknown>, history: unknown[] = []): Item[] {
  const def = AI_WORKFLOWS.find((d: { tool: string }) => d.tool === "assistant") as unknown as { build: string };
  const body = { input, sources: [], history };
  const $ = () => ({ first: () => ({ json: { body } }) });
  return new Function("$", "$json", def.build)($, {}) as Item[];
}

test("the n8n prompt (file only): grill adds the questions-first rules; direct is unchanged", () => {
  const direct = build({ message: "س", context: "general" })[0].json.system;
  const grill = build({ message: "س", context: "general", mode: "grill" })[0].json.system;
  assert.ok(!direct.includes("استجوبني"));
  assert.ok(grill.startsWith(direct));
  assert.ok(grill.includes("استجوبني") && grill.includes("[S1]"));
  assert.ok(read("n8n/ai/assistant.json").includes("استجوبني"), "the import file was re-exported");
});

test("the page sends the mode and offers the two choices", () => {
  assert.ok(read("src/app/ai/assistant/_assistant-client.ts").includes(`...(input.mode === "grill" ? { mode: "grill" } : {})`));
  const page = read("src/app/ai/assistant/page.tsx");
  assert.ok(page.includes("مباشر") && page.includes("استجوبني"));
  // T17a (batch l11): the case id follows the mode in the same call.
  assert.ok(page.includes("userType, mode, caseId:"));
});

test("P1-27: the three routes mount the stage with their tool's label", () => {
  // The /laws researcher tab moved to the V3 four-stage card (owner file 11
  // item 6): src/app/laws/research/_components/research.test.ts pins it.
  assert.ok(read("src/app/laws/research/_components/ResearchTurn.tsx").includes("<ResearchStageCard events={turn.events}"));
  const mounts: [string, string][] = [
    ["src/app/ai/assistant/page.tsx", `aiToolLabelAr("assistant")`],
    ["src/app/ai/najiz-optimizer/page.tsx", `aiToolLabelAr("najiz-optimizer")`],
    ["src/app/ai/communicate/page.tsx", `aiToolLabelAr("communicate")`],
  ];
  for (const [file, label] of mounts) {
    const src = read(file);
    assert.ok(src.includes("<AiThinkingStage"), file);
    assert.ok(src.includes(`toolLabel={${label}}`), file);
  }
  assert.ok(!read("src/app/ai/communicate/page.tsx").includes("repeat: Infinity"), "the fake spinner is gone");
});
