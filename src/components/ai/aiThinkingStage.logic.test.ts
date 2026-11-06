/**
 * aiThinkingStage.logic.test.ts — what the waiting stage shows: only what the run
 * reported, and a real clock.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/ai/aiThinkingStage.logic.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  currentStepLabel,
  formatElapsed,
  groupProgress,
  stageHeader,
  stillRunningLinks,
  STAGE_NO_EVENTS_AR,
  STAGE_START_LABEL_AR,
} from "./aiThinkingStage.logic.ts";

test("groupProgress: laws and principles are the retrieved texts", () => {
  assert.deepEqual(groupProgress([{ kind: "file", label: "a" }, { kind: "law", label: "b" }, { kind: "principle", label: "c" }]).sources, ["b", "c"]);
});

test("groupProgress: each kind in its group, an unknown kind nowhere, a repeated label once", () => {
  assert.deepEqual(
    groupProgress([
      { kind: "file", label: "a.pdf" },
      { kind: "query", label: "فسخ" },
      { kind: "query", label: "فسخ" },
      { kind: "verify", label: "تحقق من ٣" },
      { kind: "note", label: "يقرأ 2 ملف" },
      { kind: "step", label: "يكتب الناتج" },
      { kind: "hacked", label: "لا يظهر" },
    ]),
    { files: ["a.pdf"], queries: ["فسخ"], sources: [], verify: ["تحقق من ٣"], notes: ["يقرأ 2 ملف", "يكتب الناتج"] },
  );
  assert.deepEqual(groupProgress([]), { files: [], queries: [], sources: [], verify: [], notes: [] });
});

test("formatElapsed: m:ss in Arabic digits, from real milliseconds", () => {
  assert.equal(formatElapsed(65_000), "١:٠٥");
  assert.equal(formatElapsed(0), "٠:٠٠");
  assert.equal(formatElapsed(999), "٠:٠٠");
  assert.equal(formatElapsed(20 * 60 * 1000), "٢٠:٠٠");
  assert.equal(formatElapsed(-5000), "٠:٠٠", "a clock that moved back never shows a negative time");
});

test("currentStepLabel: n8n's step, else the last stage the run reported, else the start", () => {
  assert.equal(currentStepLabel("drafting", []), "يكتب الناتج");
  assert.equal(currentStepLabel("reading", [{ kind: "step", label: "أُرسل الطلب إلى المحرّك" }]), "يقرأ المستندات");
  assert.equal(currentStepLabel(null, [{ kind: "step", label: "أُرسل الطلب إلى المحرّك" }, { kind: "query", label: "س" }]), "أُرسل الطلب إلى المحرّك");
  assert.equal(currentStepLabel(null, [{ kind: "query", label: "س" }]), STAGE_START_LABEL_AR);
  assert.equal(currentStepLabel(null, []), "بدأ التشغيل");
  assert.equal(currentStepLabel("constructor", []), "بدأ التشغيل", "a strange step is not looked up on the prototype");
});

test("stageHeader names the tool when it is known", () => {
  assert.equal(stageHeader("المحاكي الشامل"), "يعمل الآن على: المحاكي الشامل");
  assert.equal(stageHeader(undefined), "يعمل الآن");
});

test("the no-events line invents no stage, time or percentage", () => {
  assert.doesNotMatch(STAGE_NO_EVENTS_AR, /[%٪\d٠-٩]|دقيقة|ثانية/);
});

test("stillRunningLinks: the run page for everyone; the activity log only where it holds AI runs", () => {
  const id = "0b6d0c4e-1111-4222-8333-444455556666";
  assert.deepEqual(stillRunningLinks(id, "lawyer").map((l) => l.href), [`/ai/runs/${id}`, "/dashboard/lawyer/activity"]);
  for (const type of ["firm", "individual", "corporate", "admin", null]) {
    assert.deepEqual(stillRunningLinks(id, type).map((l) => l.href), [`/ai/runs/${id}`], String(type));
  }
});

test("the stage component: a real clock that it clears, no fake progress, no invisible text", () => {
  const src = readFileSync(join(process.cwd(), "src", "components", "ai", "AiThinkingStage.tsx"), "utf8");
  assert.match(src, /aria-live="polite"/);
  assert.match(src, /motion-safe:/);
  assert.match(src, /clearInterval\(/);
  assert.match(src, /useState<number \| null>\(null\)/, "the clock starts empty, so SSR renders no time");
  assert.doesNotMatch(src, /text-gray-(100|200)/);
  assert.doesNotMatch(src, /Math\.random|setTimeout|%\}|width: `|new Date\(/);
  assert.doesNotMatch(src.split("useEffect(")[0].split("export function AiThinkingStage")[1] ?? "", /Date\.now\(\)/, "nothing reads the clock while rendering");
});
