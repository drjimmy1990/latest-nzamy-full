/**
 * File 15 row 25 / register 14 item 20 (batch l9): «دليل إنشاء عرض جديد».
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/offers/offerGuide.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OFFER_GUIDE_STEPS_AR, OFFER_GUIDE_TITLE_AR } from "./offerGuide.ts";
import { DEFAULT_RETURN_MINUTES, OFFER_BODY_MAX, OFFER_CTA_LABEL_MAX, OFFER_TITLE_MAX } from "./offerRules.ts";
import { toArabicDigits } from "../services/arabicCount.ts";

const all = OFFER_GUIDE_STEPS_AR.flatMap((s) => [s.title, ...s.lines]).join("\n");

test("the guide covers every field the owner listed", () => {
  for (const word of ["الاسم", "التواريخ", "الفئة", "السعر", "الخصم", "النقاط", "سقف المقاعد", "إصدار الشروط", "النص والزر"]) {
    assert.ok(all.includes(word), word);
  }
});

test("its numbers are the code's limits", () => {
  assert.ok(all.includes(`${toArabicDigits(OFFER_TITLE_MAX)} حرفًا`));
  assert.ok(all.includes(`${toArabicDigits(OFFER_BODY_MAX)} حرف`));
  assert.ok(all.includes(`${toArabicDigits(OFFER_CTA_LABEL_MAX)} حرفًا`));
  assert.ok(all.includes(toArabicDigits(DEFAULT_RETURN_MINUTES)));
});

test("it never promises an offer price, discount or points field that checkout does not apply", () => {
  assert.ok(all.includes("لا يوجد حقل سعر خاص بالعرض"));
  assert.ok(all.includes("كوبون"));
});

test("the admin page shows it and the owner's copy in docs/ says the same", () => {
  const page = readFileSync(new URL("../../app/dashboard/admin/offers/page.tsx", import.meta.url), "utf8");
  assert.match(page, /OFFER_GUIDE_STEPS_AR\.map/);
  const doc = readFileSync(new URL("../../../docs/offers/OFFERS_GUIDE_AR.md", import.meta.url), "utf8");
  assert.ok(doc.includes(OFFER_GUIDE_TITLE_AR));
  for (const s of OFFER_GUIDE_STEPS_AR) for (const l of s.lines) assert.ok(doc.includes(l), l.slice(0, 40));
});
