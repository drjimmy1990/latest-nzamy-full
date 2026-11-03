import test from "node:test";
import assert from "node:assert/strict";
import { mergeSavedRow, mergeDeletedRow } from "./heldListMerge.ts";
import { listOk, listFailed } from "./listRead.ts";

type Row = { id: string; title: string };

test("CODE-F42: a save after a FAILED read asks for a re-read instead of keeping the failure", () => {
  const failed = listFailed<Row>();
  const r = mergeSavedRow(failed, { id: "s1", title: "استشارة" });
  assert.equal(r.refetch, true);
  assert.equal(r.next, failed);
  assert.equal(mergeSavedRow<Row>(null, { id: "s1", title: "x" }).refetch, true);
});

test("a save into a good read is merged locally: edit replaces, create appends and counts", () => {
  const held = listOk<Row>([{ id: "a", title: "قديم" }], 1);
  const edited = mergeSavedRow(held, { id: "a", title: "جديد" });
  assert.equal(edited.refetch, false);
  assert.ok(edited.next && edited.next.ok);
  if (edited.next && edited.next.ok) {
    assert.deepEqual(edited.next.items, [{ id: "a", title: "جديد" }]);
    assert.equal(edited.next.total, 1);
  }
  const created = mergeSavedRow(held, { id: "b", title: "ب" });
  if (created.next && created.next.ok) {
    assert.equal(created.next.items.length, 2);
    assert.equal(created.next.total, 2);
  } else assert.fail("expected a good read");
});

test("a delete after a failed read also asks for a re-read; into a good read it removes and counts down", () => {
  assert.equal(mergeDeletedRow(listFailed<Row>(), "a").refetch, true);
  const r = mergeDeletedRow(listOk<Row>([{ id: "a", title: "x" }, { id: "b", title: "y" }], 2), "a");
  assert.equal(r.refetch, false);
  if (r.next && r.next.ok) {
    assert.deepEqual(r.next.items.map((s) => s.id), ["b"]);
    assert.equal(r.next.total, 1);
  } else assert.fail("expected a good read");
});
