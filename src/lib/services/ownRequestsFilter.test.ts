import { test } from "node:test";
import assert from "node:assert/strict";
import { ownRequestsOrFilter, isKnownReceiver } from "./ownRequestsFilter.ts";

const UID = "11111111-0000-0000-0000-000000000001";
const F1 = "ffffffff-0000-0000-0000-0000000000f1";
const F2 = "ffffffff-0000-0000-0000-0000000000f2";
const B1 = "bbbbbbbb-0000-0000-0000-0000000000b1";

test("no receiver: own, assigned, and the caller's firm and business rows — never the open marketplace", () => {
  assert.equal(
    ownRequestsOrFilter({ uid: UID, firmIds: [F1, F2], businessIds: [B1] }),
    `requester_user_id.eq.${UID},assigned_to.eq.${UID},firm_id.in.(${F1},${F2}),business_id.in.(${B1})`,
  );
});

test("no entity: the personal arms only (the route's old filter, unchanged)", () => {
  assert.equal(
    ownRequestsOrFilter({ uid: UID, firmIds: [], businessIds: [] }),
    `requester_user_id.eq.${UID},assigned_to.eq.${UID}`,
  );
});

test("receiver: every row he filed (any receiver), plus that receiver's rows assigned to him or of his entities", () => {
  assert.equal(
    ownRequestsOrFilter({ uid: UID, receiver: "lawyer", firmIds: [F1], businessIds: [] }),
    `requester_user_id.eq.${UID},and(receiver.eq.lawyer,assigned_to.eq.${UID}),and(receiver.eq.lawyer,firm_id.in.(${F1}))`,
  );
});

test("ids that are not uuids never reach the filter; duplicates collapse", () => {
  assert.equal(
    ownRequestsOrFilter({ uid: UID, firmIds: [F1, F1, "x),assigned_to.is.null,(", ""], businessIds: ["nope"] }),
    `requester_user_id.eq.${UID},assigned_to.eq.${UID},firm_id.in.(${F1})`,
  );
});

test("a malformed uid or receiver throws instead of building a filter", () => {
  assert.throws(() => ownRequestsOrFilter({ uid: "abc", firmIds: [], businessIds: [] }));
  assert.throws(() => ownRequestsOrFilter({ uid: UID, receiver: "lawyer,assigned_to.is.null", firmIds: [], businessIds: [] }));
});

test("isKnownReceiver accepts the receiver CHECK values only", () => {
  for (const r of ["lawyer", "firm", "provider", "business_legal", "ngo_admin", "government_reviewer", "ai_workspace"]) {
    assert.equal(isKnownReceiver(r), true, r);
  }
  for (const r of ["", "Lawyer", "lawyer,requester_user_id.eq.x", "client"]) {
    assert.equal(isKnownReceiver(r), false, r);
  }
});
