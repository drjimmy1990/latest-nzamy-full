import assert from "node:assert/strict";
import test from "node:test";
import { principleHref, principleIdFromHash, realPrincipleNumber } from "./principleLink.ts";

test("principleHref: collection path + principle anchor, both encoded", () => {
  assert.equal(principleHref("admin-supreme-1442-part1", "p-17"), "/precedents/admin-supreme-1442-part1#p-17");
  assert.equal(principleHref(12, 345), "/precedents/12#345");
  assert.equal(
    principleHref("مجموعة أ", "م/1"),
    `/precedents/${encodeURIComponent("مجموعة أ")}#${encodeURIComponent("م/1")}`,
  );
});

test("principleHref: no link without both ids (demo rows, search rows without a collection)", () => {
  assert.equal(principleHref("", "p1"), null);
  assert.equal(principleHref("col", ""), null);
  assert.equal(principleHref(undefined, "p1"), null);
  assert.equal(principleHref("col", null), null);
});

test("realPrincipleNumber: keeps real numbers, drops 0 / blank / placeholders", () => {
  assert.equal(realPrincipleNumber(12), "12");
  assert.equal(realPrincipleNumber(" 12 "), "12");
  assert.equal(realPrincipleNumber("١٢"), "١٢");
  assert.equal(realPrincipleNumber("12/3"), "12/3");
  for (const bad of [0, -1, NaN, "0", "٠", "", "   ", "—", "null", null, undefined, {}]) {
    assert.equal(realPrincipleNumber(bad), null, String(bad));
  }
});

test("principleIdFromHash: decodes, tolerates junk", () => {
  assert.equal(principleIdFromHash("#p-17"), "p-17");
  assert.equal(principleIdFromHash(`#${encodeURIComponent("م/1")}`), "م/1");
  assert.equal(principleIdFromHash(""), "");
  assert.equal(principleIdFromHash("#"), "");
  assert.equal(principleIdFromHash(null), "");
  assert.equal(principleIdFromHash("#%E0%A4%A"), "%E0%A4%A");
});
