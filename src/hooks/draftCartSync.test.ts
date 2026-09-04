import test from "node:test";
import assert from "node:assert/strict";

import { isCurrentSequence, shouldMigrateLocalDraft, extractCartUserId } from "./draftCartSync.ts";

test("isCurrentSequence: true only when seq matches the latest issued sequence", () => {
  assert.equal(isCurrentSequence(1, 1), true);
  assert.equal(isCurrentSequence(1, 2), false);
  assert.equal(isCurrentSequence(3, 2), false);
});

test("shouldMigrateLocalDraft: only when the server is empty and local has entries", () => {
  assert.equal(shouldMigrateLocalDraft(0, 3), true);
  assert.equal(shouldMigrateLocalDraft(0, 0), false, "nothing local to migrate");
  assert.equal(shouldMigrateLocalDraft(2, 3), false, "server already has a cart — it wins, no migration");
  assert.equal(shouldMigrateLocalDraft(2, 0), false);
});

test("extractCartUserId: signed-in response shape", () => {
  assert.equal(extractCartUserId({ data: { user_id: "u-1", items: [] } }), "u-1");
});

test("extractCartUserId: anonymous response shape (200 with user_id: null)", () => {
  assert.equal(extractCartUserId({ data: { user_id: null, items: [] } }), null);
});

test("extractCartUserId: malformed/empty bodies never throw", () => {
  assert.equal(extractCartUserId(null), null);
  assert.equal(extractCartUserId(undefined), null);
  assert.equal(extractCartUserId({}), null);
  assert.equal(extractCartUserId({ data: null }), null);
  assert.equal(extractCartUserId({ data: {} }), null);
  assert.equal(extractCartUserId({ data: { user_id: "" } }), null, "empty string is not a real id");
  assert.equal(extractCartUserId({ data: { user_id: 42 } }), null, "wrong type is treated as anonymous, not thrown");
  assert.equal(extractCartUserId("not an object"), null);
});
