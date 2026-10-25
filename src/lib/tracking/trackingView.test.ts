import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateShareToken, sha256Hex } from "../services/shareSecrets.ts";
import { MAX_TRACKING_HEARINGS, isTrackingToken, toTrackingView, trackingPath } from "./trackingView.ts";

test("tokens: 64 lowercase hex, never guessable twice; anything else is refused before any read", () => {
  const a = generateShareToken();
  const b = generateShareToken();
  assert.ok(isTrackingToken(a) && isTrackingToken(b));
  assert.notEqual(a, b);
  for (const bad of ["", "abc", "A".repeat(64), "g".repeat(64), `${"a".repeat(64)} `, "a".repeat(63), "a".repeat(65), "../etc/passwd", null, 42]) {
    assert.equal(isTrackingToken(bad), false, String(bad));
  }
  assert.equal(trackingPath(a), `/track/${a}`);
});

test("hashing: what the table stores is the sha256 hex of the token — the same bytes SQL's encode(sha256(convert_to(t,'UTF8')),'hex') hashes", () => {
  const token = "a".repeat(64);
  const h = sha256Hex(token);
  assert.match(h, /^[0-9a-f]{64}$/, "the shape the table's CHECK requires");
  assert.notEqual(h, token, "the plaintext is never what is stored");
  assert.equal(h, createHash("sha256").update(Buffer.from(token, "utf8")).digest("hex"));
  // Known vector (FIPS 180-2 "abc"), so a change of algorithm or encoding fails loudly.
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex(token), sha256Hex(token), "deterministic: the page finds the row by hash");
});

const stuffed = {
  title: "  دعوى مطالبة مالية  ",
  case_number: "4467890",
  court: "محكمة الاستئناف بالرياض",
  stage: "appeal",
  hearings: [
    { date: "2026-11-04", time: "09:30", court: "الدائرة الثالثة", title: "استراتيجية سرية", notes: "x", minutes: "محضر", judge_name: "القاضي", id: "uuid", owner_user_id: "uuid" },
    { date: "2026-11-14", time: null, court: "", phone: "+966500000000" },
    { date: "bad-date", time: "09:00", court: "x" },
    { date: "2026-12-01", time: "25:99", court: { nested: "اختراق" } },
    "not a hearing",
  ],
  notes: "ملاحظة داخلية",
  memo: "مذكرة",
  documents: [{ name: "عقد.pdf" }],
  client_phone: "+966500000000",
  national_id: "1010101010",
  fees: 50000,
  metadata: { fees: "50000", phone: "+966", national_id: "1" },
  id: "case-f",
  firm_id: "ffff",
  owner_user_id: "0000",
};

test("the serializer rebuilds ONLY the whitelisted fields, at every level", () => {
  const view = toTrackingView(stuffed);
  assert.ok(view);
  assert.deepEqual(Object.keys(view).sort(), ["caseNumber", "court", "hearings", "stageLabel", "title"]);
  for (const h of view.hearings) assert.deepEqual(Object.keys(h).sort(), ["court", "date", "time"]);
  assert.deepEqual(view, {
    title: "دعوى مطالبة مالية",
    caseNumber: "4467890",
    court: "محكمة الاستئناف بالرياض",
    stageLabel: "الاستئناف",
    hearings: [
      { date: "2026-11-04", time: "09:30", court: "الدائرة الثالثة" },
      { date: "2026-11-14", time: null, court: null },
      { date: "2026-12-01", time: null, court: null },
    ],
  });
  const json = JSON.stringify(view);
  for (const leak of ["سرية", "محضر", "القاضي", "+966", "1010101010", "50000", "ملاحظة", "مذكرة", "عقد.pdf", "case-f", "uuid", "ffff", "اختراق"]) {
    assert.ok(!json.includes(leak), `leaks ${leak}`);
  }
});

test("not a snapshot → null; empty or odd values → nulls, never invented", () => {
  assert.equal(toTrackingView(null), null);
  assert.equal(toTrackingView("x"), null);
  assert.equal(toTrackingView([]), null);
  assert.deepEqual(toTrackingView({}), { title: null, caseNumber: null, court: null, stageLabel: null, hearings: [] });
  assert.equal(toTrackingView({ stage: "supreme" })?.stageLabel, null, "an unknown degree is not guessed");
  assert.equal(toTrackingView({ title: "ع".repeat(500) })?.title?.length, 200);
  const many = { hearings: Array.from({ length: 50 }, (_, i) => ({ date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`, time: "09:00", court: "م" })) };
  assert.equal(toTrackingView(many)?.hearings.length, MAX_TRACKING_HEARINGS);
});

test("the Docker test's SQL vector matches the app's hash (case_tracking_links.test.sql T8)", () => {
  assert.equal(sha256Hex("a".repeat(64)), "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
});
