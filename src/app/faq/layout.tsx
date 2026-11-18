import { buildMetadata } from "@/lib/seo";
import { buildFaqPageJsonLd, serializeJsonLd, SITE_URL } from "@/lib/publicSeo/structuredData";
import { faqData } from "./faqData";

export const metadata = buildMetadata({
  titleAr: "الأسئلة الشائعة",
  titleEn: "FAQ",
  descriptionAr: "إجابات على أكثر الأسئلة شيوعاً عن منصة نظامي وخدماتها القانونية",
  descriptionEn: "Answers to the most common questions about Nezamy platform and its legal services",
  path: "/faq",
  keywords: ["أسئلة شائعة","مساعدة","كيفية"],
});

// Owner 18 Nov, item 4.4: FAQPage JSON-LD from the same 17 pairs the page
// prints (./faqData.ts) — Arabic, word for word; the page keeps every answer
// in its HTML.
const FAQ_JSON_LD = buildFaqPageJsonLd(
  faqData.map((item) => ({ question: item.questionAr, answer: item.answerAr })),
  `${SITE_URL}/faq`,
);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {FAQ_JSON_LD && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(FAQ_JSON_LD) }} />
      )}
      {children}
    </>
  );
}
