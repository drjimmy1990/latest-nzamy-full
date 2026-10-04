/** nameForId: the same file name in NFD and NFC gives the same identity (2026-10-04). */
import assert from "node:assert/strict";
import test from "node:test";
import { nameForId, slugifyArabic } from "./slug.ts";

const NFC = "مسائل الإمام أحمد رواية ابن هانئ";
const NFD = NFC.normalize("NFD");

test("the fixture really differs between the two forms", () => {
  assert.notEqual(NFC, NFD);
  // the bug nameForId fixes: slugifyArabic strips U+0654, so ئ (NFD) loses its hamza
  assert.notEqual(slugifyArabic(NFD), slugifyArabic(NFC));
});

test("nameForId makes both forms one identity", () => {
  assert.equal(nameForId(NFD), NFC);
  assert.equal(slugifyArabic(nameForId(NFD)), slugifyArabic(NFC));
});

test("an NFC name and ASCII names are unchanged (production ids keep)", () => {
  assert.equal(nameForId(NFC), NFC);
  assert.equal(nameForId("labor-law"), "labor-law");
});
