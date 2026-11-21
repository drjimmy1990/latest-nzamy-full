/**
 * latinDigitsSweep.test.ts — owner file 10 ب24 (batch l12-access): every
 * number field on the site turns Arabic-Indic digits into Latin ones. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/forms/latinDigitsSweep.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { latinReplacementFor, wantsLatinDigits, type DigitFieldLike } from "./latinDigits.ts";

const input = (attrs: Record<string, string>, props: Partial<DigitFieldLike> = {}): DigitFieldLike => ({
  tagName: "INPUT",
  type: attrs.type ?? "text",
  inputMode: attrs.inputmode ?? "",
  getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
  ...props,
});

test("number fields qualify: type number / tel, inputMode numeric / decimal / tel, or the opt-in attribute", () => {
  assert.equal(wantsLatinDigits(input({ type: "number" })), true);
  assert.equal(wantsLatinDigits(input({ type: "tel" })), true);
  assert.equal(wantsLatinDigits(input({ inputmode: "numeric" })), true);
  assert.equal(wantsLatinDigits(input({ inputmode: "decimal" })), true);
  assert.equal(wantsLatinDigits(input({ "data-latin-digits": "true" })), true);
});

test("free text never qualifies — the library search keeps its Arabic digits; an opt-out wins", () => {
  assert.equal(wantsLatinDigits(input({})), false);
  assert.equal(wantsLatinDigits(input({ type: "search" })), false);
  assert.equal(wantsLatinDigits(input({ inputmode: "search" })), false);
  assert.equal(wantsLatinDigits(input({ type: "number", "data-latin-digits": "false" })), false);
  assert.equal(wantsLatinDigits({ tagName: "TEXTAREA", inputMode: "numeric" }), false);
  assert.equal(wantsLatinDigits(null), false);
});

test("the keystroke replacement for a type=number field", () => {
  assert.equal(latinReplacementFor("٣"), "3");
  assert.equal(latinReplacementFor("۴"), "4", "Persian digits too");
  assert.equal(latinReplacementFor("١٢٫٥"), "12.5", "the Arabic decimal mark");
  assert.equal(latinReplacementFor("3"), null, "already Latin: the browser handles it");
  assert.equal(latinReplacementFor(null), null);
});

const SRC = join(import.meta.dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

test("the sweep is mounted once in the root layout and writes through the prototype setter (React sees the change)", () => {
  assert.match(read("app", "layout.tsx"), /<LatinDigitsEverywhere \/>/);
  const comp = read("components", "forms", "LatinDigitsEverywhere.tsx");
  assert.match(comp, /Object\.getOwnPropertyDescriptor\(HTMLInputElement\.prototype, "value"\)/);
  assert.match(comp, /document\.addEventListener\("beforeinput", onBeforeInput, \{ capture: true \}\)/);
  assert.match(comp, /document\.addEventListener\("input", onInput, \{ capture: true \}\)/);
});

test("every number field in the app is reachable by the sweep (marked type number / tel or a numeric inputMode)", () => {
  // A field converts only if its markup says it is a number field; the ones the
  // old audit listed (calculators, admin settings, offers, coupons, secondment, /auth/mfa) all do.
  const files = [
    "components/calculators/CalcLaborRights.tsx",
    "components/calculators/CalcCourtFees.tsx",
    "app/ai/inheritance/InheritanceCalculator.tsx",
    "app/ai/fee-calculator/page.tsx",
    "app/dashboard/admin/subscriptions/coupons/page.tsx",
    "app/dashboard/admin/offers/page.tsx",
    "app/dashboard/firm/secondment/new/page.tsx",
    "app/auth/mfa/page.tsx",
  ];
  for (const f of files) {
    assert.match(read(...f.split("/")), /type="number"|inputMode="(numeric|decimal)"/, f);
  }
  assert.ok(readdirSync(join(SRC, "components", "forms")).includes("LatinDigitsEverywhere.tsx"));
});
