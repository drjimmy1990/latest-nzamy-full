import { test } from "node:test";
import assert from "node:assert/strict";
import { citedStatus, statusPill } from "./citationStatus.ts";

test("the three named statuses get their pill", () => {
  assert.deepEqual([statusPill("active")?.label, statusPill("amended")?.label, statusPill("repealed")?.label], ["سارية", "معدّلة", "ملغاة"]);
  assert.deepEqual([statusPill("active")?.emoji, statusPill("amended")?.emoji, statusPill("repealed")?.emoji], ["🟢", "🟡", "🔴"]);
  assert.equal(statusPill(" repealed ")?.tone, "danger");
});

test("no pill for anything the library did not state as one of the three (owner ٢٥٩)", () => {
  for (const raw of ["suspended", "added", "merged", "status_undeclared", "", null, undefined, 3, "Active"]) {
    assert.equal(statusPill(raw), null, String(raw));
    assert.equal(citedStatus(raw), undefined, String(raw));
  }
});
