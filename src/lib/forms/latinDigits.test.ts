// Latin digits while typing (owner, 18 Nov). SYNTHETIC values only.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/forms/latinDigits.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attachLatinDigitsCapture,
  hasNonLatinDigits,
  latinAmountInput,
  latinDigitsOnly,
  latinizeInputInPlace,
  latinLicenceInput,
  latinSignedIntegerInput,
  MOYASAR_DIGIT_FIELDS,
  toLatinDigits,
  type DigitInput,
} from "./latinDigits.ts";

test("toLatinDigits: Arabic-Indic and Persian digits, nothing else touched", () => {
  assert.equal(toLatinDigits("٠١٢٣٤٥٦٧٨٩"), "0123456789");
  assert.equal(toLatinDigits("۰۱۲۳۴۵۶۷۸۹"), "0123456789");
  assert.equal(toLatinDigits("رقم ١٢/٣٤ abc"), "رقم 12/34 abc");
  assert.equal(hasNonLatinDigits("1234"), false);
  assert.equal(hasNonLatinDigits("12٣4"), true);
});

test("latinDigitsOnly: codes and counts", () => {
  assert.equal(latinDigitsOnly("١٢٣ ٤٥٦"), "123456");
  assert.equal(latinDigitsOnly("١٢٣٤٥٦٧٨٩", 6), "123456");
  assert.equal(latinDigitsOnly("abc"), "");
});

test("latinLicenceInput keeps the registry separators", () => {
  assert.equal(latinLicenceInput("٤٢/٤٢٤٢"), "42/4242");
  assert.equal(latinLicenceInput("  ١٢-٣٤٥٦"), "12-3456");
});

test("latinAmountInput: Arabic decimal mark, thousands marks, one point, two places, never an invented 0", () => {
  assert.equal(latinAmountInput("٢٥٬٠٠٠"), "25000");
  assert.equal(latinAmountInput("1,250.5"), "1250.5");
  assert.equal(latinAmountInput("١٢٫٥"), "12.5");
  assert.equal(latinAmountInput("12."), "12.", "a partial entry survives while typing");
  assert.equal(latinAmountInput("1.2.3"), "1.23");
  assert.equal(latinAmountInput("9.999"), "9.99");
  assert.equal(latinAmountInput("٣٠٠ ر.س"), "300.");
  assert.equal(latinAmountInput("-50"), "50", "an amount field has no sign");
  assert.equal(latinAmountInput(""), "");
  assert.equal(latinAmountInput("12.5", 0), "125", "decimals=0 drops the point");
});

test("latinSignedIntegerInput keeps one leading sign", () => {
  assert.equal(latinSignedIntegerInput("-١٠"), "-10");
  assert.equal(latinSignedIntegerInput("+٥"), "+5");
  assert.equal(latinSignedIntegerInput("−٧"), "-7");
  assert.equal(latinSignedIntegerInput("1-2"), "12");
});

function fakeInput(value: string, name = "mysr-cc-number", caret: number | null = value.length): DigitInput & { writes: number; sel: [number, number] | null } {
  let v = value;
  const el = {
    name,
    selectionStart: caret,
    selectionEnd: caret,
    writes: 0,
    sel: null as [number, number] | null,
    get value() { return v; },
    set value(n: string) { v = n; el.writes += 1; },
    setSelectionRange(s: number, e: number) { el.sel = [s, e]; },
  };
  return el;
}

test("latinizeInputInPlace: rewrites once, keeps the caret, no write when already Latin", () => {
  const a = fakeInput("4242 ٤٢", "mysr-cc-number", 3);
  assert.equal(latinizeInputInPlace(a), true);
  assert.equal(a.value, "4242 42");
  assert.equal(a.writes, 1);
  assert.deepEqual(a.sel, [3, 3]);
  const b = fakeInput("4242");
  assert.equal(latinizeInputInPlace(b), false);
  assert.equal(b.writes, 0, "Latin input is never touched (no loop with the mask's own input event)");
});

test("attachLatinDigitsCapture: capture phase, card fields only, and it detaches", () => {
  const calls: Array<{ type: string; capture: boolean }> = [];
  let handler: ((e: { target: unknown }) => void) | null = null;
  const root = {
    addEventListener(type: "input", fn: (e: { target: unknown }) => void, opts: { capture: true }) {
      calls.push({ type, capture: opts.capture });
      handler = fn;
    },
    removeEventListener(_type: "input", fn: (e: { target: unknown }) => void) {
      if (fn === handler) handler = null;
    },
  };
  const detach = attachLatinDigitsCapture(root);
  assert.deepEqual(calls, [{ type: "input", capture: true }]);
  const card = fakeInput("٤١١١", "mysr-cc-number");
  const exp = fakeInput("١٢ / ٢٩", "mysr-cc-exp");
  const csc = fakeInput("١٢٣", "mysr-cc-csc");
  const holder = fakeInput("محمد ١", "mysr-cc-name");
  for (const t of [card, exp, csc, holder]) handler!({ target: t });
  assert.equal(card.value, "4111");
  assert.equal(exp.value, "12 / 29");
  assert.equal(csc.value, "123");
  assert.equal(holder.value, "محمد ١", "the name field is not a number field");
  handler!({ target: null });
  detach();
  assert.equal(handler, null);
  assert.deepEqual([...MOYASAR_DIGIT_FIELDS], ["mysr-cc-number", "mysr-cc-exp", "mysr-cc-csc"]);
});

test("the Moyasar form still names its card fields as the listener expects (moyasar-payment-form bundle)", () => {
  const bundle = join(import.meta.dirname, "../../../node_modules/moyasar-payment-form/dist/moyasar.mjs");
  let src = "";
  try {
    src = readFileSync(bundle, "utf8");
  } catch {
    return; // no node_modules in this checkout: nothing to compare
  }
  for (const name of MOYASAR_DIGIT_FIELDS) assert.ok(src.includes(`name: "${name}"`), name);
});

test("the checkout attaches the card listener and the money fields use the shared normaliser", () => {
  const root = join(import.meta.dirname, "../../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  assert.ok(read("src/components/payments/MoyasarCheckout.tsx").includes("attachLatinDigitsCapture(el)"));
  assert.ok(read("src/app/register/provider/components/Steps.tsx").includes("latinLicenceInput(e.target.value)"));
  const finance = read("src/app/dashboard/lawyer/finance/page.tsx");
  assert.ok(finance.includes("setNewInvFee(latinAmountInput(e.target.value))"));
  assert.ok(finance.includes("setCollectAmount(latinAmountInput(e.target.value))"));
});
