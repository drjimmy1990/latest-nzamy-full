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
  simulatedNavIdentity,
  writeStoredAdminSimulation,
  type AdminSimulation,
} from "./adminSimulation.ts";
import type { ViewStorage } from "./shellContext.ts";

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

/** Source without comments (the docblocks quote the very names this bans). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
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
