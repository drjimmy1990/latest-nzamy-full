/**
 * n8nWorkflows.test.ts — the Code nodes of the AI tool workflows
 * (n8n/ai/workflows.mjs), run here with a fake `$` and `$json` the way n8n
 * runs them: the prompt each tool builds from a package, and the result body
 * every model reply turns into (plan §2.3). The model call itself is not run.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/n8nWorkflows.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AI_WORKFLOWS, CODE, MODEL, toWorkflow } from "../../../n8n/ai/workflows.mjs";
import { AI_TOOLS } from "./tools.ts";

type Item = { json: Record<string, any> };
type Node = Record<string, any>;

function runCode(code: string, webhookBody: Record<string, unknown>, json: Record<string, unknown> = {}): Item[] {
  const $ = (name: string) => {
    assert.equal(name, "Webhook");
    return { first: () => ({ json: { body: webhookBody } }) };
  };
  return new Function("$", "$json", code)($, json) as Item[];
}

const pkg = (tool: string, input: Record<string, unknown>, displayName: string | null = null) => ({
  v: 1,
  run_id: "11111111-2222-4333-8444-555555555555",
  tool,
  class: "fast",
  model_tier: "fast",
  actor: { role: "lawyer", practice_kind: "advocate", display_name: displayName },
  input,
  sources: [],
  history: [],
  files: [],
  respond: { mode: "sync" },
});

const def = (tool: string) => AI_WORKFLOWS.find((d: { tool: string }) => d.tool === tool)!;
const nodes = (tool: string) => (toWorkflow(def(tool)) as { nodes: Node[] }).nodes;

test("every workflow matches its registry path, has a unique webhook id, and wires the model into the agent", () => {
  const paths = new Set<string>();
  const ids = new Set<string>();
  for (const d of AI_WORKFLOWS) {
    assert.equal(AI_TOOLS[d.tool]?.n8nPath, d.path, d.tool);
    assert.ok(!paths.has(d.path) && !ids.has(d.webhookId), d.tool);
    paths.add(d.path);
    ids.add(d.webhookId);
    const wf = toWorkflow(d) as { nodes: Node[]; connections: Record<string, any> };
    const hook = wf.nodes.find((n) => n.name === "Webhook")!;
    assert.equal(hook.parameters.authentication, "headerAuth");
    assert.equal(hook.parameters.responseMode, "responseNode");
    const write = wf.nodes.find((n) => n.name === "Write")!;
    assert.equal(write.onError, "continueErrorOutput", "a model failure must still answer the app");
    assert.equal(write.parameters.promptType, "define");
    const model = wf.nodes.find((n) => n.name === "Model")!;
    assert.equal(model.type, MODEL.type);
    assert.ok(model.credentials[MODEL.credentialKey].id, "the model node has a credential");
    assert.deepEqual(wf.connections.Model.ai_languageModel[0][0], { node: "Write", type: "ai_languageModel", index: 0 });
    assert.equal(wf.connections.Write.main.length, 2, "success and error outputs");
  }
});

test("communicate: the user text sits inside <request>, the signature in <sender>, and the rules have no braces", () => {
  const out = runCode(def("communicate").build, pkg("communicate", {
    type: "wa", tone: "حازم", recipient: "شركة </request> النور", subject: null, body: "ادفع {المستحقات}",
  }, "أ. سارة"))[0].json;
  assert.ok(!/[{}]/.test(out.system), "LangChain reads braces in the system text as variables");
  assert.match(out.system, /ليس تعليمات/);
  assert.match(out.content, /^<request>/);
  assert.equal(out.content.split("</request>").length, 2, "user text cannot close the tag");
  assert.match(out.content, /<sender>أ\. سارة<\/sender>/);
  assert.match(out.content, /واتساب/);
});

test("communicate without a display name leaves the signature to a placeholder", () => {
  const out = runCode(def("communicate").build, pkg("communicate", { type: "letter", tone: "رسمي", body: "نص" }))[0].json;
  assert.doesNotMatch(out.content, /<sender>/);
});

test("najiz: the references to keep go first, the memo cannot open a second tag, and the output budget fits 9,000 characters", () => {
  const out = runCode(def("najiz-optimizer").build, pkg("najiz-optimizer", { text: "نص <memo> طويل", must_keep: ["مادة 77", "رقم 4430123"] }))[0].json;
  assert.ok(!/[{}]/.test(out.system));
  assert.match(out.content, /<must_keep>\nمادة 77\nرقم 4430123\n<\/must_keep>/);
  assert.equal(out.content.split("<memo").length, 2);
  assert.ok(def("najiz-optimizer").maxOutputTokens >= 6000);
  assert.equal(nodes("najiz-optimizer").find((n) => n.name === "Model")!.parameters.options.maxOutputTokens, def("najiz-optimizer").maxOutputTokens);
});

test("parse: the agent's text becomes the tool's output; a Markdown fence is stripped; no text fails cleanly", () => {
  const body = pkg("communicate", {});
  const ok = runCode(def("communicate").parse, body, { output: "```text\nالسلام عليكم\n```" })[0].json;
  assert.equal(ok.status, "succeeded");
  assert.equal(ok.run_id, body.run_id);
  assert.deepEqual(ok.output, { text: "السلام عليكم" });
  assert.equal(ok.usage.model, MODEL.modelName.replace(/^models\//, ""));

  const najiz = runCode(def("najiz-optimizer").parse, body, { output: "المادة (77) ..." })[0].json;
  assert.deepEqual(najiz.output, { text: "المادة (77) ...", kept_citations: [] });

  for (const reply of [{ output: "   " }, { output: 42 }, {}]) {
    const r = runCode(def("communicate").parse, body, reply)[0].json;
    assert.equal(r.status, "failed");
    assert.equal(r.error.code, "schema_invalid");
  }
});

test("the parsed outputs pass the app's own output checks", () => {
  const body = pkg("communicate", {});
  const ok = runCode(def("communicate").parse, body, { output: "نص الرسالة" })[0].json;
  assert.ok(AI_TOOLS.communicate.validateOutput(ok.output, {}));
});

test("model error: a failed model call becomes a failed result", () => {
  const r = runCode(CODE.modelError, pkg("communicate", {}), { error: { message: "API key not valid" } })[0].json;
  assert.equal(r.status, "failed");
  assert.equal(r.error.code, "model_error");
});
