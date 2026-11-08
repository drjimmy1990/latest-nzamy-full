/**
 * contractReview.test.ts — the AI contract review job: 250 points, one file up to
 * 15 pages or one pasted text, off until an admin opens it, and never read through
 * the human-review catalogue that happens to hold the same id (R19, R20, R21).
 *
 * The money tests assert the exact refusal, not only that nothing was charged: an
 * unknown tool is not charged either, so "no charge" alone would pass with no code.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/contractReview.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { ProgressEvent } from "./progressEvents.ts";
import {
  AI_TOOLS,
  CONTRACT_REVIEW_FILES,
  CONTRACT_REVIEW_PASTE_MAX,
  CONTRACT_REVIEW_PRICE,
  CONTRACTS_PRO_ROLES,
  PERCENT_PATTERN,
  hasPercent,
} from "./tools.ts";
import { aiToolLabelAr, AI_TOOL_PAGES } from "./toolLabels.ts";
import { aiToolPointRange, registryPointsLabel, type PricedAiToolId } from "./toolPointsDisplay.ts";
import { isPointsStandingTool } from "./pointsStanding.ts";
import { textPages } from "./textExtract.ts";
import { creditKindForRun } from "../membership/founderPlan.ts";
import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const TOOL = AI_TOOLS["contract-review"];
const input = { represented_party: "المستأجر" };
const clause = (over: Record<string, unknown> = {}) => ({
  ref: "البند الخامس",
  quote: "يلتزم المستأجر بدفع غرامة",
  category: "payment",
  risk: "high",
  issue: "الغرامة بلا سقف",
  defensive_edit: "تُحدّد الغرامة بسقف",
  negotiating_edit: "تُحذف الغرامة",
  ...over,
});
const output = (over: Record<string, unknown> = {}) => ({
  summary: "عقد إيجار فيه بند خطر",
  overall_risk: "medium",
  clauses: [clause(), clause({ risk: "medium", category: "شيء آخر" })],
  missing: [{ title: "القوة القاهرة", why: "لا ينظم العقد حالة تعذّر التنفيذ" }],
  cited: [{ law: "نظام المعاملات المدنية", article: 1, as_written: "المادة ١" }],
  ...over,
});

// ── the registry entry ───────────────────────────────────────────────────────

test("the registry entry: 250 points at any page count, one file up to 15 pages, no retrieval, off by default", () => {
  assert.equal(CONTRACT_REVIEW_PRICE, 250);
  for (const pages of [1, 15]) assert.equal(TOOL.price({}, { pages, turn: 0 }), 250);
  assert.equal(TOOL.files!.max, 1);
  assert.equal(TOOL.files!.maxPages, 15);
  assert.equal(TOOL.files!.maxBytes, 22 * 1024 * 1024);
  assert.equal(TOOL.retrieval, undefined, "no library gate (٤١٧)");
  assert.equal(TOOL.defaultMode, "off");
  assert.equal(TOOL.class, "job");
  assert.equal(TOOL.tier, "deep");
  assert.equal(TOOL.n8nPath, "nzamy-ai/contract-review");
  assert.equal(TOOL.dailyLimit, 5);
  assert.equal(TOOL.jobDeadlineSeconds, 15 * 60);
  assert.equal(TOOL.consultantBlocked, false);
  assert.deepEqual(TOOL.files, CONTRACT_REVIEW_FILES);
});

test("R21 + owner ٤١٧ (8 Nov): the contracts-pro roles are lawyers and firms, as one constant", () => {
  assert.deepEqual([...CONTRACTS_PRO_ROLES], ["lawyer", "firm"]);
  assert.equal(TOOL.roles, CONTRACTS_PRO_ROLES, "one constant, not a second list");
  assert.equal(AI_TOOLS["contracts-pro"].roles, CONTRACTS_PRO_ROLES);
});

test("a founder credit never pays for it (not in the founder tool list)", () => {
  assert.equal(creditKindForRun("contract-review", {}, 0), null);
});

test("the input: the represented party is required; optional fields are refused over their limit, never cut", () => {
  const v = TOOL.validateInput;
  assert.deepEqual(v({}), { ok: false, error: "حدّد الطرف الذي تمثّله" });
  assert.deepEqual(v({ represented_party: "   " }), { ok: false, error: "حدّد الطرف الذي تمثّله" });
  assert.deepEqual(v({ represented_party: " المستأجر ", concerns: " الغرامات ", other_party: "", contract_type: null }), {
    ok: true,
    input: { represented_party: "المستأجر", concerns: "الغرامات", other_party: null, contract_type: null },
  });
  assert.equal(v({ represented_party: "x".repeat(150) }).ok, true);
  assert.equal(v({ represented_party: "x".repeat(151) }).ok, false);
  assert.equal(v({ ...input, concerns: "x".repeat(2000) }).ok, true);
  assert.equal(v({ ...input, concerns: "x".repeat(2001) }).ok, false);
  assert.equal(v({ ...input, other_party: "x".repeat(151) }).ok, false);
  assert.equal(v({ ...input, contract_type: "x".repeat(81) }).ok, false);
});

test("the paste: optional, within limits after trim, refused not cut, and a paste at the limit still fits the page cap", () => {
  const v = TOOL.validateInput;
  assert.equal(textPages("x".repeat(CONTRACT_REVIEW_PASTE_MAX)), TOOL.files!.maxPages, "the limit and the cap agree");
  assert.equal(v({ ...input, contract_text: "x".repeat(99) }).ok, false);
  const fits = v({ ...input, contract_text: `  ${"x".repeat(CONTRACT_REVIEW_PASTE_MAX)}  ` });
  assert.ok(fits.ok);
  assert.equal((fits.input.contract_text as string).length, CONTRACT_REVIEW_PASTE_MAX);
  assert.equal(v({ ...input, contract_text: "x".repeat(CONTRACT_REVIEW_PASTE_MAX + 1) }).ok, false);
  for (const absent of [undefined, null, "", "  ", 7]) {
    const r = v({ ...input, contract_text: absent });
    assert.ok(r.ok);
    assert.equal("contract_text" in r.input, false);
  }
  assert.equal(TOOL.files!.optional, true);
  assert.equal(TOOL.filesRequired!({ contract_text: "نص" }), false);
  assert.equal(TOOL.filesRequired!({}), true);
  assert.equal(TOOL.pasteAsFile!.field, "contract_text");
  assert.equal(TOOL.pasteAsFile!.maxChars, CONTRACT_REVIEW_PASTE_MAX);
});

// ── the output ───────────────────────────────────────────────────────────────

test("the output: two clauses stay two, an unknown category becomes other", () => {
  const r = TOOL.validateOutput(output(), input) as { clauses: Array<{ category: string; risk: string }>; overall_risk: string; missing: unknown[]; cited: unknown[] };
  assert.equal(r.clauses.length, 2);
  assert.equal(r.clauses[0].category, "payment");
  assert.equal(r.clauses[1].category, "other");
  assert.equal(r.overall_risk, "medium");
  assert.equal(r.missing.length, 1);
  assert.equal(r.cited.length, 1);
});

test("the output is all or nothing: a clause that does not fit fails the run (refunded), never disappears", () => {
  const bad: Array<[string, unknown]> = [
    ["not an object", null],
    ["no clauses", output({ clauses: [] })],
    ["clauses missing", output({ clauses: undefined })],
    ["41 clauses", output({ clauses: Array.from({ length: 41 }, () => clause()) })],
    ["no summary", output({ summary: "" })],
    ["summary too long", output({ summary: "x".repeat(3001) })],
    ["unknown overall risk", output({ overall_risk: "critical" })],
    ["a number for a risk", output({ overall_risk: 70 })],
    ["unknown clause risk", output({ clauses: [clause({ risk: "severe" })] })],
    ["no issue", output({ clauses: [clause({ issue: "" })] })],
    ["issue too long", output({ clauses: [clause({ issue: "x".repeat(1201) })] })],
    ["quote too long", output({ clauses: [clause({ quote: "x".repeat(601) })] })],
    ["ref too long", output({ clauses: [clause({ ref: "x".repeat(201) })] })],
    ["edit too long", output({ clauses: [clause({ defensive_edit: "x".repeat(3001) })] })],
    ["a clause that is no object", output({ clauses: [clause(), "نص"] })],
    ["16 missing clauses", output({ missing: Array.from({ length: 16 }, () => ({ title: "ت", why: "س" })) })],
    ["missing without a title", output({ missing: [{ title: "", why: "س" }] })],
  ];
  for (const [name, raw] of bad) assert.equal(TOOL.validateOutput(raw, input), null, name);
  assert.equal((TOOL.validateOutput(output({ cited: Array.from({ length: 50 }, () => ({})) }), input) as { cited: unknown[] }).cited.length, 40);
});

test("owner ١٩٣: no percentage in any string field, in any digit system", () => {
  for (const s of ["٧٠٪", "70%", "70 %", "٧٠ ٪", "3.5%", "٣٫٥٪", "۷۰٪"]) assert.ok(PERCENT_PATTERN.test(s), s);
  for (const s of ["٧٠", "البند ٥", "خمسة في المئة", "%", "نسبة"]) assert.ok(!PERCENT_PATTERN.test(s), s);
  assert.equal(hasPercent({ a: [{ b: "فرصة ٨٠%" }] }), true);
  assert.equal(hasPercent({ a: [{ b: "لا شيء" }], c: 80, d: null }), false);

  const leaks: Array<[string, unknown]> = [
    ["issue", output({ clauses: [clause({ issue: "احتمال الخسارة ٧٠٪" })] })],
    ["summary", output({ summary: "فرصتك 80%" })],
    ["quote", output({ clauses: [clause({ quote: "غرامة ٥٪" })] })],
    ["defensive edit", output({ clauses: [clause({ defensive_edit: "تخفض إلى ٢٪" })] })],
    ["negotiating edit", output({ clauses: [clause({ negotiating_edit: "تخفض إلى 2 %" })] })],
    ["ref", output({ clauses: [clause({ ref: "بند ١٠٪" })] })],
    ["missing", output({ missing: [{ title: "ضمان", why: "يحميك ٩٠٪" }] })],
    ["cited", output({ cited: [{ law: "نظام", article: 1, as_written: "٥٪" }] })],
  ];
  for (const [name, raw] of leaks) assert.equal(TOOL.validateOutput(raw, input), null, name);
});

// ── the labels, and nothing leaning on the human catalogue (R19) ──────────────

test("R2: label and page", () => {
  assert.equal(aiToolLabelAr("contract-review"), "مراجعة العقد بالذكاء الاصطناعي");
  assert.equal(AI_TOOL_PAGES["contract-review"], "/ai/contracts");
});

test("R19: the AI id reads 250 points; neither its label nor its price is the human service's", () => {
  const human = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "contract-review")!;
  assert.equal(human.basePrice, 600, "the same id really is a human service at another price");
  assert.notEqual(aiToolLabelAr("contract-review"), human.label);
  assert.deepEqual([...aiToolPointRange("contract-review" as PricedAiToolId)], [250, 250]);
  for (const lang of ["ar", "en"] as const) {
    const label = registryPointsLabel("contract-review", lang)!;
    assert.equal(label, lang === "ar" ? "٢٥٠" : "250");
    assert.doesNotMatch(label, /600|800|٦٠٠|٨٠٠/);
  }
});

const SRC = join(process.cwd(), "src");
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}
/** Code only: the namespace rule itself is written in comments on both sides. */
const code = (file: string) =>
  readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

const CATALOGUE = /clientServiceCatalog|pricingRepository|clientPricingAudience|catalogPriceLabel|clientPricingServer|useClientPricingCatalog|admin_pricing_catalog|catalogAdminRules/;
const AI_REGISTRY = /lib\/ai\/tools|\.\/ai\/tools|ai\/toolLabels|\.\/toolLabels|ai\/toolPointsDisplay|\.\/toolPointsDisplay|ai_runs/;

test("R19: nothing that reads an ai_runs row or a tool's label reaches the human catalogue", () => {
  const readers = sources(SRC).filter((f) => {
    const c = code(f);
    return /from\("ai_runs"\)/.test(c) || /toolLabels/.test(c);
  });
  assert.ok(readers.length >= 8, `found only ${readers.length} readers — the scan broke`);
  for (const f of readers) assert.doesNotMatch(code(f), CATALOGUE, f);
});

test("R19: and the human catalogue reaches neither the AI registry nor ai_runs", () => {
  const modules = [
    "constants/clientServiceCatalog.ts",
    "lib/pricingRepository.ts",
    "lib/pricing/clientPricingAudience.ts",
    "lib/pricing/catalogPriceLabel.ts",
    "lib/pricing/clientPricingServer.ts",
    "lib/pricing/catalogAdminRules.ts",
    "hooks/useClientPricingCatalog.ts",
  ];
  for (const m of modules) assert.doesNotMatch(code(join(SRC, m)), AI_REGISTRY, m);
});

test("R19: no migration joins the two (only _verify, as separate checks, names both)", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const both = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => {
      const sql = readFileSync(join(dir, f), "utf8");
      return /ai_runs/.test(sql) && /admin_pricing_catalog/.test(sql);
    });
  assert.deepEqual(both, ["_verify.sql"]);
});

test("q296: the points-standing route does not answer for it — its short reply carries the price", () => {
  assert.equal(isPointsStandingTool("contract-review"), false);
});

// ── the money ────────────────────────────────────────────────────────────────

const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SIX = CONTRACTS_PRO_ROLES as readonly string[];
const OUTSIDERS = ["individual", "corporate", "micro", "provider", "government", "ngo", "arbitrator", "translator", "", "client"];
const actor = (userType: string): RunActor => ({ userId: "u-1", userType, practiceKind: "advocate", displayName: null });
const rpcs = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc").map((q) => q.table);

function db(setting: unknown) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: setting } };
    if (q.op === "rpc" && q.table === "ai_start_run") return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 250 }] };
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
}

function deps(pages = 3, over: Partial<StartRunDeps> = {}) {
  const state = { n8n: 0, resolved: 0 };
  const d: StartRunDeps = {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async () => {
      state.n8n += 1;
      return { kind: "accepted" };
    },
    resolveFiles: async () => {
      state.resolved += 1;
      return { ok: true, pages, files: [{ id: F1, name: "عقد.pdf", mime: "application/pdf", bytes: 10, pages, url: "https://s/f", url_expires_at: "2099-01-01T00:00:00.000Z" }] };
    },
    ...over,
  };
  return { d, state };
}
const body = (over: Record<string, unknown> = {}) => ({ tool: "contract-review", input, fileIds: [F1], idempotencyKey: "key-abcdef01", ...over });

test("off: nobody is charged, for every role, whether the setting is empty, unreadable or says off", async () => {
  for (const setting of [null, {}, { "contract-review": { mode: "off" } }]) {
    for (const role of [...SIX, "admin"]) {
      const { client, log } = db(setting);
      const { d, state } = deps();
      const r = await startRunWith(client as never, d, actor(role), body());
      assert.equal(r.status, 423, role);
      assert.equal(r.body.code, "tool_off", role);
      assert.deepEqual(rpcs(log), [], `${role}: no money function`);
      assert.equal(state.n8n, 0, role);
      assert.equal(state.resolved, 0, `${role}: the file is not even read`);
    }
  }
});

test("staff: a lawyer and a firm are refused before the charge; an admin runs it exempt", async () => {
  const setting = { "contract-review": { mode: "staff" } };
  for (const role of SIX) {
    const { client, log } = db(setting);
    const { d, state } = deps();
    const r = await startRunWith(client as never, d, actor(role), body());
    assert.equal(r.body.code, "tool_off", role);
    assert.deepEqual(rpcs(log), [], role);
    assert.equal(state.n8n, 0, role);
  }
  const { client, log } = db(setting);
  const { d } = deps();
  const r = await startRunWith(client as never, d, actor("admin"), body());
  assert.equal(r.status, 202);
  assert.equal((log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>).p_exempt, true);
});

test("a role outside lawyer and firm is refused before any charge, in every mode, and the setting is not read", async () => {
  for (const mode of ["off", "staff", "live"]) {
    for (const role of OUTSIDERS) {
      const { client, log } = db({ "contract-review": { mode } });
      const { d, state } = deps();
      const r = await startRunWith(client as never, d, actor(role), body());
      assert.equal(r.status, 403, `${role}/${mode}`);
      assert.equal(r.body.code, "role", `${role}/${mode}`);
      assert.deepEqual(rpcs(log), [], `${role}/${mode}`);
      assert.equal(log.some((q) => q.table === "platform_settings"), false, "the role comes first");
      assert.equal(state.n8n, 0);
    }
  }
});

test("live: a lawyer and a firm are charged exactly the price shown, at one page and at fifteen", async () => {
  for (const role of SIX) {
    for (const pages of [1, 15]) {
      const { client, log } = db({ "contract-review": { mode: "live" } });
      const { d, state } = deps(pages);
      const r = await startRunWith(client as never, d, actor(role), body());
      assert.equal(r.status, 202, role);
      const start = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
      assert.equal(start.p_price, CONTRACT_REVIEW_PRICE);
      assert.equal(start.p_price, 250);
      assert.equal(start.p_exempt, false);
      assert.equal(state.n8n, 1);
    }
  }
});

test("no file and no paste: refused before the charge, with the contract named", async () => {
  const { client, log } = db({ "contract-review": { mode: "live" } });
  const { d } = deps();
  const r = await startRunWith(client as never, d, actor("lawyer"), body({ fileIds: [] }));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "files_required");
  assert.match(String(r.body.error), /العقد/);
  assert.deepEqual(rpcs(log), []);
});

test("a pasted contract: refused uncharged while the flag is off; with it on it travels once, as a file, and never in the progress events", async () => {
  const pasted = "نص العقد السري ".repeat(10);
  const off = db({ "contract-review": { mode: "live" } });
  const r0 = await startRunWith(off.client as never, deps().d, actor("lawyer"), body({ input: { ...input, contract_text: pasted }, fileIds: [] }));
  assert.equal(r0.status, 422);
  assert.equal(r0.body.code, "paste_unavailable");
  assert.deepEqual(rpcs(off.log), []);

  const { client, log } = db({ "contract-review": { mode: "live" } });
  const seen: Array<{ body: { input: Record<string, unknown>; files: Array<{ name: string; mime: string }> } }> = [];
  const events: ProgressEvent[] = [];
  const logged: unknown[][] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const r = await startRunWith(client as never, {
      callbackUrl: "https://app.test/api/v1/ai/callback",
      n8n: async (call) => {
        seen.push(call as never);
        return { kind: "accepted" };
      },
      pastedFileUrl: () => "https://app.test/api/v1/ai/file-text/token",
      progress: (_run, _user, e) => void events.push(...e),
    }, actor("lawyer"), body({ input: { ...input, contract_text: pasted }, fileIds: [] }));
    assert.equal(r.status, 202);
  } finally {
    console.error = realError;
  }
  const start = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
  assert.equal(start.p_price, 250);
  assert.deepEqual(start.p_file_ids, []);
  assert.equal(seen[0].body.files[0].mime, "text/plain");
  assert.equal("contract_text" in seen[0].body.input, false, "the text travels once, as the file");
  assert.equal(JSON.stringify(seen[0].body).includes("نص العقد السري"), false);
  assert.ok(events.length > 0, "the waiting screen did get its events");
  assert.equal(JSON.stringify(events).includes("نص العقد السري"), false);
  assert.equal(JSON.stringify(logged).includes("نص العقد السري"), false);
});

// ── settling ─────────────────────────────────────────────────────────────────

function settling(status = "running") {
  const stored: Array<Record<string, unknown>> = [];
  const { client, log } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") return { data: { id: RUN, user_id: "u-1", tool: "contract-review", status, class: "job", source_ids: {}, input } };
    if (q.table === "ai_runs" && q.op === "update") {
      stored.push(q.payload as Record<string, unknown>);
      return { data: [{ id: RUN }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
  // The library the enricher reads: نظام العمل has article 80 and nothing else.
  const admin = Object.assign(client, {
    schema: () => ({
      from: (table: string) =>
        table === "laws"
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "labor", title: "نظام العمل", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "labor__art-80", number: 80, status: "active", law_slug: "labor" }], error: null }) }) }) },
    }),
  });
  return { admin, log, stored };
}

test("a failed job is refunded once, through ai_fail_run", async () => {
  const { admin, log, stored } = settling();
  const r = await callbackWith(admin as never, {
    run_id: RUN, status: "failed", output: null, citations: [], error: { code: "download_failed", message: "downloaded 0 of 1 files" },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(rpcs(log), ["ai_fail_run"]);
  assert.equal((log.find((q) => q.table === "ai_fail_run")!.payload as Record<string, unknown>).p_code, "download_failed");
  assert.equal(stored.length, 0);
});

test("an output with a percentage, or that breaks the shape, fails and is refunded once, and nothing is stored", async () => {
  for (const bad of [output({ clauses: [clause({ issue: "احتمال الخسارة ٧٠٪" })] }), output({ clauses: [] }), {}]) {
    const { admin, log, stored } = settling();
    await callbackWith(admin as never, { run_id: RUN, status: "succeeded", output: bad, citations: [] });
    assert.deepEqual(rpcs(log), ["ai_fail_run"]);
    assert.equal((log.find((q) => q.table === "ai_fail_run")!.payload as Record<string, unknown>).p_code, "schema_invalid");
    assert.equal(stored.length, 0);
  }
});

test("the library decides each cited article, not the model: the stored result has citation_check, not cited", async () => {
  const { admin, log, stored } = settling();
  const r = await callbackWith(admin as never, {
    run_id: RUN,
    status: "succeeded",
    output: output({ cited: [{ law: "نظام العمل", article: 80, as_written: "المادة (80)" }, { law: "نظام العمل", article: 999 }] }),
    citations: [],
  });
  assert.deepEqual(r.body, { ok: true, final: "succeeded" });
  assert.deepEqual(rpcs(log), []);
  const out = stored[0].output as Record<string, unknown>;
  assert.equal(out.cited, undefined);
  assert.deepEqual((out.citation_check as Array<{ article: number; status: string }>).map((c) => [c.article, c.status]), [[80, "ok"], [999, "not_found"]]);
});

test("a risk the model wrote differently is normalised: case, spaces, and the three Arabic words; anything else still refuses", () => {
  const read = (overall: unknown, risk: unknown) =>
    TOOL.validateOutput(output({ overall_risk: overall, clauses: [clause({ risk })] }), input) as { overall_risk: string; clauses: Array<{ risk: string }> } | null;
  for (const [written, word] of [["High", "high"], [" MEDIUM ", "medium"], ["low\n", "low"], ["مرتفع", "high"], ["متوسط", "medium"], [" منخفض ", "low"]]) {
    const r = read(written, written);
    assert.ok(r, written);
    assert.equal(r.overall_risk, word, written);
    assert.equal(r.clauses[0].risk, word, written);
  }
  for (const bad of ["critical", "حرج", "", "   ", "high risk", "constructor", "__proto__", null, 1, ["high"]]) {
    assert.equal(read(bad, "high"), null, `overall ${String(bad)}`);
    assert.equal(read("high", bad), null, `clause ${String(bad)}`);
  }
});
