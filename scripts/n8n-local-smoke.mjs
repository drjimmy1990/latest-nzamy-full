#!/usr/bin/env node
/**
 * n8n-local-smoke.mjs — sends ONE test package, with invented facts only, to the
 * local «legal-drafter-v2 (staging)» workflow and prints what comes back.
 * Guide: docs/n8n-legal-drafter-v2-local-test.md.
 *
 * It plays the app's part: it POSTs the package to the webhook, then listens on
 * a local port for what n8n sends to respond.callback_url (the progress notes
 * and, last, the result). It never reads or prints a key's value, and it sends
 * to localhost only (a non-local N8N_LOCAL_URL is refused).
 *
 *   $env:NZAMY_LOCAL_KEY = "<the value of the Header Auth credential>"
 *   node scripts/n8n-local-smoke.mjs --phase issues
 *   node scripts/n8n-local-smoke.mjs --phase draft --fake-prompts
 *   node scripts/n8n-local-smoke.mjs --phase section --json
 *
 * Flags
 *   --phase issues|draft|section   (default: issues)
 *   --kind claim|reply|appeal|…    pleading kind (default: appeal)
 *   --stages extraction,refine     only these post-draft stages (draft only)
 *   --on-error skip                a failed later stage is skipped, not fatal
 *   --fake-prompts                 send short prompts marked FAKE for every stage
 *                                  (proves body.prompts); default: send none, so
 *                                  the workflow's TEMP stand-ins run
 *   --model gemini-…               one model id for every stage (body.models)
 *   --models write=…,refine=…      a model id per stage
 *   --test-url                     use /webhook-test/ (n8n's "Listen for test
 *                                  event" button) instead of /webhook/
 *   --port 8787                    the local callback port
 *   --wait 900                     seconds to wait for the result
 *   --json                         print the whole result (default: a summary)
 *   --write-body file.json         only write the package to a file (UTF-8, for
 *                                  curl.exe --data-binary @file.json); sends nothing
 *   --listen                       only listen on --port and print every callback
 *                                  (the result of a curl you ran yourself)
 *
 * Env: NZAMY_LOCAL_KEY (required), N8N_LOCAL_URL (default http://localhost:5678)
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    phase: { type: "string", default: "issues" },
    kind: { type: "string", default: "appeal" },
    stages: { type: "string" },
    "on-error": { type: "string" },
    "fake-prompts": { type: "boolean", default: false },
    model: { type: "string" },
    models: { type: "string" },
    "test-url": { type: "boolean", default: false },
    port: { type: "string", default: "8787" },
    wait: { type: "string", default: "900" },
    json: { type: "boolean", default: false },
    "write-body": { type: "string" },
    listen: { type: "boolean", default: false },
  },
});

const PATH = "nzamy-ai/legal-drafter-v2";
const base = (process.env.N8N_LOCAL_URL || "http://localhost:5678").replace(/\/+$/, "");
const key = process.env.NZAMY_LOCAL_KEY || "";
const die = (m) => { console.error("✗ " + m); process.exit(2); };

let host;
try { host = new URL(base).hostname; } catch { die("N8N_LOCAL_URL is not a URL"); }
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) die("refused: this script sends to localhost only (got " + host + ")");
if (!key && !a.listen && !a["write-body"]) die("set NZAMY_LOCAL_KEY to the value you gave the «NZAMY AI · inbound» credential");
if (!["issues", "draft", "section"].includes(a.phase)) die("--phase must be issues, draft or section");
const port = Number(a.port);
const waitMs = Number(a.wait) * 1000;
if (!Number.isInteger(port) || port < 1024 || port > 65535) die("--port must be 1024–65535");
if (!(waitMs > 0)) die("--wait must be a positive number of seconds");

// ── the invented case ───────────────────────────────────────────────────────
// Everything below is made up for the test: names, facts, and the two «laws».
const SOURCES = [
  { sid: "S1", kind: "law", title: "نظام الاختبار المحلي (وهمي) — المادة 1", text: "تُرفع الدعوى بصحيفة تودع لدى المحكمة المختصة، وتشتمل على بيانات الخصوم والوقائع والطلبات." },
  { sid: "S2", kind: "law", title: "نظام الاختبار المحلي (وهمي) — المادة 2", text: "على من يدّعي واقعة أن يقيم الدليل عليها، وللخصم أن ينفيها بدليل أقوى." },
];
const FACTS = "وقائع وهمية للاختبار: أبرم فلان (المدعي) مع علان (المدعى عليه) عقد توريد بقيمة [....] ريال، وتأخر علان في التسليم عشرة أيام دون عذر، وراسله فلان مرتين دون رد.";
const REQUESTS = ["إلزام المدعى عليه بتنفيذ العقد", "تحميل المدعى عليه الرسوم"];
const ISSUES = [
  { title: "التأخر في التسليم", detail: "هل يُعدّ التأخر إخلالاً يستوجب التعويض؟" },
  { title: "إثبات المراسلات", detail: "هل تكفي المراسلتان لإثبات الإعذار؟" },
];
const DEFENSES = [
  { title: "الإخلال بالتسليم", basis: "المادة 1 [S1]", issue: 1 },
  { title: "عبء الإثبات على المدعى عليه", basis: "المادة 2 [S2]", issue: 2 },
];
const common = { kind: a.kind, client_role: "plaintiff", branch: "تجاري", plaintiff_name: "فلان (وهمي)", defendant_name: "علان (وهمي)" };
const INPUT = {
  issues: { ...common, phase: "issues", facts: FACTS, requests: REQUESTS },
  draft: { ...common, phase: "draft", facts: FACTS, issues: ISSUES, defenses: DEFENSES, requests: REQUESTS,
    ...(a.stages ? { stages: a.stages.split(",").map((s) => s.trim()).filter(Boolean) } : {}),
    ...(a["on-error"] === "skip" ? { on_stage_error: "skip" } : {}) },
  section: { ...common, phase: "section", title: "لائحة دعوى (وهمية)", outline: ["الوقائع", "الأسانيد", "الطلبات"], section_index: 1,
    section: { heading: "الأسانيد", body: "يستند المدعي إلى إخلال المدعى عليه بالتسليم [S1]." },
    instruction: "قوِّ هذا القسم بسند عبء الإثبات", facts: FACTS, defenses: DEFENSES, requests: REQUESTS },
}[a.phase];

const fake = (n) => `FAKE-${n}: نص اختبار قصير لمرحلة ${n}، يُرسل فقط لإثبات أن body.prompts يصل ويُستعمل.`;
const prompts = a["fake-prompts"]
  ? { ...(a.phase === "draft" ? { draft: fake("draft") } : {}), extraction: fake("extraction"), adversary: fake("adversary"), refine: fake("refine"), najiz: fake("najiz") }
  : undefined;
let models;
if (a.model) models = Object.fromEntries(["write", "extraction", "adversary", "refine", "najiz"].map((s) => [s, a.model]));
if (a.models) models = { ...(models || {}), ...Object.fromEntries(a.models.split(",").map((p) => p.split("=").map((x) => x.trim())).filter((p) => p[0] && p[1])) };

// ── the callback listener ───────────────────────────────────────────────────
const runId = randomUUID();
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + "s";
let finish;
const done = new Promise((r) => { finish = r; });
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { console.log(at(), "callback: not JSON"); return; }
    if (a.listen) { console.log(at(), "callback:", JSON.stringify(body, null, 2)); return; }
    if (body.run_id !== runId) { console.log(at(), "callback for another run_id — ignored"); return; }
    if (body.status === "progress") { console.log(at(), "progress ·", body.step, "·", body.detail); return; }
    finish(body);
  });
});
server.listen(port, "127.0.0.1");
await new Promise((r, j) => { server.once("listening", r); server.once("error", j); }).catch((e) => die("cannot listen on " + port + ": " + e.message));

if (a.listen) { console.log(`listening on http://127.0.0.1:${port}/cb — Ctrl+C to stop`); await new Promise(() => {}); }

// ── send ────────────────────────────────────────────────────────────────────
const pkg = {
  v: 1, run_id: runId, tool: "legal-drafter", variant: null, class: "job", model_tier: "deep", locale: "ar",
  actor: { role: "lawyer", practice_kind: "advocate", display_name: null },
  input: INPUT, sources: SOURCES, case: null, history: [], files: [],
  respond: { mode: "async", callback_url: `http://127.0.0.1:${port}/cb` },
  deadline_at: new Date(Date.now() + waitMs).toISOString(),
  ...(prompts ? { prompts } : {}), ...(models ? { models } : {}),
};
if (a["write-body"]) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(a["write-body"], JSON.stringify(pkg, null, 2), "utf8");
  server.close();
  console.log("wrote", a["write-body"], "(run_id " + runId + ", phase " + a.phase + "); nothing was sent");
  process.exit(0);
}
const url = `${base}/${a["test-url"] ? "webhook-test" : "webhook"}/${PATH}`;
console.log(`→ POST ${url}  phase=${a.phase} kind=${a.kind} run_id=${runId}`);
console.log(`  prompts: ${prompts ? "FAKE for every stage" : "none (TEMP stand-ins)"} · models: ${models ? JSON.stringify(models) : "default"}`);

let res;
try {
  res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "X-Nzamy-Key": key }, body: JSON.stringify(pkg), signal: AbortSignal.timeout(20000) });
} catch (e) {
  server.close();
  die("cannot reach n8n: " + String(e.message || e).slice(0, 160) + " — is `npx n8n` running, and is the workflow active (or --test-url with Listen for test event)?");
}
const text = await res.text();
console.log(`← HTTP ${res.status} ${text.slice(0, 160)}`);
if (res.status !== 202) {
  server.close();
  const hint = { 401: "wrong key (check NZAMY_LOCAL_KEY and the header name X-Nzamy-Key)", 403: "wrong key", 404: "workflow not active, or wrong path/URL kind (/webhook vs /webhook-test)" }[res.status] || "";
  die(`expected 202${hint ? " — " + hint : ""}`);
}

// ── wait for the result ─────────────────────────────────────────────────────
const timer = setTimeout(() => finish({ __timeout: true }), waitMs);
const r = await done;
clearTimeout(timer);
server.close();
if (r.__timeout) die(`no result within ${a.wait}s — look at Executions in n8n for the stage that stalled`);

console.log(`\n✔ result after ${at()}  status=${r.status}`);
if (r.status !== "succeeded") {
  console.log("  error:", JSON.stringify(r.error));
  process.exit(1);
}
if (a.json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
const o = r.output || {};
const len = (s) => (typeof s === "string" ? s.length : 0);
if (a.phase === "issues") {
  console.log(`  issues=${(o.issues || []).length} defenses=${(o.defenses || []).length} requests=${(o.requests || []).length} missing=${(o.missing || []).length}`);
} else if (a.phase === "section") {
  console.log(`  heading=${JSON.stringify(o.heading)} body_chars=${len(o.body)}`);
} else {
  console.log(`  title=${JSON.stringify(o.title)} sections=${(o.sections || []).length} requests=${(o.requests || []).length}`);
  const n = o.lawyer_notes || {};
  console.log(`  engine: stages=${(n.engine?.stages || []).join(">")} prompts=${JSON.stringify(n.engine?.prompts)} models=${JSON.stringify(n.engine?.models)}`);
  console.log(`  extraction: items=${n.extraction?.items?.length ?? "—"} verified=${(n.extraction?.items || []).filter((x) => x.verified).length} dropped=${n.extraction?.dropped ?? "—"}`);
  console.log(`  adversary: findings=${n.adversary?.findings?.length ?? "—"} · refine: changes=${n.refine?.changes?.length ?? "—"} requests_changed=${n.refine?.requests_changed ?? "—"}`);
  console.log(`  najiz: ${o.najiz ? `chars=${o.najiz.chars} over_limit=${o.najiz.over_limit} markers_kept=${o.najiz.markers_kept}` : "—"} · skipped=${JSON.stringify(n.skipped || [])}`);
}
console.log(`  citations=${JSON.stringify(r.citations)} usage.model=${r.usage?.model}`);
console.log("  (use --json for the whole result)");
