/**
 * shellContext.test.ts — owner package 2026-10-30: LIVE-F01 (P0),
 * NOTE-22-C01, NOTE-22-C02.
 *
 * An admin in «وضع المحامي» who opened a shared tool (/ai/draft,
 * /ai/contracts, /ai/fee-calculator) was drawn the ADMIN sidebar. These tests
 * pin:
 *   1. the owner's journey — lawyer mode holds across the tools, the library
 *      and back;
 *   2. the regression table — for EVERY non-admin account type the new
 *      resolvers give exactly the answer the old inline code gave (the
 *      `legacy*` copies below are the pre-fix code, verbatim in logic);
 *   3. that the view context is UI only — it is ignored for non-admins, and
 *      the guards that decide access are untouched (source checks).
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/nav/shellContext.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADMIN_VIEW_STORAGE_KEY,
  adminViewFromPath,
  adminViewSuffix,
  inferUserTypeFromPath,
  parseAdminView,
  readStoredAdminView,
  resolveAdminView,
  resolveAiShell,
  resolveNavbarUserType,
  resolveNavUserType,
  resolveNotificationsShell,
  switchCurrentView,
  writeStoredAdminView,
  type AdminView,
  type ViewStorage,
} from "./shellContext.ts";
import type { UserType } from "../../hooks/useUser";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NON_ADMIN: UserType[] = [
  "lawyer", "firm", "individual", "corporate", "micro", "government", "ngo", "provider", null,
];
const VIEWS: Array<AdminView | null> = [null, "admin", "lawyer"];
const STAMPS: Array<string | null> = [
  null, "business", "client", "lawyer", "provider", "firm", "micro", "government", "ngo", "admin", "junk",
];
const PATHS = [
  "/ai", "/ai/draft", "/ai/contracts", "/ai/fee-calculator", "/ai/collector", "/ai/vault/x",
  "/ai/corp", "/ai/corp/x", "/ai/gov/judicial-search", "/ai/ngo", "/ai/micro/x", "/ai/brief-check",
  "/notifications", "/settings", "/laws", "/laws/some-law", "/",
  "/dashboard/lawyer", "/dashboard/lawyer/cases", "/dashboard/admin", "/dashboard/admin/users",
  "/dashboard/client", "/dashboard/firm/x", "/dashboard/business", "/dashboard/provider",
  "/dashboard/government", "/dashboard/ngo", "/dashboard/micro",
];

function memoryStorage(initial: Record<string, string> = {}): ViewStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => { data.set(k, v); },
  };
}

// ─── The pre-fix code, kept as the reference for non-admin sessions ──────────

/** SharedSidebar / GlobalSearch before 2026-10-30. */
function legacyNavUserType(pathname: string, sessionUserType: UserType, isBusinessIntake: boolean): UserType {
  const pathUserType = inferUserTypeFromPath(pathname);
  return isBusinessIntake ? "corporate" : pathUserType ?? sessionUserType;
}

/** src/app/ai/layout.tsx before 2026-10-30, as a shell name. */
function legacyAiShell(i: {
  loading: boolean; isLoggedIn: boolean; userType: UserType; pathname: string; lastDashboard: string | null;
}): string {
  if (i.loading) return "loading";
  if (i.pathname === "/ai" && !i.isLoggedIn) return "none";
  if (i.userType === "corporate") return "business";
  if (i.userType === "individual") return "client";
  if (i.userType === "lawyer") return "lawyer";
  if (i.userType === "provider") return "provider";
  if (i.userType === "firm") return "firm";
  if (i.userType === "micro") return "micro";
  if (i.userType === "government") return "government";
  if (i.userType === "ngo") return "ngo";
  const p = i.pathname;
  if (p.startsWith("/ai/corp/") || p === "/ai/corp") return "business";
  if (p.startsWith("/ai/gov/") || p === "/ai/gov") return "government";
  if (p.startsWith("/ai/ngo/") || p === "/ai/ngo") return "ngo";
  if (p.startsWith("/ai/micro/") || p === "/ai/micro") return "micro";
  if (!i.isLoggedIn) return "none";
  const LAWYER_AI_PREFIXES = ["/ai/collector", "/ai/brief-check", "/ai/direction-support", "/ai/vault"];
  if (LAWYER_AI_PREFIXES.some((x) => p === x || p.startsWith(x + "/"))) return "lawyer";
  const s = i.lastDashboard;
  if (s === "business") return "business";
  if (s === "client") return "client";
  if (s === "lawyer") return "lawyer";
  if (s === "provider") return "provider";
  if (s === "firm") return "firm";
  if (s === "micro") return "micro";
  if (s === "government") return "government";
  if (s === "ngo") return "ngo";
  return "business";
}

/** src/app/notifications/layout.tsx before 2026-10-30. */
function legacyNotificationsShell(userType: UserType, lastDashboard: string | null): string {
  if (userType === "corporate") return "business";
  if (userType === "individual") return "client";
  if (userType === "lawyer" || userType === "firm" || userType === "provider") return "lawyer";
  if (lastDashboard === "business") return "business";
  if (lastDashboard === "client") return "client";
  if (lastDashboard === "lawyer") return "lawyer";
  return "business";
}

// ─── 1. The owner's journey (LIVE-F01 acceptance) ────────────────────────────

test("LIVE-F01: admin → «وضع المحامي» → drafter, contracts, calculator, library and back keeps the lawyer menu", () => {
  const storage = memoryStorage();
  const visit = (pathname: string) => {
    // What useAdminView does on each page for a real admin.
    const fromPath = adminViewFromPath(pathname);
    if (fromPath) writeStoredAdminView(storage, fromPath);
    const storedView = readStoredAdminView(storage);
    return {
      sidebar: resolveNavUserType({ pathname, sessionUserType: "admin", storedView }),
      navbar: resolveNavbarUserType({ pathname, sessionUserType: "admin", storedView }),
      ai: pathname.startsWith("/ai")
        ? resolveAiShell({ loading: false, isLoggedIn: true, userType: "admin", pathname, storedView, lastDashboard: "admin" })
        : null,
    };
  };

  assert.equal(visit("/dashboard/admin").sidebar, "admin");
  // «وضع المحامي» on the console is a link to /dashboard/lawyer.
  assert.equal(visit("/dashboard/lawyer").sidebar, "lawyer");
  for (const tool of ["/ai/draft", "/ai/contracts", "/ai/fee-calculator"]) {
    const r = visit(tool);
    assert.equal(r.ai, "lawyer", `${tool}: the lawyer layout, not business`);
    assert.equal(r.sidebar, "lawyer", `${tool}: the lawyer sidebar, not the admin one`);
  }
  const library = visit("/laws/some-law");
  assert.equal(library.navbar, "lawyer", "the library's top bar keeps the lawyer links");
  assert.equal(visit("/notifications").sidebar, "lawyer");
  assert.equal(visit("/ai/draft").sidebar, "lawyer");
  assert.equal(visit("/dashboard/lawyer/cases").sidebar, "lawyer", "and back");
  assert.equal(storage.data.get(ADMIN_VIEW_STORAGE_KEY), "lawyer");

  // Switching back to the console is just as sticky.
  assert.equal(visit("/dashboard/admin/users").sidebar, "admin");
  assert.equal(visit("/laws").navbar, "admin");
  assert.equal(visit("/notifications").sidebar, "admin");
});

test("an admin on any /ai/* tool gets the lawyer shell whatever is stored (REF0021 acceptance)", () => {
  for (const pathname of PATHS.filter((p) => p.startsWith("/ai"))) {
    for (const storedView of VIEWS) {
      for (const lastDashboard of STAMPS) {
        const ai = resolveAiShell({ loading: false, isLoggedIn: true, userType: "admin", pathname, storedView, lastDashboard });
        assert.equal(ai, "lawyer", `${pathname} ${storedView} ${lastDashboard}`);
        assert.equal(resolveNavUserType({ pathname, sessionUserType: "admin", storedView }), "lawyer");
      }
    }
  }
  // Still gated on the session: never a guess while it loads.
  assert.equal(
    resolveAiShell({ loading: true, isLoggedIn: false, userType: null, pathname: "/ai/draft", storedView: "lawyer", lastDashboard: null }),
    "loading",
  );
});

test("visiting /ai/* does not WRITE the view: an admin in admin mode is not silently flipped", () => {
  assert.equal(adminViewFromPath("/ai/draft"), null);
  assert.equal(adminViewFromPath("/ai"), null);
  assert.equal(adminViewFromPath("/laws"), null);
  assert.equal(adminViewFromPath("/notifications"), null);
  assert.equal(adminViewFromPath("/dashboard/admin"), "admin");
  assert.equal(adminViewFromPath("/dashboard/admin/x"), "admin");
  assert.equal(adminViewFromPath("/dashboard/lawyer"), "lawyer");
  assert.equal(adminViewFromPath("/dashboard/lawyerish"), null);
  assert.equal(resolveAdminView("/laws", "admin"), "admin");
  assert.equal(resolveAdminView("/laws", null), "admin");
  assert.equal(resolveAdminView("/laws", "lawyer"), "lawyer");
  assert.equal(resolveAdminView("/dashboard/admin", "lawyer"), "admin", "the console is always the console");
  assert.equal(resolveAdminView("/dashboard/lawyer/x", "admin"), "lawyer");
});

test("/notifications for an admin: the console's own shell, or the lawyer shell in lawyer mode — never business", () => {
  for (const lastDashboard of STAMPS) {
    assert.equal(resolveNotificationsShell({ userType: "admin", storedView: null, lastDashboard }), "admin");
    assert.equal(resolveNotificationsShell({ userType: "admin", storedView: "admin", lastDashboard }), "admin");
    assert.equal(resolveNotificationsShell({ userType: "admin", storedView: "lawyer", lastDashboard }), "lawyer");
  }
});

// ─── 2. Regression table: nothing changes for any non-admin session ──────────

test("sidebar + search: every non-admin session gets the pre-fix answer, whatever is stored", () => {
  let rows = 0;
  for (const sessionUserType of NON_ADMIN) {
    for (const pathname of PATHS) {
      for (const isBusinessIntake of [false, true]) {
        for (const storedView of VIEWS) {
          assert.equal(
            resolveNavUserType({ pathname, sessionUserType, storedView, isBusinessIntake }),
            legacyNavUserType(pathname, sessionUserType, isBusinessIntake),
            `${sessionUserType} ${pathname} intake=${isBusinessIntake} stored=${storedView}`,
          );
          rows++;
        }
      }
    }
  }
  assert.ok(rows > 1000);
});

test("an admin's answer differs from the old one only off the role dashboards", () => {
  for (const pathname of PATHS) {
    for (const storedView of VIEWS) {
      const now = resolveNavUserType({ pathname, sessionUserType: "admin", storedView });
      if (inferUserTypeFromPath(pathname)) {
        assert.equal(now, legacyNavUserType(pathname, "admin", false), `${pathname}: a role path still decides`);
      } else {
        assert.ok(now === "admin" || now === "lawyer", `${pathname}: only ever admin or lawyer`);
      }
    }
  }
  // Business intake still wins for an admin with a business membership.
  assert.equal(resolveNavUserType({ pathname: "/ai/draft", sessionUserType: "admin", storedView: "lawyer", isBusinessIntake: true }), "corporate");
});

test("/ai layout: every non-admin session (and the loading/guest states) picks the pre-fix layout", () => {
  let rows = 0;
  for (const userType of NON_ADMIN) {
    for (const loading of [false, true]) {
      for (const isLoggedIn of [true, false]) {
        for (const pathname of PATHS.filter((p) => p.startsWith("/ai"))) {
          for (const lastDashboard of STAMPS) {
            for (const storedView of VIEWS) {
              assert.equal(
                resolveAiShell({ loading, isLoggedIn, userType, pathname, storedView, lastDashboard }),
                legacyAiShell({ loading, isLoggedIn, userType, pathname, lastDashboard }),
                `${userType} loading=${loading} in=${isLoggedIn} ${pathname} stamp=${lastDashboard} stored=${storedView}`,
              );
              rows++;
            }
          }
        }
      }
    }
  }
  assert.ok(rows > 5000);
});

test("/notifications layout: every non-admin session picks the pre-fix layout", () => {
  for (const userType of NON_ADMIN) {
    for (const lastDashboard of STAMPS) {
      for (const storedView of VIEWS) {
        assert.equal(
          resolveNotificationsShell({ userType, storedView, lastDashboard }),
          legacyNotificationsShell(userType, lastDashboard),
          `${userType} ${lastDashboard} ${storedView}`,
        );
      }
    }
  }
});

test("Navbar: every non-admin session keeps its own nav on every path", () => {
  for (const sessionUserType of NON_ADMIN) {
    for (const pathname of PATHS) {
      for (const storedView of VIEWS) {
        assert.equal(resolveNavbarUserType({ pathname, sessionUserType, storedView }), sessionUserType);
      }
    }
  }
});

// ─── 3. The stored value is UI state only ────────────────────────────────────

test("parseAdminView accepts only the two views; junk or a role name is ignored", () => {
  assert.equal(parseAdminView("admin"), "admin");
  assert.equal(parseAdminView("lawyer"), "lawyer");
  for (const junk of ["firm", "business", "super_admin", "ADMIN", "", null, undefined, 1, {}]) {
    assert.equal(parseAdminView(junk), null, String(junk));
  }
  const storage = memoryStorage({ [ADMIN_VIEW_STORAGE_KEY]: "firm" });
  assert.equal(readStoredAdminView(storage), null);
});

test("blocked storage never throws: nothing stored, nothing written", () => {
  const throwing: ViewStorage = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("QuotaExceededError"); },
  };
  assert.equal(readStoredAdminView(throwing), null);
  assert.equal(writeStoredAdminView(throwing, "lawyer"), false);
  assert.equal(readStoredAdminView(null), null);
  assert.equal(writeStoredAdminView(undefined, "admin"), false);
  const s = memoryStorage();
  assert.equal(writeStoredAdminView(s, "lawyer"), true);
  assert.equal(writeStoredAdminView(s, "lawyer"), false, "unchanged value: no write, no event");
});

test("NOTE-22-C02: the switch presses a button only for the two views — elsewhere both navigate", () => {
  assert.equal(switchCurrentView("lawyer"), "lawyer");
  assert.equal(switchCurrentView("admin"), "admin");
  for (const other of ["corporate", "individual", "firm", "provider", "micro", "government", "ngo", null] as const) {
    assert.equal(switchCurrentView(other), null, String(other));
  }
  // An admin on the console's back-link to /dashboard/business sees no pressed button.
  assert.equal(switchCurrentView(resolveNavUserType({ pathname: "/dashboard/business", sessionUserType: "admin", storedView: "lawyer" })), null);
  assert.match(read("components/dashboard/SharedSidebar.tsx"), /<AdminViewSwitch current=\{switchCurrentView\(userType\)\}/);
});

test("NOTE-22-C02: the header names a view, not a role", () => {
  assert.equal(adminViewSuffix("admin", "lawyer"), "وضع المحامي");
  assert.equal(adminViewSuffix("admin", "lawyer", false), "Lawyer mode");
  assert.equal(adminViewSuffix("admin", "admin"), null);
  assert.equal(adminViewSuffix("lawyer", "lawyer"), null, "a real lawyer is just a lawyer");
  assert.equal(adminViewSuffix("firm", "lawyer"), null);
});

// ─── Wiring: every shell asks the resolver; access stays where it was ────────

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

test("every shell goes through the one resolver", () => {
  const shared = read("components/dashboard/SharedSidebar.tsx");
  assert.match(shared, /resolveNavUserType\(\{ pathname, sessionUserType, storedView, isBusinessIntake \}\)/);
  assert.doesNotMatch(shared, /pathUserType \?\? sessionUserType/);

  const search = read("components/dashboard/GlobalSearch.tsx");
  assert.match(search, /resolveNavUserType\(\{ pathname, sessionUserType, storedView, isBusinessIntake \}\)/);
  assert.doesNotMatch(search, /function inferUserTypeFromPath/, "the private copy is gone");

  const ai = read("app/ai/layout.tsx");
  assert.match(ai, /resolveAiShell\(\{/);
  assert.match(ai, /case "lawyer":\s+return <LawyerDashboardLayout>/);

  const notifications = read("app/notifications/layout.tsx");
  assert.match(notifications, /resolveNotificationsShell\(\{/);
  assert.match(notifications, /shell === "admin"\)\s+return <AdminLayout>/);

  const navbar = read("components/Navbar.tsx");
  assert.match(navbar, /resolveNavbarUserType\(\{/);
  assert.match(navbar, /getNavByUserType\(isLoggedIn \? navUserType : null\)/);

  const parts = read("components/dashboard/SidebarComponents.tsx");
  assert.match(parts, /export \{ inferUserTypeFromPath \} from "@\/lib\/nav\/shellContext";/);
});

test("the switch bar is gated on the REAL role and sits in both admin-reachable shells", () => {
  const sw = read("components/dashboard/AdminViewSwitch.tsx");
  assert.match(sw, /const \{ userType, loading \} = useUser\(\);/);
  assert.match(sw, /if \(loading \|\| userType !== "admin"\) return null;/);
  assert.match(sw, /لا يغيّر الصلاحيات/);
  assert.match(read("components/dashboard/SharedSidebar.tsx"), /\{isRealAdmin && \(\s*<AdminViewSwitch /);
  assert.match(read("components/admin/AdminSidebar.tsx"), /<AdminViewSwitch current="admin" tone="console" \/>/);
});

test("access is untouched: the guards and the proxy rule still read the real role", () => {
  assert.match(read("app/dashboard/lawyer/layout.tsx"), /<UserTypeGuard allowedTypes=\{\["lawyer", "firm", "provider", "admin"\]\}>/);
  assert.match(read("app/dashboard/admin/layout.tsx"), /<UserTypeGuard allowedTypes=\{\["admin"\]\}>/);
  assert.match(read("lib/auth/routeAccess.ts"), /\{ prefix: "\/dashboard\/admin", allowedTypes: \["admin"\] \}/);
  // The view key is read by the menus only — no guard, proxy or API route.
  for (const rel of ["proxy.ts", "lib/auth/routeAccess.ts", "components/dashboard/UserTypeGuard.tsx", "hooks/useUser.ts"]) {
    const src = read(rel);
    assert.doesNotMatch(src, /nzamy_admin_view_as|useAdminView|shellContext/, rel);
  }
});
