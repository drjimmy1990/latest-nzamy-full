import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatReceiptSerial,
  parseReceiptSerial,
  isReceiptSerial,
  isReceiptMethod,
  receiptMethodLabel,
  RECEIPT_METHODS,
} from "./receiptSerial.ts";

test("the serial reads the way the owner asked for it", () => {
  assert.equal(formatReceiptSerial(2026, 42), "REC-2026-00042");
  assert.equal(formatReceiptSerial(2026, 1), "REC-2026-00001");
});

test("the padding is a minimum width, not a ceiling", () => {
  // The 100,000th receipt must not break the format.
  assert.equal(formatReceiptSerial(2026, 123456), "REC-2026-123456");
  assert.equal(parseReceiptSerial("REC-2026-123456")?.number, 123456);
});

test("format and parse are the same rule read in both directions", () => {
  for (const id of [1, 42, 99999, 100000]) {
    const parsed = parseReceiptSerial(formatReceiptSerial(2026, id));
    assert.equal(parsed?.number, id);
    assert.equal(parsed?.year, 2026);
  }
});

test("a pasted serial survives lowercase and stray space", () => {
  assert.deepEqual(parseReceiptSerial("  rec-2026-00042 "), { year: 2026, number: 42 });
  assert.ok(isReceiptSerial("REC-2026-00042"));
});

test("anything that is not a serial is refused, not guessed at", () => {
  for (const bad of [
    "", "   ", null, undefined, "REC-2026", "REC-26-00042", "ORD-8F14E4",
    "REC-2026-", "REC-2026-ABCDE", "XREC-2026-00042", "REC-2026-00042-X",
  ]) {
    assert.equal(parseReceiptSerial(bad as string), null, `should refuse: ${String(bad)}`);
  }
});

test("a bad id or year produces nothing rather than a malformed serial", () => {
  assert.equal(formatReceiptSerial(NaN, 1), "");
  assert.equal(formatReceiptSerial(2026, -1), "");
  assert.equal(formatReceiptSerial(2026, Infinity), "");
});

test("the payment methods are closed, Arabic, and claim no card payment", () => {
  assert.ok(isReceiptMethod("bank_transfer"));
  assert.ok(!isReceiptMethod("mada"));
  assert.ok(!isReceiptMethod(""));
  assert.ok(!isReceiptMethod(null));
  // No provider is connected, so a card method would describe something that
  // cannot have happened.
  for (const m of RECEIPT_METHODS) {
    assert.ok(!/mada|visa|apple|stc|card/i.test(m.id), `card method leaked: ${m.id}`);
    assert.ok(!/[A-Za-z]/.test(m.label), `label not Arabic: ${m.label}`);
  }
});

test("an unknown method shows itself rather than an empty cell", () => {
  assert.equal(receiptMethodLabel("cash"), "نقداً");
  assert.equal(receiptMethodLabel("legacy_value"), "legacy_value");
  assert.equal(receiptMethodLabel(null), "");
});
