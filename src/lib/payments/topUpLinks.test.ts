import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOPUP_HREF, TOPUP_PACKS_ANCHOR } from "./topUpLinks.ts";
import { buyerAllowed, sellableItem } from "./catalog.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("A-57: «شحن النقاط» sits on the balance card and the billing page, and leads to the packs' anchor", () => {
  assert.equal(TOPUP_HREF, "/settings?tab=subscription#topup-packs");
  assert.match(read("../../components/payments/PointsBalanceCard.tsx"), /href=\{TOPUP_HREF\}/);
  assert.match(read("../../app/dashboard/billing/page.tsx"), /href=\{TOPUP_HREF\}/);
  const cards = read("../../components/pricing/PricingCards.tsx");
  assert.equal(cards.match(/id=\{TOPUP_PACKS_ANCHOR\}/g)?.length, 2, "both layouts carry the anchor");
  assert.equal(TOPUP_PACKS_ANCHOR, "topup-packs");
});

test("A-58: the firms' tab adds the lawyers' top-up cards (sold to an office) with an office sign-up link", () => {
  const common = read("../../constants/pricing/pricing.common.ts");
  assert.match(common, /firms: {7}\[\.\.\.\(isAr \? plansFirms\.ar : plansFirms\.en\), \.\.\.firmTopupCards\(isAr\)\]/);
  assert.match(common, /ctaHref: `\/register\/provider\?type=firm&plan=\$\{p\.id\}`/);
  const lawyers = read("../../constants/pricing/pricing.lawyers.ts");
  const ids = [...new Set([...lawyers.matchAll(/id: "(topup-\d+)"/g)].map((m) => m[1]))];
  assert.ok(ids.length >= 5);
  for (const id of ids) {
    const item = sellableItem(id);
    assert.ok(item && buyerAllowed(item, "firm"), `${id} is sold to an office`);
  }
});
