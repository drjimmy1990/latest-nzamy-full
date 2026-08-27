/**
 * lawyerDashboardService.test.ts
 *
 * The discriminated union in the module under test was introduced so that a
 * failed read could not render as an empty practice. Until now the only thing
 * enforcing that was a comment: `getLawyerDashboardSummary` cast whatever JSON
 * came back to `LawyerDashboardSummary` and returned `{ ok: true }`, so the
 * union's promise held for a thrown fetch and for nothing else.
 *
 * What is pinned here is the THREE-WAY distinction, which is the whole subject:
 *
 *   a body the server marked degraded → ok, with the failed sections named
 *   a body that is not a summary       → NOT ok
 *   a genuinely empty practice         → ok, with real zeros and empty lists
 *
 * and the invariant that couples the two halves of the second outcome: a list
 * that came back unreadable must ALSO put its section key in `degraded`,
 * because src/app/dashboard/lawyer/page.tsx decides «تعذّرت قراءة هذا القسم»
 * from that key alone (`sectionFailed`, page.tsx:548) and renders a null list
 * as an ordinary empty one (`if (!dashboardData?.upcomingHearings) return []`).
 * Break the coupling and «لا توجد جلسات قادمة» appears over a failure again,
 * one layer further out than last time.
 *
 * NOT TESTED HERE: `getLawyerDashboardSummary` itself. Its `isSupabaseMode`
 * gate is a module-level constant resolved at import time, so under node it is
 * permanently false and the fetch path is unreachable without rewriting the
 * module's own imports. Everything it decides after the fetch is the function
 * below, and that is reachable.
 *
 * Run: npm run test:unit
 */
import assert from "node:assert/strict";
import test from "node:test";

import { toLawyerDashboardResult } from "./lawyerDashboardService.ts";

/** What the route sends for a lawyer whose practice really is empty today. */
function emptyPracticeBody(over: Record<string, unknown> = {}) {
  return {
    activeCases: 0,
    pendingConsultations: 0,
    revenueThisMonth: 0,
    recentCases: [],
    upcomingHearings: [],
    upcomingHearingsCount: 0,
    criticalDeadlines: [],
    criticalDeadlinesCount: 0,
    urgentTasks: [],
    recentActivity: [],
    degraded: [],
    ...over,
  };
}

// ── The three outcomes, side by side ──────────────────────────────────────────

test("a degraded body, a non-summary body and an empty practice differ", () => {
  // The one assertion this file exists for. All three used to be `ok: true`
  // with an indistinguishable-looking dashboard behind them.
  const empty = toLawyerDashboardResult(emptyPracticeBody());
  const degraded = toLawyerDashboardResult(
    emptyPracticeBody({ upcomingHearings: null, upcomingHearingsCount: null, degraded: ["hearings"] }),
  );
  const notASummary = toLawyerDashboardResult({ error: "تعذّر تحميل بيانات لوحة التحكم" });

  assert.equal(empty.ok, true);
  assert.equal(degraded.ok, true);
  assert.equal(notASummary.ok, false);

  assert.ok(empty.ok && degraded.ok);
  assert.deepEqual(empty.summary.degraded, []);
  assert.deepEqual(degraded.summary.degraded, ["hearings"]);
});

// ── Outcome 1: a genuinely empty practice ─────────────────────────────────────

test("a real zero survives as a zero", () => {
  // The mirror image of the defect: this platform answers ٠ legitimately all
  // the time, and a mapper that turned an honest zero into «تعذّرت القراءة»
  // would be just as wrong in the other direction.
  const result = toLawyerDashboardResult(emptyPracticeBody());
  assert.ok(result.ok);
  assert.equal(result.summary.activeCases, 0);
  assert.equal(result.summary.revenueThisMonth, 0);
  assert.equal(result.summary.upcomingHearingsCount, 0);
  assert.deepEqual(result.summary.recentCases, []);
  assert.deepEqual(result.summary.upcomingHearings, []);
});

test("a full practice is carried through unchanged", () => {
  const hearing = { id: "h1", date: "2026-09-01", title: "جلسة أولى", time: "10:00", type: "hearing", urgency: null, location: "الرياض", caseName: null };
  const result = toLawyerDashboardResult(
    emptyPracticeBody({
      activeCases: 7,
      revenueThisMonth: 18500,
      upcomingHearings: [hearing],
      upcomingHearingsCount: 12,
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.summary.activeCases, 7);
  assert.equal(result.summary.revenueThisMonth, 18500);
  assert.deepEqual(result.summary.upcomingHearings, [hearing]);
  // The COUNT is the server's, never the length of the capped list beside it —
  // the lawyer's 12th hearing has to exist on the tile even though the card
  // below shows three.
  assert.equal(result.summary.upcomingHearingsCount, 12);
  assert.deepEqual(result.summary.degraded, []);
});

// ── Outcome 2: the body is not a dashboard ────────────────────────────────────

test("a body that is not a record is a failure, never an empty practice", () => {
  // `200 null` is the one that mattered. The page set dashboardData to null
  // with loadError cleared, so `anyReadFailed` was false: no banner, and every
  // CARD fell to its ordinary empty state — «لا توجد جلسات قادمة» over a
  // failure. (The KPI grid alone was honest for this shape: the `stats` memo
  // returns [] for a null summary and the empty grid says «تعذّرت قراءة
  // الإحصائيات». The tiles' own failure was the `{}` shape below.)
  for (const body of [null, undefined, [], "تعذّر", 0, true]) {
    const result = toLawyerDashboardResult(body);
    assert.equal(result.ok, false, JSON.stringify(body) ?? "undefined");
  }
});

test("an error envelope answered with HTTP 200 is a failure", () => {
  // A proxy, an auth gateway or a future route change can all put JSON of
  // their own behind a 200; none of them is this lawyer's caseload.
  //
  // `{}` is the shape that reached the TILES: truthy, so the `stats` memo built
  // all four, and page.tsx:378's `=== null` test does not catch `undefined` —
  // `String(undefined)` printed the literal text "undefined" as this month's
  // revenue.
  assert.equal(toLawyerDashboardResult({}).ok, false);
  assert.equal(toLawyerDashboardResult({ error: "Unauthorized" }).ok, false);
  assert.equal(toLawyerDashboardResult({ data: [], total: 0 }).ok, false);
});

test("the failure wording tells a malformed answer apart from an unreachable server", () => {
  // Two different calls to make when a lawyer phones about it.
  const result = toLawyerDashboardResult(null);
  assert.ok(!result.ok);
  assert.ok(result.reason.length > 0);
  assert.notEqual(result.reason, "تعذّر الاتصال بالخادم.");
});

test("one recognised key is enough — a partial answer is not a total failure", () => {
  // The route's own partial-failure shape. Refusing it would turn a dashboard
  // that can still show five cards into a blank screen, which is the opposite
  // of what `degraded` is for.
  const result = toLawyerDashboardResult({ activeCases: 3 });
  assert.ok(result.ok);
  assert.equal(result.summary.activeCases, 3);
});

// ── Outcome 3: degraded sections, and the invariant behind them ───────────────

test("an unreadable list is null AND names its section", () => {
  // page.tsx renders a null list as an ordinary empty list; ONLY the key in
  // `degraded` produces «تعذّرت قراءة هذا القسم». A null list whose key never
  // arrived is «لا توجد جلسات قادمة» over a database failure.
  const result = toLawyerDashboardResult(
    emptyPracticeBody({ upcomingHearings: null, degraded: [] }),
  );
  assert.ok(result.ok);
  assert.equal(result.summary.upcomingHearings, null);
  assert.ok(result.summary.degraded.includes("hearings"));
});

test("each list names the section key the page actually tests for", () => {
  // These are the route's names, not the field names — `sectionFailed("cases")`,
  // not `sectionFailed("recentCases")`. A rename on either side is invisible on
  // screen: the card simply goes quiet and shows an empty state forever.
  const cases: [string, string][] = [
    ["recentCases", "cases"],
    ["upcomingHearings", "hearings"],
    ["criticalDeadlines", "hearings"],
    ["urgentTasks", "tasks"],
    ["recentActivity", "recentActivity"],
  ];
  for (const [field, section] of cases) {
    const result = toLawyerDashboardResult(emptyPracticeBody({ [field]: null }));
    assert.ok(result.ok, field);
    assert.ok(result.summary.degraded.includes(section), `${field} → ${section}`);
  }
});

test("a list of the wrong shape is unreadable, not empty", () => {
  // `{}` and `"[]"` are what a half-serialised or proxied body carries. Reading
  // either as "no upcoming hearings" is the same false statement as a null one.
  for (const junk of [{}, "[]", 0, true]) {
    const result = toLawyerDashboardResult(emptyPracticeBody({ urgentTasks: junk }));
    assert.ok(result.ok);
    assert.equal(result.summary.urgentTasks, null, JSON.stringify(junk));
    assert.ok(result.summary.degraded.includes("tasks"), JSON.stringify(junk));
  }
});

test("a section is named once even when two of its lists failed", () => {
  const result = toLawyerDashboardResult(
    emptyPracticeBody({ upcomingHearings: null, criticalDeadlines: null, degraded: ["hearings"] }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.summary.degraded, ["hearings"]);
});

test("the server's own degraded keys are kept, not replaced", () => {
  // "revenue" and "pendingConsultations" have no list of their own, so nothing
  // here can re-derive them; dropping what the server said would silently
  // un-mark the revenue tile.
  const result = toLawyerDashboardResult(
    emptyPracticeBody({
      revenueThisMonth: null,
      pendingConsultations: null,
      degraded: ["revenue", "pendingConsultations"],
    }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.summary.degraded, ["revenue", "pendingConsultations"]);
});

test("a degraded field that is not an array of strings cannot crash the page", () => {
  // `failedSections.includes(...)` throws on a non-array, and every card below
  // it disappears with it — a read failure that takes the whole screen down.
  for (const junk of [null, undefined, "hearings", { hearings: true }, 5]) {
    const result = toLawyerDashboardResult(emptyPracticeBody({ degraded: junk }));
    assert.ok(result.ok);
    assert.ok(Array.isArray(result.summary.degraded), JSON.stringify(junk) ?? "undefined");
  }
  const mixed = toLawyerDashboardResult(emptyPracticeBody({ degraded: ["cases", 7, null, "  ", "tasks"] }));
  assert.ok(mixed.ok);
  assert.deepEqual(mixed.summary.degraded, ["cases", "tasks"]);
});

// ── Numbers ───────────────────────────────────────────────────────────────────

test("an unreadable number is null, never zero", () => {
  // page.tsx:378 branches on `=== null` to draw «تعذّرت القراءة» and «—»;
  // anything else is printed as a figure. `String(undefined)` put the literal
  // text "undefined" in the tile.
  for (const junk of [null, undefined, "7", Number.NaN, Infinity, {}, []]) {
    const result = toLawyerDashboardResult(emptyPracticeBody({ activeCases: junk }));
    assert.ok(result.ok);
    assert.equal(result.summary.activeCases, null, JSON.stringify(junk) ?? "undefined");
  }
});

test("an unreadable count does not blank out a list that was read", () => {
  // The counts and their lists degrade together at the route, so deriving one
  // from the other here would only ever fire when they disagree — and it would
  // hide four hearings this lawyer can actually be told about.
  const result = toLawyerDashboardResult(
    emptyPracticeBody({
      upcomingHearingsCount: null,
      upcomingHearings: [{ id: "h1", date: "2026-09-01", title: "جلسة" }],
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.summary.upcomingHearingsCount, null);
  assert.equal(result.summary.degraded.includes("hearings"), false);
  assert.equal(result.summary.upcomingHearings?.length, 1);
});

// ── The whitelist ─────────────────────────────────────────────────────────────

test("a key the route did not promise cannot reach the dashboard", () => {
  // The same discipline the route applies to `recentCases`: a metadata key
  // added upstream — `internalNotes` is the one that already exists — must not
  // arrive on the client by being spread through this mapper.
  const result = toLawyerDashboardResult(
    emptyPracticeBody({ internalNotes: "الموكل صعب", firmRevenue: 900000 }),
  );
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.summary).sort(), [
    "activeCases",
    "criticalDeadlines",
    "criticalDeadlinesCount",
    "degraded",
    "pendingConsultations",
    "recentActivity",
    "recentCases",
    "revenueThisMonth",
    "upcomingHearings",
    "upcomingHearingsCount",
    "urgentTasks",
  ]);
});
