import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isLawyerCaseRow, matchesClientFilter, summarizeOpenDeadlines, isDeadlineSoon, deadlineSortKey,
} from "./_caseListRules.ts";

const req = (metadata: Record<string, unknown> = {}, type = "service") => ({ type, metadata }) as never;

test("isLawyerCaseRow keeps cases and drops tasks, clients, invoices and hearing-shaped rows", () => {
  assert.equal(isLawyerCaseRow(req({ court: "المحكمة العامة" })), true);
  assert.equal(isLawyerCaseRow(req({})), true);
  assert.equal(isLawyerCaseRow(req({ task: true })), false);
  assert.equal(isLawyerCaseRow(req({ client: true })), false);
  assert.equal(isLawyerCaseRow(req({ invoice: true })), false);
  assert.equal(isLawyerCaseRow(req({ hearing: true })), false);
  assert.equal(isLawyerCaseRow(req({ caseName: "", time: "" })), false);
  assert.equal(isLawyerCaseRow(req({}, "consultation")), false);
});

// ── CODE-F20 / LIVE-F16 ──
test("client filter matches by card id or by the linked account, never by name", () => {
  assert.equal(matchesClientFilter({ lawyer_client_id: "card-1" }, "card-1", null), true);
  assert.equal(matchesClientFilter({ lawyer_client_id: "card-2" }, "card-1", null), false);
  assert.equal(matchesClientFilter({ requester_user_id: "acct-9" }, "card-1", "acct-9"), true);
  assert.equal(matchesClientFilter({ requester_user_id: "acct-9" }, "card-1", null), false);
  // a "profile" client: the id in the URL IS the account id
  assert.equal(matchesClientFilter({ requester_user_id: "acct-9" }, "acct-9", null), true);
  assert.equal(matchesClientFilter({}, "card-1", "acct-9"), false);
  assert.equal(matchesClientFilter({ lawyer_client_id: "x" }, "", null), true, "no filter keeps everything");
});

// ── CODE-F25 ──
const dl = (caseRequestId: string | null, dueDate: string, status = "open") => ({ caseRequestId, dueDate, status });

test("deadline summary: a failed read is «unknown» for every case, never «none»", () => {
  assert.deepEqual(summarizeOpenDeadlines({ ok: false })("c1"), { state: "unknown" });
  assert.deepEqual(summarizeOpenDeadlines(null)("c1"), { state: "unknown" });
});

test("deadline summary: nearest open due date and count per case; none for a case with no row", () => {
  const of = summarizeOpenDeadlines({ ok: true, truncated: false, items: [
    dl("c1", "2026-11-10"), dl("c1", "2026-11-02"), dl("c2", "2026-12-01"), dl(null, "2026-11-01"), dl("c3", "2026-11-01", "done"),
  ] });
  assert.deepEqual(of("c1"), { state: "open", nearestDue: "2026-11-02", count: 2 });
  assert.deepEqual(of("c2"), { state: "open", nearestDue: "2026-12-01", count: 1 });
  assert.deepEqual(of("c3"), { state: "none" });
  assert.deepEqual(of("c4"), { state: "none" });
});

test("deadline summary: a truncated read cannot say «none» for a case it did not see", () => {
  const of = summarizeOpenDeadlines({ ok: true, truncated: true, items: [dl("c1", "2026-11-02")] });
  assert.equal(of("c1").state, "open");
  assert.deepEqual(of("c9"), { state: "unknown" });
});

test("soon = overdue or within 7 days of Riyadh today; unknown today is never soon", () => {
  const open = (d: string) => ({ state: "open" as const, nearestDue: d, count: 1 });
  assert.equal(isDeadlineSoon(open("2026-11-06"), "2026-10-30"), true);
  assert.equal(isDeadlineSoon(open("2026-11-07"), "2026-10-30"), false);
  assert.equal(isDeadlineSoon(open("2026-10-20"), "2026-10-30"), true);
  assert.equal(isDeadlineSoon(open("2026-10-31"), ""), false);
  assert.equal(isDeadlineSoon({ state: "none" }, "2026-10-30"), false);
  assert.ok(deadlineSortKey(open("2026-11-01")) < deadlineSortKey(open("2026-12-01")));
  assert.ok(deadlineSortKey(open("2026-12-01")) < deadlineSortKey({ state: "none" }));
});

// ── wiring (source shape) ──
const page = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");

test("the list reads ?client= and filters by id before every count, with a clearable chip", () => {
  assert.match(page, /searchParams\??\.get\("client"\)/);
  assert.match(page, /matchesClientFilter\(/);
  assert.match(page, /إلغاء تصفية الموكّل/);
  assert.match(page, /router\.replace\(/);
});

test("the «مهلة» priority comes from public.deadlines, not metadata.deadline", () => {
  assert.match(page, /getDeadlines\(\{ status: "open"/);
  assert.match(page, /summarizeOpenDeadlines\(/);
  assert.match(page, /تعذّر التحقق من المهل/);
  assert.doesNotMatch(page, /c\.hasDeadline/);
});
