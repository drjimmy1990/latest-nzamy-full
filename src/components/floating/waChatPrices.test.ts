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
import { consultServiceId, contractServiceId, WA_VAT_NOTICE_AR, waPrice, waServiceId } from "./waChatPrices.ts";

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
  assert.deepEqual(waPrice(CLIENT_SERVICE_CATALOG, null), { text: "يتم التحديد", note: null, requiresPayment: false });
});
