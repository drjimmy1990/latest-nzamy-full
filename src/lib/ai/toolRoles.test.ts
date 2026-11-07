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
import { libraryToolRefusal, LIBRARY_TOOL_PLANS_HREF } from "./libraryToolRefusal.ts";

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

test("libraryToolRefusal: Pro or higher with the plans link, the closed library, nothing else", () => {
  const tier = libraryToolRefusal("library_tier", "سؤال قانوني سريع");
  assert.ok(tier);
  assert.match(tier.text, /«سؤال قانوني سريع»/);
  assert.match(tier.text, /Pro أو أعلى/);
  assert.match(tier.text, /اشتراك المكتبة وحده/, "a library-only subscription does not open the AI");
  assert.match(tier.text, /لم تُخصم نقاطك/);
  assert.deepEqual(tier.action, { label: "عرض الباقات", href: LIBRARY_TOOL_PLANS_HREF });
  assert.equal(LIBRARY_TOOL_PLANS_HREF, "/pricing");

  const closed = libraryToolRefusal("library_closed", "المستشار الذكي");
  assert.ok(closed);
  assert.match(closed.text, /مغلقة الآن/);
  assert.equal(closed.action, null);

  for (const code of [null, undefined, "", "role", "tool_off", "points", "library_security_lock"]) {
    assert.equal(libraryToolRefusal(code, "x"), null, String(code));
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
  assert.match(src("app/ai/quick-answer/page.tsx"), /libraryToolRefusal\(run\.code, "سؤال قانوني سريع"\)/);
  assert.match(src("app/ai/assistant/_assistant-client.ts"), /libraryToolRefusal\(code, "المستشار الذكي"\)/);
  assert.match(src("components/draft/steps/StepAiDraft.tsx"), /libraryToolRefusal\(run\.code, "الصائغ القانوني"\)/);
  assert.match(src("app/dashboard/business/kanban/_graph-ai-card.ts"), /libraryToolRefusal\(/);
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
