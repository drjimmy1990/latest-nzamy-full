/**
 * navigation.consultant.test.ts — Art. 18 of نظام المحاماة (owner ١٧٣ / ٢١٩).
 *
 * An independent legal consultant (مستشار قانوني) may not plead or manage
 * hearings, so his sidebar carries none of the tools on
 * CONSULTANT_BLOCKED_PREFIXES, in either lawyer variant (full and the Saudi
 * one; the lite sidebar is gone since owner ٢٦٤). Everything else he keeps, and
 * an advocate's sidebar is exactly what it was before practice_kind existed.
 *
 * Run: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/navigation.consultant.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { getSidebarByUserType, withoutConsultantBlockedItems } from "./navigation.sidebars.ts";
import { isConsultantBlockedPath, type PracticeKind } from "../lib/auth/practiceKind.ts";
import type { SidebarGroup, SidebarItem } from "./navigation.types.ts";

function lawyerSidebar(
  mode: "light" | "full",
  practiceKind?: PracticeKind | null,
  country: string | null = null,
): SidebarGroup[] {
  return getSidebarByUserType("lawyer", mode, null, [], null, null, null, false, country, practiceKind);
}

function hrefsOf(groups: SidebarGroup[]): string[] {
  const out: string[] = [];
  const walk = (items: SidebarItem[]) => {
    for (const item of items) {
      out.push(item.href);
      if (item.children) walk(item.children);
    }
  };
  for (const group of groups) walk(group.items);
  return out;
}

const VARIANTS: Array<{ name: string; mode: "light" | "full"; country: string | null }> = [
  { name: "full", mode: "full", country: null },
  { name: "full, Saudi", mode: "full", country: "SA" },
];

test("the advocate sidebar carries the court tools (so the checks below are not vacuous)", () => {
  const hrefs = hrefsOf(lawyerSidebar("full", "advocate"));
  for (const href of ["/dashboard/lawyer/hearings", "/ai/wargaming", "/ai/najiz-optimizer"]) {
    assert.ok(hrefs.includes(href), `${href} should be on the advocate sidebar`);
  }
});

test("the consultant sidebar has no blocked href, in every lawyer variant", () => {
  for (const { name, mode, country } of VARIANTS) {
    const blocked = hrefsOf(lawyerSidebar(mode, "consultant", country)).filter(isConsultantBlockedPath);
    assert.deepEqual(blocked, [], `${name}: blocked hrefs left on the consultant sidebar`);
  }
});

test("the consultant keeps contracts, consultations, the legal opinion, clients and documents", () => {
  const hrefs = hrefsOf(lawyerSidebar("full", "consultant"));
  for (const href of [
    "/dashboard/lawyer/contracts",
    "/dashboard/lawyer/consultations",
    "/ai/legal-opinion",
    "/dashboard/lawyer/clients",
    "/dashboard/lawyer/documents",
  ]) {
    assert.ok(hrefs.includes(href), `${href} should stay on the consultant sidebar`);
  }
});

test("the consultant sidebar is the advocate one minus the blocked items, nothing else", () => {
  for (const { name, mode, country } of VARIANTS) {
    const advocate = hrefsOf(lawyerSidebar(mode, "advocate", country));
    const consultant = hrefsOf(lawyerSidebar(mode, "consultant", country));
    assert.deepEqual(consultant, advocate.filter((href) => !isConsultantBlockedPath(href)), name);
  }
  assert.ok(hrefsOf(lawyerSidebar("full", "consultant", "SA")).includes("/ai/global"));
});

test("the advocate sidebar is unchanged: advocate, null and no argument all agree", () => {
  for (const { name, mode, country } of VARIANTS) {
    const before = lawyerSidebar(mode, undefined, country);
    assert.deepEqual(lawyerSidebar(mode, "advocate", country), before, `${name}: advocate`);
    assert.deepEqual(lawyerSidebar(mode, null, country), before, `${name}: null`);
  }
});

test("practice_kind is a lawyer field: other account types ignore it", () => {
  for (const userType of ["firm", "individual", "admin", "provider"] as const) {
    assert.deepEqual(
      getSidebarByUserType(userType, "full", null, [], null, null, null, false, null, "consultant"),
      getSidebarByUserType(userType, "full", null, [], null, null, null, false, null),
      userType,
    );
  }
});

test("a group the filter empties is dropped; groups and items it does not touch are kept", () => {
  const groups: SidebarGroup[] = [
    {
      title: "الجلسات", titleEn: "Hearings",
      items: [
        { label: "الجلسات", labelEn: "Hearings", href: "/dashboard/lawyer/hearings", icon: "CalendarCheck" },
        { label: "المهل", labelEn: "Deadlines", href: "/dashboard/lawyer/deadlines?tab=open", icon: "Timer" },
      ],
    },
    {
      title: "أدوات", titleEn: "Tools",
      items: [
        {
          label: "أب", labelEn: "Parent", href: "/ai/draft", icon: "PencilSimple",
          children: [
            { label: "محاكي", labelEn: "Wargaming", href: "/ai/wargaming/new", icon: "Scales" },
            { label: "مراجع", labelEn: "Brief checker", href: "/ai/brief-checker", icon: "Scan" },
          ],
        },
      ],
    },
  ];
  const out = withoutConsultantBlockedItems(groups);
  assert.equal(out.length, 1);
  assert.equal(out[0].titleEn, "Tools");
  assert.deepEqual(hrefsOf(out), ["/ai/draft", "/ai/brief-checker"]);
});

// ── The lawyer's case file (controller ruling on the Task 2.3 review) ────────
// The hearing, stage and deadline writes refuse a consultant with 403 (Art. 18),
// so the case page must not offer him their controls: it reads practiceKind,
// every trigger sits behind `courtWritesAllowed`, and each of the three tabs
// shows the Art. 18 note instead. Source-level, because the page is a React
// screen `node --test` cannot render.

const CASE_PAGE = readFileSync(
  path.join(process.cwd(), "src", "app", "dashboard", "lawyer", "cases", "[id]", "page.tsx"),
  "utf8",
);

test("the lawyer case page reads practiceKind and gates its court controls", () => {
  assert.match(CASE_PAGE, /user\.practiceKind === "consultant"/);
  const triggers = [
    "setShowAddHearing(true)",
    'href="/dashboard/lawyer/hearings"',
    'href="/ai/wargaming"',
    "setShowAddStage(true)",
    "setEditingStage(s)",
    "setShowAddDeadline(true)",
    "handleDeadlineAction(d, next, reason)",
  ];
  for (const trigger of triggers) {
    const at = CASE_PAGE.indexOf(trigger);
    assert.ok(at > 0, `${trigger} not found on the case page`);
    assert.equal(CASE_PAGE.indexOf(trigger, at + 1), -1, `${trigger} appears twice; gate every one`);
    const before = CASE_PAGE.slice(Math.max(0, at - 400), at);
    assert.match(before, /courtWritesAllowed/, `${trigger} is not behind courtWritesAllowed`);
  }
});

test("each court tab of the case page shows the Art. 18 note to a consultant", () => {
  for (const tab of ["hearings", "stages", "deadlines"]) {
    const start = CASE_PAGE.indexOf(`{activeTab === "${tab}" && (`);
    assert.ok(start > 0, `${tab} tab not found`);
    const end = CASE_PAGE.indexOf("{activeTab === ", start + 1);
    const body = CASE_PAGE.slice(start, end);
    assert.match(body, /courtWritesRefused && <ConsultantBlockedNote/, `${tab} tab has no consultant note`);
  }
});

// ── The lawyer dashboard and case list (advisor sweep after the ruling) ──────
// The «المواعيد القادمة» and «مواعيد حرجة» cards, the urgent hearings banner and
// the «جدول الجلسات» quick action are hearings tools on the consultant's own
// dashboard; the case list links to the hearings diary and the wargaming tool.

const read = (...parts: string[]) => readFileSync(path.join(process.cwd(), "src", "app", ...parts), "utf8");

test("the lawyer dashboard hides the hearings and deadlines cards and the urgent banner from a consultant", () => {
  const page = read("dashboard", "lawyer", "page.tsx");
  for (const needle of [
    'const isConsultant = practiceKind === "consultant";',
    "{soonestUrgent && !isConsultant && (",
    "{/* Upcoming Hearings */}\n        {!isConsultant && (",
    "{/* Critical Deadlines */}\n        {!isConsultant && (",
    // A full class string each way, so Tailwind sees both.
    'isConsultant ? "grid grid-cols-1 gap-5" : "grid grid-cols-1 lg:grid-cols-3 gap-5"',
    "isConsultantBlockedPath(item.href)",
  ]) {
    assert.ok(page.includes(needle), `the lawyer dashboard is missing: ${needle}`);
  }
});

test("the lawyer case list hides the hearings and wargaming links from a consultant", () => {
  const page = read("dashboard", "lawyer", "cases", "page.tsx");
  assert.ok(page.includes('user.practiceKind === "consultant"'), "the case list does not read practiceKind");
  for (const href of ['href="/dashboard/lawyer/hearings"', 'href="/ai/wargaming"']) {
    const at = page.indexOf(href);
    assert.ok(at > 0, `${href} not found`);
    assert.equal(page.indexOf(href, at + 1), -1, `${href} appears twice`);
    assert.ok(
      page.slice(Math.max(0, at - 200), at).includes("!isConsultant && ("),
      `${href} is not hidden from a consultant`,
    );
  }
});

test("the /ai hub drops the court tools from a consultant's grid", () => {
  const page = read("ai", "page.tsx");
  assert.ok(
    page.includes('if (user.practiceKind === "consultant" && isConsultantBlockedPath(t.href)) return false;'),
    "the /ai hub's allowedTools filter does not drop the court tools for a consultant",
  );
});
