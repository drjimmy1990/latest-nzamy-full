/**
 * navigation.comingSoon.test.ts — owner ق٢٦-١ (package 2026-11-26): every
 * account's menu hides «قريباً» / «قيد التفعيل» rows and other sectors' rows;
 * paid office rows can carry a 🔒 (navigation.officeLock.ts). Supersedes owner
 * UX08 (2026-10-30, a last «قريباً» section in the lawyer menu).
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.comingSoon.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  comingSoonToolIds,
  isDashboardHomeHref,
  isUnbuiltItem,
  withLiveToolBadges,
  withoutUnbuiltItems,
} from "./navigation.comingSoon.ts";
import { adminSidebarForRole, FIRM_ROLE_ALLOWED_HREFS, getSidebarByUserType, withoutOtherSectorItems } from "./navigation.sidebars.ts";
import { FIRM_SIDEBAR, LAWYER_SIDEBAR } from "./navigation.sidebars.legal.ts";
import { FIRM_OFFICE_HREFS, LAWYER_OFFICE_HREFS, officeLockAudience, withOfficeLocks } from "./navigation.officeLock.ts";
import { isRouteAllowedFor } from "../lib/auth/routeAccess.ts";
import { readFileSync } from "node:fs";
import type { SidebarGroup, SidebarItem } from "./navigation.types";
import type { AffiliationRole, GovernmentRole, UserType } from "@/hooks/useUser";

const flat = (groups: SidebarGroup[]): SidebarItem[] =>
  groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));
const hrefs = (groups: SidebarGroup[]) => flat(groups).map((i) => i.href);
const path = (href: string) => href.split(/[?#]/)[0];

type Menu = { name: string; type: UserType; groups: SidebarGroup[] };

/** Every menu a user can be drawn (not the admin's own control menu). */
function everyMenu(liveTools: ReadonlySet<string> | null = null): Menu[] {
  const out: Menu[] = [];
  const add = (name: string, type: UserType, groups: SidebarGroup[]) => out.push({ name, type, groups });
  for (const country of [null, "SA", "EG"]) {
    for (const practiceKind of [null, "advocate", "consultant"] as const) {
      for (const firmMember of [false, true]) {
        add(`lawyer ${country} ${practiceKind} member=${firmMember}`, "lawyer",
          getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, country, practiceKind, null, liveTools, firmMember));
      }
    }
    add(`individual ${country}`, "individual", getSidebarByUserType("individual", "full", null, [], null, null, null, false, country, null, null, liveTools));
  }
  add("lawyer + notary + bailiff + arbitrator", "lawyer",
    getSidebarByUserType("lawyer", "full", null, ["notary", "bailiff", "arbitrator"], null, null, null, false, null, "advocate", null, liveTools));
  for (const role of Object.keys(FIRM_ROLE_ALLOWED_HREFS)) {
    const aff = role === "default" ? null : (role as AffiliationRole);
    add(`firm ${role}`, "firm", getSidebarByUserType("firm", "full", null, [], null, null, aff, false, "SA", null, null, liveTools, aff !== null && aff !== "managing_partner"));
  }
  for (const biz of [null, "owner", "legal_manager", "employee", "hr_manager", "seconded"]) {
    add(`corporate ${biz}`, "corporate", getSidebarByUserType("corporate", "full", null, [], null, biz, null, false, null, null, null, liveTools));
  }
  add("micro", "micro", getSidebarByUserType("micro", "full", null, [], null, null, null, false, null, null, null, liveTools));
  for (const sub of [null, "notary", "arbitrator", "bailiff"]) {
    add(`provider ${sub}`, "provider", getSidebarByUserType("provider", "full", sub, [], null, null, null, false, null, null, null, liveTools));
  }
  for (const gov of [null, "judge", "prosecutor", "officer", "gov_counsel"] as (GovernmentRole | null)[]) {
    add(`government ${gov}`, "government", getSidebarByUserType("government", "full", null, [], gov, null, null, false, null, null, null, liveTools));
  }
  add("ngo", "ngo", getSidebarByUserType("ngo", "full", null, [], null, null, null, false, null, null, null, liveTools));
  return out;
}

test("ق٢٦-١: no menu a user is drawn shows a «قريباً» / «قيد التفعيل» row (the dashboard home row excepted)", () => {
  for (const menu of everyMenu()) {
    for (const item of flat(menu.groups)) {
      if (isDashboardHomeHref(item.href)) continue;
      assert.equal(isUnbuiltItem(item), false, `${menu.name}: ${item.href} «${item.label}» is still «${item.badge}»`);
    }
    for (const g of menu.groups) assert.ok(g.items.length > 0, `${menu.name}: empty group ${g.title ?? ""}`);
  }
});

test("ق٢٦-١: no menu links a page the edge refuses to its account type (another sector's rows are hidden)", () => {
  for (const menu of everyMenu()) {
    for (const item of flat(menu.groups)) {
      if (item.external || !item.href.startsWith("/")) continue;
      assert.ok(isRouteAllowedFor(path(item.href), menu.type), `${menu.name}: ${item.href} is refused to ${menu.type}`);
    }
  }
  // the lawyer's arbitration add-on lives under /dashboard/provider — not his
  const multi = getSidebarByUserType("lawyer", "full", null, ["arbitrator"], null, null, null, false, null, "advocate");
  assert.equal(hrefs(multi).some((h) => h.startsWith("/dashboard/provider")), false);
  // the arbitrator's /ai/gov/* rows are the government's
  const arb = getSidebarByUserType("provider", "full", "arbitrator");
  assert.equal(hrefs(arb).some((h) => h.startsWith("/ai/gov")), false);
});

test("a firm member drawn the firm menu keeps its /dashboard/firm rows (the MENU's type is checked, not the session's)", () => {
  const member = getSidebarByUserType("firm", "full", null, [], null, null, "lawyer", false, "SA", null, null, null, true);
  assert.ok(hrefs(member).includes("/dashboard/firm"));
  assert.ok(hrefs(member).includes("/dashboard/firm/cases"));
  assert.deepEqual(withoutOtherSectorItems(FIRM_SIDEBAR, "firm").length, FIRM_SIDEBAR.length);
});

test("the dashboard home row stays even when its page is a «قريباً» notice (provider)", () => {
  for (const sub of [null, "arbitrator", "bailiff"]) {
    const groups = getSidebarByUserType("provider", "full", sub);
    assert.equal(flat(groups)[0].href, "/dashboard/provider", String(sub));
  }
});

test("the daily work keeps its place: lawyer overview first, cases group second, drafting tools present", () => {
  const groups = getSidebarByUserType("lawyer", "full");
  assert.equal(groups[0].items[0].href, "/dashboard/lawyer");
  assert.equal(groups[1].title, "الجلسات والقضايا");
  const ai = groups.find((g) => g.title === "ذكاء نظامي")!;
  assert.ok(ai.items.some((i) => i.href === "/ai/draft"));
  assert.ok(ai.items.some((i) => i.href === "/ai/contracts"));
  assert.equal(groups.some((g) => g.title === "قريباً"), false, "UX08's last «قريباً» section is gone");
  // ق٢٦-١ examples from the gap report
  for (const gone of ["/ai/secretary", "/academy", "/ai/global", "/ai/quick-answer"]) {
    assert.equal(hrefs(getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, "SA")).includes(gone), false, gone);
  }
});

test("a hidden row hands its divider to the next row kept; an emptied group drops; nothing removed = same array", () => {
  const out = withoutUnbuiltItems([
    { title: "A", items: [
      { label: "a1", labelEn: "a1", href: "/a1", icon: "X" },
      { label: "soon", labelEn: "soon", href: "/s1", icon: "X", badge: "قريباً", divider: true },
      { label: "a2", labelEn: "a2", href: "/a2", icon: "X" },
    ] },
    { title: "B", items: [{ label: "only soon", labelEn: "s", href: "/s2", icon: "X", badge: "قيد التفعيل" }] },
    { title: "C", items: [{ label: "parent", labelEn: "p", href: "/p", icon: "X", children: [
      { label: "kid", labelEn: "k", href: "/p/k", icon: "X" },
      { label: "kid soon", labelEn: "ks", href: "/p/s", icon: "X", badge: "قريباً" },
    ] }] },
  ]);
  assert.deepEqual(out.map((g) => g.title), ["A", "C"]);
  assert.deepEqual(out[0].items.map((i) => i.href), ["/a1", "/a2"]);
  assert.equal(out[0].items[1].divider, true);
  assert.deepEqual(out[1].items[0].children!.map((i) => i.href), ["/p/k"]);
  const clean = [{ title: "X", items: [{ label: "x", labelEn: "x", href: "/x", icon: "X" }] }];
  assert.equal(withoutUnbuiltItems(clean), clean);
});

// ── BUG-12: a registry tool confirmed open comes back, without its badge ──

const findRow = (groups: SidebarGroup[], href: string) => {
  for (const g of groups) {
    const item = g.items.find((i) => i.href === href);
    if (item) return { group: g.title ?? "", item };
  }
  return null;
};

test("the rows backed by a registry tool are the ones the sidebar asks about — read from the menu WITH its unbuilt rows", () => {
  assert.deepEqual(comingSoonToolIds(LAWYER_SIDEBAR), ["quick-answer"]);
  // N06-26 / N06-32: the firm's registry-backed rows.
  assert.deepEqual(comingSoonToolIds(FIRM_SIDEBAR), ["analyze-strength", "communicate", "contract-negotiator", "quick-answer"]);
  const written = getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, null, "advocate", null, null, false, true);
  assert.deepEqual(comingSoonToolIds(written), ["quick-answer"], "keepUnbuilt keeps the rows the question is about");
  const drawn = getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, null, "advocate");
  assert.deepEqual(comingSoonToolIds(drawn), [], "the drawn menu has none");
});

test("a confirmed-open tool shows in its own group without «قريباً»; without a confirmation it stays hidden", () => {
  const live = new Set(["quick-answer"]);
  const before = getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, null, "advocate");
  const after = getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, null, "advocate", null, live);
  assert.equal(findRow(before, "/ai/quick-answer"), null, "closed: hidden");
  const now = findRow(after, "/ai/quick-answer")!;
  assert.equal(now.group, "ذكاء نظامي", "open: in the AI group");
  assert.equal(now.item.badge, undefined);
  assert.equal(findRow(after, "/ai/secretary"), null, "a row with no registry tool stays hidden");
  const firm = getSidebarByUserType("firm", "full", null, [], null, null, "managing_partner", false, null, null, null, live);
  assert.equal(findRow(firm, "/ai/quick-answer")!.item.badge, undefined);
  assert.equal(findRow(firm, "/ai/communicate"), null, "another registry tool not confirmed: hidden");
});

test("no confirmation, no change: an empty or absent set keeps every badge as written", () => {
  assert.equal(withLiveToolBadges(LAWYER_SIDEBAR, new Set()), LAWYER_SIDEBAR);
  assert.equal(withLiveToolBadges(LAWYER_SIDEBAR, null), LAWYER_SIDEBAR);
});

test("the admin's own control menu is left as it is", () => {
  assert.deepEqual(hrefs(getSidebarByUserType("admin", "full")), hrefs(adminSidebarForRole(null)));
});

test("the sidebar asks tool-status from the menu with its unbuilt rows, and draws the menu without them", () => {
  const hook = readFileSync(new URL("../hooks/useLiveTools.ts", import.meta.url), "utf8");
  assert.match(hook, /readToolUsable\(tool\)/);
  assert.match(hook, /const TTL_MS = /);
  const sidebar = readFileSync(new URL("../components/dashboard/SharedSidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /const writtenGroups = getSidebarByUserType\(\.\.\.menuArgs, null, navFirmMember, true\);/);
  assert.match(sidebar, /useLiveTools\(comingSoonToolIds\(writtenGroups\), isSupabaseMode && !loading && isLoggedIn\)/);
  assert.match(sidebar, /const menuGroups = getSidebarByUserType\(\.\.\.menuArgs, liveTools\.size > 0 \? liveTools : null, navFirmMember\);/);
});

// ── ق٢٦-١: the paid office rows' 🔒 ─────────────────────────────────────────

test("withOfficeLocks marks the paid office rows only when the database said `true`", () => {
  const lawyer = getSidebarByUserType("lawyer", "full", null, [], null, null, null, false, null, "advocate");
  for (const v of [false, null, undefined]) assert.equal(withOfficeLocks(lawyer, v, "lawyer"), lawyer, String(v));
  assert.equal(withOfficeLocks(lawyer, true, null), lawyer, "no audience (another menu): nothing");
  const locked = withOfficeLocks(lawyer, true, "lawyer");
  const marked = flat(locked).filter((i) => i.officeLocked).map((i) => i.href).sort();
  assert.deepEqual(marked, [...LAWYER_OFFICE_HREFS].sort(), "every listed lawyer office row is in the menu and marked");
  for (const free of ["/dashboard/lawyer", "/dashboard/lawyer/tasks", "/dashboard/lawyer/consultations", "/dashboard/lawyer/profile", "/laws", "/ai/draft", "/settings"]) {
    assert.equal(flat(locked).find((i) => i.href === free)?.officeLocked, undefined, free);
  }
  assert.ok(flat(locked).every((i) => !i.officeLocked || i.officeLocked === "lawyer"));
});

test("the firm's paid rows lock with the firm plan; the market, wallet, profile, reviews and settings stay open", () => {
  const firm = getSidebarByUserType("firm", "full", null, [], null, null, "managing_partner", false, "SA", null, null, null, false, false);
  const locked = withOfficeLocks(firm, true, "firm");
  const marked = new Set(flat(locked).filter((i) => i.officeLocked === "firm").map((i) => i.href));
  // l18 review: hearings and finance are built — back in the menu (no stale «قريباً»), locked with the plan
  for (const h of ["/dashboard/firm/cases", "/dashboard/firm/clients", "/dashboard/firm/team", "/dashboard/firm/contracts", "/dashboard/firm/hearings", "/dashboard/firm/finance"]) assert.ok(marked.has(h), h);
  for (const h of marked) assert.ok(FIRM_OFFICE_HREFS.includes(h), h);
  for (const h of ["/dashboard/firm", "/dashboard/firm/consultations", "/dashboard/firm/reviews", "/laws", "/settings"]) assert.equal(marked.has(h), false, h);
  assert.equal(officeLockAudience("lawyer"), "lawyer");
  assert.equal(officeLockAudience("firm"), "firm");
  assert.equal(officeLockAudience("individual"), null);
  assert.equal(officeLockAudience("admin"), null);
});

test("the locked row's click opens the upgrade dialog (→ /pricing) with a link to the page; the dialog no longer sends to /contact", () => {
  const link = readFileSync(new URL("../components/dashboard/SidebarComponents.tsx", import.meta.url), "utf8");
  assert.match(link, /onLockedClick\(isAr \? item\.label : item\.labelEn, \{ continueHref: item\.href, officeAudience: officeLock \}\)/);
  const modal = readFileSync(new URL("../components/UpgradeModal.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(modal, /\/contact\?type=feature-access/);
  assert.match(modal, /href=\{OFFICE_PLAN_PRICING_HREF\}/);
  assert.match(modal, /href=\{continueHref\}/);
  const sidebar = readFileSync(new URL("../components/dashboard/SharedSidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /withOfficeLocks\(libraryGroups, officeLocked, officeAudience\)/);
  const hook = readFileSync(new URL("../hooks/useOfficeFeaturesLocked.ts", import.meta.url), "utf8");
  assert.match(hook, /rpc\("my_office_features_locked"\)/);
  assert.match(hook, /setLocked\(!error && data === true\)/);
});
