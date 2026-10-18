/**
 * apiErrorText.test.ts — the admin screens show the API's own refusal text
 * (owner answer ٢١٠, Task 3.4), but never a raw English database message.
 *
 * RUN: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/apiErrorText.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorText } from "./apiErrorText.ts";

const FALLBACK = "تعذّر الحفظ";

test("a refusal (400/401/403/404/409/503) shows the API's Arabic error", () => {
  for (const status of [400, 401, 403, 404, 409, 503]) {
    assert.equal(apiErrorText(status, { error: "لا يمكن إزالة آخر مشرف رئيسي" }, FALLBACK), "لا يمكن إزالة آخر مشرف رئيسي", String(status));
  }
});

test("a 500 keeps the authored text: that path can carry a raw Postgres message", () => {
  assert.equal(apiErrorText(500, { error: "هذا الإجراء لقيادة المنصة فقط" }, FALLBACK), FALLBACK);
  assert.equal(apiErrorText(502, { error: "خطأ" }, FALLBACK), FALLBACK);
});

test("an English or empty error falls back (GoTrue and Postgres answer in English)", () => {
  assert.equal(apiErrorText(400, { error: "User already registered" }, FALLBACK), FALLBACK);
  assert.equal(apiErrorText(403, { error: "" }, FALLBACK), FALLBACK);
  assert.equal(apiErrorText(403, { error: "   " }, FALLBACK), FALLBACK);
});

test("a body without a string error falls back", () => {
  for (const body of [null, undefined, "نص", 42, [], {}, { error: 7 }, { error: { message: "خطأ" } }]) {
    assert.equal(apiErrorText(403, body, FALLBACK), FALLBACK, JSON.stringify(body));
  }
});

test("the error is trimmed", () => {
  assert.equal(apiErrorText(403, { error: "  هذا الإجراء لقيادة المنصة فقط \n" }, FALLBACK), "هذا الإجراء لقيادة المنصة فقط");
});
