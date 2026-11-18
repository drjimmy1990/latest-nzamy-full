import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  hearing_date: "2026-11-20",
  status: "scheduled",
};

// Owner ٤٥: marker strings in every case-data column a row could carry. Even
// if a caller passed them, none may reach the e-mail.
const LEAKY = {
  ...H,
  title: "عنوان-سري-للقضية",
  court_name: "محكمة-سرية",
  location: "مكان-سري",
  hearing_time: "09:30:00",
  client_name: "موكل-سري",
} as HearingEmailRow;
const HEARING_SECRETS = ["عنوان-سري-للقضية", "محكمة-سرية", "مكان-سري", "موكل-سري", "09:30", "٠٩:٣٠"];

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

test("hearing e-mail (owner ٤٥): generic — «لديك جلسة غداً — افتحها من نظامي», the date and a link, no case data", () => {
  const m = hearingEmailMessage(LEAKY, "owner", ENV);
  assert.equal(m.subject, "تذكير: لديك جلسة غداً");
  assert.ok(m.text.includes("لديك جلسة غداً — افتحها من نظامي"));
  assert.ok(m.text.includes("٢٠٢٦-١١-٢٠"));
  assert.ok(m.text.includes("https://nezamy.sa/dashboard/lawyer/hearings"));
  const assigned = hearingEmailMessage({ ...LEAKY, firm_id: "f", assignee_user_id: "m" }, "assignee", ENV);
  assert.ok(assigned.text.includes("مُسندة إليك"));
  for (const msg of [m, assigned]) {
    for (const secret of HEARING_SECRETS) {
      for (const part of [msg.subject, msg.html, msg.text]) {
        assert.equal(part.includes(secret), false, `no «${secret}» in a hearing e-mail`);
      }
    }
  }
  assert.ok(!hearingEmailMessage(H, "owner", {}).text.includes("http"), "no site URL → no link");
  assert.ok(hearingEmailMessage(H, "owner", ENV, "/dashboard/firm").text.includes("https://nezamy.sa/dashboard/firm/hearings"), "a firm account opens its own dashboard");
});

// ── power of attorney ─────────────────────────────────────────────────────────
const C: PoaContractRow = { id: "ct-1", owner_user_id: "lawyer", ends_on: null, status: "active" };

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
  assert.equal(m.subject, "تذكير: وكالة قانونية تنتهي بعد ٣ أيام");
  assert.ok(m.text.includes("افتحها من نظامي"));
  assert.ok(m.text.includes("https://nezamy.sa/dashboard/lawyer/contracts/b"));
  assert.ok(m.text.includes("٢٠٢٦-١١-٢٠"));
  assert.ok(poaEmailMessage(plan[1], ENV, "/dashboard/firm").text.includes("https://nezamy.sa/dashboard/firm/contracts/b"));
});

test("poa e-mail (owner ٤٥): no client, counterparty or contract title — even if a row carried them", () => {
  const leaky = { ...C, id: "z", ends_on: "2026-11-20", title: "وكالة-فلان-السري", counterparty_name: "موكل-سري" } as PoaContractRow;
  const [r] = planPoaReminders([leaky], "2026-11-17");
  const m = poaEmailMessage(r, ENV);
  for (const secret of ["وكالة-فلان-السري", "موكل-سري", "الموكل / الطرف"]) {
    for (const part of [m.subject, m.html, m.text]) assert.equal(part.includes(secret), false, `no «${secret}» in a POA e-mail`);
  }
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
  // Owner ٤٥: the library e-mail is about the user's own subscription — it
  // carries no client or case data, only the end of the subscription.
  const src = readFileSync(new URL("./libraryEmailReminders.ts", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const field of ["client", "counterparty", "case_", "court", "hearing"]) {
    assert.equal(code.includes(field), false, `no ${field} in the library e-mail`);
  }
});
