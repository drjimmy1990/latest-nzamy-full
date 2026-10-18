/**
 * licenceUpload.test.ts — the checks POST /api/v1/lawyer/licence-image runs on
 * the uploaded licence image (owner answer ٢١٩, ruling P12). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/licenceUpload.test.ts
 *
 * The declared type is never trusted alone: the first bytes must say the same
 * thing, so a PDF renamed to .png (or sent with `image/png`) is refused.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateLicenceUpload,
  safeLicenceName,
  LICENCE_MAX_BYTES,
  LICENCE_MIME_TYPES,
} from "./licenceUpload.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%âã\n1 0");
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
// RIFF but not WEBP (a WAV file) — the offset-8 check matters.
const WAV = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20]);

// ── validateLicenceUpload ───────────────────────────────────────────────────

test("the limit is 5 MB and the four types are jpeg, png, webp and pdf", () => {
  assert.equal(LICENCE_MAX_BYTES, 5 * 1024 * 1024);
  assert.deepEqual([...LICENCE_MIME_TYPES].sort(), ["application/pdf", "image/jpeg", "image/png", "image/webp"]);
});

test("each allowed type passes when its bytes agree, and reports the type to store", () => {
  assert.deepEqual(validateLicenceUpload({ size: 1000, type: "image/png", head: PNG }), { ok: true, contentType: "image/png", ext: "png" });
  assert.deepEqual(validateLicenceUpload({ size: 1000, type: "image/jpeg", head: JPEG }), { ok: true, contentType: "image/jpeg", ext: "jpg" });
  assert.deepEqual(validateLicenceUpload({ size: 1000, type: "application/pdf", head: PDF }), { ok: true, contentType: "application/pdf", ext: "pdf" });
  assert.deepEqual(validateLicenceUpload({ size: 1000, type: "image/webp", head: WEBP }), { ok: true, contentType: "image/webp", ext: "webp" });
});

test("exactly 5 MB passes; one byte more is 413", () => {
  assert.equal(validateLicenceUpload({ size: LICENCE_MAX_BYTES, type: "image/png", head: PNG }).ok, true);
  const over = validateLicenceUpload({ size: LICENCE_MAX_BYTES + 1, type: "image/png", head: PNG });
  assert.equal(over.ok, false);
  if (!over.ok) {
    assert.equal(over.status, 413);
    assert.match(over.error, /[؀-ۿ]/, "the error is Arabic");
  }
});

test("an empty file is 400", () => {
  const r = validateLicenceUpload({ size: 0, type: "image/png", head: new Uint8Array() });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("a type outside the four is 400 — even with matching-looking bytes", () => {
  for (const type of ["image/gif", "text/plain", "application/octet-stream", "", "image/svg+xml", "image/jpg", "IMAGE/PNG"]) {
    const r = validateLicenceUpload({ size: 1000, type, head: PNG });
    assert.equal(r.ok, false, type);
    if (!r.ok) {
      assert.equal(r.status, 400, type);
      assert.match(r.error, /[؀-ۿ]/, "the error is Arabic");
    }
  }
});

test("a spoofed type is 400: declared png, the bytes are a pdf", () => {
  const r = validateLicenceUpload({ size: 1000, type: "image/png", head: PDF });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 400);
    assert.match(r.error, /[؀-ۿ]/);
  }
});

test("other mismatches are refused too", () => {
  assert.equal(validateLicenceUpload({ size: 1000, type: "application/pdf", head: PNG }).ok, false);
  assert.equal(validateLicenceUpload({ size: 1000, type: "image/jpeg", head: PNG }).ok, false);
  assert.equal(validateLicenceUpload({ size: 1000, type: "image/webp", head: WAV }).ok, false, "RIFF alone is not WEBP");
  assert.equal(validateLicenceUpload({ size: 1000, type: "image/png", head: PNG.slice(0, 4) }).ok, false, "a truncated signature is not a match");
  assert.equal(validateLicenceUpload({ size: 1000, type: "image/webp", head: WEBP.slice(0, 11) }).ok, false, "WEBP needs 12 bytes");
});

test("size is checked before type: an oversized file of the wrong type is still 413", () => {
  const r = validateLicenceUpload({ size: LICENCE_MAX_BYTES * 3, type: "text/plain", head: new Uint8Array(16) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 413);
});

// ── safeLicenceName ─────────────────────────────────────────────────────────

const SAFE = /^[A-Za-z0-9._-]+$/;

test("a plain Latin name keeps its stem; the extension is dropped (the route appends the detected one)", () => {
  assert.equal(safeLicenceName("licence-scan.png"), "licence-scan");
  assert.equal(safeLicenceName("Scan_2026.10.18.PDF"), "Scan_2026.10.18");
});

test("spaces become dashes and every other character outside [A-Za-z0-9._-] is dropped", () => {
  assert.equal(safeLicenceName("my licence (1).jpg"), "my-licence-1");
  const out = safeLicenceName("a/b\\c:d*e?f\"g<h>i|j%00k\u0000.png");
  assert.match(out, SAFE);
});

test("path traversal never survives", () => {
  for (const name of ["../", "../../etc/passwd", "..\\..\\windows\\system32", "..", "....//", "./.hidden", "x/../../y.png"]) {
    const out = safeLicenceName(name);
    assert.match(out, SAFE, name);
    assert.ok(!out.includes(".."), `${name} → ${out}`);
    assert.ok(!out.includes("/") && !out.includes("\\"), `${name} → ${out}`);
    assert.ok(!out.startsWith("."), `${name} → ${out}`);
  }
  assert.equal(safeLicenceName("../../etc/passwd"), "passwd");
});

test("an Arabic-only name falls back to «licence»", () => {
  assert.equal(safeLicenceName("رخصة المحاماة.png"), "licence");
  assert.equal(safeLicenceName("صورة"), "licence");
  assert.equal(safeLicenceName(""), "licence");
  assert.equal(safeLicenceName("---___"), "licence", "no letter or digit left");
});

test("a mixed Arabic/Latin name keeps the Latin part", () => {
  assert.equal(safeLicenceName("رخصة-licence-2026.jpg"), "licence-2026");
});

test("a very long name is capped", () => {
  const out = safeLicenceName(`${"a".repeat(500)}.png`);
  assert.ok(out.length <= 60, `length ${out.length}`);
  assert.ok(out.length > 0);
  assert.match(out, SAFE);
  assert.ok(!/[.-]$/.test(safeLicenceName(`${"a".repeat(59)}-bbbbbb.png`)), "no trailing dash or dot after the cut");
});
