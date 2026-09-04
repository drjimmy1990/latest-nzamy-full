import test from "node:test";
import assert from "node:assert/strict";

import { bucketFirmMemberWorkload } from "./firmMemberWorkload.ts";

const MEMBERS = [
  { id: "member-1", user_id: "user-1" },
  { id: "member-2", user_id: "user-2" },
];

test("a member with no rows at all gets an explicit all-zero entry, not a missing one", () => {
  const result = bucketFirmMemberWorkload(MEMBERS, { tasks: [], hearings: [], requests: [] }, "2026-09-04");
  assert.equal(result.length, 2);
  for (const entry of result) {
    assert.equal(entry.assignedRequests, 0);
    assert.equal(entry.openTasks, 0);
    assert.equal(entry.upcomingHearings, 0);
  }
});

test("openTasks counts todo/in_progress and excludes done/archived", () => {
  const result = bucketFirmMemberWorkload(
    MEMBERS,
    {
      tasks: [
        { owner_user_id: "user-1", status: "todo" },
        { owner_user_id: "user-1", status: "in_progress" },
        { owner_user_id: "user-1", status: "done" },
        { owner_user_id: "user-1", status: "archived" },
        { owner_user_id: "user-2", status: "todo" },
      ],
      hearings: [],
      requests: [],
    },
    "2026-09-04",
  );
  const byId = new Map(result.map((r) => [r.memberId, r]));
  assert.equal(byId.get("member-1")?.openTasks, 2);
  assert.equal(byId.get("member-2")?.openTasks, 1);
});

test("upcomingHearings requires status=scheduled AND hearing_date >= today", () => {
  const result = bucketFirmMemberWorkload(
    MEMBERS,
    {
      tasks: [],
      hearings: [
        { owner_user_id: "user-1", status: "scheduled", hearing_date: "2026-09-04" }, // today, counts
        { owner_user_id: "user-1", status: "scheduled", hearing_date: "2026-09-10" }, // future, counts
        { owner_user_id: "user-1", status: "scheduled", hearing_date: "2026-09-01" }, // past, excluded
        { owner_user_id: "user-1", status: "held", hearing_date: "2026-09-10" }, // resolved, excluded
        { owner_user_id: "user-1", status: "cancelled", hearing_date: "2026-09-10" }, // resolved, excluded
      ],
      requests: [],
    },
    "2026-09-04",
  );
  const m1 = result.find((r) => r.memberId === "member-1");
  assert.equal(m1?.upcomingHearings, 2);
});

test("assignedRequests counts every row with assigned_to = the member, null assigned_to ignored", () => {
  const result = bucketFirmMemberWorkload(
    MEMBERS,
    {
      tasks: [],
      hearings: [],
      requests: [
        { assigned_to: "user-1" },
        { assigned_to: "user-1" },
        { assigned_to: "user-2" },
        { assigned_to: null },
      ],
    },
    "2026-09-04",
  );
  const byId = new Map(result.map((r) => [r.memberId, r]));
  assert.equal(byId.get("member-1")?.assignedRequests, 2);
  assert.equal(byId.get("member-2")?.assignedRequests, 1);
});

test("a row whose owner/assignee is not a known member is dropped, not turned into a phantom entry", () => {
  const result = bucketFirmMemberWorkload(
    MEMBERS,
    {
      tasks: [{ owner_user_id: "someone-else", status: "todo" }],
      hearings: [{ owner_user_id: "someone-else", status: "scheduled", hearing_date: "2026-09-04" }],
      requests: [{ assigned_to: "someone-else" }],
    },
    "2026-09-04",
  );
  assert.equal(result.length, 2);
  assert.equal(result.every((r) => r.openTasks === 0 && r.upcomingHearings === 0 && r.assignedRequests === 0), true);
});

test("an empty member list returns an empty result even with rows present", () => {
  const result = bucketFirmMemberWorkload(
    [],
    { tasks: [{ owner_user_id: "user-1", status: "todo" }], hearings: [], requests: [] },
    "2026-09-04",
  );
  assert.deepEqual(result, []);
});
