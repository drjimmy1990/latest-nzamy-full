import test from "node:test";
import assert from "node:assert/strict";
import {
  assigneesToCheck,
  hearingEmailMessage,
  hearingEmailRecipients,
  memberKey,
  type HearingEmailRow,
} from "./hearingEmailReminders.ts";
import { daysBetween, planPoaReminders, poaEmailMessage, poaOffset, type PoaContractRow } from "./poaEmailReminders.ts";
import { libraryEmailKey, libraryEmailMessage, riyadhDayOf } from "./libraryEmailReminders.ts";

const ENV = { NEXT_PUBLIC_SITE_URL: "https://nezamy.sa" };

// ── hearings ──────────────────────────────────────────────────────────────────
const H: HearingEmailRow = {
  id: "h1",
  owner_user_id: "owner",
  assignee_user_id: null,
  firm_id: null,
  title: "دعوى عمالية <رقم ٥>",
  hearing_date: "2026-11-20",
  hearing_time: "09:30:00",
  court_name: "المحكمة العمالية بالرياض",
  location: null,
  status: "scheduled",
};

test("hearing: the owner always; the assignee only while an active member of the hearing's firm", () => {
  assert.deepEqual(hearingEmailRecipients(H, new Set()), [{ userId: "owner", via: "owner" }]);

  const assigned = { ...H, firm_id: "f1", assignee_user_id: "member" };
  assert.deepEqual(hearingEmailRecipients(assigned, new Set([memberKey("f1", "member")])), [
    { userId: "owner", via: "owner" },
    { userId: "member", via: "assignee" },
  ]);
  assert.deepEqual(hearingEmailRecipients(assigned, new Set()), [{ userId: "owner", via: "owner" }], "a removed member gets nothing");
  assert.deepEqual(
    hearingEmailRecipients(assigned, new Set([memberKey("f2", "member")])),
    [{ userId: "owner", via: "owner" }],
    "membership of ANOTHER firm does not count",
  );
  assert.deepEqual(
    hearingEmailRecipients({ ...H, assignee_user_id: "someone" }, new Set([memberKey("", "someone")])),
    [{ userId: "owner", via: "owner" }],
    "a solo hearing (no firm) is never e-mailed to anyone but its owner",
  );
  assert.deepEqual(hearingEmailRecipients({ ...H, assignee_user_id: "owner" }, new Set()), [{ userId: "owner", via: "owner" }], "one e-mail when the owner is the assignee");
  assert.deepEqual(hearingEmailRecipients({ ...H, status: "postponed" }, new Set()), []);
});

test("hearing: only other-person assignees on a firm hearing are checked, once each", () => {
  const rows = [
    { ...H, id: "a", firm_id: "f1", assignee_user_id: "m1" },
    { ...H, id: "b", firm_id: "f1", assignee_user_id: "m1" },
    { ...H, id: "c", firm_id: null, assignee_user_id: "m2" },
    { ...H, id: "d", firm_id: "f1", assignee_user_id: "owner" },
  ];
  assert.deepEqual(assigneesToCheck(rows), [{ firmId: "f1", userId: "m1" }]);
});

test("hearing e-mail: Arabic, escaped, with the date, time, court and an https link", () => {
  const m = hearingEmailMessage(H, "owner", ENV);
  assert.equal(m.subject, "تذكير بجلسة غداً: دعوى عمالية <رقم ٥>");
  assert.ok(m.html.includes("دعوى عمالية &lt;رقم ٥&gt;"));
  assert.ok(!m.html.includes("<رقم"));
  assert.ok(m.text.includes("٢٠٢٦-١١-٢٠"));
  assert.ok(m.text.includes("٠٩:٣٠ ص"));
  assert.ok(m.text.includes("المحكمة العمالية بالرياض"));
  assert.ok(m.text.includes("https://nezamy.sa/dashboard/lawyer/hearings"));
  assert.ok(hearingEmailMessage({ ...H, firm_id: "f", assignee_user_id: "m" }, "assignee", ENV).text.includes("أُسندت إليك"));
  assert.ok(!hearingEmailMessage(H, "owner", {}).text.includes("http"), "no site URL → no link");
  assert.ok(hearingEmailMessage(H, "owner", ENV, "/dashboard/firm").text.includes("https://nezamy.sa/dashboard/firm/hearings"), "a firm account opens its own dashboard");
});

// ── power of attorney ─────────────────────────────────────────────────────────
const C: PoaContractRow = { id: "ct-1", owner_user_id: "lawyer", title: "وكالة عامة", counterparty_name: "موكل", ends_on: null, status: "active" };

test("poa: 30 between 8 and 30 days, 7 from 7 days to the last day, nothing outside", () => {
  const today = "2026-11-17";
  assert.equal(daysBetween(today, "2026-12-17"), 30);
  assert.equal(poaOffset(today, "2026-12-18"), null);
  assert.equal(poaOffset(today, "2026-12-17"), 30);
  assert.equal(poaOffset(today, "2026-11-25"), 30);
  assert.equal(poaOffset(today, "2026-11-24"), 7);
  assert.equal(poaOffset(today, "2026-11-17"), 7);
  assert.equal(poaOffset(today, "2026-11-16"), null);
  assert.equal(poaOffset(today, null), null);
  assert.equal(poaOffset(today, "garbage"), null);
});

test("poa: ended, owner-less and undated rows are not reminded", () => {
  const today = "2026-11-17";
  const plan = planPoaReminders(
    [
      { ...C, id: "a", ends_on: "2026-12-01" },
      { ...C, id: "b", ends_on: "2026-11-20", status: "draft" },
      { ...C, id: "c", ends_on: "2026-11-20", status: "terminated" },
      { ...C, id: "d", ends_on: "2026-11-20", owner_user_id: null },
      { ...C, id: "e", ends_on: null },
    ],
    today,
  );
  assert.deepEqual(plan.map((p) => [p.contract.id, p.offset, p.daysLeft]), [["a", 30, 14], ["b", 7, 3]]);
  const m = poaEmailMessage(plan[1], ENV);
  assert.ok(m.subject.includes("بعد ٣ أيام"));
  assert.ok(m.text.includes("https://nezamy.sa/dashboard/lawyer/contracts/b"));
  assert.ok(m.text.includes("٢٠٢٦-١١-٢٠"));
  assert.ok(poaEmailMessage(plan[1], ENV, "/dashboard/firm").text.includes("https://nezamy.sa/dashboard/firm/contracts/b"));
});

// ── library ───────────────────────────────────────────────────────────────────
test("library: kind by offset, the chain-end grant as subject, the Riyadh day as due_on, the in-app wording", () => {
  const now = new Date("2026-11-17T08:00:00Z");
  const r7 = { userId: "u", grantId: "g", offset: 7 as const, endsAt: "2026-11-22T21:30:00Z" };
  assert.deepEqual(libraryEmailKey(r7), { kind: "library_7d", subjectId: "g", recipientUserId: "u", dueOn: "2026-11-23" });
  assert.equal(libraryEmailKey({ ...r7, offset: 3 })?.kind, "library_3d");
  assert.equal(libraryEmailKey({ ...r7, endsAt: "nope" }), null);
  assert.equal(riyadhDayOf("2026-11-22T20:59:00Z"), "2026-11-22");
  const m = libraryEmailMessage(r7, now, ENV);
  assert.equal(m.subject, "اشتراك المكتبة ينتهي قريباً");
  assert.ok(m.text.includes("https://nezamy.sa/laws/subscribe"));
});
