/**
 * Owner ٤١٧ (7 Nov 2026): the AI tools are open, for points, to every registered
 * account; the legal consultant (م ١٨, `practice_kind = 'consultant'`) stays out
 * of the pleading tools. The role matrix below is every tool × every account
 * type × the consultant flag, through the one rule the run path and
 * tool-status share (toolRoleRefusal).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_TOOLS, REGISTERED_ROLES } from "./tools.ts";
import { toolRoleRefusal } from "./aiToolsConfig.ts";
import { libraryToolRefusal, LIBRARY_AI_TIERS, LIBRARY_TOOL_PLANS_HREF, proPlanOnSaleFor } from "./libraryToolRefusal.ts";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8").replace(/\r\n/g, "\n");

/** The two test tools and the library's own assistant keep their own lists. */
const NOT_CUSTOMER_TOOLS = new Set(["echo-fast", "echo-job", "library-assistant"]);
const PLEADING_TOOLS = ["analyze-strength", "brief-check", "legal-drafter", "najiz-optimizer", "wargaming"];
const OUTSIDERS = ["", "client", "arbitrator", "translator"];
const KINDS = ["advocate", "consultant", null] as const;

test("REGISTERED_ROLES is profiles.user_type without admin", () => {
  const db = src("types/database.ts");
  const line = /export type UserType = ([^;]+);/.exec(db);
  assert.ok(line, "database.ts has its UserType union");
  const types = [...line[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((t) => t !== "admin");
  assert.deepEqual([...REGISTERED_ROLES].sort(), types.sort());
});

test("every customer tool is open to every registered role (٤١٧)", () => {
  const customer = Object.keys(AI_TOOLS).filter((id) => !NOT_CUSTOMER_TOOLS.has(id));
  assert.ok(customer.length >= 16, `only ${customer.length} tools — the registry moved`);
  for (const id of customer) {
    assert.deepEqual([...AI_TOOLS[id].roles].sort(), [...REGISTERED_ROLES].sort(), id);
  }
});

test("government reaches the legal opinion; the library assistant and the test tools keep their lists", () => {
  for (const id of ["legal-opinion-consult", "legal-opinion-letter"]) assert.ok(AI_TOOLS[id].roles.includes("government"), id);
  assert.deepEqual(
    [...AI_TOOLS["library-assistant"].roles],
    ["individual", "lawyer", "firm", "corporate", "provider", "micro", "government", "ngo"],
    "the library's assistant is gated by its own tier rule, not widened here",
  );
  for (const id of ["echo-fast", "echo-job"]) assert.deepEqual([...AI_TOOLS[id].roles], ["lawyer", "firm"], id);
});

test("the consultant lock is on exactly the pleading tools (Art. 18, decision 407, ruling R1)", () => {
  const blocked = Object.values(AI_TOOLS).filter((t) => t.consultantBlocked).map((t) => t.id).sort();
  assert.deepEqual(blocked, PLEADING_TOOLS);
});

test("the matrix: each tool × each account type × the consultant flag", () => {
  let cases = 0;
  for (const spec of Object.values(AI_TOOLS)) {
    for (const userType of [...REGISTERED_ROLES, "admin", ...OUTSIDERS]) {
      for (const practiceKind of KINDS) {
        const got = toolRoleRefusal(spec, { userType, practiceKind });
        let want: "role" | "consultant_blocked" | null;
        if (userType === "admin") want = null;
        else if (!spec.roles.includes(userType)) want = "role";
        else if (spec.consultantBlocked && practiceKind === "consultant") want = "consultant_blocked";
        else want = null;
        assert.equal(got, want, `${spec.id} × ${userType || "(empty)"} × ${practiceKind}`);
        cases++;
      }
    }
  }
  assert.ok(cases > 600, `only ${cases} cases`);

  // The rows the owner named, spelled out.
  const ind = { userType: "individual", practiceKind: null };
  for (const id of ["quick-answer", "assistant", "analyze-strength", "wargaming", "legal-drafter", "najiz-optimizer", "communicate", "contract-negotiator", "case-brief", "brief-check"]) {
    assert.equal(toolRoleRefusal(AI_TOOLS[id], ind), null, `an individual runs ${id}`);
  }
  assert.equal(toolRoleRefusal(AI_TOOLS["legal-opinion-consult"], { userType: "government", practiceKind: null }), null);
  for (const id of PLEADING_TOOLS) {
    assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: "lawyer", practiceKind: "consultant" }), "consultant_blocked", id);
    assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: "lawyer", practiceKind: "advocate" }), null, id);
  }
  // A consultant keeps the advice tools.
  for (const id of ["quick-answer", "legal-opinion-consult", "contracts-pro", "assistant"]) {
    assert.equal(toolRoleRefusal(AI_TOOLS[id], { userType: "lawyer", practiceKind: "consultant" }), null, id);
  }
});

// ── the library paywall stays, and says so in each tool's name ───────────────

test("proPlanOnSaleFor: only the account types the price book sells a Pro-or-higher plan to", () => {
  // TIER_RANK in access-control.ts: the library AI's rule is rank >= pro.
  const ac = src("lib/access-control.ts");
  const block = /export const TIER_RANK[^{]*\{([^}]*)\}/.exec(ac);
  assert.ok(block, "access-control.ts has TIER_RANK");
  const ranks: Record<string, number> = Object.fromEntries([...block[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const atLeastPro = Object.keys(ranks).filter((t) => ranks[t] >= ranks.pro).sort();
  assert.deepEqual([...LIBRARY_AI_TIERS].sort(), atLeastPro);

  // Today's book: lawyer-pro / consultant-independent (lawyer, provider), firm-basic / firm-enterprise (firm).
  for (const t of ["lawyer", "firm", "provider"]) assert.equal(proPlanOnSaleFor(t), true, t);
  // ind-ai is tier `ai` (below pro); ind-preventive and ind-litigation are retired; no corporate/micro/government/ngo plan.
  for (const t of ["individual", "corporate", "micro", "government", "ngo", "", null, undefined]) assert.equal(proPlanOnSaleFor(t), false, String(t));

  // It reads the book, not a list: a retired plan does not count, an on-sale one does.
  const book = {
    "x-pro": { id: "x-pro", kind: "plan", labelAr: "x", tier: "pro", buyers: ["micro"], prices: { yearly: { sar: 1 } } },
    "x-old": { id: "x-old", kind: "plan", labelAr: "x", tier: "max", buyers: ["ngo"], prices: { yearly: { sar: 1, retired: true } } },
    "x-ai": { id: "x-ai", kind: "plan", labelAr: "x", tier: "ai", buyers: ["government"], prices: { yearly: { sar: 1 } } },
  } as never;
  assert.equal(proPlanOnSaleFor("micro", book), true);
  assert.equal(proPlanOnSaleFor("ngo", book), false);
  assert.equal(proPlanOnSaleFor("government", book), false);
});

test("libraryToolRefusal: the plans link only where a Pro plan is on sale; the closed library; nothing else", () => {
  for (const userType of ["lawyer", "firm", "provider"]) {
    const tier = libraryToolRefusal("library_tier", "سؤال قانوني سريع", userType);
    assert.ok(tier, userType);
    assert.match(tier.text, /«سؤال قانوني سريع»/);
    assert.match(tier.text, /Pro أو أعلى/);
    assert.match(tier.text, /اشتراك المكتبة القانونية وحده لا يفتح أدوات الذكاء/);
    assert.match(tier.text, /لم تُخصم نقاطك/);
    assert.deepEqual(tier.action, { label: "عرض الباقات", href: LIBRARY_TOOL_PLANS_HREF });
  }
  assert.equal(LIBRARY_TOOL_PLANS_HREF, "/pricing");

  // No buyable plan opens it (an AI-plan individual included): no link, no «Pro», no «subscription only» line.
  for (const userType of ["individual", "corporate", "micro", "government", "ngo", null]) {
    const none = libraryToolRefusal("library_tier", "المستشار الذكي", userType);
    assert.ok(none, String(userType));
    assert.equal(
      none.text,
      "«المستشار الذكي»: هذه الأداة تتطلب اشتراك المكتبة القانونية الكامل، وهو غير متاح لنوع حسابك حالياً — لم تُخصم نقاطك.",
    );
    assert.equal(none.action, null, String(userType));
    assert.doesNotMatch(none.text, /Pro|عرض الباقات|وحده/);
  }
  assert.equal(libraryToolRefusal("library_tier", "x", "admin"), null, "an admin is never told to subscribe");

  const closed = libraryToolRefusal("library_closed", "المستشار الذكي", "individual");
  assert.ok(closed);
  assert.match(closed.text, /مغلقة الآن/);
  assert.equal(closed.action, null);

  for (const code of [null, undefined, "", "role", "tool_off", "points", "library_security_lock"]) {
    assert.equal(libraryToolRefusal(code, "x", "lawyer"), null, String(code));
  }
});

test("the library gate itself is untouched: the run route still checks every library tool before the charge", () => {
  const route = src("app/api/v1/ai/runs/route.ts");
  assert.ok(route.includes("(await libraryGate()) ?? (await libraryAiAccess())"));
  assert.ok(route.includes('code: body.libraryClosed ? "library_closed" : "library_tier"'));
  const access = src("app/api/ai/_libraryAiAccess.ts");
  assert.ok(access.includes("libraryAiDecision({ signedIn: true, tier, isAdmin }, TIER_RANK)"));
});

test("each library tool's screen maps the gate's refusal to its own words", () => {
  const library = Object.values(AI_TOOLS).filter((t) => t.retrieval).map((t) => t.id).sort();
  assert.deepEqual(library, ["assistant", "canvas-card", "legal-drafter", "legal-opinion-consult", "library-assistant", "quick-answer"]);
  assert.match(src("app/ai/quick-answer/page.tsx"), /libraryToolRefusal\(run\.code, "سؤال قانوني سريع", user\.userType\)/);
  assert.match(src("app/ai/assistant/_assistant-client.ts"), /libraryToolRefusal\(code, "المستشار الذكي", input\.userType \?\? null\)/);
  assert.match(src("app/ai/assistant/page.tsx"), /askAssistant\(\{ message: content, context, conversationId, userType \}\)/);
  assert.match(src("app/dashboard/business/kanban/_graph-ai-card.ts"), /libraryToolRefusal\([^)]*"اقترح سنداً نظامياً", userType\)/);
  assert.match(src("app/dashboard/business/kanban/CaseGraphView.tsx"), /askCanvasCard\(chosen\.slice\(0, 8\), fetch, userType\)/);
  // /ai/legal-opinion already had its own (aiOpinion.ts), and the law reader its own (_ai-reply.ts).
  assert.match(src("app/ai/legal-opinion/_components/aiOpinion.ts"), /code === "library_tier"/);
});

// ── the screens follow the registry ──────────────────────────────────────────

test("/ai/draft opens the AI path by the tool's roles, not a typed list", () => {
  const page = src("app/ai/draft/page.tsx");
  assert.ok(!page.includes('["lawyer", "firm", "admin"].includes(user.userType'), "a second copy of the role list");
  assert.match(page, /toolRoleRefusal\(AI_TOOLS\["legal-drafter"\], \{ userType: user\.userType \?\? "", practiceKind: null \}\) === null/);
  assert.match(page, /const consultantBlocked = kind !== null && user\.practiceKind === "consultant";/);
});

test("/ai/analyze-strength: tool-status before the form, inside the consultant lock; a visitor gets sign-in and sign-up", () => {
  const page = src("app/ai/analyze-strength/page.tsx");
  assert.match(page, /useToolUsable\("analyze-strength"\)/);
  const gate = page.indexOf("<ConsultantGate>");
  const usable = page.indexOf("<StrengthUsableGate");
  assert.ok(gate > 0 && usable > gate, "the usable check sits inside ConsultantGate");
  assert.match(page, /\{signedIn && !report && \(\n\s*<StrengthUsableGate/);
  assert.ok(page.includes('href="/login?from=%2Fai%2Fanalyze-strength"'));
  assert.ok(page.includes('href="/register"'));
  assert.match(page, /\{isGuest && <Navbar \/>\}/);
});

test("Q443: the links lead to tools the role may run", () => {
  assert.match(src("app/services/labor/page.tsx"), /href="\/ai\/analyze-strength"/);
  assert.doesNotMatch(src("app/services/labor/page.tsx"), /استشارة مجانية — بدون التزام|أجب على ٤ أسئلة فقط/, "the tool is paid by points and reads a case summary");
  const banner = src("components/OnboardingBanner.tsx");
  assert.match(banner, /\{ label: "استشارة سريعة", href: "\/ai\/quick-answer" \}/);
  assert.match(banner, /\{ label: "الرأي القانوني", href: "\/ai\/legal-opinion" \}/);
  assert.ok(AI_TOOLS["analyze-strength"].roles.includes("individual"));
  assert.ok(AI_TOOLS["quick-answer"].roles.includes("micro"));
  assert.ok(AI_TOOLS["legal-opinion-consult"].roles.includes("government"));
});

test("no AI tool page still says it is for lawyers only", () => {
  assert.doesNotMatch(src("app/ai/najiz-optimizer/page.tsx"), />\s*للمحامين\s*</);
});

// ── fix round 1 ──────────────────────────────────────────────────────────────

test("a short table of named cases (tool × account type × practice kind)", () => {
  const table: Array<[string, string, string | null, "role" | "consultant_blocked" | null]> = [
    ["wargaming", "provider", "advocate", null],
    ["legal-drafter", "ngo", "consultant", "consultant_blocked"],
    ["quick-answer", "", null, "role"],
    ["wargaming", "admin", "consultant", null],
    ["legal-opinion-consult", "government", null, null],
    // library-assistant is open to every type (LIBRARY_ROLES; its gate is the tier rule): an unknown type is refused.
    ["library-assistant", "individual", null, null],
    ["library-assistant", "client", null, "role"],
    ["echo-fast", "individual", null, "role"],
    ["najiz-optimizer", "lawyer", "consultant", "consultant_blocked"],
    ["contracts-pro", "lawyer", "consultant", null],
    ["analyze-strength", "micro", "advocate", null],
    ["brief-check", "firm", "consultant", "consultant_blocked"],
  ];
  for (const [tool, userType, practiceKind, want] of table) {
    assert.equal(toolRoleRefusal(AI_TOOLS[tool], { userType, practiceKind }), want, `${tool} × ${userType || "(empty)"} × ${practiceKind}`);
  }
});

test("/ai/draft: a library_tier refusal hands over to the team order, with the note", () => {
  const step = src("components/draft/steps/StepAiDraft.tsx");
  assert.ok(step.includes('const toolOff = analysis.code === "tool_off" || analysis.code === "library_tier" ? analysis.code : null;'));
  assert.ok(step.includes("useEffect(() => { if (toolOff) onToolOff(toolOff); }, [toolOff, onToolOff]);"));
  assert.ok(step.includes('onToolOff: (code: "tool_off" | "library_tier") => void;'));
  const page = src("app/ai/draft/page.tsx");
  assert.ok(page.includes('const libraryNote = aiOffReason === "library_tier" ? libraryToolRefusal("library_tier", "الصائغ القانوني", user.userType) : null;'));
  assert.match(page, /!aiPath && libraryNote && \(\n\s*<div className="space-y-2">\n\s*<LibraryToolRefusalNote refusal=\{libraryNote\}/);
  assert.ok(page.includes("onToolOff={markAiOff}"));
});

test("tool-status before the form and price: communicate and assistant whole-page, wargaming and brief-check on the AI box", () => {
  for (const [file, tool] of [["app/ai/communicate/page.tsx", "communicate"], ["app/ai/assistant/page.tsx", "assistant"]]) {
    const page = src(file);
    assert.match(page, new RegExp(`<ToolUsableGate\\n\\s*tool="${tool}"`), file);
    assert.match(page, /^export default function \w+Route\(\)/m, file);
  }
  const gate = src("components/ai/ToolUsableGate.tsx");
  assert.ok(gate.includes("if (!user.isLoggedIn) return <>{children}</>;"), "a visitor keeps the page's own sign-in handling");
  assert.ok(gate.includes("useToolUsable(tool)"));

  const brief = src("app/ai/brief-check/page.tsx");
  assert.ok(brief.includes('const aiUsable = useToolUsable("brief-check");'));
  assert.ok(brief.includes('{reviewScope === "gaps_report" && aiUsable === true && ('));
  assert.ok(brief.indexOf("<ConsultantGate>") < brief.indexOf("function AIBriefCheckPage"), "inside the consultant lock");

  const war = src("app/ai/wargaming/page.tsx");
  assert.ok(war.includes('const aiUsable = useToolUsable("wargaming");'));
  assert.ok(war.includes("{aiUsable === true && ("));
  assert.ok(war.includes("aiUsable={aiUsable === true}"));
  assert.match(war, /\{aiUsable && \(\n\s*<p[^>]*>\n\s*المحاكاة الفورية: هدف واحد/, "the price line waits for tool-status");

  // contract-negotiator and quick-answer already had it.
  assert.ok(src("app/ai/contract-negotiator/page.tsx").includes('useToolUsable("contract-negotiator")'));
  assert.ok(src("app/ai/quick-answer/page.tsx").includes('useToolUsable("quick-answer")'));
});

test("the validators ask «صفتك أو صفة موكّلك» on the tools every account now runs", () => {
  for (const id of ["wargaming", "analyze-strength"]) {
    const r = AI_TOOLS[id].validateInput({ role: "nope", case_summary: "س".repeat(400), targets: ["opponent"] });
    assert.deepEqual(r, { ok: false, error: "اختر صفتك أو صفة موكّلك" }, id);
  }
});

test("/ai hub: no free queries, no «مجاني» badge on a paid tool, no «للمحامي … مجاناً»", () => {
  const hub = src("app/ai/page.tsx");
  assert.doesNotMatch(hub, /٥ استفسارات مجانية|5 free queries/);
  assert.doesNotMatch(hub, /badge: "مجاني"/);
  assert.doesNotMatch(hub, /للمحامي في البيتا، متاحة مجاناً/);
  assert.doesNotMatch(hub, /جرّب ذكاء نظامي مجاناً/);
});
