import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fingerprintName, formatPrintStamp, printFingerprintLines, watermarkAccountRef } from "./printFingerprint.ts";

const component = readFileSync(new URL("./PrintWatermark.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("q371: the print time is Riyadh's, Gregorian, Latin digits — across midnight", () => {
  // 21:30 UTC is 00:30 the next day in Riyadh (UTC+3, no DST)
  assert.equal(formatPrintStamp(new Date("2026-11-02T21:30:00Z")), "2026-11-03 00:30");
  assert.equal(formatPrintStamp(new Date("2026-01-05T09:07:00Z")), "2026-01-05 12:07");
  assert.equal(formatPrintStamp(new Date("invalid")), "");
});

test("q371: the account ref is the id's first 8 characters", () => {
  assert.equal(watermarkAccountRef("3f2a9c1e-77aa-4b1b-9e0d-1234567890ab"), "3F2A9C1E");
  assert.equal(watermarkAccountRef("abc"), null);
  assert.equal(watermarkAccountRef(undefined), null);
});

test("q371: never an email or a phone number as the name", () => {
  assert.equal(fingerprintName("أ. سارة القحطاني"), "أ. سارة القحطاني");
  assert.equal(fingerprintName("someone@example.com"), null);
  assert.equal(fingerprintName("0501234567"), null);
  assert.equal(fingerprintName("+966 50 123 4567"), null);
  assert.equal(fingerprintName("٠٥٠١٢٣٤٥٦٧"), null);
  assert.equal(fingerprintName("  "), null);
});

test("q371: a subscriber's mark — name, short account id, Riyadh print time", () => {
  const lines = printFingerprintLines(
    { isLoggedIn: true, name: "أ. سارة القحطاني", userId: "3f2a9c1e-77aa-4b1b-9e0d-1234567890ab" },
    formatPrintStamp(new Date("2026-11-02T21:30:00Z")),
  );
  assert.deepEqual(lines, {
    platform: "نظامي - Nezamy",
    subscriber: "المشترك: أ. سارة القحطاني",
    account: "حساب 3F2A9C1E",
    printedAt: "طُبع: 2026-11-03 00:30 (توقيت الرياض)",
  });
  // the email fallback of a profile with no name is never printed
  const noName = printFingerprintLines({ isLoggedIn: true, name: "a@b.co", userId: "3f2a9c1e-77aa" }, "");
  assert.equal(noName.subscriber, "المشترك: عضو نظامي");
  assert.equal(noName.printedAt, null);
});

test("q371 (review M6): full_name first, then the display name, then «عضو نظامي»", () => {
  const id = "3f2a9c1e-77aa-4b1b-9e0d-1234567890ab";
  assert.equal(printFingerprintLines({ isLoggedIn: true, fullName: "سارة بنت محمد القحطاني", name: "سارة", userId: id }, "").subscriber, "المشترك: سارة بنت محمد القحطاني");
  assert.equal(printFingerprintLines({ isLoggedIn: true, fullName: "", name: "سارة", userId: id }, "").subscriber, "المشترك: سارة");
  assert.equal(printFingerprintLines({ isLoggedIn: true, fullName: "s@x.co", name: "s@x.co", userId: id }, "").subscriber, "المشترك: عضو نظامي");
});

test("q371: a guest gets the neutral mark — platform and print time only", () => {
  const lines = printFingerprintLines({ isLoggedIn: false, name: "", userId: undefined }, "2026-11-03 00:30");
  assert.deepEqual(lines, {
    platform: "نظامي - Nezamy",
    subscriber: null,
    account: null,
    printedAt: "طُبع: 2026-11-03 00:30 (توقيت الرياض)",
  });
});

test("source: the time is taken at beforeprint, never at render, and no phone is printed", () => {
  assert.match(component, /addEventListener\("beforeprint"/);
  assert.match(component, /useState\(""\)/);
  assert.doesNotMatch(component, /useState\(\s*(?:new Date|formatPrintStamp)/);
  // code only (the doc comment tells the story of the old fake number)
  const code = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /05\d{8}|phone/i);
});
