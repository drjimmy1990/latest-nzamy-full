/**
 * simpleContract.test.ts — batch l12 simpledraft (owner ١٢٣): «صائغ العقود
 * المبسّط» for individuals and businesses. The registry entry (who, off by
 * default), the admin-set price through the run pipeline (read before the
 * charge, a changed price refused uncharged, a failed read refused uncharged),
 * the fixed «استرشادي» line the app adds to every draft, the page's audience,
 * the n8n workflow file, the admin setting, and the lawyer tool's renamed text.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/simpleContract.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import { AI_TOOLS } from "./tools.ts";
import {
  SIMPLE_CONTRACT_DEFAULT_PRICE,
  SIMPLE_CONTRACT_NOTICE_AR,
  SIMPLE_CONTRACT_PAGE,
  SIMPLE_CONTRACT_PRICE_KEY,
  SIMPLE_CONTRACT_SERVICES_HREF,
  SIMPLE_CONTRACT_TOOL,
  simpleContractPrice,
  simpleContractPriceFrom,
  simpleContractPriceIssue,
  simpleContractText,
} from "./simpleContract.ts";
import { AI_TOOL_LABELS_AR, AI_TOOL_PAGES } from "./toolLabels.ts";
import { simpleContractAudience } from "../../app/ai/simple-contract/_audience.ts";
import { AI_WORKFLOWS, toWorkflow } from "../../../n8n/ai/workflows.mjs";

const RUN = "11111111-2222-4333-8444-555555555555";
const who = (userType: string): RunActor => ({ userId: "u-1", userType, practiceKind: "advocate", displayName: null });

const input = {
  type: "rent",
  fields: [
    { label: "اسم المؤجر", value: "محمد" },
    { label: "اسم المستأجر", value: "خالد" },
    { label: "وصف العقار", value: "شقة في الرياض" },
  ],
};
const draft = {
  title: "عقد إيجار شقة",
  preamble: "اتفق الطرفان على ما يلي:",
  sections: [
    { heading: "البند الأول: الطرفان", body: "المؤجر محمد والمستأجر خالد." },
    { heading: "البند الثاني: محل العقد", body: "شقة في الرياض." },
  ],
  cited: [],
};

/** ai_tools live for the tool; `price` is the stored simple_contract_price value (undefined → no row), "error" → a failed read. */
function db(price?: unknown) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") {
      const key = q.filters.find((f) => f[1] === "key")?.[2];
      if (key === "ai_tools") return { data: { value: { [SIMPLE_CONTRACT_TOOL]: { mode: "live" } } } };
      if (key === SIMPLE_CONTRACT_PRICE_KEY) {
        if (price === "error") return { error: { code: "XX000", message: "down" } };
        return { data: price === undefined ? null : { value: price } };
      }
      return {};
    }
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const p = q.payload as Record<string, unknown>;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: p.p_price }] };
    }
    return {};
  });
}

function deps(calls: Array<Record<string, unknown>>): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call as unknown as Record<string, unknown>);
      return { kind: "accepted" };
    },
  };
}

const start = (actor: RunActor, client: unknown, extra: Record<string, unknown> = {}, calls: Array<Record<string, unknown>> = []) =>
  startRunWith(client as never, deps(calls), actor, { tool: SIMPLE_CONTRACT_TOOL, input, idempotencyKey: "key-simple-0001", ...extra });

test("registry: a job for the individual and the business only, off until its workflow is imported, priced by a setting", () => {
  const t = AI_TOOLS[SIMPLE_CONTRACT_TOOL];
  assert.ok(t);
  assert.equal(t.id, "simple-contract");
  assert.equal(t.class, "job");
  assert.equal(t.n8nPath, "nzamy-ai/simple-contract");
  assert.equal(t.defaultMode, "off");
  assert.deepEqual([...t.roles], ["individual", "corporate"]);
  assert.ok(!t.roles.includes("lawyer") && !t.roles.includes("firm"), "never the lawyer or the firm");
  assert.equal(t.files, undefined);
  assert.equal(t.priceSetting?.key, "simple_contract_price");
  assert.equal(t.price({}, { pages: null }), 100, "the default until the owner fixes q١٢٣");
  assert.equal(t.price({}, { pages: null, settingPrice: 150 }), 150);
  assert.equal(SIMPLE_CONTRACT_DEFAULT_PRICE, 100);
});

test("the price setting: {points: 1..5000} only; anything else falls back to 100 and is refused by the admin write", () => {
  assert.equal(simpleContractPriceFrom({ points: 150 }), 150);
  for (const bad of [null, 150, "150", [], {}, { points: 0 }, { points: -5 }, { points: 1.5 }, { points: 5001 }, { points: "150" }]) {
    assert.equal(simpleContractPriceFrom(bad), null, JSON.stringify(bad));
    assert.equal(simpleContractPrice(bad), 100, JSON.stringify(bad));
    assert.ok(simpleContractPriceIssue(bad), JSON.stringify(bad));
  }
  assert.equal(simpleContractPriceIssue({ points: 100 }), null);
  const route = readFileSync(new URL("../../app/api/v1/admin/settings/route.ts", import.meta.url), "utf8");
  const allowed = /const ALLOWED_SETTINGS_KEYS = \[([\s\S]*?)\] as const;/.exec(route.replace(/\r\n/g, "\n"));
  assert.ok(allowed && /\n\s*SIMPLE_CONTRACT_PRICE_KEY,\n/.test(allowed[1]), "allow-listed");
  assert.match(route, /\[SIMPLE_CONTRACT_PRICE_KEY\]: simpleContractPriceIssue/, "validated");
});

test("run: an individual is charged the admin's price, read before the charge; no row → 100", async () => {
  for (const [stored, expected] of [[{ points: 150 }, 150], [undefined, 100], [{ points: "x" }, 100]] as const) {
    const { client, log } = db(stored);
    const calls: Array<Record<string, unknown>> = [];
    const r = await start(who("individual"), client, {}, calls);
    assert.equal(r.status, 202, JSON.stringify(r.body));
    const rpc = log.find((q) => q.op === "rpc" && q.table === "ai_start_run");
    assert.equal((rpc?.payload as Record<string, unknown>).p_price, expected, JSON.stringify(stored));
    assert.equal(calls[0]?.path, "nzamy-ai/simple-contract");
  }
});

test("run: a corporate account and an admin may run it", async () => {
  for (const t of ["corporate", "admin"]) {
    const { client } = db({ points: 120 });
    const r = await start(who(t), client);
    assert.equal(r.status, 202, t);
  }
});

test("run: the screen's price must match — a changed price is refused uncharged with the new one", async () => {
  const { client, log } = db({ points: 150 });
  const r = await start(who("individual"), client, { expectedPrice: 100 });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "price_changed");
  assert.equal(r.body.price, 150);
  assert.ok(!log.some((q) => q.op === "rpc"), "nothing charged");
  const ok = await start(who("individual"), db({ points: 150 }).client, { expectedPrice: 150 });
  assert.equal(ok.status, 202);
});

test("run: a failed price read is refused uncharged (never a guessed price)", async () => {
  const { client, log } = db("error");
  const calls: Array<Record<string, unknown>> = [];
  const r = await start(who("individual"), client, {}, calls);
  assert.equal(r.status, 503);
  assert.ok(!log.some((q) => q.op === "rpc"), "nothing charged");
  assert.deepEqual(calls, []);
});

test("run: a lawyer, a law firm and the other account types are refused before anything is read or charged", async () => {
  for (const t of ["lawyer", "firm", "micro", "provider", "government", "ngo"]) {
    const { client, log } = db({ points: 100 });
    const r = await start(who(t), client);
    assert.equal(r.status, 403, t);
    assert.equal(r.body.code, "role", t);
    assert.ok(!log.some((q) => q.op === "rpc"), t);
  }
});

test("run: the tool is off by default — refused (423) when the setting does not name it", async () => {
  const { client, log } = fakeDb(() => ({}));
  const r = await start(who("individual"), client);
  assert.equal(r.status, 423);
  assert.ok(!log.some((q) => q.op === "rpc"));
});

test("output: the app adds the «استرشادي» line and the services link to every draft; a bad draft is refused", () => {
  const v = AI_TOOLS[SIMPLE_CONTRACT_TOOL].validateOutput;
  const out = v({ ...draft, notice: "نص آخر من النموذج" }, input) as Record<string, unknown>;
  assert.equal(out.notice, SIMPLE_CONTRACT_NOTICE_AR, "never the model's own wording");
  assert.equal(out.notice_href, "/services/contracts");
  assert.equal(out.title, draft.title);
  assert.equal(v({ title: "x", sections: [{ heading: "a", body: "b" }] }, input), null, "one section is not a contract");
  assert.equal(v(null, input), null);
  // the owner's words: «استرشادي» and the sentence that goes with it, no «لا يُعتد به»
  assert.match(SIMPLE_CONTRACT_NOTICE_AR, /استرشادي/);
  assert.ok(SIMPLE_CONTRACT_NOTICE_AR.includes("للحصول على عقد احترافي استعن بمحامٍ من نظامي"));
  assert.doesNotMatch(SIMPLE_CONTRACT_NOTICE_AR, /لا يُعتد به/);
});

test("output: the callback stores the draft with the notice and the library's verdict on its articles", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const { client } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") {
      return { data: { id: RUN, tool: SIMPLE_CONTRACT_TOOL, status: "running", class: "job", source_ids: {}, input } };
    }
    if (q.table === "ai_runs" && q.op === "update") {
      stored.push(q.payload as Record<string, unknown>);
      return { data: [{ id: RUN }] };
    }
    return {};
  });
  const admin = Object.assign(client, {
    schema: () => ({
      from: (table: string) =>
        table === "laws"
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "civil", title: "نظام المعاملات المدنية", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "civil__art-1", number: 1, status: "active", law_slug: "civil" }], error: null }) }) }) },
    }),
  });
  const output = { ...draft, cited: [{ law: "نظام المعاملات المدنية", article: 1, as_written: "المادة الأولى" }] };
  const r = await callbackWith(admin as never, { run_id: RUN, status: "succeeded", output, citations: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const out = stored.find((s) => s.output)!.output as Record<string, any>;
  assert.equal(out.notice, SIMPLE_CONTRACT_NOTICE_AR);
  assert.equal(out.notice_href, SIMPLE_CONTRACT_SERVICES_HREF);
  assert.ok(!("cited" in out));
  assert.equal(out.citation_check[0].status, "ok");
});

test("copy text: the guidance line and the link are always last", () => {
  const t = simpleContractText(draft, "https://example.test");
  assert.ok(t.startsWith(draft.title));
  assert.ok(t.endsWith(`${SIMPLE_CONTRACT_NOTICE_AR}\nhttps://example.test/services/contracts`));
  assert.ok(simpleContractText({ ...draft, preamble: "" }).endsWith(`\n${SIMPLE_CONTRACT_SERVICES_HREF}`));
});

test("page: the tool for individual, corporate and admin; lawyers are pointed to «محترف العقود», others to /services/contracts", () => {
  assert.equal(simpleContractAudience("individual"), "tool");
  assert.equal(simpleContractAudience("corporate"), "tool");
  assert.equal(simpleContractAudience("admin"), "tool");
  assert.equal(simpleContractAudience("lawyer"), "lawyer");
  assert.equal(simpleContractAudience("firm"), "lawyer");
  for (const t of ["micro", "provider", "government", "ngo", "", null, undefined]) assert.equal(simpleContractAudience(t), "other", String(t));
  assert.equal(SIMPLE_CONTRACT_PAGE, "/ai/simple-contract");
  assert.equal(AI_TOOL_PAGES[SIMPLE_CONTRACT_TOOL], SIMPLE_CONTRACT_PAGE);
  assert.equal(AI_TOOL_LABELS_AR[SIMPLE_CONTRACT_TOOL], "صائغ العقود المبسّط");
  const page = readFileSync(new URL("../../app/ai/simple-contract/_components/SimpleContractTool.tsx", import.meta.url), "utf8");
  assert.match(page, /expectedPrice: price/, "the run carries the price the screen showed");
  assert.match(page, /useToolUsable\(SIMPLE_CONTRACT_TOOL\)/, "«قريباً» while the tool is off");
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.ok(proxy.includes(`"${SIMPLE_CONTRACT_PAGE}"`), "sign-in at the edge");
});

test("n8n: the workflow file is the export of workflows.mjs, a no-files Agent job on the registry's path", () => {
  const def = AI_WORKFLOWS.find((d: { tool: string }) => d.tool === SIMPLE_CONTRACT_TOOL);
  assert.ok(def);
  assert.equal(def.path, AI_TOOLS[SIMPLE_CONTRACT_TOOL].n8nPath);
  assert.equal(def.kind, "caseJob");
  const onDisk = readFileSync(new URL("../../../n8n/ai/simple-contract.json", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal(onDisk, `${JSON.stringify(toWorkflow(def), null, 2)}\n`, "run the export after changing the prompt");
  // the prompt: plain words for a non-lawyer, blanks for the missing, no disclaimer of its own
  const $ = () => ({ first: () => ({ json: { body: { run_id: RUN, input, files: [] } } }) });
  const built = new Function("$", "$json", def.build as string)($, {})[0].json as { system: string; content: string };
  assert.match(built.content, /عقد إيجار/);
  assert.match(built.content, /اسم المؤجر: «محمد»/);
  assert.match(built.content, /\[\.\.\.\.\]/);
  assert.match(built.content, /لا تكتب في آخر العقد تنبيهاً/);
  assert.doesNotMatch(built.system, /[{}]/, "no braces in the Agent's system text");
});

test("rename (owner ١٢٣): the lawyer's short draft no longer calls itself «عقد مبسّط»", () => {
  const step = readFileSync(new URL("../../app/ai/contract-drafter/_components/StepContractResult.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(step, /هذا عقد مبسّط|مسوّدة أولية مبسّطة/);
  assert.match(step, /مسوّدة عقد مختصرة/);
});

test("entry links (l12 integration): hub card and sidebars for individuals and businesses only, «قيد التفعيل» until live; the catalogue card opens the tool", async () => {
  const { readFileSync: read } = await import("node:fs");
  const src = (rel: string) => read(new URL(`../../${rel}`, import.meta.url), "utf8");
  const hub = src("app/ai/page.tsx");
  assert.match(hub, /const SIMPLE_CONTRACT_AUDIENCE: ReadonlySet<string> = new Set\(\["individual", "corporate", "admin"\]\);/);
  assert.match(hub, /if \(t\.href === SIMPLE_CONTRACT_HREF\) return SIMPLE_CONTRACT_AUDIENCE\.has\(user\.userType \?\? ""\);/);
  assert.match(hub, /t\.href === SIMPLE_CONTRACT_HREF && !simpleContractLive \? \{ \.\.\.t, badgeAr: "قيد التفعيل", badgeEn: "Activating soon" \} : t/);
  const row = 'href: "/ai/simple-contract", icon: "PencilSimple", badge: "قيد التفعيل", liveToolId: "simple-contract" }';
  assert.ok(src("constants/navigation.sidebars.primary.ts").includes(row), "individual sidebar");
  assert.ok(src("constants/navigation.sidebars.business.ts").includes(row), "corporate sidebar");
  assert.ok(!src("constants/navigation.sidebars.legal.ts").includes("/ai/simple-contract"), "never the lawyer or firm menu");
  const { CLIENT_SERVICE_CATALOG } = await import("../../constants/clientServiceCatalog.ts");
  const card = CLIENT_SERVICE_CATALOG.find((s) => s.serviceId === "contract-draft")!;
  assert.equal(card.route, "/ai/simple-contract");
});


test("«قيد التفعيل» rows (l12): asked about like «قريباً», badge dropped once live, never moved into the «قريباً» section", async () => {
  const { comingSoonToolIds, withLiveToolBadges, withComingSoonLast, PENDING_ACTIVATION_BADGE } = await import("../../constants/navigation.comingSoon.ts");
  const groups = [{ title: "x", items: [
    { label: "a", href: "/a", icon: "X" },
    { label: "b", href: "/ai/simple-contract", icon: "X", badge: PENDING_ACTIVATION_BADGE, liveToolId: "simple-contract" },
  ] }];
  assert.deepEqual(comingSoonToolIds(groups as never), ["simple-contract"]);
  const live = withLiveToolBadges(groups as never, new Set(["simple-contract"]));
  assert.equal(live[0].items[1].badge, undefined);
  assert.equal(withLiveToolBadges(groups as never, new Set(["other"]))[0].items[1].badge, PENDING_ACTIVATION_BADGE);
  assert.equal(withComingSoonLast(groups as never).length, 1, "not grouped with «قريباً»");
});
