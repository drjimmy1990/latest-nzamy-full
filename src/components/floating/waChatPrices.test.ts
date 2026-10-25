/**
 * waChatPrices.test.ts — the floating WhatsApp chat shows the catalogue's
 * prices, never its own (P7, pricing doc §13ب.1): no digit followed by «ر.س»
 * may appear in StepPayment.tsx or StepConsult.tsx (comments included), and
 * each chat choice maps to the catalogue service the pages price.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";
import { formatClientServicePrice, getClientServiceById } from "../../lib/pricingRepository.ts";
import { VAT_NOTICE } from "../../lib/pricing/vatNotice.ts";
import { consultServiceId, contractServiceId, WA_PRICE_AFTER_REVIEW_AR, WA_VAT_NOTICE_AR, waPrice, waServiceId } from "./waChatPrices.ts";

const HERE = import.meta.dirname;
const STEPS = ["StepPayment.tsx", "StepConsult.tsx"].map((f) => [f, readFileSync(join(HERE, "wa-steps", f), "utf8")] as const);

// a Latin or Arabic-Indic digit, optional separators / spaces, then «ر.س» (or «ريال»)
const PRICE_LITERAL = /[0-9٠-٩][0-9٠-٩٬,.\s]*(ر\.س|ريال)/;

test("no price literal (digits followed by ر.س) is left in StepPayment / StepConsult", () => {
  for (const [name, src] of STEPS) {
    const hits = src.split(/\r?\n/).map((line, i) => [i + 1, line] as const).filter(([, line]) => PRICE_LITERAL.test(line));
    assert.deepEqual(hits, [], `${name}: ${hits.map(([n, l]) => `${n}: ${l.trim()}`).join(" | ")}`);
  }
  // the guard itself catches the old literals
  for (const old of ["٥٠ ر.س", "٧٠٠ ر.س", "١٥٠ ر.س", "٤٩٩ ر.س", "499 ر.س"]) assert.ok(PRICE_LITERAL.test(old), old);
});

test("both steps read the catalogue (useClientPricingCatalog) and show the platform's VAT sentence", () => {
  for (const [name, src] of STEPS) {
    assert.match(src, /useClientPricingCatalog\(\)/, name);
    assert.match(src, /WA_VAT_NOTICE_AR/, name);
  }
  assert.equal(WA_VAT_NOTICE_AR, VAT_NOTICE.exclusive.ar);
});

test("each chat choice maps to the catalogue service the pages price", () => {
  assert.equal(consultServiceId("ai", "text"), "ai-consult");
  assert.equal(consultServiceId("lawyer", "text"), "written-opinion");
  assert.equal(consultServiceId("lawyer", "video"), "video-full");
  assert.equal(consultServiceId("lawyer", "voice"), "video-full");
  assert.equal(consultServiceId("lawyer", "person"), "in-person");
  assert.equal(consultServiceId(undefined, "text"), null);
  assert.equal(contractServiceId("ai-review"), "contract-analyze");
  assert.equal(contractServiceId("lawyer-review"), "contract-review");
  assert.equal(contractServiceId(undefined), null);
  assert.equal(waServiceId({ provider: "lawyer", modality: "video" }), "video-full");
  assert.equal(waServiceId({ contractService: "lawyer-review" }), "contract-review");
  assert.equal(waServiceId({}), null);
});

test("the price line is formatClientServicePrice of the (admin-merged) catalogue entry; payment follows requiresPayment", () => {
  for (const id of ["ai-consult", "written-opinion", "video-full", "in-person", "contract-analyze", "contract-review"]) {
    const entry = getClientServiceById(id, CLIENT_SERVICE_CATALOG);
    if (entry.priceMode === "included") continue; // the next test
    const p = waPrice(CLIENT_SERVICE_CATALOG, id);
    assert.equal(p.text, formatClientServicePrice(entry), id);
    assert.equal(p.requiresPayment, entry.requiresPayment, id);
  }
  // the free daily AI question asks for no payment method
  assert.equal(waPrice(CLIENT_SERVICE_CATALOG, "ai-consult").requiresPayment, false);
  // an admin price change reaches the chat
  const merged = CLIENT_SERVICE_CATALOG.map((s) => (s.serviceId === "video-full" ? { ...s, basePrice: 650 } : s));
  assert.equal(waPrice(merged, "video-full").text, "٦٥٠ ر.س");
  // nothing chosen → «يتم التحديد», no payment step
  assert.deepEqual(waPrice(CLIENT_SERVICE_CATALOG, null), { text: "يتم التحديد", note: null, requiresPayment: false, showsAmount: false });
});

test("finding 6: an «included» service never reads «مشمول في الباقة» to a viewer the chat cannot tell has the plan — the catalogue price, or «يُحدَّد بعد المراجعة»", () => {
  const entry = getClientServiceById("contract-analyze", CLIENT_SERVICE_CATALOG);
  assert.equal(entry.priceMode, "included");
  const guest = waPrice(CLIENT_SERVICE_CATALOG, "contract-analyze");
  assert.equal(guest.text, formatClientServicePrice({ basePrice: entry.basePrice, priceMode: "fixed" }));
  assert.notEqual(guest.text, "مشمول في الباقة");
  assert.equal(guest.showsAmount, true, "the VAT sentence goes with the amount");
  // an admin price change reaches it; no price at all → after review
  const repriced = CLIENT_SERVICE_CATALOG.map((s) => (s.serviceId === "contract-analyze" ? { ...s, basePrice: 99 } : s));
  assert.equal(waPrice(repriced, "contract-analyze").text, "٩٩ ر.س");
  const unpriced = CLIENT_SERVICE_CATALOG.map((s) => (s.serviceId === "contract-analyze" ? { ...s, basePrice: 0 } : s));
  assert.equal(waPrice(unpriced, "contract-analyze").text, WA_PRICE_AFTER_REVIEW_AR);
  assert.equal(WA_PRICE_AFTER_REVIEW_AR, "يُحدَّد بعد المراجعة");
  // any service an admin switches to «included» follows the same rule
  const switched = CLIENT_SERVICE_CATALOG.map((s) => (s.serviceId === "video-full" ? { ...s, priceMode: "included" as const } : s));
  assert.equal(waPrice(switched, "video-full").text, formatClientServicePrice({ basePrice: 500, priceMode: "fixed" }));
  // only a caller that knows the viewer's plan includes it says so
  assert.equal(waPrice(CLIENT_SERVICE_CATALOG, "contract-analyze", { viewerIncluded: true }).text, "مشمول في الباقة");
});

test("finding 6: StepPayment shows the VAT sentence with any amount, not only with a payment step", () => {
  const src = STEPS.find(([n]) => n === "StepPayment.tsx")![1];
  assert.match(src, /requiresPaymentChoice \|\| priced\.showsAmount \? \(/);
});
