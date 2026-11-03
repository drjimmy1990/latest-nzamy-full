/**
 * adminSimulation.test.ts — S6 Part D (slice A §6.1.2), preflight ruling R27.
 *
 * Pins:
 *   1. the «عرض كـ» options and the strict parser;
 *   2. that every reader ignores the simulation unless the REAL role is admin;
 *   3. (source scan) that the simulation is UI-only — it never reaches
 *      useUser(), a guard, routeAccess, src/proxy.ts, an API, or a request.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/nav/adminSimulation.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMIN_SIM_STORAGE_KEY,
  ADMIN_SWITCH_OPTIONS,
  parseAdminSimulation,
  parseStoredAdminSimulation,
  readStoredAdminSimulation,
  isUnderHref,
  adminBypassesUiGates,
  adminSimulatesConsultant,
  simulatedFirmRole,
  simulatedNavIdentity,
  switchOptionFor,
  writeStoredAdminSimulation,
  type AdminSimulation,
} from "./adminSimulation.ts";
import type { AdminView, ViewStorage } from "./shellContext.ts";
import { getSidebarByUserType } from "../../constants/navigation.sidebars.ts";
import type { SidebarGroup } from "../../constants/navigation.types.ts";

function memoryStorage(initial: Record<string, string> = {}): ViewStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, v); },
  };
}

// ─── S6-T15: options and model ───────────────────────────────────────────────

test("S6: the switch options and the simulation", () => {
  assert.equal(ADMIN_SWITCH_OPTIONS.length, 14);
  assert.equal(new Set(ADMIN_SWITCH_OPTIONS.map((o) => o.id)).size, 14, "ids are unique");
  for (const o of ADMIN_SWITCH_OPTIONS) {
    assert.ok(o.href.startsWith("/dashboard/"), o.id);
    assert.ok(parseAdminSimulation({ ...o.sim, mode: "override" }), `${o.id}: its own sim parses`);
  }
  assert.deepEqual(
    [...new Set(ADMIN_SWITCH_OPTIONS.map((o) => o.group))],
    ["المهنيون", "العملاء", "الجهات", "الإدارة"],
  );
  assert.ok(ADMIN_SWITCH_OPTIONS.some((o) => o.label === "مستشار (م ١٨)" && o.sim.practiceKind === "consultant"));

  const judge = { view: "government", governmentRole: "judge", mode: "simulate" };
  assert.deepEqual(parseAdminSimulation(judge), judge);
  assert.equal(parseAdminSimulation({ view: "government", governmentRole: "king", mode: "simulate" }), null);

  const consultant: AdminSimulation = { view: "lawyer", practiceKind: "consultant", mode: "override" };
  assert.deepEqual(simulatedNavIdentity("admin", consultant, "lawyer"), {
    practiceKind: "consultant", affiliationRole: null, governmentRole: null,
  });
  assert.equal(simulatedNavIdentity("lawyer", consultant, "lawyer"), null, "a stale value in a non-admin tab is ignored");
  assert.equal(simulatedNavIdentity("admin", consultant, "firm"), null, "a sim for another dashboard is ignored");
});

test("the parser is strict: unknown keys, values, modes and misplaced sub-roles are null", () => {
  for (const junk of [
    null, undefined, "lawyer", 1, [], {},
    { view: "lawyer" },                                              // no mode
    { view: "lawyer", mode: "god" },
    { view: "superuser", mode: "override" },
    { view: "business", mode: "override" },                          // URL segment, not a view
    { view: "lawyer", mode: "override", practiceKind: "judge" },
    { view: "firm", mode: "override", practiceKind: "consultant" },  // sub-role on the wrong dashboard
    { view: "lawyer", mode: "override", governmentRole: "judge" },
    { view: "firm", mode: "override", affiliationRole: "partner" },
    { view: "admin", mode: "override", userType: "admin" },          // extra key
    { view: "admin", mode: "override", role: "lawyer" },
  ]) {
    assert.equal(parseAdminSimulation(junk), null, JSON.stringify(junk));
  }
  assert.equal(parseStoredAdminSimulation("{not json"), null);
  assert.equal(parseStoredAdminSimulation(null), null);
});

test("storage: round-trip, unchanged value is no write, blocked storage never throws", () => {
  const s = memoryStorage();
  const sim: AdminSimulation = { view: "firm", affiliationRole: "lawyer", mode: "simulate" };
  assert.equal(writeStoredAdminSimulation(s, sim), true);
  assert.equal(writeStoredAdminSimulation(s, sim), false, "unchanged: no write, no event");
  assert.deepEqual(readStoredAdminSimulation(s), sim);
  assert.equal(writeStoredAdminSimulation(s, { view: "nope", mode: "simulate" } as unknown as AdminSimulation), false, "an invalid sim is never written");
  assert.deepEqual(readStoredAdminSimulation(s), sim);

  const hand = memoryStorage({ [ADMIN_SIM_STORAGE_KEY]: '{"view":"government","governmentRole":"emperor","mode":"simulate"}' });
  assert.equal(readStoredAdminSimulation(hand), null, "a hand-edited value outside the list is ignored");

  const throwing: ViewStorage = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("QuotaExceededError"); },
  };
  assert.equal(readStoredAdminSimulation(throwing), null);
  assert.equal(writeStoredAdminSimulation(throwing, sim), false);
  assert.equal(readStoredAdminSimulation(null), null);
  assert.equal(writeStoredAdminSimulation(undefined, sim), false);
});

test("a hand-edited simulation in a non-admin tab is ignored for every account type", () => {
  for (const realUserType of ["lawyer", "firm", "individual", "corporate", "micro", "government", "ngo", "provider", null] as const) {
    for (const o of ADMIN_SWITCH_OPTIONS) {
      for (const mode of ["override", "simulate"] as const) {
        const sim = { ...o.sim, mode };
        assert.equal(simulatedNavIdentity(realUserType, sim, o.sim.view), null, `${realUserType} ${o.id}`);
      }
    }
  }
});

test("S6-T16: the selected «عرض كـ» entry follows the drawn dashboard and the stored sub-role", () => {
  assert.equal(switchOptionFor(null, null), null);
  assert.equal(switchOptionFor("lawyer", null)?.id, "lawyer-advocate");
  assert.equal(switchOptionFor("lawyer", { view: "lawyer", practiceKind: "consultant", mode: "simulate" })?.id, "lawyer-consultant");
  assert.equal(switchOptionFor("firm", { view: "lawyer", practiceKind: "consultant", mode: "simulate" })?.id, "firm-managing-partner",
    "a sim for another dashboard does not pick the entry");
  assert.equal(switchOptionFor("government", { view: "government", governmentRole: "officer", mode: "override" })?.id, "gov-officer");
  assert.equal(switchOptionFor("corporate", null)?.id, "corporate");
  assert.equal(switchOptionFor("admin", null)?.id, "admin");
  for (const v of ["admin", "lawyer", "firm", "individual", "corporate", "micro", "provider", "government", "ngo"] as const) {
    assert.ok(switchOptionFor(v, null), `${v} has an entry`);
  }
  assert.equal(isUnderHref("/dashboard/lawyer/cases", "/dashboard/lawyer"), true);
  assert.equal(isUnderHref("/dashboard/lawyer", "/dashboard/lawyer"), true);
  assert.equal(isUnderHref("/dashboard/lawyerish", "/dashboard/lawyer"), false);
  assert.equal(isUnderHref("/ai/draft", "/dashboard/firm"), false);
});

// ─── S6-T17: menus follow the simulated sub-role ─────────────────────────────

const labels = (groups: SidebarGroup[]) => groups.map((g) => `${g.title}:${g.items.map((i) => i.label).join(",")}`);

/** What SharedSidebar / GlobalSearch pass, for an admin session (own values all null). */
function adminMenu(sim: AdminSimulation | null, navView: AdminView) {
  const simId = simulatedNavIdentity("admin", sim, navView);
  return getSidebarByUserType(
    navView, "full", null, [],
    simId ? simId.governmentRole : null, null,
    simId ? simId.affiliationRole : null, false, null,
    simId ? simId.practiceKind : null, null,
  );
}

test("S6: an admin simulating a judge gets the judge's menu", () => {
  const judge = getSidebarByUserType("government", "full", null, [], "judge");
  assert.deepEqual(labels(adminMenu({ view: "government", governmentRole: "judge", mode: "override" }, "government")), labels(judge));
  for (const role of ["prosecutor", "officer", "gov_counsel"] as const) {
    assert.deepEqual(
      labels(adminMenu({ view: "government", governmentRole: role, mode: "simulate" }, "government")),
      labels(getSidebarByUserType("government", "full", null, [], role)),
      role,
    );
  }
  // «مستشار (م ١٨)»: the consultant lawyer menu — no pleading items.
  assert.deepEqual(
    labels(adminMenu({ view: "lawyer", practiceKind: "consultant", mode: "override" }, "lawyer")),
    labels(getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, null, "consultant")),
  );
  assert.notDeepEqual(
    labels(adminMenu({ view: "lawyer", practiceKind: "consultant", mode: "override" }, "lawyer")),
    labels(adminMenu(null, "lawyer")),
    "the consultant menu is not the advocate's",
  );
  // A firm member's menu is the lawyer-role firm menu.
  assert.deepEqual(
    labels(adminMenu({ view: "firm", affiliationRole: "lawyer", mode: "override" }, "firm")),
    labels(getSidebarByUserType("firm", "full", null, [], null, null, "lawyer")),
  );
  // A sim for another dashboard leaves the menu as the plain view's.
  assert.deepEqual(
    labels(adminMenu({ view: "lawyer", practiceKind: "consultant", mode: "override" }, "government")),
    labels(getSidebarByUserType("government", "full", null, [], null)),
  );
});

test("S6-T17: the shells take the menu sub-role from simulatedNavIdentity, else the user's own", () => {
  for (const r of ["components/dashboard/SharedSidebar.tsx", "components/dashboard/GlobalSearch.tsx"]) {
    const c = code(readSrc(r));
    assert.match(c, /const simId = simulatedNavIdentity\(sessionUserType, adminSim, userType\);/, r);
    assert.match(c, /simId \? simId\.governmentRole : governmentRole/, r);
    assert.match(c, /simId \? simId\.affiliationRole : affiliation\?\.role/, r);
    assert.match(c, /simId \? simId\.practiceKind : practiceKind/, r);
  }
  assert.match(code(readSrc("app/dashboard/government/page.tsx")),
    /resolveGovernmentRole\(simId\?\.governmentRole \?\? user\.governmentRole\)/);
});

test("S6-T17 guard: the request and consultation intake files never import the simulation", () => {
  for (const r of REQUEST_FILES) {
    const c = code(readSrc(r));
    assert.doesNotMatch(c, /useAdminSimulation|adminSimulation/, r);
  }
});

// ─── S6-T18: «محاكاة القيود» applies the UI gates ─────────────────────────────

test("S6: simulate mode drops the admin's UI bypass only", () => {
  assert.equal(adminBypassesUiGates("admin", null), true);
  assert.equal(adminBypassesUiGates("admin", { view: "corporate", mode: "override" }), true);
  assert.equal(adminBypassesUiGates("admin", { view: "corporate", mode: "simulate" }), false);
  assert.equal(adminBypassesUiGates("corporate", null), false);
  for (const t of ["lawyer", "firm", "individual", "corporate", "micro", "government", "ngo", "provider", null] as const) {
    assert.equal(adminBypassesUiGates(t, { view: "corporate", mode: "override" }), false, `${t}: never bypassed`);
  }

  const consultant: AdminSimulation = { view: "lawyer", practiceKind: "consultant", mode: "simulate" };
  assert.equal(adminSimulatesConsultant("admin", consultant), true);
  assert.equal(adminSimulatesConsultant("admin", { ...consultant, mode: "override" }), false);
  assert.equal(adminSimulatesConsultant("admin", { view: "lawyer", practiceKind: "advocate", mode: "simulate" }), false);
  assert.equal(adminSimulatesConsultant("lawyer", consultant), false, "a hand-edited value in a lawyer's tab is ignored");

  assert.equal(simulatedFirmRole("admin", { view: "firm", affiliationRole: "lawyer", mode: "simulate" }), "lawyer");
  assert.equal(simulatedFirmRole("admin", { view: "firm", affiliationRole: "managing_partner", mode: "simulate" }), "managing_partner");
  assert.equal(simulatedFirmRole("admin", { view: "firm", affiliationRole: "lawyer", mode: "override" }), null);
  assert.equal(simulatedFirmRole("admin", { view: "lawyer", practiceKind: "consultant", mode: "simulate" }), null);
  assert.equal(simulatedFirmRole("firm", { view: "firm", affiliationRole: "lawyer", mode: "simulate" }), null);
});

test("S6-T18: the three gates use the helpers; the session role still feeds quick add and the guards", () => {
  const business = code(readSrc("app/dashboard/business/layout.tsx"));
  assert.match(business, /const sectionHidden = !adminBypassesUiGates\(userType, adminSim\) && isHiddenBusinessSection\(pathname\);/);
  assert.match(business, /<UserTypeGuard allowedTypes=\{\["corporate", "admin"\]\}>/);

  const gate = code(readSrc("components/dashboard/ConsultantGate.tsx"));
  assert.match(gate, /practiceKind === "consultant" \|\| adminSimulatesConsultant\(userType, adminSim\)/);

  const firm = code(readSrc("app/dashboard/firm/layout.tsx"));
  assert.match(firm, /const effectiveRole: FirmRole = simulatedRole \?\? activeRole;/);
  assert.match(firm, /FIRM_ROLES\.find\(\(r\) => r\.role === effectiveRole\)!/);
  assert.match(firm, /<QuickAddProvider scope="firm" firmRole=\{sessionRole\}/, "quick add keeps the session role");
  assert.match(firm, /<UserTypeGuard allowedTypes=\{\["firm", "admin"\]\}>/);
  assert.doesNotMatch(firm.slice(firm.indexOf("simulatedFirmRole(")), /setDemoSession\([^)]*simulated/, "the simulation never rewrites the session");
});

// ─── R27: the simulation is UI only (source scan) ────────────────────────────
//
// Three layers, so a later change that wires the simulation into a request
// fails here:
//   a. the ONLY files allowed to import the simulation are listed below — a
//      new importer (a request page, a service, an API route) fails until a
//      reviewer adds it on purpose;
//   b. the two simulation modules contain no request, session or guard code;
//   c. inside each allowed importer, no request call or request-building
//      line (fetch args, body:, headers:, JSON.stringify) names the
//      simulation; and no server-side or request file mentions it at all.
// Each predicate is run against a planted fixture first (negative control).

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const rel = (abs: string) => relative(SRC, abs).split(sep).join("/");
const readSrc = (r: string) => readFileSync(join(SRC, r), "utf8");

/**
 * Source without comments (the docblocks quote the very names this bans).
 * A small scanner, not a regex: a line comment like «every /ai/* tool» must
 * not open a block comment, and "https://…" in a string is not a comment.
 */
function code(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        else if (c !== "`" && src[j] === "\n") break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(abs);
  }
  return out;
}

/** Imports the simulation module or its hook (static, dynamic or require). */
function importsSimulation(src: string): boolean {
  return /(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*["'][^"']*\b(?:adminSimulation|useAdminSimulation)(?:\.tsx?)?["']/.test(code(src));
}

/** Reads the simulation's storage key directly, bypassing the module. */
function readsSimulationKey(src: string): boolean {
  return /nzamy_admin_sim|nzamy:admin-sim/.test(code(src));
}

const SIM_NAMES = /\b(?:adminSim\w*|simId\w*|sim|useAdminSimulation|setAdminSimulation|simulatedNavIdentity|adminBypassesUiGates|ADMIN_SIM_\w+|ADMIN_SWITCH_OPTIONS)\b/;
const REQUEST_CALL = /\b(?:fetch|apiFetch|authedFetch|sendBeacon|axios(?:\.\w+)?)\s*\(/g;

/** The argument text of every request call (balanced parentheses). */
function requestCallArgs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(REQUEST_CALL)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    out.push(src.slice(start, i + 1));
  }
  return out;
}

/** The simulation reaches a request: a call's arguments or a body/header-building line name it. */
function simulationLeaksIntoRequest(src: string): boolean {
  const c = code(src);
  if (requestCallArgs(c).some((args) => SIM_NAMES.test(args))) return true;
  return c.split("\n").some((line) =>
    /\b(?:body|headers)\s*:|JSON\.stringify\(|new\s+(?:Request|Headers|FormData)\(|\.set(?:Header)?\(\s*["'][xX]-/.test(line) &&
    SIM_NAMES.test(line));
}

/** Request, session or guard code that must never sit in a simulation module. */
const BANNED_IN_SIM_MODULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["fetch(", /\bfetch\s*\(/],
  ["XMLHttpRequest", /XMLHttpRequest/],
  ["sendBeacon", /sendBeacon/],
  ["useUser()", /\buseUser\s*\(/],
  ["a value import from useUser", /import\s+(?!type\b)[^;]*from\s*["']@\/hooks\/useUser["']/],
  ["setDemoSession", /setDemoSession/],
  ["routeAccess", /routeAccess/],
  ["requireStaff", /requireStaff/],
  ["requireAdmin", /requireAdmin/],
  ["assertRole", /assertRole/],
  ["UserTypeGuard", /UserTypeGuard/],
  ["EntityRouteGuard", /EntityRouteGuard/],
  ["supabase", /supabase/i],
  ["headers", /\bheaders\b/i],
  ["proxy", /\bproxy\b/],
  ["localStorage", /localStorage/],
];
function bannedInSimModule(src: string): string[] {
  const c = code(src);
  return BANNED_IN_SIM_MODULES.filter(([, re]) => re.test(c)).map(([name]) => name);
}

/** The only files allowed to import the simulation. Add one only after review (R27). */
const ALLOWED_IMPORTERS = new Set<string>([
  "hooks/useAdminSimulation.ts",
  "components/dashboard/AdminViewSwitch.tsx",   // S6-T16: writes this tab's sim; no request code
  "components/dashboard/SharedSidebar.tsx",     // S6-T17: menu sub-role only
  "components/dashboard/GlobalSearch.tsx",      // S6-T17: menu sub-role only (its reads never carry it)
  "app/dashboard/government/page.tsx",          // S6-T17: the home's role panel only
  "app/dashboard/business/layout.tsx",          // S6-T18: the hidden-section notice only
  "components/dashboard/ConsultantGate.tsx",    // S6-T18: the Art. 18 lock panel only
  "app/dashboard/firm/layout.tsx",              // S6-T18: FirmRoleContext only (quick add keeps the session role)
]);

/** Importers that are not on the reviewed list. */
function unexpectedImporters(importers: string[]): string[] {
  return importers.filter((r) => !ALLOWED_IMPORTERS.has(r));
}

/** S6-T17: the request / consultation intake files — they stamp the real role into a body. */
const REQUEST_FILES = [
  "app/dashboard/client/requests/new/page.tsx",
  "app/dashboard/client/consultation/new/page.tsx",
  "hooks/useConsultationForm.ts",
  "components/floating/whatsappWorkflow.ts",
];

/** Server-side, session, guard and request files: none may even mention the simulation. */
function isServerOrRequestFile(r: string): boolean {
  return (
    r === "proxy.ts" ||
    r === "middleware.ts" ||
    r.startsWith("app/api/") ||
    r.startsWith("lib/auth/") ||
    r.startsWith("lib/supabase/") ||
    r === "hooks/useUser.ts" ||
    r === "hooks/userSession.ts" ||
    r === "components/dashboard/UserTypeGuard.tsx" ||
    r === "components/dashboard/EntityRouteGuard.tsx" ||
    REQUEST_FILES.includes(r)
  );
}

test("R27 negative control: each predicate flags a planted leak and passes a clean file", () => {
  const leak = [
    'import { useAdminSimulation } from "@/hooks/useAdminSimulation";',
    "const adminSim = useAdminSimulation(true);",
    'await fetch("/api/v1/service-requests", { method: "POST", body: JSON.stringify({ role: adminSim?.view }) });',
  ].join("\n");
  assert.equal(importsSimulation(leak), true);
  assert.equal(simulationLeaksIntoRequest(leak), true);
  assert.equal(simulationLeaksIntoRequest('fetch(url, { headers: { "x-view": adminSim.view } })'), true);
  assert.equal(simulationLeaksIntoRequest('const h = { headers: { "x-sim": sim.mode } };'), true);
  assert.equal(importsSimulation('const m = await import("../lib/nav/adminSimulation.ts");'), true);
  assert.equal(importsSimulation('// import { x } from "@/lib/nav/adminSimulation";'), false, "a comment imports nothing");
  assert.equal(readsSimulationKey('sessionStorage.getItem("nzamy_admin_sim")'), true);
  // The comment stripper: «/ai/*» in a line comment opens nothing; a URL in a string stays.
  assert.equal(code('// every /ai/* tool\nconst simId = 1; /* gone */ const u = "https://x";'), '\nconst simId = 1;  const u = "https://x";');

  const clean = 'import { useUser } from "@/hooks/useUser";\nfetch("/api/v1/x", { body: JSON.stringify({ role: user.userType }) });';
  assert.equal(importsSimulation(clean), false);
  assert.equal(simulationLeaksIntoRequest(clean), false);

  assert.deepEqual(bannedInSimModule('import { useUser } from "@/hooks/useUser";\nuseUser();\nfetch("/x");'),
    ["fetch(", "useUser()", "a value import from useUser"]);
  assert.deepEqual(bannedInSimModule('import type { UserType } from "@/hooks/useUser";\n/* fetch() useUser() */'), [],
    "a type import and a comment are allowed");

  // The allowlist check itself: a planted importer outside the list is reported.
  assert.deepEqual(
    unexpectedImporters(["hooks/useAdminSimulation.ts", "app/dashboard/client/requests/new/page.tsx"]),
    ["app/dashboard/client/requests/new/page.tsx"],
  );
  assert.equal(isServerOrRequestFile("app/dashboard/client/requests/new/page.tsx"), true);
  assert.equal(isServerOrRequestFile("app/api/v1/service-requests/route.ts"), true);
  assert.equal(isServerOrRequestFile("components/dashboard/SharedSidebar.tsx"), false);
});

test("R27: the simulation modules hold no request, session or guard code", () => {
  for (const r of ["lib/nav/adminSimulation.ts", "hooks/useAdminSimulation.ts"]) {
    assert.deepEqual(bannedInSimModule(readSrc(r)), [], r);
  }
});

test("R27: only the reviewed UI files import the simulation; none sends it in a request", () => {
  const files = walk(SRC).map((abs) => ({ r: rel(abs), src: readFileSync(abs, "utf8") }));
  const importers = files.filter((f) => importsSimulation(f.src)).map((f) => f.r).sort();
  assert.deepEqual(unexpectedImporters(importers), [],
    "a new importer of the simulation must be reviewed against R27 and added to ALLOWED_IMPORTERS");
  assert.deepEqual(importers, [...ALLOWED_IMPORTERS].sort(), "every listed importer still imports it (no stale entry)");

  for (const f of files) {
    if (f.r !== "lib/nav/adminSimulation.ts") {
      assert.equal(readsSimulationKey(f.src), false, `${f.r} reads the simulation's storage key directly`);
    }
    if (importsSimulation(f.src)) {
      assert.equal(simulationLeaksIntoRequest(f.src), false, `${f.r}: the simulation reaches a request`);
    }
    if (isServerOrRequestFile(f.r)) {
      assert.doesNotMatch(code(f.src), /adminSimulation|useAdminSimulation|simulatedNavIdentity|adminBypassesUiGates/, f.r);
    }
  }
  // The four intake files exist (a rename must not silently empty the guard).
  for (const r of REQUEST_FILES) assert.ok(files.some((f) => f.r === r), `${r} exists`);
});
