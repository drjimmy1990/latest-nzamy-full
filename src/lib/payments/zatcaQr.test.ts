import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeZatcaQr, halalasToAmount, zatcaQrPayload, zatcaTimestamp } from "./zatcaQr.ts";

const SELLER = "شركة نظامي للتقنية";

test("the founder sample: 2,996 + 449.40 = 3,445.40 decodes back to the five fields", () => {
  const payload = zatcaQrPayload({ sellerName: SELLER, vatNumber: "300000000000003", timestamp: "2026-11-19T09:00:00.123+03:00", totalHalalas: 344540, vatHalalas: 44940 });
  assert.deepEqual(decodeZatcaQr(payload), { 1: SELLER, 2: "300000000000003", 3: "2026-11-19T06:00:00Z", 4: "3445.40", 5: "449.40" });
  assert.equal(Buffer.from(payload, "base64").toString("base64"), payload, "standard base64");
});

test("the length byte is the UTF-8 byte count (an Arabic name is not its JS length)", () => {
  const bytes = Buffer.from(zatcaQrPayload({ sellerName: SELLER, vatNumber: "300000000000003", timestamp: "2026-11-19T06:00:00Z", totalHalalas: 100, vatHalalas: 13 }), "base64");
  assert.equal(bytes[0], 1);
  assert.equal(bytes[1], Buffer.byteLength(SELLER, "utf8"));
  assert.notEqual(bytes[1], SELLER.length);
});

test("amounts: Latin digits, two decimals, no grouping", () => {
  assert.equal(halalasToAmount(344540), "3445.40");
  assert.equal(halalasToAmount(5), "0.05");
  assert.equal(halalasToAmount(1000000), "10000.00");
  assert.throws(() => halalasToAmount(-1));
  assert.throws(() => halalasToAmount(1.5));
});

test("timestamp is ISO 8601 UTC without milliseconds; bad input throws", () => {
  assert.equal(zatcaTimestamp("2026-11-19T06:00:00.999Z"), "2026-11-19T06:00:00Z");
  assert.throws(() => zatcaTimestamp("not a date"));
});

test("an empty field or one over 255 bytes is refused", () => {
  const base = { sellerName: SELLER, vatNumber: "300000000000003", timestamp: "2026-11-19T06:00:00Z", totalHalalas: 100, vatHalalas: 13 };
  assert.throws(() => zatcaQrPayload({ ...base, sellerName: "  " }));
  assert.throws(() => zatcaQrPayload({ ...base, sellerName: "ش".repeat(128) }), /1–255 bytes/);
  assert.doesNotThrow(() => zatcaQrPayload({ ...base, sellerName: "ش".repeat(127) }));
});
