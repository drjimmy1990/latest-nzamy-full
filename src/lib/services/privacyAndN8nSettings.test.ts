/**
 * Wave 1 safety, task 7.
 *
 * Privacy: the policy no longer says we train AI models on user data; it says
 * we never train any AI model on case files (owner patch 2026-11-01, with
 * «عامة أو خارجية» dropped so "internal" models are covered too). No
 * zero-data-retention claim: ai_runs keeps AI inputs and outputs for 90 days.
 *
 * n8n: successful executions carry the client's text and files, so no workflow
 * in the repo keeps them (`saveDataSuccessExecution: "none"`). Checked on the
 * import files and on the generator they come from (n8n/ai/workflows.mjs).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { AI_WORKFLOWS, toWorkflow } from "../../../n8n/ai/workflows.mjs";

const root = new URL("../../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

test("privacy: no AI-training-on-user-data claim; the ban covers any model", () => {
  const text = read("src/app/privacy/page.tsx");
  assert.doesNotMatch(text, /تدريب نماذج الذكاء الاصطناعي على بيانات/);
  assert.doesNotMatch(text, /Training AI models on anonymized data/i);
  assert.match(text, /لا نستخدم ملفات القضايا أو الضبوط أو المستندات القانونية الخاصة بمستخدمينا لتدريب أي نماذج ذكاء اصطناعي تحت أي ظرف/);
  assert.match(text, /We never use your case files, hearing minutes, or legal documents to train any AI models under any circumstances/);
  assert.doesNotMatch(text, /عامة أو خارجية/);
  assert.doesNotMatch(text, /general or third-party/i);
  assert.doesNotMatch(text, /Zero[- ]?Data[- ]?Retention|عدم الاحتفاظ بالبيانات/i);
});

test("n8n: no workflow JSON in the repo saves successful executions", () => {
  const files = ["n8n/ai/", "n8n/workflows/"].flatMap((dir) =>
    readdirSync(new URL(dir, root))
      .filter((name) => name.endsWith(".json"))
      .map((name) => dir + name),
  );
  assert.ok(files.length >= 23, `expected at least 23 workflow JSONs, found ${files.length}`);
  for (const file of files) {
    const wf = JSON.parse(read(file)) as { settings?: Record<string, unknown> };
    assert.equal(wf.settings?.saveDataSuccessExecution, "none", `${file}: saveDataSuccessExecution`);
  }
});

test("n8n: the AI workflow generator never saves successful executions", () => {
  assert.ok(AI_WORKFLOWS.length > 0);
  for (const def of AI_WORKFLOWS) {
    const wf = toWorkflow(def) as { settings: Record<string, unknown> };
    assert.equal(wf.settings.saveDataSuccessExecution, "none", def.tool);
  }
});
