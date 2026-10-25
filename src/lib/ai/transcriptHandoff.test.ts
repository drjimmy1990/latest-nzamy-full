import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFTER_TRANSCRIPT_URL,
  TRANSCRIPT_HANDOFF_KEY,
  TRANSCRIPT_HANDOFF_MAX_CHARS,
  TRANSCRIPT_HANDOFF_TTL_MS,
  TRANSCRIPT_SOURCE_LABEL_MAX_CHARS,
  buildTranscriptHandoff,
  canSendToDrafter,
  consumeTranscriptHandoff,
  discardTranscriptHandoff,
  parseTranscriptHandoff,
  sessionStorageOrNull,
  writeTranscriptHandoff,
  type HandoffStorage,
} from "./transcriptHandoff.ts";

function memoryStorage(): HandoffStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: HandoffStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
  removeItem() { throw new Error("SecurityError"); },
};

const T0 = 1_760_000_000_000;
const TEXT = "المدعي: استلمت الدفعة الأولى في شهر رجب، ولم تُسلَّم الثانية.";

test("a transcript written by the tool is read back once by the drafter, then gone", () => {
  const s = memoryStorage();
  assert.deepEqual(writeTranscriptHandoff(s, `  ${TEXT}\n`, "المفرّغ الذكي", T0), { ok: true, truncated: false });
  const got = consumeTranscriptHandoff(s, T0 + 60_000);
  assert.deepEqual(got, { text: TEXT, sourceLabel: "المفرّغ الذكي", createdAt: T0, truncated: false });
  assert.equal(s.data.has(TRANSCRIPT_HANDOFF_KEY), false, "the handoff must be cleared on consume");
  assert.equal(consumeTranscriptHandoff(s, T0 + 60_000), null, "a second consume finds nothing");
});

test("the button's target is the drafter with ?from=transcript", () => {
  assert.equal(DRAFTER_TRANSCRIPT_URL, "/ai/draft?from=transcript");
});

test("empty or whitespace-only text is not sent", () => {
  const s = memoryStorage();
  for (const t of ["", "   \n\t", null, undefined]) {
    assert.equal(canSendToDrafter(t), false);
    assert.deepEqual(writeTranscriptHandoff(s, t, "x", T0), { ok: false, reason: "empty" });
  }
  assert.equal(s.data.size, 0);
  assert.equal(canSendToDrafter("نص"), true);
});

test("a transcript over the cap is cut and the cut is reported to the caller and the drafter", () => {
  const s = memoryStorage();
  const long = "أ".repeat(TRANSCRIPT_HANDOFF_MAX_CHARS + 500);
  assert.deepEqual(writeTranscriptHandoff(s, long, "src", T0), { ok: true, truncated: true });
  const got = consumeTranscriptHandoff(s, T0);
  assert.ok(got);
  assert.equal(got.text.length, TRANSCRIPT_HANDOFF_MAX_CHARS);
  assert.equal(got.truncated, true);

  const exact = buildTranscriptHandoff("ب".repeat(TRANSCRIPT_HANDOFF_MAX_CHARS), "src", T0);
  assert.equal(exact?.truncated, false);
});

test("the source label is capped and never required", () => {
  const h = buildTranscriptHandoff(TEXT, "x".repeat(500), T0);
  assert.equal(h?.sourceLabel.length, TRANSCRIPT_SOURCE_LABEL_MAX_CHARS);
  assert.equal(buildTranscriptHandoff(TEXT, null, T0)?.sourceLabel, "");
});

test("an expired or future-dated handoff is ignored and still cleared", () => {
  for (const at of [T0 - TRANSCRIPT_HANDOFF_TTL_MS - 1, T0 + 1]) {
    const s = memoryStorage();
    writeTranscriptHandoff(s, TEXT, "src", at);
    assert.equal(consumeTranscriptHandoff(s, T0), null);
    assert.equal(s.data.has(TRANSCRIPT_HANDOFF_KEY), false);
  }
  const s = memoryStorage();
  writeTranscriptHandoff(s, TEXT, "src", T0 - TRANSCRIPT_HANDOFF_TTL_MS);
  assert.ok(consumeTranscriptHandoff(s, T0), "exactly at the TTL is still valid");
});

test("malformed stored values yield nothing and are cleared", () => {
  const bad = [
    "{not json",
    "null",
    "42",
    '"text"',
    JSON.stringify({ text: 5, createdAt: T0 }),
    JSON.stringify({ text: "   ", createdAt: T0 }),
    JSON.stringify({ text: TEXT }),
    JSON.stringify({ text: TEXT, createdAt: "yesterday" }),
  ];
  for (const raw of bad) {
    const s = memoryStorage();
    s.data.set(TRANSCRIPT_HANDOFF_KEY, raw);
    assert.equal(consumeTranscriptHandoff(s, T0), null, raw);
    assert.equal(s.data.has(TRANSCRIPT_HANDOFF_KEY), false, raw);
  }
  // A hand-edited value can't smuggle in an oversized text or a non-string label.
  const parsed = parseTranscriptHandoff(
    JSON.stringify({ text: "ج".repeat(TRANSCRIPT_HANDOFF_MAX_CHARS + 1), sourceLabel: { evil: 1 }, createdAt: T0, truncated: "yes" }),
    T0,
  );
  assert.equal(parsed?.text.length, TRANSCRIPT_HANDOFF_MAX_CHARS);
  assert.equal(parsed?.sourceLabel, "");
  assert.equal(parsed?.truncated, false);
});

test("storage that throws or is missing never throws to the caller", () => {
  assert.deepEqual(writeTranscriptHandoff(throwing, TEXT, "src", T0), { ok: false, reason: "storage" });
  assert.deepEqual(writeTranscriptHandoff(null, TEXT, "src", T0), { ok: false, reason: "storage" });
  assert.equal(consumeTranscriptHandoff(throwing, T0), null);
  assert.equal(consumeTranscriptHandoff(null, T0), null);
  assert.equal(consumeTranscriptHandoff(undefined, T0), null);
});

test("discard removes a handoff unread and tolerates throwing or missing storage", () => {
  const s = memoryStorage();
  writeTranscriptHandoff(s, TEXT, "src", T0);
  discardTranscriptHandoff(s);
  assert.equal(s.data.size, 0);
  assert.doesNotThrow(() => discardTranscriptHandoff(throwing));
  assert.doesNotThrow(() => discardTranscriptHandoff(null));
});

test("a new handoff replaces an older one rather than piling up", () => {
  const s = memoryStorage();
  writeTranscriptHandoff(s, "الأول", "a", T0);
  writeTranscriptHandoff(s, "الثاني", "b", T0 + 1);
  assert.equal(s.data.size, 1);
  assert.equal(consumeTranscriptHandoff(s, T0 + 2)?.text, "الثاني");
});

test("sessionStorageOrNull never throws, with or without a sessionStorage global", () => {
  const got = sessionStorageOrNull();
  assert.ok(got === null || typeof got.getItem === "function");
});
