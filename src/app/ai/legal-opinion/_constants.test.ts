import { test } from "node:test";
import assert from "node:assert/strict";
import { LETTER_TYPES, LETTER_FAMILIES, letterFamilyOf } from "./_constants.ts";

test("every letter type the picker offers has exactly one family", () => {
  // Owner item ١٧. A type in no family would vanish from the grouped picker
  // entirely — the grid used to render the flat list, so an omission was
  // impossible before and is the whole risk of grouping.
  for (const lt of LETTER_TYPES) {
    const owners = LETTER_FAMILIES.filter((f) => f.members.includes(lt.id));
    assert.equal(owners.length, 1, `${lt.id} belongs to ${owners.length} families`);
  }
});

test("no family claims a letter type that does not exist", () => {
  const ids = new Set(LETTER_TYPES.map((lt) => lt.id));
  for (const family of LETTER_FAMILIES) {
    for (const member of family.members) {
      assert.ok(ids.has(member), `family ${family.id} lists ${member}, which is not a letter type`);
    }
  }
});

test("the families cover the whole list — none is dropped", () => {
  const grouped = LETTER_FAMILIES.flatMap((f) => f.members);
  assert.equal(new Set(grouped).size, grouped.length, "a type is listed twice");
  assert.equal(grouped.length, LETTER_TYPES.length);
});

test("REGRESSION: grouping did not rename a single id", () => {
  // `letterType` is written into metadata.intake on every order ever placed and
  // is what intakeValues.ts labels. Renaming one to tidy a family would
  // silently re-label historic orders. These are the owner's own ten.
  assert.deepEqual(
    LETTER_TYPES.map((lt) => lt.id),
    ["warning", "termination", "demand", "eviction", "settlement",
     "notice", "objection", "request", "proxy", "release"],
  );
});

test("every family label is Arabic", () => {
  for (const f of LETTER_FAMILIES) {
    assert.ok(f.label.length > 0);
    assert.ok(!/[A-Za-z]/.test(f.label), `leaked English: ${f.label}`);
  }
});

test("the picker's «أخرى» tile belongs to no family, and says so", () => {
  assert.equal(letterFamilyOf("other"), null);
  assert.equal(letterFamilyOf("warning"), "claim");
  assert.equal(letterFamilyOf("nothing-like-this"), null);
});
