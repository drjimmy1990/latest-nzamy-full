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
import { adminViewSuffix, type AdminView, type ViewStorage } from "./shellContext.ts";
import { getRoleLabel } from "../../constants/navigation.types.ts";
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
  // Review M4: each label is the one the destination screen uses.
  const label = (id: string) => ADMIN_SWITCH_OPTIONS.find((o) => o.id === id)?.label;
  assert.equal(label("lawyer-advocate"), "محامٍ (مرافع)");
  assert.equal(label("individual"), "عميل");
  assert.equal(label("micro"), "منشأة");
  assert.equal(label("gov-prosecutor"), "عضو نيابة عامة");
  assert.equal(label("gov-counsel"), "مستشار حكومي");

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

test("M7: the sidebar header names the admin's view for every dashboard, never a bare role", () => {
  const c = code(readSrc("components/dashboard/SharedSidebar.tsx"));
  assert.match(c, /const viewSuffix = adminViewSuffix\(sessionUserType, userType, isAr\)\s*\?\? \(sessionUserType === "admin" && userType && userType !== "admin" \? getRoleLabel\(userType, isAr\) : null\);/);
  assert.match(c, /const roleLabel = viewSuffix\s*\? `\$\{getRoleLabel\("admin", isAr\)\} · \$\{viewSuffix\}`/);
  // The labels it falls back to exist for every non-lawyer view (lawyer keeps «وضع المحامي»).
  for (const v of ["firm", "individual", "corporate", "micro", "provider", "government", "ngo"] as const) {
    assert.notEqual(getRoleLabel(v, true), "", v);
    assert.equal(adminViewSuffix("admin", v), null, `${v}: falls through to getRoleLabel`);
  }
  assert.equal(adminViewSuffix("admin", "lawyer"), "وضع المحامي");
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
  assert.equal(adminSimulatesConsultant("admin", consultant, "lawyer"), true);
  assert.equal(adminSimulatesConsultant("admin", { ...consultant, mode: "override" }, "lawyer"), false);
  assert.equal(adminSimulatesConsultant("admin", { view: "lawyer", practiceKind: "advocate", mode: "simulate" }, "lawyer"), false);
  assert.equal(adminSimulatesConsultant("lawyer", consultant, "lawyer"), false, "a hand-edited value in a lawyer's tab is ignored");
  // Review M1: a stale consultant sim under another dashboard's shell does not lock.
  for (const other of ["corporate", "firm", "individual", "government", "admin", null] as const) {
    assert.equal(adminSimulatesConsultant("admin", consultant, other), false, String(other));
  }

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
  assert.match(gate, /practiceKind === "consultant" \|\| adminSimulatesConsultant\(userType, adminSim, drawnView\)/);
  assert.match(gate, /const drawnView = isRealAdmin \? resolveAdminView\(pathname, storedView\) : null;/);

  const firm = code(readSrc("app/dashboard/firm/layout.tsx"));
  assert.match(firm, /const effectiveRole: FirmRole = simulatedRole \?\? activeRole;/);
  assert.match(firm, /FIRM_ROLES\.find\(\(r\) => r\.role === effectiveRole\)!/);
  assert.match(firm, /<QuickAddProvider scope="firm" firmRole=\{sessionRole\}/, "quick add keeps the session role");
  assert.match(firm, /<UserTypeGuard allowedTypes=\{\["firm", "admin"\]\}>/);
  assert.doesNotMatch(firm.slice(firm.indexOf("simulatedFirmRole(")), /setDemoSession\([^)]*simulated/, "the simulation never rewrites the session");
});

// ─── R27: the simulation is UI only (source scan) ────────────────────────────
//
// What this scan enforces (and nothing more — review I1 narrowed the claim):
//   a. Importers: the ONLY files that may import the simulation are listed in
//      ALLOWED_IMPORTERS. A new importer (a request page, a service, an API
//      route) fails until a reviewer adds it on purpose.
//   b. The two simulation modules contain no request, session or guard code.
//   c. Taint, inside each allowed importer: every `const/let` binding whose
//      initializer names the simulation (its hook, helpers, options list, or a
//      binding already tainted — followed to a fixed point) is tainted. Then
//        - every call whose ARGUMENTS name a tainted value must have a callee
//          on SAFE_CALLEES (pure UI helpers), a pure built-in method, a React
//          hook, or the file's own reviewed entry in SAFE_BY_FILE;
//        - every JSX attribute naming a tainted value is a leak if it is a URL
//          attribute (href, src, action…), fine on a DOM element or as
//          presentation (className, style…), and on a component must be on
//          SAFE_BY_FILE (a child component could send what it is handed).
//      getSidebarByUserType is the one sanitizer: its result is the static
//      menu config, so a binding made from it is not tainted.
//   d. FirmRoleContext (fed by the simulated firm role): the readers of
//      useFirmRole() / useContext(FirmRoleContext) are listed in
//      FIRM_ROLE_READERS, and the same taint check holds in each of them.
//   e. Server-side, session, guard and request files never mention any
//      export of the simulation modules, and no file outside the module reads
//      its sessionStorage key.
// Every predicate is run against planted fixtures first (negative control),
// including the four probes from the task-6 review.
// NOT enforced: a value laundered through a module-level variable, a call on
// the result of another call (`a().b(x)` checks only `.b` as a pure method),
// or a regex literal containing a quote (the comment scanner does not model
// regex literals). The importer allowlist is the backstop for those.

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

// ── The taint scanner ────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[$]/g, "\\$");

/** The simulation's own names: the hook, the helpers that read it, the options list, the usual variable names. */
const SIM_SEED = /(?<![\w$.])(?:useAdminSimulation|setAdminSimulation|simulatedNavIdentity|adminBypassesUiGates|adminSimulatesConsultant|simulatedFirmRole|switchOptionFor|parse(?:Stored)?AdminSimulation|readStoredAdminSimulation\w*|writeStoredAdminSimulation|ADMIN_SWITCH_OPTIONS|ADMIN_SIM_\w+|adminSim\w*|simId\w*|sim)(?![\w$])/;
/** FirmRoleContext's readers: the value they read is the (possibly simulated) firm role. */
const FIRM_ROLE_SEED = /(?<![\w$.])(?:useFirmRole\s*\(|useContext\s*\(\s*FirmRoleContext\b)/;

/** Its result is the static menu config: bindings made from it are not tainted. */
const SANITIZERS = /^\s*getSidebarByUserType\s*\(/;

/** Pure UI helpers a simulated value may be handed to (review I1 list, plus setAdminView). */
const SAFE_CALLEES = new Set([
  "simulatedNavIdentity", "adminBypassesUiGates", "adminSimulatesConsultant", "simulatedFirmRole",
  "switchOptionFor", "setAdminSimulation", "useAdminSimulation", "getSidebarByUserType",
  "resolveGovernmentRole", "isUnderHref",
  "setAdminView", // writes the admin VIEW to this tab's sessionStorage (useAdminView.ts) — UI state, R27's own sibling
]);
/** Built-in methods that cannot send anything; the binding they produce stays tainted, so the later sink is still checked. */
const PURE_METHODS = new Set([
  "includes", "find", "findIndex", "filter", "map", "flatMap", "some", "every", "indexOf", "join",
  "startsWith", "endsWith", "slice", "trim", "toLowerCase", "toUpperCase", "concat", "has",
  "Boolean", "String", "Number", "keys", "values", "entries",
]);
/** React hooks: their callbacks' own calls are checked one by one. */
const HOOKS = new Set(["useMemo", "useCallback", "useEffect", "useLayoutEffect", "useState", "useRef"]);
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "typeof", "function", "await", "void", "delete", "in", "of"]);
/** JSX attributes that put a value into a URL or a request. */
const URL_ATTRS = new Set(["href", "src", "action", "formAction", "to", "as", "srcSet", "poster", "data"]);
/** Presentation-only attributes. */
const PRESENTATION = /^(?:className|style|key|size|weight|color|aria-[\w-]+)$/;

/**
 * Reviewed per-file exceptions, each with its reason. A callee here is a call
 * that names a simulated value and was read and judged not to send it.
 */
const SAFE_BY_FILE: Record<string, ReadonlySet<string>> = {
  // opt.href is one of ADMIN_SWITCH_OPTIONS' nine bare /dashboard/<x> paths — no query,
  // no fragment (pinned by "S6-T16: every option href is a bare dashboard path").
  "components/dashboard/AdminViewSwitch.tsx": new Set(["router.push"]),
  // The display role for FirmRoleContext; its readers are pinned in FIRM_ROLE_READERS.
  "app/dashboard/firm/layout.tsx": new Set(["FirmRoleContext.Provider.value"]),
  // The simulated role picks which entries of the page's static maps (ALL_TOOLS,
  // HEADER_ACTIONS_BY_ROLE, QUICK_NAV_BY_ROLE) are shown; each link is that entry's own
  // literal href. Some of those literals carry «?role=judge»-style queries, as they do for
  // a real government account; no proxy rule, API route or page reads `role` from the
  // query (review I1 grep). Only a bare `<entry>.href` is accepted (STATIC_HREF) — a
  // template literal or concatenation in the same attribute is still a leak.
  "app/dashboard/government/page.tsx": new Set(["Link.href:static", "SoonChip.href:static"]),
};

/** `{x.href}`, `{tools[0].href}` — a config entry's own href, nothing built from the value. */
const STATIC_HREF = /^\{\s*[A-Za-z_$][\w$]*(?:\[\d+\]|\.[A-Za-z_$][\w$]*)*\.href\s*\}$/;

/** Where an expression (a declaration initializer) ends: `;`, an unbalanced closer, or a line break that does not continue it. */
function exprEnd(c: string, start: number): number {
  let depth = 0;
  for (let i = start; i < c.length; i++) {
    const ch = c[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < c.length && c[j] !== ch) { if (c[j] === "\\") j++; j++; }
      i = j;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") { if (--depth < 0) return i; }
    else if (depth === 0 && ch === ";") return i;
    else if (depth === 0 && ch === "\n") {
      const before = c.slice(start, i).trimEnd();
      const after = c.slice(i).trimStart();
      if (/(?:[=([{,?:|&+\-*/!<>]|=>)$/.test(before) || before === "") continue;
      if (/^(?:[.?:|&+\-*/)\]},]|\?\?)/.test(after)) continue;
      return i;
    }
  }
  return c.length;
}

/** Every `const/let/var` binding: its names and its initializer text. */
function declarations(c: string): Array<{ names: string[]; init: string }> {
  const out: Array<{ names: string[]; init: string }> = [];
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])\s*(?::[^=;]+?)?=(?![=>])/g;
  for (const m of c.matchAll(re)) {
    const pattern = m[1];
    const names = pattern.startsWith("{") || pattern.startsWith("[")
      ? [...pattern.matchAll(/([A-Za-z_$][\w$]*)\s*(?=[,}\]=]|$)/g)].map((x) => x[1])
      : [pattern];
    const from = m.index! + m[0].length;
    out.push({ names, init: c.slice(from, exprEnd(c, from)) });
  }
  return out;
}

function mentions(text: string, seed: RegExp, tainted: Set<string>): boolean {
  if (seed.test(text)) return true;
  for (const n of tainted) if (new RegExp(`(?<![\\w$.])${esc(n)}(?![\\w$])`).test(text)) return true;
  return false;
}

function taintedNames(c: string, seed: RegExp): Set<string> {
  const decls = declarations(c);
  const tainted = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of decls) {
      if (d.names.every((n) => tainted.has(n)) || SANITIZERS.test(d.init)) continue;
      if (mentions(d.init, seed, tainted)) {
        for (const n of d.names) tainted.add(n);
        changed = true;
      }
    }
  }
  return tainted;
}

function balanced(c: string, open: number): string {
  const o = c[open];
  const cl = o === "(" ? ")" : o === "{" ? "}" : "]";
  let depth = 0;
  for (let i = open; i < c.length; i++) {
    const ch = c[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < c.length && c[j] !== ch) { if (c[j] === "\\") j++; j++; }
      i = j;
      continue;
    }
    if (ch === o) depth++;
    else if (ch === cl && --depth === 0) return c.slice(open, i + 1);
  }
  return c.slice(open);
}

/** Every place a simulated value leaves for something other than a reviewed UI helper. */
function simulationSinks(src: string, file = "", seed: RegExp = SIM_SEED): string[] {
  const c = code(src);
  const tainted = taintedNames(c, seed);
  const safe = SAFE_BY_FILE[file] ?? new Set<string>();
  const sinks: string[] = [];

  // Calls (identifier chains, and `.method(` after a call or index).
  const callRe = /(?<![\w$.])((?:[A-Za-z_$][\w$]*)(?:\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*)*)\s*(?:<[^<>()]*>)?\s*\(|[)\]]\s*\??\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  for (const m of c.matchAll(callRe)) {
    const callee = (m[1] ?? `….${m[2]}`).replace(/\s+/g, "").replace(/\?\./g, ".");
    const open = m.index! + m[0].length - 1;
    const args = balanced(c, open);
    if (!mentions(args, seed, tainted)) continue;
    const head = callee.split(".")[0];
    const last = callee.split(".").pop()!;
    if (KEYWORDS.has(head) || /\bfunction\s*$/.test(c.slice(Math.max(0, m.index! - 12), m.index!))) continue;
    if (SAFE_CALLEES.has(callee) || HOOKS.has(callee) || safe.has(callee)) continue;
    if (callee.includes(".") && PURE_METHODS.has(last)) continue;
    if (!callee.includes(".") && (callee === "Boolean" || callee === "String" || callee === "Number")) continue;
    sinks.push(`${callee}(…)`);
  }

  // JSX attributes.
  for (const m of c.matchAll(/(?<=\s)([A-Za-z_][\w-]*)=\{/g)) {
    const attr = m[1];
    const expr = balanced(c, m.index! + m[0].length - 1);
    if (!mentions(expr, seed, tainted)) continue;
    const lt = c.lastIndexOf("<", m.index!);
    const tag = lt === -1 ? "" : (c.slice(lt + 1).match(/^[A-Za-z][\w.]*/)?.[0] ?? "");
    if (URL_ATTRS.has(attr)) {
      if (!(safe.has(`${tag}.${attr}:static`) && STATIC_HREF.test(expr))) sinks.push(`<${tag} ${attr}>`);
      continue;
    }
    if (PRESENTATION.test(attr)) continue;
    const intrinsic = /^[a-z]/.test(tag) && !tag.includes(".");
    if (intrinsic || tag.startsWith("motion.")) {
      // A form field's value is sent by a native submit.
      if ((attr === "value" || attr === "defaultValue" || attr === "name") && /<form\b/.test(c)) sinks.push(`<${tag} ${attr}> in a <form>`);
      continue;
    }
    if (safe.has(`${tag}.${attr}`)) continue;
    sinks.push(`<${tag} ${attr}>`);
  }

  // Request-building lines (redundant with the call check; kept as a second net).
  for (const line of c.split("\n")) {
    if (/\b(?:body|headers)\s*:|location\.href\s*=/.test(line) && mentions(line, seed, tainted)) sinks.push(`line: ${line.trim().slice(0, 60)}`);
  }
  return sinks;
}

// ── The other predicates ─────────────────────────────────────────────────────

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

/** Files that read FirmRoleContext (S6-T18 feeds it the simulated firm role). Add one only after review. */
const FIRM_ROLE_READERS = new Set<string>([
  "app/dashboard/firm/page.tsx", // reads role.can.* for visibility only
]);
function readsFirmRole(src: string): boolean {
  return FIRM_ROLE_SEED.test(code(src));
}

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

/** M6: every export of the two simulation modules, read from their source. */
function simulationExports(): string[] {
  const names = new Set<string>(["adminSimulation", "useAdminSimulation", "nzamy_admin_sim"]);
  for (const r of ["lib/nav/adminSimulation.ts", "hooks/useAdminSimulation.ts"]) {
    for (const m of code(readSrc(r)).matchAll(/\bexport\s+(?:const|function|type|interface)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  }
  return [...names];
}

test("R27 negative control: each predicate flags a planted leak and passes a clean file", () => {
  const leak = [
    'import { useAdminSimulation } from "@/hooks/useAdminSimulation";',
    "const adminSim = useAdminSimulation(true);",
    'await fetch("/api/v1/service-requests", { method: "POST", body: JSON.stringify({ role: adminSim?.view }) });',
  ].join("\n");
  assert.equal(importsSimulation(leak), true);
  assert.notDeepEqual(simulationSinks(leak), []);
  assert.notDeepEqual(simulationSinks('fetch(url, { headers: { "x-view": adminSim.view } })'), []);
  assert.notDeepEqual(simulationSinks('const h = { headers: { "x-sim": sim.mode } };'), []);
  assert.equal(importsSimulation('const m = await import("../lib/nav/adminSimulation.ts");'), true);
  assert.equal(importsSimulation('// import { x } from "@/lib/nav/adminSimulation";'), false, "a comment imports nothing");
  assert.equal(readsSimulationKey('sessionStorage.getItem("nzamy_admin_sim")'), true);
  // Navigation and props count as leaks too.
  assert.notDeepEqual(simulationSinks('router.push(`/dashboard/government?role=${simId.governmentRole}`);'), []);
  assert.notDeepEqual(simulationSinks('<Link href={`/x?v=${adminSim.view}`}>x</Link>'), []);
  assert.notDeepEqual(simulationSinks('<RequestForm role={simId.practiceKind} />'), []);
  assert.notDeepEqual(simulationSinks('<RequestForm sim={adminSim} />'), []);
  assert.deepEqual(simulationSinks('router.push(opt.href);\n<Link href="/dashboard/lawyer">x</Link>'), []);

  // Review I1 — the four probes that the first scan let through. Each must fail now.
  const probes: Record<string, string> = {
    serviceWrapper:
      "const simId = simulatedNavIdentity(t, adminSim, v);\nconst docs = await getDocuments({ role: simId.practiceKind });",
    alias:
      'const v = adminSim?.view;\nawait fetch("/api/x", { method: "POST", body: JSON.stringify({ v }) });',
    providerValue: [
      "const simulatedRole = simulatedFirmRole(user.userType, adminSim);",
      "const effectiveRole = simulatedRole ?? activeRole;",
      "const roleConfig = FIRM_ROLES.find((r) => r.role === effectiveRole)!;",
      "return <FirmRoleContext.Provider value={roleConfig}>{children}</FirmRoleContext.Provider>;",
    ].join("\n"),
    derivedHref: [
      "const role = resolveGovernmentRole(simId?.governmentRole ?? user.governmentRole);",
      "return <Link href={`/dashboard/government/cases?role=${role}`}>x</Link>;",
    ].join("\n"),
  };
  for (const [name, src] of Object.entries(probes)) {
    assert.notDeepEqual(simulationSinks(src), [], `probe ${name} must be flagged`);
  }
  // …and the provider probe passes only in the file whose provider was reviewed.
  assert.deepEqual(simulationSinks(probes.providerValue, "app/dashboard/firm/layout.tsx"), []);
  // The government page's reviewed static hrefs: a config entry's href passes, a built one does not.
  assert.deepEqual(simulationSinks("const tools = ALL_TOOLS.filter((t) => t.roles.includes(simId.governmentRole));\n<Link href={tools[0].href}>x</Link>", "app/dashboard/government/page.tsx"), []);
  assert.notDeepEqual(simulationSinks(probes.derivedHref, "app/dashboard/government/page.tsx"), [],
    "a template-literal href stays a leak even in the reviewed file");
  // Two-level alias and a context reader that posts the role.
  assert.notDeepEqual(simulationSinks("const a = adminSim;\nconst b = a?.view;\nsaveOrder({ b });"), []);
  assert.notDeepEqual(simulationSinks("const role = useFirmRole();\nconst r = role.role;\npostJson(url, { r });", "", FIRM_ROLE_SEED), []);
  assert.deepEqual(simulationSinks("const role = useFirmRole();\nconst show = role.can.viewFinancials;\nreturn show ? <div className={x}/> : null;", "", FIRM_ROLE_SEED), []);
  // The sanitizer: the menu built from a simulated sub-role is static config.
  assert.deepEqual(simulationSinks("const groups = getSidebarByUserType(t, \"full\", null, [], simId?.governmentRole);\nconst tools = extractTools(groups);"), []);

  // The comment stripper: «/ai/*» in a line comment opens nothing; a URL in a string stays.
  assert.equal(code('// every /ai/* tool\nconst simId = 1; /* gone */ const u = "https://x";'), '\nconst simId = 1;  const u = "https://x";');

  const clean = 'import { useUser } from "@/hooks/useUser";\nfetch("/api/v1/x", { body: JSON.stringify({ role: user.userType }) });';
  assert.equal(importsSimulation(clean), false);
  assert.deepEqual(simulationSinks(clean), []);

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
  assert.ok(simulationExports().includes("adminSimulatesConsultant") && simulationExports().includes("simulatedFirmRole")
    && simulationExports().includes("ADMIN_SIM_STORAGE_KEY") && simulationExports().includes("setAdminSimulation"));
});

test("S6-T16: every option href is a bare dashboard path (the switch's router.push carries no query)", () => {
  for (const o of ADMIN_SWITCH_OPTIONS) assert.match(o.href, /^\/dashboard\/[a-z]+$/, o.id);
});

test("R27: the simulation modules hold no request, session or guard code", () => {
  for (const r of ["lib/nav/adminSimulation.ts", "hooks/useAdminSimulation.ts"]) {
    assert.deepEqual(bannedInSimModule(readSrc(r)), [], r);
  }
});

test("R27: only the reviewed UI files import the simulation; none sends it anywhere", () => {
  const files = walk(SRC).map((abs) => ({ r: rel(abs), src: readFileSync(abs, "utf8") }));
  const importers = files.filter((f) => importsSimulation(f.src)).map((f) => f.r).sort();
  assert.deepEqual(unexpectedImporters(importers), [],
    "a new importer of the simulation must be reviewed against R27 and added to ALLOWED_IMPORTERS");
  assert.deepEqual(importers, [...ALLOWED_IMPORTERS].sort(), "every listed importer still imports it (no stale entry)");

  const exportsRe = new RegExp(`(?<![\\w$])(?:${simulationExports().map(esc).join("|")})(?![\\w$])`);
  for (const f of files) {
    if (f.r !== "lib/nav/adminSimulation.ts") {
      assert.equal(readsSimulationKey(f.src), false, `${f.r} reads the simulation's storage key directly`);
    }
    // The hook IS the store (its window events and sessionStorage calls are the
    // simulation itself); predicate (b) bans request/session/guard code in it.
    if (importsSimulation(f.src) && f.r !== "hooks/useAdminSimulation.ts") {
      assert.deepEqual(simulationSinks(f.src, f.r), [], `${f.r}: a simulated value reaches a non-UI call or prop`);
    }
    if (isServerOrRequestFile(f.r)) {
      assert.doesNotMatch(code(f.src), exportsRe, f.r);
    }
  }
  // The four intake files exist (a rename must not silently empty the guard).
  for (const r of REQUEST_FILES) assert.ok(files.some((f) => f.r === r), `${r} exists`);
});

test("R27: FirmRoleContext's readers are reviewed and never send the role", () => {
  const files = walk(SRC).map((abs) => ({ r: rel(abs), src: readFileSync(abs, "utf8") }));
  const readers = files.filter((f) => readsFirmRole(f.src) && f.r !== "app/dashboard/firm/firmRoleContext.tsx").map((f) => f.r).sort();
  assert.deepEqual(readers, [...FIRM_ROLE_READERS].sort(),
    "a new reader of FirmRoleContext gets the simulated role: review it against R27 and add it to FIRM_ROLE_READERS");
  for (const f of files.filter((x) => FIRM_ROLE_READERS.has(x.r))) {
    assert.deepEqual(simulationSinks(f.src, f.r, FIRM_ROLE_SEED), [], `${f.r}: the firm role reaches a non-UI call or prop`);
  }
});
