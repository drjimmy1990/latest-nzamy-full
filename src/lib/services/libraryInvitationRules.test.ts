/**
 * libraryInvitationRules.test.ts
 * Run: node --test src/lib/services/libraryInvitationRules.test.ts
 *      (or `npm run test:unit` for the whole suite)
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateInvitationCode,
  normalizeInvitationCode,
  isValidInvitationCodeFormat,
  validateMaxUses,
  validateExpiresAt,
  validateGrantDays,
  DEFAULT_INVITE_GRANT_DAYS,
  libraryInvitationStatus,
} from "./libraryInvitationRules.ts";
import { DEFAULT_INVITE_GRANT_DAYS as DISPLAY_DEFAULT_DAYS } from "./libraryInvitationDisplay.ts";

// ── generateInvitationCode ───────────────────────────────────────────────

test("generateInvitationCode produces a 10-character upper-case alnum code", () => {
  const code = generateInvitationCode();
  assert.equal(code.length, 10);
  assert.match(code, /^[A-Z0-9]{10}$/);
});

test("generateInvitationCode excludes the ambiguous characters 0/O/1/I", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateInvitationCode();
    assert.doesNotMatch(code, /[01OI]/, `code "${code}" contains an excluded character`);
  }
});

test("generateInvitationCode is not the same code every call", () => {
  const codes = new Set(Array.from({ length: 50 }, () => generateInvitationCode()));
  // 50 draws from a ~33^10 space colliding is effectively impossible unless
  // the generator is broken (e.g. always returning the same seed index).
  assert.ok(codes.size > 45, `expected mostly-unique codes, got ${codes.size}/50 unique`);
});

test("every generated code satisfies the format the admin-supplied path accepts", () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(isValidInvitationCodeFormat(generateInvitationCode()));
  }
});

// ── normalizeInvitationCode ─────────────────────────────────────────────────

test("normalizeInvitationCode trims and upper-cases", () => {
  assert.equal(normalizeInvitationCode("  nzamy2026  "), "NZAMY2026");
});

test("normalizeInvitationCode leaves an already-normalized code unchanged", () => {
  assert.equal(normalizeInvitationCode("ABCD1234"), "ABCD1234");
});

// ── isValidInvitationCodeFormat ──────────────────────────────────────────

test("accepts a plain upper-case alnum code within 4-32 chars", () => {
  assert.ok(isValidInvitationCodeFormat("NZAMY2026"));
  assert.ok(isValidInvitationCodeFormat("ABCD"));
  assert.ok(isValidInvitationCodeFormat("A".repeat(32)));
});

test("rejects codes shorter than 4 or longer than 32 characters", () => {
  assert.equal(isValidInvitationCodeFormat("ABC"), false);
  assert.equal(isValidInvitationCodeFormat("A".repeat(33)), false);
});

test("rejects lowercase, spaces and punctuation", () => {
  assert.equal(isValidInvitationCodeFormat("nzamy2026"), false);
  assert.equal(isValidInvitationCodeFormat("NZ AMY"), false);
  assert.equal(isValidInvitationCodeFormat("NZM-INV-A3F8"), false);
  assert.equal(isValidInvitationCodeFormat(""), false);
});

// ── validateMaxUses ──────────────────────────────────────────────────────

test("accepts integers at and inside the 1..1000 boundary", () => {
  assert.deepEqual(validateMaxUses(1), { ok: true, value: 1 });
  assert.deepEqual(validateMaxUses(1000), { ok: true, value: 1000 });
  assert.deepEqual(validateMaxUses(50), { ok: true, value: 50 });
});

test("rejects 0, negatives and anything past 1000", () => {
  assert.equal(validateMaxUses(0).ok, false);
  assert.equal(validateMaxUses(-5).ok, false);
  assert.equal(validateMaxUses(1001).ok, false);
});

test("rejects non-integers and non-numbers, including a numeric string", () => {
  assert.equal(validateMaxUses(3.5).ok, false);
  assert.equal(validateMaxUses("5").ok, false);
  assert.equal(validateMaxUses(null).ok, false);
  assert.equal(validateMaxUses(undefined).ok, false);
  assert.equal(validateMaxUses(NaN).ok, false);
});

// ── validateExpiresAt ────────────────────────────────────────────────────

test("absent/null/empty expiresAt means no expiry", () => {
  assert.deepEqual(validateExpiresAt(undefined), { ok: true, value: null });
  assert.deepEqual(validateExpiresAt(null), { ok: true, value: null });
  assert.deepEqual(validateExpiresAt(""), { ok: true, value: null });
});

test("a valid ISO date string normalizes to a full ISO timestamp", () => {
  const result = validateExpiresAt("2027-01-01");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, new Date("2027-01-01").toISOString());
});

test("rejects an unparseable date string", () => {
  assert.equal(validateExpiresAt("not-a-date").ok, false);
});

test("rejects a non-string value", () => {
  assert.equal(validateExpiresAt(12345 as unknown as string).ok, false);
  assert.equal(validateExpiresAt({} as unknown as string).ok, false);
});

// ── libraryInvitationStatus ──────────────────────────────────────────────

test("active: uses remain and no expiry has passed", () => {
  assert.equal(
    libraryInvitationStatus({ currentUses: 2, maxUses: 5, expiresAt: null }),
    "active",
  );
});

test("exhausted: current uses reached max, no expiry", () => {
  assert.equal(
    libraryInvitationStatus({ currentUses: 5, maxUses: 5, expiresAt: null }),
    "exhausted",
  );
});

test("expired: expiry date is in the past, regardless of remaining uses", () => {
  assert.equal(
    libraryInvitationStatus({ currentUses: 0, maxUses: 5, expiresAt: "2020-01-01T00:00:00Z" }),
    "expired",
  );
});

test("expired wins when a code is both expired and exhausted", () => {
  assert.equal(
    libraryInvitationStatus({ currentUses: 5, maxUses: 5, expiresAt: "2020-01-01T00:00:00Z" }),
    "expired",
  );
});

test("a future expiry does not mark an otherwise-active code expired", () => {
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  assert.equal(
    libraryInvitationStatus({ currentUses: 1, maxUses: 3, expiresAt: future }),
    "active",
  );
});

// ── validateGrantDays (owner q378, 20261103_11) ─────────────────────────────

test("validateGrantDays: absent or null = no own length (the default 30 days)", () => {
  assert.deepEqual(validateGrantDays(undefined), { ok: true, value: null });
  assert.deepEqual(validateGrantDays(null), { ok: true, value: null });
  assert.equal(DEFAULT_INVITE_GRANT_DAYS, 30);
});

test("the default 30 days is ONE constant: the admin page's (display module) is the server's", () => {
  assert.equal(DISPLAY_DEFAULT_DAYS, DEFAULT_INVITE_GRANT_DAYS);
});

test("validateMaxUses: the refusal names the field the admin sees («عدد المقاعد»)", () => {
  const a = validateMaxUses(0);
  const b = validateMaxUses(2.5);
  assert.ok(!a.ok && /^عدد المقاعد/.test(a.error));
  assert.ok(!b.ok && /^عدد المقاعد/.test(b.error));
});

test("validateGrantDays: an integer from 1 to 3660 days (grantLibraryAccess's bound)", () => {
  const ninety = validateGrantDays(90);
  assert.ok(ninety.ok);
  if (ninety.ok) assert.equal(ninety.value, 90);
  assert.equal(validateGrantDays(1).ok, true);
  assert.equal(validateGrantDays(3660).ok, true);
  for (const bad of [0, 3661, 1.5, -5, "90", Number.NaN, Infinity, true, {}]) {
    const r = validateGrantDays(bad);
    assert.equal(r.ok, false, String(bad));
    if (!r.ok) assert.equal(r.error, "مدة المنحة يجب أن تكون عدداً صحيحاً بين ١ و٣٦٦٠ يوماً");
  }
});
