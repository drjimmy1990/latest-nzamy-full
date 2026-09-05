import test from "node:test";
import assert from "node:assert/strict";

import { generateShareToken, generatePasscode, sha256Hex } from "./shareSecrets.ts";

test("generateShareToken returns 64 lowercase hex chars and is not repeated", () => {
  const a = generateShareToken();
  const b = generateShareToken();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.match(b, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("generatePasscode returns exactly 6 digits, including a leading zero", () => {
  for (let i = 0; i < 200; i++) {
    const code = generatePasscode();
    assert.match(code, /^\d{6}$/, `"${code}" is not 6 digits`);
  }
});

test("sha256Hex matches known test vectors", () => {
  // echo -n "" | sha256sum
  assert.equal(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  // echo -n "hello" | sha256sum
  assert.equal(
    sha256Hex("hello"),
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

test("sha256Hex is deterministic and Arabic-safe (utf8 input)", () => {
  const s = "باسكود سري ١٢٣٤٥٦";
  assert.equal(sha256Hex(s), sha256Hex(s));
  assert.match(sha256Hex(s), /^[0-9a-f]{64}$/);
});
