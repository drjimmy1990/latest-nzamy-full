import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_PAYMENT_COLUMNS,
  OVERDUE_LOOKBACK_DAYS,
  PAYMENT_DUE_SOON_DAYS,
  paymentEmailMessage,
  paymentInAppNotice,
  planPaymentReminders,
  type ContractPaymentRow,
} from "./contractPaymentReminders.ts";

const TODAY = "2026-11-20";
const ENV = { NEXT_PUBLIC_SITE_URL: "https://example.test" };

function pay(over: Partial<ContractPaymentRow> = {}): ContractPaymentRow {
  return {
    id: "p1",
    contract_id: "c1",
    label: "الدفعة الثانية — أتعاب قضية شركة الأمل",
    due_on: "2026-11-22",
    status: "pending",
    contracts: { owner_user_id: "lawyer", status: "active" },
    ...over,
  };
}

test("due within 3 days, overdue up to 30 days back; nothing else", () => {
  assert.equal(PAYMENT_DUE_SOON_DAYS, 3);
  assert.equal(OVERDUE_LOOKBACK_DAYS, 30);
  const plan = planPaymentReminders(
    [
      pay({ id: "today", due_on: "2026-11-20" }),
      pay({ id: "in3", due_on: "2026-11-23" }),
      pay({ id: "in4", due_on: "2026-11-24" }),
      pay({ id: "late1", due_on: "2026-11-19" }),
      pay({ id: "late30", due_on: "2026-10-21" }),
      pay({ id: "late31", due_on: "2026-10-20" }),
      pay({ id: "marked", due_on: "2026-11-10", status: "overdue" }),
      pay({ id: "paid", status: "paid" }),
      pay({ id: "cancelled", status: "cancelled" }),
      pay({ id: "nodate", due_on: null }),
    ],
    TODAY,
  );
  assert.deepEqual(plan.map((p) => [p.payment.id, p.stage, p.daysLeft]), [
    ["today", "due", 0],
    ["in3", "due", 3],
    ["late1", "overdue", -1],
    ["late30", "overdue", -30],
    ["marked", "overdue", -10],
  ]);
  assert.ok(plan.every((p) => p.ownerId === "lawyer" && p.contractId === "c1"));
});

test("a cancelled or terminated contract, or one with no lawyer, is not reminded; the embed may be an array", () => {
  const plan = planPaymentReminders(
    [
      pay({ id: "cancelled", contracts: { owner_user_id: "lawyer", status: "cancelled" } }),
      pay({ id: "terminated", contracts: { owner_user_id: "lawyer", status: "terminated" } }),
      pay({ id: "noowner", contracts: { owner_user_id: null, status: "active" } }),
      pay({ id: "noembed", contracts: null }),
      pay({ id: "draft", contracts: { owner_user_id: "lawyer", status: "draft" } }),
      pay({ id: "expired", contracts: [{ owner_user_id: "lawyer", status: "expired" }] }),
    ],
    TODAY,
  );
  assert.deepEqual(plan.map((p) => p.payment.id), ["draft", "expired"]);
});

test("owner ٤٥: the e-mail carries no label, amount or client — only the stage, the date and the link", () => {
  for (const [stage, days] of [["due", 2], ["due", 0], ["overdue", -4]] as const) {
    const m = paymentEmailMessage(stage, days, "2026-11-22", "c1", ENV, "/dashboard/lawyer");
    assert.doesNotMatch(m.html + m.text + m.subject, /شركة الأمل|الدفعة الثانية|ر\.س|ريال/);
    assert.match(m.text, /https:\/\/example\.test\/dashboard\/lawyer\/contracts\/c1/);
    assert.match(m.text, /٢٠٢٦-١١-٢٢/);
    assert.match(m.subject, stage === "overdue" ? /متأخرة/ : /مستحقة/);
  }
  const firm = paymentEmailMessage("due", 1, "2026-11-21", "c 1", ENV, "/dashboard/firm");
  assert.match(firm.text, /\/dashboard\/firm\/contracts\/c%201/);
});

test("the select list reads no amount, notes, title or counterparty; the in-app notice names the installment", () => {
  for (const c of ["amount_sar", "notes", "title", "counterparty_name", "lawyer_client_id"]) {
    assert.equal(CONTRACT_PAYMENT_COLUMNS.includes(c), false, c);
  }
  assert.match(CONTRACT_PAYMENT_COLUMNS, /contracts!inner\(owner_user_id, status\)/);
  const [due] = planPaymentReminders([pay()], TODAY);
  const n = paymentInAppNotice(due, "/dashboard/firm");
  assert.match(n.title, /^دفعة مستحقة: الدفعة الثانية/);
  assert.match(n.body, /بعد يومين/);
  assert.equal(n.href, "/dashboard/firm/contracts/c1");
  const [late] = planPaymentReminders([pay({ due_on: "2026-11-15" })], TODAY);
  assert.match(paymentInAppNotice(late).title, /^دفعة متأخرة/);
});
