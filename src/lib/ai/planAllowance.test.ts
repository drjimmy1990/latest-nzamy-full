/**
 * planAllowance.test.ts — owner ق٢٦-٦ (batch l19, builder «plans»): the
 * ind-ai fair use (30 questions + 2 works a Riyadh calendar month, counted by
 * SQL 20261209_70) — the pure rules, the reads (counter → direct subscription
 * read → fail open), the run pipeline's use of them (runCore.startRunWith),
 * the route wiring, the screen line, the cards and the wallet's top-up.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/planAllowance.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import {
  IND_AI_PLAN_ID,
  IND_AI_QUESTIONS_PER_MONTH,
  IND_AI_WORKS_PER_MONTH,
  PLAN_ALLOWANCE_COPY,
  PLAN_ALLOWANCE_TOPUP_HREF,
  indAiPlanActiveWith,
  planAllowanceKindFor,
  planAllowanceRefused,
  planAllowanceStateFrom,
  planAllowanceStateWith,
  type PlanAllowanceState,
} from "./planAllowance.ts";
import { SIMPLE_CONTRACT_TOOL } from "./simpleContract.ts";
import { parseToolPointsAnswer, toolPointsView } from "../points/toolPointsView.ts";
import {
  individualTopupButtons,
  individualTopupFor,
  indAiActiveFrom,
  INDIVIDUAL_TOPUP_FALLBACK_HREF,
  INDIVIDUAL_TOPUP_LINE_AR,
} from "../payments/individualTopup.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const RUN = "11111111-2222-4333-8444-555555555555";
const who = (userType: string): RunActor => ({ userId: "u-1", userType, practiceKind: "advocate", displayName: null });
const input = { type: "rent", fields: [{ label: "اسم المؤجر", value: "محمد" }, { label: "اسم المستأجر", value: "خالد" }] };

// ── the pure rules ───────────────────────────────────────────────────────────

test("the owner's numbers and the tool → bucket map (the SQL's ai_plan_allowance_kind)", () => {
  assert.equal(IND_AI_PLAN_ID, "ind-ai");
  assert.equal(IND_AI_QUESTIONS_PER_MONTH, 30);
  assert.equal(IND_AI_WORKS_PER_MONTH, 2);
  assert.equal(planAllowanceKindFor("quick-answer"), "question");
  assert.equal(planAllowanceKindFor("simple-contract"), "work");
  for (const t of ["floating", "library-assistant", "assistant", "legal-drafter", "contracts-pro", "", null, undefined, 7]) {
    assert.equal(planAllowanceKindFor(t), null, String(t));
  }
  const sql = read("../../../supabase/migrations/20261209_70_ind_ai_fair_use.sql");
  assert.match(sql, /case p_tool when 'quick-answer' then 'question' when 'simple-contract' then 'work' else null end/);
  assert.match(sql, /'\{"questions_per_month": 30, "works_per_month": 2\}'::jsonb/);
  assert.match(sql, /v_q\s+int := 30;/);
  assert.match(sql, /v_w\s+int := 2;/);
});

test("planAllowanceStateFrom: the status row → left / used / none; anything malformed → null", () => {
  const row = { plan_active: true, questions_limit: 30, questions_used: 28, works_limit: 2, works_used: 2, month_start: "2026-12-01" };
  assert.deepEqual(planAllowanceStateFrom([row], "question"), { state: "left", left: 2, limit: 30 });
  assert.deepEqual(planAllowanceStateFrom(row, "work"), { state: "used", limit: 2 });
  assert.deepEqual(planAllowanceStateFrom([{ ...row, plan_active: false }], "question"), { state: "none" });
  assert.deepEqual(planAllowanceStateFrom([{ ...row, questions_used: 31 }], "question"), { state: "used", limit: 30 });
  for (const bad of [null, [], "x", [{ ...row, plan_active: "true" }], [{ ...row, questions_limit: null }], [{ ...row, works_used: -1 }]]) {
    const kind = JSON.stringify(bad).includes("works_used\":-1") ? "work" : "question";
    assert.equal(planAllowanceStateFrom(bad, kind), null, JSON.stringify(bad));
  }
});

test("planAllowanceRefused: only the start function's own two refusals", () => {
  assert.equal(planAllowanceRefused({ message: "plan_allowance_used" }), "used");
  assert.equal(planAllowanceRefused({ message: "plan_allowance_not_eligible" }), "not_eligible");
  for (const e of [null, undefined, {}, { message: "daily_limit" }, { message: "insufficient_points" }]) {
    assert.equal(planAllowanceRefused(e), null, JSON.stringify(e));
  }
});

// ── the reads ────────────────────────────────────────────────────────────────

function readsDb(opts: { status?: unknown; statusError?: boolean; subs?: unknown; subsError?: boolean }) {
  return fakeDb((q: FakeQuery) => {
    if (q.op === "rpc" && q.table === "ai_plan_allowance_status") {
      return opts.statusError ? { error: { code: "PGRST202", message: "missing" } } : { data: opts.status };
    }
    if (q.table === "subscriptions") return opts.subsError ? { error: { code: "XX000", message: "down" } } : { data: opts.subs ?? [] };
    return {};
  });
}
const NOW = new Date("2026-12-10T10:00:00Z");

test("indAiPlanActiveWith: an active ind-ai row not past its end (or with none); a failed read → null", async () => {
  const { client, log } = readsDb({ subs: [{ id: "s", current_period_end: "2027-11-30T00:00:00Z" }] });
  assert.equal(await indAiPlanActiveWith(client as never, "u-1", NOW), true);
  const q = log.find((x) => x.table === "subscriptions")!;
  assert.deepEqual(q.filters.filter((f) => f[0] === "eq").map((f) => [f[1], f[2]]), [["user_id", "u-1"], ["status", "active"], ["plan_id", "ind-ai"]]);
  assert.equal(await indAiPlanActiveWith(readsDb({ subs: [{ current_period_end: null }] }).client as never, "u-1", NOW), true);
  assert.equal(await indAiPlanActiveWith(readsDb({ subs: [{ current_period_end: "2026-12-01T00:00:00Z" }] }).client as never, "u-1", NOW), false);
  assert.equal(await indAiPlanActiveWith(readsDb({ subs: [] }).client as never, "u-1", NOW), false);
  assert.equal(await indAiPlanActiveWith(readsDb({ subsError: true }).client as never, "u-1", NOW), null);
});

test("planAllowanceStateWith: the counter first; when it cannot answer, a subscriber read directly → degraded, else none", async () => {
  const live = { plan_active: true, questions_limit: 30, questions_used: 3, works_limit: 2, works_used: 0 };
  assert.deepEqual(await planAllowanceStateWith(readsDb({ status: [live] }).client as never, "u-1", "question", NOW), { state: "left", left: 27, limit: 30 });
  // the counter's own "no plan" is believed: no direct read
  const none = readsDb({ status: [{ ...live, plan_active: false }], subs: [{ current_period_end: null }] });
  assert.deepEqual(await planAllowanceStateWith(none.client as never, "u-1", "question", NOW), { state: "none" });
  assert.ok(!none.log.some((q) => q.table === "subscriptions"));
  // the counter missing (SQL not run) / malformed → the direct read decides
  for (const opts of [{ statusError: true }, { status: [{ nonsense: 1 }] }]) {
    assert.deepEqual(
      await planAllowanceStateWith(readsDb({ ...opts, subs: [{ current_period_end: "2027-01-01T00:00:00Z" }] }).client as never, "u-1", "work", NOW),
      { state: "degraded" },
      JSON.stringify(opts),
    );
    assert.deepEqual(await planAllowanceStateWith(readsDb({ ...opts, subs: [] }).client as never, "u-1", "work", NOW), { state: "none" });
    assert.deepEqual(await planAllowanceStateWith(readsDb({ ...opts, subsError: true }).client as never, "u-1", "work", NOW), { state: "none" });
  }
});

// ── the run pipeline ─────────────────────────────────────────────────────────

/**
 * simple-contract live at 100 points; `plan` = the start function's answer
 * ("ok" | an error message | a code "42883"), `paid` = ai_start_run's answer
 * ("ok" | "insufficient_points" | "daily_limit").
 */
function runDb(plan: string = "ok", paid: string = "ok") {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") {
      const key = q.filters.find((f) => f[1] === "key")?.[2];
      if (key === "ai_tools") return { data: { value: { [SIMPLE_CONTRACT_TOOL]: { mode: "live" } } } };
      return { data: null };
    }
    if (q.op === "rpc" && q.table === "ai_start_plan_allowance_run") {
      if (plan === "ok") return { data: [{ run_id: RUN, created: true, status: "running", charged: false, charged_points: 0 }] };
      if (plan === "dup") return { data: [{ run_id: RUN, created: false, status: "running", charged: false, charged_points: 0 }] };
      if (/^\d+$/.test(plan)) return { error: { code: plan, message: "function does not exist" } };
      return { error: { code: "P0001", message: plan } };
    }
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const p = q.payload as Record<string, unknown>;
      if (paid === "ok") return { data: [{ run_id: RUN, created: true, status: "running", charged: (p.p_price as number) > 0, charged_points: p.p_price }] };
      return { error: { code: "P0001", message: paid } };
    }
    return {};
  });
}

function runDeps(state: PlanAllowanceState | "throw" | null, asked: string[] = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async () => ({ kind: "accepted" }),
    ...(state === null
      ? {}
      : {
          planAllowance: async (_u: string, kind: string) => {
            asked.push(kind);
            if (state === "throw") throw new Error("boom");
            return state;
          },
        }),
  };
}

const go = (actor: RunActor, client: unknown, d: StartRunDeps) =>
  startRunWith(client as never, d, actor, { tool: SIMPLE_CONTRACT_TOOL, input, idempotencyKey: "key-plan-00001" });
const rpcs = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc").map((q) => [q.table, (q.payload as Record<string, unknown>).p_price]);

test("run: inside the allowance — ai_start_plan_allowance_run with the screen's price, nothing charged", async () => {
  const { client, log } = runDb();
  const asked: string[] = [];
  const r = await go(who("individual"), client, runDeps({ state: "left", left: 2, limit: 2 }, asked));
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.deepEqual(asked, ["work"]);
  assert.deepEqual(rpcs(log), [["ai_start_plan_allowance_run", 100]]);
  assert.equal(r.body.chargedPoints ?? 0, 0);
});

test("run: the month used — the normal price; with too few points, 402 plan_allowance_used and the top-up", async () => {
  {
    const { client, log } = runDb();
    const r = await go(who("individual"), client, runDeps({ state: "used", limit: 2 }));
    assert.equal(r.status, 202);
    assert.deepEqual(rpcs(log), [["ai_start_run", 100]]);
  }
  {
    const { client } = runDb("ok", "insufficient_points");
    const r = await go(who("individual"), client, runDeps({ state: "used", limit: 2 }));
    assert.equal(r.status, 402);
    assert.equal(r.body.code, "plan_allowance_used");
    assert.equal(r.body.topupHref, PLAN_ALLOWANCE_TOPUP_HREF);
    assert.equal(r.body.error, PLAN_ALLOWANCE_COPY.refused("work", 2));
    assert.match(String(r.body.error), /١٠٠ أو ٢٥٠/);
  }
  {
    // a non-subscriber short of points keeps the ordinary refusal
    const { client } = runDb("ok", "insufficient_points");
    const r = await go(who("individual"), client, runDeps({ state: "none" }));
    assert.equal(r.status, 402);
    assert.equal(r.body.code, "insufficient_points");
  }
});

test("run: the last use taken meanwhile → the normal price (and 402 plan_allowance_used when the points are short)", async () => {
  {
    const { client, log } = runDb("plan_allowance_used");
    const r = await go(who("individual"), client, runDeps({ state: "left", left: 1, limit: 2 }));
    assert.equal(r.status, 202);
    assert.deepEqual(rpcs(log), [["ai_start_plan_allowance_run", 100], ["ai_start_run", 100]]);
  }
  {
    const { client } = runDb("plan_allowance_used", "insufficient_points");
    const r = await go(who("individual"), client, runDeps({ state: "left", left: 1, limit: 2 }));
    assert.equal(r.status, 402);
    assert.equal(r.body.code, "plan_allowance_used");
  }
  {
    // no plan after all (cancelled meanwhile): the ordinary path and refusal
    const { client } = runDb("plan_allowance_not_eligible", "insufficient_points");
    const r = await go(who("individual"), client, runDeps({ state: "left", left: 1, limit: 2 }));
    assert.equal(r.body.code, "insufficient_points");
  }
});

test("run: FAIL OPEN — the counter broken for a subscriber → price 0, uncounted; never refused for it", async () => {
  {
    // the read said degraded (counter unreadable, subscriber read directly)
    const { client, log } = runDb();
    const r = await go(who("individual"), client, runDeps({ state: "degraded" }));
    assert.equal(r.status, 202);
    assert.deepEqual(rpcs(log), [["ai_start_run", 0]]);
  }
  for (const broken of ["42883", "XX000"]) {
    const { client, log } = runDb(broken);
    const r = await go(who("individual"), client, runDeps({ state: "left", left: 2, limit: 2 }));
    assert.equal(r.status, 202, broken);
    assert.deepEqual(rpcs(log), [["ai_start_plan_allowance_run", 100], ["ai_start_run", 0]], broken);
  }
});

test("run: ai_start_run's own refusal inside the plan start is answered as such, never failed open", async () => {
  const { client, log } = runDb("daily_limit");
  const r = await go(who("individual"), client, runDeps({ state: "left", left: 2, limit: 2 }));
  assert.equal(r.status, 429);
  assert.equal(r.body.code, "daily_limit");
  assert.deepEqual(rpcs(log), [["ai_start_plan_allowance_run", 100]]);
});

test("run: a retried request is the duplicate (409), nothing more", async () => {
  const { client, log } = runDb("dup");
  const r = await go(who("individual"), client, runDeps({ state: "left", left: 2, limit: 2 }));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "duplicate");
  assert.equal(rpcs(log).length, 1);
});

test("run: never asked for an admin, a business, without the dep, or when the read throws (→ the normal path)", async () => {
  for (const t of ["admin", "corporate"]) {
    const { client, log } = runDb();
    const asked: string[] = [];
    const r = await go(who(t), client, runDeps({ state: "left", left: 2, limit: 2 }, asked));
    assert.equal(r.status, 202, t);
    assert.deepEqual(asked, [], t);
    assert.equal(rpcs(log)[0][0], "ai_start_run", t);
  }
  {
    const { client, log } = runDb();
    await go(who("individual"), client, runDeps(null));
    assert.deepEqual(rpcs(log), [["ai_start_run", 100]]);
  }
  {
    const { client, log } = runDb();
    const r = await go(who("individual"), client, runDeps("throw"));
    assert.equal(r.status, 202);
    assert.deepEqual(rpcs(log), [["ai_start_run", 100]]);
  }
});

// ── wiring ───────────────────────────────────────────────────────────────────

test("a free individual refused on the quick answer is pointed to the smart plan, not told it is closed", async () => {
  const { libraryToolRefusal, SMART_PLAN_HREF } = await import("./libraryToolRefusal.ts");
  const r = libraryToolRefusal("library_tier", "سؤال قانوني سريع", "individual", true)!;
  assert.match(r.text, /«الباقة الذكية»/);
  assert.deepEqual(r.action, { label: "عرض الباقة الذكية", href: SMART_PLAN_HREF });
  assert.equal(SMART_PLAN_HREF, "/pricing?audience=individuals");
  // every other page / type: unchanged
  assert.match(libraryToolRefusal("library_tier", "x", "individual")!.text, /غير متاح لنوع حسابك/);
  assert.doesNotMatch(libraryToolRefusal("library_tier", "x", "lawyer", true)!.text, /الباقة الذكية/);
  assert.match(read("../../app/ai/quick-answer/page.tsx"), /libraryToolRefusal\(run\.code, "سؤال قانوني سريع", user\.userType, true\)/);
});

test("the runs route passes the counter and opens the quick answer for an ind-ai subscriber", () => {
  const route = read("../../app/api/v1/ai/runs/route.ts");
  assert.match(route, /planAllowance: \(userId, kind\) => planAllowanceStateWith\(admin, userId, kind\),/);
  assert.match(
    route,
    /if \(userType === "individual" && planAllowanceKindFor\(toolId\) === "question" && \(await indAiPlanActiveWith\(admin, user\.id\)\) === true\) \{\s*return true;\s*\}\s*if \(toolId !== freeTool\) return false;/,
  );
  const standing = read("../../app/api/v1/ai/points-standing/route.ts");
  assert.match(standing, /planAllowanceStateWith\(admin, auth\.user\.id, kind\)/);
  assert.match(standing, /profile\?\.user_type === "individual"/);
});

test("the screen line: «بقي لك X من Y» while some is left, the used note before the points after", () => {
  const left = parseToolPointsAnswer({ charged: true, available: 0, planAllowance: { kind: "question", left: 28, limit: 30 } });
  assert.deepEqual(left, { charged: true, available: 0, planAllowance: { kind: "question", left: 28, limit: 30 } });
  assert.deepEqual(toolPointsView(left, 10), { text: "أسئلة باقتك الذكية المتبقية هذا الشهر: ٢٨ من ٣٠ — لا تُخصم نقاط", tone: "free", short: false });
  assert.equal(PLAN_ALLOWANCE_COPY.left("work", 1, 2), "العقود المبسّطة المتبقية في باقتك الذكية هذا الشهر: ١ من ٢ — لا تُخصم نقاط");
  const used = parseToolPointsAnswer({ charged: true, available: 4, planAllowance: { kind: "work", left: 0, limit: 2 } });
  const v = toolPointsView(used, 100)!;
  assert.equal(v.short, true);
  assert.ok(v.text.startsWith(PLAN_ALLOWANCE_COPY.usedNote("work")), v.text);
  // a malformed allowance is dropped, the points line stays
  assert.deepEqual(parseToolPointsAnswer({ charged: true, available: 5, planAllowance: { kind: "x", left: 1, limit: 2 } }), { charged: true, available: 5 });
  assert.deepEqual(parseToolPointsAnswer({ charged: true, available: 5, planAllowance: { kind: "work", left: 3, limit: 2 } }), { charged: true, available: 5 });
  // the two pages link the refusal to the top-up
  for (const rel of ["../../app/ai/quick-answer/page.tsx", "../../app/ai/simple-contract/_components/SimpleContractTool.tsx"]) {
    assert.match(read(rel), /run\.code === "plan_allowance_used" && \(/, rel);
    assert.match(read(rel), /href=\{PLAN_ALLOWANCE_TOPUP_HREF\}/, rel);
  }
});

test("both ind-ai card copies state the limit and no carry-over; the old unbacked lines are gone", () => {
  for (const rel of ["../../constants/pricing/pricing.individuals.ts", "../pricing/plans.ts"]) {
    const text = read(rel);
    assert.match(text, /"المجيب القانوني السريع: ٣٠ سؤالاً شهرياً"/, rel);
    assert.match(text, /"صائغ العقود المبسّط: عقدان مبسّطان شهرياً \(قيد التفعيل\)"/, rel);
    assert.match(text, /لا يُرحَّل غير المستخدم إلى الشهر التالي/, rel);
    assert.match(text, /"Quick legal answer: 30 questions a month"/, rel);
    assert.doesNotMatch(text, /مساعد (قانوني ذكي|ذكاء اصطناعي قانوني) ذاتي طوال الاشتراك|توليد ومراجعة مسودات/, rel);
    // l19 review (pay S3): the two contracts carry «(قيد التفعيل)» everywhere they appear
    for (const m of text.matchAll(/عقدان مبسّطان[^"]*/g)) assert.match(m[0], /\(قيد التفعيل\)/, `${rel}: «${m[0]}»`);
    for (const m of text.matchAll(/2 simplified contracts[^"]*/g)) assert.match(m[0], /\(coming soon\)/, `${rel}: «${m[0]}»`);
  }
  const table = read("../../constants/pricing/pricing.individuals.ts");
  assert.doesNotMatch(table, /صياغة الخطابات والإنذارات|Notice & Letter Drafting/, "no letters ✓ for the smart plan");
  assert.match(table, /"ind-ai": "خصم ١٠٪ \(قيد التفعيل\)"/);
  assert.match(table, /"ind-ai": "10% off \(coming soon\)"/);
  assert.doesNotMatch(table, /"ind-ai": "(خصم ١٠٪|10% off)"/);
});

test("the wallet's top-up: topup-100 and topup-250, individuals only, checkout when payment is on", () => {
  assert.equal(individualTopupFor("individual"), true);
  for (const t of ["lawyer", "firm", "corporate", "admin", "", null]) assert.equal(individualTopupFor(t), false, String(t));
  const on = individualTopupButtons({ disabled: false, provider: "moyasar", loading: false }, true);
  assert.deepEqual(on.map((b) => [b.id, b.href, b.waiting]), [
    ["topup-100", "/checkout?item=topup-100&billing=once", false],
    ["topup-250", "/checkout?item=topup-250&billing=once", false],
  ]);
  assert.equal(on[0].labelAr, "شحن ١٠٠");
  assert.equal(on[0].pointsAr, "١٠٠ نقطة · صالحة ٣ أشهر");
  const off = individualTopupButtons({ disabled: true, provider: null, loading: false }, true);
  assert.ok(off.every((b) => b.href === INDIVIDUAL_TOPUP_FALLBACK_HREF && !b.waiting));
  const loading = individualTopupButtons({ disabled: false, provider: "moyasar", loading: true }, true);
  assert.ok(loading.every((b) => b.waiting));
  const page = read("../../app/dashboard/client/wallet/page.tsx");
  assert.match(page, /<IndividualTopupCard isDark=\{isDark\} \/>/);
  assert.doesNotMatch(page, /بوابة الدفع في المنصة غير مفعَّلة حالياً|ولم تُفعَّل بوابة الدفع/);
  assert.match(read("../../components/payments/IndividualTopupCard.tsx"), /id="topup"/);
  // l19 review (pay S2): an ind-ai subscriber only, and the honest line (what the points buy, + VAT)
  const card = read("../../components/payments/IndividualTopupCard.tsx");
  assert.match(card, /\.eq\("plan_id", "ind-ai"\)/);
  assert.match(card, /if \(!individual \|\| !userId \|\| indAi\?\.userId !== userId \|\| !indAi\.active\) return null;/);
  assert.match(card, /\{INDIVIDUAL_TOPUP_LINE_AR\}/);
  assert.match(INDIVIDUAL_TOPUP_LINE_AR, /\+ ضريبة القيمة المضافة/);
  assert.match(INDIVIDUAL_TOPUP_LINE_AR, /\(قيد التفعيل\)/);
  assert.doesNotMatch(INDIVIDUAL_TOPUP_LINE_AR, /أدوات الذكاء الاصطناعي للأفراد/);
  const now = Date.parse("2026-12-01T00:00:00Z");
  assert.equal(indAiActiveFrom([{ plan_id: "ind-ai", status: "active", current_period_end: "2027-12-01T00:00:00Z" }], now), true);
  assert.equal(indAiActiveFrom([{ plan_id: "ind-ai", status: "active", current_period_end: null }], now), true);
  assert.equal(indAiActiveFrom([{ plan_id: "ind-ai", status: "active", current_period_end: "2026-11-30T00:00:00Z" }], now), false);
  assert.equal(indAiActiveFrom([{ plan_id: "ind-ai", status: "cancelled", current_period_end: null }], now), false);
  assert.equal(indAiActiveFrom([{ plan_id: "pro", status: "active", current_period_end: null }], now), false);
  assert.equal(indAiActiveFrom([{ plan_id: "ind-ai", status: "active", current_period_end: "garbage" }], now), false);
  assert.equal(indAiActiveFrom(null, now), false);
  assert.equal(PLAN_ALLOWANCE_TOPUP_HREF, "/dashboard/client/wallet#topup");
});

test("ق٢٦-٧: company / legal-department / NGO paid cards go to sales; micro-shield is hidden", () => {
  for (const rel of ["../../constants/pricing/pricing.companies.ts", "../../constants/pricing/pricing.companies.legaldept.ts"]) {
    const text = read(rel);
    assert.doesNotMatch(text, /\/register\/client\?type=company|اشترك سنوياً|Subscribe Yearly/, rel);
    assert.equal((text.match(/ctaHref: "\/contact"/g) ?? []).length, 18, rel);
  }
  const ngo = read("../../constants/pricing/pricing.ngo.ts");
  assert.doesNotMatch(ngo, /plan=ngo-/);
  const micro = read("../../constants/pricing/pricing.micro.ts");
  assert.equal((micro.match(/id: "micro-shield", isBetaHidden: true,/g) ?? []).length, 2);
  assert.doesNotMatch(micro, /plan=micro-shield/);
});
