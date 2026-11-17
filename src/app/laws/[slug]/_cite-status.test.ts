import test from "node:test";
import assert from "node:assert/strict";
import { articleNumberOf, articlesByNumber, statusPill } from "./_cite-status.ts";

test("only an explicit status earns a colour; undeclared is never «سارية»", () => {
  assert.equal(statusPill("active").emoji, "🟢");
  assert.equal(statusPill("amended").labelAr, "معدّلة");
  assert.equal(statusPill("repealed").emoji, "🔴");
  for (const s of ["status_undeclared", "", null, undefined, "suspended", "added"]) {
    assert.equal(statusPill(s).tone, "unknown", String(s));
  }
});

test("article numbers: digits, written ordinals, never a page", () => {
  assert.equal(articleNumberOf({ id: "a", number: "77" }), 77);
  assert.equal(articleNumberOf({ id: "a", number: 5 }), 5);
  assert.equal(articleNumberOf({ id: "a", number: null, numberText: "التاسعة بعد المائة" }), 109);
  assert.equal(articleNumberOf({ id: "a", number: "3", numberText: "الصفحة 3" }), null);
  assert.equal(articleNumberOf({ id: "a", number: "", numberText: "" }), null);
});

test("the index keeps law articles only, first one wins", () => {
  const map = articlesByNumber([
    { id: "reg5", number: "5", instrument: "لائحة" },
    { id: "law5", number: "5" },
    { id: "law5b", number: "5" },
    { id: "annex1", number: "1", instrument: "ملحق" },
  ]);
  assert.equal(map.get(5)?.id, "law5");
  assert.equal(map.has(1), false);
});
