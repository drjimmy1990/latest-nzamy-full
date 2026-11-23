/**
 * noFakeRatings.test.ts — owner ١٧٤ (ب) / ١١٥ (batch l13): a step that the
 * engine did not answer shows «لم يُحدَّد» / «بلا تصنيف» or «قيد التفعيل»,
 * never a fixed result — for every account, the admin included.
 *
 *   - a level, assessment or severity the model did not give stays null on the
 *     server (tools.ts ratingOf) and reads «لم يُحدَّد» / «بلا تصنيف» on the
 *     screen and in the exported text, instead of a made-up «متوسط»;
 *   - the canned pages behind GatedToolScreen render only in a demo build.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_TOOLS } from "./tools.ts";
import { simResultText, groupPoints, type SimResult } from "../../app/ai/wargaming/_simResult.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
/** Source with comments removed (the comments name what was removed). */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("the server never invents a rating: no «medium» / «high» fallback on a level, an assessment or a severity", () => {
  const tools = code("lib/ai/tools.ts");
  assert.doesNotMatch(tools, /oneOf\([^)]*(SEVERITIES|LEVELS|BRIEF_LEVELS|FINDING_SEVERITIES|DEVIL_SEVERITIES)[^)]*\)/);
  const brief = AI_TOOLS["brief-check"].validateOutput({ summary: "خلاصة", findings: [{ issue: "ثغرة", severity: "?" }] }, {}) as Record<string, any>;
  assert.equal(brief.findings[0].severity, null);
  const sim = AI_TOOLS.wargaming.validateOutput(
    { summary: "خلاصة", points: [{ source: "opponent", title: "ع", detail: "ت", severity: "huge" }] },
    { targets: ["opponent"] },
  ) as Record<string, any>;
  assert.equal(sim.points[0].severity, null);
});

test("the screens and the exports say «لم يُحدَّد» / «بلا تصنيف», never a default «متوسط»", () => {
  for (const [file, gone] of [
    ["app/ai/brief-check/_BriefCheckReport.tsx", ["?? SEVERITY.medium"]],
    ["app/ai/wargaming/_SimResultView.tsx", ["?? SEVERITY.medium", "?? SEVERITY_LABEL.medium"]],
    ["app/ai/wargaming/_simResult.ts", ['?? "خطر متوسط"']],
    ["app/ai/analyze-strength/page.tsx", ['?? "متوسط"', '?? "مرتفع"', "?? RISK_TONE.medium"]],
    ["app/ai/analyze-strength/_report.ts", ['?? "متوسط"', ': "medium"']],
  ] as const) {
    const body = code(file);
    for (const s of gone) assert.ok(!body.includes(s), `${file} still falls back: ${s}`);
  }
  assert.match(code("app/ai/brief-check/_BriefCheckReport.tsx"), /\|\| UNRATED;/);
  assert.match(code("app/ai/wargaming/_SimResultView.tsx"), /\|\| UNRATED;/);
  const studio = code("components/ai/caseBrief/CaseBriefStudio.tsx");
  assert.match(studio, /\|\| UNRATED_ASSESS : null;/, "a brief with no assessment is still shown, labelled «لم يُحدَّد»");
  assert.match(studio, /لم يُحدَّد في التحليل/);

  const r: SimResult = {
    summary: "خلاصة",
    points: [
      { source: "opponent", severity: null, title: "بلا", detail: "د", counter: "" },
      { source: "opponent", severity: "high", title: "عالٍ", detail: "د", counter: "" },
    ],
    plea_script: "",
    citation_check: [],
  };
  assert.deepEqual(groupPoints(r.points)[0].points.map((p) => p.title), ["عالٍ", "بلا"], "an unrated point sorts last");
  const text = simResultText(r);
  assert.match(text, /\[بلا تصنيف\] بلا/);
  assert.doesNotMatch(text, /خطر متوسط/);
});

test("GatedToolScreen: the canned page renders in a demo build only; elsewhere «قيد التفعيل», whatever BETA_REVIEW_MODE says", () => {
  const gate = code("components/GatedToolScreen.tsx");
  assert.match(gate, /import \{ isDemoMode \} from "@\/lib\/runtimeMode";/);
  assert.match(gate, /if \(isDemoMode\) return <>\{children\}<\/>;/);
  assert.match(gate, /title=\{`\$\{toolName\} — قيد التفعيل`\}/);
  assert.equal((gate.match(/<>\{children\}<\/>/g) ?? []).length, 1);
});

test("the /ai hub's guest example no longer claims to be a real conversation", () => {
  const hub = code("app/ai/page.tsx");
  assert.ok(!hub.includes("محادثة حقيقية"));
  assert.match(hub, /مثال توضيحي/);
});
