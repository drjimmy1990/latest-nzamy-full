import test from "node:test";
import assert from "node:assert/strict";
import {
  TASK_REMINDER_COLUMNS,
  planTaskReminders,
  taskAssigneesToCheck,
  taskEmailMessage,
  taskInAppNotice,
  taskMemberKey,
  type TaskReminderRow,
} from "./taskReminders.ts";

const TODAY = "2026-11-20";
const TOMORROW = "2026-11-21";
const ENV = { NEXT_PUBLIC_SITE_URL: "https://example.test" };

function task(over: Partial<TaskReminderRow> = {}): TaskReminderRow {
  return {
    id: "t1",
    owner_user_id: "owner",
    assignee_user_id: null,
    firm_id: null,
    title: "تجهيز مذكرة الرد على دعوى شركة الأمل",
    due_date: TOMORROW,
    status: "todo",
    ...over,
  };
}

test("open tasks due today or tomorrow remind their owner; others do not", () => {
  const rows = [
    task({ id: "a", due_date: TODAY }),
    task({ id: "b", due_date: TOMORROW, status: "in_progress" }),
    task({ id: "c", due_date: "2026-11-22" }),
    task({ id: "d", due_date: "2026-11-19" }),
    task({ id: "e", status: "done" }),
    task({ id: "f", status: "archived" }),
    task({ id: "g", due_date: null }),
    task({ id: "h", owner_user_id: null }),
  ];
  const plan = planTaskReminders(rows, TODAY, TOMORROW, new Set());
  assert.deepEqual(plan.map((p) => [p.task.id, p.userId, p.via, p.when, p.dueOn]), [
    ["a", "owner", "owner", "today", TODAY],
    ["b", "owner", "owner", "tomorrow", TOMORROW],
  ]);
});

test("the assignee is reminded only while an active member of the task's firm, and never twice", () => {
  const active = new Set([taskMemberKey("firm1", "member")]);
  const plan = planTaskReminders(
    [
      task({ id: "a", firm_id: "firm1", assignee_user_id: "member" }),
      task({ id: "b", firm_id: "firm1", assignee_user_id: "former" }),
      task({ id: "c", firm_id: null, assignee_user_id: "member" }),
      task({ id: "d", firm_id: "firm1", assignee_user_id: "owner" }),
    ],
    TODAY,
    TOMORROW,
    active,
  );
  assert.deepEqual(plan.map((p) => `${p.task.id}:${p.userId}:${p.via}`), [
    "a:owner:owner",
    "a:member:assignee",
    "b:owner:owner",
    "c:owner:owner",
    "d:owner:owner",
  ]);
  assert.deepEqual(
    taskAssigneesToCheck([
      task({ firm_id: "firm1", assignee_user_id: "member" }),
      task({ id: "t2", firm_id: "firm1", assignee_user_id: "member" }),
      task({ id: "t3", firm_id: null, assignee_user_id: "x" }),
      task({ id: "t4", firm_id: "firm1", assignee_user_id: "owner" }),
    ]),
    [{ firmId: "firm1", userId: "member" }],
  );
});

test("owner ٤٥: the e-mail is generic — no task title, and the builder never sees the row", () => {
  // The builder's signature takes who / when / the date only.
  assert.equal(taskEmailMessage.length >= 3, true);
  for (const via of ["owner", "assignee"] as const) {
    for (const when of ["today", "tomorrow"] as const) {
      const m = taskEmailMessage(via, when, TOMORROW, ENV, "/dashboard/lawyer");
      assert.doesNotMatch(m.html + m.text + m.subject, /شركة الأمل|مذكرة/);
      assert.match(m.subject, when === "today" ? /اليوم/ : /غداً/);
      assert.match(m.text, /https:\/\/example\.test\/dashboard\/lawyer\/tasks/);
      assert.match(m.text, /٢٠٢٦-١١-٢١/);
      if (via === "assignee") assert.match(m.text, /مُسندة إليك/);
    }
  }
  const firm = taskEmailMessage("owner", "tomorrow", TOMORROW, ENV, "/dashboard/firm");
  assert.match(firm.text, /\/dashboard\/firm\/tasks/);
  const noSite = taskEmailMessage("owner", "tomorrow", TOMORROW, {});
  assert.doesNotMatch(noSite.html, /<a /, "no https origin → no link");
});

test("the route's select list is pinned; the title feeds the in-app notice only", () => {
  assert.equal(TASK_REMINDER_COLUMNS, "id, owner_user_id, assignee_user_id, firm_id, title, due_date, status");
  const [p] = planTaskReminders([task()], TODAY, TOMORROW, new Set());
  const n = taskInAppNotice(p, "/dashboard/lawyer");
  assert.match(n.title, /^تذكير بمهمة: تجهيز مذكرة/);
  assert.match(n.body, /غداً/);
  assert.equal(n.href, "/dashboard/lawyer/tasks");
  const long = taskInAppNotice({ ...p, task: { ...p.task, title: "س".repeat(200) } });
  assert.ok(long.title.length < 100);
  const blank = taskInAppNotice({ ...p, task: { ...p.task, title: "  " } });
  assert.match(blank.title, /مهمة بلا عنوان/);
});
