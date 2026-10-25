import test from "node:test";
import assert from "node:assert/strict";
import {
  type TrackingStateInput,
  LIFETIME_LABEL_AR,
  STATE_LABEL_AR,
  TRACKING_LIFETIMES,
  effectiveTrackingState,
  isTrackingLifetime,
  normalizeUnlockDigits,
} from "./trackingLinkState.ts";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const base: TrackingStateInput = { revokedAt: null, pausedAt: null, pausedReason: null, expiresAt: null, stageEnded: false };

test("lifetimes: exactly the owner's four (٢٧٦), each with an Arabic label", () => {
  assert.deepEqual([...TRACKING_LIFETIMES], ["7d", "30d", "90d", "stage"]);
  for (const l of TRACKING_LIFETIMES) assert.ok(LIFETIME_LABEL_AR[l]);
  for (const bad of ["", "1d", "365d", "forever", null, 7, "STAGE"]) assert.equal(isTrackingLifetime(bad), false, String(bad));
  assert.equal(isTrackingLifetime("stage"), true);
});

test("state order: revoked > paused > expired > active (same vectors as the Docker test's T9)", () => {
  const cases: Array<[Partial<TrackingStateInput>, string]> = [
    [{}, "active"],
    [{ expiresAt: "2026-10-27T00:00:00Z" }, "active"],
    [{ expiresAt: "2026-10-26T12:00:00Z" }, "expired"], // the instant itself has passed
    [{ expiresAt: "2026-10-01T00:00:00Z" }, "expired"],
    [{ stageEnded: true }, "expired"],
    [{ pausedAt: "2026-10-20T00:00:00Z", pausedReason: "manual" }, "paused"],
    [{ pausedAt: "2026-10-20T00:00:00Z", pausedReason: "expired" }, "expired"],
    [{ pausedAt: "2026-10-20T00:00:00Z", pausedReason: "manual", expiresAt: "2026-10-01T00:00:00Z" }, "paused"],
    [{ revokedAt: "2026-10-21T00:00:00Z", pausedAt: "2026-10-20T00:00:00Z", pausedReason: "manual" }, "revoked"],
    [{ revokedAt: "2026-10-21T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z" }, "revoked"],
  ];
  for (const [over, want] of cases) {
    assert.equal(effectiveTrackingState({ ...base, ...over }, NOW), want, JSON.stringify(over));
  }
});

test("state labels are the owner's words", () => {
  assert.deepEqual(STATE_LABEL_AR, { active: "نشط", paused: "موقوف مؤقتاً", expired: "منتهي — موقوف", revoked: "ملغى" });
});

test("digits: ASCII, Arabic-Indic and Persian digits, spaces and dashes allowed; exactly four digits", () => {
  assert.equal(normalizeUnlockDigits("4567"), "4567");
  assert.equal(normalizeUnlockDigits("٤٥٦٧"), "4567");
  assert.equal(normalizeUnlockDigits("۴۵۶۷"), "4567");
  assert.equal(normalizeUnlockDigits(" 45-67 "), "4567");
  for (const bad of ["", "456", "45678", "abcd", "45a7", null, 4567, "٤٥٦"]) {
    assert.equal(normalizeUnlockDigits(bad), null, String(bad));
  }
});

test("a missing v2 function (PGRST202 / 42883 naming it) is 'v1 database'; anything else is an error", async () => {
  const { isMissingRpcError } = await import("./trackingLinkState.ts");
  assert.equal(isMissingRpcError({ code: "PGRST202", message: "Could not find the function public.case_tracking_gate(p_token_hash) in the schema cache" }, "case_tracking_gate"), true);
  assert.equal(isMissingRpcError({ code: "42883", message: "function public.case_tracking_gate(text) does not exist" }, "case_tracking_gate"), true);
  assert.equal(isMissingRpcError({ code: "PGRST202", message: "Could not find the function public.other(x)" }, "case_tracking_gate"), false);
  assert.equal(isMissingRpcError({ code: "42501", message: "permission denied for function case_tracking_gate" }, "case_tracking_gate"), false);
  assert.equal(isMissingRpcError(null, "case_tracking_gate"), false);
});
