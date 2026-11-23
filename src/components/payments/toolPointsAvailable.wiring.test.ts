/**
 * toolPointsAvailable.wiring.test.ts — owner ١٦٥ (batch l13): every screen that
 * shows a paid AI tool's price before the run shows «المتاح لهذه العملية»
 * beside it (ToolPointsAvailable), for the tool the run is charged under; and
 * the component reads only the server's figure.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/payments/toolPointsAvailable.wiring.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const IMPORT = 'import ToolPointsAvailable from "@/components/payments/ToolPointsAvailable";';

// [file, the tool attribute as written]
const SCREENS: Array<[string, string]> = [
  ["app/ai/quick-answer/page.tsx", 'tool="quick-answer"'],
  ["app/ai/analyze-strength/page.tsx", 'tool="analyze-strength"'],
  ["app/ai/assistant/page.tsx", 'tool="assistant"'],
  ["app/ai/brief-check/page.tsx", 'tool="brief-check"'],
  ["app/ai/najiz-optimizer/page.tsx", 'tool="najiz-optimizer"'],
  ["app/ai/wargaming/page.tsx", 'tool="wargaming"'],
  ["app/ai/simple-contract/_components/SimpleContractTool.tsx", 'tool="simple-contract"'],
  ["app/ai/communicate/page.tsx", 'tool="communicate"'],
  ["app/laws/components/AiTabContent.tsx", "tool={TOOL}"],
  ["app/laws/research/_components/ResearchStudio.tsx", "tool={TOOL}"],
  ["components/draft/steps/StepAiDraft.tsx", 'tool="legal-drafter"'],
  ["components/ai/caseBrief/CaseBriefStudio.tsx", 'tool="case-brief"'],
  ["app/ai/legal-opinion/_components/AiOpinionPanel.tsx", "tool={AI_OPINION_TOOL[kind]}"],
  ["components/contracts/steps/draft/StepGenerate.tsx", 'tool="contracts-pro"'],
];

test("every priced pre-run screen shows the points available for its tool", () => {
  for (const [file, tool] of SCREENS) {
    const code = read(file);
    assert.ok(code.includes(IMPORT), `${file}: imports ToolPointsAvailable`);
    assert.match(code, new RegExp(`<ToolPointsAvailable ${tool.replace(/[[\]{}]/g, "\\$&")} price=\\{`), `${file}: ${tool} with its price`);
  }
});

test("the two library screens price the library assistant (its points count only there)", () => {
  for (const file of ["app/laws/components/AiTabContent.tsx", "app/laws/research/_components/ResearchStudio.tsx"]) {
    assert.match(read(file), /const TOOL = "library-assistant";/, file);
  }
});

test("the component shows the server's figure only (points-standing → parseToolPointsAnswer → toolPointsView)", () => {
  const c = read("components/payments/ToolPointsAvailable.tsx");
  assert.match(c, /fetch\(`\/api\/v1\/ai\/points-standing\?tool=\$\{encodeURIComponent\(tool\)\}`, \{ cache: "no-store" \}\)/);
  assert.match(c, /setAnswer\(parseToolPointsAnswer\(j\)\)/);
  assert.match(c, /if \(!view\) return null;/);
  assert.doesNotMatch(c, /localStorage|user_metadata|credit_balance/);
});

test("the q296 tools (price not shown before they are live) never ask", () => {
  for (const file of ["app/ai/contract-negotiator/page.tsx"]) {
    assert.doesNotMatch(read(file), /ToolPointsAvailable/, file);
  }
});
