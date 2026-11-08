/**
 * Owner ٤١٧, answer of 8 Nov 2026: the lawyer tools' pages are for lawyers and
 * law firms only. The page map (lawyerOnlyTools.ts) follows the registry; the
 * edge (routeAccess.ts + proxy.ts PROTECTED) and the /ai layout read it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_TOOLS, LAWYER_FIRM_ROLES } from "./tools.ts";
import { AI_TOOL_PAGES } from "./toolLabels.ts";
import { LAWYER_ONLY_AI_PAGES, canSeeLawyerTools, isLawyerOnlyAiHref, lawyerOnlyAiTool } from "./lawyerOnlyTools.ts";
import { isRouteAllowedFor, routeAccessRuleFor } from "../auth/routeAccess.ts";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8").replace(/\r\n/g, "\n");

test("every page in the map runs a lawyer/firm tool, and every lawyer/firm tool with a page of its own is in the map", () => {
  for (const [page, tool] of Object.entries(LAWYER_ONLY_AI_PAGES)) {
    assert.ok(AI_TOOLS[tool], `${page} → ${tool} is a registered tool`);
    assert.deepEqual([...AI_TOOLS[tool].roles], [...LAWYER_FIRM_ROLES], `${tool}'s roles`);
  }
  // The pages that serve other accounts something else stay out (they split by the tool's roles themselves).
  const shared = new Set(["/ai/draft", "/ai/analyze"]);
  for (const [tool, page] of Object.entries(AI_TOOL_PAGES)) {
    const spec = AI_TOOLS[tool];
    if (!spec || !page) continue;
    const lawyerOnly = spec.roles.length === LAWYER_FIRM_ROLES.length && LAWYER_FIRM_ROLES.every((r) => spec.roles.includes(r));
    const path = page.split("?")[0];
    if (!lawyerOnly || shared.has(path) || path.startsWith("/dashboard/")) continue;
    assert.ok(isLawyerOnlyAiHref(path), `${tool} lives on ${path}, which is not in LAWYER_ONLY_AI_PAGES`);
  }
  for (const page of shared) assert.equal(isLawyerOnlyAiHref(page), false, page);
});

test("the matcher is segment-aware and ignores the query", () => {
  assert.equal(lawyerOnlyAiTool("/ai/contracts"), "contracts-pro");
  assert.equal(lawyerOnlyAiTool("/ai/contracts?mode=draft&type=rent"), "contracts-pro");
  assert.equal(lawyerOnlyAiTool("/ai/contracts/"), "contracts-pro");
  assert.equal(lawyerOnlyAiTool("/ai/assistant/x"), "assistant");
  assert.equal(lawyerOnlyAiTool("/ai/contracts-x"), null);
  assert.equal(lawyerOnlyAiTool("/ai/quick-answer"), null);
  assert.equal(lawyerOnlyAiTool("/ai/legal-opinion"), null);
  for (const t of ["lawyer", "firm", "admin"]) assert.equal(canSeeLawyerTools(t), true, t);
  for (const t of ["individual", "corporate", "micro", "provider", "government", "ngo", "", null, undefined]) assert.equal(canSeeLawyerTools(t), false, String(t));
});

test("no other /ai route directory shares a map prefix (the edge matches with startsWith)", () => {
  const dirs = readdirSync(join(process.cwd(), "src", "app", "ai"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `/ai/${d.name}`);
  for (const page of Object.keys(LAWYER_ONLY_AI_PAGES)) {
    assert.ok(dirs.includes(page), `${page} has a route directory`);
    for (const dir of dirs) if (dir !== page) assert.ok(!dir.startsWith(page), `${dir} would be caught by ${page}`);
  }
});

test("the edge: each page has a lawyer/firm rule and is PROTECTED, so the rule is read", () => {
  const proxy = src("proxy.ts");
  const list = /const PROTECTED = \[([\s\S]*?)\];/.exec(proxy);
  assert.ok(list, "proxy.ts has its PROTECTED list");
  const prefixes = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const page of Object.keys(LAWYER_ONLY_AI_PAGES)) {
    assert.ok(prefixes.some((p) => page.startsWith(p)), `${page} is PROTECTED`);
    const rule = routeAccessRuleFor(page);
    assert.ok(rule, `${page} has a rule`);
    assert.deepEqual([...rule.allowedTypes], ["lawyer", "firm"], page);
    for (const t of ["lawyer", "firm"]) assert.equal(isRouteAllowedFor(`${page}/x`, t), true, `${t} at ${page}`);
    for (const t of ["individual", "corporate", "micro", "provider", "government", "ngo"]) assert.equal(isRouteAllowedFor(page, t), false, `${t} at ${page}`);
  }
  // The pages every account keeps.
  for (const page of ["/ai/draft", "/ai/analyze", "/ai/quick-answer", "/ai/legal-opinion"]) {
    assert.equal(isRouteAllowedFor(page, "individual"), true, page);
    assert.equal(isRouteAllowedFor(page, "corporate"), true, page);
  }
});

test("the /ai layout draws the notice, not the tool, for a signed-in account outside lawyer/firm/admin", () => {
  const layout = src("app/ai/layout.tsx");
  assert.match(layout, /const lawyerOnlyRefused = shell !== "loading" && user\.isLoggedIn && isLawyerOnlyAiHref\(pathname\) && !canSeeLawyerTools\(user\.userType\);/);
  assert.match(layout, /const children = lawyerOnlyRefused \? <LawyerOnlyToolNotice userType=\{user\.userType\} \/> : page;/);
  const notice = src("components/ai/LawyerOnlyToolNotice.tsx");
  assert.match(notice, /هذه الأداة للمحامين ومكاتب المحاماة المرخّصة/);
  assert.ok(notice.includes('href="/dashboard/client/consultation/new"'), "an individual or a company is offered the consultation request");
  assert.ok(notice.includes('href="/ai/quick-answer"') && notice.includes('href="/ai/legal-opinion"'), "the general guidance stays offered");
});

test("the /ai hub and the quick answer's follow-ups do not offer a lawyer tool to another account", () => {
  const hub = src("app/ai/page.tsx");
  assert.ok(hub.includes("if (isLawyerOnlyAiHref(t.href) && !canSeeLawyerTools(user.userType)) return false;"));
  const qa = src("app/ai/quick-answer/page.tsx");
  assert.ok(qa.includes('.filter((f) => lawyerTools || !(isLawyerOnlyAiHref(f.href) || f.href === "/ai/analyze"));'));
});

// ── owner ٤٤٣: no lawyer-tool link on another account's screens ─────────────

/** The source without comments, so a note about a removed link is not read as the link. */
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const LAWYER_HREF = new RegExp(`["'\`](${Object.keys(LAWYER_ONLY_AI_PAGES).map((p) => p.replace(/[/-]/g, "\$&")).join("|")})(?=[?/"'\`])`);

function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), "src", dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.tsx?$/.test(d.name) && !d.name.includes(".test.") ? [`${dir}/${d.name}`] : [],
  );
}

test("Q443: the client, company, small-business, provider, government and NGO menus and dashboards link no lawyer tool", () => {
  const files = [
    "constants/navigation.sidebars.primary.ts",
    "constants/navigation.sidebars.business.ts",
    "app/services/labor/page.tsx",
    ...["client", "business", "micro", "provider", "government", "ngo"].flatMap((d) => walk(`app/dashboard/${d}`)),
  ];
  assert.ok(files.length > 60, `only ${files.length} files — the walk broke`);
  for (const rel of files) {
    const body = rel === "constants/navigation.sidebars.primary.ts" ? code(rel).slice(0, code(rel).indexOf("export const ADMIN_SIDEBAR")) : code(rel);
    const hit = LAWYER_HREF.exec(body);
    assert.equal(hit, null, `${rel} links ${hit?.[1]}`);
  }
  // The navbar: every role's menu but lawyer, firm and admin.
  const navbar = code("constants/navigation.navbar.ts");
  for (const name of ["INDIVIDUAL_NAV", "CORPORATE_NAV", "MICRO_NAV", "PROVIDER_NAV", "GOVERNMENT_NAV", "NGO_NAV"]) {
    const start = navbar.indexOf(`export const ${name}`);
    assert.ok(start > 0, name);
    const block = navbar.slice(start, navbar.indexOf("];", start));
    assert.equal(LAWYER_HREF.exec(block), null, `${name} links a lawyer tool`);
  }
  // The floating services: the company, government and NGO lists.
  const floating = code("components/floating/constants/floatingServices.tsx");
  for (const key of ["corp-legal-draft", "corp-contract-ai", "ngo-volunteer-contract"]) assert.ok(!floating.includes(`"${key}"`), key);
  for (const line of floating.split("\n").filter((l) => /key: "(corp|gov|ngo|micro|client|ind)-/.test(l))) {
    assert.equal(LAWYER_HREF.exec(line), null, line.trim());
  }
  // The welcome bar.
  const banner = code("components/OnboardingBanner.tsx");
  for (const role of ["client", "business", "government", "ngo", "provider", "micro"]) {
    const start = banner.indexOf(`  ${role}: {`);
    assert.ok(start > 0, role);
    const block = banner.slice(start, banner.indexOf("\n  },", start));
    assert.equal(LAWYER_HREF.exec(block), null, `${role} welcome bar links a lawyer tool`);
  }
});

test("Q443: shared screens draw a lawyer-tool link only for lawyer, firm and admin", () => {
  for (const rel of [
    "app/ai/corp/deal-intel/page.tsx", "app/ai/corp/risk-assessment/page.tsx", "app/ai/debt-collection/page.tsx",
    "app/ai/fee-calculator/page.tsx", "app/ai/templates/page.tsx", "components/translation/TranslationComponents.tsx",
    "components/draft/DraftPreStep.tsx",
  ]) {
    const body = code(rel);
    assert.ok(!/<Link\s+href="\/ai\/(contracts|wargaming|brief-check)"/.test(body), `${rel}: a plain Link to a lawyer tool`);
    assert.match(body, /<LawyerToolLink[\s\S]{0,40}href="\/ai\//, rel);
  }
  const gate = src("components/ai/LawyerToolLink.tsx");
  assert.ok(gate.includes("if (user.loading || !canSeeLawyerTools(user.userType)) return null;"));
  assert.match(src("app/dashboard/business/kanban/CaseGraphView.tsx"), /\{canImport && canSeeLawyerTools\(userType\) && \(\n\s*<button\n\s*onClick=\{\(\) => void suggestLawCards\(\)\}/);
  assert.ok(src("app/dashboard/client/services/page.tsx").includes(".filter((service) => !isLawyerOnlyAiHref(service.route))"));
});

test("Q443: the client welcome bar makes no pending promise", () => {
  const page = code("app/dashboard/client/page.tsx");
  assert.ok(!page.includes('href="/ai/consult"'), "the «اسأل ذكاء نظامي · قريباً» button is back");
  assert.ok(!page.includes('href: "/ai/consult"'));
  assert.match(page, /const QUICK_SERVICES = \[[\s\S]*href: "\/ai\/quick-answer"[\s\S]*href: "\/ai\/legal-opinion"[\s\S]*\];/);
  for (const href of ["/ai/quick-answer", "/ai/legal-opinion"]) {
    const tool = href === "/ai/quick-answer" ? "quick-answer" : "legal-opinion-consult";
    for (const t of ["individual", "corporate"]) assert.ok(AI_TOOLS[tool].roles.includes(t), `${tool} × ${t}`);
  }
});
