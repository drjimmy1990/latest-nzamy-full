/**
 * l14ServicePrices.test.ts — batch l14 (owner 23 Nov 2026, 01 §حادي عشر):
 *   #7 the lawyer services follow the approved pricing doc of 25 Oct (§7ب):
 *      lawsuit 600, appeal 1,800, cassation 2,500, enforcement 950, case
 *      study 1,500 — in the code catalogue AND in 20261204_20 (the DB row wins
 *      on /api/client-pricing);
 *   #8 the individuals' AI cards are priced in points, not riyals, and say
 *      «قيد التفعيل» where no engine runs for them.
 * Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/pricing/l14ServicePrices.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLIENT_SERVICE_CATALOG } from "../../constants/clientServiceCatalog.ts";
import { formatClientServicePrice } from "../pricingRepository.ts";

const byId = (id: string) => {
  const s = CLIENT_SERVICE_CATALOG.find((x) => x.serviceId === id && !x.variantOf);
  assert.ok(s, id);
  return s!;
};
const sql = readFileSync(new URL("../../../supabase/migrations/20261204_20_l14_pricing.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const LAWYER_SERVICES: Array<[string, number, number]> = [
  ["case-study", 1600, 1500],
  ["file-lawsuit", 1600, 600],
  ["appeal", 2000, 1800],
  ["cassation", 3000, 2500],
  ["enforce-judgment", 1200, 950],
];

test("#7: the lawyer services carry the approved doc's prices, «يبدأ من», and no «2x …» note", () => {
  for (const [id, , price] of LAWYER_SERVICES) {
    const s = byId(id);
    assert.equal(s.basePrice, price, id);
    assert.equal(s.priceMode, "starting_from", id);
    assert.doesNotMatch(s.priceNote ?? "", /2x/, id);
  }
  assert.equal(formatClientServicePrice(byId("file-lawsuit")), "يبدأ من ٦٠٠ ر.س");
});

test("#7: 20261204_20 writes the same prices, only over the value it replaces", () => {
  for (const [id, old, price] of LAWYER_SERVICES) {
    assert.match(sql, new RegExp(`\\('${id}',\\s+${old}(?:::numeric)?,\\s+${price}(?:::numeric)?,`), id);
  }
  assert.match(sql, /and c\.base_price = v\.old_price\s*\n\s*and coalesce\(c\.metadata ->> 'owner_l14', ''\) = ''/);
});

test("#8: the individuals' AI cards are in points — no riyal price, no plan inclusion, honest «قيد التفعيل»", () => {
  for (const id of ["ai-consult", "contract-analyze", "ai-case-eval"]) {
    const s = byId(id);
    assert.equal(s.priceMode, "points", id);
    assert.equal(s.basePrice, 0, id);
    assert.equal(s.includedByPlan, undefined, id);
    assert.doesNotMatch(s.priceNote ?? "", /ر\.س|ريال/, id);
    assert.match(sql, new RegExp(`\\('${id}',\\s+\\d+(?:::numeric)?,\\s+'${(s.priceNote ?? "").replace(/[()]/g, "\\$&")}'\\)`), `${id}: the migration writes the code's note`);
  }
  assert.match(byId("contract-analyze").priceNote!, /٢٥٠ نقطة \(قيد التفعيل\)/);
  assert.match(byId("ai-case-eval").priceNote!, /٧٥ نقطة \(قيد التفعيل\)/);
  // owner ٣٠ / ١٨١ ended the daily free question; the count and tool of the free ones are settings, so the card names neither
  assert.match(byId("ai-consult").priceNote!, /^بالنقاط، ويظهر سعر السؤال قبل إرساله \(قيد التفعيل\)$/);
  assert.doesNotMatch(byId("ai-consult").priceNote!, /يوميا|مجان/);
  // ai-letter stays a free template (no model runs there)
  assert.equal(byId("ai-letter").priceMode, "free");
});
