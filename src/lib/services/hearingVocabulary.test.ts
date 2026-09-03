import assert from "node:assert/strict";
import { test } from "node:test";
import {
  typeToKind, kindToType, urgencyToDb, urgencyFromDb,
  VALID_UI_TYPES, VALID_UI_URGENCIES,
} from "./hearingVocabulary.ts";

test("type -> kind: only 'hearing' renames, to 'judicial'", () => {
  assert.equal(typeToKind("hearing"), "judicial");
});

test("type -> kind: every other UI type passes through unchanged", () => {
  for (const t of VALID_UI_TYPES) {
    if (t === "hearing") continue;
    assert.equal(typeToKind(t), t);
  }
});

test("kind -> type: 'judicial' becomes 'hearing', round-tripping typeToKind", () => {
  assert.equal(kindToType("judicial"), "hearing");
});

test("kind -> type: every non-hearing UI type round-trips through typeToKind/kindToType", () => {
  for (const t of VALID_UI_TYPES) {
    assert.equal(kindToType(typeToKind(t)), t);
  }
});

test("kind -> type: an unrecognised kind (e.g. the DB's generic 'appointment') falls back to 'internal', never to 'hearing'", () => {
  assert.equal(kindToType("appointment"), "internal");
  assert.equal(kindToType("something-nobody-wrote-yet"), "internal");
});

test("urgency: 'critical' (UI) <-> 'urgent' (DB) — the one renamed pair", () => {
  assert.equal(urgencyToDb("critical"), "urgent");
  assert.equal(urgencyFromDb("urgent"), "critical");
});

test("urgency: 'high' and 'normal' pass through both directions unchanged", () => {
  for (const u of ["high", "normal"] as const) {
    assert.equal(urgencyToDb(u), u);
    assert.equal(urgencyFromDb(u), u);
  }
});

test("urgency: the DB's 'low' — which nothing here writes — reads back as 'normal', not as an unhandled value", () => {
  assert.equal(urgencyFromDb("low"), "normal");
});

test("urgency: an unrecognised DB value reads back as 'normal' rather than throwing", () => {
  assert.equal(urgencyFromDb("whatever"), "normal");
});

test("VALID_UI_TYPES and VALID_UI_URGENCIES are the exact sets AddHearingModal's TYPE_OPTIONS and urgency buttons offer", () => {
  assert.deepEqual([...VALID_UI_TYPES].sort(), ["client_meet", "deadline", "gov_review", "hearing", "internal"].sort());
  assert.deepEqual([...VALID_UI_URGENCIES].sort(), ["critical", "high", "normal"].sort());
});
