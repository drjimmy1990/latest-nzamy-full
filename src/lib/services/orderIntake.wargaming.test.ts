import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateWargamingIntake, WARGAMING_CRITIQUE_TARGET, WARGAMING_AREA_OTHER, MAX_AREA_OTHER_LENGTH,
} from "./orderIntake.wargaming.ts";
import { valueLabelAr, labelFor } from "./intakeValues.ts";
import { LEGAL_TAXONOMY } from "../../constants/taxonomies.ts";

const valid = {
  schemaVersion: 1,
  service: "wargaming",
  role: "plaintiff",
  area: "عمالي",
  caseSummary: "و".repeat(25),
  targets: ["opponent", "court"],
  attachments: [],
};

test("accepts a well-formed intake", () => {
  const r = validateWargamingIntake(valid);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.role, "plaintiff");
    assert.deepEqual(r.value.targets, ["opponent", "court"]);
  }
});

test("rejects a non-object", () => {
  const r = validateWargamingIntake(null);
  assert.equal(r.ok, false);
});

test("rejects an intake with wrong service discriminant", () => {
  const r = validateWargamingIntake({ ...valid, service: "contracts" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects an intake with missing service key", () => {
  const r = validateWargamingIntake({ ...valid, service: undefined });
  assert.equal(r.ok, false);
});

test("rejects a missing required field (area)", () => {
  const r = validateWargamingIntake({ ...valid, area: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("تخصص")));
});

test("rejects an unknown role", () => {
  const r = validateWargamingIntake({ ...valid, role: "judge" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("صفة")));
});

test("rejects a caseSummary shorter than 20 characters", () => {
  const r = validateWargamingIntake({ ...valid, caseSummary: "قصير" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("ملخص")));
});

test("rejects empty targets (at least one required)", () => {
  const r = validateWargamingIntake({ ...valid, targets: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("هدف")));
});

test("requires memoText or a tagged memo attachment when targets include the critique target", () => {
  const r = validateWargamingIntake({ ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المذكرة")));
});

test("accepts the critique target when memoText is provided", () => {
  const r = validateWargamingIntake({ ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: "نص المذكرة الأصلية" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.memoText, "نص المذكرة الأصلية");
});

test("critique target is satisfied by a memo attachment (memoAttachmentIds) instead of memoText", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    attachments: [{ documentId: 12, name: "memo.pdf", size: 900 }],
    memoAttachmentIds: [12],
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value.memoAttachmentIds, ["12"]);
});

test("accepts a numeric memoAttachmentIds entry (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    attachments: [{ documentId: 12, name: "memo.pdf", size: 900 }],
    memoAttachmentIds: [12],
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(typeof r.value.memoAttachmentIds?.[0], "string");
});

test("an unrelated attachment does NOT satisfy the critique requirement — only a tagged memo attachment does", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    // a case file was uploaded (e.g. in step 1), but never tagged as the
    // memo — memoAttachmentIds is omitted/empty, so it must not count.
    attachments: [{ documentId: 99, name: "case-file.pdf", size: 500 }],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المذكرة")));
});

test("critique target with neither memoText nor a memo attachment is rejected", () => {
  const r = validateWargamingIntake({
    ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: "", attachments: [],
  });
  assert.equal(r.ok, false);
});

test("removing the memo attachment (dropped from memoAttachmentIds) is rejected even though the file is still in `attachments`", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    attachments: [{ documentId: 12, name: "memo.pdf", size: 900 }],
    memoAttachmentIds: [], // client removed the memo file — the id must be dropped here too, not just left dangling
  });
  assert.equal(r.ok, false);
});

test("rejects an attachment missing documentId (malformed attachment)", () => {
  const r = validateWargamingIntake({ ...valid, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المرفق")));
});

test("accepts a numeric documentId (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateWargamingIntake({ ...valid, attachments: [{ documentId: 123, name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.attachments.length, 1);
    assert.equal(r.value.attachments[0].documentId, "123");
    assert.equal(typeof r.value.attachments[0].documentId, "string");
  }
});

test("collects every error, not just the first", () => {
  const r = validateWargamingIntake({ ...valid, role: "judge", area: "", caseSummary: "x", targets: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 4);
});

// ─── Specialty: the 31 sections + «أخرى» (owner test 28-9, T28-32) ──────────

test("accepts every one of the 31 LEGAL_TAXONOMY section ids as the area", () => {
  assert.equal(LEGAL_TAXONOMY.length, 31);
  for (const c of LEGAL_TAXONOMY) {
    const r = validateWargamingIntake({ ...valid, area: c.id });
    assert.equal(r.ok, true, c.id);
    if (r.ok) {
      assert.equal(r.value.area, c.id);
      assert.equal(r.value.areaOther, undefined);
    }
  }
});

test("«أخرى» requires the typed specialty", () => {
  const r = validateWargamingIntake({ ...valid, area: WARGAMING_AREA_OTHER });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("أخرى")));
});

test("«أخرى» with a whitespace-only specialty is rejected", () => {
  const r = validateWargamingIntake({ ...valid, area: WARGAMING_AREA_OTHER, areaOther: "   " });
  assert.equal(r.ok, false);
});

test("«أخرى» keeps the typed specialty, trimmed, in the validated value", () => {
  const r = validateWargamingIntake({ ...valid, area: WARGAMING_AREA_OTHER, areaOther: "  منازعات الأوقاف  " });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.area, WARGAMING_AREA_OTHER);
    assert.equal(r.value.areaOther, "منازعات الأوقاف");
  }
});

test("«أخرى» rejects an over-long specialty", () => {
  const r = validateWargamingIntake({ ...valid, area: WARGAMING_AREA_OTHER, areaOther: "ت".repeat(MAX_AREA_OTHER_LENGTH + 1) });
  assert.equal(r.ok, false);
});

test("a stale areaOther is dropped when a listed section is chosen", () => {
  const r = validateWargamingIntake({ ...valid, area: "SA-06", areaOther: "نص قديم" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal("areaOther" in r.value, false);
});

test("the server re-validates the wizard's own output: «أخرى» round-trips", () => {
  const first = validateWargamingIntake({ ...valid, area: WARGAMING_AREA_OTHER, areaOther: "منازعات الأوقاف" });
  assert.equal(first.ok, true);
  if (first.ok) {
    const second = validateWargamingIntake(first.value);
    assert.equal(second.ok, true);
    if (second.ok) assert.deepEqual(second.value, first.value);
  }
});

test("orders placed before the switch (old eight ids) still validate and still read in Arabic", () => {
  for (const [id, ar] of [
    ["labor", "نظام العمل"], ["commercial", "تجاري وشركات"], ["civil", "مدني"], ["criminal", "جنائي"],
    ["family", "أحوال شخصية"], ["real-estate", "عقاري"], ["arbitration", "تحكيم / وساطة"], ["admin", "إداري"],
  ] as const) {
    assert.equal(validateWargamingIntake({ ...valid, area: id }).ok, true, id);
    assert.equal(valueLabelAr("area", id), ar);
  }
});

test("the team's brief reads every new area id in Arabic, from the same list the picker renders", () => {
  for (const c of LEGAL_TAXONOMY) assert.equal(valueLabelAr("area", c.id), c.label);
  assert.equal(valueLabelAr("area", WARGAMING_AREA_OTHER), "أخرى");
  assert.equal(labelFor("areaOther"), "التخصص كما كتبه العميل");
});
