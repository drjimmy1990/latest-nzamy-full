/**
 * aiThinkingStage.mounts.test.ts — the ten places that show a run's live progress
 * (S2 E9, E10), and what each of them says about a legacy held run (R30).
 *
 * A file that moves keeps its mount: update the path here, never drop it (R4).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/ai/aiThinkingStage.mounts.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8").replace(/\r\n/g, "\n");

/** A page and the tool it runs. */
const MOUNTS: Record<string, string> = {
  "components/draft/steps/StepAiDraft.tsx": "legal-drafter",
  "components/contracts/steps/draft/StepGenerate.tsx": "contracts-pro",
  "app/ai/contract-drafter/page.tsx": "contract-drafter",
  "app/ai/brief-check/page.tsx": "brief-check",
  "app/ai/wargaming/page.tsx": "wargaming",
  "app/ai/analyze-strength/page.tsx": "analyze-strength",
  "components/ai/caseBrief/CaseBriefStudio.tsx": "case-brief",
  "app/ai/quick-answer/page.tsx": "quick-answer",
};

for (const [file, tool] of Object.entries(MOUNTS)) {
  test(`${file} mounts the stage for ${tool}`, () => {
    const page = src(file);
    assert.ok(page.includes("<AiThinkingStage"), "no stage");
    assert.ok(page.includes(`toolLabel={aiToolLabelAr("${tool}")}`), "the header names the tool");
  });
}

test("the consultation and the letter share one stage, in the panel both render (points 8 and 9)", () => {
  const panel = src("app/ai/legal-opinion/_components/AiOpinionPanel.tsx");
  assert.ok(panel.includes("<AiThinkingStage"));
  assert.ok(panel.includes("toolLabel={aiToolLabelAr(AI_OPINION_TOOL[kind])}"));
  assert.match(src("app/ai/legal-opinion/_components/LetterWorkflow.tsx"), /<AiOpinionPanel[\s\S]{0,80}run=\{letterRun\}/);
  assert.match(src("app/ai/legal-opinion/page.tsx"), /<AiOpinionPanel[\s\S]{0,200}run=\{/);
  assert.doesNotMatch(src("app/ai/legal-opinion/_components/LetterWorkflow.tsx"), /<AiThinkingStage/, "a second stage would show twice");
});

test("contracts pro: the page hands its run to the step that shows the stage", () => {
  assert.match(src("app/ai/contracts/page.tsx"), /<StepGenerate[\s\S]{0,200}run=\{run\}/);
});

test("the stage replaced the fixed waiting lines and fake motion it stands for", () => {
  const gone: [string, RegExp][] = [
    ["components/draft/steps/StepAiDraft.tsx", /busyText/],
    ["components/contracts/steps/draft/StepGenerate.tsx", /\{phase === "running" &&/],
    ["app/ai/contract-drafter/page.tsx", /\{run\.phase === "running" &&/],
    ["components/ai/caseBrief/CaseBriefStudio.tsx", /repeat: Infinity/],
    ["app/ai/quick-answer/page.tsx", /repeat: Infinity/],
    ["app/ai/quick-answer/page.tsx", /يبحث في مكتبة الأنظمة ثم يكتب الإجابة/],
    ["app/ai/legal-opinion/_components/AiOpinionPanel.tsx", /c\.running/],
  ];
  for (const [file, pattern] of gone) assert.doesNotMatch(src(file), pattern, file);
});

test("R30: a legacy held run reads the one sentence, with no promise of a team review", () => {
  const held = [
    "components/draft/steps/StepAiDraft.tsx",
    "components/contracts/steps/draft/StepGenerate.tsx",
    "app/ai/contract-drafter/page.tsx",
    "app/ai/brief-check/page.tsx",
    "app/ai/wargaming/page.tsx",
    "app/ai/analyze-strength/page.tsx",
    "components/ai/caseBrief/CaseBriefStudio.tsx",
    "app/ai/legal-opinion/_components/AiOpinionPanel.tsx",
  ];
  for (const file of held) {
    const page = src(file);
    assert.ok(page.includes("RUN_HELD_MESSAGE_AR"), file);
    assert.doesNotMatch(page, /تنتظر مراجعة الفريق|ينتظر مراجعة الفريق|awaits the team/, file);
  }
});

test("the three tools the section leaves out keep their own waiting UI: a stage there would show nothing real", () => {
  for (const file of ["app/ai/communicate/page.tsx", "app/ai/najiz-optimizer/page.tsx", "app/dashboard/admin/ai-usage/page.tsx"]) {
    assert.doesNotMatch(src(file), /<AiThinkingStage/, file);
  }
});
