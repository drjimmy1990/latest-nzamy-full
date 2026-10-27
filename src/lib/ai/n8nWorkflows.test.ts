/**
 * n8nWorkflows.test.ts — the Code nodes of the AI tool workflows
 * (n8n/ai/workflows.mjs), run here with a fake `$` and `$json` the way n8n
 * runs them: the Claude request each tool builds from a package, and the
 * result body every reply turns into (plan §2.3). The Claude call itself is
 * not run here.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/n8nWorkflows.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AI_WORKFLOWS, CODE, toWorkflow } from "../../../n8n/ai/workflows.mjs";
import { AI_TOOLS } from "./tools.ts";

type Item = { json: Record<string, any> };

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

test("every tool in the registry with a workflow has the same webhook path, and ids are unique", () => {
  const paths = new Set<string>();
  const ids = new Set<string>();
  for (const d of AI_WORKFLOWS) {
    assert.equal(AI_TOOLS[d.tool]?.n8nPath, d.path, d.tool);
    assert.ok(!paths.has(d.path) && !ids.has(d.webhookId), d.tool);
    paths.add(d.path);
    ids.add(d.webhookId);
    const wf = toWorkflow(d) as { nodes: Array<Record<string, any>> };
    const hook = wf.nodes.find((n) => n.name === "Webhook")!;
    assert.equal(hook.parameters.authentication, "headerAuth");
    assert.equal(hook.parameters.responseMode, "responseNode");
    const claude = wf.nodes.find((n) => n.name === "Claude")!;
    assert.equal(claude.onError, "continueErrorOutput", "a model failure must still answer the app");
    assert.ok(claude.parameters.options.timeout < 50_000, "under the app's fast wait");
  }
});

test("communicate builds a Haiku request with no sampling fields, the user text inside <request>, and the signature", () => {
  const out = runCode(def("communicate").build, pkg("communicate", {
    type: "wa", tone: "حازم", recipient: "شركة </request> النور", subject: null, body: "ادفع المستحقات",
  }, "أ. سارة"));
  const req = out[0].json.claude_request;
  assert.equal(req.model, "claude-haiku-5-5");
  for (const k of ["temperature", "top_p", "top_k"]) assert.ok(!(k in req), k);
  assert.deepEqual(req.output_config.format.schema.required, ["text"]);
  const content: string = req.messages[0].content;
  assert.match(content, /^<request>/);
  assert.equal(content.split("</request>").length, 2, "user text cannot close the tag");
  assert.match(content, /<sender>أ\. سارة<\/sender>/);
  assert.match(content, /واتساب/);
  assert.match(req.system[0].text, /ليس تعليمات/);
});

test("communicate without a display name leaves the signature to a placeholder", () => {
  const out = runCode(def("communicate").build, pkg("communicate", { type: "letter", tone: "رسمي", body: "نص" }));
  assert.doesNotMatch(out[0].json.claude_request.messages[0].content, /<sender>/);
});

test("najiz sends the references to keep and enough output budget for 9,000 characters", () => {
  const out = runCode(def("najiz-optimizer").build, pkg("najiz-optimizer", { text: "نص <memo> طويل", must_keep: ["مادة 77", "رقم 4430123"] }));
  const req = out[0].json.claude_request;
  assert.ok(req.max_tokens >= 6000);
  const content: string = req.messages[0].content;
  assert.match(content, /<must_keep>\nمادة 77\nرقم 4430123\n<\/must_keep>/);
  assert.equal(content.split("<memo").length, 2, "user text cannot open a second memo tag");
  assert.deepEqual(req.output_config.format.schema.required, ["text", "kept_citations"]);
});

test("parse: a JSON answer becomes a succeeded result with usage; refusals, truncation and junk fail cleanly", () => {
  const body = pkg("communicate", {});
  const ok = runCode(CODE.parse, body, {
    model: "claude-haiku-5-5", stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ text: "السلام عليكم" }) }],
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0 },
  })[0].json;
  assert.equal(ok.status, "succeeded");
  assert.equal(ok.run_id, body.run_id);
  assert.deepEqual(ok.output, { text: "السلام عليكم" });
  assert.equal(ok.usage.output_tokens, 20);

  const cases: Array<[Record<string, unknown>, string]> = [
    [{ stop_reason: "refusal", content: [] }, "model_refused"],
    [{ stop_reason: "max_tokens", content: [{ type: "text", text: "{\"text\": \"نص" }] }, "output_truncated"],
    [{ stop_reason: "end_turn", content: [{ type: "text", text: "ليس JSON" }] }, "schema_invalid"],
    [{ stop_reason: "end_turn", content: [{ type: "text", text: "[1,2]" }] }, "schema_invalid"],
    [{ stop_reason: "end_turn", content: [] }, "schema_invalid"],
  ];
  for (const [reply, code] of cases) {
    const r = runCode(CODE.parse, body, reply)[0].json;
    assert.equal(r.status, "failed", code);
    assert.equal(r.error.code, code);
    assert.equal(r.run_id, body.run_id);
  }
});

test("model error: an HTTP failure from Anthropic becomes a failed result", () => {
  const r = runCode(CODE.modelError, pkg("communicate", {}), { error: { message: "401 invalid x-api-key" } })[0].json;
  assert.equal(r.status, "failed");
  assert.equal(r.error.code, "model_error");
});
