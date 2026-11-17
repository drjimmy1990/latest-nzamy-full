import { test } from "node:test";
import assert from "node:assert/strict";
import {
  timeAmountHalalas, sarToHalalas, formatSar, formatDuration, parseDay, parseTimeCreate, parseTimePatch,
  parseExpenseCreate, parseExpensePatch, parseTrustCreate, parseVoidReason, needsNegativeConfirmation,
  trustBalanceAfter, parseListFilters, toTimeDto, withRunningBalance, buildFeeStatement,
  statementIdempotencyKey, statementInvoiceDescription, parseMarkBilled, riyadhDay,
  type TimeDto, type ExpenseDto, type TrustDto, type TimeRow,
} from "./financeLedgerRules.ts";

const TODAY = "2026-11-18";
const CARD = "cccccccc-0000-0000-0000-0000000000f1";
const NAMES = { caseTitle: null, clientName: null, writerName: null };

test("time amount = round(minutes × rate / 60), the generated column's formula", () => {
  assert.equal(timeAmountHalalas(90, 30000), 45000);
  assert.equal(timeAmountHalalas(1, 100), 2); // 1.666… → 2
  assert.equal(timeAmountHalalas(1, 30), 1); // 0.5 → 1 (half up, as numeric round)
  assert.equal(timeAmountHalalas(45, 0), 0);
});

test("SAR text → halalas: 2 decimals at most, Arabic digits accepted, no guessing", () => {
  assert.equal(sarToHalalas("300"), 30000);
  assert.equal(sarToHalalas("300.5"), 30050);
  assert.equal(sarToHalalas("٣٠٠٫٢٥"), 30025);
  assert.equal(sarToHalalas("1,250.00"), 125000);
  assert.equal(sarToHalalas(12.5), 1250);
  assert.equal(sarToHalalas("1.234"), null);
  assert.equal(sarToHalalas("-5"), null);
  assert.equal(sarToHalalas("abc"), null);
  assert.equal(sarToHalalas(""), null);
});

test("formatting", () => {
  assert.equal(formatSar(123456), "1,234.56");
  assert.equal(formatDuration(135), "2 س 15 د");
  assert.equal(formatDuration(45), "45 د");
  assert.equal(formatDuration(120), "2 س");
});

test("days: real calendar days, not in the future beyond a day", () => {
  assert.equal(parseDay("2026-11-18", TODAY, "x").ok, true);
  assert.equal(parseDay("2026-11-19", TODAY, "x").ok, true);
  assert.equal(parseDay("2026-11-20", TODAY, "x").ok, false);
  assert.equal(parseDay("2026-02-30", TODAY, "x").ok, false);
  assert.equal(parseDay("1989-12-31", TODAY, "x").ok, false);
  assert.equal(riyadhDay(Date.parse("2026-11-17T22:30:00Z")), "2026-11-18");
});

test("time entry create: a case or a client is required; defaults are honest", () => {
  assert.equal(parseTimeCreate({ durationMin: 30, description: "x" }, TODAY).ok, false);
  const p = parseTimeCreate({ caseRequestId: "case-1", durationMin: "45", description: "  مذكرة ", hourlyRateHalalas: 30000 }, TODAY);
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.value.workDate, TODAY);
    assert.equal(p.value.durationMin, 45);
    assert.equal(p.value.description, "مذكرة");
    assert.equal(p.value.billable, true);
    assert.equal(p.value.lawyerClientId, null);
  }
  const unpriced = parseTimeCreate({ lawyerClientId: CARD, durationMin: 10, description: "x" }, TODAY);
  assert.ok(unpriced.ok && unpriced.value.hourlyRateHalalas === 0);
  assert.equal(parseTimeCreate({ caseRequestId: "c", durationMin: 0, description: "x" }, TODAY).ok, false);
  assert.equal(parseTimeCreate({ caseRequestId: "c", durationMin: 1441, description: "x" }, TODAY).ok, false);
  assert.equal(parseTimeCreate({ caseRequestId: "c", durationMin: 10, description: "x", hourlyRateHalalas: 1.5 }, TODAY).ok, false);
  assert.equal(parseTimeCreate({ lawyerClientId: "not-a-uuid", durationMin: 10, description: "x" }, TODAY).ok, false);
});

test("PATCH: void needs a reason; edits never carry case, client or firm", () => {
  assert.equal(parseTimePatch({ void: true, reason: "x" }, TODAY).ok, false);
  const v = parseTimePatch({ void: true, reason: " مكرر " }, TODAY);
  assert.deepEqual(v, { ok: true, value: { kind: "void", reason: "مكرر" } });
  const e = parseTimePatch({ durationMin: 30, caseRequestId: "other", firmId: "x" }, TODAY);
  assert.deepEqual(e, { ok: true, value: { kind: "edit", row: { duration_min: 30 } } });
  assert.equal(parseTimePatch({ caseRequestId: "other" }, TODAY).ok, false);
  assert.equal(parseVoidReason("a".repeat(501)).ok, false);
  const x = parseExpensePatch({ category: "travel", amountHalalas: 500 }, TODAY);
  assert.deepEqual(x, { ok: true, value: { kind: "edit", row: { category: "travel", amount_halalas: 500 } } });
});

test("expense create: category vocabulary and a positive amount", () => {
  assert.equal(parseExpenseCreate({ caseRequestId: "c", category: "lunch", description: "x", amountHalalas: 100 }, TODAY).ok, false);
  assert.equal(parseExpenseCreate({ caseRequestId: "c", category: "travel", description: "x", amountHalalas: 0 }, TODAY).ok, false);
  const p = parseExpenseCreate({ caseRequestId: "c", category: "court_fees", description: "رسوم", amountHalalas: 15000, billable: false }, TODAY);
  assert.ok(p.ok && p.value.billable === false && p.value.spentOn === TODAY);
});

test("trust: a client card is required; going below zero needs a confirmation", () => {
  assert.equal(parseTrustCreate({ kind: "deposit", amountHalalas: 100, description: "x" }, TODAY).ok, false);
  const p = parseTrustCreate({ lawyerClientId: CARD, kind: "disbursement", amountHalalas: 100, description: "x", confirmNegative: "yes" }, TODAY);
  assert.ok(p.ok && p.value.confirmNegative === false, "only the literal true confirms");
  assert.equal(trustBalanceAfter(100, "deposit", 50), 150);
  assert.equal(needsNegativeConfirmation(100, "disbursement", 100), false);
  assert.equal(needsNegativeConfirmation(100, "disbursement", 101), true);
  assert.equal(needsNegativeConfirmation(-50, "deposit", 10), false);
});

test("list filters ignore junk", () => {
  const f = parseListFilters((k) => ({ caseId: " c-1 ", clientId: "nope", from: "2026-11-01", to: "11/30", voided: "1" } as Record<string, string>)[k] ?? null);
  assert.deepEqual(f, { caseId: "c-1", clientId: null, from: "2026-11-01", to: null, includeVoided: true });
});

test("DTO: a time row without the generated amount gets it computed, never 0 by accident", () => {
  const row: TimeRow = {
    id: "t1", created_by: "u", firm_id: null, case_request_id: "c", lawyer_client_id: null, description: "x",
    voided_at: null, voided_by: null, void_reason: null, created_at: "2026-11-18T08:00:00Z",
    work_date: TODAY, duration_min: 90, hourly_rate_halalas: "30000", amount_halalas: null, billable: true,
    work_session_id: null, billed_payment_id: null, billed_at: null,
  };
  const d = toTimeDto(row, "u", NAMES);
  assert.equal(d.amountHalalas, 45000);
  assert.equal(d.mine, true);
  assert.equal(d.billed, false);
});

const time = (id: string, date: string, min: number, rate: number, extra: Partial<TimeDto> = {}): TimeDto => ({
  id, caseRequestId: "c", lawyerClientId: CARD, caseTitle: "قضية", clientName: null, writerName: null, firmId: null,
  description: `t ${id}`, mine: true, voided: false, voidedAt: null, voidReason: null, createdAt: `${date}T08:00:00Z`,
  workDate: date, durationMin: min, hourlyRateHalalas: rate, amountHalalas: timeAmountHalalas(min, rate),
  billable: true, billed: false, billedPaymentId: null, workSessionId: null, ...extra,
});
const expense = (id: string, date: string, amount: number, extra: Partial<ExpenseDto> = {}): ExpenseDto => ({
  id, caseRequestId: "c", lawyerClientId: CARD, caseTitle: "قضية", clientName: null, writerName: null, firmId: null,
  description: `e ${id}`, mine: true, voided: false, voidedAt: null, voidReason: null, createdAt: `${date}T08:00:00Z`,
  spentOn: date, category: "court_fees", amountHalalas: amount, billable: true, billed: false, billedPaymentId: null,
  hasReceipt: false, ...extra,
});

test("fee statement: billable, live, unbilled rows of the period; the rest counted, not dropped", () => {
  const s = buildFeeStatement(
    [
      time("t1", "2026-11-02", 90, 30000),
      time("t2", "2026-11-03", 30, 0),
      time("t3", "2026-11-04", 60, 30000, { voided: true }),
      time("t4", "2026-11-05", 60, 30000, { billable: false }),
      time("t5", "2026-11-06", 60, 30000, { billed: true }),
      time("t6", "2026-10-30", 60, 30000),
    ],
    [expense("e1", "2026-11-10", 15000), expense("e2", "2026-12-01", 5000)],
    "2026-11-01",
    "2026-11-30",
  );
  assert.deepEqual(s.timeLines.map((l) => l.id), ["t1", "t2"]);
  assert.deepEqual(s.expenseLines.map((l) => l.id), ["e1"]);
  assert.equal(s.totalMinutes, 120);
  assert.equal(s.timeTotalHalalas, 45000);
  assert.equal(s.expenseTotalHalalas, 15000);
  assert.equal(s.totalHalalas, 60000);
  assert.deepEqual(s.excluded, { voided: 1, notBillable: 1, alreadyBilled: 1 });
  assert.equal(s.unpricedTimeCount, 1);
  assert.match(statementInvoiceDescription(s, "موكل"), /بيان أتعاب: موكل \(2026-11-01 → 2026-11-30\)/);
});

test("statement key: same lines → same key (a retry replays the invoice); changed amount → new key", () => {
  const a = [{ source: "time" as const, id: "t1", amountHalalas: 100 }, { source: "expense" as const, id: "e1", amountHalalas: 5 }];
  const k1 = statementIdempotencyKey(a);
  assert.equal(k1, statementIdempotencyKey([...a].reverse()));
  assert.notEqual(k1, statementIdempotencyKey([{ ...a[0], amountHalalas: 101 }, a[1]]));
  assert.ok(k1.length >= 8 && k1.length <= 100);
});

test("trust running balance per card, voided rows do not move it", () => {
  const t = (id: string, day: string, kind: "deposit" | "disbursement", amount: number, voided = false, card = CARD): TrustDto => ({
    id, caseRequestId: null, lawyerClientId: card, caseTitle: null, clientName: null, writerName: null, firmId: null,
    description: id, mine: true, voided, voidedAt: null, voidReason: null, createdAt: `${day}T08:00:00Z`,
    kind, amountHalalas: amount, occurredOn: day, reference: "", negativeAck: false,
  });
  const rows = withRunningBalance([
    t("b", "2026-11-03", "disbursement", 300),
    t("a", "2026-11-01", "deposit", 1000),
    t("v", "2026-11-02", "disbursement", 900, true),
    t("o", "2026-11-02", "deposit", 50, false, "other-card"),
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.balanceAfterHalalas]), [["a", 1000], ["v", null], ["o", 50], ["b", 700]]);
});

test("mark billed body", () => {
  assert.equal(parseMarkBilled({ paymentId: "p", timeIds: [], expenseIds: [] }).ok, false);
  assert.equal(parseMarkBilled({ paymentId: "p", timeIds: ["bad"] }).ok, false);
  const ok = parseMarkBilled({ paymentId: "p", timeIds: [CARD, CARD.toUpperCase()] });
  assert.ok(ok.ok && ok.value.timeIds.length === 1 && ok.value.expenseIds.length === 0);
});
