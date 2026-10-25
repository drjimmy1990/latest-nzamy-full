import test from "node:test";
import assert from "node:assert/strict";
import { keepFirmMemberEvents, membershipKey } from "./officeActivityScope.ts";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const X = "11111111-0000-0000-0000-00000000000x"; // member of A only
const Y = "22222222-0000-0000-0000-00000000000y"; // member of B only

const members = new Set([membershipKey(A, X), membershipKey(B, Y)]);

test("an event stays only when its actor is an active member of THAT event's firm", () => {
  const rows = [
    { id: 1, firm_id: A, actor_user_id: X },
    { id: 2, firm_id: B, actor_user_id: Y },
    // X belongs to A only but wrote a row carrying firm B: the activity_events
    // insert policy checks the actor, not the firm, so this is a plant.
    { id: 3, firm_id: B, actor_user_id: X },
    { id: 4, firm_id: A, actor_user_id: null },
    { id: 5, firm_id: null, actor_user_id: X },
  ];
  assert.deepEqual(keepFirmMemberEvents(rows, members).map((r) => r.id), [1, 2]);
});

test("no memberships → nothing", () => {
  assert.deepEqual(keepFirmMemberEvents([{ id: 1, firm_id: A, actor_user_id: X }], new Set()), []);
});
