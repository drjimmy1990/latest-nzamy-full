/**
 * Owner 18 Nov, items 4.4–4.6: the JSON-LD the server prints for /faq
 * (FAQPage), the home page (Organization) and /founder (Product + Offer), and
 * the internal links to /founder. The builders are run for real; the pages
 * that print them are pinned by their source (node --test cannot load .tsx).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/publicSeo/structuredData.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ORGANIZATION_REGISTRY,
  buildFaqPageJsonLd,
  buildFounderOfferJsonLd,
  buildOrganizationJsonLd,
  lastDayBefore,
  sarFromHalalas,
  serializeJsonLd,
} from "./structuredData.ts";
import { faqData } from "../../app/faq/faqData.ts";
import { FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE } from "../founder/landingCopy.ts";
import { FOUNDER_CAMPAIGN_LINK } from "./internalLinks.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* ── /faq ── */

test("/faq: 17 questions, every one with an answer", () => {
  assert.equal(faqData.length, 17);
  for (const item of faqData) {
    assert.ok(item.questionAr.trim() && item.answerAr.trim(), `#${item.id}`);
  }
});

test("/faq: FAQPage carries the 17 Arabic pairs word for word", () => {
  const pairs = faqData.map((i) => ({ question: i.questionAr, answer: i.answerAr }));
  const ld = buildFaqPageJsonLd(pairs, "https://nezamy.sa/faq") as {
    "@type": string;
    mainEntity: Array<{ "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }>;
  };
  assert.equal(ld["@type"], "FAQPage");
  assert.equal(ld.mainEntity.length, 17);
  ld.mainEntity.forEach((q, i) => {
    assert.equal(q["@type"], "Question");
    assert.equal(q.name, faqData[i].questionAr);
    assert.equal(q.acceptedAnswer["@type"], "Answer");
    assert.equal(q.acceptedAnswer.text, faqData[i].answerAr);
  });
  assert.equal(buildFaqPageJsonLd([{ question: "س", answer: " " }], "x"), null, "no empty answers, no empty schema");
});

test("/faq page prints the FAQPage from the items it shows (licence line included); the view keeps every answer in its HTML", () => {
  // Batch l9: the server page reads the licence settings and passes the same
  // items to the JSON-LD and to the client view.
  const page = read("../../app/faq/page.tsx");
  assert.doesNotMatch(page, /^\s*["']use client["']/m);
  assert.match(page, /const items = faqWithLicence\(faqData, licenceLineAr\(registry\), licenceLineEn\(registry\)\);/);
  assert.match(page, /items\.map\(\(item\) => \(\{ question: item\.questionAr, answer: item\.answerAr \}\)\)/);
  assert.match(page, /type="application\/ld\+json" dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(faqJsonLd\) \}\}/);
  assert.match(page, /<FaqView items=\{items\} \/>/);
  assert.doesNotMatch(read("../../app/faq/layout.tsx"), /ld\+json/, "one FAQPage only");
  const view = read("../../app/faq/FaqView.tsx");
  assert.match(view, /^"use client";/);
  assert.match(view, /import \{ categories, faqData, type FAQItem \} from "\.\/faqData";/);
  // The answer is always rendered; closing it only hides it.
  assert.match(view, /hidden=\{openId !== item\.id\}/);
  assert.match(view, /\{isRTL \? item\.answerAr : item\.answerEn\}/);
  assert.doesNotMatch(view, /openId === item\.id && \(/, "no answer mounted only while open");
  assert.doesNotMatch(view, /AnimatePresence/);
});

test("serializeJsonLd: no text can close the <script>", () => {
  const out = serializeJsonLd(buildFaqPageJsonLd([{ question: "</script><b>", answer: "a & b" }], "x"));
  assert.doesNotMatch(out, /<\/script>|<b>|&/);
  assert.deepEqual(JSON.parse(out).mainEntity[0].name, "</script><b>");
});

/* ── Organization ── */

test("Organization: owner Q27 type and identity, contact, address, the verified sameAs", () => {
  const ld = buildOrganizationJsonLd() as Record<string, any>;
  assert.equal(ld["@type"], "Organization");
  assert.equal(ld.name, "نظامي");
  assert.equal(ld.alternateName, "Nezamy");
  assert.equal(ld.url, "https://nezamy.sa");
  assert.match(ld.description, /LegalTech Provider/);
  assert.equal(ld.address.addressCountry, "SA");
  assert.equal(ld.address.postalCode, "24362");
  assert.equal(ld.telephone, "+966560655552");
  assert.deepEqual(ld.sameAs, ["https://x.com/nezamy"]);
  assert.doesNotMatch(JSON.stringify(ld), /للمحاماة|LegalService/);
});

test("Organization: the registry fields are ready but EMPTY until the owner sends them — and then absent", () => {
  assert.deepEqual({ ...ORGANIZATION_REGISTRY }, { legalName: "", commercialRegistration: "", licence: "", licenceIssuer: "" });
  const ld = buildOrganizationJsonLd() as Record<string, unknown>;
  assert.ok(!("identifier" in ld), "no empty identifier");
  assert.ok(!("legalName" in ld), "no empty legalName");
  assert.doesNotMatch(serializeJsonLd(ld), /""/, "no empty string anywhere");
});

test("Organization: once filled, legalName and the two identifiers appear", () => {
  const ld = buildOrganizationJsonLd({
    legalName: "شركة اختبار",
    commercialRegistration: "4031000000",
    licence: "123",
    licenceIssuer: "وزارة العدل",
  }) as Record<string, any>;
  assert.equal(ld.legalName, "شركة اختبار");
  assert.deepEqual(
    ld.identifier.map((i: Record<string, string>) => [i.propertyID, i.value]),
    [["السجل التجاري", "4031000000"], ["ترخيص وزارة العدل", "123"]],
  );
});

test("the home page prints the Organization from the builder (escaped)", () => {
  const home = read("../../app/page.tsx");
  // Batch l9: from the admin settings (platformRegistryServer), not constants.
  assert.match(home, /const registry = await loadPlatformRegistry\(\);/);
  assert.match(home, /const organizationJsonLd = buildOrganizationJsonLd\(registry\);/);
  assert.match(home, /<Hero licence=\{registry\.licence\} licenceIssuer=\{registry\.licenceIssuer\} \/>/);
  assert.match(home, /__html: serializeJsonLd\(organizationJsonLd\)/);
});

/* ── /founder ── */

test("helpers: Latin-digit SAR and the last day of an exclusive end", () => {
  assert.equal(sarFromHalalas(299_600), "2996.00");
  assert.equal(sarFromHalalas(344_540), "3445.40");
  assert.equal(lastDayBefore("2026-12-18T00:00:00+03:00"), "2026-12-17");
  assert.equal(lastDayBefore("2027-01-01T00:00:00+03:00"), "2026-12-31");
  assert.equal(lastDayBefore("nonsense"), null);
});

test("/founder: Product + Offer at 2,996 SAR before VAT, valid to 17 Dec, no availability claim", () => {
  const ld = buildFounderOfferJsonLd({ description: "وصف", endsAtExclusive: FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE }) as Record<string, any>;
  assert.ok(ld, "the founder item is on sale in the catalog");
  assert.equal(ld["@type"], "Product");
  assert.equal(ld.url, "https://nezamy.sa/founder");
  const offer = ld.offers;
  assert.equal(offer["@type"], "Offer");
  assert.equal(offer.price, "2996.00");
  assert.equal(offer.priceCurrency, "SAR");
  assert.equal(offer.priceValidUntil, "2026-12-17");
  assert.equal(offer.priceSpecification.valueAddedTaxIncluded, false);
  assert.equal(offer.priceSpecification.price, "2996.00");
  assert.ok(!("availability" in offer), "the sale can be paused: no InStock claim");
  assert.doesNotMatch(JSON.stringify(ld), /[٠-٩]/, "Latin digits only in the schema");
});

test("/founder prints that Product + Offer on the server", () => {
  const page = read("../../app/founder/page.tsx");
  assert.doesNotMatch(page, /^\s*["']use client["']/m);
  assert.match(page, /buildFounderOfferJsonLd\(\{\s*description: FOUNDER_DESCRIPTION,\s*endsAtExclusive: FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE,\s*\}\)/);
  assert.match(page, /type="application\/ld\+json" dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(FOUNDER_OFFER_JSON_LD\) \}\}/);
});

/* ── internal links to /founder ── */

test("/pricing and /services/lawyers render the /founder link unconditionally", () => {
  assert.equal(FOUNDER_CAMPAIGN_LINK.href, "/founder");
  const link = read("../../components/seo/FounderCampaignLink.tsx");
  assert.doesNotMatch(link, /^\s*["']use client["']/m);
  assert.doesNotMatch(link, /\buse[A-Z]\w*\(/, "no hook: nothing can hide it on the server");
  assert.match(link, /href=\{FOUNDER_CAMPAIGN_LINK\.href\}/);
  for (const file of ["../../app/pricing/page.tsx", "../../app/services/lawyers/page.tsx"]) {
    const src = read(file);
    assert.match(src, /import FounderCampaignLink from "@\/components\/seo\/FounderCampaignLink";/, file);
    // At the top level of the page's JSX — not inside a `cond && (` or a ternary.
    assert.match(src, /\n {8}<FounderCampaignLink \/>\n/, file);
  }
});
