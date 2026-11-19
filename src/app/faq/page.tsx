import { buildFaqPageJsonLd, serializeJsonLd, SITE_URL } from "@/lib/publicSeo/structuredData";
import { licenceLineAr, licenceLineEn } from "@/lib/publicSeo/platformRegistry";
import { loadPlatformRegistry } from "@/lib/publicSeo/platformRegistryServer";
import { faqData, faqWithLicence } from "./faqData";
import FaqView from "./FaqView";

/**
 * /faq — a server page so the licence line (owner file 20 row 4, batch l9) is
 * in the first HTML and in the FAQPage JSON-LD, from the admin settings
 * license_number / license_issuer. While the number is empty the line is
 * hidden whole. The settings are read through Next's cache (5 minutes), so
 * the page stays static between revalidations.
 *
 * Owner 18 Nov, item 4.4: FAQPage JSON-LD from the same 17 pairs the page
 * prints — Arabic, word for word; FaqView keeps every answer in its HTML.
 */
export const revalidate = 300;

export default async function FAQPage() {
  const registry = await loadPlatformRegistry();
  const items = faqWithLicence(faqData, licenceLineAr(registry), licenceLineEn(registry));
  const faqJsonLd = buildFaqPageJsonLd(
    items.map((item) => ({ question: item.questionAr, answer: item.answerAr })),
    `${SITE_URL}/faq`,
  );
  return (
    <>
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} />
      )}
      <FaqView items={items} />
    </>
  );
}
