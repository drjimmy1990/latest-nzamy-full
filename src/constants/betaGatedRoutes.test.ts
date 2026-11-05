/**
 * betaGatedRoutes.test.ts — Wave 1 task 6: a nav row is a promise about the
 * page under it. Every row that opens a tool which ends at the beta gate's
 * "not available" card says «قريباً» (not «جديد», not a role badge), and the
 * route lists themselves stay true to the page code.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/betaGatedRoutes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMING_SOON_BADGE_AR,
  COMING_SOON_TOOL_ROUTES,
  GATE_ONLY_TOOL_ROUTES,
  LIVE_ROUTES_WITH_GATED_PARTS,
  TERMINAL_TOOL_ROUTES,
  isLiveForLawyerAndFirm,
  isTerminalToolHref,
  routeOf,
} from "./betaGatedRoutes.ts";
import { LAWYER_AI_TOOLS } from "./lawyerAiCatalog.ts";
import { getLawyerAiBadge } from "./lawyerAiBadges.ts";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

/** Every file under a directory (recursive). */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}
const appDir = (route: string) => path.join(SRC, "app", ...route.split("/").filter(Boolean));

// ── The lists ────────────────────────────────────────────────────────────────

test("every route of the beta gate's registry is classified exactly once", () => {
  const registry = new Set([...read("lib/betaConfig.ts").matchAll(/route: "([^"]+)"/g)].map((m) => m[1]));
  assert.ok(registry.size >= 40, `found only ${registry.size} routes — the parser broke`);
  const lists = [GATE_ONLY_TOOL_ROUTES, COMING_SOON_TOOL_ROUTES, Object.keys(LIVE_ROUTES_WITH_GATED_PARTS)] as readonly (readonly string[])[];
  for (const route of registry) {
    const hits = lists.filter((l) => l.includes(route)).length;
    assert.equal(hits, 1, `${route} is in ${hits} lists (expected 1) — classify it in betaGatedRoutes.ts`);
  }
  for (const l of lists) for (const route of l) assert.ok(registry.has(route), `${route} is not in LEGAL_DATA_REVIEW_GATED_TOOLS`);
});

test("a gate-only route runs no AI and renders BetaReviewGate", () => {
  for (const route of GATE_ONLY_TOOL_ROUTES) {
    const files = filesUnder(appDir(route));
    assert.ok(files.length > 0, `${route} has no page`);
    for (const f of files) {
      assert.doesNotMatch(readFileSync(f, "utf8"), /useAiRun|\/api\/v1\/ai\//, `${route}: ${path.basename(f)} starts an AI run — it is not gate-only`);
    }
    assert.ok(files.some((f) => readFileSync(f, "utf8").includes("BetaReviewGate")), `${route} renders no BetaReviewGate`);
  }
});

test("a gate-only page shows the gate first: its default export is GatedToolScreen around the page", () => {
  const cfg = read("lib/betaConfig.ts");
  for (const route of GATE_ONLY_TOOL_ROUTES) {
    const page = readFileSync(path.join(appDir(route), "page.tsx"), "utf8");
    if (route === "/ai/analyze") {
      // Terminal for clients: they get the gated analyzer. Lawyers, firms and
      // admins get the real case brief, whose AI path is only the studio.
      assert.match(page, /<GatedToolScreen toolId="analyze\.smart\.result"[^>]*>\s*<SmartAnalyzer /, route);
      assert.match(page, /<AttachmentSqueezer \/>/, route);
      assert.match(read("app/ai/analyze/_components/AttachmentSqueezer.tsx"), /<CaseBriefStudio \/>/, route);
      continue;
    }
    const m = /export default function \w+\(\) \{\s*return \(\s*<GatedToolScreen toolId="([^"]+)" toolName="[^"]+">\s*<(\w+) \/>\s*<\/GatedToolScreen>\s*\);\s*\}/.exec(page);
    assert.ok(m, `${route}: the default export does not open with GatedToolScreen`);
    assert.ok(cfg.includes(`{ id: "${m[1]}", route: "${route}"`), `${route}: toolId ${m[1]} is not this route's registry id`);
    assert.match(page, new RegExp(`^function ${m[2]}\\(\\) \\{`, "m"), `${route}: ${m[2]} is not the page body`);
    assert.equal((page.match(/^export default /gm) ?? []).length, 1, route);
  }
  const screen = read("components/GatedToolScreen.tsx");
  assert.match(screen, /if \(!BETA_REVIEW_MODE \|\| user\.isDemoBypass\) return <>\{children\}<\/>;/);
  assert.match(screen, /<BetaReviewGate toolId=\{toolId\} toolName=\{toolName\} reviewScope="legal-data">\s*\{null\}/);
});

test("a coming-soon route renders DashboardComingSoon", () => {
  for (const route of COMING_SOON_TOOL_ROUTES) {
    assert.match(readFileSync(path.join(appDir(route), "page.tsx"), "utf8"), /from "@\/components\/ui\/DashboardComingSoon"/, route);
  }
});

test("a live route really has a working path", () => {
  const live: Record<string, string[]> = {
    "/ai/draft": ["components/draft/steps/StepAiDraft.tsx"],
    "/ai/procedures": [],
  };
  for (const route of Object.keys(LIVE_ROUTES_WITH_GATED_PARTS)) {
    if (route === "/ai/procedures") {
      // Real directories: the courts/circuits components the page renders.
      assert.ok(existsSync(path.join(appDir(route), "_CircuitsDirectory.tsx")), route);
      continue;
    }
    const files = live[route]?.map((rel) => path.join(SRC, rel)) ?? filesUnder(appDir(route));
    assert.ok(files.some((f) => /useAiRun/.test(readFileSync(f, "utf8"))), `${route} has no useAiRun path — it belongs in a terminal list`);
  }
});

test("/ai/analyze stays terminal for clients and is the one route live for lawyer and firm", () => {
  assert.equal(isTerminalToolHref("/ai/analyze"), true);
  assert.equal(isLiveForLawyerAndFirm("/ai/analyze"), true);
  assert.equal(isLiveForLawyerAndFirm("/ai/analyze?source=labor"), true);
  assert.equal(isLiveForLawyerAndFirm("/ai/consult"), false);
  assert.notEqual(LAWYER_AI_TOOLS.find((t) => t.href === "/ai/analyze")?.comingSoon, true);
});

test("routeOf / isTerminalToolHref strip the query and hash", () => {
  assert.equal(routeOf("/ai/consult?ctx=arbitration"), "/ai/consult");
  assert.equal(routeOf("/ai/analyze#x"), "/ai/analyze");
  assert.equal(isTerminalToolHref("/ai/analyze?source=labor"), true);
  assert.equal(isTerminalToolHref("/ai/contract-drafter"), false);
  assert.equal(isTerminalToolHref("/ai/consultation"), false);
  assert.equal(TERMINAL_TOOL_ROUTES.length, GATE_ONLY_TOOL_ROUTES.length + COMING_SOON_TOOL_ROUTES.length);
});

// ── The rows ─────────────────────────────────────────────────────────────────

/** Files whose `{ label, href, badge }` rows render a nav, sidebar or hub link. */
function navFiles(): string[] {
  return [
    ...readdirSync(path.join(SRC, "constants"))
      .filter((f) => /^navigation.*\.ts$/.test(f) && !f.includes(".test."))
      .map((f) => `constants/${f}`),
    "components/floating/constants/floatingServices.tsx",
  ];
}

test("every nav / sidebar / floating-menu row that opens a gated tool says «قريباً»", () => {
  let terminalRows = 0;
  for (const rel of navFiles()) {
    read(rel).split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/href: "([^"]+)"/g)) {
        if (!isTerminalToolHref(m[1])) continue;
        terminalRows++;
        assert.match(line, /label: "/, `${rel}:${i + 1}: a row split over lines — check its badge by hand`);
        const badge = /badge: "([^"]+)"/.exec(line)?.[1] ?? null;
        assert.equal(badge, COMING_SOON_BADGE_AR, `${rel}:${i + 1} ${m[1]} is badged «${badge ?? "none"}», not «قريباً»`);
      }
    });
  }
  // Not vacuous: the gov / ngo / micro / corp sidebars alone carry dozens.
  assert.ok(terminalRows >= 60, `only ${terminalRows} gated rows found — the scan broke`);
});

test("the client navbar's «ذكاء نظامي» opens the hub, not the gated consult page", () => {
  assert.match(read("constants/navigation.navbar.ts"), /label: "ذكاء نظامي",\s+labelEn: "Nezamy AI",\s+href: "\/ai" \}/);
});

test("the /ai hub: every catalog tool on a gated route is «قريباً», and the client cards say so", () => {
  for (const tool of LAWYER_AI_TOOLS) {
    if (!isTerminalToolHref(tool.href) || isLiveForLawyerAndFirm(tool.href)) continue;
    assert.equal(tool.comingSoon, true, `${tool.permission} (${tool.href}) is not comingSoon`);
    assert.equal(getLawyerAiBadge(tool, "ar"), COMING_SOON_BADGE_AR, tool.permission);
  }
  const hub = read("app/ai/page.tsx");
  for (const id of ["ai:consult", "ai:analyze"]) {
    const line = hub.split("\n").find((l) => l.includes(`{ id: "${id}"`));
    assert.ok(line, id);
    assert.match(line, /badgeAr: "قريباً"/, `the legacy ${id} card carries no «قريباً»`);
    assert.doesNotMatch(line, /فورية|instant/i, `the ${id} card still promises an instant answer`);
  }
});

test("dashboards: no gated tool is offered as working", () => {
  const client = read("app/dashboard/client/page.tsx");
  assert.doesNotMatch(client, /desc: "إجابات فورية"/);
  const services = read("app/dashboard/client/services/page.tsx");
  assert.match(services, /const soon = isTerminalToolHref\(service\.route\)/);
  assert.match(services, /comingSoon: soon/);
  const gov = read("app/dashboard/government/page.tsx");
  assert.match(gov, /function SoonChip/);
  assert.equal((gov.match(/<SoonChip href=/g) ?? []).length, 4, "featured, grid, header and quick-nav links each carry the chip");
  assert.doesNotMatch(read("app/dashboard/firm/page.tsx"), /href: "\/ai\/report-generator"/);
  let gated = 0;
  const ngo = read("app/dashboard/ngo/page.tsx");
  for (const m of ngo.matchAll(/sub: "([^"]+)",\s+href: "([^"]+)"/g)) {
    if (isTerminalToolHref(m[2])) { gated++; assert.equal(m[1], COMING_SOON_BADGE_AR, m[2]); }
  }
  const micro = read("app/dashboard/micro/page.tsx");
  for (const m of micro.matchAll(/href: "(\/ai\/[^"]+)",[^\n]*descAr: "([^"]+)"/g)) {
    if (isTerminalToolHref(m[1])) { gated++; assert.equal(m[2], COMING_SOON_BADGE_AR, m[1]); }
  }
  assert.equal(gated, 5, "ngo (3) + micro (2) gated cards found");
});

test("fix round 1 (I4, I5): the micro request catalogue and the arbitrator's tool grid mark gated tools «قريباً»", () => {
  const micro = read("app/dashboard/micro/requests/page.tsx");
  assert.doesNotMatch(micro, /من [٠-٩]+ ر\.س/, "a «من … ر.س» price nothing charges is back");
  let gatedRows = 0;
  for (const m of micro.matchAll(/\{ id: "[^"]+",[^\n]*price: "([^"]*)", href: "([^"]+)" \}/g)) {
    if (isTerminalToolHref(m[2])) { gatedRows++; assert.equal(m[1], "", `${m[2]} carries a typed price`); }
  }
  assert.equal(gatedRows, 3, "consult, contract, notice");
  assert.match(micro, /\.map\(\(s\) => \(\{ \.\.\.s, price: isTerminalToolHref\(s\.href\) \? COMING_SOON_BADGE_AR : s\.price \}\)\)/);

  const arb = read("app/dashboard/provider/components/ArbitratorDashboard.tsx");
  const tiles = [...arb.matchAll(/\{ label: "[^"]+",\s+icon: \w+,\s*href: "([^"]+)" \}/g)].map((m) => m[1]);
  assert.equal(tiles.length, 6, "the grid's six tiles");
  assert.equal(tiles.filter(isTerminalToolHref).length, 4, "analyze, judicial-search, jurisdiction-analyzer, consult");
  assert.match(arb, /\{isTerminalToolHref\(tool\.href\) && \(/);
  assert.match(arb, /\{COMING_SOON_BADGE_AR\}/);
});
